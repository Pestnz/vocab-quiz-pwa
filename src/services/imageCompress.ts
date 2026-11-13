/**
 * 切り抜き画像の圧縮(SPEC §5.5)。解説ファイルに埋め込むので、小さく保つ。
 * - 長辺は maxEdge px 以下(既定 1000px)
 * - WebP が使えれば WebP、なければ JPEG。画質を下げ、それでも大きければ縮小して、maxBytes 以下に収める
 */

export interface CropImage {
  dataUrl: string; // 'data:image/webp;base64,...'
  width: number;
  height: number;
  bytes: number; // 画像データのバイト数(base64化の前)
  mime: 'image/webp' | 'image/jpeg';
}

export const DEFAULT_MAX_EDGE = 1000;
export const DEFAULT_MAX_BYTES = 150_000;
const MIN_EDGE = 360;

let webpOk: boolean | null = null;
function supportsWebp(): boolean {
  if (webpOk === null) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    webpOk = c.toDataURL('image/webp').startsWith('data:image/webp');
  }
  return webpOk;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像を作れませんでした。'))), type, quality);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('画像を読み込めませんでした。'));
    r.readAsDataURL(blob);
  });
}

/** 元のキャンバスを、長辺 maxEdge 以下・maxBytes 以下に圧縮して返す */
export async function compressCanvas(
  source: HTMLCanvasElement,
  opts: { maxEdge?: number; maxBytes?: number } = {}
): Promise<CropImage> {
  const maxEdge = opts.maxEdge ?? DEFAULT_MAX_EDGE;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const mime: CropImage['mime'] = supportsWebp() ? 'image/webp' : 'image/jpeg';

  let scale = Math.min(1, maxEdge / Math.max(source.width, source.height));
  let best: { blob: Blob; w: number; h: number } | null = null;

  for (let round = 0; round < 6; round++) {
    const w = Math.max(1, Math.round(source.width * scale));
    const h = Math.max(1, Math.round(source.height * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('画像を作れませんでした。');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, w, h);

    for (const q of [0.8, 0.65, 0.5]) {
      const blob = await toBlob(c, mime, q);
      best = { blob, w, h };
      if (blob.size <= maxBytes) {
        return { dataUrl: await blobToDataUrl(blob), width: w, height: h, bytes: blob.size, mime };
      }
    }
    if (Math.max(w, h) <= MIN_EDGE) break; // これ以上小さくすると読めなくなる
    scale *= 0.8;
  }
  // 目標に届かなくても、最後の(最小の)結果を返す。呼び出し側がサイズを見て警告する
  if (!best) throw new Error('画像を作れませんでした。');
  return { dataUrl: await blobToDataUrl(best.blob), width: best.w, height: best.h, bytes: best.blob.size, mime };
}
