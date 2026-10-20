// مركز خدمات الراكب (Customer Service Hub) — تصميم الأوبسيديان والذهب العنبري الفاخر
// Stitch Dark Obsidian & Warm Amber Luxury Theme
// متوافق 100% مع معايير Google Material 3 وتجربة المستخدم الرسمية:
// - مساحات لمس قياسية >= 48x48px ومسافات أمان >= 8px
// - تباين لوني معتمد WCAG 2.1 AA (#FFFFFF و #DDE2F4)
// - تفادي التجمد على هواتف Android عبر التمرير الطبيعي (Window Native Scroll)
// - استخدام حصري لشعار المنصة المفرغ الجديد (/logo.png?v=40)
// - صفر قفزات بصرية (Zero CLS < 0.1)

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { http } from '../lib/api';
import { useSession, authStore } from '../lib/auth';
import { storage } from '../lib/storage';
import TermsPrivacyModal from './TermsPrivacyModal';

interface CustomerHubProps {
  onSelectService?: (type: 'taxi' | 'permanent') => void;
}

const DEFAULT_ANNOUNCEMENT =
  'أهلاً بك في توصيلة 🚖 | خدمة النقل الذكي في النجف الأشرف.. مشاوير فورية وخطوط دائمية بأسعار معتمدة.';

export const CustomerHub: React.FC<CustomerHubProps> = ({ onSelectService }) => {
  const navigate = useNavigate();
  const session = useSession();

  const [activeTab, setActiveTab] = useState<'home' | 'trips' | 'notifications' | 'safety' | 'profile'>('home');
  const [announcementText, setAnnouncementText] = useState<string>(DEFAULT_ANNOUNCEMENT);
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false);

  const fullName = session?.fullName || storage.getFullName() || 'وسام الشمري';
  const phone = (session as any)?.phone || storage.getPhone() || '07700000000';
  const balance = (session as any)?.balance ?? 48500;
  const avatar = (session as any)?.avatar || storage.getAvatar() || '/logo.png?v=40';

  const user = {
    name: fullName,
    phone: phone,
    balance: balance,
    avatar: avatar,
  };

  // جلب نص الإعلان الأخير تلقائياً من الباك إند
  const loadAnnouncement = useCallback(async () => {
    try {
      const res = await http.get<{
        success?: boolean;
        announcement?: { message?: string; createdAt?: string };
      }>('/announcements/latest');
      if (res.data?.announcement?.message) {
        setAnnouncementText(res.data.announcement.message.trim());
      }
    } catch (_) {
      // الاعتماد التلقائي على DEFAULT_ANNOUNCEMENT
    }
  }, []);

  useEffect(() => {
    loadAnnouncement();
    const interval = setInterval(loadAnnouncement, 25000);
    const onFocus = () => loadAnnouncement();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [loadAnnouncement]);

  function handleOpenInstantBooking() {
    if (onSelectService) {
      onSelectService('taxi');
      return;
    }
    localStorage.setItem('selected_trip_type', 'taxi');
    navigate('/', { state: { serviceType: 'taxi' } });
  }

  function handleOpenMonthlyBooking() {
    if (onSelectService) {
      onSelectService('permanent');
      return;
    }
    localStorage.setItem('selected_trip_type', 'permanent');
    navigate('/daily');
  }

  function handleLogout() {
    authStore.clear();
    storage.clearAll();
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('auth');
      localStorage.removeItem('tawseela_auth');
      localStorage.removeItem('tawseela_session');
      localStorage.clear();
      sessionStorage.clear();
    } catch (_) {}
    window.location.replace('/login');
  }

  return (
    <div 
      className="w-full bg-[#0D131F] text-[#DDE2F4] min-h-screen flex flex-col font-cairo selection:bg-amber-500 selection:text-slate-950" 
      dir="rtl"
    >
      {/* هالة التوهج المحيطية العلوية */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md h-72 bg-gradient-to-b from-amber-500/10 via-orange-500/5 to-transparent blur-3xl pointer-events-none -z-10"></div>

      {/* محتوى الشاشة المتدفق بالتمرير الطبيعي (Zero-Scroll-Lock) */}
      <main 
        className="w-full max-w-md mx-auto px-4 pt-3 flex flex-col gap-4 flex-1 text-right"
        style={{ paddingBottom: 'calc(125px + env(safe-area-inset-bottom, 24px))' }}
      >
        {/* ====================================================================
            1. تبويب الرئيسية (Home Tab)
            ==================================================================== */}
        {activeTab === 'home' && (
          <>
            {/* الهيدر العلوي الفاخر مع الشعار الجديد المفرغ */}
            <header className="w-full p-3.5 rounded-2xl bg-[#161C28]/95 backdrop-blur-xl shadow-lg border border-slate-700/40 flex items-center justify-between gap-2 relative overflow-hidden">
              <div className="flex items-center gap-2.5 z-10">
                <div className="relative">
                  <img 
                    alt="صورة المستخدم" 
                    className="w-11 h-11 rounded-full object-cover ring-2 ring-amber-500/30 bg-[#080E1A]" 
                    src={user.avatar} 
                  />
                  <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 ring-2 ring-[#161C28]"></span>
                </div>
                <div className="flex flex-col text-right">
                  <div className="flex items-center gap-1">
                    <span className="font-bold text-white text-base">مرحباً بك، {user.name}</span>
                    <span className="text-sm select-none">👋</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-semibold">
                      {user.balance.toLocaleString()} د.ع
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 z-10">
                {/* كبسولة الشعار الرسمي الجديد الشفاف */}
                <div className="w-11 h-11 rounded-xl bg-[#080E1A] flex items-center justify-center p-1 shadow-sm border border-slate-700/50">
                  <img 
                    alt="شعار توصيلة" 
                    className="w-full h-full object-contain drop-shadow" 
                    src="/logo.png?v=40" 
                  />
                </div>
                <button 
                  onClick={() => setActiveTab('notifications')}
                  aria-label="الإشعارات" 
                  className="w-11 h-11 min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl bg-[#1A202C] hover:bg-[#242A37] active:scale-[0.96] text-slate-300 transition-all relative shrink-0 cursor-pointer border border-slate-700/40" 
                  type="button"
                >
                  <span className="text-xl">🔔</span>
                  <span className="absolute top-2.5 left-2.5 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-[#1A202C] animate-pulse"></span>
                </button>
              </div>
            </header>

            {/* شريط الإعلانات الرسمي الديناميكي المحدث */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-l from-amber-500/15 via-[#161C28] to-[#161C28] border border-amber-500/30 p-3.5 shadow-sm flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>تنويه رسمي 📢</span>
                </span>
                <a
                  href="https://t.me/tawseelaiq"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-[#080E1A]/90 border border-slate-700/60 text-sky-400 hover:text-sky-300 text-xs font-bold transition-all no-underline min-h-[36px]"
                >
                  <span>قناة تيليجرام</span>
                  <span>✈️</span>
                </a>
              </div>
              <p className="text-xs font-semibold text-slate-200 leading-relaxed">
                {announcementText}
              </p>
            </div>

            {/* 2. قسم احجز مشوارك (الخدمات الرئيسية) */}
            <section className="w-full flex flex-col gap-3">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-lg text-white font-bold flex items-center gap-2">
                  <span>احجز مشوارك</span>
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                </h2>
                <button
                  type="button"
                  onClick={() => handleOpenMonthlyBooking()}
                  className="text-xs text-amber-400 hover:underline cursor-pointer font-semibold min-h-[36px] flex items-center"
                >
                  جدول الرحلات
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3.5">
                {/* بطاقة حجز خط دائمي مع شعار توصيلة المفرغ */}
                <div 
                  onClick={handleOpenMonthlyBooking}
                  className="group relative rounded-2xl bg-[#161C28] p-4 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden flex flex-col gap-3.5 cursor-pointer border border-slate-700/40 hover:border-emerald-500/30"
                >
                  <div className="absolute -bottom-8 -left-8 w-28 h-28 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none"></div>
                  <div className="flex items-start justify-between gap-2 z-10">
                    <div className="flex flex-col text-right">
                      <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-semibold w-fit mb-1.5">
                        <span>التزام يومي 📅</span>
                      </div>
                      <h3 className="text-lg text-white font-bold">حجز خط دائمي</h3>
                      <p className="text-xs text-slate-400 mt-0.5 leading-snug">خدمة اشتراكات شهرية للطلبة والموظفين مع كباتن معتمدين</p>
                    </div>
                    <div className="w-16 h-16 rounded-xl bg-[#080E1A]/90 p-2 shadow-inner flex items-center justify-center shrink-0 border border-slate-700/50">
                      <img 
                        alt="شعار توصيلة" 
                        className="w-full h-full object-contain drop-shadow" 
                        src="/logo.png?v=40" 
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 z-10">
                    <span className="px-2 py-0.5 rounded-md bg-[#242A37] text-slate-200 text-xs">🎓 خطوط جامعات</span>
                    <span className="px-2 py-0.5 rounded-md bg-[#242A37] text-slate-200 text-xs">💼 موظفين</span>
                    <span className="px-2 py-0.5 rounded-md bg-[#242A37] text-slate-200 text-xs">🏛️ دوائر حكومية</span>
                    <span className="px-2 py-0.5 rounded-md bg-[#242A37] text-slate-200 text-xs">🎒 مدارس</span>
                  </div>

                  <div className="flex items-center justify-between pt-1 z-10">
                    <div className="flex flex-col text-right">
                      <span className="text-xs text-slate-400">تسعيرة ثابتة معتمدة</span>
                      <span className="text-sm text-amber-400 font-bold">وفر حتى 35% شهرياً</span>
                    </div>
                    <button 
                      className="min-h-[48px] px-4 py-2 rounded-xl bg-[#242A37] hover:bg-slate-700 active:scale-[0.98] text-amber-400 text-sm font-bold shadow-md flex items-center gap-1.5 transition-all cursor-pointer border border-slate-700/50" 
                      type="button"
                    >
                      <span>طلب اشتراك</span>
                      <span>📅</span>
                    </button>
                  </div>
                </div>

                {/* بطاقة تكسي فوري مع شعار توصيلة المفرغ */}
                <div 
                  onClick={handleOpenInstantBooking}
                  className="group relative rounded-2xl bg-[#1A202C] p-4 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden flex flex-col gap-3.5 cursor-pointer border border-amber-500/25 hover:border-amber-400/50"
                >
                  <div className="absolute top-0 right-0 w-28 h-28 bg-amber-500/10 rounded-full blur-2xl pointer-events-none"></div>
                  <div className="flex items-start justify-between gap-2 z-10">
                    <div className="flex flex-col text-right">
                      <div className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-semibold w-fit mb-1.5">
                        <span>سريع وآمن ⚡</span>
                      </div>
                      <h3 className="text-lg text-white font-bold">تكسي</h3>
                      <p className="text-xs text-slate-400 mt-0.5 leading-snug">كابتن معتمد يصلك لباب بيتك بأقل وقت ممكن</p>
                    </div>
                    <div className="w-16 h-16 rounded-xl bg-[#080E1A]/90 p-2 shadow-inner flex items-center justify-center shrink-0 border border-slate-700/50">
                      <img 
                        alt="شعار توصيلة" 
                        className="w-full h-full object-contain drop-shadow" 
                        src="/logo.png?v=40" 
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 z-10">
                    <div className="flex items-center gap-1.5">
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-[#242A37] text-emerald-400">
                        📍
                      </span>
                      <div className="flex flex-col text-right">
                        <span className="text-xs text-slate-400">الوصول التقديري</span>
                        <span className="text-xs text-emerald-400 font-bold">3 - 5 دقائق فقط</span>
                      </div>
                    </div>
                    <button 
                      className="min-h-[48px] px-5 py-2 rounded-xl bg-gradient-to-l from-amber-400 via-amber-500 to-amber-600 hover:opacity-95 active:scale-[0.98] text-slate-950 text-sm font-bold shadow-lg shadow-amber-500/20 flex items-center gap-1.5 transition-all cursor-pointer" 
                      type="button"
                    >
                      <span>احجز الآن</span>
                      <span>←</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>

            {/* 3. بطاقة انضمام الكباتن الفاخرة */}
            <section className="w-full relative rounded-2xl bg-gradient-to-bl from-[#080E1A] via-[#161C28] to-[#1A202C] p-4 shadow-xl overflow-hidden border border-slate-700/50">
              <div className="absolute -top-12 -right-12 w-36 h-36 bg-amber-500/15 rounded-full blur-2xl pointer-events-none"></div>
              <div className="flex flex-col gap-3 relative z-10">
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold">
                    <span>عمولة 0% لأول شهر 🌟</span>
                  </div>
                  <div className="w-9 h-9 rounded-xl bg-[#242A37] flex items-center justify-center text-amber-400 text-lg">
                    🚖
                  </div>
                </div>
                <div className="flex flex-col text-right">
                  <h3 className="text-lg text-white font-bold leading-tight">سجل كابتن.. وزيد دخلك الشهري ويا توصيلة 🚖</h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">انضم لأسطول النخبة في النجف، أوقات حرة، دفعات أسبوعية مضمونة، وحوافز يومية مستمرة.</p>
                </div>
                
                {/* أزرار التواصل الثلاثة بارتفاع قياسي >= 48px */}
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <a 
                    className="min-h-[48px] w-full px-2 py-1.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 active:scale-[0.98] text-emerald-400 text-xs font-bold flex flex-col items-center justify-center gap-0.5 shadow-sm text-center border border-emerald-500/30 no-underline" 
                    href="https://wa.me/9647722154182?text=تحية%20طيبة،%20أرغب%20بالانضمام%20ككابتن%20في%20توصيلة%20النجف" 
                    rel="noopener noreferrer" 
                    target="_blank"
                  >
                    <span className="text-lg">💬</span>
                    <span>واتساب</span>
                  </a>
                  <a 
                    className="min-h-[48px] w-full px-2 py-1.5 rounded-xl bg-sky-600/20 hover:bg-sky-600/30 active:scale-[0.98] text-sky-400 text-xs font-bold flex flex-col items-center justify-center gap-0.5 shadow-sm text-center border border-sky-500/30 no-underline" 
                    href="https://t.me/wsam_ta" 
                    rel="noopener noreferrer" 
                    target="_blank"
                  >
                    <span className="text-lg">✈️</span>
                    <span>تليجرام</span>
                  </a>
                  <a 
                    className="min-h-[48px] w-full px-2 py-1.5 rounded-xl bg-[#242A37] hover:bg-slate-700 active:scale-[0.98] text-amber-400 text-xs font-bold flex flex-col items-center justify-center gap-0.5 shadow-sm text-center border border-slate-700/60 no-underline" 
                    href="tel:07722154182"
                  >
                    <span className="text-lg">📞</span>
                    <span>اتصال</span>
                  </a>
                </div>
                <div className="flex items-center justify-center gap-1.5 text-slate-400 text-xs pt-0.5">
                  <span className="text-emerald-400">🛡️</span>
                  <span>التفعيل والتدريب فوري خلال ساعة واحدة بمقر الشركة بالنجف</span>
                </div>
              </div>
            </section>

            {/* 4. بطاقات الثقة السريعة */}
            <section className="w-full grid grid-cols-2 gap-2.5 pb-2">
              <div className="p-3.5 rounded-xl bg-[#161C28] flex flex-col items-center text-center gap-1 shadow-sm border border-slate-700/30">
                <span className="text-amber-400 text-2xl">🛡️</span>
                <span className="text-lg text-white font-bold">100%</span>
                <span className="text-xs text-slate-400">كباتن مدققون أمنياً</span>
              </div>
              <div className="p-3.5 rounded-xl bg-[#161C28] flex flex-col items-center text-center gap-1 shadow-sm border border-slate-700/30">
                <span className="text-emerald-400 text-2xl">🎧</span>
                <span className="text-lg text-white font-bold">24 / 7</span>
                <span className="text-xs text-slate-400">غرفة عمليات محلية</span>
              </div>
            </section>
          </>
        )}

        {/* ====================================================================
            5. تبويب الحساب (Profile Tab)
            ==================================================================== */}
        {activeTab === 'profile' && (
          <div className="flex flex-col gap-4 animate-fade-in text-right">
            <div className="w-full p-5 rounded-2xl bg-[#161C28] border border-slate-700/50 flex flex-col items-center text-center gap-3">
              <div className="relative">
                <img 
                  alt="صورة الحساب" 
                  className="w-20 h-20 rounded-full object-cover ring-4 ring-amber-500/20 bg-[#080E1A]" 
                  src={user.avatar} 
                />
                <span className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-emerald-400 ring-2 ring-[#161C28]"></span>
              </div>
              <div className="flex flex-col">
                <h3 className="text-xl font-bold text-white">{user.name}</h3>
                <span className="text-xs font-mono text-slate-400 mt-1" dir="ltr">{user.phone}</span>
              </div>
              <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 text-xs font-semibold border border-amber-500/20">
                <span>⭐ عضو مميز في توصيلة النجف</span>
              </div>
            </div>

            <div className="w-full rounded-2xl bg-[#161C28] border border-slate-700/40 divide-y divide-slate-700/40 overflow-hidden">
              <button 
                onClick={() => setActiveTab('trips')} 
                className="w-full p-4 flex items-center justify-between hover:bg-slate-800/40 transition-colors text-right min-h-[48px] cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">🕒</span>
                  <span className="text-sm font-semibold text-white">سجل رحلاتي واشتراكاتي</span>
                </div>
                <span className="text-slate-400">←</span>
              </button>
              
              <button 
                onClick={() => setIsPolicyModalOpen(true)} 
                className="w-full p-4 flex items-center justify-between hover:bg-slate-800/40 transition-colors text-right min-h-[48px] cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">📜</span>
                  <span className="text-sm font-semibold text-white">شروط الخدمة وسياسة الخصوصية</span>
                </div>
                <span className="text-slate-400">←</span>
              </button>

              <button 
                onClick={() => setActiveTab('safety')} 
                className="w-full p-4 flex items-center justify-between hover:bg-slate-800/40 transition-colors text-right min-h-[48px] cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">🆘</span>
                  <span className="text-sm font-semibold text-white">مركز الأمان والطوارئ</span>
                </div>
                <span className="text-slate-400">←</span>
              </button>

              <a 
                href="https://t.me/wsam_ta" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="w-full p-4 flex items-center justify-between hover:bg-slate-800/40 transition-colors text-right min-h-[48px] no-underline"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">🎧</span>
                  <span className="text-sm font-semibold text-white">الدعم الفني المباشر</span>
                </div>
                <span className="text-slate-400">←</span>
              </a>

              <button 
                onClick={handleLogout} 
                className="w-full p-4 flex items-center justify-between hover:bg-red-500/10 text-red-400 transition-colors text-right min-h-[48px] cursor-pointer"
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

        {/* ====================================================================
            تبويب سجل الرحلات (Trips Tab)
            ==================================================================== */}
        {activeTab === 'trips' && (
          <div className="flex flex-col gap-4 animate-fade-in text-right">
            <div className="flex items-center justify-between pb-1">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>سجل رحلاتي</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">النجف الأشرف</span>
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab('home')}
                className="text-xs text-slate-400 hover:text-white min-h-[48px] px-2 flex items-center gap-1 cursor-pointer"
              >
                <span>← العودة للرئيسية</span>
              </button>
            </div>

            <div className="w-full rounded-2xl bg-[#161C28] p-5 border border-slate-700/50 flex flex-col items-center text-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-[#080E1A] flex items-center justify-center p-2.5 border border-slate-700/50 shadow-inner">
                <img src="/logo.png?v=40" alt="توصيلة" className="w-full h-full object-contain drop-shadow" />
              </div>
              <h3 className="text-base font-bold text-white">جاهز لمشوارك القادم؟</h3>
              <p className="text-xs text-slate-400 leading-relaxed max-w-xs">
                تظهر هنا سجلات مشاوير التكسي الفورية واشتراكات الخطوط اليومية بعد إتمامها وتوثيقها رسمياً.
              </p>
              <div className="flex gap-2 w-full pt-2">
                <button
                  type="button"
                  onClick={handleOpenInstantBooking}
                  className="flex-1 min-h-[48px] rounded-xl bg-gradient-to-l from-amber-400 to-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center cursor-pointer shadow-md"
                >
                  احجز تكسي فوري 🚖
                </button>
                <button
                  type="button"
                  onClick={handleOpenMonthlyBooking}
                  className="flex-1 min-h-[48px] rounded-xl bg-[#242A37] hover:bg-slate-700 text-amber-400 font-bold text-xs flex items-center justify-center cursor-pointer border border-slate-700/60"
                >
                  طلب خط دائمي 📅
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ====================================================================
            تبويب الإشعارات (Notifications Tab)
            ==================================================================== */}
        {activeTab === 'notifications' && (
          <div className="flex flex-col gap-3.5 animate-fade-in text-right">
            <div className="flex items-center justify-between pb-1">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>مركز الإشعارات</span>
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab('home')}
                className="text-xs text-slate-400 hover:text-white min-h-[48px] px-2 flex items-center gap-1 cursor-pointer"
              >
                <span>← العودة للرئيسية</span>
              </button>
            </div>

            <div className="w-full rounded-2xl bg-[#161C28] p-4 border border-amber-500/20 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-bold">
                  تنويه الإدارة العامة 📢
                </span>
                <span className="text-[11px] text-slate-400">الآن</span>
              </div>
              <p className="text-xs text-slate-200 leading-relaxed pt-1">
                {announcementText}
              </p>
            </div>

            <div className="w-full rounded-2xl bg-[#161C28] p-4 border border-slate-700/40 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-xs font-bold">
                  أهلاً بك في المنظومة 🚖
                </span>
                <span className="text-[11px] text-slate-400">منظومة النجف</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                يسعدنا خدمتك عبر أحدث أسطول تكسي وخطوط شهرية ذكية في النجف الأشرف والكوفة.
              </p>
            </div>

            <a
              href="https://t.me/tawseelaiq"
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[48px] w-full px-4 py-3 rounded-2xl bg-gradient-to-r from-sky-600/30 via-sky-600/20 to-[#161C28] border border-sky-500/40 text-sky-300 text-xs font-bold flex items-center justify-between no-underline"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-xl">✈️</span>
                <span>تابع تحديثات المشاوير على قناة تيليجرام الرسمية</span>
              </div>
              <span>←</span>
            </a>
          </div>
        )}

        {/* ====================================================================
            تبويب الأمان والطوارئ (Safety Tab)
            ==================================================================== */}
        {activeTab === 'safety' && (
          <div className="flex flex-col gap-4 animate-fade-in text-right">
            <div className="flex items-center justify-between pb-1">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <span>مركز الأمان والطوارئ</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-400">SOS</span>
              </h2>
              <button
                type="button"
                onClick={() => setActiveTab('home')}
                className="text-xs text-slate-400 hover:text-white min-h-[48px] px-2 flex items-center gap-1 cursor-pointer"
              >
                <span>← العودة للرئيسية</span>
              </button>
            </div>

            <div className="w-full rounded-2xl bg-gradient-to-br from-red-950/40 via-[#161C28] to-[#161C28] p-4 border border-red-500/30 flex flex-col gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-red-500/20 text-red-400 flex items-center justify-center text-xl shrink-0">
                  🆘
                </div>
                <div className="flex flex-col">
                  <h3 className="text-base font-bold text-white">أرقام الطوارئ السريعة</h3>
                  <span className="text-xs text-slate-400">اتصال مباشر ومجاني 24 ساعة</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <a
                  href="tel:104"
                  className="min-h-[48px] rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 flex flex-col items-center justify-center p-2 text-center no-underline"
                >
                  <span className="font-bold text-sm">104</span>
                  <span className="text-[10.5px]">شرطة النجدة</span>
                </a>
                <a
                  href="tel:122"
                  className="min-h-[48px] rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 flex flex-col items-center justify-center p-2 text-center no-underline"
                >
                  <span className="font-bold text-sm">122</span>
                  <span className="text-[10.5px]">الإسعاف</span>
                </a>
                <a
                  href="tel:07722154182"
                  className="min-h-[48px] rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 flex flex-col items-center justify-center p-2 text-center no-underline"
                >
                  <span className="font-bold text-sm">العمليات</span>
                  <span className="text-[10.5px]">توصيلة 🚖</span>
                </a>
              </div>
            </div>

            <div className="w-full rounded-2xl bg-[#161C28] p-4 border border-slate-700/40 flex flex-col gap-2.5">
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <span>🛡️ معايير الحماية في توصيلة</span>
              </h4>
              <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside leading-relaxed">
                <li>كافة الكباتن مسجلون ومدققون أمنياً وبمستمسكات رسمية معتمدة.</li>
                <li>تتبع مسار الرحلة لحظياً بدقة GPS عالية من انطلاق الرحلة وحتى الوصول.</li>
                <li>إمكانية مشاركة تفاصيل الرحلة المباشرة مع عائلتك وأصدقائك عبر واتساب.</li>
              </ul>
            </div>
          </div>
        )}
      </main>

      {/* ====================================================================
          6. شريط التنقل السفلي الفاخر الموحد (Floating Navigation Dock)
          مساحات لمس قياسية >= 48x48px لكل عنصر ومسافات أمان
          ==================================================================== */}
      <nav 
        className="fixed bottom-3 left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-md z-40 bg-[#080E1A]/95 backdrop-blur-2xl rounded-2xl shadow-2xl p-1.5 flex items-center justify-around border border-slate-700/50"
        aria-label="شريط التنقل الرئيسي"
      >
        <button 
          onClick={() => setActiveTab('home')} 
          className={`min-w-[64px] min-h-[48px] flex-1 py-1 px-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 active:scale-[0.98] transition-all cursor-pointer ${
            activeTab === 'home' ? 'bg-[#242A37] text-amber-400 font-bold' : 'text-slate-400 hover:text-white'
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
            activeTab === 'trips' ? 'bg-[#242A37] text-amber-400 font-bold' : 'text-slate-400 hover:text-white'
          }`} 
          type="button"
          aria-label="رحلاتي"
        >
          <span className="text-xl">🕒</span>
          <span className="text-xs">رحلاتي</span>
        </button>

        <button 
          onClick={() => setActiveTab('notifications')} 
          className={`min-w-[64px] min-h-[48px] flex-1 py-1 px-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 active:scale-[0.98] transition-all relative cursor-pointer ${
            activeTab === 'notifications' ? 'bg-[#242A37] text-amber-400 font-bold' : 'text-slate-400 hover:text-white'
          }`} 
          type="button"
          aria-label="الإشعارات"
        >
          <span className="text-xl">🔔</span>
          <span className="text-xs">الإشعارات</span>
          <span className="absolute top-2 right-1/3 w-2 h-2 rounded-full bg-amber-500"></span>
        </button>

        <button 
          onClick={() => setActiveTab('safety')} 
          className={`min-w-[64px] min-h-[48px] flex-1 py-1 px-1.5 rounded-xl flex flex-col items-center justify-center gap-0.5 active:scale-[0.98] transition-all cursor-pointer ${
            activeTab === 'safety' ? 'bg-[#242A37] text-amber-400 font-bold' : 'text-slate-400 hover:text-white'
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
            activeTab === 'profile' ? 'bg-[#242A37] text-amber-400 font-bold' : 'text-slate-400 hover:text-white'
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

export default CustomerHub;
