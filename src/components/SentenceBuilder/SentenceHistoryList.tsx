import React, { useState, useMemo } from 'react';
import {
  Volume2,
  Copy,
  Check,
  BookmarkPlus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Search,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Calendar,
} from 'lucide-react';
import type { SentencePracticeLog, VocabDatabase, Language } from '../../types/vocab';
import { speakTerm } from '../../services/speech';

interface SentenceHistoryListProps {
  history: SentencePracticeLog[];
  vocabList: VocabDatabase;
  onDeleteLog: (id: string) => void;
  onSaveExample: (wordId: string, newSentence: string, newTranslation?: string) => Promise<void> | void;
}

export const SentenceHistoryList: React.FC<SentenceHistoryListProps> = ({
  history,
  vocabList,
  onDeleteLog,
  onSaveExample,
}) => {
  // フィルター
  const [filterLang, setFilterLang] = useState<'all' | Language>('all');
  const [filterResult, setFilterResult] = useState<'all' | 'pass' | 'retry'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // コピー状態
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // 保存済み状態
  const [savedKey, setSavedKey] = useState<Record<string, boolean>>({});
  // アコーディオン開閉状態（デフォルトは最新3件開く、または全部閉じる）
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  // フィルタリング
  const filteredHistory = useMemo(() => {
    return history.filter(item => {
      if (filterLang !== 'all' && item.language !== filterLang) return false;
      if (filterResult === 'pass' && !item.result.isPass) return false;
      if (filterResult === 'retry' && item.result.isPass) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTerms = item.targetTerms.some(t => t.toLowerCase().includes(q));
        const matchUser = item.userSentence.toLowerCase().includes(q);
        const matchCorrected = item.result.naturalCorrectedText.toLowerCase().includes(q);
        const matchFeedback = item.result.feedback.toLowerCase().includes(q);
        if (!matchTerms && !matchUser && !matchCorrected && !matchFeedback) {
          return false;
        }
      }

      return true;
    });
  }, [history, filterLang, filterResult, searchQuery]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSaveToVocab = async (logId: string, wordId: string, sentence: string, userSentence: string) => {
    const key = `${logId}-${wordId}`;
    try {
      await onSaveExample(wordId, sentence, `「${userSentence}」の添削表現`);
      setSavedKey(prev => ({ ...prev, [key]: true }));
    } catch (err) {
      console.error('Failed to save example from history', err);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  // 単語IDから見出し語を取得
  const getVocabItem = (wordId: string) => {
    return vocabList.find(v => v.id === wordId);
  };

  if (history.length === 0) {
    return (
      <div className="py-16 text-center space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700/80 mx-auto flex items-center justify-center text-slate-400">
          <Calendar className="w-7 h-7" />
        </div>
        <h3 className="text-sm font-bold text-slate-200">作文履歴がまだありません</h3>
        <p className="text-xs text-slate-400 max-w-sm mx-auto">
          「作文チャレンジ」タブで指定単語を使った作文を行うと、添削文や模範解答がここに自動保存されます。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 検索・絞り込みバー */}
      <div className="bg-slate-850/60 p-3 rounded-xl border border-slate-800 space-y-2.5">
        <div className="flex flex-col sm:flex-row gap-2">
          {/* 検索入力 */}
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="単語・作成文・模範解答で検索..."
              className="w-full pl-8.5 pr-3 py-1.5 bg-slate-900 border border-slate-750 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500"
            />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* 言語フィルター */}
            <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-750 text-xs">
              <button
                onClick={() => setFilterLang('all')}
                className={`px-2 py-1 rounded-md transition-all cursor-pointer font-medium ${
                  filterLang === 'all'
                    ? 'bg-slate-750 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                すべて
              </button>
              <button
                onClick={() => setFilterLang('en')}
                className={`px-2 py-1 rounded-md transition-all cursor-pointer font-medium ${
                  filterLang === 'en'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                EN
              </button>
              <button
                onClick={() => setFilterLang('pt')}
                className={`px-2 py-1 rounded-md transition-all cursor-pointer font-medium ${
                  filterLang === 'pt'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                PT
              </button>
            </div>

            {/* 合否フィルター */}
            <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-750 text-xs">
              <button
                onClick={() => setFilterResult('all')}
                className={`px-2 py-1 rounded-md transition-all cursor-pointer font-medium ${
                  filterResult === 'all'
                    ? 'bg-slate-750 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                全結果
              </button>
              <button
                onClick={() => setFilterResult('pass')}
                className={`px-2 py-1 rounded-md transition-all cursor-pointer font-medium ${
                  filterResult === 'pass'
                    ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                合格
              </button>
              <button
                onClick={() => setFilterResult('retry')}
                className={`px-2 py-1 rounded-md transition-all cursor-pointer font-medium ${
                  filterResult === 'retry'
                    ? 'bg-amber-600/30 text-amber-300 border border-amber-500/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                要改善
              </button>
            </div>
          </div>
        </div>

        {/* 件数表示 */}
        <div className="text-[11px] text-slate-400 flex items-center justify-between px-0.5">
          <span>
            {filteredHistory.length} 件 表示中 / 全 {history.length} 件
          </span>
          <span className="text-[10px] text-slate-500">GitHub同期済み</span>
        </div>
      </div>

      {/* 履歴カード一覧 */}
      <div className="space-y-3">
        {filteredHistory.map(log => {
          const isPass = log.result.isPass;
          const isExpanded = expandedIds[log.id] ?? true; // デフォルト展開

          return (
            <div
              key={log.id}
              className={`bg-slate-900/90 rounded-xl border p-4 sm:p-5 space-y-3.5 transition-all shadow-md ${
                isPass
                  ? 'border-slate-800 hover:border-emerald-500/40'
                  : 'border-slate-800 hover:border-amber-500/40'
              }`}
            >
              {/* カード上部情報 */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  {/* 言語ラベル */}
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                      log.language === 'en'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}
                  >
                    {log.language}
                  </span>

                  {/* 合否バッジ */}
                  {isPass ? (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span>合格</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      <AlertCircle className="w-3 h-3 text-amber-400" />
                      <span>要改善</span>
                    </span>
                  )}

                  {/* スコア */}
                  <span className="text-xs font-mono font-bold text-slate-300">
                    {log.result.grammarScore}
                    <span className="text-[10px] text-slate-500 font-normal"> / 100</span>
                  </span>
                </div>

                <div className="flex items-center gap-2 text-slate-400 text-xs">
                  <span className="text-[11px] font-mono text-slate-400">
                    {formatDate(log.createdAt)}
                  </span>

                  {/* アコーディオン開閉ボタン */}
                  <button
                    onClick={() => toggleExpand(log.id)}
                    className="p-1 rounded text-slate-400 hover:text-slate-200 transition-colors"
                    title={isExpanded ? '折りたたむ' : '詳細を展開'}
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {/* 削除ボタン */}
                  <button
                    onClick={() => {
                      if (window.confirm('この作文履歴を削除しますか？')) {
                        onDeleteLog(log.id);
                      }
                    }}
                    className="p-1 rounded text-slate-500 hover:text-rose-400 transition-colors"
                    title="この履歴を削除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* 指定単語バッジ */}
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {log.targetTerms.map((term, idx) => {
                  const isUsed = log.result.usedWords.some(
                    uw => uw.toLowerCase() === term.toLowerCase()
                  );
                  return (
                    <span
                      key={idx}
                      className={`px-2 py-0.5 rounded-md text-xs font-medium flex items-center gap-1 border ${
                        isUsed
                          ? 'bg-slate-800 text-emerald-300 border-emerald-500/30'
                          : 'bg-slate-800 text-rose-300 border-rose-500/30'
                      }`}
                    >
                      {isUsed ? '✓' : '✕'} {term}
                    </span>
                  );
                })}
              </div>

              {/* 展開コンテンツ */}
              {isExpanded && (
                <div className="space-y-3 pt-1 border-t border-slate-800/80 animate-in fade-in duration-150">
                  {/* あなたの作成文 */}
                  <div className="space-y-1">
                    <div className="text-[11px] font-bold text-slate-400">あなたの作成文</div>
                    <p className="text-xs sm:text-sm text-slate-300 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 leading-relaxed select-text">
                      {log.userSentence}
                    </p>
                  </div>

                  {/* ネイティブの模範解答・リライト */}
                  <div className="space-y-1 bg-indigo-950/20 p-3 rounded-lg border border-indigo-900/40">
                    <div className="flex items-center justify-between text-[11px] text-indigo-300">
                      <span className="font-bold flex items-center gap-1">
                        <Sparkles className="w-3 h-3 text-indigo-400" />
                        模範解答（ネイティブリライト）
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => speakTerm(log.result.naturalCorrectedText, log.language)}
                          className="p-1 rounded text-indigo-300 hover:text-emerald-400 transition-colors"
                          title="発音を聞く"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopy(log.id, log.result.naturalCorrectedText)}
                          className="p-1 rounded text-indigo-300 hover:text-slate-100 transition-colors"
                          title="コピー"
                        >
                          {copiedId === log.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    <p className="text-xs sm:text-sm font-medium text-slate-100 leading-relaxed pt-0.5 select-text">
                      {log.result.naturalCorrectedText}
                    </p>

                    {/* 単語帳への例文保存ボタン */}
                    {log.targetWordIds && log.targetWordIds.length > 0 && (
                      <div className="pt-2 border-t border-indigo-900/30 mt-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[10px] text-indigo-300/80">
                          単語帳の例文に保存:
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {log.targetWordIds.map(wordId => {
                            const item = getVocabItem(wordId);
                            const label = item ? item.term : '単語';
                            const key = `${log.id}-${wordId}`;
                            const isSaved = savedKey[key];

                            return (
                              <button
                                key={wordId}
                                onClick={() =>
                                  handleSaveToVocab(
                                    log.id,
                                    wordId,
                                    log.result.naturalCorrectedText,
                                    log.userSentence
                                  )
                                }
                                disabled={isSaved}
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                                  isSaved
                                    ? 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/60 cursor-default'
                                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                                }`}
                              >
                                {isSaved ? (
                                  <>
                                    <Check className="w-2.5 h-2.5 text-emerald-400" />
                                    <span>{label}に保存済</span>
                                  </>
                                ) : (
                                  <>
                                    <BookmarkPlus className="w-2.5 h-2.5" />
                                    <span>「{label}」に保存</span>
                                  </>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* フィードバック解説 */}
                  {log.result.feedback && (
                    <div className="space-y-0.5 bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/80 text-xs">
                      <span className="text-[11px] font-bold text-slate-400 block">
                        解説・フィードバック
                      </span>
                      <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap pt-0.5">
                        {log.result.feedback}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
