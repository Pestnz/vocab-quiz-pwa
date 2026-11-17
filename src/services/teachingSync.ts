import type { PracticeMonthFile } from '../types/teaching';
import { getStoredSettings } from './storage';
import {
  ShaMismatchError,
  contentsUrl,
  branchOf,
  errorMessage,
  getJson,
  headers,
  isSyncConfigured,
  putJson,
} from './explanationSync';
import {
  emptyMonth,
  isMonthKey,
  listMonths,
  loadMonth,
  mergeMonthFiles,
  normalizeMonthFile,
  sameMonthFile,
  saveMonth,
  setMonthSha,
} from './teachingStore';

/**
 * 質問応対練習の GitHub 同期。
 * - 触るのは `teaching_practice/` 配下だけ(vocab.json / diary.json / sentence_history.json / explanations/ には触れない)
 * - 月ごとに 1ファイル(teaching_practice/YYYY-MM.json)。小さく保ち、1MB制限に当たらないようにする
 * - 同じ記録は updatedAt が新しい方、削除は記録(deletedIds)で伝える。どちらも消えない方向で統合する
 */

const DIR = 'teaching_practice';

export interface TeachingSyncSummary {
  pushed: number;
  pulled: number;
  errors: string[];
}

async function listRemoteMonths(): Promise<string[]> {
  const s = getStoredSettings();
  const url = `${contentsUrl(s, DIR)}?ref=${encodeURIComponent(branchOf(s))}&_t=${Date.now()}`;
  const res = await fetch(url, { method: 'GET', headers: headers(s.githubToken), cache: 'no-store' });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(await errorMessage(res));
  const data = (await res.json()) as Array<{ name?: string; type?: string }>;
  if (!Array.isArray(data)) return [];
  return data
    .filter((f) => f.type === 'file' && typeof f.name === 'string' && f.name.endsWith('.json'))
    .map((f) => (f.name as string).replace(/\.json$/, ''))
    .filter(isMonthKey);
}

async function syncMonth(month: string): Promise<{ pushed: boolean; pulled: boolean }> {
  const s = getStoredSettings();
  const path = `${DIR}/${month}.json`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const remote = await getJson<PracticeMonthFile>(s, path);
    const remoteFile = remote ? normalizeMonthFile(remote.json, month) : emptyMonth(month);
    const local = loadMonth(month);
    const merged = mergeMonthFiles(local, remoteFile);

    const pulled = !sameMonthFile(merged, local);
    if (pulled) saveMonth(merged);

    const nothing = merged.attempts.length === 0 && merged.deletedIds.length === 0;
    const needPush = !nothing && (!remote || !sameMonthFile(merged, remoteFile));
    if (!needPush) {
      setMonthSha(month, remote?.sha ?? null);
      return { pushed: false, pulled };
    }
    try {
      const sha = await putJson(s, path, merged, remote?.sha ?? null, `teaching practice ${month}`);
      setMonthSha(month, sha);
      return { pushed: true, pulled };
    } catch (e) {
      if (e instanceof ShaMismatchError && attempt === 0) continue; // 別端末が先に保存した → 取り直して統合し直す
      throw e;
    }
  }
  return { pushed: false, pulled: false };
}

export async function syncTeaching(): Promise<TeachingSyncSummary> {
  const summary: TeachingSyncSummary = { pushed: 0, pulled: 0, errors: [] };
  if (!isSyncConfigured()) return summary;
  let remoteMonths: string[] = [];
  try {
    remoteMonths = await listRemoteMonths();
  } catch (e) {
    summary.errors.push((e as Error).message);
    return summary;
  }
  const months = [...new Set([...listMonths(), ...remoteMonths])].sort();
  for (const m of months) {
    try {
      const r = await syncMonth(m);
      if (r.pushed) summary.pushed++;
      if (r.pulled) summary.pulled++;
    } catch (e) {
      summary.errors.push(`${m}: ${(e as Error).message}`);
    }
  }
  return summary;
}
