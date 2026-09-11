import React, { useState } from 'react';
import { Volume2, ChevronDown, ChevronUp, Edit3, Trash2, Calendar, Star } from 'lucide-react';
import type { VocabItem } from '../../types/vocab';
import { speakTerm } from '../../services/speech';

interface VocabItemCardProps {
  item: VocabItem;
  onEdit: (item: VocabItem) => void;
  onDelete: (id: string) => void;
}

export const VocabItemCard: React.FC<VocabItemCardProps> = ({
  item,
  onEdit,
  onDelete,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const handleSpeak = (e: React.MouseEvent, text: string) => {
    e.stopPropagation();
    setIsPlaying(true);
    speakTerm(text, item.language);
    setTimeout(() => setIsPlaying(false), 1200);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`「${item.term}」を削除しますか？`)) {
      onDelete(item.id);
    }
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(item);
  };

  const nextReviewDate = item.nextReviewAt
    ? new Date(item.nextReviewAt).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })
    : '-';

  return (
    <div
      onClick={() => setExpanded(prev => !prev)}
      className={`border rounded-xl transition-all cursor-pointer select-none ${
        expanded
          ? 'bg-slate-800/90 border-slate-700 shadow-md ring-1 ring-slate-700'
          : 'bg-slate-850 hover:bg-slate-800/70 border-slate-800 hover:border-slate-700/80 shadow-xs'
      }`}
    >
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded uppercase ${
                  item.language === 'en'
                    ? 'bg-blue-950 text-blue-300 border border-blue-800/60'
                    : 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                }`}
              >
                {item.language}
              </span>

              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700/60 font-medium">
                {item.type === 'phrase' ? 'フレーズ' : '単語'}
              </span>

              <div className="flex items-center gap-0.5 ml-auto" title={`習熟度: ${item.proficiency}/5`}>
                {[1, 2, 3, 4, 5].map(star => (
                  <Star
                    key={star}
                    className={`w-2.5 h-2.5 ${
                      star <= (item.proficiency || 0)
                        ? 'text-amber-400 fill-amber-400'
                        : 'text-slate-700'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-100 tracking-tight break-words">
                {item.term}
              </h3>
              <button
                onClick={e => handleSpeak(e, item.term)}
                title="発音を再生"
                className={`p-1 rounded-full text-slate-400 hover:text-emerald-400 hover:bg-slate-700/60 transition-colors shrink-0 ${
                  isPlaying ? 'text-emerald-400 scale-110' : ''
                }`}
              >
                <Volume2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <p className="text-xs text-slate-300 font-medium mt-0.5 break-words">
              {item.meaning}
            </p>
          </div>

          <div className="text-slate-500 pt-1 shrink-0">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-700/50 space-y-2.5 text-xs text-slate-300 animate-in fade-in duration-100">
          {item.explanation && (
            <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800">
              <div className="text-[10px] font-medium text-slate-400 mb-0.5">ニュアンス・解説</div>
              <p className="text-slate-200 leading-relaxed text-[11px] whitespace-pre-wrap">
                {item.explanation}
              </p>
            </div>
          )}

          {item.exampleSentence && (
            <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-slate-400">実用例文</span>
                <button
                  onClick={e => handleSpeak(e, item.exampleSentence)}
                  title="例文を再生"
                  className="p-0.5 rounded text-slate-400 hover:text-emerald-400"
                >
                  <Volume2 className="w-3 h-3" />
                </button>
              </div>
              <p className="text-slate-200 italic text-[11px] leading-relaxed">
                "{item.exampleSentence}"
              </p>
              {item.exampleTranslation && (
                <p className="text-slate-400 text-[11px] pt-0.5 border-t border-slate-800/80">
                  {item.exampleTranslation}
                </p>
              )}
            </div>
          )}

          {item.sourceText && item.sourceText !== item.term && (
            <div className="text-[10px] text-slate-400">
              <span className="text-slate-400">元のメモ: </span>
              <span className="italic">{item.sourceText}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px] text-slate-400">
            <div className="flex items-center gap-1">
              <Calendar className="w-3 h-3 text-slate-400" />
              <span>次回: {nextReviewDate}</span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleEdit}
                className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 transition-colors"
              >
                <Edit3 className="w-3 h-3" />
                <span>編集</span>
              </button>
              <button
                onClick={handleDelete}
                className="px-2 py-1 rounded bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 flex items-center gap-1 border border-rose-900/50 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                <span>削除</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
