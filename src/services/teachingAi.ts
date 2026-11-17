import { callGeminiJson } from './aiRouter';
import type { AiCallOptions } from './aiRouter';
import { AUDIENCE_LABEL, GENRE_LABEL, LEVEL_LABEL } from '../types/teaching';
import type { Audience, Genre, PracticeEvaluation, StudentLevel } from '../types/teaching';

/**
 * 質問応対練習のAI呼び出し。
 * - 出題: 話題(種)はこちらで無作為に選び、AIには「その話題について、その学年・英語力の生徒が実際に聞きそうな質問」に仕立てさせる
 * - 判定: 内容の正しさ・わかりやすさ・その生徒のレベルへの合い具合を採点し、わかりにくければ修正案を出す
 * - 送るのは、質問と答えだけ。生徒名・成績などの個人情報は送らない(そもそも入力欄がない)
 */

const MAX_ANSWER_CHARS = 2000;

const audienceDesc = (a: Audience): string => {
  switch (a) {
    case 'jh1':
      return 'a Japanese first-year junior high school student (age 12-13), just starting English';
    case 'jh2':
      return 'a Japanese second-year junior high school student (age 13-14)';
    case 'jh3':
      return 'a Japanese third-year junior high school student (age 14-15), preparing for high school entrance exams';
    case 'hs1':
      return 'a Japanese first-year high school student (age 15-16)';
    case 'hs2':
      return 'a Japanese second-year high school student (age 16-17)';
    case 'hs3':
      return 'a Japanese third-year high school student (age 17-18), preparing for university entrance exams';
  }
};

const levelDesc = (l: StudentLevel): string => {
  switch (l) {
    case 'weak':
      return 'weak at English: lacks basics, gets confused easily, needs very simple words and concrete examples';
    case 'normal':
      return 'average at English';
    case 'strong':
      return 'strong at English: asks deeper "why" questions, notices exceptions and nuances';
  }
};

export interface GeneratedQuestion {
  question: string;
  situation: string;
}

export interface QuestionParams {
  audience: Audience;
  studentLevel: StudentLevel;
  genre: Genre;
  topic: string; // こちらで選んだ話題(種)
  recentQuestions: string[]; // 直近に出した質問(重ならないように)
  apiKey?: string;
  signal?: AbortSignal;
  call?: typeof callGeminiJson; // テスト用
}

export async function generateQuestion(p: QuestionParams): Promise<GeneratedQuestion> {
  const system = `You write practice questions for a Japanese cram-school English teacher who is training to answer students' questions.
Write ONE realistic question that ${audienceDesc(p.audience)} who is ${levelDesc(p.studentLevel)} might actually ask the teacher.

Rules:
- The question must be written in natural spoken Japanese, in the student's own voice (casual but polite to a teacher). It may contain short English words or phrases.
- Base it on the given topic seed, but choose an angle a real student would take: a confusing example from class, a test mistake, a "why" curiosity, a misconception, or an apparent contradiction. The student's question may show a misunderstanding.
- Match the student's level: a weak student asks a basic or confused question; a strong student asks a deeper one.
- The question must have a clear, correct, explainable answer. Do not ask about unsettled or controversial points.
- 1 to 3 sentences. Do not include the answer.
- Do not reuse the angle of the recent questions listed by the user.
- "situation": a short Japanese note (under 40 characters) on when the student asked (e.g. "宿題の答え合わせ中に"). Only the timing or occasion; never invent names, places, schools or regions. Can be an empty string.

Output ONLY a JSON object: {"question": string, "situation": string}`;

  const recent = p.recentQuestions.slice(0, 15).map((q, i) => `${i + 1}. ${q.slice(0, 80)}`).join('\n');
  const prompt = `Topic seed (genre: ${GENRE_LABEL[p.genre]}): ${p.topic}
Student: ${AUDIENCE_LABEL[p.audience]} / ${LEVEL_LABEL[p.studentLevel]}
Recent questions (avoid similar ones):
${recent || '(none)'}`;

  const run = p.call ?? callGeminiJson;
  const opts: Omit<AiCallOptions, 'json'> = {
    purpose: 'teachQuestion',
    parts: [{ text: prompt }],
    system,
    temperature: 1.0,
    timeoutMs: 30_000,
    apiKey: p.apiKey,
    signal: p.signal,
  };
  const { data } = await run<Partial<GeneratedQuestion>>(opts);
  const question = String(data.question ?? '').trim();
  if (!question) throw new Error('AIが質問を作れませんでした。もう一度試してください。');
  return { question, situation: String(data.situation ?? '').trim().slice(0, 60) };
}

export interface EvaluateParams {
  audience: Audience;
  studentLevel: StudentLevel;
  question: string;
  answer: string;
  apiKey?: string;
  signal?: AbortSignal;
  call?: typeof callGeminiJson; // テスト用
}

const clampInt = (v: unknown, lo: number, hi: number, fallback: number): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : fallback;
};

const strList = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, max) : [];

/** AIの返事を、型に合うように整える(欠けや範囲外の値を直す) */
export function sanitizeEvaluation(raw: Record<string, unknown>): PracticeEvaluation {
  const acc = raw.accuracy === 'correct' || raw.accuracy === 'partly' || raw.accuracy === 'incorrect' ? raw.accuracy : 'partly';
  return {
    score: clampInt(raw.score, 0, 100, 50),
    accuracy: acc,
    accuracyNote: String(raw.accuracyNote ?? '').trim(),
    clarity: clampInt(raw.clarity, 1, 5, 3),
    levelFit: clampInt(raw.levelFit, 1, 5, 3),
    strengths: strList(raw.strengths, 4),
    issues: strList(raw.issues, 5),
    improvedAnswer: String(raw.improvedAnswer ?? '').trim(),
    tip: String(raw.tip ?? '').trim(),
  };
}

export async function evaluateAnswer(p: EvaluateParams): Promise<PracticeEvaluation> {
  const answer = p.answer.trim().slice(0, MAX_ANSWER_CHARS);
  if (!answer) throw new Error('答えを入力してください。');

  const system = `You are an experienced English teacher coaching a Japanese cram-school teacher who practices answering students' questions.
A student (${audienceDesc(p.audience)}, ${levelDesc(p.studentLevel)}) asked a question. The teacher wrote an answer. Evaluate the ANSWER as if it were spoken to that student.

Judge on:
1. Accuracy: is the English content factually correct? Point out any wrong or misleading statement precisely. Do not invent rules; if a rule has exceptions, check whether the answer mentions them when it matters. If the question rests on a misunderstanding, check whether the answer corrects it kindly.
2. Clarity: is it easy to follow? Good order (conclusion first, then reason, then example), concrete examples, no needless jargon, not too long.
3. Level fit: are the words, grammar terms and examples right for that student's grade and English ability? (e.g. avoid unexplained terms for a weak junior-high student.)

Rules:
- Write all feedback in Japanese. Keep example English sentences in English.
- Be honest and specific, not flattering. Quote short fragments of the answer when pointing out a problem.
- "score" (0-100) reflects accuracy first, then clarity and level fit. An answer with a factual error should not score above 70.
- "improvedAnswer": a rewritten answer in Japanese that the teacher could actually say to this student. Keep the teacher's own approach where it was good. Make it noticeably clearer, with a concrete example. It must be fully accurate and fit the student's level. Do not make it much longer than needed.
- "tip": one concrete thing to try next time.
- If the answer is empty of content, off-topic, or only says "I don't know", give a low score and still provide improvedAnswer.

Output ONLY a JSON object:
{"score": number, "accuracy": "correct"|"partly"|"incorrect", "accuracyNote": string, "clarity": number(1-5), "levelFit": number(1-5), "strengths": string[], "issues": string[], "improvedAnswer": string, "tip": string}`;

  const prompt = `Student's question:
"""
${p.question.trim()}
"""

Teacher's answer:
"""
${answer}
"""`;

  const run = p.call ?? callGeminiJson;
  const { data } = await run<Record<string, unknown>>({
    purpose: 'teachEvaluate',
    parts: [{ text: prompt }],
    system,
    temperature: 0.3,
    timeoutMs: 45_000,
    apiKey: p.apiKey,
    signal: p.signal,
  });
  return sanitizeEvaluation(data ?? {});
}
