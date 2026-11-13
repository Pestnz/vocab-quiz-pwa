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

// ---------------- 大問・設問(SPEC §5.3 / §5.4) ----------------

export type SectionKind = 'listening' | 'dialogue' | 'composition' | 'reading' | 'other';

export type QuestionType =
  | 'choice' // 選択(ア〜エ / A〜D)
  | 'reorder' // 語順整序
  | 'inflection' // 語形変化(1語)
  | 'fillBlank' // 空所に1語/語句を記述
  | 'composition' // 英作文(語数制限つき)
  | 'slideOrder' // 図・スライドの並べ替え
  | 'free'; // その他

/** 選択肢ごとの○×と理由。id は、別の端末の編集と食い違わないための識別子 */
export interface ChoiceExplanation {
  id: string;
  label: string; // 'ア' 'イ' 'A' など
  isCorrect: boolean;
  reason: JSONContent | null; // 正解の根拠 / 誤りの理由(選択問題では必須入力)
}

export interface Question {
  id: string;
  order: number; // 大問内の並び順(小さい順。小数でもよい)
  parentId?: string; // 小問のとき、親の設問のID(「(1)」の下の「①」など。1段まで)
  label: string; // '(1)' '② ' 'No.1' など。小問では '①' のように自分の分だけ入れる
  type: QuestionType;
  prompt?: string; // 設問の要点(任意。著作物の転載は最小限に)
  correctAnswer: string; // 正解(例: 'ウ' / 'ア→エ→イ→ウ→オ')
  points?: number; // 配点
  explanation: JSONContent | null; // 解説本文
  choices?: ChoiceExplanation[]; // choice のとき
  modelAnswers?: string[]; // 英作文などの模範解答
  scoringNotes?: string; // 採点基準・部分点の考え方
  wordLimit?: { min?: number; max?: number }; // 英作文の語数制限
  commonErrors?: string; // よくある誤答(講師用。生徒用には印刷しない)
  teacherNote?: string; // 講師メモ(生徒用には印刷しない)
  updatedAt: string;
}

// ---------------- 本文(長文)と文(SPEC §5.4。Phase 5) ----------------

/** 品詞分解の1語(Phase 5b で使う) */
export interface StructureToken {
  text: string;
  pos?: string; // 品詞: 名詞/動詞/形容詞…
  role?: 'S' | 'V' | 'O' | 'C' | 'M' | 'other'; // 文型上の役割
  group?: { type: 'noun' | 'adj' | 'adv' | 'clause' | 'to-inf' | 'ing'; id: string }; // かっこ付けの単位
  note?: string;
}

export interface SentenceStructure {
  tokens: StructureToken[];
  note?: string; // 文法ポイントの補足
}

export interface PassageSentence {
  id: string;
  order: number; // 本文内の並び順(小さい順。小数でもよい)
  no: number; // 文番号(表示用。並べ替えのたびに振り直す)
  en: string; // 英文
  ja: string; // 全訳
  speaker?: string; // 対話文の話者
  structure?: SentenceStructure; // 品詞分解・文構造(任意。Phase 5b)
  structureReviewed?: boolean; // 品詞分解を、人が確認済みか(英文・全訳の reviewed とは別。AIの下書きは false)
  ocrConfidence?: 'high' | 'low'; // 読み取りの自信。低いものは確認を促す
  reviewed: boolean; // 英文・全訳を、人が確認済みか(AIの下書き・読み取りのままなら false)
  paraStart?: boolean; // この文から新しい段落が始まる(SPEC の paragraphBreaks の代わりに、文ごとに持つ)
  updatedAt: string;
}

export interface GlossaryItem {
  term: string;
  meaning: string;
}

export interface Passage {
  id: string;
  title?: string;
  sentences: PassageSentence[]; // 文単位で管理(後から品詞分解を足しても作り直しにならない)
  glossary?: GlossaryItem[]; // (注)や重要語句
  updatedAt: string;
}

export interface ExamSection {
  id: string;
  order: number; // 大問の並び順(小さい順)
  number: string; // '1', '7' など。表示用の文字列
  title?: string; // 例: '長文(スピーチ)'
  kind: SectionKind;
  updatedAt: string;
  deletedItemIds: string[]; // 削除した設問・本文・文のID(マージ時の復活防止)
  passages: Passage[]; // 長文・資料(なければ空)
  questions: Question[];
  note?: string; // 大問全体の講師メモ(印刷に出さない)
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
  sections: ExamSection[]; // 大問(設問)。設問単位でマージする
  deletedSectionIds: string[]; // 削除した大問のID(マージ時の復活防止)
  metaUpdatedAt: string; // sections 以外の「同期する項目」を最後に変えた日時

  // --- 端末ごとの表示状態(同期しない) ---
  pdfPage: number;
  pdfZoom: number;
  spreadSide: SpreadSide;
  splitRatio: number; // 画面左(PDF)の幅の割合 (0.25〜0.75)
  editorMode?: 'free' | 'sections'; // 右側の表示(自由記述 / 大問)。省略時は自由記述

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
  sections: ExamSection[];
  deletedSectionIds: string[];
  createdAt: string;
  updatedAt: string; // 同期する項目全体の最終更新(= syncUpdatedAt)
  metaUpdatedAt?: string; // sections 以外の最終更新。Phase 3 までのファイルには無い
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
