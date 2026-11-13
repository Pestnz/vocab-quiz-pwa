import React, { useMemo, useRef, useState } from 'react';
import { X, ClipboardPaste, ScanText, Loader2, AlertTriangle, Settings2 } from 'lucide-react';
import type { ExamSection } from '../../types/explain';
import {
  STATUS_TEXT,
  applyDiff,
  buildDiff,
  parsePastedKey,
} from '../../services/answerKey';
import type { DiffRow, KeyRow } from '../../services/answerKey';
import { readAnswerKeyImages } from '../../services/answerKeyAi';
import { AiError, planFor } from '../../services/aiRouter';
import { countPdfPages, imageFileToJpeg, parsePageSpec, renderPdfPages } from '../../services/pdfImages';
import type { PageImage } from '../../services/pdfImages';
import { bySectionOrder } from '../../services/explainSections';

interface AnswerKeyImportProps {
  sections: ExamSection[];
  defaultSectionId: string | null;
  onApply: (next: ExamSection[]) => void;
  onClose: () => void;
  onOpenAiSettings: () => void;
}

type Tab = 'paste' | 'ai';

const field = 'bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100';
const STATUS_STYLE: Record<DiffRow['status'], string> = {
  same: 'text-slate-500',
  changed: 'text-amber-300',
  new: 'text-emerald-300',
  unmatched: 'text-rose-300',
};

const PASTE_EXAMPLE = `大問5
(1) ウ 2
(2) イ 2
大問7
(1)① ア
(1)② エ
(2) ア→エ→イ→ウ→オ`;

export const AnswerKeyImport: React.FC<AnswerKeyImportProps> = ({ sections, defaultSectionId, onApply, onClose, onOpenAiSettings }) => {
  const sorted = useMemo(() => [...sections].sort(bySectionOrder), [sections]);
  const [tab, setTab] = useState<Tab>('paste');
  const [targetSectionId, setTargetSectionId] = useState<string>(defaultSectionId ?? sorted[0]?.id ?? '');
  const [pasteText, setPasteText] = useState('');
  const [skipped, setSkipped] = useState<string[]>([]);
  const [rows, setRows] = useState<KeyRow[] | null>(null);
  const [diff, setDiff] = useState<DiffRow[]>([]);
  const [syncChoices, setSyncChoices] = useState(true);
  const [createMissing, setCreateMissing] = useState(false);
  const [source, setSource] = useState<string>('');

  // AI(PDF・画像)
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [pageSpec, setPageSpec] = useState('1');
  const [splitSpread, setSplitSpread] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiError, setAiError] = useState<AiError | Error | null>(null);
  const [plan, setPlan] = useState(() => planFor('ocr'));

  const setResult = (r: KeyRow[], from: string, target = targetSectionId) => {
    setRows(r);
    setSource(from);
    setDiff(buildDiff(sections, r, target || undefined));
  };

  const handleParse = () => {
    const { rows: parsed, skipped: sk } = parsePastedKey(pasteText);
    setSkipped(sk);
    setResult(parsed, '貼り付け');
  };

  const changeTarget = (id: string) => {
    setTargetSectionId(id);
    if (rows) setDiff(buildDiff(sections, rows, id || undefined));
  };

  const handleFile = async (f: File | null) => {
    setFile(f);
    setAiError(null);
    setPageCount(0);
    if (!f) return;
    try {
      if (f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')) {
        const n = await countPdfPages(f);
        setPageCount(n);
        setPageSpec(n >= 1 ? '1' : '');
      }
    } catch (e) {
      setAiError(e as Error);
    }
  };

  const isPdf = file ? file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') : false;
  const pages = isPdf ? parsePageSpec(pageSpec, pageCount) : [];
  const imageCount = isPdf ? pages.length * (splitSpread ? 2 : 1) : file ? 1 : 0;

  const runAi = async () => {
    if (!file) return;
    setBusy(true);
    setAiError(null);
    try {
      let images: PageImage[];
      if (isPdf) {
        if (pages.length === 0) throw new Error('読み取るページを指定してください(例: 1-2)。');
        if (pages.length > 4) throw new Error('1回に読み取れるのは4ページまでです。ページを分けてください。');
        images = await renderPdfPages(file, pages, { splitSpread });
      } else {
        images = [await imageFileToJpeg(file)];
      }
      const { rows: read, model } = await readAnswerKeyImages(images);
      setSkipped([]);
      setResult(read, `AI(${model})`);
      if (read.length === 0) setAiError(new Error('答えを読み取れませんでした。ページや画像を確認してください。'));
    } catch (e) {
      setAiError(e as Error);
    } finally {
      setBusy(false);
      setPlan(planFor('ocr'));
    }
  };

  const toggle = (id: string) => setDiff((d) => d.map((x) => (x.id === id ? { ...x, apply: !x.apply } : x)));
  const setAll = (on: boolean) =>
    setDiff((d) => d.map((x) => ({ ...x, apply: on && (x.status === 'new' || x.status === 'changed' || (createMissing && x.status === 'unmatched' && Boolean(x.sectionId))) })));

  const counts = {
    new: diff.filter((d) => d.status === 'new').length,
    changed: diff.filter((d) => d.status === 'changed').length,
    same: diff.filter((d) => d.status === 'same').length,
    unmatched: diff.filter((d) => d.status === 'unmatched').length,
  };
  const applyCount = diff.filter((d) => d.apply && (d.questionId || (createMissing && d.sectionId))).length;

  const handleApply = () => {
    onApply(applyDiff(sections, diff, { syncChoices, createMissing }));
  };

  const tabBtn = (t: Tab, label: string, icon: React.ReactNode) => (
    <button
      onClick={() => setTab(t)}
      className={`flex items-center gap-1 px-3 py-2 text-xs cursor-pointer ${
        tab === t ? 'text-emerald-400 border-b-2 border-emerald-500' : 'text-slate-400 hover:text-slate-200'
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[65] bg-black/60 flex items-start justify-center overflow-auto p-4" role="dialog" aria-label="正答表の取り込み">
      <div className="w-full max-w-4xl rounded-xl border border-slate-700 bg-slate-900 shadow-xl mt-4">
        <div className="flex items-center px-4 py-3 border-b border-slate-800">
          <h2 className="text-sm font-bold text-slate-100">正答表の取り込み</h2>
          <span className="ml-3 text-[11px] text-slate-500">読み取った正解は、差分を確認して承認してから反映されます。</span>
          <button className="ml-auto p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 cursor-pointer" onClick={onClose} title="閉じる">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b border-slate-800">
          {tabBtn('paste', '貼り付け(AIなし)', <ClipboardPaste className="w-3.5 h-3.5" />)}
          {tabBtn('ai', 'PDF・画像から読み取り(AI)', <ScanText className="w-3.5 h-3.5" />)}
        </div>

        <div className="p-4 space-y-3 text-xs text-slate-300">
          <label className="flex items-center gap-2">
            <span className="text-slate-400">大問が書かれていない行の対象:</span>
            <select value={targetSectionId} onChange={(e) => changeTarget(e.target.value)} className={field} aria-label="対象の大問">
              {sorted.map((s) => (
                <option key={s.id} value={s.id}>
                  大問{s.number} {s.title ?? ''}
                </option>
              ))}
            </select>
          </label>

          {tab === 'paste' && (
            <div className="space-y-2">
              <p className="text-slate-400">
                1行に1設問で、「設問番号 正解 配点」の順に、空白・タブ・カンマで区切ります。「大問5」だけの行で、大問が切り替わります。
              </p>
              <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                <textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={8}
                  placeholder={PASTE_EXAMPLE}
                  className={`${field} w-full font-mono`}
                  aria-label="正答表の文字"
                />
                <pre className="text-[11px] text-slate-500 bg-slate-950 border border-slate-800 rounded p-2 h-fit">{`書き方の例\n${PASTE_EXAMPLE}`}</pre>
              </div>
              <button
                onClick={handleParse}
                disabled={!pasteText.trim()}
                className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-medium cursor-pointer disabled:opacity-40"
              >
                読み込む
              </button>
            </div>
          )}

          {tab === 'ai' && (
            <div className="space-y-2">
              <p className="text-slate-400">
                正答表のPDF(スキャンでも可)か画像を選ぶと、AIが答えを読み取ります。反映の前に、必ず差分を確認できます。
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,.pdf,image/jpeg,image/png"
                  className="hidden"
                  onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 cursor-pointer"
                >
                  ファイルを選ぶ
                </button>
                <span className="text-slate-400">
                  {file ? `${file.name}${isPdf && pageCount ? `(全${pageCount}ページ)` : ''}` : '未選択'}
                </span>
                <span className="text-[11px] text-slate-500">ファイルはこの端末内で画像にして送ります。GitHubには保存しません。</span>
              </div>

              {isPdf && pageCount > 0 && (
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1">
                    読むページ
                    <input value={pageSpec} onChange={(e) => setPageSpec(e.target.value)} className={`${field} w-24`} aria-label="読むページ" placeholder="例: 1-2" />
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={splitSpread} onChange={(e) => setSplitSpread(e.target.checked)} />
                    見開きを左右に分けて読む
                  </label>
                  <span className="text-slate-500">{pages.length > 0 ? `${pages.length}ページ(画像${imageCount}枚)` : 'ページを指定してください'}</span>
                </div>
              )}

              <div className="rounded border border-slate-800 bg-slate-950/60 px-3 py-2 flex flex-wrap items-center gap-2">
                <span>
                  この操作は <strong className="text-slate-100">1回</strong> 消費します。
                  {plan.next ? (
                    <>
                      {' '}
                      使うモデル: <span className="font-mono text-slate-200">{plan.next}</span>(今日の残り{' '}
                      <strong className="text-emerald-400">{plan.models.find((m) => m.model === plan.next)?.remaining}</strong> 回)
                    </>
                  ) : (
                    <span className="text-rose-400"> 今日使えるモデルの枠がありません。貼り付けのタブで入力できます。</span>
                  )}
                </span>
                <button
                  onClick={onOpenAiSettings}
                  className="ml-auto flex items-center gap-1 text-slate-400 hover:text-slate-100 underline cursor-pointer"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                  AI設定
                </button>
              </div>

              <button
                onClick={() => void runAi()}
                disabled={!file || busy || !plan.canRun || (isPdf && pages.length === 0)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-medium cursor-pointer disabled:opacity-40"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanText className="w-3.5 h-3.5" />}
                {busy ? '読み取り中…' : 'AIで読み取る(1回消費)'}
              </button>
            </div>
          )}

          {aiError && (
            <div className="rounded border border-rose-800/60 bg-rose-950/30 px-3 py-2 text-rose-200 space-y-1">
              <div className="flex items-start gap-1">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>{aiError.message}</span>
              </div>
              {aiError instanceof AiError && (aiError.code === 'exhausted' || aiError.code === 'no-key' || aiError.code === 'network') && (
                <button onClick={() => setTab('paste')} className="underline text-rose-100 cursor-pointer">
                  貼り付けに切り替えて、手入力で進める
                </button>
              )}
            </div>
          )}

          {skipped.length > 0 && (
            <div className="rounded border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-amber-200">
              読み取れなかった行({skipped.length}件): {skipped.slice(0, 5).join(' / ')}
              {skipped.length > 5 ? ' …' : ''}
            </div>
          )}

          {rows && (
            <div className="space-y-2 border-t border-slate-800 pt-3">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="font-semibold text-slate-200">差分の確認({source})</h3>
                <span className="text-emerald-300">新規入力 {counts.new}</span>
                <span className="text-amber-300">変更 {counts.changed}</span>
                <span className="text-slate-500">同じ {counts.same}</span>
                <span className="text-rose-300">対応する設問なし {counts.unmatched}</span>
                <span className="ml-auto flex gap-2">
                  <button onClick={() => setAll(true)} className="underline text-slate-300 cursor-pointer">
                    すべて選ぶ
                  </button>
                  <button onClick={() => setAll(false)} className="underline text-slate-300 cursor-pointer">
                    すべて外す
                  </button>
                </span>
              </div>

              {diff.length === 0 ? (
                <p className="text-slate-500">読み取れた行がありません。</p>
              ) : (
                <div className="rounded-lg border border-slate-800 overflow-auto max-h-[38vh]">
                  <table className="w-full">
                    <thead className="bg-slate-950 text-slate-400 sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 w-8" aria-label="反映" />
                        <th className="text-left font-medium px-2 py-1.5">大問</th>
                        <th className="text-left font-medium px-2 py-1.5">設問</th>
                        <th className="text-left font-medium px-2 py-1.5">いまの正解</th>
                        <th className="text-left font-medium px-2 py-1.5">取り込む正解</th>
                        <th className="text-left font-medium px-2 py-1.5">配点</th>
                        <th className="text-left font-medium px-2 py-1.5">状態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diff.map((d) => {
                        const canApply = Boolean(d.questionId) || (createMissing && Boolean(d.sectionId));
                        return (
                          <tr key={d.id} className="border-t border-slate-800">
                            <td className="px-2 py-1">
                              <input
                                type="checkbox"
                                checked={d.apply && canApply}
                                disabled={!canApply}
                                onChange={() => toggle(d.id)}
                                aria-label={`${d.sectionNumber} ${d.fullLabelText} を反映`}
                              />
                            </td>
                            <td className="px-2 py-1 font-mono">{d.sectionNumber || '-'}</td>
                            <td className="px-2 py-1 font-mono">{d.fullLabelText}</td>
                            <td className="px-2 py-1 font-mono text-slate-400">{d.current || '(未入力)'}</td>
                            <td className={`px-2 py-1 font-mono ${d.status === 'changed' ? 'text-amber-200' : 'text-slate-100'}`}>{d.next}</td>
                            <td className="px-2 py-1 font-mono text-slate-400">
                              {d.nextPoints !== undefined ? `${d.currentPoints ?? '-'} → ${d.nextPoints}` : (d.currentPoints ?? '-')}
                            </td>
                            <td className={`px-2 py-1 ${STATUS_STYLE[d.status]}`}>{STATUS_TEXT[d.status]}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={syncChoices} onChange={(e) => setSyncChoices(e.target.checked)} />
                  選択問題は、正解の記号に合わせて ○× も更新する
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={createMissing}
                    onChange={(e) => {
                      setCreateMissing(e.target.checked);
                      setDiff((d) => d.map((x) => (x.status === 'unmatched' ? { ...x, apply: e.target.checked && Boolean(x.sectionId) } : x)));
                    }}
                  />
                  対応する設問がない行は、新しい設問として作る
                </label>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleApply}
                  disabled={applyCount === 0}
                  className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold cursor-pointer disabled:opacity-40"
                >
                  チェックした {applyCount} 件を反映する
                </button>
                <button onClick={onClose} className="px-3 py-2 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 cursor-pointer">
                  反映せずに閉じる
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
