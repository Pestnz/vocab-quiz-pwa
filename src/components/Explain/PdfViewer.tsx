import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, MoveHorizontal } from 'lucide-react';
import type { SpreadSide } from '../../types/explain';

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
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
            className="mx-auto bg-white shadow-lg overflow-hidden"
            style={{ width: frameWidth || undefined, height: cssSize.h || undefined }}
          >
            <canvas ref={canvasRef} style={{ display: 'block', marginLeft: offsetX }} />
          </div>
        )}
      </div>
    </div>
  );
};
