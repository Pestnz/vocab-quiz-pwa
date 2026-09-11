import React from 'react';
import { BookOpen, SearchX } from 'lucide-react';
import type { VocabItem } from '../../types/vocab';
import { VocabItemCard } from './VocabItemCard';
import { Pagination } from './Pagination';

interface VocabListProps {
  items: VocabItem[];
  totalFilteredCount: number;
  totalDatabaseCount: number;
  currentPage: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onEdit: (item: VocabItem) => void;
  onDelete: (id: string) => void;
  onOpenSettings: () => void;
}

export const VocabList: React.FC<VocabListProps> = ({
  items,
  totalFilteredCount,
  totalDatabaseCount,
  currentPage,
  totalPages,
  pageSize,
  onPageChange,
  onEdit,
  onDelete,
}) => {
  if (totalDatabaseCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center text-slate-400 space-y-3">
        <div className="w-14 h-14 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-300 shadow-inner">
          <BookOpen className="w-7 h-7" />
        </div>
        <div>
          <p className="font-semibold text-sm sm:text-base text-slate-200">単語がまだ登録されていません</p>
          <p className="text-xs text-slate-400 mt-1.5 max-w-sm leading-relaxed">
            入力欄に覚えたい英単語・ポルトガル語フレーズ、または日本語の言いたいことを入力して登録してみましょう。Geminiが自動で意味や例文を補完します。
          </p>
        </div>
      </div>
    );
  }

  if (totalFilteredCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center text-slate-400 space-y-2">
        <SearchX className="w-8 h-8 text-slate-400" />
        <p className="text-xs sm:text-sm text-slate-300 font-medium">条件に一致する単語が見つかりませんでした</p>
        <p className="text-[11px] text-slate-400">フィルター条件や検索キーワードを変更してみてください。</p>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 space-y-3">
      <div className="text-[11px] text-slate-400 px-1 flex justify-between items-center">
        <span>全 <span className="text-slate-200 font-bold">{totalFilteredCount}</span> 件中、{items.length} 件を表示</span>
        {totalPages > 1 && (
          <span className="font-mono text-[10px] text-slate-400">{currentPage} / {totalPages} ページ</span>
        )}
      </div>

      {/* スマホは1カラム、タブレット・PCでは2〜3カラムのレスポンシブグリッド */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">
        {items.map(item => (
          <VocabItemCard
            key={item.id}
            item={item}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>

      {/* ページネーション */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalFilteredCount}
        pageSize={pageSize}
        onPageChange={onPageChange}
      />
    </div>
  );
};
