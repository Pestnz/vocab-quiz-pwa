import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, MoveHorizontal, Crop, Loader2 } from 'lucide-react';
import type { SpreadSide } from '../../types/explain';
import { compressCanvas } from '../../services/imageCompress';
import type { CropImage } from '../../services/imageCompress';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

interface PdfViewerProps {
  blob: Blob | null;
  missingFileName: string | null; // ローカルにPDFが無いとき、再選択を促すためのファイル名
  page: number;
  zoom: number;
  spreadSide: SpreadSide;
  spreadRatio: number;
  onPageChange: (page: number) => void;
  onZoomChange: (zoom: number) => void;
  onSpreadSideChange: (side: SpreadSide) => void;
  onSpreadRatioChange: (ratio: number) => void;
  onPickFile: () => void;
  onCrop?: (img: CropImage) => void; // 切り抜き(範囲をドラッグ)を使うときに渡す
}

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;

export const PdfViewer: React.FC<PdfViewerProps> = ({
  blob,
  missingFileName,
  page,
  zoom,
  spreadSide,
  spreadRatio,
  onPageChange,
  onZoomChange,
  onSpreadSideChange,
  onSpreadRatioChange,
  onPickFile,
  onCrop,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cropMode, setCropMode] = useState(false);
  const [dragRect, setDragRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const [cropBusy, setCropBusy] = useState(false);
  const [cropInfo, setCropInfo] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const baseWidthRef = useRef<number>(0); // zoom=1 のときのページ幅(CSSピクセル)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [cssSize, setCssSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  // PDF読み込み
  useEffect(() => {
    // 親側で blob が変わるたびに key で作り直されるので、ここでの状態リセットは不要
    if (!blob) return;
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;

    (async () => {
      try {
        const data = await blob.arrayBuffer();
        if (cancelled) return;
        // スキャン画像PDF(JBIG2等)の復号に必要な wasm の置き場所(public/pdfjs/wasm/)
        loadingTask = pdfjsLib.getDocument({ data, wasmUrl: `${import.meta.env.BASE_URL}pdfjs/wasm/` });
        const doc = await loadingTask.promise;
        if (cancelled) return;
        setPdf(doc);
        setPageCount(doc.numPages);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'PDFを開けませんでした。');
      }
    })();

    return () => {
      cancelled = true;
      if (loadingTask) void loadingTask.destroy();
    };
  }, [blob]);

  // ページ描画
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    let task: RenderTask | null = null;

    (async () => {
      const safePage = Math.min(Math.max(1, page), pdf.numPages);
      const pdfPage = await pdf.getPage(safePage);
      if (cancelled) return;
      const dpr = window.devicePixelRatio || 1;
      const cssViewport = pdfPage.getViewport({ scale: zoom });
      baseWidthRef.current = cssViewport.width / zoom;
      const viewport = pdfPage.getViewport({ scale: zoom * dpr });
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.style.width = `${cssViewport.width}px`;
      canvas.style.height = `${cssViewport.height}px`;
      setCssSize({ w: cssViewport.width, h: cssViewport.height });
      task = pdfPage.render({ canvas, canvasContext: ctx, viewport });
      try {
        await task.promise;
      } catch (e) {
        // ズームやページ切替による中断は正常
        if (!(e instanceof Error) || e.name !== 'RenderingCancelledException') {
          if (!cancelled) setError(e instanceof Error ? e.message : '描画に失敗しました。');
        }
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, page, zoom]);

  const fitWidth = useCallback(() => {
    const container = scrollRef.current;
    const base = baseWidthRef.current;
    if (!container || !base) return;
    const visibleFraction = spreadSide === 'off' ? 1 : spreadSide === 'left' ? spreadRatio : 1 - spreadRatio;
    const next = (container.clientWidth - 24) / (base * visibleFraction);
    onZoomChange(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(next * 100) / 100)));
  }, [spreadSide, spreadRatio, onZoomChange]);

  // 見開き: canvasは全体を描画し、枠(overflow:hidden)で片側だけ見せる
  const frameWidth =
    spreadSide === 'off' ? cssSize.w : spreadSide === 'left' ? cssSize.w * spreadRatio : cssSize.w * (1 - spreadRatio);
  const offsetX = spreadSide === 'right' ? -cssSize.w * spreadRatio : 0;

  // ---- 切り抜き: 選んだ範囲だけを、高い解像度で描き直して圧縮する ----
  const doCrop = async (rect: { x: number; y: number; w: number; h: number }) => {
    if (!pdf || !onCrop) return;
    setCropBusy(true);
    setCropInfo(null);
    try {
      const safePage = Math.min(Math.max(1, page), pdf.numPages);
      const pdfPage = await pdf.getPage(safePage);
      // 見開きの「右」を表示しているときは、ページ全体のキャンバス上での位置に直す
      const xCanvas = rect.x + (spreadSide === 'right' ? cssSize.w * spreadRatio : 0);
      const pdfX = xCanvas / zoom;
      const pdfY = rect.y / zoom;
      const pdfW = rect.w / zoom;
      const pdfH = rect.h / zoom;
      const longPt = Math.max(pdfW, pdfH);
      const s = Math.min(4, Math.max(0.5, Math.min(1400, longPt * 3) / longPt)); // 長辺が最大1400px(圧縮前)
      const viewport = pdfPage.getViewport({ scale: s, offsetX: -pdfX * s, offsetY: -pdfY * s });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(pdfW * s));
      canvas.height = Math.max(1, Math.ceil(pdfH * s));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('画像を作れませんでした。');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise;
      const img = await compressCanvas(canvas);
      onCrop(img);
      setCropInfo(`切り抜きました(${img.width}×${img.height}px・約${Math.round(img.bytes / 1024)}KB)。解説の「切り抜きを貼り付け」で入れられます。`);
      setCropMode(false);
    } catch (e) {
      setCropInfo(e instanceof Error ? e.message : '切り抜きに失敗しました。');
    } finally {
      setCropBusy(false);
      setDragRect(null);
    }
  };

  const localPoint = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: Math.min(Math.max(0, e.clientX - r.left), r.width), y: Math.min(Math.max(0, e.clientY - r.top), r.height) };
  };
  const onCropDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (cropBusy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = localPoint(e);
    setDragRect({ ...dragStartRef.current, w: 0, h: 0 });
  };
  const onCropMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragStartRef.current;
    if (!s) return;
    const p = localPoint(e);
    setDragRect({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  };
  const onCropUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragStartRef.current;
    dragStartRef.current = null;
    if (!s) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    const p = localPoint(e);
    const rect = { x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) };
    if (rect.w < 12 || rect.h < 12) {
      setDragRect(null); // 小さすぎる(クリックだけ)なら取り消す
      return;
    }
    void doCrop(rect);
  };

  const goPage = (p: number) => {
    if (pageCount === 0) return;
    onPageChange(Math.min(Math.max(1, p), pageCount));
  };

  const btn =
    'p-1.5 rounded-md text-slate-300 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer';

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-900">
      <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5 border-b border-slate-800 bg-slate-900/90 text-xs">
        <button className={btn} onClick={() => goPage(page - 1)} disabled={!pdf || page <= 1} title="前のページ">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-mono text-slate-300 min-w-[64px] text-center">
          {pdf ? `${Math.min(page, pageCount)} / ${pageCount}` : '- / -'}
        </span>
        <button className={btn} onClick={() => goPage(page + 1)} disabled={!pdf || page >= pageCount} title="次のページ">
          <ChevronRight className="w-4 h-4" />
        </button>

        <span className="mx-1 h-4 w-px bg-slate-700" />

        <button className={btn} onClick={() => onZoomChange(Math.max(MIN_ZOOM, Math.round((zoom - 0.1) * 100) / 100))} disabled={!pdf} title="縮小">
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="font-mono text-slate-300 min-w-[44px] text-center">{Math.round(zoom * 100)}%</span>
        <button className={btn} onClick={() => onZoomChange(Math.min(MAX_ZOOM, Math.round((zoom + 0.1) * 100) / 100))} disabled={!pdf} title="拡大">
          <ZoomIn className="w-4 h-4" />
        </button>
        <button className={btn} onClick={fitWidth} disabled={!pdf} title="幅に合わせる">
          <MoveHorizontal className="w-4 h-4" />
        </button>

        {onCrop && (
          <>
            <span className="mx-1 h-4 w-px bg-slate-700" />
            <button
              onClick={() => {
                setCropMode((v) => !v);
                setCropInfo(null);
              }}
              disabled={!pdf}
              title="PDFの範囲をドラッグして、画像として切り抜く(解説に貼り付けられます)"
              className={`flex items-center gap-1 px-2 py-1 rounded-md cursor-pointer disabled:opacity-30 ${
                cropMode ? 'bg-sky-600 text-white' : 'text-slate-300 hover:bg-slate-700'
              }`}
            >
              {cropBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crop className="w-3.5 h-3.5" />}
              切り抜き
            </button>
          </>
        )}

        <span className="mx-1 h-4 w-px bg-slate-700" />

        <span className="text-slate-400">見開き:</span>
        {(['off', 'left', 'right'] as const).map((side) => (
          <button
            key={side}
            onClick={() => onSpreadSideChange(side)}
            disabled={!pdf}
            className={`px-2 py-1 rounded-md cursor-pointer disabled:opacity-30 ${
              spreadSide === side ? 'bg-emerald-600 text-white' : 'text-slate-300 hover:bg-slate-700'
            }`}
          >
            {side === 'off' ? '全体' : side === 'left' ? '左' : '右'}
          </button>
        ))}
        {spreadSide !== 'off' && (
          <label className="flex items-center gap-1 text-slate-400" title="見開きの分割位置">
            分割
            <input
              type="range"
              min={30}
              max={70}
              value={Math.round(spreadRatio * 100)}
              onChange={(e) => onSpreadRatioChange(Number(e.target.value) / 100)}
              className="w-20"
            />
            <span className="font-mono w-8">{Math.round(spreadRatio * 100)}%</span>
          </label>
        )}
      </div>

      {(cropMode || cropInfo) && (
        <div className="px-3 py-1.5 text-[11px] border-b border-slate-800 bg-sky-950/60 text-sky-100">
          {cropMode && !cropInfo ? '切り抜く範囲を、PDFの上でドラッグして選んでください(やめるときは「切り抜き」をもう一度押します)。' : cropInfo}
        </div>
      )}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto p-3 bg-slate-800/60">
        {!blob ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-center text-sm text-slate-400">
            {missingFileName ? (
              <>
                <p>この解説のPDFがこの端末にありません。</p>
                <p className="font-mono text-xs text-slate-300">{missingFileName}</p>
                <p className="text-xs">同じファイルを選び直してください。</p>
              </>
            ) : (
              <p>入試問題のPDFを開いてください。</p>
            )}
            <button
              onClick={onPickFile}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
            >
              PDFを選ぶ
            </button>
            <p className="text-[11px] text-slate-500">PDFはこの端末の中だけに保存され、GitHubには送られません。</p>
          </div>
        ) : error ? (
          <p className="text-sm text-rose-400">{error}</p>
        ) : (
          <div
            className="relative mx-auto bg-white shadow-lg overflow-hidden"
            style={{ width: frameWidth || undefined, height: cssSize.h || undefined }}
          >
            <canvas ref={canvasRef} style={{ display: 'block', marginLeft: offsetX }} />
            {cropMode && (
              <div
                className="absolute inset-0 cursor-crosshair touch-none bg-sky-500/5"
                onPointerDown={onCropDown}
                onPointerMove={onCropMove}
                onPointerUp={onCropUp}
                data-crop-overlay="true"
              >
                {dragRect && (
                  <div
                    className="absolute border-2 border-sky-500 bg-sky-400/20 pointer-events-none"
                    style={{ left: dragRect.x, top: dragRect.y, width: dragRect.w, height: dragRect.h }}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
