import type { ChoiceExplanation, ExamSection, Question, QuestionType } from '../types/explain';
import { bySectionOrder, circled, createQuestion, fullLabel, orderAfterGroup, orderedWithDepth } from './explainSections';

/**
 * 正答表の取り込み: 貼り付けた文字の解析 → 大問・設問との照合 → 差分 → 反映。
 * AIで読み取った結果も、同じ KeyRow の形にして、ここで照合・差分表示する。
 */

export interface KeyRow {
  section: string; // 大問番号(空なら「対象の大問」として扱う)
  label: string; // 設問番号(例: '(1)' '①' '(1)①')
  answer: string;
  points?: number;
}

const nowIso = (): string => new Date().toISOString();

// ---------------- 正規化 ----------------

/** 全角の数字・括弧などを半角にそろえる。丸数字は NFKC で「1」になってしまうので、先に退避する */
function nfkcKeepCircled(s: string): string {
  return s
    .replace(/[①-⑳]/g, (c) => `{c${c.charCodeAt(0) - 0x2460 + 1}}`)
    .normalize('NFKC')
    .replace(/\{c(\d+)\}/g, (_, n) => circled(Number(n)));
}

/** 設問番号をそろえる: 「１」「1」「1)」「（1）」→「(1)」、「(1)の①」「(1)-①」→「(1)①」 */
export function normalizeLabel(raw: string): string {
  let s = nfkcKeepCircled(raw).replace(/\s+/g, '').replace(/[の\-−ー・.]/g, (c) => (c === '.' ? '' : ''));
  s = s.replace(/^no/i, '').replace(/問$/, '');
  // 先頭の「n」「n)」「(n」を「(n)」に
  s = s.replace(/^\(?(\d+)\)?/, '($1)');
  return s;
}

export function normalizeSectionNo(raw: string): string {
  return nfkcKeepCircled(raw).replace(/\s+/g, '').replace(/^大問|^第|問$|番$/g, '').replace(/[:：.]/g, '');
}

export function normalizeAnswer(raw: string): string {
  return nfkcKeepCircled(raw).replace(/\s+/g, ' ').trim();
}

// ---------------- 貼り付けの解析 ----------------

const SECTION_LINE = /^(?:大問|第)?\s*(\d+)\s*(?:問|番)?\s*[:：]?\s*$/;
const LABEL_HEAD = /^(?:\(\d+\)|\d+\)|\d+|[①-⑳]|No\.?\d+)(?:[の\-−ー]?[①-⑳])?/i;

export interface ParseResult {
  rows: KeyRow[];
  skipped: string[]; // 読み取れなかった行
}

/**
 * 1行に1設問。「大問5」だけの行で大問が切り替わる。区切りは空白・タブ・カンマ。
 * 例:  大問5 / (1) ウ / (2) イ 2 / 大問7 / (1)① ア / 6-(1) ウ
 */
export function parsePastedKey(text: string): ParseResult {
  const rows: KeyRow[] = [];
  const skipped: string[] = [];
  let currentSection = '';

  for (const rawLine of text.split(/\r?\n/)) {
    const line = nfkcKeepCircled(rawLine).trim();
    if (!line) continue;

    const head = SECTION_LINE.exec(line);
    if (head && /^(?:大問|第)/.test(line)) {
      currentSection = head[1];
      continue;
    }
    // 数字だけの行(「5」)は、大問の見出しではなく設問番号の可能性があるので、行頭に「大問」「第」があるときだけ見出しにする

    let rest = line;
    let section = currentSection;
    const prefix = /^(\d+)\s*[-−ー]\s*(?=[(\d①-⑳])/.exec(rest); // 「6-(1) ウ」
    if (prefix) {
      section = prefix[1];
      rest = rest.slice(prefix[0].length);
    }

    const m = LABEL_HEAD.exec(rest);
    if (!m) {
      skipped.push(rawLine.trim());
      continue;
    }
    const label = m[0];
    const tail = rest.slice(m[0].length).replace(/^[\s,、:：=\t]+/, '');
    if (!tail) {
      skipped.push(rawLine.trim());
      continue;
    }

    // 末尾の「2点」「2」を配点として切り出す(答えが数字だけの場合は切り出さない)
    let answer = tail;
    let points: number | undefined;
    const pt = /^(.*?)[\s,、\t]+(\d+)\s*点?$/.exec(tail);
    if (pt && pt[1].trim() !== '') {
      answer = pt[1].trim();
      points = Number(pt[2]);
    } else {
      const pt2 = /^(.*?)\s*[(（]?(\d+)点[)）]?$/.exec(tail);
      if (pt2 && pt2[1].trim() !== '') {
        answer = pt2[1].trim();
        points = Number(pt2[2]);
      }
    }
    rows.push({ section, label, answer: answer.trim(), points });
  }
  return { rows, skipped };
}

// ---------------- 照合と差分 ----------------

export type DiffStatus = 'same' | 'changed' | 'new' | 'unmatched';

export interface DiffRow {
  id: string;
  row: KeyRow;
  sectionId?: string;
  sectionNumber: string;
  questionId?: string;
  fullLabelText: string;
  current: string;
  currentPoints?: number;
  next: string;
  nextPoints?: number;
  status: DiffStatus;
  apply: boolean; // 反映するか(既定: 新規・変更はオン、同じ・対応なしはオフ)
}

export function buildDiff(sections: ExamSection[], rows: KeyRow[], defaultSectionId?: string): DiffRow[] {
  const sorted = [...sections].sort(bySectionOrder);
  const out: DiffRow[] = [];

  rows.forEach((row, i) => {
    const secNo = normalizeSectionNo(row.section);
    const sec = secNo
      ? sorted.find((s) => normalizeSectionNo(s.number) === secNo)
      : sorted.find((s) => s.id === defaultSectionId);
    const label = normalizeLabel(row.label);

    let q: Question | undefined;
    if (sec) {
      q = orderedWithDepth(sec.questions).find(({ q: x }) => normalizeLabel(fullLabel(x, sec.questions)) === label)?.q;
      // 「①」だけのように小問の番号だけが書かれている場合は、一意に決まるときだけ対応づける
      if (!q && /^[①-⑳]$/.test(label)) {
        const hits = sec.questions.filter((x) => x.parentId && normalizeLabel(x.label) === label);
        if (hits.length === 1) q = hits[0];
      }
    }

    const next = normalizeAnswer(row.answer);
    const current = q ? normalizeAnswer(q.correctAnswer) : '';
    const pointsDiffer = q !== undefined && row.points !== undefined && row.points !== q.points;
    let status: DiffStatus;
    if (!q) status = 'unmatched';
    else if (current === '') status = 'new';
    else if (current !== next || pointsDiffer) status = 'changed';
    else status = 'same';
    if (q && status === 'same' && pointsDiffer) status = 'changed';

    out.push({
      id: `${i}`,
      row,
      sectionId: sec?.id,
      sectionNumber: sec?.number ?? row.section,
      questionId: q?.id,
      fullLabelText: q ? fullLabel(q, sec?.questions ?? []) : row.label,
      current: q?.correctAnswer ?? '',
      currentPoints: q?.points,
      next: row.answer.trim(),
      nextPoints: row.points,
      status,
      apply: status === 'new' || status === 'changed',
    });
  });
  return out;
}

// ---------------- 反映 ----------------

export interface ApplyOptions {
  syncChoices: boolean; // 選択問題は、正解の記号に合わせて○×も更新する
  createMissing: boolean; // 対応する設問がない行は、新しい設問として作る(大問が見つかる場合のみ)
}

function guessType(answer: string): QuestionType {
  const a = normalizeAnswer(answer);
  if (/^[ア-オ]$|^[A-E]$/.test(a)) return 'choice';
  if (/→/.test(a)) return 'reorder';
  return 'fillBlank';
}

/** 差分のうち、チェックが入っている行だけを反映した、新しい大問の一覧を返す(元は変更しない) */
export function applyDiff(sections: ExamSection[], diff: DiffRow[], opts: ApplyOptions): ExamSection[] {
  const stamp = nowIso();
  let result = sections.map((s) => ({ ...s, questions: s.questions.map((q) => ({ ...q })) }));

  for (const d of diff) {
    if (!d.apply) continue;

    if (d.questionId && d.sectionId) {
      result = result.map((s) => {
        if (s.id !== d.sectionId) return s;
        return {
          ...s,
          questions: s.questions.map((q) => {
            if (q.id !== d.questionId) return q;
            const ans = d.next;
            let choices: ChoiceExplanation[] | undefined = q.choices;
            if (opts.syncChoices && q.type === 'choice' && choices && choices.length > 0) {
              const target = normalizeAnswer(ans);
              if (choices.some((c) => normalizeAnswer(c.label) === target)) {
                choices = choices.map((c) => ({ ...c, isCorrect: normalizeAnswer(c.label) === target }));
              }
            }
            return {
              ...q,
              correctAnswer: ans,
              points: d.nextPoints !== undefined ? d.nextPoints : q.points,
              choices,
              updatedAt: stamp,
            };
          }),
        };
      });
      continue;
    }

    // 対応する設問がない行 → 新しい設問として作る
    if (opts.createMissing && d.sectionId) {
      result = result.map((s) => {
        if (s.id !== d.sectionId) return s;
        const label = normalizeLabel(d.row.label);
        // 小問「(1)①」: 親「(1)」が既にあれば、その下に作る
        const sub = /^(\(\d+\))([①-⑳])$/.exec(label);
        const parent = sub ? s.questions.find((q) => !q.parentId && normalizeLabel(q.label) === sub[1]) : undefined;
        const type = guessType(d.next);
        const order = parent ? orderAfterGroup(s.questions, parent.id) : (s.questions.length ? Math.max(...s.questions.map((q) => q.order)) + 1 : 0);
        const q: Question = {
          ...createQuestion(order, parent && sub ? sub[2] : label, type),
          parentId: parent?.id,
          correctAnswer: d.next,
          points: d.nextPoints,
          updatedAt: stamp,
        };
        if (type === 'choice' && q.choices) {
          const target = normalizeAnswer(d.next);
          q.choices = q.choices.map((c) => ({ ...c, isCorrect: normalizeAnswer(c.label) === target }));
        }
        return { ...s, questions: [...s.questions, q] };
      });
    }
  }
  return result;
}

export const STATUS_TEXT: Record<DiffStatus, string> = {
  same: '同じ',
  changed: '変更',
  new: '新規入力',
  unmatched: '対応する設問なし',
};
