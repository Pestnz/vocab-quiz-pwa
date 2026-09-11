import React from 'react';
import { Search, X } from 'lucide-react';
import type { FilterLanguage, FilterType } from '../../types/vocab';

interface VocabFilterProps {
  language: FilterLanguage;
  onLanguageChange: (lang: FilterLanguage) => void;
  type: FilterType;
  onTypeChange: (type: FilterType) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const VocabFilter: React.FC<VocabFilterProps> = ({
  language,
  onLanguageChange,
  type,
  onTypeChange,
  searchQuery,
  onSearchChange,
}) => {
  return (
    <div className="bg-slate-900/90 md:bg-slate-850 px-3 py-2.5 md:p-3.5 border-b md:border md:rounded-xl border-slate-800 space-y-2">
      {/* 検索バー */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="単語・意味・例文を検索..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          className="w-full bg-slate-800/80 border border-slate-700/70 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-100 placeholder-slate-400 focus:outline-hidden focus:border-emerald-500"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* フィルタボタン群 */}
      <div className="flex flex-col sm:flex-row md:flex-col gap-2 text-[11px]">
        {/* 言語フィルタ */}
        <div>
          <div className="text-[10px] text-slate-400 mb-1 hidden md:block font-medium">言語</div>
          <div className="flex bg-slate-800/60 p-0.5 rounded-lg border border-slate-700/50">
            {(['all', 'en', 'pt'] as FilterLanguage[]).map(lang => (
              <button
                key={lang}
                onClick={() => onLanguageChange(lang)}
                className={`flex-1 py-1 rounded-md text-[11px] font-medium uppercase transition-colors text-center cursor-pointer ${
                  language === lang
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {lang === 'all' ? 'All' : lang}
              </button>
            ))}
          </div>
        </div>

        {/* 種別フィルタ */}
        <div>
          <div className="text-[10px] text-slate-400 mb-1 hidden md:block font-medium">形式</div>
          <div className="flex bg-slate-800/60 p-0.5 rounded-lg border border-slate-700/50">
            {(['all', 'word', 'phrase'] as FilterType[]).map(t => (
              <button
                key={t}
                onClick={() => onTypeChange(t)}
                className={`flex-1 py-1 rounded-md text-[11px] font-medium capitalize transition-colors text-center cursor-pointer ${
                  type === t
                    ? 'bg-slate-700 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t === 'all' ? 'All' : t}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
