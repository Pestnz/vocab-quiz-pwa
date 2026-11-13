import type { JSONContent } from '@tiptap/react';

/** 見開きPDFの表示モード: 全体 / 左ページ / 右ページ */
export type SpreadSide = 'off' | 'left' | 'right';

/**
 * Phase 1 のローカル専用の解説ドキュメント。
 * GitHub には送らない(同期用の ExamExplanation は Phase 3 以降で SPEC §5.2 に沿って導入する)。
 */
export interface LocalExplainDoc {
  id: string;
  title: string;
  content: JSONContent | null;
  pdfKey: string | null;
  pdfFileName: string | null;
  pdfFileSize: number | null;
  pdfPage: number;
  pdfZoom: number;
  spreadSide: SpreadSide;
  spreadRatio: number; // 見開きの分割位置 (0.3〜0.7)
  splitRatio: number; // 画面左(PDF)の幅の割合 (0.25〜0.75)
  createdAt: string;
  updatedAt: string;
}

/** 端末ローカル(IndexedDB)にだけ保存するPDF本体 */
export interface StoredPdf {
  key: string; // `${fileName}__${fileSize}`
  fileName: string;
  fileSize: number;
  blob: Blob;
  addedAt: string;
}
