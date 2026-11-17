import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Loader2, MessageCircleQuestion, RefreshCw, Send, Trash2 } from 'lucide-react';
import {
  AUDIENCE_LABEL,
  AUDIENCE_ORDER,
  GENRE_LABEL,
  GENRE_ORDER,
  LEVEL_LABEL,
  LEVEL_ORDER,
} from '../../types/teaching';
import type { Audience, Genre, PracticeAttempt, StudentLevel } from '../../types/teaching';
import { pickTopic } from '../../services/teachingTopics';
import { evaluateAnswer, generateQuestion } from '../../services/teachingAi';
import { countAnsweredOn, deleteAttempt, loadAllAttempts, localDateKey, upsertAttempt } from '../../services/teachingStore';
import { syncTeaching } from '../../services/teachingSync';
import { isSyncConfigured } from '../../services/explanationSync';
import { AiError, planFor } from '../../services/aiRouter';
import { getStoredSettings } from '../../services/storage';

const SETUP_KEY = 'teaching_setup';
const DAILY_GOAL = 3; // Step 2 で変更できるようにする

interface Setup {
  audience: Audience;
  studentLevel: StudentLevel;
  genres: Genre[]; // 空 = 広め
}

const DEFAULT_SETUP: Setup = { audience: 'jh2', studentLevel: 'normal', genres: [] };

function loadSetup(): Setup {
  try {
    const raw = JSON.parse(localStorage.getItem(SETUP_KEY) ?? 'null') as Partial<Setup> | null;
    if (!raw) return DEFAULT_SETUP;
    return {
      audience: AUDIENCE_ORDER.includes(raw.audience as Audience) ? (raw.audience as Audience) : DEFAULT_SETUP.audience,
      studentLevel: LEVEL_ORDER.includes(raw.studentLevel as StudentLevel) ? (raw.studentLevel as StudentLevel) : DEFAULT_SETUP.studentLevel,
      genres: Array.isArray(raw.genres) ? raw.genres.filter((g): g is Genre => GENRE_ORDER.includes(g as Genre)) : [],
    };
  } catch {
    return DEFAULT_SETUP;
  }
}

const chip = (on: boolean) =>
  `px-2.5 py-1.5 rounded-md text-xs font-medium border cursor-pointer transition-colors ${
    on ? 'bg-teal-600 border-teal-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
  }`;

const newId = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `tp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const ACCURACY_LABEL = { correct: '内容は正しい', partly: '一部に誤り・不足', incorrect: '内容に誤り' } as const;
const ACCURACY_COLOR = {
  correct: 'bg-emerald-900/50 text-emerald-300 border-emerald-700',
  partly: 'bg-amber-900/40 text-amber-300 border-amber-700',
  incorrect: 'bg-rose-900/40 text-rose-300 border-rose-700',
} as const;

const dots = (n: number) => '●'.repeat(n) + '○'.repeat(5 - n);

export const TeachingPractice: React.FC = () => {
  const [setup, setSetup] = useState<Setup>(loadSetup);
  const [attempts, setAttempts] = useState<PracticeAttempt[]>(() => loadAllAttempts());
  const [current, setCurrent] = useState<PracticeAttempt | null>(null); // 出題中・回答中・結果表示中の1問
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState<'idle' | 'question' | 'evaluate'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [aiTick, setAiTick] = useState(0);
  const [sync, setSync] = useState<{ status: 'idle' | 'syncing' | 'ok' | 'error'; message?: string }>({ status: 'idle' });
  const [showHistory, setShowHistory] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const syncingRef = useRef(false);

  const hasKey = Boolean(getStoredSettings().geminiApiKey?.trim());
  const syncOn = isSyncConfigured();
  const today = localDateKey();
  const todayCount = useMemo(() => countAnsweredOn(attempts, today), [attempts, today]);

  // AI残り回数(出題用・判定用)
  const plans = useMemo(() => {
    void aiTick;
    return { q: planFor('teachQuestion'), e: planFor('teachEvaluate') };
  }, [aiTick]);

  useEffect(() => {
    try {
      localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
    } catch {
      /* 保存できなくても使える */
    }
  }, [setup]);

  const reload = useCallback(() => setAttempts(loadAllAttempts()), []);

  const runSync = useCallback(async () => {
    if (!isSyncConfigured() || syncingRef.current) return;
    syncingRef.current = true;
    setSync({ status: 'syncing' });
    try {
      const r = await syncTeaching();
      if (r.pulled > 0) reload();
      setSync(r.errors.length > 0 ? { status: 'error', message: r.errors[0] } : { status: 'ok', message: `送信${r.pushed} / 取得${r.pulled}` });
    } catch (e) {
      setSync({ status: 'error', message: (e as Error).message });
    } finally {
      syncingRef.current = false;
    }
  }, [reload]);

  // 開いたときに1回同期(別の端末の記録を取り込む)
  useEffect(() => {
    void runSync();
    return () => abortRef.current?.abort();
  }, [runSync]);

  const toggleGenre = (g: Genre) =>
    setSetup((s) => ({ ...s, genres: s.genres.includes(g) ? s.genres.filter((x) => x !== g) : [...s.genres, g] }));

  const explainAiError = (e: unknown): string => {
    if (e instanceof AiError) return e.message;
    if ((e as Error)?.name === 'AbortError') return '中断しました。';
    return (e as Error)?.message || 'AIの呼び出しに失敗しました。';
  };

  const handleAsk = async () => {
    setError(null);
    setBusy('question');
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const recent = attempts.slice(0, 40);
      const { genre, topic } = pickTopic(setup.genres, recent.map((a) => a.topic));
      const q = await generateQuestion({
        audience: setup.audience,
        studentLevel: setup.studentLevel,
        genre,
        topic,
        recentQuestions: recent.map((a) => a.question),
        signal: ctrl.signal,
      });
      const now = new Date().toISOString();
      // 出題しただけの段階では保存しない(答えるまでは記録に残さない)
      setCurrent({
        id: newId(),
        createdAt: now,
        updatedAt: now,
        audience: setup.audience,
        studentLevel: setup.studentLevel,
        genres: setup.genres,
        topic,
        situation: q.situation,
        question: q.question,
        answer: '',
      });
      setAnswer('');
    } catch (e) {
      setError(explainAiError(e));
    } finally {
      setBusy('idle');
      setAiTick((t) => t + 1);
    }
  };

  const handleEvaluate = async () => {
    if (!current || !answer.trim()) return;
    setError(null);
    setBusy('evaluate');
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    // 判定に失敗しても、答えは失われないよう、先に保存する
    const saved: PracticeAttempt = { ...current, answer: answer.trim(), updatedAt: new Date().toISOString() };
    if (!upsertAttempt(saved)) setError('この端末に保存できませんでした(保存容量を確認してください)。');
    setCurrent(saved);
    reload();
    try {
      const evaluation = await evaluateAnswer({
        audience: saved.audience,
        studentLevel: saved.studentLevel,
        question: saved.question,
        answer: saved.answer,
        signal: ctrl.signal,
      });
      const done: PracticeAttempt = { ...saved, evaluation, updatedAt: new Date().toISOString() };
      upsertAttempt(done);
      setCurrent(done);
      reload();
      void runSync();
    } catch (e) {
      setError(`${explainAiError(e)}(答えは保存してあります。もう一度「判定する」を押せます)`);
    } finally {
      setBusy('idle');
      setAiTick((t) => t + 1);
    }
  };

  const handleDelete = (a: PracticeAttempt) => {
    if (!window.confirm('この記録を削除しますか?(他の端末からも消えます)')) return;
    deleteAttempt(a);
    if (current?.id === a.id) setCurrent(null);
    reload();
    void runSync();
  };

  const ev = current?.evaluation;
  const planNote = (label: string, p: { canRun: boolean; next: string | null }) =>
    p.canRun ? null : (
      <p className="text-[11px] text-amber-300 flex items-center gap-1">
        <AlertTriangle className="w-3 h-3 shrink-0" />
        {label}に使えるAIの枠が、いまありません。時間をおいて、やり直してください。
      </p>
    );

  return (
    <div className="max-w-3xl mx-auto w-full p-3 sm:p-5 space-y-4 pb-24">
      <div className="flex flex-wrap items-center gap-2">
        <MessageCircleQuestion className="w-5 h-5 text-teal-400" />
        <h2 className="text-base font-bold text-slate-100">質問応対練習</h2>
        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300" title="今日、答えまで進めた問題数">
          今日 {todayCount} / {DAILY_GOAL} 問
        </span>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-slate-400">
          {syncOn ? (
            <button
              onClick={() => void runSync()}
              className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 border border-slate-700 hover:bg-slate-700 cursor-pointer"
              title="GitHubと同期(別の端末の記録を取り込みます)"
            >
              <RefreshCw className={`w-3 h-3 ${sync.status === 'syncing' ? 'animate-spin' : ''}`} />
              同期
            </button>
          ) : (
            <span title="設定画面でGitHubを設定すると、他の端末と記録を共有できます">GitHub未設定(この端末のみ)</span>
          )}
          {sync.status === 'ok' && <span className="text-emerald-400">{sync.message}</span>}
          {sync.status === 'error' && (
            <span className="text-rose-400 max-w-[220px] truncate" title={sync.message}>
              同期エラー: {sync.message}
            </span>
          )}
        </div>
      </div>

      {!hasKey && (
        <p className="text-xs text-amber-300 flex items-center gap-1.5 p-2 rounded border border-amber-800 bg-amber-950/40">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Gemini APIキーが未設定です。設定画面でキーを登録すると、出題と判定が使えます。
        </p>
      )}

      {/* 出題の設定 */}
      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-3">
        <div className="space-y-1">
          <p className="text-[11px] text-slate-400">相手の学年</p>
          <div className="flex flex-wrap gap-1.5">
            {AUDIENCE_ORDER.map((a) => (
              <button key={a} className={chip(setup.audience === a)} onClick={() => setSetup((s) => ({ ...s, audience: a }))}>
                {AUDIENCE_LABEL[a]}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-[11px] text-slate-400">相手の英語力</p>
          <div className="flex flex-wrap gap-1.5">
            {LEVEL_ORDER.map((l) => (
              <button key={l} className={chip(setup.studentLevel === l)} onClick={() => setSetup((s) => ({ ...s, studentLevel: l }))}>
                {LEVEL_LABEL[l]}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <p className="text-[11px] text-slate-400">ジャンル(選ばなければ、すべてから完全ランダム)</p>
          <div className="flex flex-wrap gap-1.5">
            <button className={chip(setup.genres.length === 0)} onClick={() => setSetup((s) => ({ ...s, genres: [] }))}>
              広め(おまかせ)
            </button>
            {GENRE_ORDER.map((g) => (
              <button key={g} className={chip(setup.genres.includes(g))} onClick={() => toggleGenre(g)}>
                {GENRE_LABEL[g]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            onClick={() => void handleAsk()}
            disabled={busy !== 'idle' || !hasKey || !plans.q.canRun}
            className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-40 cursor-pointer"
          >
            {busy === 'question' ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircleQuestion className="w-4 h-4" />}
            {current ? '別の質問を出す' : '質問を出す'}
          </button>
          <span className="text-[11px] text-slate-500">出題に使うAI: {plans.q.next ?? '—'}</span>
        </div>
        {planNote('出題', plans.q)}
      </section>

      {error && (
        <p className="text-xs text-rose-300 flex items-start gap-1.5 p-2 rounded border border-rose-900 bg-rose-950/40">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="break-words min-w-0">{error}</span>
        </p>
      )}

      {/* 出題された質問 */}
      {current && (
        <section className="rounded-lg border border-teal-800/70 bg-slate-900 p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
            <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">
              {AUDIENCE_LABEL[current.audience]} / {LEVEL_LABEL[current.studentLevel]}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700">{current.topic}</span>
            {current.situation && <span>{current.situation}</span>}
          </div>
          <p className="text-base leading-relaxed text-slate-100 whitespace-pre-wrap">「{current.question}」</p>

          <label className="block text-xs text-slate-400">
            あなたの答え(生徒に話しかけるつもりで)
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={7}
              disabled={busy === 'evaluate'}
              maxLength={2000}
              aria-label="あなたの答え"
              placeholder="ここに答えを書きます。例や言い換えも入れてみましょう。"
              className="mt-1 w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 leading-relaxed"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void handleEvaluate()}
              disabled={busy !== 'idle' || !answer.trim() || !hasKey || !plans.e.canRun}
              className="flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 cursor-pointer"
            >
              {busy === 'evaluate' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {ev ? '判定し直す' : '判定する'}
            </button>
            <span className="text-[11px] text-slate-500">
              {busy === 'evaluate' ? '判定中…(混んでいるときは1分ほどかかります)' : `判定に使うAI: ${plans.e.next ?? '—'}`}
            </span>
            <span className="ml-auto text-[11px] text-slate-500">{answer.length} / 2000字</span>
          </div>
          {planNote('判定', plans.e)}

          {/* 判定結果 */}
          {ev && (
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-3xl font-bold text-slate-100">
                  {ev.score}
                  <span className="text-sm font-normal text-slate-400"> 点</span>
                </div>
                <span className={`text-xs px-2 py-1 rounded border ${ACCURACY_COLOR[ev.accuracy]}`}>{ACCURACY_LABEL[ev.accuracy]}</span>
                <div className="text-[11px] text-slate-400 space-y-0.5">
                  <div>
                    わかりやすさ <span className="text-teal-300 tracking-wider">{dots(ev.clarity)}</span>
                  </div>
                  <div>
                    レベルへの合い具合 <span className="text-teal-300 tracking-wider">{dots(ev.levelFit)}</span>
                  </div>
                </div>
              </div>
              {ev.accuracyNote && <p className="text-sm text-slate-200 whitespace-pre-wrap">{ev.accuracyNote}</p>}

              {ev.strengths.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-emerald-300 mb-1">よかった点</p>
                  <ul className="list-disc pl-5 text-sm text-slate-200 space-y-0.5">
                    {ev.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {ev.issues.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-amber-300 mb-1">わかりにくい点・直したい点</p>
                  <ul className="list-disc pl-5 text-sm text-slate-200 space-y-0.5">
                    {ev.issues.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {ev.improvedAnswer && (
                <div className="rounded-md border border-sky-800 bg-sky-950/30 p-3">
                  <p className="text-xs font-semibold text-sky-300 mb-1">修正案(この生徒に向けた言い方の例)</p>
                  <p className="text-sm text-slate-100 leading-relaxed whitespace-pre-wrap">{ev.improvedAnswer}</p>
                </div>
              )}
              {ev.tip && (
                <p className="text-sm text-slate-200">
                  <span className="text-xs font-semibold text-teal-300">次に意識すること: </span>
                  {ev.tip}
                </p>
              )}
              <p className="text-[10px] text-slate-500">
                この判定はAIによる参考です。文法の説明などは、AIが誤ることもあります。気になる点は、ご自身でも確認してください。
              </p>
              <button
                onClick={() => void handleAsk()}
                disabled={busy !== 'idle' || !hasKey || !plans.q.canRun}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-40 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                次の質問へ
              </button>
            </div>
          )}
        </section>
      )}

      {/* 履歴(Step 2 で、絞り込み・やり直し・分析を足す) */}
      <section className="rounded-lg border border-slate-800 bg-slate-900/40">
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-200 cursor-pointer"
        >
          {showHistory ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          これまでの記録({attempts.filter((a) => a.answer.trim()).length}件)
        </button>
        {showHistory && (
          <ul className="divide-y divide-slate-800">
            {attempts
              .filter((a) => a.answer.trim())
              .slice(0, 50)
              .map((a) => (
                <li key={a.id} className="px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <button className="flex-1 min-w-0 text-left cursor-pointer" onClick={() => setOpenId(openId === a.id ? null : a.id)}>
                      <span className="text-slate-500 mr-2">{new Date(a.createdAt).toLocaleDateString('ja-JP')}</span>
                      <span className="text-slate-500 mr-2">{AUDIENCE_LABEL[a.audience]}</span>
                      <span className="text-slate-200">{a.question.slice(0, 40)}{a.question.length > 40 ? '…' : ''}</span>
                    </button>
                    <span className="text-slate-300 font-mono shrink-0">{a.evaluation ? `${a.evaluation.score}点` : '未判定'}</span>
                    <button onClick={() => handleDelete(a)} className="text-slate-500 hover:text-rose-400 cursor-pointer" title="削除">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {openId === a.id && (
                    <div className="mt-2 space-y-2 pl-1 text-slate-300">
                      <p className="whitespace-pre-wrap">Q. {a.question}</p>
                      <p className="whitespace-pre-wrap text-slate-200">A. {a.answer}</p>
                      {a.evaluation?.improvedAnswer && <p className="whitespace-pre-wrap text-sky-200">修正案: {a.evaluation.improvedAnswer}</p>}
                    </div>
                  )}
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default TeachingPractice;
