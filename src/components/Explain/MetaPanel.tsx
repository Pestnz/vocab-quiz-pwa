import React from 'react';
import type { ExamStatus, LocalExplainDoc } from '../../types/explain';
import { STATUS_LABEL, STATUS_ORDER, eraLabelFromYear, suggestTitle } from '../../services/explainMeta';

interface MetaPanelProps {
  doc: LocalExplainDoc;
  onChange: (patch: Partial<LocalExplainDoc>) => void;
}

const input = 'bg-slate-800 border border-slate-700 rounded-md px-2 py-1.5 text-xs text-slate-100';

/** 年度・県・試験区分・状態の編集欄 */
export const MetaPanel: React.FC<MetaPanelProps> = ({ doc, onChange }) => {
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2 px-3 py-2 border-b border-slate-800 bg-slate-900/80 text-xs text-slate-300">
      <label className="flex flex-col gap-1">
        年度(西暦)
        <input
          type="number"
          min={1989}
          max={2100}
          value={doc.year || ''}
          placeholder="2025"
          onChange={(e) => {
            const y = Number(e.target.value);
            const valid = Number.isFinite(y) && y > 0;
            const wasAuto = doc.eraLabel === eraLabelFromYear(doc.year);
            onChange({
              year: valid ? y : 0,
              ...(wasAuto || !doc.eraLabel ? { eraLabel: valid ? eraLabelFromYear(y) : '' } : {}),
            });
          }}
          className={`${input} w-24`}
        />
      </label>
      <label className="flex flex-col gap-1">
        年度の表記
        <input
          value={doc.eraLabel}
          placeholder="令和7年度"
          onChange={(e) => onChange({ eraLabel: e.target.value })}
          className={`${input} w-28`}
        />
      </label>
      <label className="flex flex-col gap-1">
        県
        <input
          value={doc.prefecture}
          placeholder="千葉"
          onChange={(e) => onChange({ prefecture: e.target.value })}
          className={`${input} w-24`}
        />
      </label>
      <label className="flex flex-col gap-1">
        試験区分
        <input
          value={doc.examType}
          placeholder="本検査"
          onChange={(e) => onChange({ examType: e.target.value })}
          className={`${input} w-24`}
        />
      </label>
      <label className="flex flex-col gap-1">
        状態
        <select
          value={doc.status}
          onChange={(e) => onChange({ status: e.target.value as ExamStatus })}
          className={input}
        >
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <button
        onClick={() => onChange({ title: suggestTitle(doc) })}
        className="px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 cursor-pointer"
        title="年度・県・区分からタイトルを作る"
      >
        タイトルを自動で作る
      </button>
    </div>
  );
};
