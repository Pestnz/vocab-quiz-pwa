import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import type { VocabItem } from '../../types/vocab';

interface VocabEditModalProps {
  item: VocabItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedItem: VocabItem) => void;
}

export const VocabEditModal: React.FC<VocabEditModalProps> = ({
  item,
  isOpen,
  onClose,
  onSave,
}) => {
  const [form, setForm] = useState<VocabItem | null>(item);

  useEffect(() => {
    setForm(item);
  }, [item]);

  if (!isOpen || !form) return null;

  const handleChange = (field: keyof VocabItem, val: string | number) => {
    setForm(prev => (prev ? { ...prev, [field]: val } : null));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    onSave({
      ...form,
      updatedAt: new Date().toISOString(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs safe-top safe-bottom">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-slate-100">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <span className="font-semibold text-sm text-slate-100">単語の編集</span>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-medium text-slate-300 mb-1">言語</label>
              <select
                value={form.language}
                onChange={e => handleChange('language', e.target.value as 'en' | 'pt')}
                className="w-full px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 focus:outline-hidden focus:border-emerald-500"
              >
                <option value="en">英語 (EN)</option>
                <option value="pt">ポルトガル語 (PT)</option>
              </select>
            </div>
            <div>
              <label className="block font-medium text-slate-300 mb-1">分類</label>
              <select
                value={form.type}
                onChange={e => handleChange('type', e.target.value as 'word' | 'phrase')}
                className="w-full px-2 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 focus:outline-hidden focus:border-emerald-500"
              >
                <option value="word">単語 (Word)</option>
                <option value="phrase">フレーズ (Phrase)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-medium text-slate-300 mb-1">見出し語 (Term)</label>
            <input
              type="text"
              value={form.term}
              onChange={e => handleChange('term', e.target.value)}
              required
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 focus:outline-hidden focus:border-emerald-500 font-medium"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-300 mb-1">日本語の意味 (Meaning)</label>
            <input
              type="text"
              value={form.meaning}
              onChange={e => handleChange('meaning', e.target.value)}
              required
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 focus:outline-hidden focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-300 mb-1">ニュアンス・解説 (Explanation)</label>
            <textarea
              rows={2}
              value={form.explanation}
              onChange={e => handleChange('explanation', e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 focus:outline-hidden focus:border-emerald-500 resize-none"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-300 mb-1">実用例文 (Example)</label>
            <textarea
              rows={2}
              value={form.exampleSentence}
              onChange={e => handleChange('exampleSentence', e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 focus:outline-hidden focus:border-emerald-500 resize-none"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-300 mb-1">例文の日本語訳 (Translation)</label>
            <textarea
              rows={2}
              value={form.exampleTranslation}
              onChange={e => handleChange('exampleTranslation', e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 focus:outline-hidden focus:border-emerald-500 resize-none"
            />
          </div>

          <div className="pt-2 border-t border-slate-800 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium"
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="flex-1 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>更新</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
