import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/react';
import {
  ExternalLink,
  FileUp,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  Printer,
  Library,
  Info,
  RefreshCw,
  CloudOff,
} from 'lucide-react';
import type { LocalExplainDoc, PrintLayout, SpreadSide } from '../../types/explain';
import { normalizeLayout } from '../../services/explainLayout';
import {
  META_KEYS,
  SYNCED_KEYS,
  createEmptyDoc,
  deleteDocWithTombstone,
  getPdf,
  listDocs,
  saveDoc,
  savePdf,
} from '../../services/explainDb';
import { conflictCopyOf, isSyncConfigured, syncExplanations } from '../../services/explanationSync';
import type { SyncSummary } from '../../services/explanationSync';
import { PdfViewer } from './PdfViewer';
import { DocEditor } from './DocEditor';
import { PrintPreview } from './PrintPreview';
import { ExplainLibrary } from './ExplainLibrary';
import { MetaPanel } from './MetaPanel';
import { SectionsEditor } from './SectionsEditor';
import { AiStatusPanel } from './AiStatusPanel';
import { planFor } from '../../services/aiRouter';
import { countMissingReasons } from '../../services/explainSections';
import { usePdfPopout } from './usePdfPopout';
import type { PopoutPatch } from '../../services/explainPopout';

type SaveState = 'saved' | 'unsaved' | 'saving' | 'error';
type View = 'library' | 'work';
interface SyncUi {
  status: 'idle' | 'syncing' | 'error';
  lastAt?: string;
  message?: string;
  info?: string;
}

const SAVE_DEBOUNCE_MS = 1500;
const AUTO_SYNC_MS = 5 * 60 * 1000;
const MIN_SPLIT = 0.25;
const MAX_SPLIT = 0.75;

const isDirty = (d: LocalExplainDoc): boolean => d.baseUpdatedAt === null || d.baseUpdatedAt !== d.syncUpdatedAt;

function summarize(s: SyncSummary): string {
  const parts: string[] = [];
  if (s.pushed) parts.push(`送信${s.pushed}`);
  if (s.pulled) parts.push(`取得${s.pulled}`);
  if (s.deleted) parts.push(`削除${s.deleted}`);
  if (s.merged) parts.push(`自動統合${s.merged}`);
  if (s.conflicts) parts.push(`競合${s.conflicts}(競合コピーを作成)`);
  return parts.length ? parts.join(' / ') : '変更なし';
}

export const ExplainView: React.FC = () => {
  const [docs, setDocs] = useState<LocalExplainDoc[]>([]);
  const [current, setCurrent] = useState<LocalExplainDoc | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>('library');
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [ratio, setRatio] = useState(0.5);
  const [narrow, setNarrow] = useState(false);
  const [tab, setTab] = useState<'pdf' | 'editor'>('editor');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [sync, setSync] = useState<SyncUi>({ status: 'idle' });
  const [syncConfigured, setSyncConfigured] = useState(() => isSyncConfigured());
  const closePreview = useCallback(() => setPreviewOpen(false), []);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiTick, setAiTick] = useState(0); // AI設定を閉じたときに、残り回数の表示を更新する

  const docRef = useRef<LocalExplainDoc | null>(null);
  const docsRef = useRef<LocalExplainDoc[]>([]);
  const dirtyRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newFromPdfRef = useRef(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const syncingRef = useRef(false);

  useEffect(() => {
    docsRef.current = docs;
  }, [docs]);

  // ---- 保存(この端末の IndexedDB へ) ----
  const flush = useCallback(async () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const doc = docRef.current;
    if (!doc || !dirtyRef.current) return;
    dirtyRef.current = false;
    setSaveState('saving');
    try {
      await saveDoc(doc);
      setDocs((prev) => {
        const rest = prev.filter((d) => d.id !== doc.id);
        return [doc, ...rest].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      });
      setSaveState(dirtyRef.current ? 'unsaved' : 'saved');
    } catch (e) {
      console.error('Failed to save explain doc', e);
      dirtyRef.current = true;
      setSaveState('error');
    }
  }, []);

  const patchDoc = useCallback(
    (patch: Partial<LocalExplainDoc>) => {
      const prev = docRef.current;
      if (!prev) return;
      const now = new Date().toISOString();
      const touchesSynced = SYNCED_KEYS.some((k) => k in patch);
      const touchesMeta = META_KEYS.some((k) => k in patch);
      const next = {
        ...prev,
        ...patch,
        updatedAt: now,
        ...(touchesSynced ? { syncUpdatedAt: now } : {}),
        ...(touchesMeta ? { metaUpdatedAt: now } : {}),
      };
      docRef.current = next;
      dirtyRef.current = true;
      setCurrent(next);
      setSaveState('unsaved');
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
    },
    [flush]
  );

  // ---- 文書を開く ----
  const loadPdfFor = useCallback(async (doc: LocalExplainDoc) => {
    if (!doc.pdfKey) {
      setPdfBlob(null);
      return;
    }
    const stored = await getPdf(doc.pdfKey);
    // 読み込み中に別の文書へ切り替わっていたら捨てる
    if (docRef.current?.id === doc.id) setPdfBlob(stored?.blob ?? null);
  }, []);

  const openDoc = useCallback(
    async (doc: LocalExplainDoc | null) => {
      await flush();
      docRef.current = doc;
      dirtyRef.current = false;
      setCurrent(doc);
      setSaveState('saved');
      setPdfBlob(null);
      setEditorKey((k) => k + 1);
      setShowMeta(false);
      if (doc) {
        setRatio(doc.splitRatio);
        await loadPdfFor(doc);
      }
    },
    [flush, loadPdfFor]
  );

  // ---- PDFの別ウィンドウ(ここだけが保存を担当。別ウィンドウからの操作を受けて反映する) ----
  const handlePopoutPatch = useCallback(
    (docId: string, patch: PopoutPatch) => {
      if (docRef.current?.id !== docId) return;
      patchDoc(patch);
      if (patch.pdfKey && docRef.current) void loadPdfFor(docRef.current);
    },
    [patchDoc, loadPdfFor]
  );
  const popout = usePdfPopout(current, handlePopoutPatch);

  const handleOpenPopout = () => {
    if (!popout.openWindow()) {
      window.alert('別ウィンドウを開けませんでした。ブラウザのポップアップのブロックを許可してから、もう一度押してください。');
    }
  };

  // ---- GitHub 同期 ----
  const refreshAfterSync = useCallback(
    async (before: { id: string; sync: string; base: string | null } | null): Promise<string | null> => {
      const list = await listDocs();
      setDocs(list);
      const cur = docRef.current;
      if (!cur) return null;
      const fresh = list.find((d) => d.id === cur.id);

      // 他の端末で削除された
      if (!fresh) {
        docRef.current = null;
        dirtyRef.current = false;
        setCurrent(null);
        setPdfBlob(null);
        setView('library');
        return '開いていた解説は、他の端末で削除されたため閉じました。';
      }

      if (dirtyRef.current) {
        // 同期中に入力があった
        const syncedThisDoc = before && (fresh.syncUpdatedAt !== before.sync || fresh.baseUpdatedAt !== before.base);
        if (!syncedThisDoc) return null;
        if (fresh.syncUpdatedAt === before.sync) {
          // 送信しただけ(内容は同じ)。同期の記録だけ取り込む。入力はそのまま続けられる
          docRef.current = { ...cur, baseUpdatedAt: fresh.baseUpdatedAt, remoteSha: fresh.remoteSha, lastSyncedAt: fresh.lastSyncedAt };
          setCurrent(docRef.current);
          return null;
        }
        // GitHub 側の新しい内容を取り込んだ。入力中の内容は、競合コピーとして残す
        if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        dirtyRef.current = false;
        await saveDoc(conflictCopyOf(cur, '同期中の編集'));
        docRef.current = fresh;
        setCurrent(fresh);
        setEditorKey((k) => k + 1);
        setSaveState('saved');
        setDocs(await listDocs());
        await loadPdfFor(fresh);
        return '同期中に入力した内容は「競合コピー」として別の解説に残しました。';
      }

      // 入力していない → 最新の内容に差し替える
      const changed =
        fresh.syncUpdatedAt !== cur.syncUpdatedAt || fresh.baseUpdatedAt !== cur.baseUpdatedAt || fresh.remoteSha !== cur.remoteSha;
      if (changed) {
        docRef.current = fresh;
        setCurrent(fresh);
        if (fresh.syncUpdatedAt !== cur.syncUpdatedAt) {
          setEditorKey((k) => k + 1);
          await loadPdfFor(fresh);
        }
      }
      return null;
    },
    [loadPdfFor]
  );

  const runSync = useCallback(async () => {
    if (syncingRef.current) return;
    const configured = isSyncConfigured();
    setSyncConfigured(configured);
    if (!configured) {
      setSync({ status: 'idle', message: 'GitHub未設定' });
      return;
    }
    syncingRef.current = true;
    setSync((s) => ({ ...s, status: 'syncing', message: undefined }));
    try {
      await flush();
      const cur = docRef.current;
      const before = cur ? { id: cur.id, sync: cur.syncUpdatedAt, base: cur.baseUpdatedAt } : null;
      const summary = await syncExplanations();
      const note = await refreshAfterSync(before);
      const problems = [...summary.errors, ...summary.warnings];
      setSync({
        status: summary.errors.length ? 'error' : 'idle',
        lastAt: new Date().toISOString(),
        message: [note, ...problems].filter(Boolean).join(' / ') || undefined,
        info: summarize(summary),
      });
    } catch (e) {
      console.error('Explanation sync failed', e);
      setSync((s) => ({ ...s, status: 'error', message: (e as Error).message }));
    } finally {
      syncingRef.current = false;
    }
  }, [flush, refreshAfterSync]);

  // ---- 初期読み込み ----
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listDocs();
        if (cancelled) return;
        setDocs(list);
        if (list.length > 0) {
          await openDoc(list[0]);
          if (!cancelled) setView('work');
        }
      } catch (e) {
        console.error('Failed to load explain docs', e);
        setSaveState('error');
      } finally {
        if (!cancelled) setLoaded(true);
      }
      // 開いたときに一度同期して、他の端末の変更を取り込む
      if (!cancelled) void runSync();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 一定時間ごと(5分)に、未同期の変更があれば同期する
  useEffect(() => {
    const id = window.setInterval(() => {
      if (docsRef.current.some(isDirty) || dirtyRef.current) void runSync();
    }, AUTO_SYNC_MS);
    return () => window.clearInterval(id);
  }, [runSync]);

  // タブを離れる/閉じる/画面を離れるときに保存(離れるときは同期も試みる)
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return;
      void flush().then(() => {
        if (docsRef.current.some(isDirty) || docRef.current) void runSync();
      });
    };
    const onUnload = () => void flush();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onUnload);
      void flush();
    };
  }, [flush, runSync]);

  // 狭い画面ではPDFとエディターをタブ切替
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // ---- 操作 ----
  const handleNewDoc = async (title?: string): Promise<LocalExplainDoc> => {
    await flush();
    const doc = createEmptyDoc(title);
    await saveDoc(doc);
    setDocs((prev) => [doc, ...prev]);
    await openDoc(doc);
    setView('work');
    return doc;
  };

  const handleOpenFromLibrary = async (doc: LocalExplainDoc) => {
    await openDoc(doc);
    setView('work');
  };

  const handleDuplicate = async (doc: LocalExplainDoc) => {
    await flush();
    const now = new Date().toISOString();
    const copy: LocalExplainDoc = {
      ...doc,
      id: crypto.randomUUID(),
      title: `${doc.title || '無題'} (コピー)`,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      syncUpdatedAt: now,
      baseUpdatedAt: null,
      remoteSha: null,
      lastSyncedAt: null,
    };
    await saveDoc(copy);
    setDocs(await listDocs());
  };

  const handleDelete = async (doc: LocalExplainDoc) => {
    const ok = window.confirm(
      `「${doc.title || '無題'}」を削除しますか?\nこの端末の解説本文と、保存したPDFが消えます。` +
        `GitHub同期を使っている場合は、GitHub上の解説も削除されます(他の端末からも消えます)。元に戻せません。`
    );
    if (!ok) return;
    if (docRef.current?.id === doc.id) {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      dirtyRef.current = false;
      docRef.current = null;
      setCurrent(null);
      setPdfBlob(null);
      setSaveState('saved');
    }
    await deleteDocWithTombstone(doc.id);
    setDocs(await listDocs());
    void runSync();
  };

  const handlePickFile = () => fileInputRef.current?.click();
  const handleNewFromPdf = () => {
    newFromPdfRef.current = true;
    fileInputRef.current?.click();
  };

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const asNew = newFromPdfRef.current;
    newFromPdfRef.current = false;
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      window.alert('PDFファイルを選んでください。');
      return;
    }
    try {
      const stored = await savePdf(file);
      if (asNew || !docRef.current) {
        await handleNewDoc(file.name.replace(/\.pdf$/i, ''));
      }
      const sameFile = docRef.current?.pdfKey === stored.key;
      patchDoc({
        pdfKey: stored.key,
        pdfFileName: stored.fileName,
        pdfFileSize: stored.fileSize,
        ...(sameFile ? {} : { pdfPage: 1 }),
      });
      setPdfBlob(stored.blob);
    } catch (err) {
      console.error('Failed to store PDF', err);
      window.alert('PDFをこの端末に保存できませんでした(保存容量を確認してください)。');
    }
  };

  const handleEditorChange = useCallback(
    (content: JSONContent) => patchDoc({ content }),
    [patchDoc]
  );

  // ---- 左右の境界ドラッグ ----
  const onSplitPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onSplitPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || !splitContainerRef.current) return;
    const rect = splitContainerRef.current.getBoundingClientRect();
    const r = (e.clientX - rect.left) / rect.width;
    setRatio(Math.min(MAX_SPLIT, Math.max(MIN_SPLIT, r)));
  };
  const onSplitPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    patchDoc({ splitRatio: ratio });
  };

  // ---- 表示 ----
  const unsyncedCount = docs.filter(isDirty).length;

  const saveBadge = (() => {
    switch (saveState) {
      case 'saved':
        return (
          <span className="flex items-center gap-1 text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            この端末に保存済み
          </span>
        );
      case 'saving':
        return (
          <span className="flex items-center gap-1 text-slate-300">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            保存中…
          </span>
        );
      case 'unsaved':
        return <span className="text-amber-400">未保存(自動で保存します)</span>;
      case 'error':
        return (
          <span className="flex items-center gap-1 text-rose-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            保存に失敗しました
          </span>
        );
    }
  })();

  const syncBadge = (() => {
    if (!syncConfigured) {
      return (
        <span className="flex items-center gap-1 text-slate-500" title="設定画面でGitHubのトークン・リポジトリを入力すると、解説が同期されます">
          <CloudOff className="w-3.5 h-3.5" />
          GitHub未設定
        </span>
      );
    }
    if (sync.status === 'syncing') {
      return (
        <span className="flex items-center gap-1 text-slate-300">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          同期中…
        </span>
      );
    }
    if (sync.status === 'error') {
      return (
        <span className="flex items-center gap-1 text-rose-400 max-w-[280px] truncate" title={sync.message}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          同期エラー: {sync.message}
        </span>
      );
    }
    if (unsyncedCount > 0) return <span className="text-amber-400">未同期 {unsyncedCount}件</span>;
    return (
      <span className="text-emerald-400" title={sync.message ?? sync.info}>
        同期済み{sync.info ? `(${sync.info})` : ''}
      </span>
    );
  })();

  const topBtn =
    'flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer disabled:opacity-40';

  const missingPdfName = current?.pdfKey && !pdfBlob ? current.pdfFileName : null;

  const pdfPane = current ? (
    <PdfViewer
      key={`${current.id}:${current.pdfKey ?? ''}:${pdfBlob ? 'blob' : 'none'}`}
      blob={pdfBlob}
      missingFileName={missingPdfName}
      page={current.pdfPage}
      zoom={current.pdfZoom}
      spreadSide={current.spreadSide}
      spreadRatio={current.spreadRatio}
      onPageChange={(p) => patchDoc({ pdfPage: p })}
      onZoomChange={(z) => patchDoc({ pdfZoom: z })}
      onSpreadSideChange={(s: SpreadSide) => patchDoc({ spreadSide: s })}
      onSpreadRatioChange={(r) => patchDoc({ spreadRatio: r })}
      onPickFile={handlePickFile}
    />
  ) : null;

  const layout = normalizeLayout(current?.layout);

  const editorMode = current?.editorMode ?? 'free';
  const missingReasons = current ? countMissingReasons(current.sections) : 0;

  const editorPane = current ? (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex border-b border-slate-800 bg-slate-900 text-xs shrink-0">
        {(
          [
            ['free', '自由記述'],
            ['sections', `大問(${current.sections.length})`],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            onClick={() => patchDoc({ editorMode: mode })}
            className={`px-4 py-2 cursor-pointer flex items-center gap-1 ${
              editorMode === mode ? 'text-emerald-400 border-b-2 border-emerald-500' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {label}
            {mode === 'sections' && missingReasons > 0 && (
              <span className="px-1 rounded bg-amber-500 text-slate-900 text-[10px] font-bold" title="理由が未入力の選択肢">
                {missingReasons}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {editorMode === 'free' ? (
          <DocEditor
            key={`${current.id}:${editorKey}`}
            initialContent={current.content}
            layout={layout}
            onChange={handleEditorChange}
          />
        ) : (
          <SectionsEditor
            key={`${current.id}:${editorKey}`}
            sections={current.sections}
            deletedSectionIds={current.deletedSectionIds}
            onChange={(next) => patchDoc(next)}
          />
        )}
      </div>
    </div>
  ) : null;

  const syncButton = (
    <button
      className={topBtn}
      onClick={() => void runSync()}
      disabled={sync.status === 'syncing'}
      title="GitHubと同期する(5分ごと・画面を離れるときにも自動で行います)"
    >
      <RefreshCw className={`w-3.5 h-3.5 ${sync.status === 'syncing' ? 'animate-spin' : ''}`} />
      同期
    </button>
  );

  return (
    <div className="flex flex-col w-full" style={{ height: 'calc(100dvh - 5.5rem)' }}>
      <input ref={fileInputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={handleFileChosen} />

      {aiPanelOpen && (
        <AiStatusPanel
          onClose={() => {
            setAiPanelOpen(false);
            setAiTick((t) => t + 1);
          }}
        />
      )}

      {previewOpen && current && (
        <PrintPreview
          doc={current}
          layout={layout}
          onLayoutChange={(l: PrintLayout) => patchDoc({ layout: l })}
          onClose={closePreview}
        />
      )}

      {/* 上部バー */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-800 bg-slate-900">
        <button
          className={`${topBtn} ${view === 'library' ? '!bg-slate-600' : ''}`}
          onClick={() => {
            void flush();
            setView('library');
          }}
        >
          <Library className="w-3.5 h-3.5" />
          ライブラリ
        </button>

        {view === 'work' && current && (
          <>
            <input
              value={current.title}
              onChange={(e) => patchDoc({ title: e.target.value })}
              placeholder="タイトル(例: 令和7年度 千葉県 本検査 英語)"
              className="flex-1 min-w-[160px] bg-slate-800 border border-slate-700 text-slate-100 text-xs rounded-md px-2 py-1.5"
              aria-label="解説のタイトル"
            />
            <button className={`${topBtn} ${showMeta ? '!bg-slate-600' : ''}`} onClick={() => setShowMeta((v) => !v)} title="年度・県・区分・状態">
              <Info className="w-3.5 h-3.5" />
              情報
            </button>
            <button className={topBtn} onClick={handlePickFile}>
              <FileUp className="w-3.5 h-3.5" />
              PDFを開く
            </button>
            {!popout.open && (
              <button
                className={topBtn}
                onClick={handleOpenPopout}
                title="問題PDFを別ウィンドウに出して、エディターを画面いっぱいに使えます(サブモニター向け)"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                PDFを別ウィンドウで開く
              </button>
            )}
            <button className={`${topBtn} !bg-emerald-700 hover:!bg-emerald-600 !border-emerald-600`} onClick={() => setPreviewOpen(true)}>
              <Printer className="w-3.5 h-3.5" />
              印刷プレビュー
            </button>
          </>
        )}

        <div className="ml-auto flex items-center gap-3 text-[11px]">
          <button
            key={aiTick}
            onClick={() => setAiPanelOpen(true)}
            className="px-2 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 cursor-pointer"
            title="今日のAI残り回数と、用途ごとのモデル設定(AIは任意。使わなくても解説は作れます)"
          >
            AI残り 読取{planFor('ocr').models.find((m) => m.model === planFor('ocr').next)?.remaining ?? 0}・解説
            {planFor('translate').models.find((m) => m.model === planFor('translate').next)?.remaining ?? 0}
          </button>
          {view === 'work' && current && saveBadge}
          {syncBadge}
          {syncButton}
        </div>
      </div>

      {view === 'work' && current && showMeta && <MetaPanel doc={current} onChange={patchDoc} />}

      {/* 本体 */}
      {!loaded ? (
        <div className="flex-1 flex items-center justify-center text-sm text-slate-400">読み込み中…</div>
      ) : view === 'library' || !current ? (
        <ExplainLibrary
          docs={docs}
          currentId={current?.id ?? null}
          syncConfigured={syncConfigured}
          onOpen={(d) => void handleOpenFromLibrary(d)}
          onNew={() => void handleNewDoc()}
          onNewFromPdf={handleNewFromPdf}
          onDuplicate={(d) => void handleDuplicate(d)}
          onDelete={(d) => void handleDelete(d)}
        />
      ) : popout.open ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 border-b border-slate-800 bg-sky-950/60 text-xs text-sky-100">
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            <span>PDFは別ウィンドウで表示中です。ページ送り・拡大は、どちらのウィンドウからでも操作できます。</span>
            <button className={`${topBtn} ml-auto`} onClick={popout.focusWindow}>
              別ウィンドウを前面へ
            </button>
            <button className={topBtn} onClick={popout.close}>
              PDFをこの画面に戻す
            </button>
          </div>
          <div className="flex-1 min-h-0">{editorPane}</div>
        </div>
      ) : narrow ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex border-b border-slate-800 bg-slate-900 text-xs">
            {(['pdf', 'editor'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-2 cursor-pointer ${tab === t ? 'text-emerald-400 border-b-2 border-emerald-500' : 'text-slate-400'}`}
              >
                {t === 'pdf' ? 'PDF' : '解説'}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0">{tab === 'pdf' ? pdfPane : editorPane}</div>
        </div>
      ) : (
        <div ref={splitContainerRef} className="flex-1 min-h-0 flex">
          <div style={{ width: `${ratio * 100}%` }} className="min-w-0 h-full">
            {pdfPane}
          </div>
          <div
            role="separator"
            aria-orientation="vertical"
            title="ドラッグで幅を変更"
            onPointerDown={onSplitPointerDown}
            onPointerMove={onSplitPointerMove}
            onPointerUp={onSplitPointerUp}
            className="w-1.5 shrink-0 cursor-col-resize bg-slate-700 hover:bg-emerald-600 transition-colors touch-none"
          />
          <div className="flex-1 min-w-0 h-full">{editorPane}</div>
        </div>
      )}
    </div>
  );
};

export default ExplainView;
