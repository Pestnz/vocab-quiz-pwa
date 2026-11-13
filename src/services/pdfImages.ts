import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export interface PageImage {
  label: string; // 例: 'p2' / 'p2左' / 'p2右'
  base64: string; // JPEG(データ部分のみ)
  width: number;
  height: number;
  bytes: number;
}

/** '1-3,5' → [1,2,3,5]。範囲外・重複は除く */
export function parsePageSpec(spec: string, pageCount: number): number[] {
  const out = new Set<number>();
  for (const part of spec.split(/[,、\s]+/).filter(Boolean)) {
    const m = /^(\d+)(?:\s*[-〜~]\s*(\d+))?$/.exec(part);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let p = Math.min(a, b); p <= Math.max(a, b); p++) if (p >= 1 && p <= pageCount) out.add(p);
  }
  return [...out].sort((x, y) => x - y);
}

export async function countPdfPages(file: Blob): Promise<number> {
  const task = pdfjsLib.getDocument({ data: await file.arrayBuffer(), wasmUrl: `${import.meta.env.BASE_URL}pdfjs/wasm/` });
  try {
    const doc = await task.promise;
    return doc.numPages;
  } finally {
    void task.destroy();
  }
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<{ base64: string; bytes: number }> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) return reject(new Error('画像を作れませんでした。'));
        const buf = new Uint8Array(await blob.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        resolve({ base64: btoa(bin), bytes: blob.size });
      },
      'image/jpeg',
      quality
    );
  });
}

/**
 * PDFの指定ページを、長辺 maxEdge px 以下のJPEGにする(AIに送る用)。
 * splitSpread が true のときは、各ページを左右に半分ずつに分けて、2枚にする(見開きスキャン用)。
 */
export async function renderPdfPages(
  file: Blob,
  pages: number[],
  opts: { maxEdge?: number; quality?: number; splitSpread?: boolean } = {}
): Promise<PageImage[]> {
  const { maxEdge = 1800, quality = 0.85, splitSpread = false } = opts;
  const task = pdfjsLib.getDocument({ data: await file.arrayBuffer(), wasmUrl: `${import.meta.env.BASE_URL}pdfjs/wasm/` });
  const out: PageImage[] = [];
  try {
    const doc = await task.promise;
    for (const p of pages) {
      const page = await doc.getPage(p);
      const base = page.getViewport({ scale: 1 });
      // 見開きを半分にして送るときは、半分の幅が maxEdge に収まるようにする
      const targetLong = splitSpread ? maxEdge * 2 : maxEdge;
      const scale = Math.min(3, targetLong / Math.max(base.width, base.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('画像を作れませんでした。');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;

      if (!splitSpread) {
        const j = await canvasToJpeg(canvas, quality);
        out.push({ label: `p${p}`, base64: j.base64, width: canvas.width, height: canvas.height, bytes: j.bytes });
      } else {
        const half = Math.floor(canvas.width / 2);
        for (const [side, x] of [['左', 0], ['右', half]] as const) {
          const c2 = document.createElement('canvas');
          c2.width = half;
          c2.height = canvas.height;
          c2.getContext('2d')?.drawImage(canvas, x, 0, half, canvas.height, 0, 0, half, canvas.height);
          const j = await canvasToJpeg(c2, quality);
          out.push({ label: `p${p}${side}`, base64: j.base64, width: c2.width, height: c2.height, bytes: j.bytes });
        }
      }
    }
  } finally {
    void task.destroy();
  }
  return out;
}

/** 画像ファイル(JPEG/PNG)を、長辺 maxEdge px 以下のJPEGにする */
export async function imageFileToJpeg(file: Blob, maxEdge = 1800, quality = 0.85): Promise<PageImage> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(bmp.width * scale));
  canvas.height = Math.max(1, Math.floor(bmp.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('画像を作れませんでした。');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const j = await canvasToJpeg(canvas, quality);
  return { label: 'image', base64: j.base64, width: canvas.width, height: canvas.height, bytes: j.bytes };
}
