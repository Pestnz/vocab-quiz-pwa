import { GoogleGenAI } from '@google/genai';
import type { VocabAnalysisResult } from '../types/vocab';

// 最新推奨モデル: gemini-3.6-flash
const PRIMARY_MODEL = 'gemini-3.6-flash';
const FALLBACK_MODELS = [
  'gemini-3.6-flash',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
];
const BATCH_CHUNK_SIZE = 15; // 1回あたりの最大安全チャンク数

/**
 * 単一のメモ・単語を解析
 */
export async function analyzeVocabulary(
  sourceText: string,
  apiKey: string,
  preferredLanguage: 'auto' | 'en' | 'pt' = 'auto',
  defaultLanguage: 'en' | 'pt' = 'en'
): Promise<VocabAnalysisResult> {
  const results = await analyzeVocabularyBatch([sourceText], apiKey, preferredLanguage, defaultLanguage);
  if (!results || results.length === 0) {
    throw new Error('解析結果が得られませんでした。');
  }
  return results[0];
}

/**
 * 複数の単語・メモを一括（バッチ）解析
 * 大量件数（例: 20〜100件）でも自動チャンク分割で安全に処理
 */
export async function analyzeVocabularyBatch(
  sourceTexts: string[],
  apiKey: string,
  preferredLanguage: 'auto' | 'en' | 'pt' = 'auto',
  defaultLanguage: 'en' | 'pt' = 'en',
  onProgress?: (processed: number, total: number) => void
): Promise<VocabAnalysisResult[]> {
  if (!apiKey.trim()) {
    throw new Error('Gemini API Keyが設定されていません。設定モーダルでAPIキーを登録してください。');
  }

  const validItems = sourceTexts.map(t => t.trim()).filter(Boolean);
  if (validItems.length === 0) {
    throw new Error('入力テキストが空です。');
  }

  const allResults: VocabAnalysisResult[] = [];
  const totalItems = validItems.length;

  // 15個ずつチャンクに分割して順次処理
  for (let i = 0; i < validItems.length; i += BATCH_CHUNK_SIZE) {
    const chunk = validItems.slice(i, i + BATCH_CHUNK_SIZE);
    const chunkResults = await processBatchChunk(chunk, apiKey, preferredLanguage, defaultLanguage);
    allResults.push(...chunkResults);

    if (onProgress) {
      onProgress(Math.min(i + chunk.length, totalItems), totalItems);
    }
  }

  return allResults;
}

/**
 * 1チャンク分のバッチ解析（SDK試行 ➔ RESTフォールバック）
 */
async function processBatchChunk(
  items: string[],
  apiKey: string,
  preferredLanguage: 'auto' | 'en' | 'pt',
  defaultLanguage: 'en' | 'pt' = 'en'
): Promise<VocabAnalysisResult[]> {
  const systemInstruction = `You are a bilingual vocabulary assistant for English and Portuguese.
Analyze each of the provided inputs. The inputs can be English terms/phrases, Portuguese terms/phrases, or Japanese expressions.
${
  preferredLanguage !== 'auto'
    ? `User explicitly requested target language: '${preferredLanguage}'.`
    : `The user selected 'auto' language mode. IMPORTANT: If the input is in Japanese or cannot be determined, you MUST translate it into the user's default language: '${defaultLanguage}'. If the input is already in English, output 'en'. If already in Portuguese, output 'pt'.`
}

Rules for EACH item:
1. "language": Detect target language. Must be strictly 'en' for English or 'pt' for Portuguese.
2. "type": Must be either 'word' (single word) or 'phrase' (idiom, collocation, phrasal verb, expression, sentence).
3. "term": The target expression in natural, idiomatic foreign language.
4. "meaning": Clear and concise Japanese definition.
5. "explanation": Nuance, usage context, or register (in Japanese).
6. "example_sentence": A natural, everyday example sentence using the term.
7. "example_translation": Japanese translation of the example sentence.

Output must be ONLY a valid JSON ARRAY of objects matching this schema:
[
  {
    "language": "en" | "pt",
    "type": "word" | "phrase",
    "term": string,
    "meaning": string,
    "explanation": string,
    "example_sentence": string,
    "example_translation": string
  }
]
Maintain the order of the inputs.`;

  const formattedInputs = items.map((item, idx) => `${idx + 1}. ${item}`).join('\n');
  const prompt = `Please analyze the following ${items.length} inputs:\n"""\n${formattedInputs}\n"""`;

  let lastError: Error | null = null;

  // 1. GoogleGenAI SDK で試行
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
      return parseAndSanitizeBatchResult(text, items, preferredLanguage);
    }
  } catch (err: unknown) {
    console.warn(`Batch SDK call failed with ${PRIMARY_MODEL}, trying fallback REST models...`, err);
    lastError = err as Error;
  }

  // 2. REST API フォールバック（各モデル順次試行）
  for (const model of FALLBACK_MODELS) {
    try {
      return await processBatchChunkRest(prompt, apiKey, preferredLanguage, systemInstruction, model, items);
    } catch (err: unknown) {
      console.warn(`Model ${model} failed in batch, trying next...`, err);
      if (!lastError) {
        lastError = err as Error;
      }
    }
  }

  throw lastError || new Error('Gemini APIとの通信に失敗しました。');
}

async function processBatchChunkRest(
  prompt: string,
  apiKey: string,
  preferredLanguage: 'auto' | 'en' | 'pt',
  systemInstruction: string,
  modelName: string,
  originalItems: string[]
): Promise<VocabAnalysisResult[]> {
  const versions = ['v1beta', 'v1'];
  let lastErr: Error | null = null;

  for (const ver of versions) {
    try {
      const url = `https://generativelanguage.googleapis.com/${ver}/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
      
      const payload = {
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        systemInstruction: {
          parts: [{ text: systemInstruction }]
        },
        generationConfig: {
          responseMimeType: 'application/json',
        }
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        const message = errorBody?.error?.message || `APIエラー (${res.status} ${res.statusText})`;
        throw new Error(message);
      }

      const resData = await res.json();
      const text = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error('Gemini API からの応答が空でした。');
      }

      return parseAndSanitizeBatchResult(text, originalItems, preferredLanguage);
    } catch (e: unknown) {
      lastErr = e as Error;
    }
  }

  throw lastErr || new Error(`モデル ${modelName} の呼び出しに失敗しました。`);
}

function parseAndSanitizeBatchResult(
  jsonText: string,
  originalItems: string[],
  preferredLanguage: 'auto' | 'en' | 'pt'
): VocabAnalysisResult[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    // もしマークダウンコードブロック ```json ... ``` が残っていた場合のトリム
    const clean = jsonText.replace(/^```json\s*/, '').replace(/```$/, '').trim();
    parsed = JSON.parse(clean);
  }

  // 単一オブジェクトで返ってきた場合は配列にラップ
  const list: VocabAnalysisResult[] = Array.isArray(parsed) ? parsed : [parsed];

  return list.map((item, idx) => {
    const fallback = originalItems[idx] || '';
    return sanitizeResult(item, preferredLanguage, fallback);
  });
}

function sanitizeResult(
  data: Partial<VocabAnalysisResult>,
  preferredLanguage: 'auto' | 'en' | 'pt',
  fallbackText: string
): VocabAnalysisResult {
  let lang: 'en' | 'pt' = data.language === 'en' || data.language === 'pt' ? data.language : 'en';
  if (data.language !== 'en' && data.language !== 'pt') {
    lang = preferredLanguage !== 'auto' ? preferredLanguage : 'en';
  }

  let type: 'word' | 'phrase' = data.type === 'phrase' ? 'phrase' : 'word';
  if (data.type !== 'word' && data.type !== 'phrase') {
    type = fallbackText.trim().includes(' ') ? 'phrase' : 'word';
  }

  return {
    language: lang,
    type,
    term: (data.term || fallbackText).trim(),
    meaning: (data.meaning || '').trim(),
    explanation: (data.explanation || '').trim(),
    example_sentence: (data.example_sentence || '').trim(),
    example_translation: (data.example_translation || '').trim(),
  };
}

export async function testGeminiApiKey(apiKey: string): Promise<{ success: boolean; message: string }> {
  try {
    const result = await analyzeVocabulary('apple', apiKey, 'en');
    if (result.term) {
      return { success: true, message: `Gemini API (推奨モデル: ${PRIMARY_MODEL}) との通信に成功しました。` };
    }
    return { success: false, message: '解析結果が不正です。' };
  } catch (e: unknown) {
    const err = e as Error;
    return { success: false, message: err.message || 'APIキーの検証に失敗しました。' };
  }
}
