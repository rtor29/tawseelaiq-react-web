// الموجّه الرئيسي — بديل main.dart (جلسة تلقائية + توجيه حسب الدور)
// كما يدعم login_token في الرابط (جوجل/تليجرام) قبل تقرير الشاشة الابتدائية

import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useSession } from './lib/auth';
import { consumeLoginTokenFromUrl } from './lib/googleAuth';
import { realtime } from './lib/realtime';
import LoginPage from './pages/LoginPage';
import CustomerHomePage from './pages/CustomerHomePage';
import LiveTrackingPage from './pages/LiveTrackingPage';
import DriverHomePage from './pages/DriverHomePage';
import CreateRoutePage from './pages/CreateRoutePage';
import DriverRequestsPage from './pages/DriverRequestsPage';
import DocumentUploadPage from './pages/DocumentUploadPage';
import VacancyAdsPage from './pages/VacancyAdsPage';
import CreateVacancyAdPage from './pages/CreateVacancyAdPage';
import SupportPage from './pages/SupportPage';
import DailyRoutePage from './pages/DailyRoutePage';
import type { ReactNode } from 'react';

function RequireAuth({ children, role }: { children: ReactNode; role?: 'Driver' }) {
  const session = useSession();
  if (!session) return <Navigate to="/login" replace />;
  if (role && session.role !== role) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  const session = useSession();
  const [ready, setReady] = useState(false);

  // معالجة login_token من رابط العودة (OAuth/تليجرام) عند أول تحميل — بديل main.dart
  useEffect(() => {
    consumeLoginTokenFromUrl();
    setReady(true);
  }, []);

  // الاتصال اللحظي يتبع الجلسة عند تغيير المسار (اتصال واحد لكل التطبيق)
  useEffect(() => {
    if (ready && session?.role === 'Admin') {
      window.location.replace('/dashboard/');
      return;
    }
    if (ready && session) void realtime.connect(session.token);
    return () => { void realtime.disconnect(); };
  }, [ready, session]);

  if (!ready) return null;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<Navigate to="/login" replace />} />
      <Route path="/otp" element={<Navigate to="/login" replace />} />
      <Route path="/daily" element={<RequireAuth><DailyRoutePage /></RequireAuth>} />

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
  );
}
