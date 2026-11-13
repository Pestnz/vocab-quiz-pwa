import { AiError, callGeminiJson } from './aiRouter';
import type { AiPart } from './aiRouter';
import type { GlossaryItem, SentenceStructure } from '../types/explain';
import { fitStructureToSentence, sanitizeTokens } from './explainStructure';
import { DEFAULT_LINES_PER_STRIP, planStrips } from './ocrStrips';
import type { Strip } from './ocrStrips';

/**
 * 本文の AI 処理(読み取りと全訳の下書き)。回数・モデル・フォールバックは aiRouter が管理する。
 * AIの出力は、すべて下書き(未確認)として扱う。
 */

// ---------------- 本文の読み取り(OCR) ----------------

const OCR_SYSTEM = `You transcribe English reading passages from images of Japanese high-school entrance exam papers.
The image shows a few lines cut from a longer passage. Transcribe EVERY printed English line exactly as written, in order. Do not correct, translate, summarize or add anything.
- Return one item per printed line in "lines". Set "newParagraph" to true when the line starts with a paragraph indent (its first word is indented), otherwise false.
- Keep blanks exactly as printed, e.g. "( A )". Keep quotation marks and punctuation. Keep a line that begins in the middle of a sentence as it is.
- Do NOT include Japanese instructions, question numbers or page numbers.
- Footnote lines (注) are not part of the passage: return each pair in "notes" with "term" (the English word) and "meaning" (the Japanese gloss).
- List every word you are not sure you read correctly in "uncertain".
Return only JSON.`;

const OCR_SCHEMA = {
  type: 'OBJECT',
  properties: {
    lines: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { text: { type: 'STRING' }, newParagraph: { type: 'BOOLEAN' } }, required: ['text'] },
    },
    notes: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { term: { type: 'STRING' }, meaning: { type: 'STRING' } }, required: ['term', 'meaning'] },
    },
    uncertain: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['lines'],
};

export interface PassageOcrResult {
  paragraphs: Array<{ speaker?: string; text: string }>;
  notes: GlossaryItem[];
  uncertain: string[];
  models: string[];
  calls: number;
}

interface RawStrip {
  lines?: Array<{ text?: unknown; newParagraph?: unknown }>;
  notes?: Array<{ term?: unknown; meaning?: unknown }>;
  uncertain?: unknown;
}

interface StripRead {
  lines: Array<{ text: string; newParagraph: boolean }>;
  notes: GlossaryItem[];
  uncertain: string[];
}

export interface OcrHooks {
  onProgress?: (done: number, total: number) => void;
  apiKey?: string;
}

const MAX_SPLIT_DEPTH = 3;

/** 1つの短冊を読む。AIに「再現」とみなされて止められたら、半分に分けて読み直す */
async function readStrip(strip: Strip, hooks: OcrHooks, stats: { calls: number; models: Set<string> }, depth = 0): Promise<StripRead> {
  try {
    const parts: AiPart[] = [
      { text: 'Transcribe the printed English lines in this image.' },
      { inlineData: { mimeType: 'image/jpeg', data: strip.base64 } },
    ];
    const { data, model, attempts } = await callGeminiJson<RawStrip>({
      purpose: 'ocr',
      parts,
      system: OCR_SYSTEM,
      schema: OCR_SCHEMA,
      apiKey: hooks.apiKey,
    });
    stats.calls += attempts.filter((a) => a.status === 'OK').length;
    stats.models.add(model);
    return {
      lines: (Array.isArray(data.lines) ? data.lines : [])
        .map((l) => ({ text: typeof l.text === 'string' ? l.text.trim() : '', newParagraph: l.newParagraph === true }))
        .filter((l) => l.text !== ''),
      notes: (Array.isArray(data.notes) ? data.notes : [])
        .map((n) => ({ term: typeof n.term === 'string' ? n.term.trim() : '', meaning: typeof n.meaning === 'string' ? n.meaning.trim() : '' }))
        .filter((n) => n.term !== ''),
      uncertain: (Array.isArray(data.uncertain) ? data.uncertain : []).filter((u): u is string => typeof u === 'string' && u.trim() !== ''),
    };
  } catch (e) {
    // 「既存の文章の再現」とみなされた → もっと短く(行数を半分に)して読み直す
    if (e instanceof AiError && e.code === 'recitation' && depth < MAX_SPLIT_DEPTH && strip.lines >= 2) {
      const half = Math.max(1, Math.ceil(strip.lines / 2));
      const plan = await planStrips(strip.base64, half);
      if (plan.strips.length >= 2) {
        const merged: StripRead = { lines: [], notes: [], uncertain: [] };
        for (const s of plan.strips) {
          const r = await readStrip(s, hooks, stats, depth + 1);
          merged.lines.push(...r.lines);
          merged.notes.push(...r.notes);
          merged.uncertain.push(...r.uncertain);
        }
        return merged;
      }
    }
    throw e;
  }
}

/** 「Haru: ...」のように、段落の先頭が「名前:」なら、話者として切り出す */
function splitSpeaker(text: string): { speaker?: string; text: string } {
  const m = /^([A-Z][A-Za-z.' -]{0,20}):\s+(.+)$/.exec(text);
  return m ? { speaker: m[1], text: m[2] } : { text };
}

/**
 * 本文の画像(JPEG)を、行の切れ目で数行ずつに分けて、順に読み取り、段落ごとの英文につなげる。
 * 消費は、短冊の数(止められた短冊は、半分に分けて読み直すので、その分も増える)。
 */
export async function readPassageLines(image: { base64: string }, hooks: OcrHooks = {}): Promise<PassageOcrResult> {
  const { strips } = await planStrips(image.base64, DEFAULT_LINES_PER_STRIP);
  const stats = { calls: 0, models: new Set<string>() };
  const lines: StripRead['lines'] = [];
  const notes: GlossaryItem[] = [];
  const uncertain: string[] = [];

  for (let i = 0; i < strips.length; i++) {
    const r = await readStrip(strips[i], hooks, stats);
    lines.push(...r.lines);
    for (const n of r.notes) if (!notes.some((x) => x.term === n.term)) notes.push(n);
    uncertain.push(...r.uncertain);
    hooks.onProgress?.(i + 1, strips.length);
  }
  if (lines.length === 0) throw new AiError('empty', '英文を読み取れませんでした。範囲を確認して、切り抜き直してください。');

  // 行を、段落ごとにつなげる(段落の最初の行は newParagraph が true。画像の先頭行は必ず段落の始まり)
  const paragraphs: Array<{ speaker?: string; text: string }> = [];
  let cur: string[] = [];
  const flush = () => {
    if (cur.length > 0) paragraphs.push(splitSpeaker(cur.join(' ').replace(/\s+/g, ' ').trim()));
    cur = [];
  };
  lines.forEach((l, idx) => {
    if (idx === 0 || l.newParagraph) flush();
    cur.push(l.text);
  });
  flush();
  return { paragraphs, notes, uncertain, models: [...stats.models], calls: stats.calls };
}

// ---------------- 全訳の下書き ----------------

const TRANSLATE_SYSTEM = `You are an English teacher writing complete Japanese translations (全訳) for entrance-exam commentary handouts.
Translate each numbered sentence into natural, accurate Japanese in a consistent polite style (です・ます調).
- Translate every requested sentence, one translation per number. Never merge, skip or reorder sentences.
- Keep blanks like ( A ) as （ A ） in the Japanese.
- Use the whole passage only as context to translate pronouns and ellipses correctly.
Return only JSON.`;

const TRANSLATE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    translations: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { no: { type: 'NUMBER' }, ja: { type: 'STRING' } }, required: ['no', 'ja'] },
    },
  },
  required: ['translations'],
};

/** 1回の呼び出しで訳す文の最大数(出力が長すぎて途中で切れないようにする) */
export const TRANSLATE_CHUNK = 40;

export const estimateTranslateCalls = (sentenceCount: number): number => Math.max(1, Math.ceil(sentenceCount / TRANSLATE_CHUNK));

export interface TranslateTarget {
  no: number; // 本文の中での文番号(1から)
  en: string;
}

export interface TranslateResult {
  translations: Map<number, string>;
  missing: number[]; // 訳が返らなかった文番号
  calls: number;
  models: string[];
}

/** 全文(文脈)を渡して、targets の文を訳す。文が多いときは、自動で分けて呼ぶ */
export async function translateSentences(
  allSentences: TranslateTarget[],
  targets: TranslateTarget[],
  apiKey?: string,
  onProgress?: (done: number, total: number) => void
): Promise<TranslateResult> {
  const context = allSentences.map((s) => `${s.no}. ${s.en}`).join('\n');
  const result: TranslateResult = { translations: new Map(), missing: [], calls: 0, models: [] };
  const chunks: TranslateTarget[][] = [];
  for (let i = 0; i < targets.length; i += TRANSLATE_CHUNK) chunks.push(targets.slice(i, i + TRANSLATE_CHUNK));

  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c];
    const prompt = `Full passage (for context):\n"""\n${context}\n"""\n\nTranslate ONLY these sentences:\n${chunk.map((s) => `${s.no}. ${s.en}`).join('\n')}`;
    const { data, model } = await callGeminiJson<{ translations?: Array<{ no?: unknown; ja?: unknown }> }>({
      purpose: 'translate',
      parts: [{ text: prompt }],
      system: TRANSLATE_SYSTEM,
      schema: TRANSLATE_SCHEMA,
      temperature: 0.2,
      maxOutputTokens: 16000,
      apiKey,
    });
    result.calls++;
    if (!result.models.includes(model)) result.models.push(model);
    const wanted = new Set(chunk.map((s) => s.no));
    for (const t of Array.isArray(data.translations) ? data.translations : []) {
      const no = Number(t.no);
      if (wanted.has(no) && typeof t.ja === 'string' && t.ja.trim()) result.translations.set(no, t.ja.trim());
    }
    onProgress?.(c + 1, chunks.length);
  }
  result.missing = targets.map((t) => t.no).filter((no) => !result.translations.has(no));
  return result;
}

// ---------------- 品詞分解の下書き ----------------

const STRUCTURE_SYSTEM = `You are an English teacher analysing sentence structure (品詞分解・文型) for Japanese high-school entrance-exam commentary handouts.
For each numbered sentence, split it into tokens IN ORDER so that joining all token texts (with spaces) reproduces the sentence exactly. Keep punctuation and quotation marks attached to the neighbouring word; never make punctuation a separate token. Keep blanks like ( A ) as a single token.
For each token give:
- "pos": the part of speech in Japanese, one of: 名詞, 代名詞, 動詞, 助動詞, 形容詞, 副詞, 前置詞, 接続詞, 冠詞, 関係代名詞, to不定詞, 動名詞, 分詞, 疑問詞, 間投詞, その他.
- "role": the sentence element of the clause it belongs to: "S" (subject), "V" (verb), "O" (object), "C" (complement), "M" (modifier: adverbs, prepositional phrases, etc.) or "other" (conjunctions, articles and other function words that belong to a larger element). Every main clause needs S and V. Label all tokens of a phrase with that phrase's role (e.g. all words of a noun-phrase object are "O").
- "group" (optional, use only for clear subordinate units): {"type": "noun"|"clause"|"adv"|"adj"|"to-inf"|"ing", "id": a short id such as "g1"} shared by all tokens of the same unit. Use noun/clause for noun clauses, adj for relative clauses and adjective phrases, adv for adverbial phrases/clauses, to-inf for to-infinitive phrases, ing for gerund/participle phrases. Do not nest groups.
And for each sentence give "note": ONE short Japanese grammar point (about 40 characters or fewer), never empty.
Return only JSON.`;

const STRUCTURE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    sentences: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          no: { type: 'NUMBER' },
          tokens: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                text: { type: 'STRING' },
                pos: { type: 'STRING' },
                role: { type: 'STRING', enum: ['S', 'V', 'O', 'C', 'M', 'other'] },
                group: {
                  type: 'OBJECT',
                  nullable: true,
                  properties: { type: { type: 'STRING', enum: ['noun', 'clause', 'adv', 'adj', 'to-inf', 'ing'] }, id: { type: 'STRING' } },
                },
              },
              required: ['text', 'pos', 'role'],
            },
          },
          note: { type: 'STRING' },
        },
        required: ['no', 'tokens', 'note'],
      },
    },
  },
  required: ['sentences'],
};

/** 1回の呼び出しで分解する文の最大数(出力が長すぎて、途中で切れないようにする) */
export const STRUCTURE_CHUNK = 15;

export const estimateStructureCalls = (sentenceCount: number): number => Math.max(1, Math.ceil(sentenceCount / STRUCTURE_CHUNK));

export interface StructureResult {
  structures: Map<number, SentenceStructure>;
  repaired: number[]; // 語の分け方を、英文に合わせて補正した文番号
  missing: number[]; // 使える結果が返らなかった文番号
  calls: number;
  models: string[];
}

/** 全文(文脈)を渡して、targets の文を品詞分解する。文が多いときは、自動で分けて呼ぶ */
export async function structureSentences(
  allSentences: TranslateTarget[],
  targets: TranslateTarget[],
  apiKey?: string,
  onProgress?: (done: number, total: number) => void
): Promise<StructureResult> {
  const context = allSentences.map((s) => `${s.no}. ${s.en}`).join('\n');
  const result: StructureResult = { structures: new Map(), repaired: [], missing: [], calls: 0, models: [] };
  const chunks: TranslateTarget[][] = [];
  for (let i = 0; i < targets.length; i += STRUCTURE_CHUNK) chunks.push(targets.slice(i, i + STRUCTURE_CHUNK));

  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c];
    const prompt = `Full passage (for context):\n"""\n${context}\n"""\n\nAnalyse ONLY these sentences:\n${chunk.map((s) => `${s.no}. ${s.en}`).join('\n')}`;
    const { data, model } = await callGeminiJson<{ sentences?: Array<{ no?: unknown; tokens?: unknown; note?: unknown }> }>({
      purpose: 'translate',
      parts: [{ text: prompt }],
      system: STRUCTURE_SYSTEM,
      schema: STRUCTURE_SCHEMA,
      temperature: 0.1,
      maxOutputTokens: 16000,
      apiKey,
    });
    result.calls++;
    if (!result.models.includes(model)) result.models.push(model);
    const byNo = new Map(chunk.map((s) => [s.no, s]));
    for (const r of Array.isArray(data.sentences) ? data.sentences : []) {
      const target = byNo.get(Number(r.no));
      if (!target) continue;
      // 語をつなげた結果が英文と合っているかを確かめ、合わなければ補正(できなければ捨てる)
      const fitted = fitStructureToSentence(target.en, sanitizeTokens(r.tokens));
      if (!fitted) continue;
      if (fitted.repaired) result.repaired.push(target.no);
      result.structures.set(target.no, { tokens: fitted.tokens, note: typeof r.note === 'string' && r.note.trim() ? r.note.trim() : undefined });
    }
    onProgress?.(c + 1, chunks.length);
  }
  result.missing = targets.map((t) => t.no).filter((no) => !result.structures.has(no));
  return result;
}
