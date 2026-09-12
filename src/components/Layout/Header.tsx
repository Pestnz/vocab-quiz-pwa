import React from 'react';
import { BookOpen, BrainCircuit, PenTool, Settings } from 'lucide-react';
import type { SyncStatusState, ViewMode } from '../../types/vocab';
import { SyncStatusBadge } from './SyncStatusBadge';

interface HeaderProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
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
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800/80 shadow-xs safe-top">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2">
        {/* ロゴ & タイトル（スマホでも絶対に1行で収まる設計） */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center font-bold text-white text-xs shadow-md shadow-emerald-950/60 shrink-0">
            V
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-bold text-sm tracking-tight text-slate-100 truncate">
              Vocab &amp; Quiz
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 border border-slate-700 text-slate-400 font-mono shrink-0">
              {totalCount}
            </span>
          </div>
        </div>

        {/* 右側アクションエリア */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* PCワイド時のみヘッダー内にタブを表示（スマホでは下部ボトムタブで操作） */}
          <div className="hidden md:flex bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/50">
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
              onClick={() => onViewChange('sentence')}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                currentView === 'sentence'
                  ? 'bg-violet-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <PenTool className="w-3.5 h-3.5" />
              <span>瞬間作文</span>
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
