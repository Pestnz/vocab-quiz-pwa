import React from 'react';
import { BookOpen, BrainCircuit } from 'lucide-react';

interface BottomNavProps {
  currentView: 'list' | 'quiz';
  onViewChange: (view: 'list' | 'quiz') => void;
  dueCount: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentView,
  onViewChange,
  dueCount,
}) => {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800/80 safe-bottom">
      <div className="grid grid-cols-2 h-14 max-w-lg mx-auto">
        {/* 単語帳タブ */}
        <button
          onClick={() => onViewChange('list')}
          className={`flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer select-none ${
            currentView === 'list'
              ? 'text-emerald-400 font-semibold'
              : 'text-slate-400 hover:text-slate-200 font-medium'
          }`}
        >
          <BookOpen className={`w-5 h-5 transition-transform ${currentView === 'list' ? 'scale-110' : ''}`} />
          <span className="text-[10px] tracking-tight">単語帳</span>
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
            <BrainCircuit className={`w-5 h-5 transition-transform ${currentView === 'quiz' ? 'scale-110' : ''}`} />
            {dueCount > 0 && (
              <span className="absolute -top-1.5 -right-2.5 px-1 min-w-[15px] h-3.5 rounded-full bg-indigo-500 text-white font-mono text-[9px] font-bold flex items-center justify-center shadow-xs">
                {dueCount > 99 ? '99+' : dueCount}
              </span>
            )}
          </div>
          <span className="text-[10px] tracking-tight">クイズ</span>
        </button>
      </div>
    </nav>
  );
};
