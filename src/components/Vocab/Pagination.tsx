import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}) => {
  if (totalPages <= 1) return null;

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between px-3 py-3 mt-2 border-t border-slate-800 text-xs text-slate-300">
      <div className="text-[11px] text-slate-400 font-medium">
        <span>{startItem}〜{endItem} 件</span>
        <span className="text-slate-400 mx-1">/</span>
        <span>全 {totalItems} 件</span>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 transition-colors cursor-pointer flex items-center gap-1"
          title="前のページへ"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="hidden sm:inline text-[11px]">前へ</span>
        </button>

        <span className="px-2.5 py-1 rounded-lg bg-slate-850 border border-slate-800 font-mono text-[11px] text-slate-200 font-medium">
          {currentPage} / {totalPages}
        </span>

        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300 transition-colors cursor-pointer flex items-center gap-1"
          title="次のページへ"
        >
          <span className="hidden sm:inline text-[11px]">次へ</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
