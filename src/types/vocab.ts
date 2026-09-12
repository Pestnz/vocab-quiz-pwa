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
  defaultLanguage?: Language;
}

export type FilterLanguage = 'all' | Language;
export type FilterType = 'all' | VocabType;

// 並び替えオプション
export type SortOption = 'created_desc' | 'created_asc' | 'term_asc' | 'term_desc';

// 画面表示モード
export type ViewMode = 'list' | 'quiz' | 'sentence';

// 語彙強制使用（縛りプレイ）作文判定結果
export interface SentenceCheckResult {
  isPass: boolean;                // 文法的に成立しており指定単語をすべて使えているか
  usedWords: string[];           // 正しく使われた指定単語
  missingWords: string[];        // 使われなかった、または誤用された指定単語
  grammarScore: number;          // 0〜100点
  naturalCorrectedText: string;  // より自然なネイティブ表現の修正文
  feedback: string;              // 文法上のミスやコロケーションの日本語解説
}

// 作文練習ログ（履歴保持用）
export interface SentencePracticeLog {
  id: string;
  createdAt: string;
  language: Language;
  targetWordIds: string[];
  targetTerms: string[];
  userSentence: string;
  result: SentenceCheckResult;
}
