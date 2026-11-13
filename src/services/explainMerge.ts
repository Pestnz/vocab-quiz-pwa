import type { ExamSection, LocalExplainDoc, Question } from '../types/explain';
import { bySectionOrder } from './explainSections';

/**
 * 設問・大問単位のマージ(SPEC §6.7)。
 * - 重ならない編集(別々の設問・大問を、別々の端末で編集)は、そのまま統合する
 * - 同じ設問(または大問の設定、メタ情報)を両方で編集したときだけ「競合」とし、新しい方を採用する。
 *   負けた側は、呼び出し元が「競合コピー」として残す(lostLocal / lostRemote)
 * - 削除は、削除したIDの記録(deletedSectionIds / deletedItemIds)の和集合で伝える
 *   ただし、削除された側に「削除の後で編集した内容」があれば、その側も「失う側」として記録する
 * base は、最後に同期できた時点の日時(null = 未同期)。base より後に変わったものを「編集した」とみなす
 */

const ts = (iso: string | null | undefined): number => (iso ? new Date(iso).getTime() || 0 : 0);
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const edited = (updatedAt: string, base: string | null): boolean => base === null || ts(updatedAt) > ts(base);

interface Losses {
  lostLocal: boolean;
  lostRemote: boolean;
  conflicts: number;
}

type Side = 'local' | 'remote';

/** 2つのうち、採用する方。両方編集していれば新しい方(同時刻なら端末側)で、負けた側を記録する */
function pickNewer<T extends { updatedAt: string }>(l: T, r: T, base: string | null, loss: Losses): { value: T; side: Side } {
  const le = edited(l.updatedAt, base);
  const re = edited(r.updatedAt, base);
  if (le && re) {
    loss.conflicts++;
    if (ts(r.updatedAt) > ts(l.updatedAt)) {
      loss.lostLocal = true;
      return { value: r, side: 'remote' };
    }
    loss.lostRemote = true;
    return { value: l, side: 'local' };
  }
  if (le) return { value: l, side: 'local' };
  if (re) return { value: r, side: 'remote' };
  return ts(r.updatedAt) > ts(l.updatedAt) ? { value: r, side: 'remote' } : { value: l, side: 'local' };
}

function mergeQuestions(
  local: Question[],
  remote: Question[],
  deleted: Set<string>,
  base: string | null,
  loss: Losses
): Question[] {
  const lMap = new Map(local.map((q) => [q.id, q]));
  const rMap = new Map(remote.map((q) => [q.id, q]));
  const out: Question[] = [];
  for (const id of new Set([...lMap.keys(), ...rMap.keys()])) {
    const l = lMap.get(id);
    const r = rMap.get(id);
    if (deleted.has(id)) {
      // 削除された。ただし、削除の後で編集していた側の内容は、競合コピーに残す
      if (l && edited(l.updatedAt, base)) {
        loss.lostLocal = true;
        loss.conflicts++;
      }
      if (r && edited(r.updatedAt, base)) {
        loss.lostRemote = true;
        loss.conflicts++;
      }
      continue;
    }
    if (l && r) out.push(same(l, r) ? l : pickNewer(l, r, base, loss).value);
    else out.push((l ?? r) as Question);
  }
  return out.sort(bySectionOrder);
}

/** 大問の設定(番号・タイトル・種類・順序・メモ)だけを取り出す。設問の中身は含めない */
const sectionScalars = (s: ExamSection) => ({ order: s.order, number: s.number, title: s.title, kind: s.kind, note: s.note });

function mergeSection(l: ExamSection, r: ExamSection, base: string | null, loss: Losses): ExamSection {
  const deletedItems = new Set([...l.deletedItemIds, ...r.deletedItemIds]);
  // 大問の設定は、違うときだけ「編集の競合」として扱う(設問だけの編集は大問の更新日時を動かさない)
  const scalarsSame = same(sectionScalars(l), sectionScalars(r));
  const chosen = scalarsSame ? l : pickNewer(l, r, base, loss).value;
  return {
    ...chosen,
    updatedAt: ts(l.updatedAt) >= ts(r.updatedAt) ? l.updatedAt : r.updatedAt,
    deletedItemIds: [...deletedItems],
    passages: chosen.passages,
    questions: mergeQuestions(l.questions, r.questions, deletedItems, base, loss),
  };
}

export interface SectionsMerge extends Losses {
  sections: ExamSection[];
  deletedSectionIds: string[];
}

export function mergeSections(
  local: { sections: ExamSection[]; deletedSectionIds: string[] },
  remote: { sections: ExamSection[]; deletedSectionIds: string[] },
  base: string | null
): SectionsMerge {
  const loss: Losses = { lostLocal: false, lostRemote: false, conflicts: 0 };
  const deleted = new Set([...local.deletedSectionIds, ...remote.deletedSectionIds]);
  const lMap = new Map(local.sections.map((s) => [s.id, s]));
  const rMap = new Map(remote.sections.map((s) => [s.id, s]));
  const out: ExamSection[] = [];

  for (const id of new Set([...lMap.keys(), ...rMap.keys()])) {
    const l = lMap.get(id);
    const r = rMap.get(id);
    if (deleted.has(id)) {
      const hasEdits = (s: ExamSection) =>
        edited(s.updatedAt, base) || s.questions.some((q) => edited(q.updatedAt, base));
      if (l && hasEdits(l)) {
        loss.lostLocal = true;
        loss.conflicts++;
      }
      if (r && hasEdits(r)) {
        loss.lostRemote = true;
        loss.conflicts++;
      }
      continue;
    }
    out.push(l && r ? mergeSection(l, r, base, loss) : ((l ?? r) as ExamSection));
  }
  return { ...loss, sections: out.sort(bySectionOrder), deletedSectionIds: [...deleted] };
}

// ---------------- 解説全体 ----------------

type MetaPart = Pick<
  LocalExplainDoc,
  | 'title'
  | 'content'
  | 'year'
  | 'eraLabel'
  | 'prefecture'
  | 'examType'
  | 'status'
  | 'layout'
  | 'pdfKey'
  | 'pdfFileName'
  | 'pdfFileSize'
  | 'spreadRatio'
>;

const metaOf = (d: LocalExplainDoc): MetaPart => ({
  title: d.title,
  content: d.content,
  year: d.year,
  eraLabel: d.eraLabel,
  prefecture: d.prefecture,
  examType: d.examType,
  status: d.status,
  layout: d.layout,
  pdfKey: d.pdfKey,
  pdfFileName: d.pdfFileName,
  pdfFileSize: d.pdfFileSize,
  spreadRatio: d.spreadRatio,
});

export type MergedFields = MetaPart & Pick<LocalExplainDoc, 'sections' | 'deletedSectionIds' | 'metaUpdatedAt'>;

export interface DocMerge extends Losses {
  fields: MergedFields;
}

/** 端末の解説と GitHub の解説を、設問単位で合わせる。どちらも変更している場合に使う */
export function mergeDocs(local: LocalExplainDoc, remote: LocalExplainDoc, base: string | null): DocMerge {
  const loss: Losses = { lostLocal: false, lostRemote: false, conflicts: 0 };

  // メタ情報・自由記述の本文: 違い、かつ両方が編集していれば競合
  let meta: MetaPart;
  let metaStamp: string;
  if (same(metaOf(local), metaOf(remote))) {
    meta = metaOf(local);
    metaStamp = ts(local.metaUpdatedAt) >= ts(remote.metaUpdatedAt) ? local.metaUpdatedAt : remote.metaUpdatedAt;
  } else {
    const picked = pickNewer(
      { ...metaOf(local), updatedAt: local.metaUpdatedAt },
      { ...metaOf(remote), updatedAt: remote.metaUpdatedAt },
      base,
      loss
    );
    meta = metaOf(picked.side === 'local' ? local : remote);
    metaStamp = picked.value.updatedAt;
  }

  const sec = mergeSections(local, remote, base);
  return {
    conflicts: loss.conflicts + sec.conflicts,
    lostLocal: loss.lostLocal || sec.lostLocal,
    lostRemote: loss.lostRemote || sec.lostRemote,
    fields: { ...meta, sections: sec.sections, deletedSectionIds: sec.deletedSectionIds, metaUpdatedAt: metaStamp },
  };
}
