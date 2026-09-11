import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Sparkles, Send, Loader2, Globe, Layers } from 'lucide-react';

interface QuickAddBarProps {
  onAdd: (text: string, preferredLang: 'auto' | 'en' | 'pt') => Promise<void>;
  isLoading: boolean;
  progressText?: string;
  hasApiKey: boolean;
  onOpenSettings: () => void;
}

export const QuickAddBar: React.FC<QuickAddBarProps> = ({
  onAdd,
  isLoading,
  progressText,
  hasApiKey,
  onOpenSettings,
}) => {
  const [input, setInput] = useState('');
  const [preferredLang, setPreferredLang] = useState<'auto' | 'en' | 'pt'>('auto');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 有効な行数（単語・フレーズ数）を計算
  const lineCount = useMemo(() => {
    return input.split('\n').map(s => s.trim()).filter(Boolean).length;
  }, [input]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      // 複数行の場合は最大180pxまで自動拡張
      textareaRef.current.style.height = `${Math.min(Math.max(textareaRef.current.scrollHeight, 40), 180)}px`;
    }
  }, [input]);

  const handleSubmit = async () => {
    if (!input.trim() || isLoading) return;
    if (!hasApiKey) {
      onOpenSettings();
      return;
    }

    const textToSubmit = input;
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      await onAdd(textToSubmit, preferredLang);
    } catch {
      setInput(textToSubmit);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="bg-slate-900 md:bg-slate-850 p-3 md:p-3.5 border-b md:border md:rounded-xl border-slate-800 shadow-md">
      {!hasApiKey && (
        <div
          onClick={onOpenSettings}
          className="mb-2.5 p-2 rounded-lg bg-amber-950/40 border border-amber-800/40 text-amber-200 text-xs flex items-center justify-between cursor-pointer hover:bg-amber-950/60 transition-colors"
        >
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>Gemini APIキーを設定してAI自動解析を有効化</span>
          </div>
          <span className="underline font-medium text-[11px] shrink-0">設定</span>
        </div>
      )}

      <div className="relative bg-slate-800/90 rounded-xl border border-slate-700/80 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500/30 transition-all">
        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          placeholder="単語・フレーズ・例文を貼り付け...&#10;複数行でまとめて20個以上の一括登録も可能 (Ctrl+Enter)"
          className="w-full bg-transparent text-slate-100 placeholder-slate-400 text-xs px-3 pt-2.5 pb-9 resize-none focus:outline-hidden leading-relaxed max-h-48 overflow-y-auto"
        />

        {/* コントロールバー */}
        <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between pt-1 border-t border-slate-700/30 text-[11px]">
          {/* 言語選択 */}
          <div className="flex items-center gap-1">
            <Globe className="w-3 h-3 text-slate-400" />
            <select
              value={preferredLang}
              onChange={e => setPreferredLang(e.target.value as 'auto' | 'en' | 'pt')}
              className="bg-slate-800 text-slate-300 rounded px-1.5 py-0.5 border border-slate-700 text-[11px] focus:outline-hidden focus:border-emerald-500 cursor-pointer"
            >
              <option value="auto">Auto</option>
              <option value="en">英語 (EN)</option>
              <option value="pt">葡語 (PT)</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 hidden sm:inline flex items-center gap-0.5">
              <kbd className="px-1 py-0.5 bg-slate-700/60 rounded text-[9px] font-mono">Ctrl</kbd>+
              <kbd className="px-1 py-0.5 bg-slate-700/60 rounded text-[9px] font-mono">Enter</kbd>
            </span>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!input.trim() || isLoading}
              className={`px-3 py-1 rounded-md text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-all shadow-xs cursor-pointer ${
                lineCount > 1
                  ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-950'
                  : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950'
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span className="text-[11px]">{progressText || 'AI解析中...'}</span>
                </>
              ) : lineCount > 1 ? (
                <>
                  <Layers className="w-3 h-3" />
                  <span className="text-[11px]">一括追加 ({lineCount}件)</span>
                </>
              ) : (
                <>
                  <Send className="w-3 h-3" />
                  <span className="text-[11px]">追加</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
