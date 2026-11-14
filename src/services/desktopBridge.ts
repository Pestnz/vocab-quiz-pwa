/**
 * デスクトップ版(Electron)だけが用意する機能の入り口。
 * ブラウザ・PWAでは window.desktopApp が無いので、すべて「使えない」扱いになり、従来どおり動く。
 */
export interface DesktopPdf {
  name: string;
  path: string;
  bytes: Uint8Array;
}

export interface DesktopRecentPdf {
  name: string;
  path: string;
  openedAt: string;
}

interface DesktopApi {
  isDesktop: true;
  pickPdf: () => Promise<DesktopPdf | null>;
  recentPdfs: () => Promise<DesktopRecentPdf[]>;
  readRecentPdf: (path: string) => Promise<DesktopPdf>;
  savePrintAsPdf: (name: string) => Promise<{ saved: boolean; path?: string }>;
}

export function getDesktop(): DesktopApi | null {
  const api = (window as unknown as { desktopApp?: DesktopApi }).desktopApp;
  return api && api.isDesktop === true ? api : null;
}

export function desktopPdfToFile(p: DesktopPdf): File {
  // Uint8Array を、そのまま File にする(ArrayBuffer に切り出して型を合わせる)
  const buf = p.bytes.buffer.slice(p.bytes.byteOffset, p.bytes.byteOffset + p.bytes.byteLength) as ArrayBuffer;
  return new File([buf], p.name, { type: 'application/pdf' });
}
