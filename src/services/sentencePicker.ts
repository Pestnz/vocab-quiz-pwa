import { GoogleGenAI } from '@google/genai';
import type { Language, VocabDatabase, VocabDifficultyLevel, VocabItem } from '../types/vocab';

interface PickWordsOptions {
  count: number; // 1〜5個
  language: Language;
  recentPassedWordIds?: string[]; // 直近合格したクールダウン対象
}

/**
 * 語彙強制使用モード用に対象単語を優先度に基づいて抽出する（マイ単語帳モード）
 */
export function pickSentenceWords(
  database: VocabDatabase,
  options: PickWordsOptions
): { words: VocabItem[]; totalAvailable: number } {
  const { count, language, recentPassedWordIds = [] } = options;

  // 対象言語の単語を抽出
  const langItems = database.filter(item => item.language === language);
  const totalAvailable = langItems.length;

  if (langItems.length === 0) {
    return { words: [], totalAvailable: 0 };
  }

  const now = Date.now();
  const cooldownSet = new Set(recentPassedWordIds);

  // クールダウン対象外を優先
  let candidates = langItems.filter(item => !cooldownSet.has(item.id));
  if (candidates.length < count) {
    // 候補が足りない場合はクールダウン対象も含める
    candidates = [...langItems];
  }

  // スコアリング（点数が高いほど出題優先度が高い）
  const scored = candidates.map(item => {
    let score = 0;

    // 優先度1: proficiency（習熟度）が低い単語（0: +50点, 1: +40点, 2: +30点, 3: +10点, 4: +5点, 5: 0点）
    const p = item.proficiency ?? 0;
    if (p === 0) score += 50;
    else if (p === 1) score += 40;
    else if (p === 2) score += 30;
    else if (p === 3) score += 10;
    else if (p === 4) score += 5;

    // 優先度2: nextReviewAt が現在時刻を過ぎている（+25点）
    if (item.nextReviewAt) {
      const reviewTime = new Date(item.nextReviewAt).getTime();
      if (reviewTime <= now) {
        score += 25;
      }
    } else {
      score += 20; // 未学習
    }

    // 優先度3: 作成日時が新しい（最大+15点）
    const createdTime = new Date(item.createdAt).getTime() || 0;
    const daysOld = Math.max(0, (now - createdTime) / (1000 * 60 * 60 * 24));
    if (daysOld <= 7) {
      score += 15;
    } else if (daysOld <= 30) {
      score += 8;
    }

    // ランダムな揺らぎ（同点ばかりにならないよう 0〜10点 のノイズ付与）
    score += Math.random() * 10;

    return { item, score };
  });

  // スコア降順ソートして指定件数取得
  scored.sort((a, b) => b.score - a.score);
  const selected = scored.slice(0, Math.min(count, scored.length)).map(s => s.item);

  return {
    words: selected,
    totalAvailable,
  };
}

const PRIMARY_MODEL = 'gemini-2.0-flash';
const FALLBACK_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro-latest',
];

export interface GenerateAiWordsOptions {
  count: number;
  language: Language;
  level: VocabDifficultyLevel;
  apiKey: string;
}

interface RawAiWord {
  term: string;
  meaning: string;
  explanation: string;
  exampleSentence: string;
  exampleTranslation: string;
}

const LEVEL_DESCRIPTIONS: Record<VocabDifficultyLevel, string> = {
  beginner: 'Beginner (CEFR A1-A2 level: fundamental everyday conversational vocabulary)',
  intermediate: 'Intermediate (CEFR B1 level: practical everyday and business foundational vocabulary)',
  upper_intermediate: 'Upper Intermediate (CEFR B2 level: expressive, nuanced, professional and idioms)',
  advanced: 'Advanced (CEFR C1-C2 level: sophisticated, academic, literary, and advanced idioms)',
};

/**
 * Gemini APIを利用して、指定された難易度レベル・言語に応じた実用単語をランダム生成する
 */
export async function generateAiSentenceWords(
  options: GenerateAiWordsOptions
): Promise<VocabItem[]> {
  const { count, language, level, apiKey } = options;

  if (!apiKey.trim()) {
    throw new Error('Gemini API Keyが未設定です。');
  }

  const langName = language === 'pt' ? 'Portuguese (Brazilian or European)' : 'English';
  const levelDesc = LEVEL_DESCRIPTIONS[level] || LEVEL_DESCRIPTIONS.intermediate;

  const systemInstruction = `You are an expert language curriculum designer and lexicographer for ${langName}.
Select exactly ${count} distinct, useful, and practical vocabulary items (words, phrasal verbs, or idioms) at the specified difficulty level:
Difficulty Level: ${levelDesc}
Target Language: ${langName}

Requirements:
1. Provide words from varied parts of speech (verbs, adjectives, nouns) that are engaging to construct a sentence with.
2. Provide a natural, precise Japanese translation for "meaning" (日本語の意味).
3. Provide a concise Japanese nuance/usage tip in "explanation" (解説・ニュアンス).
4. Provide a natural example sentence in ${langName} in "exampleSentence", and its Japanese translation in "exampleTranslation".

Output MUST be ONLY a JSON array with this exact format:
[
  {
    "term": "word or phrase in ${langName}",
    "meaning": "日本語の意味",
    "explanation": "解説・ニュアンス",
    "exampleSentence": "Natural example sentence in ${langName}",
    "exampleTranslation": "例文の日本語訳"
  }
]`;

  const prompt = `Randomly select ${count} ${langName} vocabulary items at difficulty level: ${levelDesc}. Provide varied terms that are not overly obscure but strictly fit the level.`;

  let lastError: Error | null = null;

  // 1. GoogleGenAI SDK
  try {
    const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
    const response = await ai.models.generateContent({
      model: PRIMARY_MODEL,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
    });

    const text = response.text?.trim();
    if (text) {
      return parseRawAiWords(text, language);
    }
  } catch (err: unknown) {
    console.warn(`generateAiSentenceWords SDK call failed with ${PRIMARY_MODEL}, trying fallback REST...`, err);
    lastError = err as Error;
  }

  // 2. REST フォールバック
  for (const model of FALLBACK_MODELS) {
    try {
      return await generateAiWordsRest(prompt, apiKey, systemInstruction, model, language);
    } catch (err: unknown) {
      console.warn(`Model ${model} failed for AI word generation, trying next...`, err);
      if (!lastError) {
        lastError = err as Error;
      }
    }
  }

  throw lastError || new Error('AIによる単語抽出に失敗しました。');
}

function parseRawAiWords(jsonStr: string, language: Language): VocabItem[] {
  let cleaned = jsonStr.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) {
    throw new Error('AIからの応答フォーマットが不正です。');
  }

  const now = new Date().toISOString();

  return parsed.map((item: RawAiWord, idx: number): VocabItem => ({
    id: typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `ai-item-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
    language,
    type: item.term.includes(' ') ? 'phrase' : 'word',
    sourceText: item.term,
    term: item.term,
    meaning: item.meaning || '',
    explanation: item.explanation || '',
    exampleSentence: item.exampleSentence || '',
    exampleTranslation: item.exampleTranslation || '',
    proficiency: 0,
    nextReviewAt: now,
    createdAt: now,
    updatedAt: now,
  }));
}

async function generateAiWordsRest(
  prompt: string,
  apiKey: string,
  systemInstruction: string,
  model: string,
  language: Language
): Promise<VocabItem[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`;

  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: systemInstruction }] },
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.8,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error?.message || `Gemini REST API Error (${res.status})`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini APIからの応答が空でした');
  }

  return parseRawAiWords(text, language);
}
