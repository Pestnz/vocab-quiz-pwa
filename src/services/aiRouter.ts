import { getStoredSettings } from './storage';

/**
 * 解説ワークベンチ用の Gemini 呼び出し基盤(既存の単語・日記などの呼び出しとは独立)。
 * - 用途ごとに主モデルとフォールバック順を持つ(設定で変更可)。モデルIDは設定に持ち、コードに直書きしない
 * - モデルごとの1日の使用回数を端末に記録(太平洋時間の0時でリセット)。残りが無いモデルは飛ばす
 * - 429(枠切れ)・503(混雑)・500系・404 は、次のモデルへ自動で切り替える
 * - safetySettings は送らない / systemInstruction は camelCase / JSONは最外周の {...} を取り出してから解析
 * - APIキーは URL に載せず、ヘッダー(x-goog-api-key)で送る。ログ・エラー文に出さない
 */

export type AiPurpose = 'translate' | 'diary' | 'score' | 'vocabBatch' | 'ocr';

export const AI_PURPOSE_LABEL: Record<AiPurpose, string> = {
  translate: '全訳・品詞分解・解答解説',
  diary: '日記の添削・語彙抽出',
  score: '一文作成の採点',
  vocabBatch: '単語バッチ登録',
  ocr: 'OCR・正答表の読み取り',
};

export interface AiConfig {
  version: 1;
  routes: Record<AiPurpose, string[]>; // 用途ごとのモデル。先頭が主モデル、以降がフォールバック順
  limits: Record<string, number>; // モデルごとの1日の上限(0 = 無料枠で使えない)
}

const LITE_ROUTE = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.6-flash'];
// gemini-2.5-flash は「新規利用者には提供終了」(404)になっていたため、models.list にある gemini-3.5-flash に替えた
const FLASH_ROUTE = ['gemini-3.6-flash', 'gemini-3-flash-preview', 'gemini-3.8-flash', 'gemini-3.5-flash'];

/** 初期値(2026-11-11 に利用者と確定した割り当てと、AI Studio の無料枠の実測値) */
export const DEFAULT_AI_CONFIG: AiConfig = {
  version: 1,
  routes: {
    translate: FLASH_ROUTE,
    diary: FLASH_ROUTE,
    score: LITE_ROUTE,
    vocabBatch: LITE_ROUTE,
    ocr: ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
  },
  limits: {
    'gemini-3.6-flash': 20,
    'gemini-3-flash-preview': 20,
    'gemini-3.8-flash': 20,
    'gemini-3.5-flash': 20, // 無料枠の実測値が未確認のため、少ない枠のモデルと同じ慎重な値
    'gemini-2.5-flash': 20,
    'gemini-2.5-flash-lite': 20,
    'gemini-3.1-flash-lite': 500,
    'gemini-3.5-flash-lite': 500,
    // 無料枠が0のモデル。フォールバックには入れない
    'gemini-2.5-pro': 0,
    'gemini-3.1-pro-preview': 0,
  },
};

const CONFIG_KEY = 'explain_ai_config';
const USAGE_KEY = 'explain_ai_usage';
const UNKNOWN_MODEL_LIMIT = 20; // 設定にないモデルは、少ない枠のモデルと同じ慎重な値で数える

// ---------------- 設定 ----------------

function cleanRoute(list: unknown, limits: Record<string, number>): string[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of list) {
    if (typeof m !== 'string') continue;
    const id = m.trim();
    if (!id || seen.has(id)) continue;
    if ((limits[id] ?? UNKNOWN_MODEL_LIMIT) <= 0) continue; // 無料枠0のモデルは入れない
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function normalizeAiConfig(raw: Partial<AiConfig> | null | undefined): AiConfig {
  const limits: Record<string, number> = { ...DEFAULT_AI_CONFIG.limits };
  if (raw?.limits && typeof raw.limits === 'object') {
    for (const [k, v] of Object.entries(raw.limits)) {
      if (typeof v === 'number' && Number.isFinite(v) && v >= 0) limits[k] = Math.floor(v);
    }
  }
  const routes = { ...DEFAULT_AI_CONFIG.routes } as Record<AiPurpose, string[]>;
  for (const p of Object.keys(routes) as AiPurpose[]) {
    const cleaned = cleanRoute(raw?.routes?.[p], limits);
    routes[p] = cleaned.length > 0 ? cleaned : cleanRoute(DEFAULT_AI_CONFIG.routes[p], limits);
  }
  return { version: 1, routes, limits };
}

export function loadAiConfig(): AiConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return normalizeAiConfig(raw ? (JSON.parse(raw) as Partial<AiConfig>) : null);
  } catch {
    return normalizeAiConfig(null);
  }
}

export function saveAiConfig(cfg: AiConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(normalizeAiConfig(cfg)));
  } catch (e) {
    console.error('Failed to save AI config', e);
  }
}

// ---------------- 使用回数(太平洋時間の0時でリセット) ----------------

interface UsageRecord {
  date: string; // 太平洋時間の日付 'YYYY-MM-DD'
  counts: Record<string, number>;
}

export function pacificDateKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function loadUsage(now: Date = new Date()): UsageRecord {
  const today = pacificDateKey(now);
  try {
    const raw = localStorage.getItem(USAGE_KEY);
    if (raw) {
      const u = JSON.parse(raw) as UsageRecord;
      if (u.date === today && u.counts && typeof u.counts === 'object') return u;
    }
  } catch {
    /* 壊れていたら作り直す */
  }
  return { date: today, counts: {} };
}

function saveUsage(u: UsageRecord): void {
  try {
    localStorage.setItem(USAGE_KEY, JSON.stringify(u));
  } catch (e) {
    console.error('Failed to save AI usage', e);
  }
}

export function recordUsage(model: string, now: Date = new Date()): void {
  const u = loadUsage(now);
  u.counts[model] = (u.counts[model] ?? 0) + 1;
  saveUsage(u);
}

export const limitOf = (cfg: AiConfig, model: string): number => cfg.limits[model] ?? UNKNOWN_MODEL_LIMIT;

export function remainingOf(model: string, cfg: AiConfig = loadAiConfig(), usage: UsageRecord = loadUsage()): number {
  return Math.max(0, limitOf(cfg, model) - (usage.counts[model] ?? 0));
}

/** 次の太平洋時間0時(= 枠がリセットされる時刻)を、この端末の時刻で「11月14日 17:00頃」の形にする */
export function nextResetText(now: Date = new Date()): string {
  // 太平洋時間の「今日」の0時から、1日ずつ進めて、いまより後になる最初の時刻を探す(夏時間でも正しい)
  const fmtDate = (d: Date) => pacificDateKey(d);
  const todayKey = fmtDate(now);
  for (let h = 1; h <= 26; h++) {
    const t = new Date(now.getTime() + h * 3600_000);
    if (fmtDate(t) !== todayKey) {
      // 日付が変わった境目を、分単位で詰める
      for (let m = (h - 1) * 60; m <= h * 60; m++) {
        const c = new Date(now.getTime() + m * 60_000);
        if (fmtDate(c) !== todayKey) {
          return `${c.getMonth() + 1}月${c.getDate()}日 ${c.getHours()}:${String(c.getMinutes()).padStart(2, '0')}頃`;
        }
      }
    }
  }
  return '明日';
}

export interface AiPlan {
  purpose: AiPurpose;
  models: Array<{ model: string; remaining: number; limit: number }>;
  next: string | null; // 次に使われるモデル(残りがあるもの)。全部なければ null
  canRun: boolean;
}

/** 実行前の表示用: 使うモデルと、今日の残り回数 */
export function planFor(purpose: AiPurpose, cfg: AiConfig = loadAiConfig(), usage: UsageRecord = loadUsage()): AiPlan {
  const models = cfg.routes[purpose].map((model) => ({
    model,
    remaining: remainingOf(model, cfg, usage),
    limit: limitOf(cfg, model),
  }));
  const next = models.find((m) => m.remaining > 0)?.model ?? null;
  return { purpose, models, next, canRun: next !== null };
}

// ---------------- 呼び出し ----------------

export type AiErrorCode = 'no-key' | 'auth' | 'exhausted' | 'bad-request' | 'parse' | 'network' | 'empty' | 'recitation';

export class AiError extends Error {
  code: AiErrorCode;
  attempts: Array<{ model: string; status: string }>;
  constructor(code: AiErrorCode, message: string, attempts: Array<{ model: string; status: string }> = []) {
    super(message);
    this.code = code;
    this.attempts = attempts;
  }
}

export type AiPart = { text: string } | { inlineData: { mimeType: string; data: string } };

export interface AiCallOptions {
  purpose: AiPurpose;
  parts: AiPart[];
  system?: string;
  json?: boolean; // JSONで答えさせる
  schema?: Record<string, unknown>; // 構造化出力のスキーマ(OpenAPI形式の一部)
  temperature?: number;
  maxOutputTokens?: number;
  apiKey?: string; // 省略時は設定画面のAPIキー
  signal?: AbortSignal;
  fetchImpl?: typeof fetch; // テスト用
  retryDelayMs?: number; // 503のあとの待ち時間(テストで短くする用)
  config?: AiConfig; // テスト用
}

export interface AiCallResult {
  text: string;
  model: string;
  attempts: Array<{ model: string; status: string }>;
}

const FALLBACK_STATUSES = new Set([404, 429, 500, 502, 503, 504]);

function maskKey(text: string, key: string): string {
  return key ? text.split(key).join('<KEY>') : text;
}

function buildBody(o: AiCallOptions, withSchema: boolean): string {
  const generationConfig: Record<string, unknown> = {};
  if (o.json) generationConfig.responseMimeType = 'application/json';
  if (o.json && o.schema && withSchema) generationConfig.responseSchema = o.schema;
  if (o.temperature !== undefined) generationConfig.temperature = o.temperature;
  if (o.maxOutputTokens !== undefined) generationConfig.maxOutputTokens = o.maxOutputTokens;
  const body: Record<string, unknown> = { contents: [{ parts: o.parts }] };
  if (o.system) body.systemInstruction = { parts: [{ text: o.system }] }; // camelCase
  if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;
  // safetySettings は送らない(無料枠で BLOCK_NONE は HTTP 400 になるため)
  return JSON.stringify(body);
}

/** 用途のモデル順に試し、使えたモデルの応答を返す。全部だめなら AiError('exhausted') */
export async function callGemini(o: AiCallOptions): Promise<AiCallResult> {
  const apiKey = (o.apiKey ?? getStoredSettings().geminiApiKey ?? '').trim();
  if (!apiKey) {
    throw new AiError('no-key', 'Gemini APIキーが未設定です。設定画面でキーを登録するか、手入力で進めてください。');
  }
  const cfg = o.config ?? loadAiConfig();
  const doFetch = o.fetchImpl ?? fetch;
  const usage = loadUsage();
  const attempts: Array<{ model: string; status: string }> = [];
  let sawQuota = false;
  let sawNetwork = false;
  let sawRecitation = false; // 「既存の文章の再現」とみなされて、出力が止められた

  for (const model of cfg.routes[o.purpose]) {
    if (remainingOf(model, cfg, usage) <= 0) {
      attempts.push({ model, status: '本日の枠を使い切り(端末の記録)' });
      sawQuota = true;
      continue;
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    let withSchema = Boolean(o.schema);
    let retried503 = false;

    for (let pass = 0; pass < 3; pass++) {
      let res: Response;
      try {
        res = await doFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: buildBody(o, withSchema),
          signal: o.signal,
        });
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
        attempts.push({ model, status: '通信エラー' });
        sawNetwork = true;
        break; // 次のモデルへ
      }

      if (res.ok) {
        const data = (await res.json().catch(() => null)) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
        } | null;
        const cand = data?.candidates?.[0];
        const text = (cand?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
        if (text) {
          recordUsage(model);
          attempts.push({ model, status: 'OK' });
          return { text, model, attempts };
        }
        attempts.push({ model, status: `空の応答(${cand?.finishReason ?? '不明'})` });
        if (cand?.finishReason === 'RECITATION') sawRecitation = true;
        break; // 次のモデルへ
      }

      const errBody = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      const message = maskKey(errBody.error?.message ?? `HTTP ${res.status}`, apiKey);

      if (res.status === 400 && withSchema && /schema|Unknown name|responseSchema/i.test(message)) {
        withSchema = false; // このモデルがスキーマ指定を受け付けない → スキーマなしで1回だけやり直す
        continue;
      }
      if (res.status === 401 || res.status === 403) {
        throw new AiError('auth', `APIキーが使えません(${res.status})。キーと権限を確認してください。`, attempts);
      }
      if (res.status === 503 && !retried503) {
        // 混雑は一時的なことが多い。次のモデルへ移る前に、少し待って同じモデルをもう一度試す(503は回数に数えない)
        retried503 = true;
        await new Promise((r) => setTimeout(r, o.retryDelayMs ?? 2500));
        continue;
      }
      if (FALLBACK_STATUSES.has(res.status)) {
        attempts.push({ model, status: res.status === 429 ? '枠切れ(429)' : res.status === 503 ? '混雑(503)' : `エラー(${res.status})` });
        if (res.status === 429) sawQuota = true;
        break; // 次のモデルへ
      }
      throw new AiError('bad-request', `Geminiがリクエストを受け付けませんでした: ${message}`, attempts);
    }
  }

  const summary = attempts.map((a) => `${a.model}: ${a.status}`).join(' / ');
  if (attempts.length === 0) {
    throw new AiError('exhausted', 'この用途で使えるモデルが設定されていません。AI設定を確認してください。', attempts);
  }
  if (sawQuota) {
    throw new AiError(
      'exhausted',
      `いま使えるAIの枠がありません。再開は ${nextResetText()} です。手入力に切り替えて進められます。(${summary})`,
      attempts
    );
  }
  if (sawNetwork) {
    throw new AiError('network', `Geminiに接続できませんでした。通信を確認してください。(${summary})`, attempts);
  }
  if (sawRecitation) {
    throw new AiError(
      'recitation',
      `AIが、長い文章の書き出しを「既存の文章の再現」とみなして止めました。読む範囲を短くして、やり直してください。(${summary})`,
      attempts
    );
  }
  throw new AiError(
    'exhausted',
    `AIが混み合っているか、一時的に使えません。少し待ってからやり直すか、手入力に切り替えてください。(${summary})`,
    attempts
  );
}

/** JSONの応答から、最外周の {...} を取り出して解析する(コードブロックの囲みは外す) */
export function extractJsonObject<T>(text: string): T {
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const m = clean.match(/\{[\s\S]*\}/);
  if (!m) throw new AiError('parse', 'AIの応答からJSONを取り出せませんでした。');
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    throw new AiError('parse', 'AIの応答のJSONを解析できませんでした。');
  }
}

/** JSONで答えさせる呼び出し。解析に失敗したら、1回だけやり直す(その分の回数も消費する) */
export async function callGeminiJson<T>(o: Omit<AiCallOptions, 'json'>): Promise<{ data: T; model: string; attempts: AiCallResult['attempts'] }> {
  const first = await callGemini({ ...o, json: true });
  try {
    return { data: extractJsonObject<T>(first.text), model: first.model, attempts: first.attempts };
  } catch (e) {
    if (!(e instanceof AiError) || e.code !== 'parse') throw e;
    const second = await callGemini({ ...o, json: true });
    return { data: extractJsonObject<T>(second.text), model: second.model, attempts: [...first.attempts, ...second.attempts] };
  }
}
