import type { JSONContent } from '@tiptap/react';

/** 見開きPDFの表示モード: 全体 / 左ページ / 右ページ */
export type SpreadSide = 'off' | 'left' | 'right';

/** 解説の状態(下書き / 作成中 / 完成 / 印刷済) */
export type ExamStatus = 'draft' | 'writing' | 'done' | 'printed';

/** 印刷レイアウト設定(A4縦固定) */
export interface PrintLayout {
  marginTop: number; // mm
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  fontSizePt: number;
  lineHeight: number;
  headerText: string; // 空ならタイトルを使う
  showHeader: boolean;
  showPageNumber: boolean;
}

/**
 * 端末内(IndexedDB)の解説ドキュメント。
 * 「同期する項目」(タイトル・メタ情報・本文・印刷設定・PDFの照合情報)と、
 * 「端末ごとの表示状態」(ページ位置・拡大率など)、「同期の記録」に分かれる。
 */
export interface LocalExplainDoc {
  id: string;
  title: string;
  content: JSONContent | null;

  // --- メタ情報(同期する) ---
  year: number; // 西暦。0 = 未設定
  eraLabel: string; // 例: '令和7年度'
  prefecture: string; // 例: '千葉'
  examType: string; // 例: '本検査'
  status: ExamStatus;
  layout?: PrintLayout; // 省略時は既定値で補う
  pdfKey: string | null; // `${fileName}__${fileSize}`。PDF本体は端末ローカルのみ
  pdfFileName: string | null;
  pdfFileSize: number | null;
  spreadRatio: number; // 見開きの分割位置(PDFの性質なので同期する)

  // --- 端末ごとの表示状態(同期しない) ---
  pdfPage: number;
  pdfZoom: number;
  spreadSide: SpreadSide;
  splitRatio: number; // 画面左(PDF)の幅の割合 (0.25〜0.75)

  // --- 日時・同期の記録 ---
  createdAt: string;
  updatedAt: string; // 端末内で最後に何かを変えた日時(一覧の並び順用)
  syncUpdatedAt: string; // 「同期する項目」を最後に変えた日時(マージの基準)
  baseUpdatedAt: string | null; // 最後に同期できた時点の syncUpdatedAt。null = 未同期
  remoteSha: string | null; // 最後に確認したGitHub上のファイルSHA
  lastSyncedAt: string | null;
}

/** 端末ローカル(IndexedDB)にだけ保存するPDF本体 */
export interface StoredPdf {
  key: string; // `${fileName}__${fileSize}`
  fileName: string;
  fileSize: number;
  blob: Blob;
  addedAt: string;
}

/** 端末内で削除した解説の記録(同期時にGitHub側へ削除を伝える) */
export interface DeletedDocRecord {
  id: string;
  deletedAt: string;
}

// ---------------- GitHub に保存する形(SPEC §5.1 / §5.2 に沿う) ----------------

export interface PdfRef {
  kind: 'question' | 'answerKey' | 'listeningScript';
  fileName: string;
  fileSize?: number;
  pageCount?: number;
  isSpread?: boolean;
  spreadSplitRatio?: number;
}

/**
 * explanations/{id}.json の中身。1試験 = 1ファイル。
 * sections は Phase 4 で使う(今は空)。別バージョンが書いた未知の項目は、上書き時にも保つ。
 */
export interface ExplainFile {
  schemaVersion: 1;
  id: string;
  title: string;
  year: number;
  eraLabel?: string;
  prefecture: string;
  examType?: string;
  status: ExamStatus;
  pdfRefs: PdfRef[];
  content: JSONContent | null;
  layout?: PrintLayout;
  sections: unknown[];
  deletedSectionIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ExplainIndexItem {
  id: string;
  title: string;
  year: number;
  eraLabel?: string;
  prefecture: string;
  examType?: string;
  status: ExamStatus;
  updatedAt: string;
  path: string; // 例: 'explanations/{id}.json'
}

/** explanations/index.json。削除の記録(deletedIds)も持ち、削除を他の端末へ伝える */
export interface ExplainIndex {
  schemaVersion: 1;
  items: ExplainIndexItem[];
  deletedIds: DeletedDocRecord[];
  updatedAt: string;
}
