import fs from 'fs';
import { deflateSync } from 'zlib';

function createIconPng(size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type);
    const body = Buffer.concat([typeBuf, data]);
    const crc = crc32(body);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc);
    return Buffer.concat([len, body, crcBuf]);
  }

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const rawRows = [];
  const cx = size / 2;
  const cy = size / 2;

  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    row[0] = 0; // Filter None

    for (let x = 0; x < size; x++) {
      const idx = 1 + x * 4;
      const nx = (x - cx) / (size / 2);
      const ny = (y - cy) / (size / 2);
      const dist = Math.sqrt(nx * nx + ny * ny);

      // 背景: 洗練されたダークスレート〜エメラルドディープグラデーション
      const t = (x + y) / (size * 2);
      let r = Math.round(15 * (1 - t) + 16 * t);
      let g = Math.round(23 * (1 - t) + 60 * t);
      let b = Math.round(42 * (1 - t) + 70 * t);
      let a = 255;

      // 中央のグラデーションサークル・バッジ（角丸スクワークル風）
      const cornerDist = Math.pow(Math.abs(nx), 4) + Math.pow(Math.abs(ny), 4);
      if (cornerDist < 0.65) {
        // 内側: エメラルド (16, 185, 129) 〜 インディゴ・シアン (6, 182, 212) の鮮やかなグラデーション
        const innerT = (nx + ny + 1.4) / 2.8;
        r = Math.round(16 * (1 - innerT) + 6 * innerT);
        g = Math.round(185 * (1 - innerT) + 182 * innerT);
        b = Math.round(129 * (1 - innerT) + 212 * innerT);

        // 「V」と「本（Book）」を象徴するスタイリッシュな白いベクター風グリフ
        const gx = Math.abs(nx);
        const gy = ny;

        // Vの字（シャープなカット）
        const inV = gy > -0.35 && gy < 0.35 && Math.abs(gx - (gy + 0.35) * 0.55) < 0.08;
        // 開いた本の上部カーブ
        const inBookPage = gy < -0.1 && gy > -0.35 && Math.abs(gx - 0.22) < 0.18;

        if (inV || (inBookPage && Math.abs(gy - (-0.25)) < 0.04)) {
          r = 255;
          g = 255;
          b = 255;
        }

        // 光彩・グロー効果
        if (cornerDist > 0.58) {
          r = Math.min(255, r + 50);
          g = Math.min(255, g + 50);
          b = Math.min(255, b + 50);
        }
      }

      row[idx] = r;
      row[idx + 1] = g;
      row[idx + 2] = b;
      row[idx + 3] = a;
    }
    rawRows.push(row);
  }

  const idatData = deflateSync(Buffer.concat(rawRows));
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// 192x192, 512x512, apple-touch-icon を生成
fs.writeFileSync('public/pwa-192x192.png', createIconPng(192));
fs.writeFileSync('public/pwa-512x512.png', createIconPng(512));
fs.writeFileSync('public/apple-touch-icon.png', createIconPng(180));

// さらに高品質なベクターSVGファビコンも作成
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#064e3b" />
    </linearGradient>
    <linearGradient id="brand" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#10b981" />
      <stop offset="50%" stop-color="#06b6d4" />
      <stop offset="100%" stop-color="#6366f1" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#10b981" flood-opacity="0.45"/>
    </filter>
  </defs>
  <rect width="512" height="512" rx="128" fill="url(#bg)" />
  <rect x="64" y="64" width="384" height="384" rx="96" fill="url(#brand)" filter="url(#glow)" />
  <g fill="#ffffff">
    <!-- スタイリッシュな「V」と開いたブックシンボル -->
    <path d="M170 170 L256 340 L342 170 L300 170 L256 270 L212 170 Z" />
    <path d="M256 360 C230 335 180 330 140 335 L140 355 C180 350 230 355 256 380 C282 355 332 350 372 355 L372 335 C332 330 282 335 256 360 Z" opacity="0.9" />
    <!-- スパークル星 -->
    <path d="M340 140 Q355 140 355 125 Q355 140 370 140 Q355 140 355 155 Q355 140 340 140 Z" />
  </g>
</svg>`;

fs.writeFileSync('public/favicon.svg', svgIcon);
console.log('High quality PWA icons generated successfully!');
