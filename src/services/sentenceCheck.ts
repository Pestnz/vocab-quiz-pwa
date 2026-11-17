import { callGemini } from './aiRouter';
import type { Language, SentenceCheckResult } from '../types/vocab';

export interface CheckSentenceParams {
  targetWords: { term: string; meaning: string }[];
  language: Language;
  userSentence: string;
  apiKey: string;
}

/**
 * ユーザーの作成文が指定単語を正しく使い、自然な文法になっているかをGeminiで判定・添削する
 */
export async function checkSentenceWithGemini(
  params: CheckSentenceParams
): Promise<SentenceCheckResult> {
  const { targetWords, language, userSentence, apiKey } = params;

  if (!apiKey.trim()) {
    throw new Error('Gemini API Keyが未設定です。右上の設定アイコンからキーを登録してください。');
  }

  if (!userSentence.trim()) {
    throw new Error('作成文を入力してください。');
  }

  const langName = language === 'pt' ? 'Portuguese' : 'English';
  const wordListStr = targetWords
    .map((w, idx) => `${idx + 1}. "${w.term}" (Japanese meaning: ${w.meaning})`)
    .join('\n');

  const systemInstruction = `You are an encouraging and rigorous bilingual language evaluator and tutor for ${langName}.
The user was given a challenge to write a natural sentence in ${langName} that incorporates ALL of the following target vocabulary items:

Target Words:
${wordListStr}

Rules for evaluation:
1. **Inflections & Conjugations Allowed**: For verbs, accept past tense, past participle, present participle (-ing / -ndo), 3rd person singular, subjunctive, compound tenses, etc. For nouns, accept plural forms. For adjectives/adverbs, accept comparative/superlative or directly derived forms. If the target word is used in a valid grammatical form and appropriate context, count it as properly used!
2. **"isPass"**: Set to true IF the sentence is grammatically comprehensible and coherent, AND ALL target words (or their valid inflections) are used accurately in context. If any target word is omitted, fundamentally misused, or the grammar is broken, set to false.
3. **"usedWords"**: Array of terms (original spelling from the target list) that were successfully used.
4. **"missingWords"**: Array of terms from the target list that were omitted or misused.
5. **"grammarScore"**: Score from 0 to 100 based on grammatical precision, natural phrasing, and appropriate register.
6. **"naturalCorrectedText"**: The most natural, idiomatic rewrite of the user's sentence in ${langName} that native speakers would actually say, keeping the target words intact.
7. **"feedback"**: Constructive explanation IN JAPANESE explaining any grammatical errors, unnatural collocations, why a word was misplaced, or praise for a well-formed sentence.

Output must be ONLY a valid JSON object matching this schema:
{
  "isPass": boolean,
  "usedWords": string[],
  "missingWords": string[],
  "grammarScore": number,
  "naturalCorrectedText": string,
  "feedback": string
}`;

  const prompt = `User's submitted sentence:
"""
${userSentence.trim()}
"""`;

  // 共通のAI呼び出し基盤(aiRouter)で、用途「一文作成の採点」のモデル順に試す。
  // 上限の多い軽量モデルが先 → 枠切れ(429)・混雑(503)・エラーのときは次のモデルへ(設定画面のAI設定で変更可)
  const originalTerms = targetWords.map(w => w.term);
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await callGemini({
      purpose: 'score',
      parts: [{ text: prompt }],
      system: systemInstruction,
      json: true,
      apiKey,
      timeoutMs: 45_000,
    });
    try {
      return parseAndSanitizeResult(res.text, originalTerms);
    } catch (err: unknown) {
      lastError = err as Error; // 応答の形式が崩れていたら、1回だけやり直す
    }
  }
  throw lastError || new Error('Gemini APIによる添削判定に失敗しました。');
}

function parseAndSanitizeResult(jsonText: string, originalTerms: string[]): SentenceCheckResult {
  let parsed: Partial<SentenceCheckResult>;
  try {
    const clean = jsonText.replace(/^```json\s*/, '').replace(/```$/, '').trim();
    parsed = JSON.parse(clean);
  } catch {
    throw new Error('判定結果のJSON解析に失敗しました。');
  }

  const isPass = Boolean(parsed.isPass);
  const usedWords = Array.isArray(parsed.usedWords) ? parsed.usedWords : [];
  const missingWords = Array.isArray(parsed.missingWords)
    ? parsed.missingWords
    : originalTerms.filter(t => !usedWords.includes(t));

  const grammarScore = typeof parsed.grammarScore === 'number'
    ? Math.max(0, Math.min(100, Math.round(parsed.grammarScore)))
    : isPass ? 85 : 50;

  return {
    isPass,
    usedWords,
    missingWords,
    grammarScore,
    naturalCorrectedText: (parsed.naturalCorrectedText || '').trim(),
    feedback: (parsed.feedback || '').trim() || (isPass ? '文法・語彙ともに適切に使用されています！' : '文法や単語の使い方を見直してみましょう。'),
  };
}
