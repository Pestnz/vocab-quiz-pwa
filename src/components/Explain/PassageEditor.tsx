import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  CheckCheck,
  ClipboardPaste,
  Layers,
  Languages,
  Loader2,
  Plus,
  ScanText,
  Scissors,
  Trash2,
  Merge,
  X,
} from 'lucide-react';
import type { GlossaryItem, Passage, PassageSentence } from '../../types/explain';
import {
  bySentenceOrder,
  createPassage,
  createSentence,
  mergeWithPrevious,
  renumberSentences,
  sentencesFromParagraphs,
  sentencesFromText,
  splitSentenceAt,
} from '../../services/explainPassages';
import { estimateStructureCalls, estimateTranslateCalls, readPassageLines, structureSentences, translateSentences } from '../../services/passageAi';
import { hasStructure } from '../../services/explainStructure';
import { StructureEditor } from './StructureEditor';
import { planStrips } from '../../services/ocrStrips';
import { AiError, planFor } from '../../services/aiRouter';
import { useCrop } from '../../services/cropStore';

interface PassageEditorProps {
  passages: Passage[];
  /** 変更後の本文の一覧と、新しく削除した本文・文のID(同期で復活させないための記録) */
  onChange: (passages: Passage[], deletedIds: string[]) => void;
}

const field = 'bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100';
const nowIso = (): string => new Date().toISOString();
const btn =
  'flex items-center gap-1 px-2 py-1 rounded-md text-[11px] bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 cursor-pointer disabled:opacity-40';

export const PassageEditor: React.FC<PassageEditorProps> = ({ passages, onChange }) => {
  const addPassage = () => onChange([...passages, createPassage('')], []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-bold text-slate-200">本文(長文)</h3>
        <span className="text-[11px] text-slate-500">英文を文ごとに分けて、全訳と一緒に管理します。</span>
        <button className={`${btn} ml-auto`} onClick={addPassage}>
          <Plus className="w-3.5 h-3.5" />
          本文を追加
        </button>
      </div>
      {passages.length === 0 && (
        <p className="text-[11px] text-slate-500">この大問に長文があるときは、「本文を追加」から入れます(AIを使わなくても、貼り付けで作れます)。</p>
      )}
      {passages.map((p) => (
        <PassageCard
          key={p.id}
          passage={p}
          onChange={(next, deleted) => onChange(passages.map((x) => (x.id === p.id ? next : x)), deleted)}
          onDelete={() => {
            const ok = window.confirm(
              `この本文(${p.title || '無題'}・${p.sentences.length}文)を削除しますか?\nGitHub同期を使っている場合は、他の端末からも消えます。元に戻せません。`
            );
            if (ok) onChange(passages.filter((x) => x.id !== p.id), [p.id, ...p.sentences.map((s) => s.id)]);
          }}
        />
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------------------------

interface PassageCardProps {
  passage: Passage;
  onChange: (p: Passage, deletedIds: string[]) => void;
  onDelete: () => void;
}

const PassageCard: React.FC<PassageCardProps> = ({ passage, onChange, onDelete }) => {
  const sentences = [...passage.sentences].sort(bySentenceOrder);
  const crop = useCrop();
  const areaRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const [panel, setPanel] = useState<null | 'paste' | 'ocr' | 'translate' | 'structure' | 'glossary'>(null);
  const [openStruct, setOpenStruct] = useState<Record<string, boolean>>({}); // 品詞分解の編集欄を開いている文
  const [pasteText, setPasteText] = useState('');
  const [replaceMode, setReplaceMode] = useState(false);
  const [redo, setRedo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [stripEst, setStripEst] = useState<{ calls: number; lines: number } | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  // 読み取りの見積もり: 切り抜いた画像を、数行ずつに分けたときの回数(AIは、長い英文を一度に書き出すと止まるため)
  useEffect(() => {
    if (panel !== 'ocr' || !crop?.ocr) return;
    let cancelled = false;
    planStrips(crop.ocr.base64)
      .then((p) => {
        if (!cancelled) setStripEst({ calls: p.strips.length, lines: p.lineCount });
      })
      .catch(() => {
        if (!cancelled) setStripEst(null);
      });
    return () => {
      cancelled = true;
    };
  }, [panel, crop]);

  const unreviewed = sentences.filter((s) => !s.reviewed).length;
  const lowCount = sentences.filter((s) => s.ocrConfidence === 'low' && !s.reviewed).length;

  const commit = (next: PassageSentence[], extra: Partial<Passage> = {}, deletedIds: string[] = []) =>
    // タイトル・注を変えたときだけ、本文自体の更新日時を動かす(文の編集は、文ごとの更新日時で管理する)
    onChange({ ...passage, ...extra, sentences: next, updatedAt: 'title' in extra || 'glossary' in extra ? nowIso() : passage.updatedAt }, deletedIds);

  const updateSentence = (id: string, patch: Partial<PassageSentence>) =>
    commit(passage.sentences.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: nowIso() } : s)));

  const addSentenceAfter = (id: string | null) => {
    const i = id ? sentences.findIndex((s) => s.id === id) : sentences.length - 1;
    const order = i < 0 ? 0 : sentences[i + 1] ? (sentences[i].order + sentences[i + 1].order) / 2 : sentences[i].order + 1;
    commit(renumberSentences([...passage.sentences, createSentence(order, '')]));
  };

  const removeSentence = (id: string) => {
    const rest = passage.sentences.filter((s) => s.id !== id);
    commit(renumberSentences(rest), {}, [id]);
  };

  const doSplit = (id: string) => {
    const ta = areaRefs.current.get(id);
    if (!ta) return;
    const next = splitSentenceAt(passage.sentences, id, ta.selectionStart);
    if (!next) {
      window.alert('文を分けたい位置にカーソルを置いてから、「分割」を押してください(位置が先頭・末尾だと分けられません)。');
      return;
    }
    commit(next);
  };

  const doMerge = (id: string) => {
    const idx = sentences.findIndex((s) => s.id === id);
    const prev = sentences[idx - 1];
    const next = mergeWithPrevious(passage.sentences, id);
    if (next && prev) commit(next, {}, [id]);
  };

  const togglePara = (s: PassageSentence) => updateSentence(s.id, { paraStart: s.paraStart ? undefined : true });

  // 英文・全訳の確認済みと、(あれば)品詞分解の確認済みを、まとめて付ける
  const markAllReviewed = () => {
    const stamp = nowIso();
    commit(
      passage.sentences.map((s) => {
        const needStruct = hasStructure(s) && !s.structureReviewed;
        return s.reviewed && !needStruct ? s : { ...s, reviewed: true, structureReviewed: hasStructure(s) ? true : s.structureReviewed, updatedAt: stamp };
      })
    );
  };

  // ---- 貼り付け ----
  const applyPaste = () => {
    const base = replaceMode ? 0 : sentences.length > 0 ? sentences[sentences.length - 1].order + 1 : 0;
    const added = sentencesFromText(pasteText, base);
    if (added.length === 0) return;
    if (replaceMode && sentences.length > 0) {
      const ok = window.confirm(`いまの ${sentences.length} 文を、貼り付けた ${added.length} 文で置き換えます。全訳も消えます。よろしいですか?`);
      if (!ok) return;
      commit(renumberSentences(added), {}, sentences.map((s) => s.id));
    } else {
      commit(renumberSentences([...passage.sentences, ...added]));
    }
    setPasteText('');
    setPanel(null);
    setMessage(`${added.length}文を追加しました。内容を確認してください。`);
  };

  // ---- PDFの切り抜きから読み取り(AI) ----
  const ocrPlan = planFor('ocr');
  const runOcr = async () => {
    if (!crop?.ocr) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const r = await readPassageLines(crop.ocr, { onProgress: (d, t) => setProgress(`${d}/${t}`) });
      if (r.paragraphs.length === 0) throw new Error('英文を読み取れませんでした。範囲を確認して、切り抜き直してください。');
      const base = replaceMode ? 0 : sentences.length > 0 ? sentences[sentences.length - 1].order + 1 : 0;
      const added = sentencesFromParagraphs(r.paragraphs, base, { lowConfidenceWords: r.uncertain });
      const glossary: GlossaryItem[] = [...(passage.glossary ?? [])];
      for (const n of r.notes) if (!glossary.some((g) => g.term === n.term)) glossary.push(n);
      const deleted = replaceMode ? sentences.map((s) => s.id) : [];
      commit(renumberSentences(replaceMode ? added : [...passage.sentences, ...added]), { glossary: glossary.length > 0 ? glossary : undefined }, deleted);
      const low = added.filter((s) => s.ocrConfidence === 'low').length;
      setMessage(
        `${added.length}文を読み取りました(${r.models.join(', ')}・${r.calls}回消費)。AIの読み取りは下書きです。原文と見比べて確認してください${low > 0 ? `(要確認 ${low}文)` : ''}。`
      );
      setPanel(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  // ---- 全訳の下書き(AI) ----
  const targets = sentences
    .map((s, i) => ({ s, no: i + 1 }))
    .filter(({ s }) => s.en.trim() !== '' && (redo || s.ja.trim() === ''));
  const trCalls = estimateTranslateCalls(targets.length);
  const trPlan = planFor('translate');
  const runTranslate = async () => {
    if (targets.length === 0) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const all = sentences.map((s, i) => ({ no: i + 1, en: s.en }));
      const res = await translateSentences(all, targets.map(({ s, no }) => ({ no, en: s.en })));
      const stamp = nowIso();
      const byId = new Map(targets.map(({ s, no }) => [s.id, res.translations.get(no)]));
      commit(
        passage.sentences.map((s) => {
          const ja = byId.get(s.id);
          return ja ? { ...s, ja, reviewed: false, updatedAt: stamp } : s;
        })
      );
      setMessage(
        `${res.translations.size}文の全訳を作りました(${res.models.join(', ')}・${res.calls}回消費)。下書きなので、確認してください。` +
          (res.missing.length > 0 ? ` 訳が返らなかった文: ${res.missing.join(', ')}` : '')
      );
      setPanel(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
    }
  };

  // ---- 品詞分解の下書き(AI) ----
  const stTargets = sentences
    .map((s, i) => ({ s, no: i + 1 }))
    .filter(({ s }) => s.en.trim() !== '' && (redo || !hasStructure(s)));
  const stCalls = estimateStructureCalls(stTargets.length);
  const runStructure = async () => {
    if (stTargets.length === 0) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const all = sentences.map((s, i) => ({ no: i + 1, en: s.en }));
      const res = await structureSentences(all, stTargets.map(({ s, no }) => ({ no, en: s.en })), undefined, (d, t) => setProgress(`${d}/${t}`));
      const stamp = nowIso();
      const byId = new Map(stTargets.map(({ s, no }) => [s.id, res.structures.get(no)]));
      commit(
        passage.sentences.map((s) => {
          const st = byId.get(s.id);
          return st ? { ...s, structure: st, structureReviewed: false, updatedAt: stamp } : s;
        })
      );
      setMessage(
        `${res.structures.size}文の品詞分解を作りました(${res.models.join(', ')}・${res.calls}回消費)。下書きです。品詞・役割は誤りやすいので、確認して直してください。` +
          (res.repaired.length > 0 ? ` 語の分け方を英文に合わせて補正した文: ${res.repaired.join(', ')}。` : '') +
          (res.missing.length > 0 ? ` 使える結果が返らなかった文: ${res.missing.join(', ')}(もう一度実行できます)。` : '')
      );
      setPanel(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };
  const stPlan = planFor('translate');
  const structUnreviewed = sentences.filter((s) => hasStructure(s) && !s.structureReviewed).length;

  const updateGlossary = (next: GlossaryItem[]) => commit(passage.sentences, { glossary: next.length > 0 ? next : undefined });

  const hasSpeaker = sentences.some((s) => s.speaker !== undefined);

  return (
    <div className="rounded-lg border border-slate-700 bg-slate-900/70">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-800">
        <input
          value={passage.title ?? ''}
          onChange={(e) => commit(passage.sentences, { title: e.target.value || undefined })}
          placeholder="本文のタイトル(例: サトミのスピーチ)"
          aria-label="本文のタイトル"
          className={`${field} flex-1 min-w-[140px]`}
        />
        <span className="text-[11px] text-slate-400">
          {sentences.length}文
          {unreviewed > 0 ? (
            <span className="text-amber-400"> ・ 未確認 {unreviewed}{lowCount > 0 ? `(要確認 ${lowCount})` : ''}</span>
          ) : sentences.length > 0 ? (
            <span className="text-emerald-400"> ・ すべて確認済み</span>
          ) : null}
          {structUnreviewed > 0 && <span className="text-amber-400"> ・ 品詞分解 未確認 {structUnreviewed}</span>}
        </span>
        <button className={btn} onClick={() => setPanel(panel === 'paste' ? null : 'paste')} title="英文を貼り付けて、文に分ける(AIなし)">
          <ClipboardPaste className="w-3.5 h-3.5" />
          英文を貼り付け
        </button>
        <button className={btn} onClick={() => setPanel(panel === 'ocr' ? null : 'ocr')} title="PDFの切り抜きから、AIで英文を読み取る">
          <ScanText className="w-3.5 h-3.5" />
          PDFから読み取り(AI)
        </button>
        <button className={btn} onClick={() => setPanel(panel === 'translate' ? null : 'translate')} disabled={sentences.length === 0} title="AIで全訳の下書きを作る">
          <Languages className="w-3.5 h-3.5" />
          全訳を作る(AI)
        </button>
        <button className={btn} onClick={() => setPanel(panel === 'structure' ? null : 'structure')} disabled={sentences.length === 0} title="AIで品詞分解(語ごとの品詞・文型の役割・かっこ)の下書きを作る">
          <Layers className="w-3.5 h-3.5" />
          品詞分解を作る(AI)
        </button>
        <button className={btn} onClick={markAllReviewed} disabled={unreviewed === 0 && structUnreviewed === 0} title="すべての文(品詞分解を含む)を確認済みにする">
          <CheckCheck className="w-3.5 h-3.5" />
          すべて確認済み
        </button>
        <button className={`${btn} hover:!text-rose-300`} onClick={onDelete} title="この本文を削除">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {panel === 'paste' && (
        <div className="px-3 py-2 space-y-2 border-b border-slate-800 bg-slate-950/50 text-xs text-slate-300">
          <p className="text-slate-400">英文を貼り付けます。改行で段落が分かれ、文ごとに自動で分けられます。「Haru: …」の形の行は、話者として分けます。</p>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={6}
            className={`${field} w-full font-mono`}
            aria-label="貼り付ける英文"
          />
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={replaceMode} onChange={(e) => setReplaceMode(e.target.checked)} />
              いまの文を置き換える
            </label>
            <button className={`${btn} !bg-emerald-600 !border-emerald-500 !text-white`} onClick={applyPaste} disabled={!pasteText.trim()}>
              文に分けて入れる
            </button>
          </div>
        </div>
      )}

      {panel === 'ocr' && (
        <div className="px-3 py-2 space-y-2 border-b border-slate-800 bg-slate-950/50 text-xs text-slate-300">
          {crop?.ocr ? (
            <div className="flex flex-wrap items-start gap-3">
              <img src={crop.dataUrl} alt="切り抜き" className="max-h-32 rounded border border-slate-700 bg-white" />
              <div className="space-y-2">
                <p>
                  切り抜いた画像({crop.ocr.width}×{crop.ocr.height}px)から、英文を読み取ります。
                  <strong className="text-slate-100"> この操作は約{stripEst?.calls ?? '?'}回消費します。</strong>
                  <span className="text-slate-400">
                    {' '}
                    (長い英文を一度に読むとAIが止めてしまうため、約{stripEst?.lines ?? '?'}行を数行ずつに分けて読み、つなげます。)
                  </span>
                  {ocrPlan.next ? (
                    <>
                      {' '}使うモデル: <span className="font-mono">{ocrPlan.next}</span>(今日の残り{' '}
                      <strong className="text-emerald-400">{ocrPlan.models.find((m) => m.model === ocrPlan.next)?.remaining}</strong>回)
                    </>
                  ) : (
                    <span className="text-rose-400"> 今日使えるモデルの枠がありません。「英文を貼り付け」で入力してください。</span>
                  )}
                </p>
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={replaceMode} onChange={(e) => setReplaceMode(e.target.checked)} />
                  いまの文を置き換える(しないときは、末尾に追加)
                </label>
                <button className={`${btn} !bg-emerald-600 !border-emerald-500 !text-white`} onClick={() => void runOcr()} disabled={busy || !ocrPlan.canRun}>
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ScanText className="w-3.5 h-3.5" />}
                  {busy ? `読み取り中…${progress ? `(${progress})` : ''}` : `読み取る(約${stripEst?.calls ?? '?'}回消費)`}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-slate-400">
              まず、PDFの「<strong className="text-slate-200">切り抜き</strong>」で、本文の範囲(段落が続く1列ぶん)をドラッグして選んでください(別ウィンドウのPDFでも使えます)。
              切り抜くと、ここに画像が出ます。
            </p>
          )}
        </div>
      )}

      {panel === 'translate' && (
        <div className="px-3 py-2 space-y-2 border-b border-slate-800 bg-slate-950/50 text-xs text-slate-300">
          <p>
            訳が空の文を、AIで訳します(対象 <strong className="text-slate-100">{targets.length}</strong> 文)。
            <strong className="text-slate-100"> この操作は{trCalls}回消費します。</strong>
            {trPlan.next ? (
              <>
                {' '}使うモデル: <span className="font-mono">{trPlan.next}</span>(今日の残り{' '}
                <strong className="text-emerald-400">{trPlan.models.find((m) => m.model === trPlan.next)?.remaining}</strong>回)
              </>
            ) : (
              <span className="text-rose-400"> 今日使えるモデルの枠がありません。全訳は手で入力できます。</span>
            )}
          </p>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={redo} onChange={(e) => setRedo(e.target.checked)} />
              訳がある文も、訳し直す
            </label>
            <button className={`${btn} !bg-emerald-600 !border-emerald-500 !text-white`} onClick={() => void runTranslate()} disabled={busy || targets.length === 0 || !trPlan.canRun}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Languages className="w-3.5 h-3.5" />}
              {busy ? '作成中…(1〜2分かかることがあります)' : `全訳を作る(${trCalls}回消費)`}
            </button>
          </div>
        </div>
      )}

      {panel === 'structure' && (
        <div className="px-3 py-2 space-y-2 border-b border-slate-800 bg-slate-950/50 text-xs text-slate-300">
          <p>
            品詞分解がない文を、AIで分解します(対象 <strong className="text-slate-100">{stTargets.length}</strong> 文)。
            <strong className="text-slate-100"> この操作は{stCalls}回消費します。</strong>
            <span className="text-slate-400"> (1回で最大15文。出力が長いので、1回あたり十数秒〜1分かかります。)</span>
            {stPlan.next ? (
              <>
                {' '}使うモデル: <span className="font-mono">{stPlan.next}</span>(今日の残り{' '}
                <strong className="text-emerald-400">{stPlan.models.find((m) => m.model === stPlan.next)?.remaining}</strong>回)
              </>
            ) : (
              <span className="text-rose-400"> 今日使えるモデルの枠がありません。各文の「品詞分解」から、手で入力できます。</span>
            )}
          </p>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={redo} onChange={(e) => setRedo(e.target.checked)} />
              品詞分解がある文も、作り直す
            </label>
            <button className={`${btn} !bg-emerald-600 !border-emerald-500 !text-white`} onClick={() => void runStructure()} disabled={busy || stTargets.length === 0 || !stPlan.canRun}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
              {busy ? `作成中…${progress ? `(${progress})` : ''}` : `品詞分解を作る(${stCalls}回消費)`}
            </button>
          </div>
        </div>
      )}

      {(message || error) && (
        <div className={`px-3 py-1.5 text-[11px] border-b border-slate-800 ${error ? 'text-rose-200 bg-rose-950/30' : 'text-emerald-200 bg-emerald-950/20'}`}>
          <div className="flex items-start gap-1">
            {error && <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
            <span className="flex-1">{error ? error.message : message}</span>
            {error instanceof AiError && (error.code === 'exhausted' || error.code === 'no-key' || error.code === 'network' || error.code === 'recitation') && (
              <span className="shrink-0 text-rose-100">→ 「英文を貼り付け」や手入力で進められます</span>
            )}
            <button onClick={() => { setError(null); setMessage(null); }} className="text-slate-400 hover:text-white cursor-pointer" title="閉じる">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* 文の表 */}
      <div className="p-2">
        {sentences.length === 0 ? (
          <p className="px-2 py-4 text-center text-[11px] text-slate-500">文がまだありません。「英文を貼り付け」か「PDFから読み取り」で入れるか、下の「文を追加」から手で入れます。</p>
        ) : (
          <div className="space-y-1">
            {sentences.map((s, i) => {
              const low = s.ocrConfidence === 'low' && !s.reviewed;
              return (
                <React.Fragment key={s.id}>
                  {s.paraStart && i > 0 && <div className="flex items-center gap-2 text-[10px] text-slate-500"><span className="h-px flex-1 bg-slate-700" />段落<span className="h-px flex-1 bg-slate-700" /></div>}
                  <div
                    className={`grid gap-1.5 items-start rounded p-1 border-l-4 ${
                      low ? 'border-l-amber-400 bg-amber-950/20' : s.reviewed ? 'border-l-emerald-600' : 'border-l-slate-600'
                    }`}
                    style={{ gridTemplateColumns: '2rem minmax(0,1fr) minmax(0,1fr) 3.2rem' }}
                  >
                    <div className="pt-1 text-center font-mono text-[11px] text-slate-400">{i + 1}</div>
                    <div className="space-y-1">
                      {(hasSpeaker || s.speaker !== undefined) && (
                        <input
                          value={s.speaker ?? ''}
                          onChange={(e) => updateSentence(s.id, { speaker: e.target.value === '' && s.speaker === undefined ? undefined : e.target.value })}
                          placeholder="話者(対話文のとき)"
                          aria-label="話者"
                          className={`${field} w-32`}
                        />
                      )}
                      <textarea
                        ref={(el) => {
                          if (el) areaRefs.current.set(s.id, el);
                          else areaRefs.current.delete(s.id);
                        }}
                        value={s.en}
                        onChange={(e) => updateSentence(s.id, { en: e.target.value })}
                        rows={Math.max(2, Math.ceil(s.en.length / 38))}
                        aria-label={`文${i + 1}の英文`}
                        className={`${field} w-full font-serif ${low ? '!border-amber-500' : ''}`}
                      />
                      {low && <span className="text-[10px] text-amber-400">要確認: 読み取りに自信がありません(原文と見比べてください)</span>}
                    </div>
                    <textarea
                      value={s.ja}
                      onChange={(e) => updateSentence(s.id, { ja: e.target.value })}
                      rows={Math.max(2, Math.ceil(s.ja.length / 30))}
                      aria-label={`文${i + 1}の全訳`}
                      placeholder="全訳"
                      className={`${field} w-full`}
                    />
                    <div className="flex flex-col items-center gap-0.5">
                      <label className="flex flex-col items-center text-[10px] text-slate-400 cursor-pointer" title="確認が済んだらチェック(AIの下書きは未確認のまま入ります)">
                        <input type="checkbox" checked={s.reviewed} onChange={(e) => updateSentence(s.id, { reviewed: e.target.checked })} aria-label={`文${i + 1}を確認済みにする`} />
                        確認済
                      </label>
                      <div className="flex flex-wrap justify-center">
                        <button className="p-0.5 text-slate-400 hover:text-white cursor-pointer" title="英文のカーソル位置で、この文を2つに分ける" onClick={() => doSplit(s.id)}>
                          <Scissors className="w-3 h-3" />
                        </button>
                        <button
                          className={`p-0.5 cursor-pointer ${hasStructure(s) ? (s.structureReviewed ? 'text-emerald-400' : 'text-amber-400') : 'text-slate-400 hover:text-white'}`}
                          title={`品詞分解を${openStruct[s.id] ? '閉じる' : '開く'}${hasStructure(s) ? (s.structureReviewed ? '(確認済み)' : '(未確認)') : '(まだありません)'}`}
                          onClick={() => setOpenStruct((o) => ({ ...o, [s.id]: !o[s.id] }))}
                          aria-label={`文${i + 1}の品詞分解`}
                        >
                          <Layers className="w-3 h-3" />
                        </button>
                        <button className="p-0.5 text-slate-400 hover:text-white cursor-pointer disabled:opacity-30" disabled={i === 0} title="前の文と結合する" onClick={() => doMerge(s.id)}>
                          <Merge className="w-3 h-3" />
                        </button>
                        <button className={`p-0.5 cursor-pointer ${s.paraStart ? 'text-sky-300' : 'text-slate-400 hover:text-white'}`} title="この文から新しい段落にする(もう一度押すと戻る)" onClick={() => togglePara(s)}>
                          <ArrowDownToLine className="w-3 h-3" />
                        </button>
                        <button className="p-0.5 text-slate-400 hover:text-white cursor-pointer" title="この文の下に、空の文を追加" onClick={() => addSentenceAfter(s.id)}>
                          <Plus className="w-3 h-3" />
                        </button>
                        <button className="p-0.5 text-slate-400 hover:text-rose-300 cursor-pointer" title="この文を削除" onClick={() => removeSentence(s.id)}>
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                  {openStruct[s.id] && (
                    <div className="ml-8">
                      <StructureEditor sentence={s} onChange={(patch) => updateSentence(s.id, patch)} />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-2">
          <button className={btn} onClick={() => addSentenceAfter(null)}>
            <Plus className="w-3.5 h-3.5" />
            文を追加
          </button>
          {!hasSpeaker && sentences.length > 0 && (
            <button className={btn} onClick={() => updateSentence(sentences[0].id, { speaker: '' })} title="対話文のとき、話者の欄を出す">
              話者の欄を出す
            </button>
          )}
          <button className={btn} onClick={() => setPanel(panel === 'glossary' ? null : 'glossary')}>
            (注)・重要語句{passage.glossary?.length ? `(${passage.glossary.length})` : ''}
          </button>
        </div>

        {panel === 'glossary' && (
          <div className="mt-2 space-y-1">
            {(passage.glossary ?? []).map((g, gi) => (
              <div key={gi} className="flex gap-1">
                <input value={g.term} onChange={(e) => updateGlossary((passage.glossary ?? []).map((x, k) => (k === gi ? { ...x, term: e.target.value } : x)))} placeholder="語句" aria-label="注の語句" className={`${field} w-40`} />
                <input value={g.meaning} onChange={(e) => updateGlossary((passage.glossary ?? []).map((x, k) => (k === gi ? { ...x, meaning: e.target.value } : x)))} placeholder="意味" aria-label="注の意味" className={`${field} flex-1`} />
                <button className="p-1 text-slate-400 hover:text-rose-300 cursor-pointer" title="削除" onClick={() => updateGlossary((passage.glossary ?? []).filter((_, k) => k !== gi))}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <button className={btn} onClick={() => updateGlossary([...(passage.glossary ?? []), { term: '', meaning: '' }])}>
              <Plus className="w-3.5 h-3.5" />
              注を追加
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
