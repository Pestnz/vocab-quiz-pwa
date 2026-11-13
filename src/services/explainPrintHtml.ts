import type { ExamSection, LocalExplainDoc, Passage, Question } from '../types/explain';
import { bySectionOrder, fullLabel, isRichEmpty, orderedWithDepth } from './explainSections';
import { toParagraphs } from './explainPassages';
import { docToHtml } from './explainPaginate';

/** all = 自由記述+本文解説+解答解説 / passages = 本文解説のみ / answers = 解答解説のみ / free = 自由記述のみ */
export type PrintScope = 'all' | 'passages' | 'answers' | 'free';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]);
/** 入力欄の文字(プレーンテキスト)を、安全にHTMLにする。改行は <br> に */
const plain = (s: string): string => esc(s).replace(/\r?\n/g, '<br>');

function questionHtml(q: Question, label: string, depth: 0 | 1): string {
  const parts: string[] = [];

  // 小問は、親の番号とつなげて出す(例: 「(1)」+「①」→「(1)①」)
  const head: string[] = [`<span class="ex-q-label">${esc(label)}</span>`];
  if (q.correctAnswer.trim()) head.push(`<span class="ex-q-ans">正解: ${esc(q.correctAnswer)}</span>`);
  if (q.points !== undefined) head.push(`<span class="ex-q-pt">(${esc(String(q.points))}点)</span>`);
  parts.push(`<div class="ex-q-head">${head.join(' ')}</div>`);

  if (q.prompt?.trim()) parts.push(`<p class="ex-q-prompt">${plain(q.prompt)}</p>`);

  if (!isRichEmpty(q.explanation)) parts.push(`<div class="ex-q-exp">${docToHtml(q.explanation)}</div>`);

  if (q.type === 'choice' && (q.choices?.length ?? 0) > 0) {
    const rows = (q.choices ?? [])
      .map(
        (c) =>
          `<tr><td class="ex-mark">${c.isCorrect ? '○' : '×'}</td><td class="ex-lab">${esc(c.label)}</td>` +
          `<td class="ex-reason">${isRichEmpty(c.reason) ? '<span class="ex-empty">(理由 未入力)</span>' : docToHtml(c.reason)}</td></tr>`
      )
      .join('');
    parts.push(`<table class="ex-choices"><tbody>${rows}</tbody></table>`);
  }

  const answers = (q.modelAnswers ?? []).filter((m) => m.trim() !== '');
  if (answers.length > 0) {
    const limit = q.wordLimit && (q.wordLimit.min || q.wordLimit.max)
      ? `(語数: ${q.wordLimit.min ?? ''}${q.wordLimit.min && q.wordLimit.max ? '〜' : q.wordLimit.min ? '語以上' : '最大'}${q.wordLimit.max ?? ''}${q.wordLimit.max ? '語' : ''})`
      : '';
    parts.push(
      `<div class="ex-model"><b>模範解答</b>${esc(limit)}` +
        answers.map((m, i) => `<p>${answers.length > 1 ? `${i + 1}. ` : ''}${plain(m)}</p>`).join('') +
        `</div>`
    );
  }

  if (q.scoringNotes?.trim()) parts.push(`<p class="ex-scoring"><b>採点基準</b> ${plain(q.scoringNotes)}</p>`);

  // 講師用の内容。生徒配布用では [data-teacher-note] ごと取り除かれる
  const teacher: string[] = [];
  if (q.commonErrors?.trim()) teacher.push(`<p><b>よくある誤答</b> ${plain(q.commonErrors)}</p>`);
  if (q.teacherNote?.trim()) teacher.push(`<p><b>講師メモ</b> ${plain(q.teacherNote)}</p>`);
  if (teacher.length > 0) parts.push(`<div data-teacher-note="true">${teacher.join('')}</div>`);

  return `<div class="ex-q${depth === 1 ? ' ex-sub' : ''}">${parts.join('')}</div>`;
}

const CIRCLED = (n: number): string => (n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : `(${n})`);
const SENTENCES_PER_TABLE = 8; // 1つの表(途中で切れないブロック)に入れる文の数。段落が長くても、ページに収まるように分ける

/** 本文(英文と全訳)の印刷用HTML。段落ごとに、文番号・英文・全訳を並べた表にする */
function passageHtml(p: Passage): string {
  const out: string[] = [];
  if (p.title?.trim()) out.push(`<h3>${esc(p.title)}</h3>`);
  let no = 0;
  for (const para of toParagraphs(p.sentences)) {
    for (let i = 0; i < para.length; i += SENTENCES_PER_TABLE) {
      const chunk = para.slice(i, i + SENTENCES_PER_TABLE);
      const rows = chunk
        .map((s) => {
          no++;
          const sp = s.speaker?.trim() ? `<b class="ex-speaker">${esc(s.speaker)}:</b> ` : '';
          return `<tr><td class="ex-sno">${CIRCLED(no)}</td><td class="ex-en">${sp}${esc(s.en)}</td><td class="ex-ja">${esc(s.ja)}</td></tr>`;
        })
        .join('');
      const last = i + SENTENCES_PER_TABLE >= para.length;
      out.push(`<table class="ex-passage${last ? '' : ' ex-li-mid'}"><tbody>${rows}</tbody></table>`);
    }
  }
  const gl = (p.glossary ?? []).filter((g) => g.term.trim() !== '');
  if (gl.length > 0) {
    out.push(`<p class="ex-glossary"><b>(注)</b> ${gl.map((g) => `${esc(g.term)} ${esc(g.meaning)}`).join('　')}</p>`);
  }
  return out.join('');
}

interface Include {
  passages: boolean;
  questions: boolean;
}

function sectionHtml(s: ExamSection, inc: Include): string {
  const title = `大問${s.number || ''}${s.title ? ` ${s.title}` : ''}`;
  const out: string[] = [`<h2>${esc(title)}</h2>`];
  if (s.note?.trim()) out.push(`<div data-teacher-note="true"><p>${plain(s.note)}</p></div>`);
  if (inc.passages) for (const p of [...s.passages]) out.push(passageHtml(p));
  if (inc.questions) {
    for (const { q, depth } of orderedWithDepth(s.questions)) out.push(questionHtml(q, fullLabel(q, s.questions), depth));
  }
  return out.join('');
}

/** 大問(本文解説・解答解説)の印刷用HTML。設問や表は1つのブロックで、ページの途中で切れない */
export function sectionsToHtml(sections: ExamSection[], inc: Include = { passages: true, questions: true }): string {
  return [...sections]
    .sort(bySectionOrder)
    .filter(
      (s) =>
        (inc.questions && s.questions.length > 0) ||
        (inc.passages && s.passages.some((p) => p.sentences.length > 0)) ||
        (s.note ?? '').trim() !== ''
    )
    .map((s) => sectionHtml(s, inc))
    .join('');
}

/** 印刷する範囲に応じて、自由記述・本文解説・解答解説を組み合わせた、印刷用のHTMLを作る */
export function buildPrintHtml(doc: LocalExplainDoc, scope: PrintScope): string {
  const free = scope === 'all' || scope === 'free' ? docToHtml(doc.content) : '';
  const sections =
    scope === 'free'
      ? ''
      : sectionsToHtml(doc.sections, { passages: scope !== 'answers', questions: scope !== 'passages' });
  return `${free}${sections}`;
}
