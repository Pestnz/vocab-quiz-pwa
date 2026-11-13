import { useSyncExternalStore } from 'react';
import type { CropImage } from './imageCompress';

/**
 * 切り抜いた画像の「置き場」(コピー&ペーストの代わり)。
 * PDFビューアで切り抜く → ここに入る → エディターの「切り抜きを貼り付け」で本文に入れる。
 * 同じ画像を、何度でも貼り付けられる。別ウィンドウで切り抜いた画像は、元のウィンドウ側のここに届く。
 */
let current: CropImage | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export function setCrop(img: CropImage | null): void {
  current = img;
  emit();
}

export function getCrop(): CropImage | null {
  return current;
}

export function useCrop(): CropImage | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current
  );
}

// ---- 解説ファイルの大きさ(GitHubに送る分)。画像を貼る前の「1MBを超えないか」の確認に使う ----

export const FILE_WARN_BYTES = 700_000;
export const FILE_MAX_BYTES = 1_000_000;

let docBytes = 0;
const sizeListeners = new Set<() => void>();

export function setDocBytes(n: number): void {
  if (n === docBytes) return;
  docBytes = n;
  sizeListeners.forEach((l) => l());
}

export function getDocBytes(): number {
  return docBytes;
}

export function useDocBytes(): number {
  return useSyncExternalStore(
    (cb) => {
      sizeListeners.add(cb);
      return () => sizeListeners.delete(cb);
    },
    () => docBytes
  );
}

/** base64のデータURLにしたときの、JSON内での概算バイト数 */
export const embeddedBytes = (img: CropImage): number => img.dataUrl.length + 120;

export type PasteCheck = { ok: true; warn: string | null } | { ok: false; reason: string };

/** 貼り付けても1MBを超えないか。超えるなら貼り付けを止める。700KBを超えるなら警告を返す */
export function checkPaste(img: CropImage): PasteCheck {
  const after = docBytes + embeddedBytes(img);
  if (after > FILE_MAX_BYTES) {
    return {
      ok: false,
      reason:
        `貼り付けると解説ファイルが約${Math.round(after / 1024)}KBになり、GitHubに送れる上限(約1MB)を超えます。` +
        `画像の数を減らすか、画像を小さく切り抜き直してください。`,
    };
  }
  if (after > FILE_WARN_BYTES) {
    return { ok: true, warn: `解説ファイルが約${Math.round(after / 1024)}KBになります。1MBを超える前に、画像の数や大きさを見直してください。` };
  }
  return { ok: true, warn: null };
}
