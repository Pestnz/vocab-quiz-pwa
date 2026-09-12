import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Sparkles,
  RefreshCw,
  CheckCircle2,
  Volume2,
  ArrowRight,
  RotateCcw,
  Copy,
  Check,
  BookmarkPlus,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  AlertCircle,
  History,
  PenTool,
  Plus,
  BookMarked,
  GraduationCap,
} from 'lucide-react';
import type {
  VocabDatabase,
  VocabItem,
  Language,
  SentenceCheckResult,
  SentencePracticeLog,
  SentenceSourceMode,
  VocabDifficultyLevel,
} from '../../types/vocab';
import { pickSentenceWords, generateAiSentenceWords } from '../../services/sentencePicker';
import { checkSentenceWithGemini } from '../../services/sentenceCheck';
import { speakTerm } from '../../services/speech';
import { SentenceHistoryList } from './SentenceHistoryList';

interface SentenceBuilderProps {
  vocabList: VocabDatabase;
  apiKey: string;
  defaultLanguage?: Language;
  history: SentencePracticeLog[];
  onExit: () => void;
  onOpenSettings: () => void;
  onPass: (items: VocabItem[]) => void;
  onFail: (items: VocabItem[]) => void;
  onSaveExample: (wordId: string, newSentence: string, newTranslation?: string) => Promise<void> | void;
  onSaveLog: (log: SentencePracticeLog) => void;
  onDeleteLog: (id: string) => void;
  onAddCustomWord: (item: VocabItem) => Promise<void> | void;
}

export const SentenceBuilder: React.FC<SentenceBuilderProps> = ({
  vocabList,
  apiKey,
  defaultLanguage = 'en',
  history,
  onExit,
  onOpenSettings,
  onPass,
  onFail,
  onSaveExample,
  onSaveLog,
  onDeleteLog,
  onAddCustomWord,
}) => {
  // 作文 vs 履歴タブ
  const [activeSubTab, setActiveSubTab] = useState<'challenge' | 'history'>('challenge');

  // 言語選択（DBにある言語を優先、デフォルト言語）
  const [selectedLanguage, setSelectedLanguage] = useState<Language>(() => {
    if (vocabList.some(v => v.language === defaultLanguage)) {
      return defaultLanguage;
    }
    const first = vocabList[0];
    return first ? first.language : 'en';
  });

  // 出題ソースモード: 'my_vocab' (単語帳から) | 'ai_random' (AIおまかせ)
  const [sourceMode, setSourceMode] = useState<SentenceSourceMode>(() => {
    const hasItemsInLang = vocabList.some(v => v.language === defaultLanguage || v.language === 'en');
    return hasItemsInLang ? 'my_vocab' : 'ai_random';
  });

  // AIモードで既に生成済みか（未生成時は設定・レベル選択画面をまず表示）
  const [aiHasDrawn, setAiHasDrawn] = useState(false);

  // AIおまかせ出題の難易度レベル
  const [difficultyLevel, setDifficultyLevel] = useState<VocabDifficultyLevel>('intermediate');

  // AI単語生成ローディング中
  const [isGeneratingWords, setIsGeneratingWords] = useState(false);

  // 単語帳に追加中・追加済みステータス
  const [addedWordIds, setAddedWordIds] = useState<Record<string, boolean>>({});
  const [isAddingWord, setIsAddingWord] = useState<Record<string, boolean>>({});

  // 指定単語数 (1〜5)
  const [wordCount, setWordCount] = useState<number>(3);

  // 現在出題中の単語一覧
  const [currentWords, setCurrentWords] = useState<VocabItem[]>([]);
  // 直近合格した単語ID（クールダウン用）
  const [recentPassedIds, setRecentPassedIds] = useState<string[]>([]);

  // ユーザーの作成文入力
  const [userSentence, setUserSentence] = useState('');
  // 判定中フラグ
  const [isChecking, setIsChecking] = useState(false);
  // エラーメッセージ
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 添削結果
  const [result, setResult] = useState<SentenceCheckResult | null>(null);

  // 単語チップごとの詳細アコーディオン開閉状態
  const [expandedWordIds, setExpandedWordIds] = useState<Record<string, boolean>>({});

  // コピー完了アニメーション用
  const [isCopied, setIsCopied] = useState(false);
  // 例文保存モーダル / 保存中フラグ
  const [savedWordIds, setSavedWordIds] = useState<Record<string, boolean>>({});
  const [isSavingExample, setIsSavingExample] = useState(false);

  // 対象言語の単語数（単語帳内）
  const totalInLang = useMemo(() => {
    return vocabList.filter(v => v.language === selectedLanguage).length;
  }, [vocabList, selectedLanguage]);

  // 出題単語の抽選（リロール含む）
  const drawWords = useCallback(
    async (
      count = wordCount,
      lang = selectedLanguage,
      mode = sourceMode,
      level = difficultyLevel
    ) => {
      setResult(null);
      setErrorMessage(null);
      setUserSentence('');
      setSavedWordIds({});
      setExpandedWordIds({});

      if (mode === 'my_vocab') {
        const picked = pickSentenceWords(vocabList, {
          count,
          language: lang,
          recentPassedWordIds: recentPassedIds,
        });
        setCurrentWords(picked.words);
      } else {
        // AIランダム出題
        if (!apiKey.trim()) {
          onOpenSettings();
          setErrorMessage('AI出題にはGemini API Keyの設定が必要です。');
          return;
        }

        setIsGeneratingWords(true);
        try {
          const aiWords = await generateAiSentenceWords({
            count,
            language: lang,
            level,
            apiKey,
          });
          setCurrentWords(aiWords);
          setAiHasDrawn(true);
        } catch (err: unknown) {
          const e = err as Error;
          setErrorMessage(e.message || 'AIによる単語生成に失敗しました。');
        } finally {
          setIsGeneratingWords(false);
        }
      }
    },
    [wordCount, selectedLanguage, sourceMode, difficultyLevel, vocabList, recentPassedIds, apiKey, onOpenSettings]
  );

  // 初回起動時の初期抽選（マイ単語帳モードの場合のみ自動実行）
  useEffect(() => {
    if (currentWords.length === 0) {
      if (sourceMode === 'my_vocab' && totalInLang > 0) {
        drawWords(wordCount, selectedLanguage, 'my_vocab', difficultyLevel);
      }
    }
  }, [sourceMode, selectedLanguage, totalInLang, wordCount, difficultyLevel, drawWords, currentWords.length]);

  // 言語切り替え
  const handleLanguageChange = (lang: Language) => {
    setSelectedLanguage(lang);
    if (sourceMode === 'my_vocab') {
      drawWords(wordCount, lang, 'my_vocab', difficultyLevel);
    }
  };

  // モード切り替え（AIモード切り替え時は自動生成せず、まずレベル選択画面を表示）
  const handleModeChange = (mode: SentenceSourceMode) => {
    setSourceMode(mode);
    setResult(null);
    setErrorMessage(null);
    setUserSentence('');
    if (mode === 'my_vocab') {
      if (totalInLang > 0) {
        drawWords(wordCount, selectedLanguage, 'my_vocab', difficultyLevel);
      } else {
        setCurrentWords([]);
      }
    } else {
      setAiHasDrawn(false);
      setCurrentWords([]);
    }
  };

  // 難易度レベル選択（選択状態のみ更新し、勝手にAPIは呼ばない）
  const handleLevelChange = (level: VocabDifficultyLevel) => {
    setDifficultyLevel(level);
  };

  // AI単語生成を明示的に開始
  const handleStartAiGeneration = (level = difficultyLevel) => {
    setAiHasDrawn(true);
    drawWords(wordCount, selectedLanguage, 'ai_random', level);
  };

  // 単語数変更
  const handleWordCountChange = (count: number) => {
    setWordCount(count);
    if (sourceMode === 'my_vocab') {
      drawWords(count, selectedLanguage, 'my_vocab', difficultyLevel);
    }
  };

  // 単語詳細開閉トグル
  const toggleExpandWord = (id: string) => {
    setExpandedWordIds(prev => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // 新単語を単語帳に登録
  const handleAddWordToVocab = async (word: VocabItem) => {
    setIsAddingWord(prev => ({ ...prev, [word.id]: true }));
    try {
      await onAddCustomWord(word);
      setAddedWordIds(prev => ({ ...prev, [word.id]: true }));
    } catch (err) {
      console.error('Failed to add word to vocab', err);
    } finally {
      setIsAddingWord(prev => ({ ...prev, [word.id]: false }));
    }
  };

  // 添削リクエスト送信
  const handleSubmitSentence = async () => {
    if (!userSentence.trim()) {
      setErrorMessage('作成文を入力してください。');
      return;
    }
    if (!apiKey.trim()) {
      onOpenSettings();
      setErrorMessage('Gemini API Keyを設定してください。');
      return;
    }
    if (currentWords.length === 0) {
      setErrorMessage('出題対象の単語がありません。');
      return;
    }

    setIsChecking(true);
    setErrorMessage(null);

    try {
      const res = await checkSentenceWithGemini({
        targetWords: currentWords.map(w => ({ term: w.term, meaning: w.meaning })),
        language: selectedLanguage,
        userSentence: userSentence.trim(),
        apiKey,
      });

      setResult(res);

      // 履歴ログを作成して保存
      const newLog: SentencePracticeLog = {
        id: typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: new Date().toISOString(),
        language: selectedLanguage,
        targetWordIds: currentWords.map(w => w.id),
        targetTerms: currentWords.map(w => w.term),
        userSentence: userSentence.trim(),
        result: res,
        sourceMode,
        level: sourceMode === 'ai_random' ? difficultyLevel : undefined,
      };
      onSaveLog(newLog);

      // 単語帳に登録されている単語のみ習熟度・復習日の更新対象とする
      const registeredWords = currentWords.filter(cw =>
        vocabList.some(v => v.id === cw.id || v.term.toLowerCase() === cw.term.toLowerCase())
      );

      if (res.isPass) {
        if (registeredWords.length > 0) {
          onPass(registeredWords);
        }
        setRecentPassedIds(prev => [...currentWords.map(w => w.id), ...prev].slice(0, 15));
      } else {
        if (registeredWords.length > 0) {
          onFail(registeredWords);
        }
      }
    } catch (err: unknown) {
      const e = err as Error;
      setErrorMessage(e.message || '判定中にエラーが発生しました。');
    } finally {
      setIsChecking(false);
    }
  };

  // 添削文のコピー
  const handleCopyCorrection = () => {
    if (!result?.naturalCorrectedText) return;
    navigator.clipboard.writeText(result.naturalCorrectedText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // 添削文を単語帳の例文として保存
  const handleSaveToVocab = async (wordId: string) => {
    if (!result?.naturalCorrectedText) return;
    setIsSavingExample(true);
    try {
      await onSaveExample(
        wordId,
        result.naturalCorrectedText,
        // 日本語訳としてユーザー入力や解説が利用可能
        `「${userSentence.trim()}」の添削表現`
      );
      setSavedWordIds(prev => ({ ...prev, [wordId]: true }));
    } catch (err) {
      console.error('Failed to save example', err);
    } finally {
      setIsSavingExample(false);
    }
  };

  // キーボードショートカット (Ctrl + Enter / Cmd + Enter で送信)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (!isChecking) {
        handleSubmitSentence();
      }
    }
  };

  // 履歴タブが選ばれている場合は、単語登録が0件でも履歴を表示可能
  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-6 py-4 space-y-5">
      {/* 最上部：戻るボタン & サブタブ（作文チャレンジ / 過去の履歴） */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-3 flex-wrap">
        <button
          onClick={onExit}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors cursor-pointer py-1 px-2 rounded-lg hover:bg-slate-800/60"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>単語帳へ戻る</span>
        </button>

        {/* サブタブ切替 */}
        <div className="flex bg-slate-800/90 p-0.5 rounded-xl border border-slate-700/80 text-xs">
          <button
            onClick={() => setActiveSubTab('challenge')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              activeSubTab === 'challenge'
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>作文チャレンジ</span>
          </button>
          <button
            onClick={() => setActiveSubTab('history')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              activeSubTab === 'history'
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>過去の履歴</span>
            {history.length > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  activeSubTab === 'history'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {history.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {activeSubTab === 'history' ? (
        <SentenceHistoryList
          history={history}
          vocabList={vocabList}
          onDeleteLog={onDeleteLog}
          onSaveExample={onSaveExample}
        />
      ) : (
        <>
          {/* 出題設定エリア */}
          <div className="bg-slate-850/70 p-3 rounded-2xl border border-slate-800 space-y-2.5 shadow-sm">
            {/* 1行目: モード切替 ＆ 言語・語数・リロール */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {/* モード選択（マイ単語帳 / AIおまかせ） */}
              <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-750 text-xs">
                <button
                  type="button"
                  onClick={() => handleModeChange('my_vocab')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                    sourceMode === 'my_vocab'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <BookMarked className="w-3.5 h-3.5" />
                  <span>マイ単語帳 ({totalInLang})</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('ai_random')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                    sourceMode === 'ai_random'
                      ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AIおまかせ</span>
                </button>
              </div>

              {/* 右側: 言語 / 語数 / リロール */}
              <div className="flex items-center gap-2">
                {/* 言語選択 */}
                <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-750 text-xs">
                  <button
                    onClick={() => handleLanguageChange('en')}
                    className={`px-2 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                      selectedLanguage === 'en'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    EN
                  </button>
                  <button
                    onClick={() => handleLanguageChange('pt')}
                    className={`px-2 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                      selectedLanguage === 'pt'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    PT
                  </button>
                </div>

                {/* 語数選択 */}
                <div className="flex items-center gap-1 bg-slate-900 px-2 py-1 rounded-lg border border-slate-750 text-xs">
                  <span className="text-[11px] text-slate-400 hidden sm:inline">語数:</span>
                  {[1, 2, 3, 4, 5].map(num => (
                    <button
                      key={num}
                      onClick={() => handleWordCountChange(num)}
                      className={`w-6 h-6 rounded-md font-bold transition-all text-xs cursor-pointer flex items-center justify-center ${
                        wordCount === num
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-750'
                      }`}
                      title={`${num}個の単語で作文`}
                    >
                      {num}
                    </button>
                  ))}
                </div>

                {/* リロールボタン */}
                <button
                  onClick={() => drawWords(wordCount, selectedLanguage, sourceMode, difficultyLevel)}
                  disabled={isGeneratingWords}
                  title="別の単語を再抽選"
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer transition-all hover:scale-105 active:scale-95 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isGeneratingWords ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* 2行目: AIおまかせモード時の難易度レベル選択（出題中） */}
            {sourceMode === 'ai_random' && aiHasDrawn && (
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 flex-wrap text-xs">
                <div className="flex items-center gap-1.5 text-slate-300 font-semibold text-[11px]">
                  <GraduationCap className="w-3.5 h-3.5 text-indigo-400" />
                  <span>単語レベル:</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-750 text-[11px] flex-wrap gap-0.5">
                    {[
                      { key: 'beginner', label: '初級 (A1-A2)', tip: '基礎・日常会話（英検3〜準2級 / TOEIC ~500）' },
                      { key: 'intermediate', label: '中級 (B1)', tip: '実用・ビジネス基礎（英検2級 / TOEIC 500-700）' },
                      { key: 'upper_intermediate', label: '中上級 (B2)', tip: '表現力・実践（英検準1級 / TOEIC 700-850）' },
                      { key: 'advanced', label: '上級 (C1-C2)', tip: 'ニュース・高度な議論（英検1級 / TOEIC 860+）' },
                    ].map(lvl => (
                      <button
                        key={lvl.key}
                        onClick={() => {
                          handleLevelChange(lvl.key as VocabDifficultyLevel);
                          // レベル変更時はそのレベルで再生成
                          handleStartAiGeneration(lvl.key as VocabDifficultyLevel);
                        }}
                        title={lvl.tip}
                        disabled={isGeneratingWords}
                        className={`px-2 py-1 rounded-md transition-all cursor-pointer font-medium ${
                          difficultyLevel === lvl.key
                            ? 'bg-indigo-600 text-white font-bold shadow-xs'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {lvl.label}
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setAiHasDrawn(false);
                      setCurrentWords([]);
                    }}
                    className="text-[10px] text-slate-400 hover:text-indigo-300 underline underline-offset-2 ml-1"
                  >
                    設定画面へ戻る
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* マイ単語帳が空の場合のメッセージ */}
          {sourceMode === 'my_vocab' && totalInLang === 0 ? (
            <div className="max-w-xl mx-auto px-4 py-10 text-center space-y-4 bg-slate-850/50 rounded-2xl border border-slate-800">
              <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-100">
                  {selectedLanguage === 'en' ? '英語' : 'ポルトガル語'}の登録単語がありません
                </h3>
                <p className="text-xs text-slate-400">
                  単語帳に登録するか、「AIおまかせ」モードに切り替えて出題してください。
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleModeChange('ai_random')}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold cursor-pointer shadow-md shadow-indigo-950 transition-all"
              >
                AIおまかせモードで出題する
              </button>
            </div>
          ) : isGeneratingWords ? (
            <div className="py-16 text-center space-y-3 bg-slate-850/50 rounded-2xl border border-slate-800">
              <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
              <div className="space-y-1">
                <div className="text-sm font-bold text-slate-200">AIが指定レベルの単語を選定中...</div>
                <div className="text-xs text-slate-400">実用的な語彙をランダム抽出しています</div>
              </div>
            </div>
          ) : sourceMode === 'ai_random' && !aiHasDrawn ? (
            /* AI単語生成前のレベル選択＆開始画面 */
            <div className="bg-slate-850/90 rounded-2xl border border-slate-800 p-5 sm:p-6 shadow-xl space-y-5 animate-in fade-in duration-150">
              <div className="text-center space-y-1.5">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto mb-2 shadow-inner">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h2 className="text-base sm:text-lg font-bold text-slate-100">
                  AIおまかせ出題（難易度レベル選択）
                </h2>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  挑戦したい単語レベルを選択してください。Geminiが実用的で自然な単語をランダム抽出し、強制作文チャレンジを出題します。
                </p>
              </div>

              {/* レベル選択カードグリッド */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {[
                  {
                    key: 'beginner',
                    title: '初級 (A1-A2)',
                    desc: '基礎・日常会話語彙',
                    detail: '目安: 英検3〜準2級 / TOEIC 〜500',
                    color: 'from-emerald-600/20 to-teal-600/10 border-emerald-500/50',
                  },
                  {
                    key: 'intermediate',
                    title: '中級 (B1)',
                    desc: '実用・ビジネス基礎語彙',
                    detail: '目安: 英検2級 / TOEIC 500〜700',
                    color: 'from-blue-600/20 to-indigo-600/10 border-blue-500/50',
                  },
                  {
                    key: 'upper_intermediate',
                    title: '中上級 (B2)',
                    desc: '表現力向上・実践的な語彙',
                    detail: '目安: 英検準1級 / TOEIC 700〜850',
                    color: 'from-indigo-600/20 to-purple-600/10 border-indigo-500/50',
                  },
                  {
                    key: 'advanced',
                    title: '上級 (C1-C2)',
                    desc: 'ニュース・高度な議論・成句',
                    detail: '目安: 英検1級 / TOEIC 860+',
                    color: 'from-purple-600/20 to-rose-600/10 border-purple-500/50',
                  },
                ].map(lvl => {
                  const isSelected = difficultyLevel === lvl.key;
                  return (
                    <div
                      key={lvl.key}
                      onClick={() => handleLevelChange(lvl.key as VocabDifficultyLevel)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none flex flex-col justify-between gap-1.5 ${
                        isSelected
                          ? `bg-gradient-to-br ${lvl.color} ring-2 ring-indigo-500 shadow-md`
                          : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-sm text-slate-100">{lvl.title}</span>
                        {isSelected && (
                          <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold">
                            ✓
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-300 font-medium">{lvl.desc}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{lvl.detail}</div>
                    </div>
                  );
                })}
              </div>

              {/* 生成開始ボタン */}
              <button
                type="button"
                onClick={() => handleStartAiGeneration()}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-950 cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {difficultyLevel === 'beginner' && '初級 (A1-A2)'}
                  {difficultyLevel === 'intermediate' && '中級 (B1)'}
                  {difficultyLevel === 'upper_intermediate' && '中上級 (B2)'}
                  {difficultyLevel === 'advanced' && '上級 (C1-C2)'}
                  {' の単語を生成してスタート（' + wordCount + '語）'}
                </span>
              </button>
            </div>
          ) : (
            /* 出題カードコンテナ */
            <div className="bg-slate-850/80 rounded-2xl border border-slate-800 p-4 sm:p-5 shadow-lg space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-md bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold text-xs">
                    ★
                  </div>
                  <h2 className="text-xs sm:text-sm font-bold text-slate-200">
                    指定単語（すべて使って作文してください）
                  </h2>
                </div>
                <span className="text-[11px] text-slate-400">
                  動詞・名詞等の活用形OK
                </span>
              </div>

        {/* 単語チップ一覧 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {currentWords.map(word => {
            const isUsed = result?.usedWords.some(
              uw => uw.toLowerCase() === word.term.toLowerCase()
            );
            const isMissing = result?.missingWords.some(
              mw => mw.toLowerCase() === word.term.toLowerCase()
            );
            const isExpanded = Boolean(expandedWordIds[word.id]);
            const isAlreadyInVocab =
              vocabList.some(
                v => v.id === word.id || v.term.toLowerCase() === word.term.toLowerCase()
              ) || Boolean(addedWordIds[word.id]);
            const isAdding = Boolean(isAddingWord[word.id]);

            return (
              <div
                key={word.id}
                className={`p-3 rounded-xl border transition-all ${
                  result
                    ? isUsed
                      ? 'bg-emerald-950/30 border-emerald-500/50'
                      : isMissing
                      ? 'bg-rose-950/30 border-rose-500/50'
                      : 'bg-slate-900/90 border-slate-700/80'
                    : 'bg-slate-900/90 border-slate-700/80 hover:border-slate-600'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-sm text-slate-100 break-all">
                        {word.term}
                      </span>
                      <button
                        type="button"
                        onClick={() => speakTerm(word.term, word.language)}
                        className="p-0.5 text-slate-400 hover:text-emerald-400 transition-colors"
                        title="発音を聞く"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="text-xs text-slate-300 mt-0.5 font-medium line-clamp-1">
                      {word.meaning}
                    </div>

                    {/* 単語帳に追加ボタン / 登録済表示 */}
                    <div className="mt-1.5">
                      {!isAlreadyInVocab ? (
                        <button
                          type="button"
                          onClick={() => handleAddWordToVocab(word)}
                          disabled={isAdding}
                          className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                          title="この単語を単語帳に追加"
                        >
                          <Plus className="w-2.5 h-2.5" />
                          <span>{isAdding ? '追加中...' : '単語帳に追加'}</span>
                        </button>
                      ) : (
                        <span className="text-[10px] text-emerald-400/90 font-medium flex items-center gap-0.5">
                          <Check className="w-2.5 h-2.5 text-emerald-400" />
                          <span>単語帳に登録済</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 習熟度 or 判定ステータス */}
                  <div className="flex items-center gap-1 shrink-0">
                    {result ? (
                      isUsed ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 flex items-center gap-0.5 border border-emerald-500/30">
                          <Check className="w-2.5 h-2.5" /> 使用済
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 flex items-center gap-0.5 border border-rose-500/30">
                          ✕ 未使用
                        </span>
                      )
                    ) : (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                        Lv.{word.proficiency ?? 0}
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleExpandWord(word.id)}
                      className="p-1 text-slate-400 hover:text-slate-200 transition-colors rounded hover:bg-slate-800"
                      title={isExpanded ? '詳細を閉じる' : 'ヒント・解説を見る'}
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* アコーディオン詳細 (例文・解説) */}
                {isExpanded && (
                  <div className="mt-2.5 pt-2.5 border-t border-slate-800 text-[11px] space-y-1.5 text-slate-300 animate-in fade-in duration-150">
                    {word.explanation && (
                      <div>
                        <span className="text-slate-400 font-semibold">解説: </span>
                        {word.explanation}
                      </div>
                    )}
                    {word.exampleSentence && (
                      <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800/80 space-y-0.5">
                        <div className="flex items-center justify-between gap-1 text-slate-200 font-medium">
                          <span>{word.exampleSentence}</span>
                          <button
                            type="button"
                            onClick={() => speakTerm(word.exampleSentence, word.language)}
                            className="text-slate-400 hover:text-emerald-400"
                          >
                            <Volume2 className="w-3 h-3" />
                          </button>
                        </div>
                        {word.exampleTranslation && (
                          <div className="text-slate-400 text-[10px]">
                            {word.exampleTranslation}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 入力エリア */}
        <div className="space-y-2 pt-2">
          <div className="relative">
            <textarea
              value={userSentence}
              onChange={e => setUserSentence(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isChecking}
              rows={3}
              placeholder={
                selectedLanguage === 'en'
                  ? '指定されたすべての単語を含めて、英語で自然な文章を作成してください...'
                  : '指定されたすべての単語を含めて、ポルトガル語で自然な文章を作成してください...'
              }
              className="w-full bg-slate-900 border border-slate-700/80 rounded-xl p-3.5 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none transition-all disabled:opacity-50"
            />
            {userSentence.length > 0 && (
              <span className="absolute bottom-2.5 right-3 text-[10px] text-slate-400 font-mono pointer-events-none">
                {userSentence.length}文字
              </span>
            )}
          </div>

          {/* 送信ボタン & ヒント */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <span className="hidden sm:inline">ショートカット:</span>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-slate-300">
                Ctrl + Enter
              </kbd>
            </div>

            <div className="flex items-center gap-2">
              {userSentence && (
                <button
                  type="button"
                  onClick={() => setUserSentence('')}
                  disabled={isChecking}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                >
                  クリア
                </button>
              )}
              <button
                type="button"
                onClick={handleSubmitSentence}
                disabled={isChecking || !userSentence.trim()}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-indigo-950/80 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isChecking ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Geminiが添削中...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>添削する (Gemini)</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* エラーメッセージ */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>
      </div>
    )}

      {/* 添削結果パネル */}
      {result && (
        <div
          className={`rounded-2xl border p-4 sm:p-6 space-y-4 shadow-xl animate-in fade-in slide-in-from-bottom-3 duration-200 ${
            result.isPass
              ? 'bg-emerald-950/20 border-emerald-500/40'
              : 'bg-amber-950/20 border-amber-500/40'
          }`}
        >
          {/* 結果ヘッダー */}
          <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 pb-3.5 flex-wrap">
            <div className="flex items-center gap-2">
              {result.isPass ? (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>合格 (PASS) - 習熟度UP!</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  <span>要改善 (RETRY) - 再挑戦しよう</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block">文法・自然さスコア</span>
                <span className="text-base font-extrabold text-slate-100 font-mono">
                  {result.grammarScore}
                  <span className="text-xs text-slate-400 font-normal"> / 100</span>
                </span>
              </div>
            </div>
          </div>

          {/* ネイティブリライト表現 */}
          <div className="space-y-1.5 bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                ネイティブの自然な表現（リライト）
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    speakTerm(result.naturalCorrectedText, selectedLanguage)
                  }
                  className="p-1 rounded text-slate-400 hover:text-emerald-400 transition-colors"
                  title="発音を聞く"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleCopyCorrection}
                  className="p-1 rounded text-slate-400 hover:text-slate-200 transition-colors"
                  title="コピー"
                >
                  {isCopied ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            <p className="text-sm font-semibold text-slate-100 leading-relaxed pt-1 select-text">
              {result.naturalCorrectedText}
            </p>

            {/* この添削文を単語帳の例文として保存するボタン */}
            <div className="pt-2 border-t border-slate-800/80 mt-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400">
                この添削文を単語帳の例文に上書き保存:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {currentWords.map(w => (
                  <button
                    key={w.id}
                    onClick={() => handleSaveToVocab(w.id)}
                    disabled={isSavingExample || savedWordIds[w.id]}
                    className={`px-2 py-1 rounded text-[11px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                      savedWordIds[w.id]
                        ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/60 cursor-default'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                    }`}
                  >
                    {savedWordIds[w.id] ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span>{w.term}に保存済</span>
                      </>
                    ) : (
                      <>
                        <BookmarkPlus className="w-3 h-3" />
                        <span>「{w.term}」に保存</span>
                      </>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 日本語解説フィードバック */}
          {result.feedback && (
            <div className="space-y-1 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800/80">
              <div className="text-xs font-semibold text-slate-300">
                フィードバック・解説
              </div>
              <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                {result.feedback}
              </p>
            </div>
          )}

          {/* 次のアクションボタン */}
          <div className="flex items-center justify-end gap-2.5 pt-2">
            {!result.isPass && (
              <button
                type="button"
                onClick={() => {
                  setResult(null);
                  setErrorMessage(null);
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer border border-slate-700"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>もう一度この単語で修正する</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => drawWords(wordCount, selectedLanguage)}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-indigo-950 cursor-pointer"
            >
              <span>次の問題へ</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
