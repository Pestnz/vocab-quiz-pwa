import type { JSONContent } from '@tiptap/react';
import type {
  ChoiceExplanation,
  ExamSection,
  Question,
  QuestionType,
  SectionKind,
} from '../types/explain';

export const SECTION_KIND_LABEL: Record<SectionKind, string> = {
  listening: 'リスニング',
  dialogue: '対話文',
  composition: '英作文',
  reading: '長文読解',
  other: 'その他',
};

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  choice: '選択',
  reorder: '語順整序',
  inflection: '語形変化',
  fillBlank: '語句記述',
  composition: '英作文',
  slideOrder: '並べ替え(図・スライド)',
  free: 'その他',
};

export const SECTION_KINDS = Object.keys(SECTION_KIND_LABEL) as SectionKind[];
export const QUESTION_TYPES = Object.keys(QUESTION_TYPE_LABEL) as QuestionType[];

const nowIso = (): string => new Date().toISOString();
const newId = (): string => crypto.randomUUID();

const KANA_CHOICES = ['ア', 'イ', 'ウ', 'エ'];

export function createChoice(label: string): ChoiceExplanation {
  return { id: newId(), label, isCorrect: false, reason: null };
}

export function defaultChoices(): ChoiceExplanation[] {
  return KANA_CHOICES.map(createChoice);
}

export function createQuestion(order: number, label = '', type: QuestionType = 'choice'): Question {
  return {
    id: newId(),
    order,
    label,
    type,
    correctAnswer: '',
    explanation: null,
    choices: type === 'choice' ? defaultChoices() : undefined,
    updatedAt: nowIso(),
  };
}

export function createSection(order: number, number = '', kind: SectionKind = 'other', title?: string): ExamSection {
  return {
    id: newId(),
    order,
    number,
    title,
    kind,
    updatedAt: nowIso(),
    deletedItemIds: [],
    passages: [],
    questions: [],
  };
}

// ---------------- 読み込み時の整え(欠けた項目・壊れたデータに強くする) ----------------

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const rich = (v: unknown): JSONContent | null =>
  v && typeof v === 'object' && (v as { type?: unknown }).type === 'doc' ? (v as JSONContent) : null;

function normalizeChoice(raw: unknown): ChoiceExplanation | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Partial<ChoiceExplanation>;
  return { id: str(c.id) || newId(), label: str(c.label), isCorrect: Boolean(c.isCorrect), reason: rich(c.reason) };
}

function normalizeQuestion(raw: unknown, index: number): Question | null {
  if (!raw || typeof raw !== 'object') return null;
  const q = raw as Partial<Question>;
  const type = (QUESTION_TYPES as string[]).includes(q.type as string) ? (q.type as QuestionType) : 'free';
  const choices = Array.isArray(q.choices)
    ? q.choices.map(normalizeChoice).filter((c): c is ChoiceExplanation => c !== null)
    : undefined;
  return {
    id: str(q.id) || newId(),
    order: num(q.order, index),
    label: str(q.label),
    type,
    prompt: typeof q.prompt === 'string' ? q.prompt : undefined,
    correctAnswer: str(q.correctAnswer),
    points: typeof q.points === 'number' ? q.points : undefined,
    explanation: rich(q.explanation),
    choices,
    modelAnswers: Array.isArray(q.modelAnswers) ? q.modelAnswers.filter((m): m is string => typeof m === 'string') : undefined,
    scoringNotes: typeof q.scoringNotes === 'string' ? q.scoringNotes : undefined,
    wordLimit: q.wordLimit && typeof q.wordLimit === 'object' ? { min: q.wordLimit.min, max: q.wordLimit.max } : undefined,
    commonErrors: typeof q.commonErrors === 'string' ? q.commonErrors : undefined,
    teacherNote: typeof q.teacherNote === 'string' ? q.teacherNote : undefined,
    updatedAt: str(q.updatedAt) || nowIso(),
  };
}

export function normalizeSections(raw: unknown): ExamSection[] {
  if (!Array.isArray(raw)) return [];
  const out: ExamSection[] = [];
  raw.forEach((r, i) => {
    if (!r || typeof r !== 'object') return;
    const s = r as Partial<ExamSection>;
    const kind = (SECTION_KINDS as string[]).includes(s.kind as string) ? (s.kind as SectionKind) : 'other';
    out.push({
      id: str(s.id) || newId(),
      order: num(s.order, i),
      number: str(s.number),
      title: typeof s.title === 'string' ? s.title : undefined,
      kind,
      updatedAt: str(s.updatedAt) || nowIso(),
      deletedItemIds: Array.isArray(s.deletedItemIds) ? s.deletedItemIds.filter((d): d is string => typeof d === 'string') : [],
      passages: Array.isArray(s.passages) ? s.passages : [],
      questions: (Array.isArray(s.questions) ? s.questions : [])
        .map(normalizeQuestion)
        .filter((q): q is Question => q !== null),
      note: typeof s.note === 'string' ? s.note : undefined,
    });
  });
  return out;
}

export const bySectionOrder = (a: { order: number }, b: { order: number }): number => a.order - b.order;

// ---------------- 中身のチェック ----------------

/** リッチテキストに、文字が1つも入っていないか */
export function isRichEmpty(doc: JSONContent | null | undefined): boolean {
  if (!doc) return true;
  const walk = (n: JSONContent): boolean => {
    if (typeof n.text === 'string' && n.text.trim() !== '') return true;
    return (n.content ?? []).some(walk);
  };
  return !walk(doc);
}

export interface MissingReason {
  questionId: string;
  questionLabel: string;
  choiceId: string;
  choiceLabel: string;
}

/** 選択問題で、理由が未入力の選択肢の一覧(全選択肢に理由が必要) */
export function missingChoiceReasons(section: ExamSection): MissingReason[] {
  const out: MissingReason[] = [];
  for (const q of [...section.questions].sort(bySectionOrder)) {
    if (q.type !== 'choice') continue;
    for (const c of q.choices ?? []) {
      if (isRichEmpty(c.reason)) {
        out.push({ questionId: q.id, questionLabel: q.label || '(番号なし)', choiceId: c.id, choiceLabel: c.label });
      }
    }
  }
  return out;
}

export function countMissingReasons(sections: ExamSection[]): number {
  return sections.reduce((n, s) => n + missingChoiceReasons(s).length, 0);
}

// ---------------- 並べ替え・削除 ----------------

/** order を 0,1,2… に振り直す(並べ替えの後に使う) */
export function renumberQuestions(questions: Question[]): Question[] {
  const stamp = nowIso();
  return [...questions].sort(bySectionOrder).map((q, i) => (q.order === i ? q : { ...q, order: i, updatedAt: stamp }));
}

export function renumberSections(sections: ExamSection[]): ExamSection[] {
  const stamp = nowIso();
  return [...sections].sort(bySectionOrder).map((s, i) => (s.order === i ? s : { ...s, order: i, updatedAt: stamp }));
}

// ---------------- 初期テンプレート(SPEC §11 令和7年度 千葉県 本検査 の構成) ----------------

export function chibaTemplate(): ExamSection[] {
  const spec: Array<[string, SectionKind, string]> = [
    ['1', 'listening', 'リスニング'],
    ['2', 'listening', 'リスニング'],
    ['3', 'listening', 'リスニング'],
    ['4', 'listening', 'リスニング'],
    ['5', 'dialogue', '対話文(語形変化・語順整序)'],
    ['6', 'composition', '英作文'],
    ['7', 'reading', '長文(資料つき)'],
    ['8', 'reading', '長文(スピーチ)'],
    ['9', 'dialogue', '対話文(空所補充)'],
  ];
  return spec.map(([n, kind, title], i) => createSection(i, n, kind, title));
}

/** 大問・設問の文字だけを取り出す(ライブラリの全文検索用) */
export function sectionsToText(sections: ExamSection[]): string {
  const richText = (d: JSONContent | null | undefined): string => {
    if (!d) return '';
    const parts: string[] = [];
    const walk = (n: JSONContent) => {
      if (typeof n.text === 'string') parts.push(n.text);
      n.content?.forEach(walk);
    };
    walk(d);
    return parts.join(' ');
  };
  const out: string[] = [];
  for (const s of sections) {
    out.push(`大問${s.number}`, s.title ?? '', s.note ?? '');
    for (const q of s.questions) {
      out.push(q.label, q.prompt ?? '', q.correctAnswer, richText(q.explanation), q.scoringNotes ?? '', q.commonErrors ?? '', q.teacherNote ?? '');
      out.push(...(q.modelAnswers ?? []));
      for (const c of q.choices ?? []) out.push(c.label, richText(c.reason));
    }
  }
  return out.join('\n');
}

/** 何も入っていない大問か(テンプレートを入れ直す前の確認用) */
export function hasAnyQuestionContent(sections: ExamSection[]): boolean {
  return sections.some((s) => s.questions.length > 0);
}
