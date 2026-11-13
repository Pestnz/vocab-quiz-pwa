import React, { useState } from 'react';
import { ArrowUp, ArrowDown, Trash2, ChevronDown, ChevronRight, Plus, X, AlertTriangle } from 'lucide-react';
import type { ChoiceExplanation, Question, QuestionType } from '../../types/explain';
import {
  QUESTION_TYPES,
  QUESTION_TYPE_LABEL,
  createChoice,
  defaultChoices,
  isRichEmpty,
} from '../../services/explainSections';
import { RichField } from './RichField';

interface QuestionCardProps {
  question: Question;
  defaultOpen?: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (patch: Partial<Question>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}

const field = 'bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100';
const area = `${field} w-full min-h-[3rem]`;
const lab = 'block text-[11px] text-slate-400 mb-0.5';

export const QuestionCard: React.FC<QuestionCardProps> = ({
  question: q,
  defaultOpen = false,
  canMoveUp,
  canMoveDown,
  onChange,
  onMove,
  onDelete,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const choices = q.choices ?? [];
  const missing = q.type === 'choice' ? choices.filter((c) => isRichEmpty(c.reason)).length : 0;

  const setChoice = (id: string, patch: Partial<ChoiceExplanation>) =>
    onChange({ choices: choices.map((c) => (c.id === id ? { ...c, ...patch } : c)) });

  const changeType = (type: QuestionType) => {
    onChange({ type, ...(type === 'choice' && choices.length === 0 ? { choices: defaultChoices() } : {}) });
  };

  const setModelAnswers = (arr: string[]) => onChange({ modelAnswers: arr });
  const showWriting = q.type === 'composition' || q.type === 'fillBlank' || q.type === 'reorder' || q.type === 'inflection';

  const iconBtn = 'p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-700 disabled:opacity-30 cursor-pointer';

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/70">
      <div className="flex flex-wrap items-center gap-2 px-2 py-1.5">
        <button className={iconBtn} onClick={() => setOpen((v) => !v)} title={open ? '閉じる' : '開く'}>
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <input
          value={q.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="(1)"
          aria-label="設問番号"
          className={`${field} w-16`}
        />
        <select value={q.type} onChange={(e) => changeType(e.target.value as QuestionType)} aria-label="設問の形式" className={field}>
          {QUESTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {QUESTION_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-[11px] text-slate-400">
          正解
          <input
            value={q.correctAnswer}
            onChange={(e) => onChange({ correctAnswer: e.target.value })}
            placeholder={q.type === 'reorder' ? 'ア→エ→イ→ウ→オ' : 'ウ'}
            aria-label="正解"
            className={`${field} w-32`}
          />
        </label>
        <label className="flex items-center gap-1 text-[11px] text-slate-400">
          配点
          <input
            type="number"
            min={0}
            value={q.points ?? ''}
            onChange={(e) => onChange({ points: e.target.value === '' ? undefined : Number(e.target.value) })}
            aria-label="配点"
            className={`${field} w-14`}
          />
        </label>
        {missing > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-amber-400" title="選択肢の理由が未入力です">
            <AlertTriangle className="w-3.5 h-3.5" />
            理由未入力 {missing}
          </span>
        )}
        <span className="ml-auto flex items-center">
          <button className={iconBtn} disabled={!canMoveUp} onClick={() => onMove(-1)} title="上へ">
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <button className={iconBtn} disabled={!canMoveDown} onClick={() => onMove(1)} title="下へ">
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button className={`${iconBtn} hover:!text-rose-300`} onClick={onDelete} title="この設問を削除">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </span>
      </div>

      {open && (
        <div className="px-3 pb-3 space-y-3 border-t border-slate-800 pt-2">
          <div>
            <label className={lab}>設問の要点(任意。問題文の転載は最小限に)</label>
            <textarea
              value={q.prompt ?? ''}
              onChange={(e) => onChange({ prompt: e.target.value })}
              className={area}
              rows={2}
            />
          </div>

          <div>
            <label className={lab}>解説</label>
            <RichField value={q.explanation} onChange={(v) => onChange({ explanation: v })} placeholder="解説を入力(クリックして編集)" />
          </div>

          {q.type === 'choice' && (
            <div>
              <label className={lab}>選択肢ごとの○×と理由(すべての選択肢に理由が必要です)</label>
              <div className="space-y-2">
                {choices.map((c) => (
                  <div key={c.id} className="flex items-start gap-2">
                    <input
                      value={c.label}
                      onChange={(e) => setChoice(c.id, { label: e.target.value })}
                      aria-label="選択肢の記号"
                      className={`${field} w-10 text-center`}
                    />
                    <button
                      onClick={() => setChoice(c.id, { isCorrect: !c.isCorrect })}
                      title="クリックで ○ / × を切り替え"
                      className={`w-8 h-7 shrink-0 rounded text-sm font-bold cursor-pointer ${
                        c.isCorrect ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {c.isCorrect ? '○' : '×'}
                    </button>
                    <div className="flex-1 min-w-0">
                      <RichField
                        value={c.reason}
                        onChange={(v) => setChoice(c.id, { reason: v })}
                        placeholder={c.isCorrect ? '正解の根拠' : '誤りの理由'}
                        invalid={isRichEmpty(c.reason)}
                      />
                    </div>
                    <button
                      className={`${iconBtn} mt-0.5`}
                      title="この選択肢を削除"
                      onClick={() => onChange({ choices: choices.filter((x) => x.id !== c.id) })}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  className="flex items-center gap-1 text-xs text-slate-300 hover:text-white cursor-pointer"
                  onClick={() => onChange({ choices: [...choices, createChoice(String.fromCharCode(65 + choices.length))] })}
                >
                  <Plus className="w-3.5 h-3.5" />
                  選択肢を追加
                </button>
              </div>
            </div>
          )}

          {showWriting && (
            <div className="space-y-2">
              {(q.type === 'composition' || q.type === 'fillBlank') && (
                <div>
                  <label className={lab}>模範解答(複数入れられます)</label>
                  <div className="space-y-1">
                    {(q.modelAnswers ?? []).map((m, i) => (
                      <div key={i} className="flex gap-1">
                        <textarea
                          value={m}
                          onChange={(e) => setModelAnswers((q.modelAnswers ?? []).map((x, j) => (j === i ? e.target.value : x)))}
                          className={area}
                          rows={2}
                        />
                        <button
                          className={iconBtn}
                          title="削除"
                          onClick={() => setModelAnswers((q.modelAnswers ?? []).filter((_, j) => j !== i))}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <button
                      className="flex items-center gap-1 text-xs text-slate-300 hover:text-white cursor-pointer"
                      onClick={() => setModelAnswers([...(q.modelAnswers ?? []), ''])}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      模範解答を追加
                    </button>
                  </div>
                </div>
              )}
              {q.type === 'composition' && (
                <div className="flex flex-wrap items-end gap-3">
                  <label className="text-[11px] text-slate-400">
                    語数(最小)
                    <input
                      type="number"
                      min={0}
                      value={q.wordLimit?.min ?? ''}
                      onChange={(e) =>
                        onChange({ wordLimit: { ...q.wordLimit, min: e.target.value === '' ? undefined : Number(e.target.value) } })
                      }
                      className={`${field} w-16 ml-1`}
                    />
                  </label>
                  <label className="text-[11px] text-slate-400">
                    語数(最大)
                    <input
                      type="number"
                      min={0}
                      value={q.wordLimit?.max ?? ''}
                      onChange={(e) =>
                        onChange({ wordLimit: { ...q.wordLimit, max: e.target.value === '' ? undefined : Number(e.target.value) } })
                      }
                      className={`${field} w-16 ml-1`}
                    />
                  </label>
                </div>
              )}
              <div>
                <label className={lab}>採点基準・部分点の考え方</label>
                <textarea
                  value={q.scoringNotes ?? ''}
                  onChange={(e) => onChange({ scoringNotes: e.target.value })}
                  className={area}
                  rows={2}
                />
              </div>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className={`${lab} text-amber-400/90`}>よくある誤答(講師用・生徒用には印刷されません)</label>
              <textarea
                value={q.commonErrors ?? ''}
                onChange={(e) => onChange({ commonErrors: e.target.value })}
                className={area}
                rows={2}
              />
            </div>
            <div>
              <label className={`${lab} text-amber-400/90`}>講師メモ(生徒用には印刷されません)</label>
              <textarea
                value={q.teacherNote ?? ''}
                onChange={(e) => onChange({ teacherNote: e.target.value })}
                className={area}
                rows={2}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
