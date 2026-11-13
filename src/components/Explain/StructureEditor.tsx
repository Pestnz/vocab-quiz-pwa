import React, { useState } from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import type { PassageSentence, SentenceStructure, StructureToken } from '../../types/explain';
import {
  GROUP_LABEL,
  GROUP_TYPES,
  POS_LIST,
  ROLES,
  ROLE_LABEL,
  applyGroup,
  bracketsOf,
  groupMarks,
  mergeTokenWithNext,
  splitTokenAtSpaces,
  tokenizeEnglish,
  tokensMatchSentence,
} from '../../services/explainStructure';
import type { GroupType, Role } from '../../services/explainStructure';

interface StructureEditorProps {
  sentence: PassageSentence;
  onChange: (patch: Partial<PassageSentence>) => void;
}

const sel = 'bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-[11px] text-slate-100 w-full';
const tbtn =
  'px-1.5 py-0.5 rounded text-[11px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 cursor-pointer disabled:opacity-40';

const GROUP_COLOR: Record<GroupType, string> = {
  noun: 'text-emerald-300',
  clause: 'text-emerald-300',
  adv: 'text-sky-300',
  adj: 'text-amber-300',
  'to-inf': 'text-amber-300',
  ing: 'text-amber-300',
};

/** 1文の品詞分解の編集: 語ごとの品詞・役割、かっこ付け、語のつなぎ・分け、メモ、確認済み */
export const StructureEditor: React.FC<StructureEditorProps> = ({ sentence, onChange }) => {
  const structure = sentence.structure;
  const tokens: StructureToken[] = structure?.tokens ?? [];
  const [range, setRange] = useState<{ from: number; to: number } | null>(null);

  const commit = (next: StructureToken[], note: string | undefined = structure?.note) => {
    const s: SentenceStructure = { tokens: next, note };
    onChange({ structure: next.length > 0 ? s : undefined });
  };

  const updateToken = (i: number, patch: Partial<StructureToken>) =>
    commit(tokens.map((t, k) => (k === i ? { ...t, ...patch } : t)));

  const rebuild = () => {
    // 品詞・役割が空になるので、確認済みの印も外す(メモは残す)
    onChange({ structure: { tokens: tokenizeEnglish(sentence.en), note: structure?.note }, structureReviewed: false });
    setRange(null);
  };

  const pickToken = (i: number, shift: boolean) => {
    if (shift && range) setRange({ from: range.from, to: i });
    else if (range && range.from === i && range.to === i) setRange(null);
    else setRange({ from: i, to: i });
  };

  const a = range ? Math.min(range.from, range.to) : -1;
  const b = range ? Math.max(range.from, range.to) : -1;
  const inRange = (i: number) => range !== null && i >= a && i <= b;

  const doGroup = (type: GroupType | null) => {
    if (!range) return;
    commit(applyGroup(tokens, a, b, type));
  };

  const doMerge = () => {
    if (!range || a === b) return;
    let next = tokens;
    for (let k = b - 1; k >= a; k--) next = mergeTokenWithNext(next, k) ?? next;
    commit(next);
    setRange({ from: a, to: a });
  };

  const marks = groupMarks(tokens);
  const mismatch = tokens.length > 0 && !tokensMatchSentence(sentence.en, tokens);

  return (
    <div className="rounded border border-slate-700 bg-slate-950/60 p-2 space-y-2" aria-label="品詞分解の編集">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="font-semibold text-slate-200">品詞分解</span>
        <button className={tbtn} onClick={rebuild} title="英文を空白で語に分け直します(品詞・役割は空になります。AIは使いません)">
          <RefreshCw className="w-3 h-3 inline mr-0.5" />
          英文から語を作り直す
        </button>
        {tokens.length > 0 && (
          <>
            <button
              className={`${tbtn} hover:!text-rose-300`}
              onClick={() => {
                if (window.confirm('この文の品詞分解を消しますか?(英文・全訳は消えません)')) {
                  onChange({ structure: undefined, structureReviewed: undefined });
                  setRange(null);
                }
              }}
            >
              <Trash2 className="w-3 h-3 inline mr-0.5" />
              品詞分解を消す
            </button>
            <label className="flex items-center gap-1 text-slate-300 cursor-pointer" title="内容を確認したらチェック(AIの下書きは未確認で入ります)">
              <input
                type="checkbox"
                checked={Boolean(sentence.structureReviewed)}
                onChange={(e) => onChange({ structureReviewed: e.target.checked })}
                aria-label="品詞分解を確認済みにする"
              />
              品詞分解を確認済み
            </label>
          </>
        )}
      </div>

      {mismatch && (
        <p className="flex items-center gap-1 text-[11px] text-amber-300">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          語をつなげた文が、いまの英文と一致しません(英文を直したあとなど)。語を直すか、「英文から語を作り直す」を押してください。
        </p>
      )}

      {tokens.length === 0 ? (
        <p className="text-[11px] text-slate-500">この文には、まだ品詞分解がありません。「品詞分解を作る(AI)」か、「英文から語を作り直す」で始められます。</p>
      ) : (
        <>
          <p className="text-[10px] text-slate-500">
            語の枠をクリックで選択、Shiftを押しながらクリックで範囲選択。選んだ語を、かっこで囲んだり、つないだりできます。語の欄に空白を入れて確定すると、2語に分かれます。
          </p>
          <div className="flex flex-wrap gap-x-1 gap-y-2">
            {tokens.map((t, i) => (
              <div key={i} className="flex items-start">
                {marks.open[i].map((g, k) => (
                  <span key={`o${k}`} className={`font-mono text-base leading-6 ${GROUP_COLOR[g]}`}>{bracketsOf(g)[0]}</span>
                ))}
                <div
                  className={`w-[5.2rem] rounded border p-1 space-y-0.5 cursor-pointer ${
                    inRange(i) ? 'border-sky-400 bg-sky-950/40' : 'border-slate-700 bg-slate-900'
                  }`}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).tagName === 'DIV' || (e.target as HTMLElement).tagName === 'SPAN') pickToken(i, e.shiftKey);
                  }}
                  title="枠のすきまをクリックで選択(Shiftで範囲選択)"
                >
                  <input
                    value={t.text}
                    onChange={(e) => updateToken(i, { text: e.target.value })}
                    onBlur={() => {
                      const split = splitTokenAtSpaces(tokens, i);
                      if (split) commit(split);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`語${i + 1}`}
                    className="w-full bg-transparent text-xs font-serif text-slate-100 border-b border-slate-700 focus:outline-none focus:border-emerald-500"
                  />
                  <select
                    value={t.pos ?? ''}
                    onChange={(e) => updateToken(i, { pos: e.target.value || undefined })}
                    onClick={(e) => e.stopPropagation()}
                    className={sel}
                    aria-label={`語${i + 1}の品詞`}
                  >
                    <option value="">品詞</option>
                    {t.pos && !POS_LIST.includes(t.pos) && <option value={t.pos}>{t.pos}</option>}
                    {POS_LIST.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <select
                    value={t.role ?? ''}
                    onChange={(e) => updateToken(i, { role: (e.target.value || undefined) as Role | undefined })}
                    onClick={(e) => e.stopPropagation()}
                    className={sel}
                    aria-label={`語${i + 1}の役割`}
                  >
                    <option value="">役割</option>
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </div>
                {marks.close[i].map((g, k) => (
                  <span key={`c${k}`} className={`font-mono text-base leading-6 ${GROUP_COLOR[g]}`}>{bracketsOf(g)[1]}</span>
                ))}
              </div>
            ))}
          </div>

          {range && (
            <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-300">
              <span>選んだ語({b - a + 1}語):</span>
              {GROUP_TYPES.map((g) => (
                <button key={g} className={tbtn} onClick={() => doGroup(g)}>
                  {GROUP_LABEL[g]}
                </button>
              ))}
              <button className={tbtn} onClick={() => doGroup(null)}>
                かっこを外す
              </button>
              <button className={tbtn} onClick={doMerge} disabled={a === b} title="選んだ語を、1つの語にまとめる">
                1語につなぐ
              </button>
              <button className={tbtn} onClick={() => setRange(null)}>
                選択をやめる
              </button>
            </div>
          )}

          <label className="block text-[11px] text-slate-400">
            文法ポイントのメモ(印刷に出ます)
            <textarea
              value={structure?.note ?? ''}
              onChange={(e) => commit(tokens, e.target.value || undefined)}
              rows={2}
              aria-label="文法ポイントのメモ"
              className="mt-0.5 w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
            />
          </label>
        </>
      )}
    </div>
  );
};
