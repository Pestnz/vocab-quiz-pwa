import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { DeletedDocRecord, LocalExplainDoc, StoredPdf } from '../types/explain';
import { isExamStatus } from './explainMeta';
import { normalizeSections } from './explainSections';

interface ExplainDbSchema extends DBSchema {
  docs: {
    key: string;
    value: LocalExplainDoc;
    indexes: { 'by-updated': string };
  };
  pdfs: {
    key: string;
    value: StoredPdf;
  };
  deleted: {
    key: string;
    value: DeletedDocRecord;
  };
}

const DB_NAME = 'explain-workbench';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<ExplainDbSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<ExplainDbSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<ExplainDbSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          const docs = db.createObjectStore('docs', { keyPath: 'id' });
          docs.createIndex('by-updated', 'updatedAt');
          db.createObjectStore('pdfs', { keyPath: 'key' });
        }
        if (oldVersion < 2) {
          db.createObjectStore('deleted', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export function makePdfKey(fileName: string, fileSize: number): string {
  return `${fileName}__${fileSize}`;
}

/** この項目のどれかを変えたら「同期する内容が変わった」とみなす(表示状態は含めない) */
export const SYNCED_KEYS: ReadonlyArray<keyof LocalExplainDoc> = [
  'title',
  'content',
  'year',
  'eraLabel',
  'prefecture',
  'examType',
  'status',
  'layout',
  'pdfKey',
  'pdfFileName',
  'pdfFileSize',
  'spreadRatio',
  'sections',
  'deletedSectionIds',
];

/** SYNCED_KEYS のうち、大問(sections)以外。これを変えたら metaUpdatedAt も更新する */
export const META_KEYS: ReadonlyArray<keyof LocalExplainDoc> = SYNCED_KEYS.filter(
  (k) => k !== 'sections' && k !== 'deletedSectionIds'
);

export function createEmptyDoc(title = '無題の解説'): LocalExplainDoc {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title,
    content: null,
    year: 0,
    eraLabel: '',
    prefecture: '',
    examType: '',
    status: 'draft',
    pdfKey: null,
    pdfFileName: null,
    pdfFileSize: null,
    spreadRatio: 0.5,
    sections: [],
    deletedSectionIds: [],
    metaUpdatedAt: now,
    pdfPage: 1,
    pdfZoom: 0.8,
    spreadSide: 'off',
    splitRatio: 0.5,
    createdAt: now,
    updatedAt: now,
    syncUpdatedAt: now,
    baseUpdatedAt: null,
    remoteSha: null,
    lastSyncedAt: null,
  };
}

/** 古い形式(Phase 1・2 で保存した解説)にも、新しい項目を補って読めるようにする */
export function normalizeDoc(raw: Partial<LocalExplainDoc> & { id: string }): LocalExplainDoc {
  const base = createEmptyDoc();
  const createdAt = raw.createdAt ?? base.createdAt;
  const updatedAt = raw.updatedAt ?? createdAt;
  return {
    ...base,
    ...raw,
    title: raw.title ?? base.title,
    content: raw.content ?? null,
    year: Number.isFinite(raw.year) ? (raw.year as number) : 0,
    eraLabel: raw.eraLabel ?? '',
    prefecture: raw.prefecture ?? '',
    examType: raw.examType ?? '',
    status: isExamStatus(raw.status) ? raw.status : 'draft',
    pdfKey: raw.pdfKey ?? null,
    pdfFileName: raw.pdfFileName ?? null,
    pdfFileSize: raw.pdfFileSize ?? null,
    spreadRatio: raw.spreadRatio ?? 0.5,
    sections: normalizeSections(raw.sections),
    deletedSectionIds: Array.isArray(raw.deletedSectionIds)
      ? raw.deletedSectionIds.filter((d): d is string => typeof d === 'string')
      : [],
    createdAt,
    updatedAt,
    syncUpdatedAt: raw.syncUpdatedAt ?? updatedAt,
    metaUpdatedAt: raw.metaUpdatedAt ?? raw.syncUpdatedAt ?? updatedAt,
    baseUpdatedAt: raw.baseUpdatedAt ?? null,
    remoteSha: raw.remoteSha ?? null,
    lastSyncedAt: raw.lastSyncedAt ?? null,
  };
}

/** 更新日時の新しい順 */
export async function listDocs(): Promise<LocalExplainDoc[]> {
  const db = await getDb();
  const all = await db.getAll('docs');
  return all.map(normalizeDoc).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getDoc(id: string): Promise<LocalExplainDoc | undefined> {
  const db = await getDb();
  const raw = await db.get('docs', id);
  return raw ? normalizeDoc(raw) : undefined;
}

export async function saveDoc(doc: LocalExplainDoc): Promise<void> {
  const db = await getDb();
  await db.put('docs', doc);
}

/** この解説で使っているPDFを、他の解説が使っていなければ削除する */
async function deleteOrphanPdf(db: IDBPDatabase<ExplainDbSchema>, pdfKey: string | null): Promise<void> {
  if (!pdfKey) return;
  const others = await db.getAll('docs');
  if (!others.some((d) => d.pdfKey === pdfKey)) {
    await db.delete('pdfs', pdfKey);
  }
}

/** 端末内から消すだけ(同期では、GitHub側の削除に合わせるときに使う) */
export async function deleteDocLocalOnly(docId: string): Promise<void> {
  const db = await getDb();
  const doc = await db.get('docs', docId);
  await db.delete('docs', docId);
  await deleteOrphanPdf(db, doc?.pdfKey ?? null);
}

/** ユーザーが削除する操作。一度でも同期した解説は、GitHub側にも削除を伝えるための記録を残す */
export async function deleteDocWithTombstone(docId: string): Promise<void> {
  const db = await getDb();
  const doc = await db.get('docs', docId);
  const wasSynced = Boolean(doc && (doc.baseUpdatedAt || doc.remoteSha));
  await db.delete('docs', docId);
  await deleteOrphanPdf(db, doc?.pdfKey ?? null);
  if (wasSynced) {
    await db.put('deleted', { id: docId, deletedAt: new Date().toISOString() });
  }
}

export async function listTombstones(): Promise<DeletedDocRecord[]> {
  const db = await getDb();
  return db.getAll('deleted');
}

export async function clearTombstone(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('deleted', id);
}

export async function savePdf(file: File): Promise<StoredPdf> {
  const db = await getDb();
  const stored: StoredPdf = {
    key: makePdfKey(file.name, file.size),
    fileName: file.name,
    fileSize: file.size,
    blob: file,
    addedAt: new Date().toISOString(),
  };
  await db.put('pdfs', stored);
  return stored;
}

export async function getPdf(key: string): Promise<StoredPdf | undefined> {
  const db = await getDb();
  return db.get('pdfs', key);
}
