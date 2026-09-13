import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Volume2,
  Copy,
  Check,
  Plus,
  Trash2,
  Save,
  Loader2,
  Lightbulb,
  Globe,
  BookPlus,
  Layers,
} from 'lucide-react';
import type { Language } from '../../types/vocab';
import type { DiaryItem, DiarySuggestedVocab } from '../../types/diary';
import { checkDiaryWithGemini } from '../../services/diaryCheck';
import { speakTerm } from '../../services/speech';

interface DiaryEditorProps {
  date: string; // 'YYYY-MM-DD'
  existingDiary?: DiaryItem;
  defaultLanguage?: Language;
  apiKey: string;
  onSaveDiary: (diary: DiaryItem) => Promise<void>;
  onDeleteDiary: (id: string) => Promise<void>;
  onAddVocabItem: (vocab: DiarySuggestedVocab, language: Language) => Promise<boolean>;
  onAddAllVocabItems: (vocabs: DiarySuggestedVocab[], language: Language) => Promise<number>;
  onOpenSettings: () => void;
  showToast: (message: string, type: 'info' | 'success' | 'error') => void;
}

export const DiaryEditor: React.FC<DiaryEditorProps> = ({
  date,
  existingDiary,
  defaultLanguage = 'en',
  apiKey,
  onSaveDiary,
  onDeleteDiary,
  onAddVocabItem,
  onAddAllVocabItems,
  onOpenSettings,
  showToast,
}) => {
  const [text, setText] = useState('');
  const [language, setLanguage] = useState<Language>(defaultLanguage);
  const [isChecking, setIsChecking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  // 添削結果ステート
  const [correctedText, setCorrectedText] = useState<string | undefined>(undefined);
  const [feedback, setFeedback] = useState<string | undefined>(undefined);
  const [translation, setTranslation] = useState<string | undefined>(undefined);
  const [suggestedVocab, setSuggestedVocab] = useState<DiarySuggestedVocab[]>([]);

  // 既存日記が切り替わったときの初期化
  useEffect(() => {
    if (existingDiary) {
      setText(existingDiary.originalText);
      setLanguage(existingDiary.language);
      setCorrectedText(existingDiary.correctedText);
      setFeedback(existingDiary.feedback);
      setTranslation(existingDiary.translation);
      setSuggestedVocab(existingDiary.suggestedVocab || []);
    } else {
      setText('');
      setLanguage(defaultLanguage);
      setCorrectedText(undefined);
      setFeedback(undefined);
      setTranslation(undefined);
      setSuggestedVocab([]);
    }
  }, [existingDiary, date, defaultLanguage]);

  // 日付の日本語フォーマット
  const formattedDate = (() => {
    const parts = date.split('-');
    if (parts.length === 3) {
      return `${parts[0]}年${parseInt(parts[1], 10)}月${parseInt(parts[2], 10)}日`;
    }
    return date;
  })();

  // AI添削実行
  const handleCheck = async () => {
    if (!text.trim()) {
      showToast('日記の本文を入力してください', 'info');
      return;
    }

    if (!apiKey) {
      showToast('Gemini API Keyが設定されていません', 'error');
      onOpenSettings();
      return;
    }

    setIsChecking(true);
    try {
      const result = await checkDiaryWithGemini({
        originalText: text.trim(),
        language,
        apiKey,
      });

      setCorrectedText(result.correctedText);
      setFeedback(result.feedback);
      setTranslation(result.translation);
      setSuggestedVocab(result.suggestedVocab);

      // 自動で一時保存（更新）
      const itemToSave: DiaryItem = {
        id: existingDiary?.id || crypto.randomUUID(),
        date,
        language,
        originalText: text.trim(),
        correctedText: result.correctedText,
        feedback: result.feedback,
        translation: result.translation,
        suggestedVocab: result.suggestedVocab,
        createdAt: existingDiary?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await onSaveDiary(itemToSave);
      showToast('AI添削が完了し、日記を保存しました！', 'success');
    } catch (err: any) {
      console.error(err);
      showToast(err.message || '添削に失敗しました', 'error');
    } finally {
      setIsChecking(false);
    }
  };

  // 手動保存
  const handleSave = async () => {
    if (!text.trim()) {
      showToast('日記の本文を入力してください', 'info');
      return;
    }

    setIsSaving(true);
    try {
      const itemToSave: DiaryItem = {
        id: existingDiary?.id || crypto.randomUUID(),
        date,
        language,
        originalText: text.trim(),
        correctedText,
        feedback,
        translation,
        suggestedVocab,
        createdAt: existingDiary?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await onSaveDiary(itemToSave);
      showToast('日記を保存しました', 'success');
    } catch (err: any) {
      showToast(err.message || '保存に失敗しました', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // 日記削除
  const handleDelete = async () => {
    if (!existingDiary) return;
    if (window.confirm(`${formattedDate} の日記を削除しますか？`)) {
      await onDeleteDiary(existingDiary.id);
      showToast('日記を削除しました', 'info');
    }
  };

  // 修正文コピー
  const handleCopyCorrected = () => {
    if (!correctedText) return;
    navigator.clipboard.writeText(correctedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showToast('修正文をクリップボードにコピーしました', 'info');
  };

  // 単語を単語帳に追加
  const handleAddVocab = async (vocab: DiarySuggestedVocab, idx: number) => {
    const success = await onAddVocabItem(vocab, language);
    if (success) {
      setSuggestedVocab(prev =>
        prev.map((item, i) => (i === idx ? { ...item, isAdded: true } : item))
      );
      showToast(`「${vocab.term}」を単語帳に追加しました`, 'success');
    } else {
      showToast(`「${vocab.term}」はすでに単語帳に登録されています`, 'info');
      setSuggestedVocab(prev =>
        prev.map((item, i) => (i === idx ? { ...item, isAdded: true } : item))
      );
    }
  };

  // おすすめ単語をすべて追加
  const handleAddAllVocab = async () => {
    const unadded = suggestedVocab.filter(v => !v.isAdded);
    if (unadded.length === 0) {
      showToast('すべての単語が追加済みです', 'info');
      return;
    }

    const addedCount = await onAddAllVocabItems(unadded, language);
    setSuggestedVocab(prev => prev.map(v => ({ ...v, isAdded: true })));
    showToast(`${addedCount}件の単語・フレーズを単語帳に追加しました！`, 'success');
  };

  return (
    <div className="space-y-4">
      {/* 日記エディタカード */}
      <div className="bg-slate-850/90 border border-slate-800 rounded-2xl p-3 sm:p-5 shadow-lg space-y-4">
        {/* カードヘッダー */}
        <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-800 pb-3">
          <div>
            <span className="text-xs font-semibold text-emerald-400 block">JOURNAL</span>
            <h3 className="text-base font-bold text-slate-100">{formattedDate}</h3>
          </div>

          <div className="flex items-center gap-2">
            {/* 言語選択 */}
            <div className="flex items-center bg-slate-900 border border-slate-750 rounded-xl p-0.5">
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  language === 'en'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                英語 (EN)
              </button>
              <button
                type="button"
                onClick={() => setLanguage('pt')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                  language === 'pt'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                ポルトガル語 (PT)
              </button>
            </div>

            {/* 削除ボタン（既存日記がある場合） */}
            {existingDiary && (
              <button
                type="button"
                onClick={handleDelete}
                className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                title="この日の日記を削除"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* 本文入力エリア */}
        <div className="space-y-1.5">
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={5}
            placeholder={
              language === 'pt'
                ? 'Hoje eu... (Escreva sobre o seu dia em português)'
                : 'Today I... (Write about your day, thoughts, or what you learned in English)'
            }
            className="w-full bg-slate-900/90 border border-slate-750 rounded-xl p-3 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 leading-relaxed resize-y"
          />

          <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
            <span>文字数: {text.length} 文字</span>
            <span>{existingDiary ? '保存済み' : '未保存'}</span>
          </div>
        </div>

        {/* アクションボタンバー */}
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || isChecking || !text.trim()}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>保存</span>
          </button>

          <button
            type="button"
            onClick={handleCheck}
            disabled={isChecking || !text.trim()}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-emerald-950 cursor-pointer"
          >
            {isChecking ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>AI添削中...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>AIで添削する</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 添削結果カード（添削済みの場合のみ表示） */}
      {correctedText && (
        <div className="bg-slate-850/90 border border-emerald-500/30 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <span className="font-bold text-xs sm:text-sm text-slate-100">
                AIネイティブ添削結果
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => speakTerm(correctedText, language)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-300 transition-colors cursor-pointer"
                title="お手本音声を再生"
              >
                <Volume2 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={handleCopyCorrected}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-emerald-300 transition-colors cursor-pointer"
                title="修正文をコピー"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* 添削後の自然な修正文 */}
          <div className="space-y-1.5 bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
            <div className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              <span>自然なネイティブ表現 (Corrected)</span>
            </div>
            <p className="text-xs sm:text-sm text-slate-100 font-medium leading-relaxed select-text">
              {correctedText}
            </p>
          </div>

          {/* 日本語訳 */}
          {translation && (
            <div className="space-y-1 bg-slate-900/50 p-3 rounded-xl border border-slate-800/60">
              <div className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                <Globe className="w-3 h-3" />
                <span>日本語訳</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed select-text">{translation}</p>
            </div>
          )}

          {/* 日本語アドバイス＆解説 */}
          {feedback && (
            <div className="space-y-1.5 bg-indigo-950/20 border border-indigo-500/30 p-3.5 rounded-xl">
              <div className="text-[11px] font-bold text-indigo-300 flex items-center gap-1">
                <Lightbulb className="w-3.5 h-3.5 text-indigo-400" />
                <span>添削アドバイス＆解説</span>
              </div>
              <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-wrap select-text">
                {feedback}
              </p>
            </div>
          )}

          {/* おすすめ単語・フレーズ */}
          {suggestedVocab.length > 0 && (
            <div className="space-y-2.5 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                  <BookPlus className="w-4 h-4 text-emerald-400" />
                  <span>この日記から覚えるおすすめ表現 ({suggestedVocab.length}件)</span>
                </div>

                {suggestedVocab.some(v => !v.isAdded) && (
                  <button
                    type="button"
                    onClick={handleAddAllVocab}
                    className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-800/60 px-2 py-1 rounded-lg flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <Layers className="w-3 h-3" />
                    <span>すべて単語帳に追加</span>
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {suggestedVocab.map((v, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl flex items-start justify-between gap-3 shadow-xs hover:border-slate-700 transition-colors"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs sm:text-sm text-slate-100">
                          {v.term}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-slate-800 text-slate-400 border border-slate-700 font-mono">
                          {v.type === 'phrase' ? 'フレーズ' : '単語'}
                        </span>
                        <span className="text-xs text-emerald-400 font-medium">
                          {v.meaning}
                        </span>
                      </div>

                      {v.explanation && (
                        <p className="text-[11px] text-slate-400 leading-snug">
                          {v.explanation}
                        </p>
                      )}

                      {v.exampleSentence && (
                        <div className="text-[11px] bg-slate-950/60 p-2 rounded-lg border border-slate-800/60 space-y-0.5">
                          <p className="text-slate-300 font-mono italic">
                            "{v.exampleSentence}"
                          </p>
                          {v.exampleTranslation && (
                            <p className="text-slate-400 text-[10px]">
                              {v.exampleTranslation}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 pt-0.5">
                      {v.isAdded ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-750 text-slate-400 text-[10px] font-semibold">
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>追加済み</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAddVocab(v, idx)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold transition-all shadow-xs cursor-pointer active:scale-95"
                        >
                          <Plus className="w-3 h-3" />
                          <span>単語帳に追加</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
