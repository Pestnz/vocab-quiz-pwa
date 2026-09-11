import React from 'react';
import { RefreshCw, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';
import type { SyncStatusState } from '../../types/vocab';

interface SyncStatusBadgeProps {
  status: SyncStatusState;
  lastSyncedAt?: string;
  errorMessage?: string;
  onManualSync?: () => void;
  onOpenSettings?: () => void;
}

export const SyncStatusBadge: React.FC<SyncStatusBadgeProps> = ({
  status,
  lastSyncedAt,
  errorMessage,
  onManualSync,
  onOpenSettings,
}) => {
  const getBadgeContent = () => {
    switch (status) {
      case 'syncing':
        return {
          icon: <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />,
          label: '同期中',
          bg: 'bg-amber-950/50 text-amber-300 border-amber-800/50',
          clickable: false,
        };
      case 'synced':
        return {
          icon: <CheckCircle2 className="w-3 h-3 text-emerald-400" />,
          label: '同期済',
          bg: 'bg-emerald-950/50 text-emerald-300 border-emerald-800/50',
          clickable: true,
        };
      case 'error':
      case 'conflict':
        return {
          icon: <AlertCircle className="w-3 h-3 text-rose-400" />,
          label: '同期失敗',
          bg: 'bg-rose-950/50 text-rose-300 border-rose-800/50',
          clickable: true,
        };
      case 'unconfigured':
      default:
        return {
          icon: <AlertTriangle className="w-3 h-3 text-slate-400" />,
          label: '未設定',
          bg: 'bg-slate-800/80 text-slate-400 border-slate-700',
          clickable: true,
        };
    }
  };

  const badge = getBadgeContent();

  const handleClick = () => {
    if (status === 'unconfigured') {
      onOpenSettings?.();
    } else if (status !== 'syncing') {
      onManualSync?.();
    }
  };

  const formattedTime = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={handleClick}
        title={
          status === 'unconfigured'
            ? 'GitHub連携が未設定です。クリックして設定'
            : errorMessage
            ? `エラー: ${errorMessage} (クリックで再同期)`
            : `最終同期: ${formattedTime || '未'} (クリックで再取得)`
        }
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all ${
          badge.bg
        } ${badge.clickable ? 'hover:scale-105 active:scale-95 cursor-pointer' : 'cursor-default'}`}
      >
        {badge.icon}
        <span>{badge.label}</span>
      </button>
    </div>
  );
};
