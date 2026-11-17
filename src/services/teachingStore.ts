import type { PracticeAttempt, PracticeMonthFile } from '../types/teaching';

/**
 * 質問応対練習の保存(この端末)。月ごとに別キーで持つ(GitHub のファイル分割と合わせるため)。
 * 単語帳・日記・作文の保存キーとは完全に別。
 */

const MONTH_KEY_PREFIX = 'teaching_practice_month_';
const INDEX_KEY = 'teaching_practice_months';
const SHA_PREFIX = 'teaching_practice_sha_';

export const monthOf = (iso: string): string => {
  const d = new Date(iso);
  const t = Number.isNaN(d.getTime()) ? new Date() : d;
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
};

export const isMonthKey = (s: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error('Failed to save teaching practice', e);
    return false;
  }
}

export function listMonths(): string[] {
  const list = readJson<string[]>(INDEX_KEY);
  return Array.isArray(list) ? list.filter(isMonthKey).sort() : [];
}

function addMonth(month: string): void {
  const months = new Set(listMonths());
  months.add(month);
  writeJson(INDEX_KEY, [...months].sort());
}

export function emptyMonth(month: string): PracticeMonthFile {
  return { version: 1, month, attempts: [], deletedIds: [] };
}

export function normalizeMonthFile(raw: unknown, month: string): PracticeMonthFile {
  const r = (raw ?? {}) as Partial<PracticeMonthFile>;
  const attempts = Array.isArray(r.attempts)
    ? r.attempts.filter((a): a is PracticeAttempt => Boolean(a) && typeof a.id === 'string' && typeof a.question === 'string')
    : [];
  const deletedIds = Array.isArray(r.deletedIds) ? r.deletedIds.filter((x): x is string => typeof x === 'string') : [];
  return { version: 1, month, attempts, deletedIds };
}

export function loadMonth(month: string): PracticeMonthFile {
  return normalizeMonthFile(readJson(MONTH_KEY_PREFIX + month), month);
}

export function saveMonth(file: PracticeMonthFile): boolean {
  const ok = writeJson(MONTH_KEY_PREFIX + file.month, file);
  if (ok) addMonth(file.month);
  return ok;
}

export const getMonthSha = (month: string): string | null => {
  try {
    return localStorage.getItem(SHA_PREFIX + month);
  } catch {
    return null;
  }
};

export const setMonthSha = (month: string, sha: string | null): void => {
  try {
    if (sha) localStorage.setItem(SHA_PREFIX + month, sha);
    else localStorage.removeItem(SHA_PREFIX + month);
  } catch {
    /* 保存できなくても同期は続けられる(次回は取得し直す) */
  }
};

/** 全期間の記録(新しい順) */
export function loadAllAttempts(): PracticeAttempt[] {
  return listMonths()
    .flatMap((m) => loadMonth(m).attempts)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** 記録を追加・更新する(同じ id なら置き換え)。updatedAt は呼び出し側で更新しておく */
export function upsertAttempt(attempt: PracticeAttempt): boolean {
  const month = monthOf(attempt.createdAt);
  const file = loadMonth(month);
  const rest = file.attempts.filter((a) => a.id !== attempt.id);
  return saveMonth({ ...file, attempts: [attempt, ...rest], deletedIds: file.deletedIds.filter((id) => id !== attempt.id) });
}

export function deleteAttempt(attempt: PracticeAttempt): boolean {
  const month = monthOf(attempt.createdAt);
  const file = loadMonth(month);
  return saveMonth({
    ...file,
    attempts: file.attempts.filter((a) => a.id !== attempt.id),
    deletedIds: [attempt.id, ...file.deletedIds.filter((id) => id !== attempt.id)].slice(0, 500),
  });
}

/** 2つの月ファイルを統合する。同じ id は updatedAt が新しい方、削除記録は両方の和集合 */
export function mergeMonthFiles(a: PracticeMonthFile, b: PracticeMonthFile): PracticeMonthFile {
  const deleted = new Set([...a.deletedIds, ...b.deletedIds]);
  const map = new Map<string, PracticeAttempt>();
  for (const x of [...b.attempts, ...a.attempts]) {
    if (deleted.has(x.id)) continue;
    const cur = map.get(x.id);
    if (!cur || (x.updatedAt ?? '') >= (cur.updatedAt ?? '')) map.set(x.id, x);
  }
  const attempts = [...map.values()].sort((p, q) => q.createdAt.localeCompare(p.createdAt));
  return { version: 1, month: a.month, attempts, deletedIds: [...deleted].slice(0, 500) };
}

/** 内容が同じか(同期で、無駄な保存を避けるため) */
export function sameMonthFile(a: PracticeMonthFile, b: PracticeMonthFile): boolean {
  const canon = (f: PracticeMonthFile) =>
    JSON.stringify({
      attempts: [...f.attempts].sort((p, q) => p.id.localeCompare(q.id)),
      deletedIds: [...f.deletedIds].sort(),
    });
  return canon(a) === canon(b);
}

// ---------------- 1日の進み具合(Step 2 の目標表示でも使う) ----------------

export const localDateKey = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 今日(この端末の日付)に、答えまで記録した数 */
export function countAnsweredOn(attempts: PracticeAttempt[], dateKey: string): number {
  return attempts.filter((a) => a.answer.trim() && localDateKey(new Date(a.createdAt)) === dateKey).length;
}
