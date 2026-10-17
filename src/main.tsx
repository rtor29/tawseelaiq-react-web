import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Toast';
import { applyTheme, getCachedTheme } from './lib/theme';
import './index.css';

// تطبيق المظهر المخزن فوراً لمنع الوميض قبل رندر React
applyTheme(getCachedTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <App />
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);

// تسجيل عامل الخدمة (Service Worker) في الإنتاج فقط — جاهزية PWA
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
