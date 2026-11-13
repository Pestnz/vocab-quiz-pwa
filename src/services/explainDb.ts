import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { LocalExplainDoc, StoredPdf } from '../types/explain';

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
}

const DB_NAME = 'explain-workbench';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<ExplainDbSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<ExplainDbSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<ExplainDbSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const docs = db.createObjectStore('docs', { keyPath: 'id' });
        docs.createIndex('by-updated', 'updatedAt');
        db.createObjectStore('pdfs', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
}

export function makePdfKey(fileName: string, fileSize: number): string {
  return `${fileName}__${fileSize}`;
}

export function createEmptyDoc(title = '無題の解説'): LocalExplainDoc {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title,
    content: null,
    pdfKey: null,
    pdfFileName: null,
    pdfFileSize: null,
    pdfPage: 1,
    pdfZoom: 0.8,
    spreadSide: 'off',
    spreadRatio: 0.5,
    splitRatio: 0.5,
    createdAt: now,
    updatedAt: now,
  };
}

/** 更新日時の新しい順 */
export async function listDocs(): Promise<LocalExplainDoc[]> {
  const db = await getDb();
  const all = await db.getAll('docs');
  return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveDoc(doc: LocalExplainDoc): Promise<void> {
  const db = await getDb();
  await db.put('docs', doc);
}

export async function deleteDocAndOrphanPdf(docId: string): Promise<void> {
  const db = await getDb();
  const doc = await db.get('docs', docId);
  await db.delete('docs', docId);
  if (doc?.pdfKey) {
    const others = await db.getAll('docs');
    if (!others.some((d) => d.pdfKey === doc.pdfKey)) {
      await db.delete('pdfs', doc.pdfKey);
    }
  }
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
