// الموجّه الرئيسي — بديل main.dart (جلسة تلقائية + توجيه حسب الدور)
// تم تطبيق التحميل الكسول (Lazy Loading) لجميع الصفحات والمكونات لتقليص حجم الحزم وتحسين سرعة الفتح

import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './lib/auth';
import { consumeLoginTokenFromUrl } from './lib/googleAuth';
import { fetchAndApplyTheme } from './lib/theme';
import { initAudioUnlock } from './lib/sound';
import { Spinner } from './components/ui';

// Standard import for instant initial render of login screen
import LoginPage from './pages/LoginPage';
import PwaInstallPrompt from './components/PwaInstallPrompt';

// Lazy loading all heavy secondary pages for optimal bundle splitting
const CustomerHomePage = lazy(() => import('./pages/CustomerHomePage'));
const LiveTrackingPage = lazy(() => import('./pages/LiveTrackingPage'));
const DriverHomePage = lazy(() => import('./pages/DriverHomePage'));
const CreateRoutePage = lazy(() => import('./pages/CreateRoutePage'));
const DriverRequestsPage = lazy(() => import('./pages/DriverRequestsPage'));
const DocumentUploadPage = lazy(() => import('./pages/DocumentUploadPage'));
const VacancyAdsPage = lazy(() => import('./pages/VacancyAdsPage'));
const CreateVacancyAdPage = lazy(() => import('./pages/CreateVacancyAdPage'));
const SupportPage = lazy(() => import('./pages/SupportPage'));
const DailyRoutePage = lazy(() => import('./pages/DailyRoutePage'));
const CustomerHub = lazy(() => import('./components/CustomerHub').then((m) => ({ default: m.CustomerHub })));

function PageLoader() {
  return (
    <div className="mx-auto w-full max-w-md min-h-[100dvh] h-[100dvh] flex items-center justify-center bg-gray-50 md:shadow-2xl md:border-x md:border-slate-200">
      <div className="flex flex-col items-center gap-3">
        <Spinner className="h-8 w-8 text-[#1B4965]" />
        <span className="text-xs font-bold text-gray-500">جاري التحميل...</span>
      </div>
    </div>
  );
}

function RequireAuth({ children, role }: { children: ReactNode; role?: 'Driver' }) {
  const session = useSession();
  if (!session) return <Navigate to="/login" replace />;
  if (role && session.role !== role) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const session = useSession();
  const [ready, setReady] = useState(false);

  // جلب وتطبيق المظهر المعتمد من لوحة التحكم والخادم مع المزامنة اللحظية
  useEffect(() => {
    void fetchAndApplyTheme();

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'tawseela_theme' || e.key === 'tawseela_web_theme') {
        void fetchAndApplyTheme();
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void fetchAndApplyTheme();
      }
    };

    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  // معالجة login_token من رابط العودة (OAuth/تليجرام) وفك قفل الصوت عند أول تحميل — بديل main.dart
  useEffect(() => {
    initAudioUnlock();
    consumeLoginTokenFromUrl();
    setReady(true);
  }, []);

  // الاتصال اللحظي يتبع الجلسة عند تغيير المسار (يتم تحميله ديناميكياً فقط عند وجود جلسة نشطة)
  useEffect(() => {
    if (ready && session?.role === 'Admin') {
      window.location.replace('/dashboard/');
      return;
    }
    if (ready && session) {
      let active = true;
      void import('./lib/realtime').then(({ realtime }) => {
        if (active) void realtime.connect(session.token);
      });
      return () => {
        active = false;
        void import('./lib/realtime').then(({ realtime }) => {
          void realtime.disconnect();
        });
      };
    }
  }, [ready, session]);

  if (!ready) return null;

  return (
    <div className="min-h-[100dvh] w-full bg-slate-100 flex justify-center" dir="rtl">
      <Suspense fallback={<PageLoader />}>
        <main className="mx-auto w-full max-w-md min-h-[100dvh] h-[100dvh] relative bg-white md:shadow-2xl md:border-x md:border-slate-200 overflow-y-auto overscroll-y-contain text-right font-cairo" dir="rtl">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<Navigate to="/login" replace />} />
            <Route path="/otp" element={<Navigate to="/login" replace />} />
            <Route path="/daily" element={<RequireAuth><DailyRoutePage /></RequireAuth>} />
            <Route path="/hub" element={<RequireAuth>{session?.role === 'Driver' ? <Navigate to="/driver" replace /> : <CustomerHub />}</RequireAuth>} />

            <Route
              path="/"
              element={
                <RequireAuth>
                  {session?.role === 'Driver' ? <Navigate to="/driver" replace /> : <CustomerHomePage />}
                </RequireAuth>
              }
            />
            <Route
              path="/track/:bookingId"
              element={
                <RequireAuth>
                  <LiveTrackingPage />
                </RequireAuth>
              }
            />
            <Route
              path="/driver"
              element={
                <RequireAuth role="Driver">
                  <DriverHomePage />
                </RequireAuth>
              }
            />
            <Route
              path="/driver/routes/new"
              element={
                <RequireAuth role="Driver">
                  <CreateRoutePage />
                </RequireAuth>
              }
            />
            <Route
              path="/driver/requests"
              element={
                <RequireAuth role="Driver">
                  <DriverRequestsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/driver/documents"
              element={
                <RequireAuth role="Driver">
                  <DocumentUploadPage />
                </RequireAuth>
              }
            />
            <Route
              path="/ads"
              element={
                <RequireAuth>
                  <VacancyAdsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/ads/new"
              element={
                <RequireAuth role="Driver">
                  <CreateVacancyAdPage />
                </RequireAuth>
              }
            />
            <Route
              path="/support"
              element={
                <RequireAuth>
                  <SupportPage />
                </RequireAuth>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <PwaInstallPrompt />
        </main>
      </Suspense>
    </div>
  );
}
