import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, Settings2, AlertTriangle } from 'lucide-react';
import type { LocalExplainDoc, PrintLayout } from '../../types/explain';
import { docToHtml, paginate } from '../../services/explainPaginate';
import type { PaginateResult, PrintMode } from '../../services/explainPaginate';
import { DEFAULT_PRINT_LAYOUT, normalizeLayout } from '../../services/explainLayout';
import './explain.css';

interface PrintPreviewProps {
  doc: LocalExplainDoc;
  layout: PrintLayout;
  onLayoutChange: (layout: PrintLayout) => void;
  onClose: () => void;
}

// 画面ではプレビューを全面に出し、印刷時はこの画面以外を隠してA4ページだけを出す
const PRINT_CSS = `
@page { size: A4 portrait; margin: 0; }
@media print {
  html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
  body.explain-printing > *:not(#explain-print-portal) { display: none !important; }
  .explain-preview-overlay { position: static !important; inset: auto !important; height: auto !important; overflow: visible !important; background: #fff !important; }
  .explain-preview-toolbar { display: none !important; }
  .explain-preview-scroll { overflow: visible !important; height: auto !important; padding: 0 !important; background: #fff !important; }
  .explain-preview-zoom { zoom: 1 !important; }
  .explain-print-sheet { margin: 0 !important; box-shadow: none !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

const ZOOMS = [0.5, 0.7, 0.85, 1] as const;

export const PrintPreview: React.FC<PrintPreviewProps> = ({ doc, layout, onLayoutChange, onClose }) => {
  const [mode, setMode] = useState<PrintMode>('teacher');
  const [zoom, setZoom] = useState<number>(0.85);
  const [showSettings, setShowSettings] = useState(false);
  const [result, setResult] = useState<PaginateResult | null>(null);

  // 印刷用の設定(@page)・本文以外を隠すクラス・PDF保存時の既定ファイル名(タイトル)。閉じたら元に戻す
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = PRINT_CSS;
    document.head.appendChild(style);
    document.body.classList.add('explain-printing');
    const prevTitle = document.title;
    document.title = doc.title || '解説';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      style.remove();
      document.body.classList.remove('explain-printing');
      document.title = prevTitle;
      window.removeEventListener('keydown', onKey);
    };
  }, [doc.title, onClose]);

  // ページの割り付け(設定や内容が変わったら少し待って再計算)
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const r = await paginate(docToHtml(doc.content), layout, mode);
        if (!cancelled) setResult(r);
      } catch (e) {
        console.error('Failed to paginate', e);
      }
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [doc.content, layout, mode]);

  const headerText = layout.headerText.trim() || doc.title;
  const pageCount = result?.pages.length ?? 0;
  const pagesHtml = useMemo(() => result?.pages.map((blocks) => blocks.join('')) ?? [], [result]);

  const setField = <K extends keyof PrintLayout>(key: K, value: PrintLayout[K]) =>
    onLayoutChange(normalizeLayout({ ...layout, [key]: value }));

  const num = (label: string, key: 'marginTop' | 'marginBottom' | 'marginLeft' | 'marginRight' | 'fontSizePt' | 'lineHeight', unit: string, step: number) => (
    <label className="flex items-center gap-1 text-xs text-slate-300">
      <span className="w-16 shrink-0">{label}</span>
      <input
        type="number"
        step={step}
        value={layout[key]}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) setField(key, v);
        }}
        className="w-16 bg-slate-800 border border-slate-700 rounded px-1.5 py-1 text-slate-100"
      />
      <span className="text-slate-500">{unit}</span>
    </label>
  );

  const btn =
    'flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium border cursor-pointer disabled:opacity-40';

  return createPortal(
    <div id="explain-print-portal">
      <div className="explain-preview-overlay fixed inset-0 z-[60] flex flex-col bg-slate-900">
        <div className="explain-preview-toolbar border-b border-slate-800 bg-slate-900">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2">
            <span className="text-sm font-semibold text-slate-100">印刷プレビュー</span>
            <span className="text-xs text-slate-400 font-mono">{result ? `全 ${pageCount} ページ(A4縦)` : '計算中…'}</span>

            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as PrintMode)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-md px-2 py-1.5"
              aria-label="印刷の種類"
            >
              <option value="teacher">講師用(講師メモを含む)</option>
              <option value="student">生徒配布用(講師メモを除く)</option>
            </select>

            <select
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-md px-2 py-1.5"
              aria-label="表示倍率"
            >
              {ZOOMS.map((z) => (
                <option key={z} value={z}>
                  表示 {Math.round(z * 100)}%
                </option>
              ))}
            </select>

            <button
              onClick={() => setShowSettings((v) => !v)}
              className={`${btn} ${showSettings ? 'bg-slate-700 border-slate-600 text-white' : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'}`}
            >
              <Settings2 className="w-3.5 h-3.5" />
              レイアウト
            </button>

            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => window.print()} disabled={!result} className={`${btn} bg-emerald-600 border-emerald-500 text-white hover:bg-emerald-500`}>
                <Printer className="w-3.5 h-3.5" />
                印刷 / PDFに保存
              </button>
              <button onClick={onClose} className={`${btn} bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700`}>
                <X className="w-3.5 h-3.5" />
                閉じる
              </button>
            </div>
          </div>

          {showSettings && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-3 py-2 border-t border-slate-800 bg-slate-900/80">
              {num('上余白', 'marginTop', 'mm', 1)}
              {num('下余白', 'marginBottom', 'mm', 1)}
              {num('左余白', 'marginLeft', 'mm', 1)}
              {num('右余白', 'marginRight', 'mm', 1)}
              {num('文字サイズ', 'fontSizePt', 'pt', 0.5)}
              {num('行間', 'lineHeight', '倍', 0.1)}
              <label className="flex items-center gap-1 text-xs text-slate-300">
                <input type="checkbox" checked={layout.showHeader} onChange={(e) => setField('showHeader', e.target.checked)} />
                ヘッダー
              </label>
              <input
                value={layout.headerText}
                onChange={(e) => setField('headerText', e.target.value)}
                placeholder={`空欄ならタイトル(${doc.title || '無題'})`}
                disabled={!layout.showHeader}
                className="w-64 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100 disabled:opacity-40"
                aria-label="ヘッダーの文字"
              />
              <label className="flex items-center gap-1 text-xs text-slate-300">
                <input type="checkbox" checked={layout.showPageNumber} onChange={(e) => setField('showPageNumber', e.target.checked)} />
                ページ番号
              </label>
              <button
                onClick={() => onLayoutChange({ ...DEFAULT_PRINT_LAYOUT })}
                className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer"
              >
                初期値に戻す
              </button>
            </div>
          )}

          <div className="px-3 pb-2 text-[11px] text-slate-500">
            印刷ダイアログでは、用紙「A4」・倍率「100%」・余白「なし」・「背景のグラフィック」オンにすると、この表示どおりに出力されます。
            {result && result.overflowCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-400">
                <AlertTriangle className="w-3 h-3" />
                1ページに収まらない大きなブロックが {result.overflowCount} 個あります(途中で切れます)。分割してください。
              </span>
            )}
          </div>
        </div>

        <div className="explain-preview-scroll flex-1 min-h-0 overflow-auto bg-slate-800/70 p-4">
          <div className="explain-preview-zoom" style={{ zoom }}>
            {pagesHtml.map((html, i) => (
              <section key={i} className="explain-print-sheet">
                {layout.showHeader && headerText && (
                  <div
                    className="ex-header"
                    style={{
                      top: `${Math.max(5, layout.marginTop / 2 - 2)}mm`,
                      left: `${layout.marginLeft}mm`,
                      right: `${layout.marginRight}mm`,
                    }}
                  >
                    {headerText}
                  </div>
                )}
                <div
                  className="explain-page-body"
                  style={{
                    top: `${layout.marginTop}mm`,
                    left: `${layout.marginLeft}mm`,
                    right: `${layout.marginRight}mm`,
                    height: `${297 - layout.marginTop - layout.marginBottom}mm`,
                    fontSize: `${layout.fontSizePt}pt`,
                    lineHeight: layout.lineHeight,
                  }}
                  dangerouslySetInnerHTML={{ __html: html }}
                />
                {layout.showPageNumber && (
                  <div
                    className="ex-footer"
                    style={{ bottom: `${Math.max(5, layout.marginBottom / 2 - 2)}mm`, left: 0, right: 0, textAlign: 'center' }}
                  >
                    {i + 1} / {pageCount}
                  </div>
                )}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
