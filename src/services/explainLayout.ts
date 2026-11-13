import type { PrintLayout } from '../types/explain';

export const MM_TO_PX = 96 / 25.4;

export const DEFAULT_PRINT_LAYOUT: PrintLayout = {
  marginTop: 20,
  marginBottom: 20,
  marginLeft: 20,
  marginRight: 20,
  fontSizePt: 10.5,
  lineHeight: 1.8,
  headerText: '',
  showHeader: true,
  showPageNumber: true,
};

const clamp = (v: number, min: number, max: number, fallback: number): number =>
  Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

/** 保存済みの値が欠けていても、範囲外でも、安全な値に直す */
export function normalizeLayout(raw: Partial<PrintLayout> | undefined): PrintLayout {
  const d = DEFAULT_PRINT_LAYOUT;
  const r = raw ?? {};
  return {
    marginTop: clamp(r.marginTop ?? d.marginTop, 10, 60, d.marginTop),
    marginBottom: clamp(r.marginBottom ?? d.marginBottom, 10, 60, d.marginBottom),
    marginLeft: clamp(r.marginLeft ?? d.marginLeft, 5, 60, d.marginLeft),
    marginRight: clamp(r.marginRight ?? d.marginRight, 5, 60, d.marginRight),
    fontSizePt: clamp(r.fontSizePt ?? d.fontSizePt, 8, 16, d.fontSizePt),
    lineHeight: clamp(r.lineHeight ?? d.lineHeight, 1.2, 2.6, d.lineHeight),
    headerText: typeof r.headerText === 'string' ? r.headerText : d.headerText,
    showHeader: r.showHeader ?? d.showHeader,
    showPageNumber: r.showPageNumber ?? d.showPageNumber,
  };
}
