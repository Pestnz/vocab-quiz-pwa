import type { Language, VocabType } from './vocab';

export interface DiarySuggestedVocab {
  term: string;                  // 見出し語/フレーズ
  meaning: string;               // 日本語の意味
  explanation: string;           // ニュアンス・なぜこの表現を使うと良いか
  exampleSentence: string;       // 例文
  exampleTranslation: string;    // 例文訳
  type: VocabType;               // 'word' | 'phrase'
  isAdded?: boolean;             // 単語帳に追加済みフラグ
}

export interface DiaryItem {
  id: string;                    // UUID
  date: string;                  // 'YYYY-MM-DD'
  language: Language;            // 'en' | 'pt'
  originalText: string;          // ユーザーが書いた元の外国語日記
  correctedText?: string;        // Gemini添削後の自然な修正文
  feedback?: string;             // 日本語による文法・表現アドバイス
  translation?: string;          // 日記の日本語訳
  suggestedVocab?: DiarySuggestedVocab[]; // おすすめ語彙・表現リスト
  createdAt: string;             // ISO 8601
  updatedAt: string;             // ISO 8601
}

export interface DiaryCheckParams {
  originalText: string;
  language: Language;
  apiKey: string;
}

export interface DiaryCheckResult {
  correctedText: string;
  feedback: string;
  translation: string;
  suggestedVocab: DiarySuggestedVocab[];
}
