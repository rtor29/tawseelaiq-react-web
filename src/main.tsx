import './lib/mapTracker';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from './components/Toast';
import { ThemeProvider, getInitialTheme, applyThemeToDom } from './context/ThemeContext';
import { applyTheme, getCachedTheme } from './lib/theme';
import './index.css';

// تطبيق المظهر والوضع المخزن فوراً لمنع الوميض قبل رندر React
applyTheme(getCachedTheme());
applyThemeToDom(getInitialTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);

// تسجيل عامل الخدمة (Service Worker) في الإنتاج مع فرض التحديث الفوري عند توفر نسخة جديدة
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // فحص التحديثات من السيرفر فوراً
        void registration.update();

        // الاستماع لاكتشاف إصدار جديد
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (installingWorker) {
            installingWorker.addEventListener('statechange', () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // إصدار جديد تم تثبيته — إرسال أمر التخطي للعمل فوراً
                installingWorker.postMessage({ type: 'SKIP_WAITING' });
              }
            });
          }
        });
      })
      .catch(() => undefined);

    // إعادة تحميل فورية وسلسة لمرة واحدة عند استلام التحكم بالنسخة الجديدة
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  });
}
