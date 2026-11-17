import type {
  AppSettings,
} from '../types/vocab';
import type {
  DeletedDocRecord,
  ExplainFile,
  ExplainIndex,
  ExplainIndexItem,
  LocalExplainDoc,
  PdfRef,
} from '../types/explain';
import { getStoredSettings } from './storage';
import { fromBase64Utf8, toBase64Utf8 } from './githubSync';
import {
  clearTombstone,
  createEmptyDoc,
  deleteDocLocalOnly,
  listDocs,
  listTombstones,
  makePdfKey,
  normalizeDoc,
  saveDoc,
} from './explainDb';
import { isExamStatus } from './explainMeta';
import { normalizeSections } from './explainSections';
import { mergeDocs } from './explainMerge';

/**
 * 解説ファイルの GitHub 同期。
 * - 触るのは `explanations/` 配下だけ(vocab.json / diary.json / sentence_history.json には一切触れない)
 * - 1試験 = 1ファイル(explanations/{id}.json)+ 索引(explanations/index.json)
 * - 両方で変更があったときは、新しい方を採用し、古い方は「競合コピー」として残す(データを失わない)
 * - 1MBを超えるものは送らない / 1MB近い取得結果が空でも「空」とは扱わない
 */

const DIR = 'explanations';
const INDEX_PATH = `${DIR}/index.json`;
const MAX_BYTES = 1_000_000;
const WARN_BYTES = 700_000;

export interface SyncSummary {
  pushed: number;
  pulled: number;
  deleted: number;
  conflicts: number; // 同じ設問などを両方で編集した件数(競合コピーを作成)
  merged: number; // 重ならない編集を、自動で統合した件数
  warnings: string[];
  errors: string[];
}

export function isSyncConfigured(settings: AppSettings = getStoredSettings()): boolean {
  return Boolean(settings.githubToken?.trim() && settings.repoOwner?.trim() && settings.repoName?.trim());
}

// ---------------- GitHub Contents API ----------------

export class ShaMismatchError extends Error {}

export interface RemoteFile<T> {
  sha: string;
  json: T;
}

export function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token.trim()}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export function contentsUrl(s: AppSettings, path: string): string {
  return `https://api.github.com/repos/${encodeURIComponent(s.repoOwner.trim())}/${encodeURIComponent(
    s.repoName.trim()
  )}/contents/${path}`;
}

export function branchOf(s: AppSettings): string {
  return s.branch?.trim() || 'main';
}

export async function errorMessage(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { message?: string };
  return body.message || `GitHubエラー (${res.status} ${res.statusText})`;
}

/** 404 のときは null。1MB超などで中身が取れないときは、空とみなさずエラーにする */
export async function getJson<T>(s: AppSettings, path: string): Promise<RemoteFile<T> | null> {
  const url = `${contentsUrl(s, path)}?ref=${encodeURIComponent(branchOf(s))}&_t=${Date.now()}`;
  const res = await fetch(url, { method: 'GET', headers: headers(s.githubToken), cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await errorMessage(res));
  const data = (await res.json()) as { sha: string; content?: string; size?: number };
  if (!data.content) {
    if ((data.size ?? 0) > 0) {
      throw new Error(`${path} の中身を取得できませんでした(1MBを超えている可能性があります)。`);
    }
    return null; // 0バイトのファイルは「無い」と同じ扱い
  }
  return { sha: data.sha, json: JSON.parse(fromBase64Utf8(data.content)) as T };
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export async function putJson(s: AppSettings, path: string, obj: unknown, sha: string | null, message: string): Promise<string> {
  const text = JSON.stringify(obj);
  if (byteLength(text) > MAX_BYTES) {
    throw new Error(`${path} は1MBを超えるため、GitHubに送れません。画像を減らすか、分割してください。`);
  }
  const body: { message: string; content: string; branch: string; sha?: string } = {
    message,
    content: toBase64Utf8(text),
    branch: branchOf(s),
  };
  if (sha) body.sha = sha;
  const res = await fetch(contentsUrl(s, path), {
    method: 'PUT',
    headers: headers(s.githubToken),
    body: JSON.stringify(body),
  });
  if (res.status === 409 || res.status === 422) throw new ShaMismatchError(await errorMessage(res));
  if (!res.ok) throw new Error(await errorMessage(res));
  const result = (await res.json()) as { content: { sha: string } };
  return result.content.sha;
}

async function deleteRemoteFile(s: AppSettings, path: string, sha: string, message: string): Promise<void> {
  const res = await fetch(contentsUrl(s, path), {
    method: 'DELETE',
    headers: headers(s.githubToken),
    body: JSON.stringify({ message, sha, branch: branchOf(s) }),
  });
  if (res.status === 404) return; // すでに無い
  if (!res.ok) throw new Error(await errorMessage(res));
}

// ---------------- 変換 ----------------

const filePathOf = (id: string): string => `${DIR}/${id}.json`;

function docToRefs(doc: LocalExplainDoc): PdfRef[] {
  if (!doc.pdfFileName) return [];
  return [
    {
      kind: 'question',
      fileName: doc.pdfFileName,
      fileSize: doc.pdfFileSize ?? undefined,
      isSpread: doc.spreadRatio !== 0.5 ? true : undefined,
      spreadSplitRatio: doc.spreadRatio,
    },
  ];
}

/** 端末の解説 → GitHub のファイル。remote があれば、こちらが知らない項目(将来の sections など)を保つ */
export function docToFile(doc: LocalExplainDoc, remote?: Partial<ExplainFile> | null): ExplainFile {
  return {
    ...(remote ?? {}),
    schemaVersion: 1,
    id: doc.id,
    title: doc.title,
    year: doc.year,
    eraLabel: doc.eraLabel || undefined,
    prefecture: doc.prefecture,
    examType: doc.examType || undefined,
    status: doc.status,
    pdfRefs: docToRefs(doc),
    content: doc.content,
    layout: doc.layout,
    sections: doc.sections,
    deletedSectionIds: doc.deletedSectionIds,
    createdAt: doc.createdAt,
    updatedAt: doc.syncUpdatedAt,
    metaUpdatedAt: doc.metaUpdatedAt,
  };
}

/** GitHub のファイル → 端末の解説。existing があれば、端末ごとの表示状態(ページ位置など)は保つ */
export function fileToDoc(file: ExplainFile, sha: string, existing?: LocalExplainDoc): LocalExplainDoc {
  const ref = file.pdfRefs?.find((r) => r.kind === 'question');
  const now = new Date().toISOString();
  const base = existing ?? createEmptyDoc();
  return normalizeDoc({
    ...base,
    id: file.id,
    title: file.title ?? '',
    content: file.content ?? null,
    year: file.year ?? 0,
    eraLabel: file.eraLabel ?? '',
    prefecture: file.prefecture ?? '',
    examType: file.examType ?? '',
    status: isExamStatus(file.status) ? file.status : 'draft',
    layout: file.layout,
    pdfKey: ref ? makePdfKey(ref.fileName, ref.fileSize ?? 0) : null,
    pdfFileName: ref?.fileName ?? null,
    pdfFileSize: ref?.fileSize ?? null,
    spreadRatio: ref?.spreadSplitRatio ?? 0.5,
    sections: normalizeSections(file.sections),
    deletedSectionIds: Array.isArray(file.deletedSectionIds) ? file.deletedSectionIds : [],
    createdAt: file.createdAt,
    updatedAt: now,
    syncUpdatedAt: file.updatedAt,
    metaUpdatedAt: file.metaUpdatedAt ?? file.updatedAt,
    baseUpdatedAt: file.updatedAt,
    remoteSha: sha,
    lastSyncedAt: now,
  });
}

function docToIndexItem(doc: LocalExplainDoc): ExplainIndexItem {
  return {
    id: doc.id,
    title: doc.title,
    year: doc.year,
    eraLabel: doc.eraLabel || undefined,
    prefecture: doc.prefecture,
    examType: doc.examType || undefined,
    status: doc.status,
    updatedAt: doc.syncUpdatedAt,
    path: filePathOf(doc.id),
  };
}

const ts = (iso: string | null | undefined): number => (iso ? new Date(iso).getTime() || 0 : 0);

function normalizeIndex(raw: Partial<ExplainIndex> | null | undefined): ExplainIndex {
  return {
    schemaVersion: 1,
    items: Array.isArray(raw?.items) ? raw.items.filter((i) => i && typeof i.id === 'string') : [],
    deletedIds: Array.isArray(raw?.deletedIds) ? raw.deletedIds.filter((d) => d && typeof d.id === 'string') : [],
    updatedAt: raw?.updatedAt ?? new Date(0).toISOString(),
  };
}

/** 索引の2つのバージョンを合わせる(項目は新しい方、削除記録は和集合。削除より新しい更新は残す) */
export function mergeIndex(a: ExplainIndex, b: ExplainIndex): ExplainIndex {
  const items = new Map<string, ExplainIndexItem>();
  for (const it of [...a.items, ...b.items]) {
    const cur = items.get(it.id);
    if (!cur || ts(it.updatedAt) >= ts(cur.updatedAt)) items.set(it.id, it);
  }
  const tombs = new Map<string, DeletedDocRecord>();
  for (const t of [...a.deletedIds, ...b.deletedIds]) {
    const cur = tombs.get(t.id);
    if (!cur || ts(t.deletedAt) >= ts(cur.deletedAt)) tombs.set(t.id, t);
  }
  for (const [id, t] of tombs) {
    const it = items.get(id);
    if (it) {
      if (ts(t.deletedAt) >= ts(it.updatedAt)) items.delete(id);
      else tombs.delete(id); // 削除より後に更新されている → 復活させる
    }
  }
  return {
    schemaVersion: 1,
    items: [...items.values()].sort((x, y) => y.updatedAt.localeCompare(x.updatedAt)),
    deletedIds: [...tombs.values()],
    updatedAt: new Date().toISOString(),
  };
}

export function conflictCopyOf(doc: LocalExplainDoc, label: string): LocalExplainDoc {
  const now = new Date().toISOString();
  const stamp = new Date().toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return normalizeDoc({
    ...doc,
    id: crypto.randomUUID(),
    title: `${doc.title || '無題'} (競合コピー・${label} ${stamp})`,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    syncUpdatedAt: now,
    baseUpdatedAt: null,
    remoteSha: null,
    lastSyncedAt: null,
  });
}

// ---------------- 同期本体 ----------------

export async function syncExplanations(): Promise<SyncSummary> {
  const settings = getStoredSettings();
  if (!isSyncConfigured(settings)) {
    throw new Error('GitHub設定(トークン・所有者・リポジトリ名)が未完了です。設定画面で入力してください。');
  }

  const summary: SyncSummary = { pushed: 0, pulled: 0, deleted: 0, conflicts: 0, merged: 0, warnings: [], errors: [] };

  const remoteIdx = await getJson<Partial<ExplainIndex>>(settings, INDEX_PATH);
  const remoteIndex = normalizeIndex(remoteIdx?.json);
  const localDocs = await listDocs();
  const localTombs = await listTombstones();

  const localById = new Map(localDocs.map((d) => [d.id, d]));
  const remoteItems = new Map(remoteIndex.items.map((i) => [i.id, i]));
  const remoteTombs = new Map(remoteIndex.deletedIds.map((t) => [t.id, t]));

  // 新しい索引(これを組み立てて、最後にまとめて送る)
  const nextItems = new Map(remoteItems);
  const nextTombs = new Map(remoteTombs);
  const clearedLocalTombs: string[] = [];

  // 1. 端末で削除したものを、GitHub 側にも伝える
  for (const t of localTombs) {
    try {
      const item = remoteItems.get(t.id);
      if (item && ts(item.updatedAt) > ts(t.deletedAt)) {
        // 削除したあとに、別の端末で更新されている → 削除せず、あとで取り込む
        clearedLocalTombs.push(t.id);
        continue;
      }
      const file = await getJson<ExplainFile>(settings, filePathOf(t.id));
      if (file) await deleteRemoteFile(settings, filePathOf(t.id), file.sha, `delete: explanation ${t.id}`);
      nextItems.delete(t.id);
      nextTombs.set(t.id, t);
      clearedLocalTombs.push(t.id);
      summary.deleted++;
    } catch (e) {
      summary.errors.push(`削除の反映に失敗: ${(e as Error).message}`);
    }
  }

  // 2. 他の端末で削除されたものを、この端末からも消す(削除後に編集していれば残す)
  for (const [id, t] of remoteTombs) {
    const local = localById.get(id);
    if (!local || nextTombs.get(id) !== t) continue;
    if (ts(local.syncUpdatedAt) <= ts(t.deletedAt)) {
      await deleteDocLocalOnly(id);
      localById.delete(id);
      summary.deleted++;
    } else {
      nextTombs.delete(id); // 削除後に編集された → 復活させる(4 で端末側から送る)
      remoteItems.delete(id);
      nextItems.delete(id);
    }
  }

  // 3. 索引にあるものを、端末と突き合わせる
  for (const item of remoteItems.values()) {
    if (nextTombs.has(item.id) && !localById.has(item.id)) continue;
    const local = localById.get(item.id);
    try {
      if (!local) {
        const file = await getJson<ExplainFile>(settings, item.path || filePathOf(item.id));
        if (!file) {
          nextItems.delete(item.id); // 索引だけ残っていて、ファイルが無い
          continue;
        }
        await saveDoc(fileToDoc(file.json, file.sha));
        summary.pulled++;
        continue;
      }

      const base = local.baseUpdatedAt;
      const L = local.syncUpdatedAt;
      const R = item.updatedAt;
      const localChanged = base === null || ts(L) > ts(base);
      const remoteChanged = base === null || ts(R) !== ts(base);

      if (!localChanged && !remoteChanged) continue;
      if (ts(L) === ts(R)) {
        // 中身は同じ時点。記録だけ合わせる
        await saveDoc({ ...local, baseUpdatedAt: R, lastSyncedAt: new Date().toISOString() });
        continue;
      }
      if (!localChanged && remoteChanged) {
        const file = await getJson<ExplainFile>(settings, item.path || filePathOf(item.id));
        if (file) {
          await saveDoc(fileToDoc(file.json, file.sha, local));
          summary.pulled++;
        }
        continue;
      }
      if (localChanged && !remoteChanged) {
        await pushDoc(settings, local, summary, nextItems);
        continue;
      }

      // 両方で変更 → 設問・大問の単位で統合する。重なる編集(同じ設問など)だけが競合で、
      // 新しい方を採用し、負けた側の内容は「競合コピー」として別の解説に残す
      const file = await getJson<ExplainFile>(settings, item.path || filePathOf(item.id));
      if (!file) {
        await pushDoc(settings, local, summary, nextItems);
        continue;
      }
      const remoteDoc = fileToDoc(file.json, file.sha);
      const merge = mergeDocs(local, remoteDoc, base);
      if (merge.lostLocal) await saveDoc(conflictCopyOf(local, '端末側'));
      if (merge.lostRemote) await saveDoc(conflictCopyOf(remoteDoc, 'GitHub側'));
      if (merge.conflicts > 0) summary.conflicts++;
      else summary.merged++;
      // 統合した結果は、どちらよりも新しい版として GitHub に送る
      const stamp = new Date(Math.max(Date.now(), ts(R) + 1, ts(L) + 1)).toISOString();
      await pushDoc(settings, { ...local, ...merge.fields, updatedAt: stamp, syncUpdatedAt: stamp }, summary, nextItems, file);
    } catch (e) {
      summary.errors.push(`「${local?.title || item.title || item.id}」の同期に失敗: ${(e as Error).message}`);
    }
  }

  // 4. 端末にしかないもの(新規・競合コピー・復活)を GitHub へ送る
  const afterDocs = await listDocs();
  for (const doc of afterDocs) {
    if (remoteItems.has(doc.id) && !remoteTombs.has(doc.id)) continue; // 3 で処理済み
    if (nextTombs.has(doc.id)) continue;
    if (doc.baseUpdatedAt !== null && ts(doc.baseUpdatedAt) === ts(doc.syncUpdatedAt) && nextItems.has(doc.id)) continue;
    try {
      await pushDoc(settings, doc, summary, nextItems);
    } catch (e) {
      summary.errors.push(`「${doc.title || doc.id}」の送信に失敗: ${(e as Error).message}`);
    }
  }

  // 5. 索引を送る(他の端末と同時だった場合は、取り直して合わせてから再送)
  let desired: ExplainIndex = {
    schemaVersion: 1,
    items: [...nextItems.values()].sort((x, y) => y.updatedAt.localeCompare(x.updatedAt)),
    deletedIds: [...nextTombs.values()],
    updatedAt: new Date().toISOString(),
  };
  desired = mergeIndex(desired, { ...desired, items: [], deletedIds: [] }); // 削除と更新の整合を取る
  const nothingToWrite = !remoteIdx && desired.items.length === 0 && desired.deletedIds.length === 0;
  const changed =
    !nothingToWrite &&
    (!remoteIdx || JSON.stringify({ i: desired.items, d: desired.deletedIds }) !== JSON.stringify({ i: remoteIndex.items, d: remoteIndex.deletedIds }));
  if (changed) {
    let sha = remoteIdx?.sha ?? null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await putJson(settings, INDEX_PATH, desired, sha, 'sync: explanations index');
        break;
      } catch (e) {
        if (!(e instanceof ShaMismatchError) || attempt === 2) {
          summary.errors.push(`索引の更新に失敗: ${(e as Error).message}`);
          break;
        }
        const latest = await getJson<Partial<ExplainIndex>>(settings, INDEX_PATH);
        sha = latest?.sha ?? null;
        desired = mergeIndex(desired, normalizeIndex(latest?.json));
      }
    }
  }

  if (summary.errors.length === 0) {
    for (const id of clearedLocalTombs) await clearTombstone(id);
  }
  return summary;
}

/** 1件の解説を GitHub に書く(既存のファイルがあれば、その中の未知の項目を保つ) */
async function pushDoc(
  settings: AppSettings,
  doc: LocalExplainDoc,
  summary: SyncSummary,
  nextItems: Map<string, ExplainIndexItem>,
  knownRemote?: RemoteFile<ExplainFile>
): Promise<void> {
  let remote: RemoteFile<ExplainFile> | null = knownRemote ?? null;
  if (!remote) remote = await getJson<ExplainFile>(settings, filePathOf(doc.id));

  const bytes = byteLength(JSON.stringify(docToFile(doc, remote?.json)));
  if (bytes > MAX_BYTES) {
    throw new Error(`1MBを超えるため、GitHubに送れません(約${Math.round(bytes / 1024)}KB)。画像を減らすか、分割してください。`);
  }
  if (bytes > WARN_BYTES) {
    summary.warnings.push(`「${doc.title || '無題'}」が約${Math.round(bytes / 1024)}KBになっています。1MBを超える前に、画像の圧縮や分割を検討してください。`);
  }

  let sha: string;
  try {
    sha = await putJson(settings, filePathOf(doc.id), docToFile(doc, remote?.json), remote?.sha ?? null, `sync: explanation ${doc.id}`);
  } catch (e) {
    if (!(e instanceof ShaMismatchError)) throw e;
    // 直前に他の端末が書き込んだ。取り直して、1回だけやり直す
    const latest = await getJson<ExplainFile>(settings, filePathOf(doc.id));
    sha = await putJson(settings, filePathOf(doc.id), docToFile(doc, latest?.json), latest?.sha ?? null, `sync: explanation ${doc.id}`);
  }

  await saveDoc({ ...doc, baseUpdatedAt: doc.syncUpdatedAt, remoteSha: sha, lastSyncedAt: new Date().toISOString() });
  nextItems.set(doc.id, docToIndexItem(doc));
  summary.pushed++;
}
