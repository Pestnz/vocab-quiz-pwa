import type { Passage, SentenceStructure, StructureToken } from '../types/explain';

/**
 * 品詞分解(文構造)の補助: 語への分け方、品詞・役割の候補、かっこ付け、AI出力の検証。
 * 構造は、文ごとに { tokens: [{ text, pos, role, group }], note } として持つ。
 */

const newId = (): string => crypto.randomUUID();

export type Role = NonNullable<StructureToken['role']>;
export type GroupType = NonNullable<StructureToken['group']>['type'];

export const ROLES: Role[] = ['S', 'V', 'O', 'C', 'M', 'other'];
export const ROLE_LABEL: Record<Role, string> = {
  S: 'S 主語',
  V: 'V 動詞',
  O: 'O 目的語',
  C: 'C 補語',
  M: 'M 修飾語',
  other: 'その他',
};

/** 品詞の候補(ここにない語も入力できる) */
export const POS_LIST = [
  '名詞',
  '代名詞',
  '動詞',
  '助動詞',
  '形容詞',
  '副詞',
  '前置詞',
  '接続詞',
  '冠詞',
  '関係代名詞',
  'to不定詞',
  '動名詞',
  '分詞',
  '疑問詞',
  '間投詞',
  '記号',
  'その他',
];

const POS_SHORT: Record<string, string> = {
  名詞: '名',
  代名詞: '代',
  動詞: '動',
  助動詞: '助',
  形容詞: '形',
  副詞: '副',
  前置詞: '前',
  接続詞: '接',
  冠詞: '冠',
  関係代名詞: '関代',
  to不定詞: 'to不',
  動名詞: '動名',
  分詞: '分',
  疑問詞: '疑',
  間投詞: '間',
  記号: '記',
  その他: '他',
};

/** 印刷では、品詞を短く(名・動・形…)表す。知らない品詞は、先頭2文字にする */
export const posShort = (pos: string | undefined): string => {
  if (!pos) return '';
  return POS_SHORT[pos] ?? pos.slice(0, 2);
};

export const GROUP_TYPES: GroupType[] = ['noun', 'clause', 'adv', 'adj', 'to-inf', 'ing'];
export const GROUP_LABEL: Record<GroupType, string> = {
  noun: '名詞句 [ ]',
  clause: '節 [ ]',
  adv: '副詞句 < >',
  adj: '形容詞句 ( )',
  'to-inf': '不定詞 ( )',
  ing: '分詞・動名詞 ( )',
};

/** かっこの記号: 名詞(節)は [ ]、副詞は < >、形容詞・不定詞・分詞は ( ) */
export function bracketsOf(type: GroupType): [string, string] {
  if (type === 'noun' || type === 'clause') return ['[', ']'];
  if (type === 'adv') return ['<', '>'];
  return ['(', ')'];
}

// ---------------- 語への分割 ----------------

/** 英文を、空白で語に分ける(句読点・引用符は、そのままの語にくっつける)。品詞・役割は空 */
export function tokenizeEnglish(en: string): StructureToken[] {
  return en
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((text) => ({ text }));
}

const normText = (s: string): string =>
  s
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, '');

/** 語を全部つなげると、英文と一致するか(空白と引用符の違いは無視) */
export function tokensMatchSentence(en: string, tokens: StructureToken[]): boolean {
  return normText(tokens.map((t) => t.text).join('')) === normText(en);
}

// ---------------- AIの出力を検証して整える ----------------

const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as string[]).includes(v);
const isGroupType = (v: unknown): v is GroupType => typeof v === 'string' && (GROUP_TYPES as string[]).includes(v);

export function sanitizeTokens(raw: unknown): StructureToken[] {
  if (!Array.isArray(raw)) return [];
  const out: StructureToken[] = [];
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue;
    const t = r as { text?: unknown; pos?: unknown; role?: unknown; group?: unknown; note?: unknown };
    const text = typeof t.text === 'string' ? t.text.trim() : '';
    if (!text) continue;
    const g = t.group as { type?: unknown; id?: unknown } | null | undefined;
    out.push({
      text,
      pos: typeof t.pos === 'string' && t.pos.trim() ? t.pos.trim() : undefined,
      role: isRole(t.role) ? t.role : undefined,
      group: g && isGroupType(g.type) && typeof g.id === 'string' && g.id !== '' ? { type: g.type, id: g.id } : undefined,
      note: typeof t.note === 'string' && t.note.trim() ? t.note.trim() : undefined,
    });
  }
  return out;
}

/**
 * AIが返した品詞分解を、英文と照らして使えるようにする。
 * - 語をつなげると英文に一致する → そのまま使う
 * - 一致しないが、空白で分けた語の数と同じ → 品詞・役割だけを、英文の語に当てはめる
 * - それ以外 → 使えない(null)
 */
export function fitStructureToSentence(en: string, tokens: StructureToken[]): { tokens: StructureToken[]; repaired: boolean } | null {
  if (tokens.length === 0) return null;
  if (tokensMatchSentence(en, tokens)) return { tokens, repaired: false };
  const words = tokenizeEnglish(en);
  if (words.length === tokens.length) {
    return { tokens: words.map((w, i) => ({ ...tokens[i], text: w.text })), repaired: true };
  }
  return null;
}

// ---------------- 編集操作(新しい配列を返す) ----------------

/** i 番目と、その次の語をつなぐ(品詞・役割・かっこは、前の語のものを保つ) */
export function mergeTokenWithNext(tokens: StructureToken[], i: number): StructureToken[] | null {
  if (i < 0 || i >= tokens.length - 1) return null;
  const a = tokens[i];
  const b = tokens[i + 1];
  const merged: StructureToken = { ...a, text: `${a.text} ${b.text}`.trim() };
  return [...tokens.slice(0, i), merged, ...tokens.slice(i + 2)];
}

/** 語の中に空白があれば、その位置で語を分ける(最初の語が、品詞・役割・かっこを引き継ぐ) */
export function splitTokenAtSpaces(tokens: StructureToken[], i: number): StructureToken[] | null {
  const t = tokens[i];
  if (!t) return null;
  const parts = t.text.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const rest: StructureToken[] = parts.slice(1).map((text) => ({ text, group: t.group }));
  return [...tokens.slice(0, i), { ...t, text: parts[0] }, ...rest, ...tokens.slice(i + 1)];
}

/** from〜to(両端を含む)の語に、かっこ付けの種類を設定する。type が null なら外す */
export function applyGroup(tokens: StructureToken[], from: number, to: number, type: GroupType | null): StructureToken[] {
  const a = Math.min(from, to);
  const b = Math.max(from, to);
  const id = newId();
  return tokens.map((t, i) => {
    if (i < a || i > b) return t;
    if (type === null) {
      const { group: _group, ...rest } = t;
      void _group;
      return rest;
    }
    return { ...t, group: { type, id } };
  });
}

export interface GroupMarks {
  open: GroupType[][]; // i 番目の語の手前に付ける、かっこの種類
  close: GroupType[][]; // i 番目の語の後ろに付ける、かっこの種類
}

/** 同じ id の語が続いているまとまりを、かっこの開き・閉じの位置にする */
export function groupMarks(tokens: StructureToken[]): GroupMarks {
  const open: GroupType[][] = tokens.map(() => []);
  const close: GroupType[][] = tokens.map(() => []);
  let i = 0;
  while (i < tokens.length) {
    const g = tokens[i].group;
    if (!g) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < tokens.length && tokens[j + 1].group?.id === g.id) j++;
    open[i].push(g.type);
    close[j].push(g.type);
    i = j + 1;
  }
  return { open, close };
}

export const hasStructure = (s: { structure?: SentenceStructure }): boolean => Boolean(s.structure && s.structure.tokens.length > 0);

/** 品詞分解があるが、まだ人が確認していない文の数 */
export function countStructureUnreviewed(passages: Passage[]): number {
  return passages.reduce((n, p) => n + p.sentences.filter((s) => hasStructure(s) && !s.structureReviewed).length, 0);
}

export function countWithStructure(passages: Passage[]): number {
  return passages.reduce((n, p) => n + p.sentences.filter(hasStructure).length, 0);
}
