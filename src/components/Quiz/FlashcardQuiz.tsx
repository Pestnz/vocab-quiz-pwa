import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Volume2, RotateCcw, Check, X, ArrowLeft, ArrowUpDown, Keyboard } from 'lucide-react';
import type { VocabItem, FilterLanguage, FilterType, VocabDatabase } from '../../types/vocab';
import { speakTerm } from '../../services/speech';
import { QuizSummary } from './QuizSummary';

interface FlashcardQuizProps {
  vocabList: VocabDatabase;
  onUpdateItem: (item: VocabItem) => void;
  onExit: () => void;
}

type QuizDirection = 'term-to-meaning' | 'meaning-to-term';

const REVIEW_INTERVALS = [0, 1, 3, 7, 14, 30];

export const FlashcardQuiz: React.FC<FlashcardQuizProps> = ({
  vocabList,
  onUpdateItem,
  onExit,
}) => {
  const [langFilter, setLangFilter] = useState<FilterLanguage>('all');
  const [typeFilter, setTypeFilter] = useState<FilterType>('all');
  const [onlyDue, setOnlyDue] = useState(false);
  const [direction, setDirection] = useState<QuizDirection>('meaning-to-term');

  const [isStarted, setIsStarted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [quizQueue, setQuizQueue] = useState<VocabItem[]>([]);
  const [history, setHistory] = useState<{ item: VocabItem; remembered: boolean }[]>([]);
  const [rememberedCount, setRememberedCount] = useState(0);
  const [repeatCount, setRepeatCount] = useState(0);

  const eligibleItems = useMemo(() => {
    return vocabList.filter(item => {
      if (langFilter !== 'all' && item.language !== langFilter) return false;
      if (typeFilter !== 'all' && item.type !== typeFilter) return false;
      if (onlyDue) {
        if (!item.nextReviewAt) return true;
        return new Date(item.nextReviewAt).getTime() <= Date.now();
      }
      return true;
    });
  }, [vocabList, langFilter, typeFilter, onlyDue]);

  const startQuiz = () => {
    if (eligibleItems.length === 0) return;
    const shuffled = [...eligibleItems].sort(() => Math.random() - 0.5);
    setQuizQueue(shuffled);
    setCurrentIndex(0);
    setIsFlipped(false);
    setHistory([]);
    setRememberedCount(0);
    setRepeatCount(0);
    setIsStarted(true);
  };

  const currentItem = quizQueue[currentIndex];

  const handleRepeat = useCallback(() => {
    if (!currentItem) return;

    const updatedItem: VocabItem = {
      ...currentItem,
      proficiency: 0,
      nextReviewAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onUpdateItem(updatedItem);
    setRepeatCount(c => c + 1);
    setHistory(h => [...h, { item: currentItem, remembered: false }]);
    setQuizQueue(q => [...q, updatedItem]);

    setIsFlipped(false);
    setCurrentIndex(idx => idx + 1);
  }, [currentItem, onUpdateItem]);

  const handleRemembered = useCallback(() => {
    if (!currentItem) return;

    const newProficiency = Math.min((currentItem.proficiency || 0) + 1, 5);
    const intervalDays = REVIEW_INTERVALS[newProficiency];
    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + intervalDays);

    const updatedItem: VocabItem = {
      ...currentItem,
      proficiency: newProficiency,
      nextReviewAt: nextDate.toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onUpdateItem(updatedItem);
    setRememberedCount(c => c + 1);
    setHistory(h => [...h, { item: currentItem, remembered: true }]);

    setIsFlipped(false);
    setCurrentIndex(idx => idx + 1);
  }, [currentItem, onUpdateItem]);

  const handleSpeak = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (currentItem) {
      speakTerm(currentItem.term, currentItem.language);
    }
  }, [currentItem]);

  useEffect(() => {
    if (!isStarted || !currentItem) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsFlipped(prev => {
          if (!prev && currentItem) {
            speakTerm(currentItem.term, currentItem.language);
          }
          return !prev;
        });
      } else if (e.key === '1' || e.key === 'Digit1') {
        e.preventDefault();
        if (isFlipped) {
          handleRepeat();
        }
      } else if (e.key === '2' || e.key === 'Digit2') {
        e.preventDefault();
        if (isFlipped) {
          handleRemembered();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isStarted, isFlipped, currentItem, handleRepeat, handleRemembered]);

  if (!isStarted) {
    return (
      <div className="p-4 sm:p-8 max-w-lg mx-auto space-y-5 text-slate-100 animate-in fade-in duration-150">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
          <button
            onClick={onExit}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="font-bold text-base">フラッシュカード クイズ設定</h2>
            <p className="text-xs text-slate-400">条件を選択して集中復習セッションを開始します</p>
          </div>
        </div>

        <div className="bg-slate-850 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4 text-xs shadow-lg">
          <div>
            <label className="block text-slate-400 text-[11px] mb-1.5 font-medium">出題言語</label>
            <div className="grid grid-cols-3 gap-2">
              {(['all', 'en', 'pt'] as FilterLanguage[]).map(lang => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLangFilter(lang)}
                  className={`py-2 rounded-lg font-medium uppercase transition-colors text-center border cursor-pointer ${
                    langFilter === lang
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                  }`}
                >
                  {lang === 'all' ? 'すべて' : lang}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-slate-400 text-[11px] mb-1.5 font-medium">単語 / フレーズ</label>
            <div className="grid grid-cols-3 gap-2">
              {(['all', 'word', 'phrase'] as FilterType[]).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTypeFilter(t)}
                  className={`py-2 rounded-lg font-medium capitalize transition-colors text-center border cursor-pointer ${
                    typeFilter === t
                      ? 'bg-slate-700 text-white border-slate-600 shadow-xs'
                      : 'bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200'
                  }`}
                >
                  {t === 'all' ? 'すべて' : t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-slate-400 text-[11px] mb-1.5 font-medium">出題形式</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDirection('meaning-to-term')}
                className={`p-3 rounded-lg text-left border transition-colors cursor-pointer ${
                  direction === 'meaning-to-term'
                    ? 'bg-indigo-950/60 border-indigo-600 text-indigo-200 shadow-inner'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-semibold text-xs text-slate-200">日 → 外国語</div>
                <div className="text-[10px] text-slate-400 mt-1">日本語の意味から外国語を思い出す</div>
              </button>
              <button
                type="button"
                onClick={() => setDirection('term-to-meaning')}
                className={`p-3 rounded-lg text-left border transition-colors cursor-pointer ${
                  direction === 'term-to-meaning'
                    ? 'bg-indigo-950/60 border-indigo-600 text-indigo-200 shadow-inner'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="font-semibold text-xs text-slate-200">外国語 → 日</div>
                <div className="text-[10px] text-slate-400 mt-1">見出し語から日本語の意味を思い出す</div>
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2.5 p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/50 cursor-pointer hover:bg-slate-800/80 transition-colors">
            <input
              type="checkbox"
              checked={onlyDue}
              onChange={e => setOnlyDue(e.target.checked)}
              className="rounded text-emerald-500 focus:ring-0 bg-slate-700 border-slate-600 w-4 h-4 cursor-pointer"
            />
            <div className="text-xs">
              <span className="text-slate-200 font-medium">復習予定の単語のみ出題</span>
              <p className="text-[10px] text-slate-400">間隔反復（Spaced Repetition）の期日が到来したアイテム</p>
            </div>
          </label>
        </div>

        <div className="space-y-2 pt-2">
          <div className="text-center text-xs text-slate-400">
            対象単語: <span className="font-bold text-slate-200 text-sm">{eligibleItems.length}</span> 件
          </div>
          <button
            type="button"
            onClick={startQuiz}
            disabled={eligibleItems.length === 0}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs disabled:opacity-40 transition-all shadow-lg shadow-indigo-950 flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>クイズを開始</span>
          </button>
        </div>
      </div>
    );
  }

  if (currentIndex >= quizQueue.length) {
    return (
      <QuizSummary
        rememberedCount={rememberedCount}
        repeatCount={repeatCount}
        history={history}
        onRestart={startQuiz}
        onExit={onExit}
      />
    );
  }

  const progressPercent = Math.round((currentIndex / quizQueue.length) * 100);
  const frontText = direction === 'meaning-to-term' ? currentItem.meaning : currentItem.term;
  const backMainText = direction === 'meaning-to-term' ? currentItem.term : currentItem.meaning;

  return (
    <div className="p-3 sm:p-6 max-w-2xl mx-auto space-y-4 text-slate-100 select-none">
      {/* 上部ヘッダー & プログレスバー */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <button
            onClick={onExit}
            className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>終了</span>
          </button>
          <div className="flex items-center gap-3 font-mono text-[11px] sm:text-xs">
            <span>{currentIndex + 1} / {quizQueue.length}</span>
            <span className="text-emerald-400">覚えた: {rememberedCount}</span>
            <span className="text-rose-400">もう一度: {repeatCount}</span>
          </div>
        </div>

        {/* プログレスバー */}
        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-indigo-500 transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* フリップカード本体 */}
      <div
        onClick={() => setIsFlipped(prev => !prev)}
        className="w-full min-h-[340px] sm:min-h-[380px] bg-slate-850 border border-slate-700/80 rounded-2xl p-5 sm:p-7 flex flex-col justify-between shadow-2xl cursor-pointer hover:border-slate-600 transition-all relative"
      >
        {/* カード上部情報 */}
        <div className="flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-2">
            <span
              className={`px-2 py-0.5 rounded uppercase font-bold text-[10px] ${
                currentItem.language === 'en'
                  ? 'bg-blue-950 text-blue-300 border border-blue-800/60'
                  : 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
              }`}
            >
              {currentItem.language}
            </span>
            <span className="text-slate-400 bg-slate-800 px-2 py-0.5 rounded text-[10px]">
              {currentItem.type === 'phrase' ? 'フレーズ' : '単語'}
            </span>
          </div>

          <div className="text-[11px] text-slate-400 flex items-center gap-1">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <span>タップまたは Space で裏返し</span>
          </div>
        </div>

        {/* 表面 / 裏面のコンテンツ */}
        <div className="my-auto py-8 text-center space-y-4">
          {!isFlipped ? (
            /* 表面 */
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="text-xs text-indigo-400 uppercase tracking-wider font-semibold">
                {direction === 'meaning-to-term' ? '日本語の意味' : '見出し語'}
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-100 break-words leading-relaxed px-2">
                {frontText}
              </h2>
              {direction === 'term-to-meaning' && (
                <button
                  onClick={handleSpeak}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-slate-800 text-slate-300 hover:text-emerald-400 text-xs transition-colors cursor-pointer"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>発音</span>
                </button>
              )}
            </div>
          ) : (
            /* 裏面 */
            <div className="space-y-4 animate-in fade-in duration-150 text-left">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2">
                  <h2 className="text-2xl sm:text-3xl font-bold text-emerald-400 break-words">
                    {backMainText}
                  </h2>
                  <button
                    onClick={handleSpeak}
                    className="p-1.5 rounded-full text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>
                </div>
                {direction === 'meaning-to-term' && (
                  <p className="text-xs text-slate-300 mt-1">{currentItem.meaning}</p>
                )}
              </div>

              {/* 解説・例文 */}
              {currentItem.explanation && (
                <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 text-xs">
                  <div className="text-[10px] text-slate-400 mb-1 font-medium">ニュアンス・解説</div>
                  <p className="text-slate-200 leading-relaxed text-xs">{currentItem.explanation}</p>
                </div>
              )}

              {currentItem.exampleSentence && (
                <div className="bg-slate-900/80 p-3 rounded-xl border border-slate-800 text-xs space-y-1.5">
                  <div className="text-[10px] text-slate-400 font-medium">実用例文</div>
                  <p className="text-slate-200 italic text-xs leading-relaxed">"{currentItem.exampleSentence}"</p>
                  {currentItem.exampleTranslation && (
                    <p className="text-slate-400 text-xs pt-1 border-t border-slate-800">
                      {currentItem.exampleTranslation}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* カード下部のショートカット案内 */}
        <div className="flex items-center justify-center gap-4 text-xs text-slate-400 pt-3 border-t border-slate-800/60">
          <div className="flex items-center gap-1.5">
            <Keyboard className="w-3.5 h-3.5 text-slate-400" />
            {!isFlipped ? (
              <span><kbd className="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono">Space</kbd> 答えを表示</span>
            ) : (
              <span className="flex items-center gap-2">
                <span><kbd className="px-1.5 py-0.5 bg-rose-950 border border-rose-800 rounded text-[10px] font-mono text-rose-300">1</kbd> もう一度</span>
                <span><kbd className="px-1.5 py-0.5 bg-emerald-950 border border-emerald-800 rounded text-[10px] font-mono text-emerald-300">2</kbd> 覚えた</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 回答ボタンエリア */}
      {isFlipped ? (
        <div className="grid grid-cols-2 gap-3 pt-1 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <button
            onClick={handleRepeat}
            className="py-3.5 px-4 rounded-xl bg-rose-950/70 hover:bg-rose-900/80 border border-rose-800/80 text-rose-200 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-md active:scale-98 cursor-pointer"
          >
            <X className="w-4 h-4 text-rose-400" />
            <span>もう一度</span>
            <kbd className="px-1.5 py-0.5 bg-rose-900/80 border border-rose-700/60 rounded text-[10px] font-mono text-rose-300">
              1
            </kbd>
          </button>
          <button
            onClick={handleRemembered}
            className="py-3.5 px-4 rounded-xl bg-emerald-950/70 hover:bg-emerald-900/80 border border-emerald-800/80 text-emerald-200 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-all shadow-md active:scale-98 cursor-pointer"
          >
            <Check className="w-4 h-4 text-emerald-400" />
            <span>覚えた</span>
            <kbd className="px-1.5 py-0.5 bg-emerald-900/80 border border-emerald-700/60 rounded text-[10px] font-mono text-emerald-300">
              2
            </kbd>
          </button>
        </div>
      ) : (
        <button
          onClick={() => setIsFlipped(true)}
          className="w-full py-3.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-4 h-4 text-slate-400" />
          <span>答えを確認する (Space)</span>
        </button>
      )}
    </div>
  );
};
