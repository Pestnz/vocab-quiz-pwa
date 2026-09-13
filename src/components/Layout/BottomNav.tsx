import React from 'react';
import { BookOpen, BrainCircuit, PenTool, Calendar } from 'lucide-react';
import type { ViewMode } from '../../types/vocab';

interface BottomNavProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  dueCount: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentView,
  onViewChange,
  dueCount,
}) => {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800/80 safe-bottom">
      <div className="grid grid-cols-4 h-14 max-w-lg mx-auto">
        {/* 単語帳タブ */}
        <button
          onClick={() => onViewChange('list')}
          className={`flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer select-none ${
            currentView === 'list'
              ? 'text-emerald-400 font-semibold'
              : 'text-slate-400 hover:text-slate-200 font-medium'
          }`}
        >
          <BookOpen className={`w-4 h-4 transition-transform ${currentView === 'list' ? 'scale-110' : ''}`} />
          <span className="text-[9px] tracking-tight">単語帳</span>
        </button>

        {/* 瞬間作文タブ */}
        <button
          onClick={() => onViewChange('sentence')}
          className={`flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer select-none ${
            currentView === 'sentence'
              ? 'text-violet-400 font-semibold'
              : 'text-slate-400 hover:text-slate-200 font-medium'
          }`}
        >
          <PenTool className={`w-4 h-4 transition-transform ${currentView === 'sentence' ? 'scale-110' : ''}`} />
          <span className="text-[9px] tracking-tight">瞬間作文</span>
        </button>

        {/* 日記タブ */}
        <button
          onClick={() => onViewChange('diary')}
          className={`flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer select-none ${
            currentView === 'diary'
              ? 'text-amber-400 font-semibold'
              : 'text-slate-400 hover:text-slate-200 font-medium'
          }`}
        >
          <Calendar className={`w-4 h-4 transition-transform ${currentView === 'diary' ? 'scale-110' : ''}`} />
          <span className="text-[9px] tracking-tight">日記</span>
        </button>

        {/* クイズタブ */}
        <button
          onClick={() => onViewChange('quiz')}
          className={`flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer select-none relative ${
            currentView === 'quiz'
              ? 'text-indigo-400 font-semibold'
              : 'text-slate-400 hover:text-slate-200 font-medium'
          }`}
        >
          <div className="relative">
            <BrainCircuit className={`w-4 h-4 transition-transform ${currentView === 'quiz' ? 'scale-110' : ''}`} />
            {dueCount > 0 && (
              <span className="absolute -top-1.5 -right-2 px-1 min-w-[14px] h-3.5 rounded-full bg-indigo-500 text-white font-mono text-[8px] font-bold flex items-center justify-center shadow-xs">
                {dueCount > 99 ? '99+' : dueCount}
              </span>
            )}
          </div>
          <span className="text-[9px] tracking-tight">クイズ</span>
        </button>
      </div>
    </nav>
  );
};

