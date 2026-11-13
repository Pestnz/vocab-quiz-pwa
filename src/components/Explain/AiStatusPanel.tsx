import React, { useState } from 'react';
import { X, RotateCcw, Save } from 'lucide-react';
import {
  AI_PURPOSE_LABEL,
  DEFAULT_AI_CONFIG,
  loadAiConfig,
  loadUsage,
  nextResetText,
  normalizeAiConfig,
  pacificDateKey,
  saveAiConfig,
} from '../../services/aiRouter';
import type { AiConfig, AiPurpose } from '../../services/aiRouter';

interface AiStatusPanelProps {
  onClose: () => void;
}

const input = 'bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100';

/** 今日のAI残り回数と、用途ごとのモデル割り当て・1日の上限の確認・変更 */
export const AiStatusPanel: React.FC<AiStatusPanelProps> = ({ onClose }) => {
  const [cfg, setCfg] = useState<AiConfig>(() => loadAiConfig());
  const [usage, setUsage] = useState(() => loadUsage());
  const [limitDraft, setLimitDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(loadAiConfig().limits).map(([k, v]) => [k, String(v)]))
  );
  const [routeDraft, setRouteDraft] = useState<Record<AiPurpose, string>>(() => {
    const c = loadAiConfig();
    return Object.fromEntries(Object.entries(c.routes).map(([k, v]) => [k, v.join(', ')])) as Record<AiPurpose, string>;
  });
  const [message, setMessage] = useState<string | null>(null);

  const purposes = Object.keys(AI_PURPOSE_LABEL) as AiPurpose[];
  // 一覧に出すモデル: 上限が1以上のもの
  const models = Object.keys(cfg.limits)
    .filter((m) => cfg.limits[m] > 0)
    .sort();

  const save = () => {
    const limits: Record<string, number> = {};
    for (const [k, v] of Object.entries(limitDraft)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) limits[k] = Math.floor(n);
    }
    const routes = Object.fromEntries(
      purposes.map((p) => [p, routeDraft[p].split(/[,、\s]+/).map((s) => s.trim()).filter(Boolean)])
    ) as Record<AiPurpose, string[]>;
    const next = normalizeAiConfig({ version: 1, routes, limits });
    // 無料枠が0のモデルは外される。外れたものを知らせる
    const dropped = purposes.flatMap((p) => routes[p].filter((m) => !next.routes[p].includes(m)));
    saveAiConfig(next);
    setCfg(next);
    setLimitDraft(Object.fromEntries(Object.entries(next.limits).map(([k, v]) => [k, String(v)])));
    setRouteDraft(Object.fromEntries(Object.entries(next.routes).map(([k, v]) => [k, v.join(', ')])) as Record<AiPurpose, string>);
    setUsage(loadUsage());
    setMessage(
      dropped.length > 0
        ? `保存しました。無料枠が0のモデルは、フォールバックから外しました: ${[...new Set(dropped)].join(', ')}`
        : '保存しました。'
    );
  };

  const reset = () => {
    saveAiConfig(DEFAULT_AI_CONFIG);
    const c = loadAiConfig();
    setCfg(c);
    setLimitDraft(Object.fromEntries(Object.entries(c.limits).map(([k, v]) => [k, String(v)])));
    setRouteDraft(Object.fromEntries(Object.entries(c.routes).map(([k, v]) => [k, v.join(', ')])) as Record<AiPurpose, string>);
    setMessage('初期値に戻しました。');
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 flex items-start justify-center overflow-auto p-4" role="dialog" aria-label="AI設定と残り回数">
      <div className="w-full max-w-3xl rounded-xl border border-slate-700 bg-slate-900 shadow-xl mt-6">
        <div className="flex items-center px-4 py-3 border-b border-slate-800">
          <h2 className="text-sm font-bold text-slate-100">AI設定と今日の残り回数</h2>
          <button className="ml-auto p-1 rounded text-slate-400 hover:text-white hover:bg-slate-700 cursor-pointer" onClick={onClose} title="閉じる">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4 text-xs text-slate-300">
          <p className="text-slate-400">
            太平洋時間 {pacificDateKey()} の分です。次のリセットは {nextResetText()} です。
            <br />
            この数え方は<strong className="text-slate-200">解説機能で使った分だけ</strong>です。単語登録・作文採点・日記も同じ枠を使うので、
            それらのために残しておきたい回数があれば、上限を少なめに設定してください(予約枠の代わりになります)。
          </p>

          <div className="rounded-lg border border-slate-800 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-950 text-slate-400">
                <tr>
                  <th className="text-left font-medium px-3 py-2">モデル</th>
                  <th className="text-right font-medium px-3 py-2">今日の使用</th>
                  <th className="text-right font-medium px-3 py-2">1日の上限</th>
                  <th className="text-right font-medium px-3 py-2">残り</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => {
                  const used = usage.counts[m] ?? 0;
                  const lim = Number(limitDraft[m] ?? cfg.limits[m]);
                  return (
                    <tr key={m} className="border-t border-slate-800">
                      <td className="px-3 py-1.5 font-mono text-slate-200">{m}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{used}</td>
                      <td className="px-3 py-1.5 text-right">
                        <input
                          type="number"
                          min={0}
                          value={limitDraft[m] ?? ''}
                          onChange={(e) => setLimitDraft((d) => ({ ...d, [m]: e.target.value }))}
                          className={`${input} w-20 text-right`}
                          aria-label={`${m} の1日の上限`}
                        />
                      </td>
                      <td className={`px-3 py-1.5 text-right font-mono ${Math.max(0, lim - used) === 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {Number.isFinite(lim) ? Math.max(0, lim - used) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="font-semibold text-slate-200 mb-1">用途ごとのモデル(先頭が主モデル、以降がフォールバック順)</h3>
            <div className="space-y-2">
              {purposes.map((p) => (
                <label key={p} className="flex items-center gap-2">
                  <span className="w-44 shrink-0 text-slate-400">{AI_PURPOSE_LABEL[p]}</span>
                  <input
                    value={routeDraft[p]}
                    onChange={(e) => setRouteDraft((d) => ({ ...d, [p]: e.target.value }))}
                    className={`${input} flex-1 font-mono`}
                    aria-label={`${AI_PURPOSE_LABEL[p]} のモデル`}
                  />
                </label>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              モデルIDはカンマ区切りです。実在するIDは、Google AI Studio のモデル一覧(または models.list)で確認してください。
              無料枠が0のモデル(gemini-2.5-pro など)は、自動で外れます。混雑(503)や枠切れ(429)のときは、次のモデルに自動で切り替わります。
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={save}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-medium cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              保存
            </button>
            <button
              onClick={reset}
              className="flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              初期値に戻す
            </button>
            {message && <span className="text-emerald-400">{message}</span>}
          </div>
        </div>
      </div>
    </div>
  );
};
