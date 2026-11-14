import React, { useMemo, useState } from 'react';
import { Search, Copy, Trash2, FilePlus2, FileUp, CloudOff, CloudUpload, Cloud } from 'lucide-react';
import type { ExamStatus, LocalExplainDoc } from '../../types/explain';
import { STATUS_COLOR, STATUS_LABEL, STATUS_ORDER, contentToText } from '../../services/explainMeta';
import { sectionsToText } from '../../services/explainSections';

interface ExplainLibraryProps {
  docs: LocalExplainDoc[];
  currentId: string | null;
  syncConfigured: boolean;
  onOpen: (doc: LocalExplainDoc) => void;
  onNew: () => void;
  onNewFromPdf: () => void;
  /** 最近開いたPDF(デスクトップ版のみ。空なら表示しない) */
  recentPdfs?: { name: string; path: string; openedAt: string }[];
  onOpenRecent?: (path: string) => void;
  onDuplicate: (doc: LocalExplainDoc) => void;
  onDelete: (doc: LocalExplainDoc) => void;
}

type SortKey = 'updated' | 'year';

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '-'
    : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export const ExplainLibrary: React.FC<ExplainLibraryProps> = ({
  docs,
  currentId,
  syncConfigured,
  onOpen,
  onNew,
  onNewFromPdf,
  recentPdfs,
  onOpenRecent,
  onDuplicate,
  onDelete,
}) => {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<ExamStatus | 'all'>('all');
  const [sort, setSort] = useState<SortKey>('updated');

  // 全文検索用に、本文の文字を取り出しておく(解説が変わったときだけ作り直す)
  const searchable = useMemo(
    () =>
      docs.map((d) => ({
        doc: d,
        haystack: [d.title, d.eraLabel, String(d.year || ''), d.prefecture, d.examType, contentToText(d.content), sectionsToText(d.sections)]
          .join('\n')
          .toLowerCase(),
      })),
    [docs]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = searchable
      .filter((r) => (status === 'all' ? true : r.doc.status === status))
      .filter((r) => (q ? r.haystack.includes(q) : true))
      .map((r) => r.doc);
    return filtered.sort((a, b) =>
      sort === 'year' ? b.year - a.year || b.updatedAt.localeCompare(a.updatedAt) : b.updatedAt.localeCompare(a.updatedAt)
    );
  }, [searchable, query, status, sort]);

  const syncBadge = (d: LocalExplainDoc) => {
    if (!syncConfigured) {
      return (
        <span title="GitHub未設定" className="text-slate-600">
          <CloudOff className="w-4 h-4" />
        </span>
      );
    }
    const dirty = d.baseUpdatedAt === null || d.baseUpdatedAt !== d.syncUpdatedAt;
    return dirty ? (
      <span title="未同期の変更があります" className="text-amber-400">
        <CloudUpload className="w-4 h-4" />
      </span>
    ) : (
      <span title="同期済み" className="text-emerald-400">
        <Cloud className="w-4 h-4" />
      </span>
    );
  };

  const btn =
    'flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer';

  return (
    <div className="flex-1 min-h-0 overflow-auto p-4">
      <div className="max-w-5xl mx-auto space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-bold text-slate-100 mr-2">解説ライブラリ</h2>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="年度・県・タイトル・解説の本文で検索"
              className="w-full bg-slate-800 border border-slate-700 rounded-md pl-8 pr-2 py-1.5 text-xs text-slate-100"
              aria-label="解説を検索"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ExamStatus | 'all')}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-md px-2 py-1.5"
            aria-label="状態で絞り込む"
          >
            <option value="all">すべての状態</option>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-md px-2 py-1.5"
            aria-label="並び順"
          >
            <option value="updated">更新が新しい順</option>
            <option value="year">年度が新しい順</option>
          </select>
          <button className={btn} onClick={onNew}>
            <FilePlus2 className="w-3.5 h-3.5" />
            新しい解説
          </button>
          <button className={btn} onClick={onNewFromPdf}>
            <FileUp className="w-3.5 h-3.5" />
            PDFから始める
          </button>
        </div>

        {recentPdfs && recentPdfs.length > 0 && onOpenRecent && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-slate-400 mr-1">最近開いたPDF:</span>
            {recentPdfs.slice(0, 8).map((r) => (
              <button
                key={r.path}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 cursor-pointer max-w-[240px] truncate"
                title={`${r.path}\n(押すと、このPDFから新しい解説を始めます)`}
                onClick={() => onOpenRecent(r.path)}
              >
                {r.name}
              </button>
            ))}
          </div>
        )}

        {docs.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400 space-y-2">
            <p>解説がまだありません。</p>
            <p className="text-[11px] text-slate-500">
              「新しい解説」または「PDFから始める」で作成できます。GitHub同期を設定すると、他のブラウザの解説もここに表示されます。
            </p>
          </div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">条件に合う解説がありません。</p>
        ) : (
          <div className="rounded-lg border border-slate-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-900 text-slate-400">
                <tr>
                  <th className="text-left font-medium px-3 py-2">タイトル</th>
                  <th className="text-left font-medium px-2 py-2 whitespace-nowrap">年度</th>
                  <th className="text-left font-medium px-2 py-2 whitespace-nowrap">県</th>
                  <th className="text-left font-medium px-2 py-2 whitespace-nowrap">区分</th>
                  <th className="text-left font-medium px-2 py-2 whitespace-nowrap">状態</th>
                  <th className="text-left font-medium px-2 py-2 whitespace-nowrap">更新</th>
                  <th className="px-2 py-2" aria-label="同期" />
                  <th className="px-2 py-2" aria-label="操作" />
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => onOpen(d)}
                    className={`border-t border-slate-800 cursor-pointer hover:bg-slate-800/60 ${
                      d.id === currentId ? 'bg-slate-800/40' : ''
                    }`}
                  >
                    <td className="px-3 py-2 text-slate-100 font-medium">{d.title || '(無題)'}</td>
                    <td className="px-2 py-2 text-slate-300 whitespace-nowrap">{d.eraLabel || (d.year ? `${d.year}` : '-')}</td>
                    <td className="px-2 py-2 text-slate-300 whitespace-nowrap">{d.prefecture || '-'}</td>
                    <td className="px-2 py-2 text-slate-300 whitespace-nowrap">{d.examType || '-'}</td>
                    <td className="px-2 py-2 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] ${STATUS_COLOR[d.status]}`}>{STATUS_LABEL[d.status]}</span>
                    </td>
                    <td className="px-2 py-2 text-slate-400 whitespace-nowrap font-mono">{fmtDate(d.updatedAt)}</td>
                    <td className="px-2 py-2">{syncBadge(d)}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        title="複製(次年度の準備用)"
                        onClick={() => onDuplicate(d)}
                        className="p-1.5 rounded-md text-slate-400 hover:text-slate-100 hover:bg-slate-700 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        title="削除"
                        onClick={() => onDelete(d)}
                        className="p-1.5 rounded-md text-slate-400 hover:text-rose-300 hover:bg-rose-900/50 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
