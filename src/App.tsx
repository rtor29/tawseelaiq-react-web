// الموجّه الرئيسي — بديل main.dart (جلسة تلقائية متزامنة + توجيه دقيق حسب الدور مع الحفاظ على المسار)
// تم تطبيق التحميل الكسول (Lazy Loading) لجميع الصفحات لتقليص الحجم وتحقيق أقصى سرعة استجابة

import { Suspense, lazy, useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession, authStore } from './lib/auth';
import { storage } from './lib/storage';
import { consumeLoginTokenFromUrl } from './lib/googleAuth';
import { fetchAndApplyTheme } from './lib/theme';
import { initAudioUnlock } from './lib/sound';
import { Spinner } from './components/ui';

// Standard import for instant initial render of login screen
import LoginPage from './pages/LoginPage';

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

// حارس المسارات المحمي: قراءة متزامنة فورية للجلسة لمنع التحويل القسري للداش بورد عند الـ Refresh
interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: ('driver' | 'customer' | 'admin')[];
}

function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const token = storage.getToken() || localStorage.getItem('token') || localStorage.getItem('auth_token');
  const rawRole = (storage.getUserRole() || localStorage.getItem('role') || localStorage.getItem('user_role') || 'customer').toLowerCase();
  const currentRole = rawRole === 'driver' ? 'driver' : rawRole === 'admin' ? 'admin' : 'customer';

  // إذا لم يكن المستخدم مسجلاً، يتم تحويله لشاشة تسجيل الدخول مع حفظ الرابط الحالي
  if (!token) {
    const fullPath = typeof window !== 'undefined' ? (window.location.pathname + window.location.search) : '';
    const redirectParam = fullPath && fullPath !== '/' ? `?redirect=${encodeURIComponent(fullPath)}` : '';
    return <Navigate to={`/login${redirectParam}`} replace />;
  }

  // إذا كانت الصلاحيات محددة والمستخدم لا يملك الصلاحية المناسبة، يتم توجيهه لمساره الصحيح
  if (allowedRoles && !allowedRoles.includes(currentRole)) {
    if (currentRole === 'driver') {
      return <Navigate to="/drive" replace />;
    }
    if (currentRole === 'admin') {
      return <Navigate to="/dashboard" replace />;
    }
    return <Navigate to="/hub" replace />;
  }

  // المستخدم مصادق عليه ومساره مسموح -> يبقى في صفحته الحالية بدون أي تحويل
  return <>{children}</>;
}

export default function App() {
  const session = useSession();
  const [ready, setReady] = useState(false);

  // القراءة المتزامنة لبيانات الجلسة (Synchronous Session Hydration)
  const [token, setToken] = useState(() => storage.getToken() || localStorage.getItem('token') || localStorage.getItem('auth_token') || null);
  const [role, setRole] = useState(() => {
    const r = storage.getUserRole() || localStorage.getItem('role') || localStorage.getItem('user_role') || null;
    return r ? r.toLowerCase() : null;
  });

  // مزامنة فورية لتغيرات الجلسة (تسجيل دخول / خروج)
  useEffect(() => {
    const unsubscribe = authStore.subscribe(() => {
      const currentToken = storage.getToken() || localStorage.getItem('token') || localStorage.getItem('auth_token') || null;
      const currentRawRole = storage.getUserRole() || localStorage.getItem('role') || localStorage.getItem('user_role') || null;
      setToken(currentToken);
      setRole(currentRawRole ? currentRawRole.toLowerCase() : null);
    });
    return unsubscribe;
  }, []);

  // جلب وتطبيق المظهر المعتمد من لوحة التحكم والخادم مع المزامنة اللحظية
  useEffect(() => {
    void fetchAndApplyTheme();

    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'tawseela_admin_theme_config' || e.key === 'tawseela_web_theme') {
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

  // معالجة login_token من رابط العودة وفك قفل الصوت عند أول تحميل
  useEffect(() => {
    initAudioUnlock();
    consumeLoginTokenFromUrl();
    setReady(true);
  }, []);

  // الاتصال اللحظي يتبع الجلسة عند وجود جلسة نشطة (باستثناء لوحة الإدارة لتفادي التحويل القسري)
  useEffect(() => {
    if (ready && session && session.role !== 'Admin') {
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
    <div className="w-full min-h-screen bg-slate-100 flex justify-center" dir="rtl">
      <Suspense fallback={<PageLoader />}>
        <main 
          className="mx-auto w-full max-w-md min-h-screen relative bg-white md:shadow-2xl md:border-x md:border-slate-200 text-right font-cairo" 
          dir="rtl"
        >
          <Routes>
            {/* مسارات المصادقة العامة */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<Navigate to="/login" replace />} />
            <Route path="/otp" element={<Navigate to="/login" replace />} />

            {/* مسارات الراكب الأساسية — حماية المسار والبقاء في نفس الصفحة عند الـ Refresh */}
            <Route
              path="/hub"
              element={
                <ProtectedRoute allowedRoles={['customer']}>
                  <CustomerHub />
                </ProtectedRoute>
              }
            />
            <Route
              path="/taxi"
              element={
                <ProtectedRoute allowedRoles={['customer']}>
                  <CustomerHomePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/daily"
              element={
                <ProtectedRoute allowedRoles={['customer', 'driver']}>
                  <DailyRoutePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/track/:bookingId"
              element={
                <ProtectedRoute allowedRoles={['customer', 'driver']}>
                  <LiveTrackingPage />
                </ProtectedRoute>
              }
            />

            {/* مسارات السائق — دعم كامل للمسارين /drive و /driver مع البقاء عند الـ Refresh */}
            <Route
              path="/drive"
              element={
                <ProtectedRoute allowedRoles={['driver']}>
                  <DriverHomePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/driver"
              element={
                <ProtectedRoute allowedRoles={['driver']}>
                  <DriverHomePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/driver/routes/new"
              element={
                <ProtectedRoute allowedRoles={['driver']}>
                  <CreateRoutePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/driver/requests"
              element={
                <ProtectedRoute allowedRoles={['driver']}>
                  <DriverRequestsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/driver/documents"
              element={
                <ProtectedRoute allowedRoles={['driver']}>
                  <DocumentUploadPage />
                </ProtectedRoute>
              }
            />

            {/* مسارات الإعلانات والدعم */}
            <Route
              path="/ads"
              element={
                <ProtectedRoute allowedRoles={['customer', 'driver']}>
                  <VacancyAdsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ads/new"
              element={
                <ProtectedRoute allowedRoles={['driver']}>
                  <CreateVacancyAdPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/support"
              element={
                <ProtectedRoute allowedRoles={['customer', 'driver']}>
                  <SupportPage />
                </ProtectedRoute>
              }
            />

            {/* المسار الجذري / يتم توجيهه حسب الرول الحقيقي للمستخدم */}
            <Route
              path="/"
              element={
                !token ? (
                  <Navigate to="/login" replace />
                ) : role === 'driver' ? (
                  <Navigate to="/drive" replace />
                ) : role === 'admin' ? (
                  <Navigate to="/dashboard" replace />
                ) : (
                  <Navigate to="/hub" replace />
                )
              }
            />

            {/* أي مسار غير معروف يُعاد توجيهه حسب الرول وليس للداش بورد أبداً */}
            <Route
              path="*"
              element={
                !token ? (
                  <Navigate to="/login" replace />
                ) : role === 'driver' ? (
                  <Navigate to="/drive" replace />
                ) : role === 'admin' ? (
                  <Navigate to="/dashboard" replace />
                ) : (
                  <Navigate to="/hub" replace />
                )
              }
            />
          </Routes>
        </main>
      </Suspense>
    </div>
  );
}
