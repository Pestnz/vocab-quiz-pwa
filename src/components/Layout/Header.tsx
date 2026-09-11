import React from 'react';
import { BookOpen, BrainCircuit, Settings } from 'lucide-react';
import type { SyncStatusState } from '../../types/vocab';
import { SyncStatusBadge } from './SyncStatusBadge';

interface HeaderProps {
  currentView: 'list' | 'quiz';
  onViewChange: (view: 'list' | 'quiz') => void;
  syncStatus: SyncStatusState;
  lastSyncedAt?: string;
  errorMessage?: string;
  onManualSync: () => void;
  onOpenSettings: () => void;
  totalCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onViewChange,
  syncStatus,
  lastSyncedAt,
  errorMessage,
  onManualSync,
  onOpenSettings,
  totalCount,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 shadow-xs safe-top">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between">
        {/* ロゴ & タイトル */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center font-bold text-white text-sm shadow-md shadow-emerald-950">
            V
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm sm:text-base tracking-tight text-slate-100">
                Personal Vocab &amp; Quiz
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400 font-mono">
                {totalCount} 語
              </span>
            </div>
            <p className="text-[10px] text-slate-400 hidden sm:block">
              GitHub Sync &amp; Gemini 3.6 Flash
            </p>
          </div>
        </div>

        {/* ナビゲーション & ステータス */}
        <div className="flex items-center gap-2">
          {/* モード切り替えタブ */}
          <div className="flex bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/50">
            <button
              onClick={() => onViewChange('list')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                currentView === 'list'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>単語帳</span>
            </button>
            <button
              onClick={() => onViewChange('quiz')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                currentView === 'quiz'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BrainCircuit className="w-3.5 h-3.5" />
              <span>クイズ</span>
            </button>
          </div>

          {/* 同期状態バッジ */}
          <SyncStatusBadge
            status={syncStatus}
            lastSyncedAt={lastSyncedAt}
            errorMessage={errorMessage}
            onManualSync={onManualSync}
            onOpenSettings={onOpenSettings}
          />

          {/* 設定ボタン */}
          <button
            onClick={onOpenSettings}
            title="設定を開く"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
