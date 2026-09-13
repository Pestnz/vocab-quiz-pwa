import React, { useState, useMemo } from 'react';
import { Lock, ArrowLeft } from 'lucide-react';
import type { AppSettings, Language } from '../../types/vocab';
import type { DiaryItem, DiarySuggestedVocab } from '../../types/diary';
import { DiaryCalendar } from './DiaryCalendar';
import { DiaryEditor } from './DiaryEditor';
import { DiaryLockModal } from './DiaryLockModal';

interface DiaryViewProps {
  diaryList: DiaryItem[];
  settings: AppSettings;
  onSaveDiary: (diary: DiaryItem) => Promise<void>;
  onDeleteDiary: (id: string) => Promise<void>;
  onAddVocabItem: (vocab: DiarySuggestedVocab, language: Language) => Promise<boolean>;
  onAddAllVocabItems: (vocabs: DiarySuggestedVocab[], language: Language) => Promise<number>;
  onExit: () => void;
  onOpenSettings: () => void;
  showToast: (message: string, type: 'info' | 'success' | 'error') => void;
}

export const DiaryView: React.FC<DiaryViewProps> = ({
  diaryList,
  settings,
  onSaveDiary,
  onDeleteDiary,
  onAddVocabItem,
  onAddAllVocabItems,
  onExit,
  onOpenSettings,
  showToast,
}) => {
  // パスワード認証状態（セッション内フラグ）
  const [isUnlocked, setIsUnlocked] = useState(() => {
    return !settings.diaryPasswordEnabled || !settings.diaryPasswordHash;
  });

  // 今日の日付
  const todayStr = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  // 選択中の日付
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  // カレンダーの表示年月
  const [currentYearMonth, setCurrentYearMonth] = useState<{ year: number; month: number }>(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });

  // 選択中の日付の日記データ
  const selectedDiary = useMemo(() => {
    return diaryList.find(item => item.date === selectedDate);
  }, [diaryList, selectedDate]);

  // パスワード保護が有効でロック中の場合
  if (settings.diaryPasswordEnabled && settings.diaryPasswordHash && !isUnlocked) {
    return (
      <DiaryLockModal
        storedPasswordHash={settings.diaryPasswordHash}
        onUnlock={() => {
          setIsUnlocked(true);
          showToast('パスワードの認証に成功しました', 'success');
        }}
        onExit={onExit}
      />
    );
  }

  return (
    <div className="space-y-4 pb-12 animate-in fade-in duration-200">
      {/* 画面トップバー */}
      <div className="flex items-center justify-between bg-slate-850/80 border border-slate-800 rounded-2xl p-3 sm:px-4 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExit}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            title="単語帳一覧に戻る"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
              <span>外国語日記 ＆ AI添削</span>
              <span className="text-[10px] px-2 py-0.2 rounded-full bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 font-mono">
                {diaryList.length} 件
              </span>
            </h2>
            <p className="text-[10px] text-slate-400">
              カレンダーから日付を選んで日記を書き、Geminiで自然な表現に添削
            </p>
          </div>
        </div>

        {/* パスワード保護中の場合の再ロックボタン */}
        {settings.diaryPasswordEnabled && settings.diaryPasswordHash && (
          <button
            type="button"
            onClick={() => {
              setIsUnlocked(false);
              showToast('日記をロックしました', 'info');
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-[11px] font-semibold border border-slate-700 transition-colors cursor-pointer"
            title="日記を再ロックする"
          >
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span>再ロック</span>
          </button>
        )}
      </div>

      {/* メインレイアウト（PCでは左右2カラム、スマホでは縦並び） */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* 左側：カレンダー */}
        <div className="lg:col-span-5 space-y-3">
          <DiaryCalendar
            currentYearMonth={currentYearMonth}
            onChangeYearMonth={(year, month) => setCurrentYearMonth({ year, month })}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            diaryList={diaryList}
          />
        </div>

        {/* 右側：選択日の日記エディタ＆添削 */}
        <div className="lg:col-span-7 min-w-0">
          <DiaryEditor
            date={selectedDate}
            existingDiary={selectedDiary}
            defaultLanguage={settings.defaultLanguage}
            apiKey={settings.geminiApiKey}
            onSaveDiary={onSaveDiary}
            onDeleteDiary={onDeleteDiary}
            onAddVocabItem={onAddVocabItem}
            onAddAllVocabItems={onAddAllVocabItems}
            onOpenSettings={onOpenSettings}
            showToast={showToast}
          />
        </div>
      </div>
    </div>
  );
};
