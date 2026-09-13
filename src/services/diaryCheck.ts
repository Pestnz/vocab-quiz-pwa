import { GoogleGenAI } from '@google/genai';
import type { DiaryCheckParams, DiaryCheckResult, DiarySuggestedVocab } from '../types/diary';

const PRIMARY_MODEL = 'gemini-2.0-flash';
const FALLBACK_MODELS = [
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash-latest',
  'gemini-1.5-flash-8b',
  'gemini-1.5-pro-latest',
];

/**
 * ユーザーが外国語（英語・ポルトガル語）で書いた日記をGeminiで添削・アドバイス・おすすめ語彙抽出する
 */
export async function checkDiaryWithGemini(
  params: DiaryCheckParams
): Promise<DiaryCheckResult> {
  const { originalText, language, apiKey } = params;

  if (!apiKey.trim()) {
    throw new Error('Gemini API Keyが未設定です。右上の設定アイコンからキーを登録してください。');
  }

  if (!originalText.trim()) {
    throw new Error('日記の本文を入力してください。');
  }

  const langName = language === 'pt' ? 'Portuguese' : 'English';

  const systemInstruction = `You are an elite, empathetic bilingual language tutor, copyeditor, and writing coach for ${langName}.
The user has written a personal journal / diary entry in ${langName}.

Your mission:
1. **Analyze and Polish**:
   - Understand the user's intended message and emotional tone.
   - Correct all grammatical errors, typos, unnatural collocations, awkward phrasing, and preposition mistakes.
   - Produce a rewritten, polished version in "correctedText" that sounds completely natural and idiomatic to a native speaker while preserving the user's authentic voice.
2. **Feedback in Japanese**:
   - Provide friendly, constructive, detailed, and insightful explanations IN JAPANESE in "feedback".
   - Highlight what was corrected and WHY (e.g., "instead of 'make a decision', in this context 'reach a consensus' sounds much more natural because...").
   - Offer praise for good phrasing used by the writer.
3. **Japanese Translation**:
   - Provide a natural, fluent Japanese translation of the polished diary entry in "translation".
4. **Vocabulary & Phrase Recommendations**:
   - In "suggestedVocab", pick 3 to 5 high-value, practical words, idioms, or collocations that appeared in the corrected entry (or would elevate the user's writing in similar situations).
   - Each item must contain:
     - "term": the word or phrase in ${langName}
     - "meaning": clear concise Japanese definition
     - "explanation": helpful nuance, register, or collocation tips in Japanese
     - "exampleSentence": an illustrative practical example sentence in ${langName}
     - "exampleTranslation": Japanese translation of the example sentence
     - "type": "word" or "phrase"

Output MUST be strictly valid JSON with no markdown wrapping or preamble, matching this exact schema:
{
  "correctedText": string,
  "feedback": string,
  "translation": string,
  "suggestedVocab": [
    {
      "term": string,
      "meaning": string,
      "explanation": string,
      "exampleSentence": string,
      "exampleTranslation": string,
      "type": "word" | "phrase"
    }
  ]
}`;

  const prompt = `User's Diary Entry in ${langName}:
"""
${originalText.trim()}
"""`;

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
      return parseAndSanitizeDiaryResult(text);
    }
  } catch (err: unknown) {
    console.warn(`Diary check SDK call failed with ${PRIMARY_MODEL}, trying REST fallback...`, err);
    lastError = err as Error;
  }

  // 2. REST API フォールバック（各モデル順次試行）
  for (const model of FALLBACK_MODELS) {
    try {
      return await checkDiaryRest(prompt, apiKey, systemInstruction, model);
    } catch (err: unknown) {
      console.warn(`Model ${model} failed for diary check, trying next...`, err);
      lastError = err as Error;
    }
  }

  throw lastError || new Error('Gemini APIによる日記添削に失敗しました。');
}

/**
 * REST API フォールバック呼び出し（v1beta と v1 の両エンドポイントを試行）
 */
async function checkDiaryRest(
  prompt: string,
  apiKey: string,
  systemInstruction: string,
  model: string
): Promise<DiaryCheckResult> {
  const versions = ['v1beta', 'v1'];
  let lastErr: Error | null = null;

  for (const ver of versions) {
    try {
      const url = `https://generativelanguage.googleapis.com/${ver}/models/${model}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;

      const payload = {
        system_instruction: {
          parts: [{ text: systemInstruction }],
        },
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.3,
        },
      };

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error?.message || `HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (!rawText) {
        throw new Error('Geminiから有効な添削応答が得られませんでした。');
      }

      return parseAndSanitizeDiaryResult(rawText);
    } catch (err: unknown) {
      lastErr = err as Error;
    }
  }

  throw lastErr || new Error(`モデル ${model} での添削に失敗しました。`);
}

/**
 * レスポンスJSONのパースとサニタイズ
 */
function parseAndSanitizeDiaryResult(rawJson: string): DiaryCheckResult {
  const clean = rawJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  let parsed: any;
  try {
    parsed = JSON.parse(clean);
  } catch (e) {
    console.error('Failed to parse diary JSON:', rawJson);
    throw new Error('AIからの応答をJSONとして解析できませんでした。もう一度お試しください。');
  }

  const correctedText = String(parsed.correctedText || '').trim();
  const feedback = String(parsed.feedback || '').trim();
  const translation = String(parsed.translation || '').trim();

  const suggestedVocab: DiarySuggestedVocab[] = Array.isArray(parsed.suggestedVocab)
    ? parsed.suggestedVocab.map((v: any) => ({
        term: String(v.term || '').trim(),
        meaning: String(v.meaning || '').trim(),
        explanation: String(v.explanation || '').trim(),
        exampleSentence: String(v.exampleSentence || '').trim(),
        exampleTranslation: String(v.exampleTranslation || '').trim(),
        type: (v.type === 'phrase' ? 'phrase' : 'word') as 'word' | 'phrase',
        isAdded: false,
      })).filter((v: DiarySuggestedVocab) => v.term.length > 0)
    : [];

  return {
    correctedText: correctedText || '修正の必要はありません。素晴らしい表現です！',
    feedback: feedback || '文法・表現ともに自然です。',
    translation: translation || '',
    suggestedVocab,
  };
}
