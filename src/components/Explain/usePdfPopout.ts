import { useCallback, useEffect, useRef, useState } from 'react';
import type { LocalExplainDoc } from '../../types/explain';
import {
  HEARTBEAT_INTERVAL_MS,
  popoutChannelName,
  popoutUrl,
} from '../../services/explainPopout';
import type { MainToPopout, PopoutPatch, PopoutState, PopoutToMain } from '../../services/explainPopout';
import { setCrop } from '../../services/cropStore';

const toState = (d: LocalExplainDoc): PopoutState => ({
  docId: d.id,
  title: d.title,
  pdfKey: d.pdfKey,
  pdfFileName: d.pdfFileName,
  page: d.pdfPage,
  zoom: d.pdfZoom,
  spreadSide: d.spreadSide,
  spreadRatio: d.spreadRatio,
});

/**
 * 元のウィンドウ側: PDFの別ウィンドウを開き、表示状態を送り続け、別ウィンドウからの操作を受け取る。
 * 別ウィンドウは、閉じられたら自動で検出して「この画面に戻す」状態に戻る。
 */
export function usePdfPopout(
  current: LocalExplainDoc | null,
  onPatch: (docId: string, patch: PopoutPatch) => void
) {
  const [open, setOpen] = useState(false);
  const winRef = useRef<Window | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const currentRef = useRef(current);
  const onPatchRef = useRef(onPatch);

  useEffect(() => {
    currentRef.current = current;
    onPatchRef.current = onPatch;
  });

  const post = useCallback((msg: MainToPopout) => {
    channelRef.current?.postMessage(msg);
  }, []);

  const sendState = useCallback(() => {
    const d = currentRef.current;
    if (d) post({ type: 'state', state: toState(d) });
  }, [post]);

  const close = useCallback(() => {
    try {
      winRef.current?.close();
    } catch {
      /* 閉じられなくても続行 */
    }
    winRef.current = null;
    channelRef.current?.close();
    channelRef.current = null;
    setOpen(false);
  }, []);

  /** 開けたら true。ポップアップがブロックされたら false */
  const openWindow = useCallback((): boolean => {
    const d = currentRef.current;
    if (!d) return false;
    if (winRef.current && !winRef.current.closed) {
      winRef.current.focus();
      return true;
    }
    const sid = crypto.randomUUID();
    const w = window.open(popoutUrl(sid, d.id), `explain-pdf-${sid}`, 'popup=yes,width=900,height=1000');
    if (!w) return false;
    winRef.current = w;
    const ch = new BroadcastChannel(popoutChannelName(sid));
    channelRef.current = ch;
    ch.onmessage = (e: MessageEvent<PopoutToMain>) => {
      if (e.data.type === 'ready') sendState();
      else if (e.data.type === 'patch') onPatchRef.current(e.data.docId, e.data.patch);
      else if (e.data.type === 'crop') setCrop(e.data.image); // 別ウィンドウで切り抜いた画像を、こちらの置き場へ
    };
    setOpen(true);
    return true;
  }, [sendState]);

  const focusWindow = useCallback(() => {
    if (winRef.current && !winRef.current.closed) winRef.current.focus();
  }, []);

  // 表示状態が変わったら別ウィンドウへ送る
  const d = current;
  useEffect(() => {
    if (open) sendState();
  }, [open, sendState, d?.id, d?.title, d?.pdfKey, d?.pdfPage, d?.pdfZoom, d?.spreadSide, d?.spreadRatio]);

  // 心拍(別ウィンドウが「連動中」と表示するため)と、別ウィンドウが閉じられたことの検出
  useEffect(() => {
    if (!open) return;
    const beat = window.setInterval(() => post({ type: 'heartbeat' }), HEARTBEAT_INTERVAL_MS);
    const watch = window.setInterval(() => {
      if (!winRef.current || winRef.current.closed) close();
    }, 1000);
    return () => {
      window.clearInterval(beat);
      window.clearInterval(watch);
    };
  }, [open, post, close]);

  // 画面を離れたら、別ウィンドウも閉じる
  useEffect(() => close, [close]);

  return { open, openWindow, focusWindow, close };
}
