/**
 * 本文の画像を、行の切れ目で数行ずつの短冊(strip)に分ける。
 * AIは、長い英文を一度に書き出すと「既存の文章の再現(RECITATION)」とみなして止めてしまうが、
 * 数行ずつなら読み取れる(実測)。分けた短冊を順番に読んで、あとでつなげる。
 */

export interface Strip {
  base64: string; // JPEG(データ部分のみ)
  width: number;
  height: number;
  lines: number; // この短冊に含まれる行数(推定)
}

export interface StripPlan {
  strips: Strip[];
  lineCount: number;
}

export const DEFAULT_LINES_PER_STRIP = 6;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('画像を読み込めませんでした。'));
    img.src = src;
  });
}

/** 文字のある行(帯)を、上から順に検出する。縦の罫線・スキャンのふちなど、全体に続く暗い線は無視する */
function detectLineBands(data: Uint8ClampedArray, w: number, h: number): Array<[number, number]> {
  const dark = (i: number): boolean => (data[i] + data[i + 1] + data[i + 2]) / 3 < 150;

  // 縦に長く続く暗い列(罫線やふち)は、文字ではないので除く
  const colDark = new Uint32Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (dark((y * w + x) * 4)) colDark[x]++;
  const skipCol = new Uint8Array(w);
  for (let x = 0; x < w; x++) if (colDark[x] > h * 0.6) skipCol[x] = 1;

  const inkRow = new Uint8Array(h);
  const minInk = Math.max(3, Math.floor(w * 0.004));
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (!skipCol[x] && dark((y * w + x) * 4)) n++;
    inkRow[y] = n >= minInk ? 1 : 0;
  }

  const bands: Array<[number, number]> = [];
  let start = -1;
  let gap = 0;
  for (let y = 0; y <= h; y++) {
    const ink = y < h && inkRow[y] === 1;
    if (ink) {
      if (start < 0) start = y;
      gap = 0;
    } else if (start >= 0) {
      gap++;
      if (gap > 3 || y === h) {
        const end = y - gap; // 最後に文字があった行
        if (end - start >= 8) bands.push([start, end]); // 8px未満は、ゴミ・しみとして捨てる
        start = -1;
        gap = 0;
      }
    }
  }
  return bands;
}

async function cropToStrip(img: CanvasImageSource, w: number, top: number, bottom: number, lines: number): Promise<Strip> {
  const pad = 4;
  const t = Math.max(0, top - pad);
  const b = bottom + pad;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = Math.max(1, b - t);
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('画像を作れませんでした。');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, t, w, c.height, 0, 0, w, c.height);
  const blob: Blob = await new Promise((res, rej) => c.toBlob((x) => (x ? res(x) : rej(new Error('画像を作れませんでした。'))), 'image/jpeg', 0.9));
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { base64: btoa(bin), width: c.width, height: c.height, lines };
}

/**
 * 画像を、行の切れ目で、linesPerStrip 行ずつの短冊に分ける。
 * 行を検出できなかったときは、高さで等分する(行の途中で切れることがある)。
 */
export async function planStrips(base64Jpeg: string, linesPerStrip = DEFAULT_LINES_PER_STRIP): Promise<StripPlan> {
  const img = await loadImage(`data:image/jpeg;base64,${base64Jpeg}`);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('画像を作れませんでした。');
  ctx.drawImage(img, 0, 0);
  const bands = detectLineBands(ctx.getImageData(0, 0, w, h).data, w, h);

  const n = Math.max(1, linesPerStrip);
  if (bands.length < 2) {
    // 行を数えられない: 高さで等分する
    const count = Math.max(1, Math.ceil(h / 280));
    const out: Strip[] = [];
    for (let i = 0; i < count; i++) out.push(await cropToStrip(canvas, w, Math.floor((h * i) / count), Math.ceil((h * (i + 1)) / count), 0));
    return { strips: out, lineCount: bands.length };
  }

  const groups: Array<Array<[number, number]>> = [];
  for (let i = 0; i < bands.length; i += n) groups.push(bands.slice(i, i + n));
  // 最後の短冊が1〜2行だけにならないよう、前の短冊と合わせる
  if (groups.length > 1 && groups[groups.length - 1].length <= 2) {
    const last = groups.pop() as Array<[number, number]>;
    groups[groups.length - 1] = [...groups[groups.length - 1], ...last];
  }

  const strips: Strip[] = [];
  for (let g = 0; g < groups.length; g++) {
    const first = groups[g][0][0];
    const last = groups[g][groups[g].length - 1][1];
    // 切れ目は、前後の行のちょうど真ん中(行と行のあいだの余白)
    const top = g === 0 ? 0 : Math.floor((groups[g - 1][groups[g - 1].length - 1][1] + first) / 2);
    const bottom = g === groups.length - 1 ? h : Math.ceil((last + groups[g + 1][0][0]) / 2);
    strips.push(await cropToStrip(canvas, w, top, bottom, groups[g].length));
  }
  return { strips, lineCount: bands.length };
}
