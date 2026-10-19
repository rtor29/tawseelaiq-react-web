// مركز خدمات الراكب (Customer Service Hub) — استايل التطبيقات الفائقة الحديثة (Baly / Careem)
// متوافق حرفياً مع معايير Google الرسمية لتجربة وواجهات المستخدم (Google Material 3 & UX Standards)
// - مساحات لمس قياسية >= 48x48px ومسافات أمان >= 8px
// - تباين لوني معتمد WCAG 2.1 AA مقروء بوضوح تحت شمس العراق
// - استقرار التخطيط وتفادي القفزات البصرية (Zero CLS < 0.1)
// - وحدات عرض ديناميكية 100dvh وهوامش آمنة env(safe-area-inset-bottom)
// - شريط إعلانات وتنويهات رسمي ديناميكي متزامن تلقائياً مع لوحة التحكم وقناة تيليجرام

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { http } from '../lib/api';
import { useSession } from '../lib/auth';
import { storage } from '../lib/storage';
import { AppDrawer } from './AppDrawer';

interface CustomerHubProps {
  onSelectService?: (type: 'taxi' | 'permanent') => void;
}

const DEFAULT_ANNOUNCEMENT =
  'أهلاً بك في توصيلة 🚖 | خدمة النقل الذكي في النجف الأشرف.. مشاوير فورية وخطوط دائمية بأسعار معتمدة.';

export function CustomerHub({ onSelectService }: CustomerHubProps) {
  const navigate = useNavigate();
  const session = useSession();

  // نص الإعلان الرسمي (مهيأ بالنص الوقائي لمنع أي اهتزاز بصري Zero CLS)
  const [announcementText, setAnnouncementText] = useState<string>(DEFAULT_ANNOUNCEMENT);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const fullName = session?.fullName || storage.getFullName() || 'عزيزي الراكب';
  const firstName = fullName.split(' ')[0] || 'عزيزي';

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
      // Fallback seamlessly to DEFAULT_ANNOUNCEMENT
    }
  }, []);

  useEffect(() => {
    loadAnnouncement();
    // فحص دوري كل 25 ثانية وعند تركيز النافذة لتحديث الإعلانات فور بثها من لوحة التحكم
    const interval = setInterval(loadAnnouncement, 25000);
    const onFocus = () => loadAnnouncement();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [loadAnnouncement]);

  function handleServiceClick(type: 'taxi' | 'permanent') {
    if (onSelectService) {
      onSelectService(type);
      return;
    }

    localStorage.setItem('selected_trip_type', type);
    if (type === 'permanent') {
      navigate('/daily');
    } else {
      navigate('/', { state: { serviceType: type } });
    }
  }

  return (
    <div
      className="w-full min-h-[100dvh] bg-[#F8FAFC] text-[#0F172A] font-cairo flex flex-col flex-1 selection:bg-amber-100 selection:text-amber-900 touch-pan-y"
      style={{ touchAction: 'pan-y' }}
      dir="rtl"
    >
      {/* الحاوية الرئيسية مع هامش أمان سفلي ديناميكي فوق شريط التنقل */}
      <div
        className="w-full max-w-[480px] mx-auto min-h-[100dvh] flex flex-col justify-between relative flex-1 min-h-0 touch-pan-y"
        style={{
          paddingBottom: 'calc(115px + env(safe-area-inset-bottom, 20px))',
          touchAction: 'pan-y'
        }}
      >
        {/* ====================================================================
            1. الترويسة العلوية الثابتة مع مساحة الأمان المخصصة (Top Safe Header)
            ==================================================================== */}
        <header className="px-4 pt-[calc(0.75rem+env(safe-area-inset-top,1rem))] pb-3 bg-white border-b border-slate-100 flex items-center justify-between sticky top-0 z-30 shadow-xs">
          {/* اليمين: الشعار والترحيب بالراكب */}
          <div className="flex items-center gap-2.5">
            <span
              className="tawseela-dynamic-logo w-28 h-8 block"
              role="img"
              aria-label="شعار توصيله"
            />
            <div className="mr-1">
              <div className="text-[12px] font-bold text-slate-600">مرحباً بك 👋</div>
              <div className="text-[15px] font-black text-slate-900 truncate max-w-[160px]">
                {firstName}
              </div>
            </div>
          </div>

          {/* اليسار: زر الحساب والقائمة الجانبية (مساحة لمس قياسية >= 48x48px) */}
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-2xl bg-white border border-slate-200/90 shadow-xs flex items-center justify-center text-slate-700 hover:text-slate-900 hover:border-slate-300 transition-all duration-150 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] cursor-pointer"
            aria-label="الحساب والإعدادات"
            title="الحساب والإعدادات"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </button>
        </header>

        {/* ====================================================================
            2. المحتوى الرئيسي (سؤال الوجهة + شريط الإعلانات + الخدمات + بطاقة الكابتن)
            ==================================================================== */}
        <main
          className="flex-1 min-h-0 flex flex-col gap-5 pt-4 px-4 touch-pan-y"
          style={{ touchAction: 'pan-y' }}
        >
          {/* سؤال الوجهة الهادئ */}
          <div className="px-1">
            <h1 className="text-[21px] font-black text-slate-900 tracking-tight">
              وين حابب نوصلك اليوم؟
            </h1>
            <p className="text-[13.5px] font-bold text-slate-600 mt-0.5">
              اختر نوع الخدمة المناسبة لمشوارك في النجف الأشرف
            </p>
          </div>

          {/* ==================================================================
              شريط الإعلانات والتنويهات الرسمي الديناميكي (Dynamic Announcement Banner)
              - محجوز الأبعاد لتفادي القفزات البصرية Zero CLS
              - بدون زر "اطلب الآن" المخصص فقط للطلبات
              ================================================================== */}
          <section
            aria-label="شريط الإعلانات الرسمي"
            className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-amber-500/15 via-amber-500/5 to-white border-2 border-amber-200/90 p-4 sm:p-5 shadow-sm transition-all duration-200 min-h-[120px] flex flex-col justify-between touch-pan-y"
            style={{ touchAction: 'pan-y' }}
          >
            <div className="relative z-10 flex flex-col">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11.5px] font-bold bg-amber-100 text-amber-950 border border-amber-300 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span>إعلان وتنويه رسمي 📢</span>
                </span>

                <a
                  href="https://t.me/tawseelaiq"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/90 border border-slate-200 text-sky-800 hover:text-sky-950 text-[11px] font-bold shadow-2xs transition-all active:scale-[0.98] no-underline"
                  title="زيارة قناة توصيلة على تيليجرام"
                >
                  <span>قناة توصيلة الرسمية</span>
                  <span className="text-[12px]">✈️</span>
                </a>
              </div>

              <p className="text-[14px] sm:text-[14.5px] font-bold text-slate-800 leading-relaxed break-words">
                {announcementText}
              </p>
            </div>

            {/* تأثير دائري بالخلفية للعمق البصري */}
            <div className="absolute -left-8 -bottom-8 w-32 h-32 rounded-full bg-amber-400/10 blur-xl pointer-events-none" />
          </section>

          {/* ==================================================================
              شبكة الخدمات الرئيسية (Services Grid)
              بطاقتان داخل حاوية رمادية فاتحة متناسقة
              ================================================================== */}
          <div
            className="bg-slate-100/90 p-3 rounded-3xl border border-slate-200/80 touch-pan-y"
            style={{ touchAction: 'pan-y' }}
          >
            <div className="grid grid-cols-2 gap-3 touch-pan-y" style={{ touchAction: 'pan-y' }}>
              {/* بطاقة تكسي */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleServiceClick('taxi')}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleServiceClick('taxi')}
                className="group relative flex flex-col justify-between p-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm hover:border-amber-400 hover:shadow-md transition-all duration-150 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] cursor-pointer select-none min-h-[160px] touch-pan-y"
                style={{ touchAction: 'pan-y' }}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-amber-100 text-amber-950 border border-amber-300">
                      سريع وآمن ⚡
                    </span>
                  </div>

                  <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform duration-200">
                    <svg
                      width="30"
                      height="30"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#D97706"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
                      <circle cx="7" cy="17" r="2" />
                      <path d="M9 17h6" />
                      <circle cx="17" cy="17" r="2" />
                    </svg>
                  </div>

                  <h3 className="text-[17px] font-bold text-slate-900 group-hover:text-amber-700 transition-colors">
                    تكسي
                  </h3>
                  <p className="text-[12px] font-bold text-slate-600 mt-0.5 leading-relaxed">
                    مشوار فوري ومباشر بأي وقت
                  </p>
                </div>

                <div className="mt-4 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[12px] font-black text-amber-700">
                  <span>طلب فوري</span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="rotate-180 group-hover:-translate-x-1 transition-transform"
                  >
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </div>
              </div>

              {/* بطاقة حجز خط دائمي */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleServiceClick('permanent')}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleServiceClick('permanent')}
                className="group relative flex flex-col justify-between p-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm hover:border-[#1B4965] hover:shadow-md transition-all duration-150 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] cursor-pointer select-none min-h-[160px] touch-pan-y"
                style={{ touchAction: 'pan-y' }}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10.5px] font-bold bg-sky-100 text-sky-950 border border-sky-300">
                      التزام يومي 📅
                    </span>
                  </div>

                  <div className="w-14 h-14 rounded-2xl bg-sky-50 border border-sky-100 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform duration-200">
                    <svg
                      width="30"
                      height="30"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#1B4965"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect x="3" y="3" width="18" height="15" rx="3" />
                      <circle cx="7" cy="18" r="2" />
                      <circle cx="17" cy="18" r="2" />
                      <line x1="3" y1="9" x2="21" y2="9" />
                      <line x1="12" y1="9" x2="12" y2="15" />
                    </svg>
                  </div>

                  <h3 className="text-[17px] font-bold text-slate-900 group-hover:text-[#1B4965] transition-colors">
                    حجز خط دائمي
                  </h3>
                  <p className="text-[12px] font-bold text-slate-600 mt-0.5 leading-relaxed">
                    للموظفين والطلبة شهرياً
                  </p>
                </div>

                <div className="mt-4 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[12px] font-black text-[#1B4965]">
                  <span>اشتراك شهري</span>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="rotate-180 group-hover:-translate-x-1 transition-transform"
                  >
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* ==================================================================
              3. بطاقة انضمام الكباتن وزيادة الدخل (Captain Recruitment Section)
              تصميم داكن فاخر (Deep Slate / Dark Navy مع لمسات ذهبية راقية)
              أزرار تواصل سريعة بنقرة واحدة بمساحات لمس قياسية >= 48px
              ================================================================== */}
          <section
            aria-label="الانضمام لكباتن توصيلة"
            className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B1528] via-[#0E1E38] to-[#1B4965] text-white p-5 sm:p-6 shadow-xl border-2 border-amber-400/30 touch-pan-y"
            style={{ touchAction: 'pan-y' }}
          >
            <div className="relative z-10 flex flex-col gap-4">
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/40 mb-2.5">
                  عمولة 0% لأول شهر 🌟
                </span>
                <h3 className="text-[18px] sm:text-[19px] font-black text-white leading-snug">
                  سجل كابتن.. وزيد دخلك الشهري ويا توصيله 🚖
                </h3>
                <p className="text-[13px] font-medium text-slate-300 mt-1.5 leading-relaxed">
                  تواصل مع إدارة المنظومة لتسجيل وتفعيل حسابك والبدء باستلام المشاوير فوراً:
                </p>
              </div>

              {/* أزرار التواصل السريع (بارتفاع قياسي >= 48px لكل زر ومسافة أمان >= 8px) */}
              <div className="space-y-3 pt-1">
                {/* 1. واتساب الإدارة */}
                <a
                  href="https://wa.me/9647722154182?text=السلام%20عليكم،%20أرغب%20بالانضمام%20لكباتن%20توصيلة"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[50px] rounded-2xl bg-[#25D366] hover:bg-[#20ba5a] text-white font-black text-[14.5px] flex items-center justify-center gap-2.5 shadow-md shadow-emerald-500/25 transition-all duration-150 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] cursor-pointer no-underline select-none"
                >
                  <span className="text-xl">💬</span>
                  <span>واتساب الإدارة (07722154182)</span>
                </a>

                {/* 2. تيليجرام الإدارة */}
                <a
                  href="https://t.me/wsam_ta"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[50px] rounded-2xl bg-[#0088cc] hover:bg-[#0077b5] text-white font-black text-[14.5px] flex items-center justify-center gap-2.5 shadow-md shadow-sky-500/25 transition-all duration-150 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] cursor-pointer no-underline select-none"
                >
                  <span className="text-xl">✈️</span>
                  <span>تيليجرام الإدارة (@wsam_ta)</span>
                </a>

                {/* 3. اتصال هاتفي مباشر */}
                <a
                  href="tel:07722154182"
                  className="w-full min-h-[50px] rounded-2xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-[14.5px] flex items-center justify-center gap-2 shadow-md shadow-amber-400/25 transition-all duration-150 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] cursor-pointer no-underline select-none"
                >
                  <span className="text-lg">📞</span>
                  <span>
                    اتصال هاتفي مباشر:{' '}
                    <span dir="ltr" className="font-mono font-bold">
                      07722154182
                    </span>
                  </span>
                </a>
              </div>
            </div>

            {/* لمسة إضاءة ذهبية جمالية بالخلفية */}
            <div className="absolute -right-10 -bottom-10 w-44 h-44 rounded-full bg-amber-400/15 blur-2xl pointer-events-none" />
          </section>
        </main>

        {/* ====================================================================
            4. شريط التنقل السفلي المينيمال (Minimal Bottom Navigation Bar)
            أيقونتان فقط: الرئيسية (مفعلة) والحساب (تفتح القائمة) بمساحات لمس >= 48x48px
            ==================================================================== */}
        <nav
          className="fixed bottom-0 inset-x-0 z-30 max-w-[480px] mx-auto bg-white/95 backdrop-blur-md border-t border-slate-200/90 px-6 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom,0.5rem))] flex items-center justify-around shadow-subtle"
          aria-label="شريط التنقل الرئيسي"
        >
          {/* زر الرئيسية (نشط دائماً في شاشة الهب) */}
          <button
            type="button"
            className="min-h-[48px] min-w-[48px] flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-amber-500/10 text-amber-800 font-black text-[13.5px] transition-all duration-150 ease-[cubic-bezier(0.2,0,0,1)] cursor-default select-none"
            aria-current="page"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 9.5L12 3l9 6.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span>الرئيسية</span>
          </button>

          {/* زر الحساب (يفتح القائمة الجانبية الكاملة والبروفايل والشكاوى) */}
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="min-h-[48px] min-w-[48px] flex items-center gap-2 px-5 py-2.5 rounded-2xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 font-bold text-[13.5px] transition-all duration-150 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] cursor-pointer select-none"
            aria-label="الحساب والإعدادات"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>الحساب</span>
          </button>
        </nav>

        {/* تضمين القائمة الجانبية للراكب (AppDrawer) */}
        <AppDrawer open={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
      </div>
    </div>
  );
}
