import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Sparkles } from 'lucide-react';
import type { DiaryItem } from '../../types/diary';

interface DiaryCalendarProps {
  currentYearMonth: { year: number; month: number }; // month: 1-12
  onChangeYearMonth: (year: number, month: number) => void;
  selectedDate: string; // 'YYYY-MM-DD'
  onSelectDate: (date: string) => void;
  diaryList: DiaryItem[];
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export const DiaryCalendar: React.FC<DiaryCalendarProps> = ({
  currentYearMonth,
  onChangeYearMonth,
  selectedDate,
  onSelectDate,
  diaryList,
}) => {
  const { year, month } = currentYearMonth;

  // 日付ごとの日記マップ（高速引き当て用）
  const diaryMap = useMemo(() => {
    const map = new Map<string, DiaryItem>();
    for (const item of diaryList) {
      map.set(item.date, item);
    }
    return map;
  }, [diaryList]);

  // 今日の日付文字列
  const todayStr = useMemo(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }, []);

  // カレンダーグリッドセル生成
  const calendarDays = useMemo(() => {
    const firstDayOfWeek = new Date(year, month - 1, 1).getDay(); // 0(日) - 6(土)
    const daysInMonth = new Date(year, month, 0).getDate();

    // 前月の日数
    const prevMonthDays = new Date(year, month - 1, 0).getDate();

    const days: {
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      hasDiary: boolean;
      diary?: DiaryItem;
    }[] = [];

    // 1. 前月のパディング
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const dayNum = prevMonthDays - i;
      const prevM = month === 1 ? 12 : month - 1;
      const prevY = month === 1 ? year - 1 : year;
      const dateStr = `${prevY}-${String(prevM).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      days.push({
        dateStr,
        dayNum,
        isCurrentMonth: false,
        hasDiary: diaryMap.has(dateStr),
        diary: diaryMap.get(dateStr),
      });
    }

    // 2. 当月の日付
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: true,
        hasDiary: diaryMap.has(dateStr),
        diary: diaryMap.get(dateStr),
      });
    }

    // 3. 翌月のパディング（合計が7の倍数になるまで）
    const remaining = 7 - (days.length % 7);
    if (remaining < 7) {
      for (let d = 1; d <= remaining; d++) {
        const nextM = month === 12 ? 1 : month + 1;
        const nextY = month === 12 ? year + 1 : year;
        const dateStr = `${nextY}-${String(nextM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        days.push({
          dateStr,
          dayNum: d,
          isCurrentMonth: false,
          hasDiary: diaryMap.has(dateStr),
          diary: diaryMap.get(dateStr),
        });
      }
    }

    return days;
  }, [year, month, diaryMap]);

  const handlePrevMonth = () => {
    if (month === 1) {
      onChangeYearMonth(year - 1, 12);
    } else {
      onChangeYearMonth(year, month - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      onChangeYearMonth(year + 1, 1);
    } else {
      onChangeYearMonth(year, month + 1);
    }
  };

  const handleToday = () => {
    const d = new Date();
    onChangeYearMonth(d.getFullYear(), d.getMonth() + 1);
    onSelectDate(todayStr);
  };

  return (
    <div className="bg-slate-850/80 border border-slate-800 rounded-2xl p-3 sm:p-4 shadow-md">
      {/* カレンダーヘッダー */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-emerald-400" />
          <span className="font-bold text-sm text-slate-100">
            {year}年 {month}月
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleToday}
            className="px-2 py-1 text-[10px] font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors mr-1 cursor-pointer"
          >
            今日
          </button>
          <button
            type="button"
            onClick={handlePrevMonth}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
            title="前月"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleNextMonth}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
            title="翌月"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 曜日ヘッダー */}
      <div className="grid grid-cols-7 gap-1 text-center mb-1">
        {WEEKDAYS.map((w, idx) => (
          <div
            key={w}
            className={`text-[10px] font-semibold py-0.5 ${
              idx === 0 ? 'text-rose-400' : idx === 6 ? 'text-sky-400' : 'text-slate-400'
            }`}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 日付グリッド */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {calendarDays.map((item, idx) => {
          const isSelected = item.dateStr === selectedDate;
          const isToday = item.dateStr === todayStr;
          const colIndex = idx % 7;

          return (
            <button
              key={item.dateStr}
              type="button"
              onClick={() => onSelectDate(item.dateStr)}
              className={`min-h-[46px] p-1 rounded-xl flex flex-col items-center justify-between transition-all cursor-pointer relative ${
                isSelected
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950 font-bold'
                  : item.isCurrentMonth
                  ? 'hover:bg-slate-800 text-slate-200'
                  : 'text-slate-550 hover:bg-slate-850/40 opacity-40'
              } ${isToday && !isSelected ? 'border border-emerald-500/60 font-semibold' : ''}`}
            >
              <div className="flex items-center justify-between w-full">
                <span
                  className={`text-[11px] ${
                    !isSelected && colIndex === 0
                      ? 'text-rose-400'
                      : !isSelected && colIndex === 6
                      ? 'text-sky-400'
                      : ''
                  }`}
                >
                  {item.dayNum}
                </span>

                {isToday && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isSelected ? 'bg-white' : 'bg-emerald-400'
                    }`}
                  />
                )}
              </div>

              {/* 日記インジケーター */}
              <div className="h-4 flex items-center justify-center w-full">
                {item.hasDiary && (
                  <span
                    className={`px-1 py-0.2 rounded-md text-[8px] font-bold tracking-tight uppercase flex items-center gap-0.5 ${
                      isSelected
                        ? 'bg-white text-emerald-750 font-black'
                        : item.diary?.language === 'pt'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    <Sparkles className="w-2 h-2" />
                    <span>{item.diary?.language === 'pt' ? 'PT' : 'EN'}</span>
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
