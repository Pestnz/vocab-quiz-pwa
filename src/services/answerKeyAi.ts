import { callGeminiJson } from './aiRouter';
import type { AiPart } from './aiRouter';
import type { KeyRow } from './answerKey';
import type { PageImage } from './pdfImages';

const SYSTEM = `You read answer keys (正答表) of Japanese high-school entrance exams for English.
Extract EVERY answer in the images as rows, in the order printed. Do not invent or guess answers; skip anything that is not an answer (titles, notes, listening scripts).
For each row return:
- "section": the section (大問) number as digits only, e.g. "5". Use "" if the image does not show one.
- "label": the question number as printed, e.g. "(1)", "②", "No.1". For a sub-question under a numbered question, combine them, e.g. "(1)①".
- "answer": the correct answer exactly as printed: a choice symbol (ア, イ, ウ, エ or A, B, C, D), an ordering such as "ア→エ→イ→ウ→オ", or the written English word/phrase/sentence. If several answers are accepted, join them with " / ".
- "points": the allotted points as a number if shown, otherwise null.
Return only JSON.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    rows: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          section: { type: 'STRING' },
          label: { type: 'STRING' },
          answer: { type: 'STRING' },
          points: { type: 'NUMBER', nullable: true },
        },
        required: ['section', 'label', 'answer'],
      },
    },
  },
  required: ['rows'],
};

interface RawRow {
  section?: unknown;
  label?: unknown;
  answer?: unknown;
  points?: unknown;
}

const MAX_ROWS = 300;

/** 正答表の画像を、1回のリクエストでまとめて読み取る(消費は1回) */
export async function readAnswerKeyImages(images: PageImage[], apiKey?: string): Promise<{ rows: KeyRow[]; model: string }> {
  if (images.length === 0) throw new Error('読み取る画像がありません。');
  const parts: AiPart[] = [
    { text: `Read the answer key in the following ${images.length} image(s) (${images.map((i) => i.label).join(', ')}).` },
    ...images.map((i) => ({ inlineData: { mimeType: 'image/jpeg', data: i.base64 } })),
  ];
  const { data, model } = await callGeminiJson<{ rows?: RawRow[] }>({
    purpose: 'ocr',
    parts,
    system: SYSTEM,
    schema: SCHEMA,
    temperature: 0,
    maxOutputTokens: 8192,
    apiKey,
  });

  const rows: KeyRow[] = [];
  for (const r of Array.isArray(data.rows) ? data.rows : []) {
    const label = typeof r.label === 'string' ? r.label.trim() : '';
    const answer = typeof r.answer === 'string' ? r.answer.trim() : '';
    if (!label || !answer) continue;
    rows.push({
      section: typeof r.section === 'string' ? r.section.trim() : '',
      label,
      answer,
      points: typeof r.points === 'number' && Number.isFinite(r.points) ? r.points : undefined,
    });
    if (rows.length >= MAX_ROWS) break;
  }
  return { rows, model };
}
