export type Language = 'en' | 'pt';
export type VocabType = 'word' | 'phrase';

export interface VocabItem {
  id: string;                         // UUID
  language: Language;                 // 言語（英語 / ポルトガル語）
  type: VocabType;                    // 分類（単語 / フレーズ・イディオム）
  sourceText: string;                // 入力した元のメモ
  term: string;                      // 見出し語
  meaning: string;                   // 日本語の意味
  explanation: string;               // ニュアンス・解説
  exampleSentence: string;           // 実用例文
  exampleTranslation: string;        // 例文の日本語訳
  proficiency: number;               // 習熟度 (0: 未学習 〜 5: 習得済み)
  nextReviewAt: string;              // 次回复習予定日時 (ISO 8601)
  createdAt: string;                 // 登録日時 (ISO 8601)
  updatedAt: string;                 // 更新日時 (ISO 8601)
}

export type VocabDatabase = VocabItem[];

export interface VocabAnalysisResult {
  language: Language;
  type: VocabType;
  term: string;
  meaning: string;
  explanation: string;
  example_sentence: string;
  example_translation: string;
}

export type SyncStatusState = 'synced' | 'syncing' | 'error' | 'unconfigured' | 'conflict';

export interface SyncStatus {
  state: SyncStatusState;
  lastSyncedAt?: string;
  errorMessage?: string;
}

export interface AppSettings {
  githubToken: string;
  repoOwner: string;
  repoName: string;
  branch: string;
  filePath: string;
  geminiApiKey: string;
}

export type FilterLanguage = 'all' | Language;
export type FilterType = 'all' | VocabType;
