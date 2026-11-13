import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Link2 } from 'lucide-react';
import type { SpreadSide } from '../../types/explain';
import { getDoc, getPdf, savePdf } from '../../services/explainDb';
import {
  HEARTBEAT_TIMEOUT_MS,
  parsePopoutHash,
  popoutChannelName,
} from '../../services/explainPopout';
import type { MainToPopout, PopoutPatch, PopoutState, PopoutToMain } from '../../services/explainPopout';
import { PdfViewer } from './PdfViewer';

/** PDFだけを表示する別ウィンドウ。操作は元のウィンドウに送り、保存は元のウィンドウが行う */
export const PdfPopout: React.FC = () => {
  const parsed = useMemo(() => parsePopoutHash(window.location.hash), []);
  const [state, setState] = useState<PopoutState | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [connected, setConnected] = useState(true);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const lastBeatRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 最初の表示用に、この端末に保存されている内容を読む(元のウィンドウからの最新状態が来たら置き換わる)
  useEffect(() => {
    if (!parsed) return;
    let cancelled = false;
    (async () => {
      const d = await getDoc(parsed.docId);
      if (cancelled || !d) return;
      setState((prev) =>
        prev ?? {
          docId: d.id,
          title: d.title,
          pdfKey: d.pdfKey,
          pdfFileName: d.pdfFileName,
          page: d.pdfPage,
          zoom: d.pdfZoom,
          spreadSide: d.spreadSide,
          spreadRatio: d.spreadRatio,
        }
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [parsed]);

  // 元のウィンドウとの接続
  useEffect(() => {
    if (!parsed) return;
    const ch = new BroadcastChannel(popoutChannelName(parsed.sid));
    channelRef.current = ch;
    lastBeatRef.current = Date.now();
    ch.onmessage = (e: MessageEvent<MainToPopout>) => {
      lastBeatRef.current = Date.now();
      setConnected(true);
      if (e.data.type === 'state') setState(e.data.state);
    };
    const hello: PopoutToMain = { type: 'ready' };
    ch.postMessage(hello);
    const timer = window.setInterval(() => {
      setConnected(Date.now() - lastBeatRef.current < HEARTBEAT_TIMEOUT_MS);
    }, 1500);
    return () => {
      window.clearInterval(timer);
      ch.close();
      channelRef.current = null;
    };
  }, [parsed]);

  // PDF本体を読む
  const pdfKey = state?.pdfKey ?? null;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = pdfKey ? await getPdf(pdfKey) : undefined;
      if (!cancelled) setBlob(stored?.blob ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [pdfKey]);

  useEffect(() => {
    if (state) document.title = `PDF - ${state.title || '無題'}`;
  }, [state]);

  // 元のウィンドウで別の解説に切り替えられたら、その解説に対する操作として送る
  const currentDocId = state?.docId ?? parsed?.docId;
  const send = useCallback(
    (patch: PopoutPatch) => {
      if (!currentDocId || !channelRef.current) return;
      const msg: PopoutToMain = { type: 'patch', docId: currentDocId, patch };
      channelRef.current.postMessage(msg);
    },
    [currentDocId]
  );

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const stored = await savePdf(file);
      setBlob(stored.blob);
      setState((s) => (s ? { ...s, pdfKey: stored.key, pdfFileName: stored.fileName, page: 1 } : s));
      send({ pdfKey: stored.key, pdfFileName: stored.fileName, pdfFileSize: stored.fileSize, pdfPage: 1 });
    } catch (err) {
      console.error('Failed to store PDF', err);
      window.alert('PDFをこの端末に保存できませんでした。');
    }
  };

  if (!parsed) {
    return <div className="p-6 text-sm text-rose-400">このアドレスは正しくありません。元のウィンドウから開き直してください。</div>;
  }
  if (!state) {
    return <div className="p-6 text-sm text-slate-400">読み込み中…(解説が見つからない場合は、元のウィンドウから開き直してください)</div>;
  }

  const update = (p: Partial<PopoutState>, patch: PopoutPatch) => {
    setState((s) => (s ? { ...s, ...p } : s));
    send(patch);
  };

  return (
    <div className="flex flex-col bg-slate-900 text-slate-100" style={{ height: '100dvh' }}>
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-800 text-xs">
        <span className="font-semibold truncate">{state.title || '無題'}</span>
        <span className="ml-auto flex items-center gap-1 shrink-0">
          {connected ? (
            <span className="flex items-center gap-1 text-emerald-400">
              <Link2 className="w-3.5 h-3.5" />
              元のウィンドウと連動中
            </span>
          ) : (
            <span className="flex items-center gap-1 text-amber-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              連動が切れています
            </span>
          )}
        </span>
      </div>
      {!connected && (
        <div className="px-3 py-2 text-xs bg-amber-900/40 text-amber-100 border-b border-amber-800/60">
          元のウィンドウが閉じられたか、再読み込みされました。このウィンドウでの操作は、保存されません。
          このウィンドウを閉じて、元のウィンドウの「PDFを別ウィンドウで開く」を押し直してください。
        </div>
      )}
      <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={handleFileChosen} />
      <div className="flex-1 min-h-0">
        <PdfViewer
          key={`${state.docId}:${state.pdfKey ?? ''}:${blob ? 'blob' : 'none'}`}
          blob={blob}
          missingFileName={state.pdfKey && !blob ? state.pdfFileName : null}
          page={state.page}
          zoom={state.zoom}
          spreadSide={state.spreadSide}
          spreadRatio={state.spreadRatio}
          onPageChange={(p) => update({ page: p }, { pdfPage: p })}
          onZoomChange={(z) => update({ zoom: z }, { pdfZoom: z })}
          onSpreadSideChange={(s: SpreadSide) => update({ spreadSide: s }, { spreadSide: s })}
          onSpreadRatioChange={(r) => update({ spreadRatio: r }, { spreadRatio: r })}
          onPickFile={() => fileInputRef.current?.click()}
          onCrop={(image) => {
            const msg: PopoutToMain = { type: 'crop', image };
            channelRef.current?.postMessage(msg);
          }}
        />
      </div>
    </div>
  );
};

export default PdfPopout;
