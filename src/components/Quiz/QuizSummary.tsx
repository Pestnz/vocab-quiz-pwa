import React from 'react';
import { Award, RotateCcw, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import type { VocabItem } from '../../types/vocab';

interface QuizSummaryProps {
  rememberedCount: number;
  repeatCount: number;
  history: { item: VocabItem; remembered: boolean }[];
  onRestart: () => void;
  onExit: () => void;
}

export const QuizSummary: React.FC<QuizSummaryProps> = ({
  rememberedCount,
  repeatCount,
  history,
  onRestart,
  onExit,
}) => {
  const total = rememberedCount + repeatCount;
  const rate = total > 0 ? Math.round((rememberedCount / total) * 100) : 0;

  return (
    <div className="p-4 flex flex-col items-center justify-center min-h-[70vh] text-slate-100 max-w-md mx-auto space-y-5 animate-in fade-in zoom-in-95 duration-200">
      <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shadow-lg shadow-indigo-950">
        <Award className="w-8 h-8" />
      </div>

      <div className="text-center">
        <h2 className="text-lg font-bold">クイズセッション完了！</h2>
        <p className="text-xs text-slate-400 mt-1">お疲れ様でした。学習成果を記録しました。</p>
      </div>

      <div className="w-full bg-slate-800/80 border border-slate-700/70 rounded-xl p-3.5 grid grid-cols-3 gap-2 text-center">
        <div className="p-2 rounded-lg bg-slate-900/60">
          <div className="text-[10px] text-slate-400">正解率</div>
          <div className="text-lg font-bold text-indigo-400">{rate}%</div>
        </div>
        <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-800/30">
          <div className="text-[10px] text-emerald-300">覚えた</div>
          <div className="text-lg font-bold text-emerald-400">{rememberedCount}</div>
        </div>
        <div className="p-2 rounded-lg bg-rose-950/40 border border-rose-800/30">
          <div className="text-[10px] text-rose-300">もう一度</div>
          <div className="text-lg font-bold text-rose-400">{repeatCount}</div>
        </div>
      </div>

      <div className="w-full space-y-1.5 max-h-56 overflow-y-auto px-1">
        <div className="text-[11px] font-semibold text-slate-400">今回の出題単語:</div>
        {history.map(({ item, remembered }, idx) => (
          <div
            key={`${item.id}-${idx}`}
            className="flex items-center justify-between p-2 rounded-lg bg-slate-850 border border-slate-800 text-xs"
          >
            <div className="flex items-center gap-2 min-w-0">
              {remembered ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
              )}
              <span className="font-medium text-slate-200 truncate">{item.term}</span>
            </div>
            <span className="text-[11px] text-slate-400 truncate max-w-[120px] text-right">
              {item.meaning}
            </span>
          </div>
        ))}
      </div>

      <div className="w-full flex gap-2 pt-2">
        <button
          onClick={onRestart}
          className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-md shadow-indigo-950 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>もう一度挑戦</span>
        </button>
        <button
          onClick={onExit}
          className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>単語帳に戻る</span>
        </button>
      </div>
    </div>
  );
};
