import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import App from './App.tsx';

// PWA Service Worker の自動登録（オフライン対応・自動更新）
registerSW({ immediate: true });

const root = createRoot(document.getElementById('root')!);

if (window.location.hash.startsWith('#explain-pdf/')) {
  // 解説の「PDFを別ウィンドウで開く」で開かれたウィンドウ。単語帳アプリ本体(同期など)は動かさない
  void import('./components/Explain/PdfPopout.tsx').then(({ PdfPopout }) => {
    root.render(
      <StrictMode>
        <PdfPopout />
      </StrictMode>,
    );
  });
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
