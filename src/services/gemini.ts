import { callGemini } from './aiRouter';
import type { VocabAnalysisResult } from '../types/vocab';

// 使うモデルは aiRouter の用途別設定(単語バッチ)で決まる
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
 * 1チャンク分のバッチ解析(aiRouter経由。モデルの切り替えは aiRouter が行う)
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

  // 共通のAI呼び出し基盤(aiRouter)で、用途「単語バッチ」のモデル順に試す。
  // 上限の多い軽量モデルが先 → 枠切れ(429)・混雑(503)・エラーのときは次のモデルへ(設定画面のAI設定で変更可)
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await callGemini({
      purpose: 'vocabBatch',
      parts: [{ text: prompt }],
      system: systemInstruction,
      json: true,
      apiKey,
      timeoutMs: 90_000,
    });
    try {
      const results = parseAndSanitizeBatchResult(res.text, items, preferredLanguage);
      // 件数が合わないときは、1回だけやり直す(結果と入力の対応がずれるのを防ぐ)
      if (results.length === items.length || attempt === 1) return results;
      lastError = new Error('解析結果の件数が入力と一致しませんでした。');
    } catch (err: unknown) {
      lastError = err as Error;
      if (attempt === 1) break;
    }
  }
  throw lastError || new Error('Gemini APIとの通信に失敗しました。');
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

// 疎通テスト用: 1日の上限が多い軽量モデルだけを使う(単語解析の枠を消費しない)
const TEST_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'];

export async function testGeminiApiKey(apiKey: string): Promise<{ success: boolean; message: string }> {
  const key = apiKey.trim();
  if (!key) return { success: false, message: 'APIキーが入力されていません。' };

  let lastMessage = 'APIキーの検証に失敗しました。';
  for (const model of TEST_MODELS) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Reply with the single word: OK' }] }],
          generationConfig: { maxOutputTokens: 16 },
        }),
      });
      if (res.ok) {
        return { success: true, message: `Gemini API との通信に成功しました(確認に使ったモデル: ${model})。` };
      }
      if (res.status === 401 || res.status === 403) {
        return { success: false, message: 'APIキーが使えません。キーを確認してください。' };
      }
      if (res.status === 429) {
        lastMessage = `${model} は、今日の無料枠を使い切っています。`;
      } else if (res.status === 503) {
        lastMessage = `${model} が混み合っています。少し待ってから、もう一度試してください。`;
      } else {
        lastMessage = `${model} がエラーを返しました(${res.status})。`;
      }
    } catch {
      lastMessage = 'Geminiに接続できませんでした。通信を確認してください。';
    }
  }
  return { success: false, message: lastMessage };
}
