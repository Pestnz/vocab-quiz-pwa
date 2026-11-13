import type { ExamStatus, LocalExplainDoc } from '../types/explain';
import type { JSONContent } from '@tiptap/react';

export const STATUS_LABEL: Record<ExamStatus, string> = {
  draft: '下書き',
  writing: '作成中',
  done: '完成',
  printed: '印刷済',
};

export const STATUS_ORDER: ExamStatus[] = ['draft', 'writing', 'done', 'printed'];

export const STATUS_COLOR: Record<ExamStatus, string> = {
  draft: 'bg-slate-700 text-slate-200',
  writing: 'bg-amber-700/70 text-amber-100',
  done: 'bg-emerald-700/70 text-emerald-100',
  printed: 'bg-sky-700/70 text-sky-100',
};

export const isExamStatus = (v: unknown): v is ExamStatus =>
  v === 'draft' || v === 'writing' || v === 'done' || v === 'printed';

/** 西暦から「令和◯年度」などを作る(2019年度〜は令和、1989〜2018年度は平成) */
export function eraLabelFromYear(year: number): string {
  if (!Number.isFinite(year) || year <= 0) return '';
  if (year >= 2019) return `令和${year - 2018 === 1 ? '元' : year - 2018}年度`;
  if (year >= 1989) return `平成${year - 1988 === 1 ? '元' : year - 1988}年度`;
  return '';
}

/** 例: 「令和7年度 千葉県 本検査 英語」 */
export function suggestTitle(doc: Pick<LocalExplainDoc, 'year' | 'eraLabel' | 'prefecture' | 'examType'>): string {
  const era = doc.eraLabel || (doc.year > 0 ? `${doc.year}年度` : '');
  const pref = doc.prefecture ? (/[都道府県]$/.test(doc.prefecture) ? doc.prefecture : `${doc.prefecture}県`) : '';
  return [era, pref, doc.examType, '英語'].filter(Boolean).join(' ');
}

/** TipTap JSON から文字だけを取り出す(全文検索用) */
export function contentToText(node: JSONContent | null | undefined): string {
  if (!node) return '';
  const parts: string[] = [];
  const walk = (n: JSONContent) => {
    if (typeof n.text === 'string') parts.push(n.text);
    if (n.content) {
      for (const c of n.content) walk(c);
      parts.push('\n');
    }
  };
  walk(node);
  return parts.join('');
}
