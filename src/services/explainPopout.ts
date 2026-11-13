import type { SpreadSide } from '../types/explain';
import type { CropImage } from './imageCompress';

/**
 * PDFを別ウィンドウに出す機能の、2つのウィンドウ間のやり取り。
 * - 別ウィンドウは同じアプリの別ページ(#explain-pdf/{sid}/{docId})。PDFは同じ端末の IndexedDB から直接読む
 * - ページ・拡大率・見開き設定は BroadcastChannel(同じ端末・同じサイト内だけで届く)で同期する
 * - 保存(IndexedDB / GitHub)を行うのは元のウィンドウだけ。別ウィンドウは表示と操作の送信だけ
 */

export const POPOUT_HASH_PREFIX = '#explain-pdf/';

export const popoutChannelName = (sid: string): string => `explain-pdf-${sid}`;

export function popoutUrl(sid: string, docId: string): string {
  return `${window.location.pathname}${window.location.search}${POPOUT_HASH_PREFIX}${sid}/${docId}`;
}

export function parsePopoutHash(hash: string): { sid: string; docId: string } | null {
  if (!hash.startsWith(POPOUT_HASH_PREFIX)) return null;
  const [sid, docId] = hash.slice(POPOUT_HASH_PREFIX.length).split('/');
  return sid && docId ? { sid, docId } : null;
}

/** 元のウィンドウ → 別ウィンドウ: いまの表示状態 */
export interface PopoutState {
  docId: string;
  title: string;
  pdfKey: string | null;
  pdfFileName: string | null;
  page: number;
  zoom: number;
  spreadSide: SpreadSide;
  spreadRatio: number;
}

/** 別ウィンドウ → 元のウィンドウ: 変更の依頼(ページ送りなど) */
export interface PopoutPatch {
  pdfPage?: number;
  pdfZoom?: number;
  spreadSide?: SpreadSide;
  spreadRatio?: number;
  pdfKey?: string;
  pdfFileName?: string;
  pdfFileSize?: number;
}

export type MainToPopout = { type: 'state'; state: PopoutState } | { type: 'heartbeat' };
export type PopoutToMain =
  | { type: 'ready' }
  | { type: 'patch'; docId: string; patch: PopoutPatch }
  | { type: 'crop'; image: CropImage }; // 別ウィンドウで切り抜いた画像(元のウィンドウの「切り抜きを貼り付け」で使う)

/** 元のウィンドウからの合図(心拍)がこの時間ないと、接続が切れたとみなす */
export const HEARTBEAT_INTERVAL_MS = 2000;
export const HEARTBEAT_TIMEOUT_MS = 7000;
