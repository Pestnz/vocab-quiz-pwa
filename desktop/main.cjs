// 入試解説ワークベンチ デスクトップ版の殻。
// PWA本体(../dist)を、app:// という専用の入り口から読み込む。本体のコードは基本的に変更しない。
const { app, BrowserWindow, protocol, net, shell, dialog, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const DIST = app.isPackaged ? path.join(process.resourcesPath, 'dist') : path.join(__dirname, '..', 'dist');
const ORIGIN = 'app://workbench';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

function registerAppProtocol() {
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    let file = path.normalize(path.join(DIST, rel));
    // dist の外は読ませない
    if (!file.startsWith(DIST + path.sep) && file !== DIST) return new Response('forbidden', { status: 403 });
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      // 拡張子のないパスだけ index.html に戻す(画面遷移用)。存在しない assets は 404
      if (path.extname(rel)) return new Response('not found', { status: 404 });
      file = path.join(DIST, 'index.html');
    }
    return net.fetch(pathToFileURL(file).toString());
  });
}

// ---- 最近開いたPDF(パスと名前だけをこの端末の userData に保存。PDFの中身は保存しない) ----
const RECENT_MAX = 15;
const recentFile = () => path.join(app.getPath('userData'), 'recent-pdfs.json');

function loadRecent() {
  try {
    const list = JSON.parse(fs.readFileSync(recentFile(), 'utf8'));
    return Array.isArray(list) ? list.filter((r) => r && typeof r.path === 'string') : [];
  } catch {
    return [];
  }
}

function addRecent(p) {
  const rest = loadRecent().filter((r) => r.path !== p);
  const next = [{ path: p, name: path.basename(p), openedAt: new Date().toISOString() }, ...rest].slice(0, RECENT_MAX);
  try {
    fs.writeFileSync(recentFile(), JSON.stringify(next));
  } catch {
    /* 履歴が書けなくても、PDFは開ける */
  }
  return next;
}

function readPdfFile(p) {
  if (!/\.pdf$/i.test(p)) throw new Error('PDFファイルではありません');
  const buf = fs.readFileSync(p);
  addRecent(p);
  return { name: path.basename(p), path: p, bytes: new Uint8Array(buf) };
}

function registerIpc() {
  ipcMain.handle('pdf:pick', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const last = loadRecent()[0];
    const r = await dialog.showOpenDialog(win, {
      title: 'PDFを開く',
      defaultPath: last ? path.dirname(last.path) : app.getPath('documents'),
      properties: ['openFile'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (r.canceled || r.filePaths.length === 0) return null;
    return readPdfFile(r.filePaths[0]);
  });

  ipcMain.handle('pdf:recent', () => loadRecent().filter((r) => fs.existsSync(r.path)));

  ipcMain.handle('pdf:read', (_e, p) => {
    // 履歴にあるファイルだけ読む(画面側から任意のパスは読ませない)
    if (typeof p !== 'string' || !loadRecent().some((r) => r.path === p)) throw new Error('履歴にないファイルです');
    return readPdfFile(p);
  });

  // いま表示している印刷プレビューを、A4のPDFとして保存する(印刷用CSSがそのまま効く)
  ipcMain.handle('print:saveAsPdf', async (e, defaultName) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const safe = String(defaultName || '解説').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
    const r = await dialog.showSaveDialog(win, {
      title: 'PDFとして保存',
      defaultPath: path.join(app.getPath('documents'), safe + '.pdf'),
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (r.canceled || !r.filePath) return { saved: false };
    const data = await e.sender.printToPDF({ preferCSSPageSize: true, printBackground: true });
    fs.writeFileSync(r.filePath, data);
    return { saved: true, path: r.filePath };
  });
}

function isInternal(url) {
  return url.startsWith(ORIGIN + '/');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    backgroundColor: '#0f172a',
    title: '入試解説ワークベンチ',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  // PDFの別ウィンドウ(window.open)はアプリ内で開く。外部サイトは既定のブラウザへ
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternal(url)) return { action: 'allow' };
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!isInternal(url)) {
      e.preventDefault();
      if (/^https:\/\//.test(url)) shell.openExternal(url);
    }
  });
  win.loadURL(ORIGIN + '/');
  return win;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    registerAppProtocol();
    registerIpc();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) {
      if (w.isMinimized()) w.restore();
      w.focus();
    }
  });
}
