import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import { FilePlus2, FileUp, Trash2, CheckCircle2, Loader2, AlertTriangle, Printer } from 'lucide-react';
import type { LocalExplainDoc, PrintLayout, SpreadSide } from '../../types/explain';
import { normalizeLayout } from '../../services/explainLayout';
import {
  createEmptyDoc,
  deleteDocAndOrphanPdf,
  getPdf,
  listDocs,
  saveDoc,
  savePdf,
} from '../../services/explainDb';
import { PdfViewer } from './PdfViewer';
import { DocEditor } from './DocEditor';
import { PrintPreview } from './PrintPreview';

type SaveState = 'saved' | 'unsaved' | 'saving' | 'error';

const SAVE_DEBOUNCE_MS = 1500;
const MIN_SPLIT = 0.25;
const MAX_SPLIT = 0.75;

export const ExplainView: React.FC = () => {
  const [docs, setDocs] = useState<LocalExplainDoc[]>([]);
  const [current, setCurrent] = useState<LocalExplainDoc | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [ratio, setRatio] = useState(0.5);
  const [narrow, setNarrow] = useState(false);
  const [tab, setTab] = useState<'pdf' | 'editor'>('editor');
  const [previewOpen, setPreviewOpen] = useState(false);
  const closePreview = useCallback(() => setPreviewOpen(false), []);

  const docRef = useRef<LocalExplainDoc | null>(null);
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // ---- 保存 ----
  const flush = useCallback(async () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const doc = docRef.current;
    if (!doc || !dirtyRef.current) return;
    dirtyRef.current = false;
    setSaveState('saving');
    try {
      await saveDoc(doc);
      setDocs((prev) => {
        const rest = prev.filter((d) => d.id !== doc.id);
        return [doc, ...rest].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      });
      setSaveState(dirtyRef.current ? 'unsaved' : 'saved');
    } catch (e) {
      console.error('Failed to save explain doc', e);
      dirtyRef.current = true;
      setSaveState('error');
    }
  }, []);

  const patchDoc = useCallback(
    (patch: Partial<LocalExplainDoc>) => {
      const prev = docRef.current;
      if (!prev) return;
      const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
      docRef.current = next;
      dirtyRef.current = true;
      setCurrent(next);
      setSaveState('unsaved');
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    },
    [flush]
  );

  // ---- 文書を開く ----
  const openDoc = useCallback(
    async (doc: LocalExplainDoc | null) => {
      await flush();
      docRef.current = doc;
      dirtyRef.current = false;
      setCurrent(doc);
      setSaveState('saved');
      setPdfBlob(null);
      if (doc) {
        setRatio(doc.splitRatio);
        if (doc.pdfKey) {
          const stored = await getPdf(doc.pdfKey);
          // 読み込み中に別の文書へ切り替わっていたら捨てる
          if (docRef.current?.id === doc.id) setPdfBlob(stored?.blob ?? null);
        }
      }
    },
    [flush]
  );

  // 初期読み込み
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listDocs();
        if (cancelled) return;
        setDocs(list);
        if (list.length > 0) await openDoc(list[0]);
      } catch (e) {
        console.error('Failed to load explain docs', e);
        setSaveState('error');
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // タブを離れる/閉じる/画面を離れるときに保存
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    const onUnload = () => void flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onUnload);
      void flush();
    };
  }, [flush]);

  // 狭い画面ではPDFとエディターをタブ切替
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // ---- 操作 ----
  const handleNewDoc = async (title?: string): Promise<LocalExplainDoc> => {
    await flush();
    const doc = createEmptyDoc(title);
    await saveDoc(doc);
    setDocs((prev) => [doc, ...prev]);
    await openDoc(doc);
    return doc;
  };

  const handleDelete = async () => {
    const doc = docRef.current;
    if (!doc) return;
    const ok = window.confirm(
      `「${doc.title}」を削除しますか?\nこの端末の解説本文と、保存したPDFが消えます。元に戻せません。`
    );
    if (!ok) return;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    dirtyRef.current = false;
    await deleteDocAndOrphanPdf(doc.id);
    const rest = docs.filter((d) => d.id !== doc.id);
    setDocs(rest);
    await openDoc(rest[0] ?? null);
  };

  const handlePickFile = () => fileInputRef.current?.click();

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      window.alert('PDFファイルを選んでください。');
      return;
    }
    try {
      const stored = await savePdf(file);
      if (!docRef.current) {
        await handleNewDoc(file.name.replace(/\.pdf$/i, ''));
      }
      const sameFile = docRef.current?.pdfKey === stored.key;
      patchDoc({
        pdfKey: stored.key,
        pdfFileName: stored.fileName,
        pdfFileSize: stored.fileSize,
        ...(sameFile ? {} : { pdfPage: 1 }),
      });
      setPdfBlob(stored.blob);
    } catch (err) {
      console.error('Failed to store PDF', err);
      window.alert('PDFをこの端末に保存できませんでした(保存容量を確認してください)。');
    }
  };

  const handleEditorChange = useCallback(
    (content: JSONContent) => patchDoc({ content }),
    [patchDoc]
  );

  // ---- 左右の境界ドラッグ ----
  const onSplitPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onSplitPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || !splitContainerRef.current) return;
    const rect = splitContainerRef.current.getBoundingClientRect();
    const r = (e.clientX - rect.left) / rect.width;
    setRatio(Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, r)));
  };
  const onSplitPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    patchDoc({ splitRatio: ratio });
  };

  // ---- 表示 ----
  const statusBadge = (() => {
    switch (saveState) {
      case 'saved':
        return (
          <span className="flex items-center gap-1 text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            この端末に保存済み
          </span>
        );
      case 'saving':
        return (
          <span className="flex items-center gap-1 text-slate-300">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            保存中…
          </span>
        );
      case 'unsaved':
        return <span className="text-amber-400">未保存(自動で保存します)</span>;
      case 'error':
        return (
          <span className="flex items-center gap-1 text-rose-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            保存に失敗しました
          </span>
        );
    }
  })();

  const topBtn =
    'flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer disabled:opacity-40';

  const missingPdfName = current?.pdfKey && !pdfBlob ? current.pdfFileName : null;

  const pdfPane = current ? (
    <PdfViewer
      key={`${current.id}:${current.pdfKey ?? ''}:${pdfBlob ? 'blob' : 'none'}`}
      blob={pdfBlob}
      missingFileName={missingPdfName}
      page={current.pdfPage}
      zoom={current.pdfZoom}
      spreadSide={current.spreadSide}
      spreadRatio={current.spreadRatio}
      onPageChange={(p) => patchDoc({ pdfPage: p })}
      onZoomChange={(z) => patchDoc({ pdfZoom: z })}
      onSpreadSideChange={(s: SpreadSide) => patchDoc({ spreadSide: s })}
      onSpreadRatioChange={(r) => patchDoc({ spreadRatio: r })}
      onPickFile={handlePickFile}
    />
  ) : null;

  const layout = normalizeLayout(current?.layout);

  const editorPane = current ? (
    <DocEditor key={current.id} initialContent={current.content} layout={layout} onChange={handleEditorChange} />
  ) : null;

  return (
    <div className="flex flex-col w-full" style={{ height: 'calc(100dvh - 5.5rem)' }}>
      <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={handleFileChosen} />

      {previewOpen && current && (
        <PrintPreview
          doc={current}
          layout={layout}
          onLayoutChange={(l: PrintLayout) => patchDoc({ layout: l })}
          onClose={closePreview}
        />
      )}

      {/* 上部バー */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-800 bg-slate-900">
        <select
          value={current?.id ?? ''}
          onChange={(e) => {
            const next = docs.find((d) => d.id === e.target.value) ?? null;
            void openDoc(next);
          }}
          disabled={docs.length === 0}
          className="max-w-[200px] bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-md px-2 py-1.5"
          aria-label="解説を選ぶ"
        >
          {docs.length === 0 && <option value="">(解説なし)</option>}
          {docs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title || '(無題)'}
            </option>
          ))}
        </select>

        <button className={topBtn} onClick={() => void handleNewDoc()}>
          <FilePlus2 className="w-3.5 h-3.5" />
          新規
        </button>

        {current && (
          <input
            value={current.title}
            onChange={(e) => patchDoc({ title: e.target.value })}
            placeholder="タイトル(例: 令和7年度 千葉県 本検査 英語)"
            className="flex-1 min-w-[160px] bg-slate-800 border border-slate-700 text-slate-100 text-xs rounded-md px-2 py-1.5"
            aria-label="解説のタイトル"
          />
        )}

        <button className={topBtn} onClick={handlePickFile}>
          <FileUp className="w-3.5 h-3.5" />
          PDFを開く
        </button>
        {current && (
          <button className={`${topBtn} !bg-emerald-700 hover:!bg-emerald-600 !border-emerald-600`} onClick={() => setPreviewOpen(true)}>
            <Printer className="w-3.5 h-3.5" />
            印刷プレビュー
          </button>
        )}
        {current && (
          <button className={`${topBtn} hover:!bg-rose-900/60`} onClick={() => void handleDelete()}>
            <Trash2 className="w-3.5 h-3.5" />
            削除
          </button>
        )}
        <div className="ml-auto text-[11px]">{statusBadge}</div>
      </div>

      {/* 本体 */}
      {!loaded ? (
        <div className="flex-1 flex items-center justify-center text-sm text-slate-400">読み込み中…</div>
      ) : !current ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center text-sm text-slate-400 px-4">
          <p>解説がまだありません。</p>
          <div className="flex gap-2">
            <button
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
              onClick={() => void handleNewDoc()}
            >
              新しい解説を作る
            </button>
            <button
              className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-xs font-semibold cursor-pointer"
              onClick={handlePickFile}
            >
              PDFを選んで始める
            </button>
          </div>
          <p className="text-[11px] text-slate-500">解説とPDFは、この端末の中だけに保存されます(GitHubには送られません)。</p>
        </div>
      ) : narrow ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex border-b border-slate-800 bg-slate-900 text-xs">
            {(['pdf', 'editor'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 cursor-pointer ${tab === t ? 'text-emerald-400 border-b-2 border-emerald-500' : 'text-slate-400'}`}
              >
                {t === 'pdf' ? 'PDF' : '解説'}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0">{tab === 'pdf' ? pdfPane : editorPane}</div>
        </div>
      ) : (
        <div ref={splitContainerRef} className="flex-1 min-h-0 flex">
          <div style={{ width: `${ratio * 100}%` }} className="min-w-0 h-full">
            {pdfPane}
          </div>
          <div
            role="separator"
            aria-orientation="vertical"
            title="ドラッグで幅を変更"
            onPointerDown={onSplitPointerDown}
            onPointerMove={onSplitPointerMove}
            onPointerUp={onSplitPointerUp}
            className="w-1.5 shrink-0 cursor-col-resize bg-slate-700 hover:bg-emerald-600 transition-colors touch-none"
          />
          <div className="flex-1 min-w-0 h-full">{editorPane}</div>
        </div>
      )}
    </div>
  );
};

export default ExplainView;
