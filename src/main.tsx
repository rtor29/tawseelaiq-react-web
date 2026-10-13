import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import './index.css';

import Navbar from '@/components/ui/Navbar';
import Home from '@/pages/Home';
import Login from '@/pages/Login';
import MapPage from '@/pages/MapPage';
import DailyPage from '@/pages/DailyPage';
import DriverPage from '@/pages/DriverPage';
import AdminPage from '@/pages/AdminPage';
import RidePage from '@/pages/RidePage';
import { useAuthStore } from '@/store/authStore';
import { initTelegramWebApp, getTelegramStartParams, isTelegramWebApp } from '@/utils/telegram';

function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  useEffect(() => {
    // Initialize Telegram WebApp if running inside Telegram
    initTelegramWebApp();

    // Handle deep-link params from Telegram bot buttons
    if (isTelegramWebApp() && user) {
      const { tripType } = getTelegramStartParams();
      if (tripType === 'daily') navigate('/daily');
      else if (tripType === 'short') navigate('/map');
    }
  }, [user]);

  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/map"    element={<ProtectedRoute roles={['Customer']}><MapPage /></ProtectedRoute>} />
        <Route path="/daily"  element={<ProtectedRoute roles={['Customer']}><DailyPage /></ProtectedRoute>} />
        <Route path="/driver" element={<ProtectedRoute roles={['Driver']}><DriverPage /></ProtectedRoute>} />
        <Route path="/admin"  element={<ProtectedRoute roles={['Admin']}><AdminPage /></ProtectedRoute>} />
        <Route path="/ride/:id" element={<ProtectedRoute roles={['Customer','Driver']}><RidePage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  </React.StrictMode>
);
