// 画面側(PWA本体)に公開する機能。ファイルの読み書きは、メイン側の決まった入り口だけを通す。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApp', {
  isDesktop: true,
  pickPdf: () => ipcRenderer.invoke('pdf:pick'),
  recentPdfs: () => ipcRenderer.invoke('pdf:recent'),
  readRecentPdf: (p) => ipcRenderer.invoke('pdf:read', p),
  savePrintAsPdf: (name) => ipcRenderer.invoke('print:saveAsPdf', name),
});
