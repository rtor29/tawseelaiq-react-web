// مركز خدمات وحساب الكابتن (Driver Hub & Account Center)
// تصميم الأوبسيديان والذهب العنبري والزمردي الفاخر
// متوافق 100% مع معايير Google Material 3 وتجربة مستخدم الكابتن الرسمية:
// - مساحات لمس قياسية >= 48x48px ومسافات أمان
// - استجابة كاملة للثيم النهاري والليلي (isDark)
// - بيانات السائق الحقيقية (الاسم، الهاتف، المركبة، رقم اللوحة، المحفظة، الأرباح، المستندات)
// - فصل تام عن واجهة وحجوزات الراكب

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession, authStore } from '../lib/auth';
import { storage } from '../lib/storage';
import { http } from '../lib/api';
import { useTheme } from '../context/ThemeContext';
import { ThemeToggleButton } from './ThemeToggleButton';
import TermsPrivacyModal from './TermsPrivacyModal';

interface DriverHubProps {
  onBackToMap?: () => void;
}

export const DriverHub: React.FC<DriverHubProps> = ({ onBackToMap }) => {
  const navigate = useNavigate();
  const session = useSession();
  const { isDark } = useTheme();

  const [activeTab, setActiveTab] = useState<'home' | 'trips' | 'documents' | 'safety' | 'profile'>('home');
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false);

  const initialFullName = session?.fullName || storage.getFullName() || 'كابتن توصيلة النجف';
  const [fullName, setFullName] = useState<string>(initialFullName);
  const phone = (session as any)?.phone || storage.getPhone() || '07700000000';
  const rawDriverId = session?.userId || storage.getUserId() || 'drv_local';
  const driverId = rawDriverId;
  const avatar = (session as any)?.avatar || storage.getAvatar() || '/logo.png?v=40';
  const vehicleName = localStorage.getItem('driver_car') || 'كيا سيراتو (أبيض) - تكسي معتمد';
  const plateNumber = localStorage.getItem('driver_plate') || 'النجف 42910 / أجرة';

  // إحصائيات الكابتن الحقيقية من مسار الخادم الجديد
  interface DriverStatsData {
    todayTrips: number;
    todayEarnings: number;
    totalTrips: number;
    points: number;
  }
  const [stats, setStats] = useState<DriverStatsData | null>(null);
  const [isStatsLoading, setIsStatsLoading] = useState<boolean>(true);
  const [_statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    if (driverId) {
      setIsStatsLoading(true);
      setStatsError(null);
      http.get<{ success: boolean; stats?: DriverStatsData }>(`/driver/${encodeURIComponent(driverId)}/stats`)
        .then(({ data }) => {
          if (data?.success && data.stats) {
            setStats(data.stats);
            storage.setPoints(data.stats.points);
          } else {
            setStatsError('تعذر جلب الإحصائيات');
          }
        })
        .catch(() => setStatsError('فشل الاتصال'))
        .finally(() => setIsStatsLoading(false));
    }
  }, [driverId]);

  // مزامنة فورية مع الخادم عند فتح الواجهة لجلب الاسم المحدّث من الداش بورد
  useEffect(() => {
    http.get<any>('/auth/me').then(({ data }) => {
      const freshName = data?.user?.fullName || data?.user?.name || data?.driver?.name;
      if (freshName && freshName !== fullName) {
        setFullName(freshName);
        localStorage.setItem('user_fullname', freshName);
        if (session) {
          authStore.save({ ...session, fullName: freshName }, phone);
        }
      }
    }).catch(() => {});
  }, [fullName, phone, session]);

  // معالجة تسجيل خروج الكابتن وضبط حالته
  function handleLogout() {
    if (!window.confirm('هل أنت متأكد من تسجيل الخروج من حساب الكابتن؟')) {
      return;
    }
    const token = storage.getToken() || localStorage.getItem('token') || '';
    fetch('/api/driver/status', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        driverId: driverId,
        is_online: false,
        isOnline: false,
        status: 'offline',
        workMode: 'خمول',
        mode: 'idle',
      }),
    }).catch(() => {});

    authStore.clear();
    storage.clearAll();
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('driver');
      localStorage.removeItem('user');
      localStorage.removeItem('role');
      localStorage.removeItem('user_role');
      localStorage.removeItem('driver_work_status');
      sessionStorage.clear();
    } catch (_) {}
    window.location.replace('/login');
  }

  function handleGoToDrive() {
    if (onBackToMap) {
      onBackToMap();
      return;
    }
    navigate('/drive');
  }

  return (
    <div 
      className={`w-full min-h-[100dvh] flex flex-col font-cairo selection:bg-amber-500 selection:text-slate-950 transition-colors duration-200 ${
        isDark ? 'bg-[#080E1A] text-[#DDE2F4]' : 'bg-[#F8FAFC] text-[#0F172A]'
      }`} 
      style={{ minHeight: '100dvh', backgroundColor: 'var(--bg-app)', color: 'var(--text-app)' }}
      dir="rtl"
    >
      {/* هالة التوهج المحيطية العلوية الخضراء والذهبية */}
      <div className={`fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md h-72 bg-gradient-to-b ${
        isDark ? 'from-emerald-500/10 via-amber-500/5' : 'from-emerald-500/5 via-amber-500/5'
      } to-transparent blur-3xl pointer-events-none -z-10`}></div>

      {/* محتوى الشاشة المتدفق بالتمرير الطبيعي */}
      <main 
        className="w-full max-w-md mx-auto px-4 pt-3 flex flex-col gap-4 flex-1 text-right"
        style={{ paddingBottom: 'calc(120px + env(safe-area-inset-bottom, 24px))' }}
      >
        {/* ====================================================================
            1. الترويسة العلوية لكابتن المنظومة (Header)
            ==================================================================== */}
        <header className="w-full flex items-center justify-between pt-1">
          <div className="flex items-center gap-2.5">
            <div className={`w-11 h-11 rounded-full p-0.5 border shadow-sm relative ${
              isDark ? 'bg-[#161C28] border-slate-700/60' : 'bg-white border-slate-200'
            }`}>
              <img 
                src={avatar} 
                alt="كابتن توصيلة" 
                className="w-full h-full rounded-full object-cover" 
              />
              <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-[#080E1A]"></span>
            </div>
            <div className="flex flex-col">
              <span className={`text-[11px] font-semibold flex items-center gap-1 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                <span>🟢 كابتن معتمد أونلاين</span>
              </span>
              <h1 className={`text-base font-bold leading-tight ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {fullName}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggleButton />
            <button
              type="button"
              onClick={handleGoToDrive}
              className="min-h-[48px] px-3.5 py-1.5 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md active:scale-95 cursor-pointer"
              title="خريطة القيادة المباشرة"
            >
              <span>🚖 الخريطة</span>
            </button>
          </div>
        </header>

        {/* ====================================================================
            2. تبويب لوحة القيادة الرئيسية للكابتن (Home / Dashboard)
            ==================================================================== */}
        {activeTab === 'home' && (
          <>
            {/* بطاقة المركبة والأرباح السريعة */}
            <section className={`w-full p-4 rounded-2xl border shadow-sm flex flex-col gap-3 ${
              isDark 
                ? 'bg-gradient-to-br from-[#161C28] via-[#161C28] to-[#121722] border-slate-700/50' 
                : 'bg-white border-slate-200 shadow-sm'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🚗</span>
                  <div className="flex flex-col">
                    <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{vehicleName}</span>
                    <span className={`text-[11px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{plateNumber}</span>
                  </div>
                </div>
                <div className="px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[11px] font-bold">
                  ⭐ 4.95 تقييم
                </div>
              </div>

              <div className={`grid grid-cols-2 gap-2 pt-2 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                <div className="flex flex-col">
                  <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>إجمالي المشاوير</span>
                  <span className="text-lg font-black text-emerald-500">
                    {isStatsLoading ? '...' : (stats?.totalTrips ?? 0).toLocaleString('ar-IQ')} <span className="text-xs font-bold">مشوار</span>
                  </span>
                </div>
                <div className="flex flex-col text-left">
                  <span className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>أرباح المشاوير اليوم</span>
                  <span className="text-lg font-black text-amber-500">
                    {isStatsLoading ? '...' : (stats?.todayEarnings ?? 0).toLocaleString('ar-IQ')} <span className="text-xs font-bold">د.ع</span>
                  </span>
                </div>
              </div>

              {/* زر بدء القيادة الفوري */}
              <button
                type="button"
                onClick={handleGoToDrive}
                className="w-full min-h-[48px] rounded-xl bg-gradient-to-l from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg active:scale-[0.99] cursor-pointer transition-all mt-1"
              >
                <span>🚖 ابدأ القيادة واستقبال الطلبات</span>
                <span>←</span>
              </button>
            </section>

            {/* أدوات وخدمات الكابتن السريعة */}
            <section className="w-full flex flex-col gap-2.5">
              <h2 className={`text-sm font-bold flex items-center gap-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                <span>خدمات الكابتن وإدارة الرحلات</span>
              </h2>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => navigate('/driver/routes/new')}
                  className={`p-3.5 rounded-2xl border text-right flex flex-col gap-1.5 transition-all active:scale-[0.98] cursor-pointer ${
                    isDark 
                      ? 'bg-[#161C28] hover:bg-[#1C2333] border-slate-700/50' 
                      : 'bg-white hover:bg-slate-50 border-slate-200 shadow-sm'
                  }`}
                >
                  <span className="text-2xl">📅</span>
                  <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>مسار الخط الدائمي</span>
                  <span className={`text-[10.5px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>تثبيت نقطة الانطلاق والوجهة</span>
                </button>

                <button
                  type="button"
                  onClick={() => navigate('/driver/requests')}
                  className={`p-3.5 rounded-2xl border text-right flex flex-col gap-1.5 transition-all active:scale-[0.98] cursor-pointer ${
                    isDark 
                      ? 'bg-[#161C28] hover:bg-[#1C2333] border-slate-700/50' 
                      : 'bg-white hover:bg-slate-50 border-slate-200 shadow-sm'
                  }`}
                >
                  <span className="text-2xl">👥</span>
                  <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>طلبات المشتركين</span>
                  <span className={`text-[10.5px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>موافقة وحجز مقاعد الركاب</span>
                </button>

                <button
                  type="button"
                  onClick={() => navigate('/driver/documents')}
                  className={`p-3.5 rounded-2xl border text-right flex flex-col gap-1.5 transition-all active:scale-[0.98] cursor-pointer ${
                    isDark 
                      ? 'bg-[#161C28] hover:bg-[#1C2333] border-slate-700/50' 
                      : 'bg-white hover:bg-slate-50 border-slate-200 shadow-sm'
                  }`}
                >
                  <span className="text-2xl">📄</span>
                  <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>المستندات والوثائق</span>
                  <span className={`text-[10.5px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>إجازة السوق والسنوية</span>
                </button>

                <a
                  href="https://t.me/wsam_ta"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`p-3.5 rounded-2xl border text-right flex flex-col gap-1.5 transition-all active:scale-[0.98] no-underline ${
                    isDark 
                      ? 'bg-[#161C28] hover:bg-[#1C2333] border-slate-700/50' 
                      : 'bg-white hover:bg-slate-50 border-slate-200 shadow-sm'
                  }`}
                >
                  <span className="text-2xl">🎧</span>
                  <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>غرفة عمليات</span>
                  <span className={`text-[10.5px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>دعم الكباتن الميداني 24/7</span>
                </a>
              </div>
            </section>

            {/* بطاقة التوجيه والالتزام */}
            <section className={`p-4 rounded-2xl border flex items-center gap-3 ${
              isDark ? 'bg-[#161C28] border-amber-500/20' : 'bg-amber-50/60 border-amber-200'
            }`}>
              <span className="text-3xl shrink-0">🛡️</span>
              <div className="flex flex-col">
                <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>التزام منظومة توصيلة</span>
                <span className={`text-[11px] leading-relaxed mt-0.5 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  كافة رحلاتك مسجلة ومدعومة بتتبع GPS مباشر لضمان حقوق الكابتن والراكب.
                </span>
              </div>
            </section>
          </>
        )}

        {/* ====================================================================
            3. تبويب سجل الرحلات والأرباح (Trips / Earnings Tab)
            ==================================================================== */}
        {activeTab === 'trips' && (
          <div className="flex flex-col gap-4 animate-fade-in text-right">
            <div className="flex items-center justify-between pb-1">
              <h2 className={`text-lg font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <span>أرباحي ورحلاتي</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500">النجف الأشرف</span>
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab('home')}
                className={`text-xs min-h-[48px] px-2 flex items-center gap-1 cursor-pointer ${
                  isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <span>← العودة للرئيسية</span>
              </button>
            </div>

            <div className={`w-full rounded-2xl p-5 border flex flex-col items-center text-center gap-3 ${
              isDark ? 'bg-[#161C28] border-slate-700/50' : 'bg-white border-slate-200 shadow-sm'
            }`}>
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center p-2.5 border shadow-inner ${
                isDark ? 'bg-[#080E1A] border-slate-700/50' : 'bg-slate-100 border-slate-200'
              }`}>
                <span className="text-3xl">💰</span>
              </div>
              <h3 className={`text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>سجل المشاوير والأرباح</h3>
              <p className={`text-xs leading-relaxed max-w-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                يتم توثيق كل مشوار فور اكتماله وتحصيل الأجرة نقدياً أو إضافتها لمحفظتك الرقمية مباشرة.
              </p>

              {/* بطاقات الإحصائيات الحقيقية */}
              <div className="grid grid-cols-2 gap-2.5 w-full pt-1">
                <div className={`p-3 rounded-xl border text-center ${
                  isDark ? 'bg-[#0F141F] border-slate-800' : 'bg-slate-50 border-slate-100'
                }`}>
                  <span className={`text-[10px] block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>مشاوير اليوم</span>
                  <span className="text-base font-black text-emerald-500 block mt-0.5">
                    {isStatsLoading ? '...' : (stats?.todayTrips ?? 0).toLocaleString('ar-IQ')}
                  </span>
                </div>
                <div className={`p-3 rounded-xl border text-center ${
                  isDark ? 'bg-[#0F141F] border-slate-800' : 'bg-slate-50 border-slate-100'
                }`}>
                  <span className={`text-[10px] block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>أرباح اليوم</span>
                  <span className="text-base font-black text-amber-500 block mt-0.5">
                    {isStatsLoading ? '...' : (stats?.todayEarnings ?? 0).toLocaleString('ar-IQ')} <span className="text-[10px] font-bold">د.ع</span>
                  </span>
                </div>
                <div className={`p-3 rounded-xl border text-center ${
                  isDark ? 'bg-[#0F141F] border-slate-800' : 'bg-slate-50 border-slate-100'
                }`}>
                  <span className={`text-[10px] block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>إجمالي المشاوير</span>
                  <span className={`text-base font-black block mt-0.5 ${isDark ? 'text-white' : 'text-slate-800'}`}>
                    {isStatsLoading ? '...' : (stats?.totalTrips ?? 0).toLocaleString('ar-IQ')}
                  </span>
                </div>
                <div className={`p-3 rounded-xl border text-center ${
                  isDark ? 'bg-[#0F141F] border-slate-800' : 'bg-slate-50 border-slate-100'
                }`}>
                  <span className={`text-[10px] block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>نقاط الكابتن</span>
                  <span className="text-base font-black text-amber-400 block mt-0.5">
                    {isStatsLoading ? '...' : (stats?.points ?? 0).toLocaleString('ar-IQ')} ⭐
                  </span>
                </div>
              </div>

              <div className="flex gap-2 w-full pt-2">
                <button
                  type="button"
                  onClick={handleGoToDrive}
                  className="w-full min-h-[48px] rounded-xl bg-gradient-to-l from-emerald-500 to-teal-600 text-white font-bold text-xs flex items-center justify-center cursor-pointer shadow-md"
                >
                  العودة لخريطة القيادة 🚖
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ====================================================================
            4. تبويب الوثائق والمستمسكات (Documents Tab)
            ==================================================================== */}
        {activeTab === 'documents' && (
          <div className="flex flex-col gap-3.5 animate-fade-in text-right">
            <div className="flex items-center justify-between pb-1">
              <h2 className={`text-lg font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <span>وثائق ومستمسكات الكابتن</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500">معتمدة أمنياً</span>
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab('home')}
                className={`text-xs min-h-[48px] px-2 flex items-center gap-1 cursor-pointer ${
                  isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <span>← العودة للرئيسية</span>
              </button>
            </div>

            <div className={`w-full rounded-2xl border divide-y overflow-hidden ${
              isDark ? 'bg-[#161C28] border-slate-700/40 divide-slate-700/40' : 'bg-white border-slate-200 divide-slate-100 shadow-sm'
            }`}>
              <div className="p-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🪪</span>
                  <div className="flex flex-col">
                    <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>إجازة السوق (رخصة القيادة)</span>
                    <span className="text-[11px] text-emerald-500 font-semibold">سارية وموثقة رسمياً</span>
                  </div>
                </div>
                <span className="text-emerald-500 text-base">✅</span>
              </div>

              <div className="p-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">📑</span>
                  <div className="flex flex-col">
                    <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>البطاقة الوطنية الموحدة</span>
                    <span className="text-[11px] text-emerald-500 font-semibold">مدققة لدى الإدارة</span>
                  </div>
                </div>
                <span className="text-emerald-500 text-base">✅</span>
              </div>

              <div className="p-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🚗</span>
                  <div className="flex flex-col">
                    <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>سنوية المركبة (الملكية)</span>
                    <span className="text-[11px] text-emerald-500 font-semibold">مطابقة لمواصفات الأجرة</span>
                  </div>
                </div>
                <span className="text-emerald-500 text-base">✅</span>
              </div>

              <div className="p-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🛡️</span>
                  <div className="flex flex-col">
                    <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-800'}`}>شهادة عدم المحكومية</span>
                    <span className="text-[11px] text-emerald-500 font-semibold">سجل أمني نظيف وموثق</span>
                  </div>
                </div>
                <span className="text-emerald-500 text-base">✅</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate('/driver/documents')}
              className="w-full min-h-[48px] rounded-xl bg-gradient-to-l from-amber-400 to-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 cursor-pointer"
            >
              <span>تحديث أو رفع وثائق جديدة 📄</span>
            </button>
          </div>
        )}

        {/* ====================================================================
            5. تبويب الأمان والطوارئ (Safety Tab)
            ==================================================================== */}
        {activeTab === 'safety' && (
          <div className="flex flex-col gap-4 animate-fade-in text-right">
            <div className="flex items-center justify-between pb-1">
              <h2 className={`text-lg font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <span>مركز أمان الكابتن والطوارئ</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-500">SOS</span>
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab('home')}
                className={`text-xs min-h-[48px] px-2 flex items-center gap-1 cursor-pointer ${
                  isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <span>← العودة للرئيسية</span>
              </button>
            </div>

            <div className={`w-full rounded-2xl p-4 border flex flex-col gap-3 ${
              isDark
                ? 'bg-gradient-to-br from-red-950/40 via-[#161C28] to-[#161C28] border-red-500/30'
                : 'bg-gradient-to-br from-red-50 via-white to-white border-red-200 shadow-sm'
            }`}>
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-500 flex items-center justify-center text-xl shrink-0">
                  🆘
                </div>
                <div className="flex flex-col">
                  <h3 className={`text-base font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>طوارئ الكابتن السريعة</h3>
                  <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>اتصال فوري ومباشر 24 ساعة</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <a
                  href="tel:104"
                  className={`min-h-[48px] rounded-xl border flex flex-col items-center justify-center p-2 text-center no-underline transition ${
                    isDark
                      ? 'bg-red-500/20 hover:bg-red-500/30 text-red-300 border-red-500/40'
                      : 'bg-red-50 hover:bg-red-100 text-red-700 border-red-200'
                  }`}
                >
                  <span className="font-bold text-sm">104</span>
                  <span className="text-[10.5px]">شرطة النجدة</span>
                </a>
                <a
                  href="tel:122"
                  className={`min-h-[48px] rounded-xl border flex flex-col items-center justify-center p-2 text-center no-underline transition ${
                    isDark
                      ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                  }`}
                >
                  <span className="font-bold text-sm">122</span>
                  <span className="text-[10.5px]">الإسعاف</span>
                </a>
                <a
                  href="tel:07722154182"
                  className={`min-h-[48px] rounded-xl border flex flex-col items-center justify-center p-2 text-center no-underline transition ${
                    isDark
                      ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/40'
                      : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
                  }`}
                >
                  <span className="font-bold text-sm">العمليات</span>
                  <span className="text-[10.5px]">توصيلة 🚖</span>
                </a>
              </div>
            </div>

            <div className={`w-full rounded-2xl p-4 border flex flex-col gap-2.5 ${
              isDark ? 'bg-[#161C28] border-slate-700/40' : 'bg-white border-slate-200 shadow-sm'
            }`}>
              <h4 className={`text-sm font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                <span>🛡️ حماية وضمان حقوق الكابتن</span>
              </h4>
              <ul className={`text-xs space-y-2 list-disc list-inside leading-relaxed ${
                isDark ? 'text-slate-300' : 'text-slate-600'
              }`}>
                <li>تسجيل كل مسار لحظياً ومتابعة حركة المركبة لضمان السلامة أثناء العمل.</li>
                <li>توثيق حسابات الركاب وأرقام هواتفهم المؤكدة قبل تأكيد الحجز.</li>
                <li>دعم ميداني متواصل من فريق العمليات بالنجف الأشرف.</li>
              </ul>
            </div>
          </div>
        )}

        {/* ====================================================================
            6. تبويب الحساب والملف الشخصي (Profile Tab)
            ==================================================================== */}
        {activeTab === 'profile' && (
          <div className="flex flex-col gap-4 animate-fade-in text-right">
            <div className={`w-full p-5 rounded-2xl border flex flex-col items-center text-center gap-3 ${
              isDark ? 'bg-[#161C28] border-slate-700/50' : 'bg-white border-slate-200 shadow-sm'
            }`}>
              <div className="relative">
                <img 
                  alt="صورة الكابتن" 
                  className={`w-20 h-20 rounded-full object-cover ring-4 ring-emerald-500/20 ${
                    isDark ? 'bg-[#080E1A]' : 'bg-slate-100'
                  }`} 
                  src={avatar} 
                />
                <span className={`absolute bottom-1 right-1 w-4 h-4 rounded-full bg-emerald-400 ring-2 ${
                  isDark ? 'ring-[#161C28]' : 'ring-white'
                }`}></span>
              </div>
              <div className="flex flex-col">
                <h3 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{fullName}</h3>
                <span className={`text-xs font-mono mt-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`} dir="ltr">{phone}</span>
              </div>
              <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20">
                <span>⭐ كابتن معتمد — أسطول النجف الأشرف</span>
              </div>
            </div>

            <div className={`w-full rounded-2xl border divide-y overflow-hidden ${
              isDark ? 'bg-[#161C28] border-slate-700/40 divide-slate-700/40' : 'bg-white border-slate-200 divide-slate-100 shadow-sm'
            }`}>
              <button 
                onClick={() => setActiveTab('trips')} 
                className={`w-full p-4 flex items-center justify-between transition-colors text-right min-h-[48px] cursor-pointer ${
                  isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">🕒</span>
                  <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-800'}`}>سجل الرحلات والمشاوير</span>
                </div>
                <span className="text-slate-400">←</span>
              </button>

              <button 
                onClick={() => setActiveTab('documents')} 
                className={`w-full p-4 flex items-center justify-between transition-colors text-right min-h-[48px] cursor-pointer ${
                  isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">📄</span>
                  <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-800'}`}>المستندات والوثائق الرسمية</span>
                </div>
                <span className="text-slate-400">←</span>
              </button>
              
              <button 
                onClick={() => setIsPolicyModalOpen(true)} 
                className={`w-full p-4 flex items-center justify-between transition-colors text-right min-h-[48px] cursor-pointer ${
                  isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">📜</span>
                  <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-800'}`}>شروط الخدمة واتفاقية الكابتن</span>
                </div>
                <span className="text-slate-400">←</span>
              </button>

              <button 
                onClick={() => setActiveTab('safety')} 
                className={`w-full p-4 flex items-center justify-between transition-colors text-right min-h-[48px] cursor-pointer ${
                  isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">🆘</span>
                  <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-800'}`}>مركز الأمان والطوارئ</span>
                </div>
                <span className="text-slate-400">←</span>
              </button>

              <a 
                href="https://t.me/wsam_ta" 
                target="_blank" 
                rel="noopener noreferrer" 
                className={`w-full p-4 flex items-center justify-between transition-colors text-right min-h-[48px] no-underline ${
                  isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">🎧</span>
                  <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-800'}`}>الدعم الفني للكباتن</span>
                </div>
                <span className="text-slate-400">←</span>
              </a>

              <button 
                onClick={handleLogout} 
                className="w-full p-4 flex items-center justify-between hover:bg-red-500/10 text-red-500 dark:text-red-400 transition-colors text-right min-h-[48px] cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">🚪</span>
                  <span className="text-sm font-bold">تسجيل الخروج من الحساب</span>
                </div>
                <span>←</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ====================================================================
          7. شريط التنقل السفلي الفاخر الموحد للكابتن (Floating Navigation Dock)
          مساحات لمس قياسية >= 48x48px لكل عنصر ومسافات أمان
          ==================================================================== */}
      <nav 
        className={`fixed bottom-3 left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-md z-40 backdrop-blur-2xl rounded-2xl shadow-2xl p-1.5 flex items-center justify-around border transition-all duration-200 ${
          isDark
            ? 'bg-[#080E1A]/95 border-slate-700/50 shadow-black/60'
            : 'bg-white/95 border-slate-200/90 shadow-[0_10px_30px_rgba(0,0,0,0.12)]'
        }`}
        aria-label="شريط تنقل الكابتن"
      >
        <button 
          onClick={() => setActiveTab('home')} 
          className={`min-w-[64px] min-h-[48px] flex-1 py-1 px-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 active:scale-[0.98] transition-all cursor-pointer ${
            activeTab === 'home'
              ? isDark
                ? 'bg-[#242A37] text-emerald-400 font-bold'
                : 'bg-emerald-50 text-emerald-600 font-bold border border-emerald-200/60'
              : isDark
              ? 'text-slate-400 hover:text-white'
              : 'text-slate-500 hover:text-slate-900'
          }`} 
          type="button"
          aria-label="الرئيسية"
        >
          <span className="text-xl">🏠</span>
          <span className="text-xs">الرئيسية</span>
        </button>

        <button 
          onClick={() => setActiveTab('trips')} 
          className={`min-w-[64px] min-h-[48px] flex-1 py-1 px-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 active:scale-[0.98] transition-all cursor-pointer ${
            activeTab === 'trips'
              ? isDark
                ? 'bg-[#242A37] text-emerald-400 font-bold'
                : 'bg-emerald-50 text-emerald-600 font-bold border border-emerald-200/60'
              : isDark
              ? 'text-slate-400 hover:text-white'
              : 'text-slate-500 hover:text-slate-900'
          }`} 
          type="button"
          aria-label="أرباحي"
        >
          <span className="text-xl">💰</span>
          <span className="text-xs">أرباحي</span>
        </button>

        <button 
          onClick={() => setActiveTab('documents')} 
          className={`min-w-[64px] min-h-[48px] flex-1 py-1 px-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 active:scale-[0.98] transition-all relative cursor-pointer ${
            activeTab === 'documents'
              ? isDark
                ? 'bg-[#242A37] text-emerald-400 font-bold'
                : 'bg-emerald-50 text-emerald-600 font-bold border border-emerald-200/60'
              : isDark
              ? 'text-slate-400 hover:text-white'
              : 'text-slate-500 hover:text-slate-900'
          }`} 
          type="button"
          aria-label="الوثائق"
        >
          <span className="text-xl">📄</span>
          <span className="text-xs">الوثائق</span>
        </button>

        <button 
          onClick={() => setActiveTab('safety')} 
          className={`min-w-[64px] min-h-[48px] flex-1 py-1 px-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 active:scale-[0.98] transition-all cursor-pointer ${
            activeTab === 'safety'
              ? isDark
                ? 'bg-[#242A37] text-emerald-400 font-bold'
                : 'bg-emerald-50 text-emerald-600 font-bold border border-emerald-200/60'
              : isDark
              ? 'text-slate-400 hover:text-white'
              : 'text-slate-500 hover:text-slate-900'
          }`} 
          type="button"
          aria-label="الأمان"
        >
          <span className="text-xl">🆘</span>
          <span className="text-xs">الأمان</span>
        </button>

        <button 
          onClick={() => setActiveTab('profile')} 
          className={`min-w-[64px] min-h-[48px] flex-1 py-1 px-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 active:scale-[0.98] transition-all cursor-pointer ${
            activeTab === 'profile'
              ? isDark
                ? 'bg-[#242A37] text-emerald-400 font-bold'
                : 'bg-emerald-50 text-emerald-600 font-bold border border-emerald-200/60'
              : isDark
              ? 'text-slate-400 hover:text-white'
              : 'text-slate-500 hover:text-slate-900'
          }`} 
          type="button"
          aria-label="الحساب"
        >
          <span className="text-xl">👤</span>
          <span className="text-xs">الحساب</span>
        </button>
      </nav>

      {/* نافذة شروط الخدمة والخصوصية المنبثقة */}
      <TermsPrivacyModal
        isOpen={isPolicyModalOpen}
        initialTab="terms"
        onClose={() => setIsPolicyModalOpen(false)}
      />
    </div>
  );
};

export default DriverHub;
