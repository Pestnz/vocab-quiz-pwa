import React, { useState } from 'react';
import { Lock, KeyRound, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { hashPassword } from '../../services/crypto';

interface DiaryLockModalProps {
  storedPasswordHash: string;
  onUnlock: () => void;
  onExit: () => void;
}

export const DiaryLockModal: React.FC<DiaryLockModalProps> = ({
  storedPasswordHash,
  onUnlock,
  onExit,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('パスワードを入力してください');
      return;
    }

    setIsVerifying(true);
    setError('');

    try {
      const hashed = await hashPassword(password.trim());
      if (hashed === storedPasswordHash) {
        onUnlock();
      } else {
        setError('パスワードが一致しません');
      }
    } catch (err) {
      setError('パスワードの照合に失敗しました');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[450px] p-6 text-center animate-in fade-in duration-200">
      <div className="w-full max-w-sm bg-slate-850/90 border border-slate-750/80 rounded-2xl p-6 shadow-2xl backdrop-blur-md space-y-5">
        <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mx-auto shadow-inner">
          <Lock className="w-7 h-7" />
        </div>

        <div className="space-y-1">
          <h2 className="text-base font-bold text-slate-100">日記はパスワードで保護されています</h2>
          <p className="text-xs text-slate-400">
            閲覧・編集するには設定済みのパスワードを入力してください
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => {
                setPassword(e.target.value);
                if (error) setError('');
              }}
              placeholder="パスワードを入力..."
              autoFocus
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 pr-10 tracking-wider"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {error && (
            <div className="flex items-center justify-center gap-1.5 text-xs text-rose-400 bg-rose-950/40 border border-rose-800/60 py-1.5 px-3 rounded-lg animate-in shake">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={onExit}
              className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
            >
              戻る
            </button>

            <button
              type="submit"
              disabled={isVerifying || !password.trim()}
              className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-md shadow-indigo-950"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>ロック解除</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
