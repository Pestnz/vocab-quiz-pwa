import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BrainCircuit, Clock } from 'lucide-react';
import { Header } from './components/Layout/Header';
import { QuickAddBar } from './components/Vocab/QuickAddBar';
import { VocabFilter } from './components/Vocab/VocabFilter';
import { VocabList } from './components/Vocab/VocabList';
import { VocabEditModal } from './components/Vocab/VocabEditModal';
import { FlashcardQuiz } from './components/Quiz/FlashcardQuiz';
import { SettingsModal } from './components/Settings/SettingsModal';
import type {
  VocabItem,
  VocabDatabase,
  AppSettings,
  SyncStatusState,
  FilterLanguage,
  FilterType,
} from './types/vocab';
import {
  getStoredSettings,
  saveStoredSettings,
  getCachedVocab,
  setCachedVocab,
} from './services/storage';
import { githubSyncService } from './services/githubSync';
import { analyzeVocabularyBatch } from './services/gemini';

export const App: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>(getStoredSettings);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [vocabList, setVocabList] = useState<VocabDatabase>(getCachedVocab);

  const [syncStatus, setSyncStatus] = useState<SyncStatusState>(() => {
    const s = getStoredSettings();
    return s.githubToken && s.repoOwner && s.repoName ? 'synced' : 'unconfigured';
  });
  const [lastSyncedAt, setLastSyncedAt] = useState<string | undefined>(undefined);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  const [currentView, setCurrentView] = useState<'list' | 'quiz'>('list');
  
  // 追加処理中および進捗表示
  const [isAdding, setIsAdding] = useState(false);
  const [addingProgressText, setAddingProgressText] = useState<string | undefined>(undefined);

  const [editingItem, setEditingItem] = useState<VocabItem | null>(null);

  const [filterLang, setFilterLang] = useState<FilterLanguage>('all');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(prev => (prev?.message === message ? null : prev));
    }, 3500);
  }, []);

  const syncWithRemote = useCallback(async (currentSettings: AppSettings, showNotification = false) => {
    if (!currentSettings.githubToken || !currentSettings.repoOwner || !currentSettings.repoName) {
      setSyncStatus('unconfigured');
      return;
    }

    try {
      setSyncStatus('syncing');
      setErrorMessage(undefined);
      const res = await githubSyncService.fetchVocab(currentSettings);

      setVocabList(prevLocal => {
        const merged = githubSyncService.mergeVocabDatabases(prevLocal, res.data);
        setCachedVocab(merged, res.sha || undefined);
        return merged;
      });

      setSyncStatus('synced');
      setLastSyncedAt(new Date().toISOString());
      if (showNotification) {
        showToast('GitHubから最新データを取得しました', 'success');
      }
    } catch (e: unknown) {
      const err = e as Error;
      console.error('Sync failed', err);
      setSyncStatus('error');
      setErrorMessage(err.message);
      if (showNotification) {
        showToast(`同期エラー: ${err.message}`, 'error');
      }
    }
  }, [showToast]);

  useEffect(() => {
    syncWithRemote(settings, false);
  }, [syncWithRemote, settings]);

  useEffect(() => {
    const handleFocus = () => {
      if (settings.githubToken && settings.repoOwner && settings.repoName) {
        console.log('Window focused: re-syncing with GitHub...');
        syncWithRemote(settings, false);
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [settings, syncWithRemote]);

  const pushToRemote = useCallback(async (
    updatedList: VocabDatabase,
    commitMessage: string
  ) => {
    if (!settings.githubToken || !settings.repoOwner || !settings.repoName) {
      setSyncStatus('unconfigured');
      return;
    }

    try {
      setSyncStatus('syncing');
      const res = await githubSyncService.pushVocab(updatedList, settings, commitMessage);
      setSyncStatus('synced');
      setLastSyncedAt(new Date().toISOString());
      setErrorMessage(undefined);
      setCachedVocab(updatedList, res.sha);
    } catch (e: unknown) {
      const err = e as Error;
      console.error('Push failed', err);
      setSyncStatus('error');
      setErrorMessage(err.message);
      showToast(`GitHub保存エラー: ${err.message}`, 'error');
    }
  }, [settings, showToast]);

  // 単語の追加（単一または一括）
  const handleAddVocab = async (sourceText: string, preferredLang: 'auto' | 'en' | 'pt') => {
    if (!settings.geminiApiKey) {
      setIsSettingsOpen(true);
      showToast('Gemini API Keyを設定してください', 'info');
      return;
    }

    // 改行で分割して有効な単語リストを抽出
    const rawLines = sourceText.split('\n').map(s => s.trim()).filter(Boolean);
    if (rawLines.length === 0) return;

    setIsAdding(true);
    setAddingProgressText(rawLines.length > 1 ? `0 / ${rawLines.length} 件 解析中...` : 'AI解析中...');

    try {
      // 1. Gemini API 一括解析（複数件でも自動チャンク処理）
      const analysisList = await analyzeVocabularyBatch(
        rawLines,
        settings.geminiApiKey,
        preferredLang,
        (current, total) => {
          setAddingProgressText(`${current} / ${total} 件 解析中...`);
        }
      );

      // 2. VocabItem リストを生成
      const now = new Date().toISOString();
      const newItems: VocabItem[] = analysisList.map((analysis, idx) => ({
        id: typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `item-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 7)}`,
        language: analysis.language,
        type: analysis.type,
        sourceText: rawLines[idx] || analysis.term,
        term: analysis.term,
        meaning: analysis.meaning,
        explanation: analysis.explanation,
        exampleSentence: analysis.example_sentence,
        exampleTranslation: analysis.example_translation,
        proficiency: 0,
        nextReviewAt: now,
        createdAt: now,
        updatedAt: now,
      }));

      // 3. 楽観的UI更新（先頭に追加）
      const nextList = [...newItems, ...vocabList];
      setVocabList(nextList);
      setCachedVocab(nextList);

      if (newItems.length === 1) {
        showToast(`「${newItems[0].term}」を追加しました`, 'success');
      } else {
        showToast(`${newItems.length}件の単語を一括追加しました`, 'success');
      }

      // 4. GitHubへ一括コミットプッシュ（1回のみ実行）
      const commitMsg = newItems.length === 1
        ? `feat(vocab): add "${newItems[0].term}"`
        : `feat(vocab): batch add ${newItems.length} items`;

      await pushToRemote(nextList, commitMsg);
    } catch (err: unknown) {
      const e = err as Error;
      console.error('Failed to add vocab', e);
      showToast(e.message || '単語の追加に失敗しました', 'error');
      throw e;
    } finally {
      setIsAdding(false);
      setAddingProgressText(undefined);
    }
  };

  const handleSaveEdit = (updatedItem: VocabItem) => {
    const nextList = vocabList.map(item => (item.id === updatedItem.id ? updatedItem : item));
    setVocabList(nextList);
    setCachedVocab(nextList);
    showToast(`「${updatedItem.term}」を更新しました`, 'success');
    pushToRemote(nextList, `fix(vocab): update "${updatedItem.term}"`);
  };

  const handleDeleteItem = (id: string) => {
    const target = vocabList.find(i => i.id === id);
    const nextList = vocabList.filter(item => item.id !== id);
    setVocabList(nextList);
    setCachedVocab(nextList);
    showToast(`「${target?.term || '単語'}」を削除しました`, 'info');
    pushToRemote(nextList, `refactor(vocab): remove "${target?.term || id}"`);
  };

  const handleUpdateFromQuiz = useCallback((updatedItem: VocabItem) => {
    setVocabList(prev => {
      const nextList = prev.map(item => (item.id === updatedItem.id ? updatedItem : item));
      setCachedVocab(nextList);
      pushToRemote(nextList, `sync: review "${updatedItem.term}" (level ${updatedItem.proficiency})`);
      return nextList;
    });
  }, [pushToRemote]);

  const handleSaveSettings = (newSettings: AppSettings) => {
    setSettings(newSettings);
    saveStoredSettings(newSettings);
    showToast('設定を保存しました', 'success');
    if (newSettings.githubToken && newSettings.repoOwner && newSettings.repoName) {
      syncWithRemote(newSettings, true);
    } else {
      setSyncStatus('unconfigured');
    }
  };

  const dueCount = useMemo(() => {
    const now = Date.now();
    return vocabList.filter(item => {
      if (!item.nextReviewAt) return true;
      return new Date(item.nextReviewAt).getTime() <= now;
    }).length;
  }, [vocabList]);

  const filteredVocab = useMemo(() => {
    return vocabList.filter(item => {
      if (filterLang !== 'all' && item.language !== filterLang) return false;
      if (filterType !== 'all' && item.type !== filterType) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchTerm = item.term.toLowerCase().includes(q);
        const matchMeaning = item.meaning.toLowerCase().includes(q);
        const matchEx = item.exampleSentence?.toLowerCase().includes(q);
        const matchExpl = item.explanation?.toLowerCase().includes(q);
        if (!matchTerm && !matchMeaning && !matchEx && !matchExpl) return false;
      }
      return true;
    });
  }, [vocabList, filterLang, filterType, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans w-full relative safe-bottom">
      {toast && (
        <div
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 3.25rem)' }}
          className={`fixed left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl text-xs font-semibold shadow-2xl transition-all animate-in fade-in slide-in-from-top-2 duration-150 flex items-center gap-2 max-w-[90%] ${
            toast.type === 'success'
              ? 'bg-emerald-600 text-white shadow-emerald-950/80 border border-emerald-500'
              : toast.type === 'error'
              ? 'bg-rose-600 text-white shadow-rose-950/80 border border-rose-500'
              : 'bg-slate-800 text-slate-200 border border-slate-700 shadow-black'
          }`}
        >
          <span>{toast.message}</span>
        </div>
      )}

      <Header
        currentView={currentView}
        onViewChange={setCurrentView}
        syncStatus={syncStatus}
        lastSyncedAt={lastSyncedAt}
        errorMessage={errorMessage}
        onManualSync={() => syncWithRemote(settings, true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        totalCount={vocabList.length}
      />

      <main className="flex-1 w-full max-w-7xl mx-auto flex flex-col min-h-0">
        {currentView === 'list' ? (
          <>
            {/* モバイル / 画面分割時 (< md: 768px): 1カラム */}
            <div className="md:hidden flex flex-col flex-1">
              <QuickAddBar
                onAdd={handleAddVocab}
                isLoading={isAdding}
                progressText={addingProgressText}
                hasApiKey={Boolean(settings.geminiApiKey)}
                onOpenSettings={() => setIsSettingsOpen(true)}
              />

              <VocabFilter
                language={filterLang}
                onLanguageChange={setFilterLang}
                type={filterType}
                onTypeChange={setFilterType}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
              />

              <div className="flex-1">
                <VocabList
                  items={filteredVocab}
                  totalCount={vocabList.length}
                  onEdit={setEditingItem}
                  onDelete={handleDeleteItem}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                />
              </div>
            </div>

            {/* PCワイド画面時 (≥ md: 768px): 2カラム */}
            <div className="hidden md:flex flex-row items-start gap-6 p-6 flex-1 min-h-0">
              <div className="w-80 lg:w-96 shrink-0 space-y-4 sticky top-16">
                <QuickAddBar
                  onAdd={handleAddVocab}
                  isLoading={isAdding}
                  progressText={addingProgressText}
                  hasApiKey={Boolean(settings.geminiApiKey)}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                />

                <VocabFilter
                  language={filterLang}
                  onLanguageChange={setFilterLang}
                  type={filterType}
                  onTypeChange={setFilterType}
                  searchQuery={searchQuery}
                  onSearchChange={setSearchQuery}
                />

                <div className="bg-slate-850 p-4 rounded-xl border border-slate-800 space-y-3 shadow-md">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-300">本日の学習状況</span>
                    <span className="text-[10px] text-slate-400 font-mono">Spaced Repetition</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-center text-xs">
                    <div className="bg-slate-900/60 p-2 rounded-lg border border-slate-800/80">
                      <div className="text-[10px] text-slate-400">総登録数</div>
                      <div className="text-base font-bold text-slate-100">{vocabList.length}</div>
                    </div>
                    <div className="bg-indigo-950/40 p-2 rounded-lg border border-indigo-900/50">
                      <div className="text-[10px] text-indigo-300 flex items-center justify-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>復習待ち</span>
                      </div>
                      <div className="text-base font-bold text-indigo-300">{dueCount}</div>
                    </div>
                  </div>

                  <button
                    onClick={() => setCurrentView('quiz')}
                    disabled={vocabList.length === 0}
                    className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-950 disabled:opacity-40 cursor-pointer"
                  >
                    <BrainCircuit className="w-4 h-4" />
                    <span>フラッシュカードで復習する</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 min-w-0 bg-slate-850/40 rounded-2xl border border-slate-800/80 p-2 sm:p-4 min-h-[500px]">
                <VocabList
                  items={filteredVocab}
                  totalCount={vocabList.length}
                  onEdit={setEditingItem}
                  onDelete={handleDeleteItem}
                  onOpenSettings={() => setIsSettingsOpen(true)}
                />
              </div>
            </div>
          </>
        ) : (
          <FlashcardQuiz
            vocabList={vocabList}
            onUpdateItem={handleUpdateFromQuiz}
            onExit={() => setCurrentView('list')}
          />
        )}
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSave={handleSaveSettings}
      />

      <VocabEditModal
        isOpen={Boolean(editingItem)}
        item={editingItem}
        onClose={() => setEditingItem(null)}
        onSave={handleSaveEdit}
      />
    </div>
  );
};

export default App;
