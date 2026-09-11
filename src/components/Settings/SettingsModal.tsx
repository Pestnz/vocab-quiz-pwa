import React, { useState, useEffect } from 'react';
import { X, Check, Key, Sparkles, RefreshCw, AlertCircle, ExternalLink } from 'lucide-react';
import type { AppSettings } from '../../types/vocab';
import { githubSyncService } from '../../services/githubSync';
import { testGeminiApiKey } from '../../services/gemini';

const GithubIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
    />
  </svg>
);

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onSave,
}) => {
  const [form, setForm] = useState<AppSettings>(settings);
  const [githubTestState, setGithubTestState] = useState<{ loading: boolean; message: string; success?: boolean }>({
    loading: false,
    message: '',
  });
  const [geminiTestState, setGeminiTestState] = useState<{ loading: boolean; message: string; success?: boolean }>({
    loading: false,
    message: '',
  });

  useEffect(() => {
    setForm(settings);
    setGithubTestState({ loading: false, message: '' });
    setGeminiTestState({ loading: false, message: '' });
  }, [settings, isOpen]);

  if (!isOpen) return null;

  const handleChange = (field: keyof AppSettings, val: string) => {
    setForm(prev => ({ ...prev, [field]: val }));
  };

  const handleTestGithub = async () => {
    setGithubTestState({ loading: true, message: 'リポジトリに接続中...' });
    const res = await githubSyncService.testConnection(form);
    setGithubTestState({
      loading: false,
      message: res.message,
      success: res.success,
    });
  };

  const handleTestGemini = async () => {
    setGeminiTestState({ loading: true, message: 'Gemini 2.5 Flash に問い合わせ中...' });
    const res = await testGeminiApiKey(form.geminiApiKey);
    setGeminiTestState({
      loading: false,
      message: res.message,
      success: res.success,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/75 backdrop-blur-xs">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden text-slate-100 animate-in fade-in zoom-in-95 duration-150">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2 font-semibold text-base text-slate-100">
            <Key className="w-4 h-4 text-emerald-400" />
            <span>連携・ストレージ設定</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* フォーム本体 */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-3 space-y-5 text-xs">
          {/* 説明 */}
          <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/40 text-emerald-200">
            <p className="leading-relaxed">
              トークンとAPIキーはお使いのブラウザ（LocalStorage）にのみ安全に保存されます。外部サーバーへの送信は一切行われません。
            </p>
          </div>

          {/* GitHub設定セクション */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <div className="flex items-center gap-1.5 font-medium text-slate-200 text-sm">
                <GithubIcon className="w-4 h-4 text-slate-300" />
                <span>GitHub 同期設定 (vocab.json)</span>
              </div>
              <a
                href="https://github.com/settings/tokens"
                target="_blank"
                rel="noreferrer"
                className="text-emerald-400 hover:underline flex items-center gap-1 text-[11px]"
              >
                PAT発行 <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div>
              <label className="block font-medium text-slate-300 mb-1">
                Personal Access Token (classic / fine-grained) <span className="text-rose-400">*</span>
              </label>
              <input
                type="password"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                value={form.githubToken}
                onChange={e => handleChange('githubToken', e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 focus:outline-hidden focus:border-emerald-500 font-mono"
              />
              <p className="text-[10px] text-slate-400 mt-1">※ プライベートリポジトリの場合は `repo` 権限が必要です</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  所有者 (Username) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="octocat"
                  value={form.repoOwner}
                  onChange={e => handleChange('repoOwner', e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 focus:outline-hidden focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-300 mb-1">
                  リポジトリ名 <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="my-vocab-data"
                  value={form.repoName}
                  onChange={e => handleChange('repoName', e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 focus:outline-hidden focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-medium text-slate-300 mb-1">ブランチ名</label>
                <input
                  type="text"
                  placeholder="main"
                  value={form.branch}
                  onChange={e => handleChange('branch', e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 focus:outline-hidden focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-300 mb-1">保存先ファイル名</label>
                <input
                  type="text"
                  placeholder="vocab.json"
                  value={form.filePath}
                  onChange={e => handleChange('filePath', e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 focus:outline-hidden focus:border-emerald-500"
                />
              </div>
            </div>

            {/* GitHub 接続テスト */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleTestGithub}
                disabled={githubTestState.loading || !form.githubToken || !form.repoOwner || !form.repoName}
                className="w-full py-1.5 px-3 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-750 text-slate-200 font-medium disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors"
              >
                {githubTestState.loading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                ) : (
                  <GithubIcon className="w-3.5 h-3.5 text-slate-400" />
                )}
                <span>GitHub 接続テスト</span>
              </button>
              {githubTestState.message && (
                <div
                  className={`mt-1.5 p-2 rounded text-[11px] flex items-start gap-1.5 ${
                    githubTestState.success
                      ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                      : 'bg-rose-950/60 text-rose-300 border border-rose-800'
                  }`}
                >
                  {githubTestState.success ? (
                    <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  )}
                  <span>{githubTestState.message}</span>
                </div>
              )}
            </div>
          </div>

          {/* Gemini AI 設定セクション */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
              <div className="flex items-center gap-1.5 font-medium text-slate-200 text-sm">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Gemini 3.6 Flash API 設定</span>
              </div>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-amber-400 hover:underline flex items-center gap-1 text-[11px]"
              >
                無料キー取得 <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div>
              <label className="block font-medium text-slate-300 mb-1">
                Gemini API Key <span className="text-rose-400">*</span>
              </label>
              <input
                type="password"
                placeholder="AIzaSyxxxxxxxxxxxxxxxxxxxx"
                value={form.geminiApiKey}
                onChange={e => handleChange('geminiApiKey', e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 focus:outline-hidden focus:border-amber-500 font-mono"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                ※ Google AI Studioの無料枠でメモから意味・解説・例文を自動解析します
              </p>
            </div>

            {/* Gemini 接続テスト */}
            <div className="pt-1">
              <button
                type="button"
                onClick={handleTestGemini}
                disabled={geminiTestState.loading || !form.geminiApiKey}
                className="w-full py-1.5 px-3 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-750 text-slate-200 font-medium disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors"
              >
                {geminiTestState.loading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span>Gemini API 疎通テスト</span>
              </button>
              {geminiTestState.message && (
                <div
                  className={`mt-1.5 p-2 rounded text-[11px] flex items-start gap-1.5 ${
                    geminiTestState.success
                      ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                      : 'bg-rose-950/60 text-rose-300 border border-rose-800'
                  }`}
                >
                  {geminiTestState.success ? (
                    <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  )}
                  <span>{geminiTestState.message}</span>
                </div>
              )}
            </div>
          </div>

          {/* フッター */}
          <div className="pt-3 border-t border-slate-800 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="flex-1 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium flex items-center justify-center gap-1.5 shadow-md shadow-emerald-950 transition-colors"
            >
              <Check className="w-4 h-4" />
              <span>設定を保存</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
