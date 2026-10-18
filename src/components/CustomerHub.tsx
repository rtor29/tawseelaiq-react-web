// مركز خدمات الراكب (Customer Service Hub) — استايل التطبيقات الفائقة الحديثة (Baly / Careem)
// يتضمن: الترويسة الأنيقة مع شعار توصيله الديناميكي، بنر العروض الترويجية، شبكة الخدمات (تكسي / خط دائمي)،
// قسم تسجيل الكباتن، وشريط تنقل سفلي مينيمال بأيقونتين فقط (الرئيسية | الحساب)

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { http } from '../lib/api';
import { useSession } from '../lib/auth';
import { storage } from '../lib/storage';
import { AppDrawer } from './AppDrawer';

interface BannerItem {
  enabled: boolean;
  title: string;
  subtitle: string;
  badge: string;
  imageUrl?: string;
  ctaText: string;
  actionUrl: string;
}

interface CustomerHubProps {
  onSelectService?: (type: 'taxi' | 'permanent') => void;
}

const DEFAULT_TOP_BANNER: BannerItem = {
  enabled: true,
  title: 'مشاويرك في النجف أسهل وأسرع',
  subtitle: 'اطلب تكسي فوري أو احجز مقعدك بالخط اليومي بأفضل الأسعار',
  badge: 'توفير يومي 🚖',
  imageUrl: '/assets/tawseela-logo-yellow.png',
  ctaText: 'اطلب الآن',
  actionUrl: 'taxi',
};

const DEFAULT_CAPTAIN_BANNER: BannerItem = {
  enabled: true,
  title: 'سجل كابتن.. وزيد دخلك الشهري ويا توصيله',
  subtitle: 'أرباح تصل إلى 1,200,000 د.ع شهرياً مع عمولة رمزية 0% وساعات مرنة',
  badge: 'عمولة 0% لأول شهر 🌟',
  ctaText: 'سجل كابتن الآن 🚗',
  actionUrl: 'https://wa.me/9647706204066',
};

export function CustomerHub({ onSelectService }: CustomerHubProps) {
  const navigate = useNavigate();
  const session = useSession();

  const [topBanner, setTopBanner] = useState<BannerItem>(DEFAULT_TOP_BANNER);
  const [captainBanner, setCaptainBanner] = useState<BannerItem>(DEFAULT_CAPTAIN_BANNER);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const fullName = session?.fullName || storage.getFullName() || 'عزيزي الراكب';
  const firstName = fullName.split(' ')[0] || 'عزيزي';

  // جلب إعدادات البنرات النشطة من الباك إند
  useEffect(() => {
    let isMounted = true;
    http
      .get<{ success?: boolean; topBanner?: Partial<BannerItem>; captainBanner?: Partial<BannerItem> }>('/public/banners')
      .then((res) => {
        if (!isMounted || !res.data) return;
        if (res.data.topBanner) {
          setTopBanner((prev) => ({ ...prev, ...res.data.topBanner }));
        }
        if (res.data.captainBanner) {
          setCaptainBanner((prev) => ({ ...prev, ...res.data.captainBanner }));
        }
      })
      .catch(() => {
        // Fallback to defaults seamlessly
      });

    return () => {
      isMounted = false;
    };
  }, []);

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

  function handleBannerCta(actionUrl?: string) {
    if (!actionUrl || actionUrl === 'taxi') {
      handleServiceClick('taxi');
    } else if (actionUrl === 'daily' || actionUrl === 'permanent') {
      handleServiceClick('permanent');
    } else if (actionUrl.startsWith('http://') || actionUrl.startsWith('https://')) {
      window.open(actionUrl, '_blank', 'noopener,noreferrer');
    } else if (actionUrl.startsWith('/')) {
      navigate(actionUrl);
    } else {
      handleServiceClick('taxi');
    }
  }

  return (
    <div className="min-h-dvh bg-[#F8FAFC] text-[#0F172A] font-cairo flex flex-col justify-between selection:bg-amber-100 selection:text-amber-900" dir="rtl">
      {/* Container مقيد العرض لتجربة هاتف مثالية وتجاوب ممتاز للشاشات الكبيرة */}
      <div className="w-full max-w-[480px] mx-auto min-h-dvh flex flex-col justify-between pb-24 relative">
        
        {/* ====================================================================
            1. الترويسة العلوية (Top Header & Branding)
            ==================================================================== */}
        <header className="px-4 pt-[calc(0.75rem+env(safe-area-inset-top,1rem))] pb-3 bg-white border-b border-slate-100 flex items-center justify-between sticky top-0 z-30 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsDrawerOpen(true)}
              className="w-10 h-10 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center justify-center text-slate-700 hover:text-slate-900 hover:border-slate-300 transition-all active:scale-95 cursor-pointer"
              aria-label="الحساب والإعدادات"
              title="الحساب والإعدادات"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </button>
            <div>
              <div className="text-[12px] font-medium text-slate-500">مرحباً بك 👋</div>
              <div className="text-[15px] font-bold text-slate-900 truncate max-w-[170px]">{firstName}</div>
            </div>
          </div>

          {/* شعار توصيله الديناميكي المتزامن مع لون الهوية */}
          <div className="flex items-center gap-2">
            <span
              className="tawseela-dynamic-logo w-28 h-8 block"
              role="img"
              aria-label="شعار توصيله"
            />
          </div>
        </header>

        {/* ====================================================================
            2. المحتوى الرئيسي (Hero Banner + Services Grid + Captain Recruitment)
            ==================================================================== */}
        <main className="flex-1 flex flex-col gap-5 pt-4 px-4">
          
          {/* سؤال الوجهة الهادئ */}
          <div className="px-1">
            <h1 className="text-[20px] font-bold text-slate-900 tracking-tight">
              وين حابب نوصلك اليوم؟
            </h1>
            <p className="text-[13px] font-medium text-slate-500 mt-0.5">
              اختر نوع الخدمة المناسبة لمشوارك في النجف الأشرف
            </p>
          </div>

          {/* البنر الترويجي العلوي الديناميكي (Top Hero Promo Banner) */}
          {topBanner.enabled && (
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-l from-amber-500/15 via-amber-500/5 to-white border border-amber-200/70 p-4 sm:p-5 shadow-sm transition-all duration-200 hover:shadow-md">
              <div className="relative z-10 flex flex-col justify-between h-full">
                <div>
                  {topBanner.badge && (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200/80 mb-2">
                      {topBanner.badge}
                    </span>
                  )}
                  <h2 className="text-[16px] sm:text-[17px] font-bold text-slate-900 leading-snug">
                    {topBanner.title}
                  </h2>
                  <p className="text-[12px] sm:text-[13px] font-medium text-slate-600 mt-1 line-clamp-2 max-w-[85%]">
                    {topBanner.subtitle}
                  </p>
                </div>

                <div className="mt-3.5 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => handleBannerCta(topBanner.actionUrl)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[13px] font-bold shadow-sm transition-all active:scale-95 cursor-pointer"
                  >
                    <span>{topBanner.ctaText || 'اطلب الآن'}</span>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="rotate-180">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </button>

                  <div className="opacity-90">
                    <span className="tawseela-dynamic-logo w-14 h-9 block opacity-80" />
                  </div>
                </div>
              </div>

              {/* دائرة ناعمة في الخلفية للعمق البصري */}
              <div className="absolute -left-8 -bottom-8 w-32 h-32 rounded-full bg-amber-400/10 blur-xl pointer-events-none" />
            </div>
          )}

          {/* شبكة الخدمات الرئيسية (Main Services Grid) - بطاقتان داخل حاوية رمادية فاتحة ناعمة */}
          <div className="bg-slate-100/80 p-2.5 sm:p-3 rounded-3xl border border-slate-200/60">
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              
              {/* بطاقة تكسي (اليمين) */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleServiceClick('taxi')}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleServiceClick('taxi')}
                className="group relative flex flex-col justify-between p-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm hover:border-amber-400 hover:shadow-md transition-all duration-200 active:scale-[0.97] cursor-pointer select-none"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-200/60">
                      سريع وآمن ⚡
                    </span>
                  </div>

                  {/* أيقونة سيارة التكسي */}
                  <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform duration-200">
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
                      <circle cx="7" cy="17" r="2" />
                      <path d="M9 17h6" />
                      <circle cx="17" cy="17" r="2" />
                    </svg>
                  </div>

                  <h3 className="text-[17px] font-bold text-slate-900 group-hover:text-amber-700 transition-colors">
                    تكسي
                  </h3>
                  <p className="text-[11px] font-medium text-slate-500 mt-0.5 leading-relaxed">
                    مشوار فوري ومباشر بأي وقت
                  </p>
                </div>

                <div className="mt-4 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-amber-700">
                  <span>طلب فوري</span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="rotate-180 group-hover:-translate-x-1 transition-transform">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </div>
              </div>

              {/* بطاقة حجز خط دائمي (اليسار) */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleServiceClick('permanent')}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleServiceClick('permanent')}
                className="group relative flex flex-col justify-between p-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm hover:border-[#1B4965] hover:shadow-md transition-all duration-200 active:scale-[0.97] cursor-pointer select-none"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-50 text-sky-900 border border-sky-200/60">
                      التزام يومي 📅
                    </span>
                  </div>

                  {/* أيقونة باص / فان الخط الدائمي */}
                  <div className="w-14 h-14 rounded-2xl bg-sky-50 border border-sky-100 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform duration-200">
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#1B4965" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                  <p className="text-[11px] font-medium text-slate-500 mt-0.5 leading-relaxed">
                    للموظفين والطلبة شهرياً
                  </p>
                </div>

                <div className="mt-4 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-[#1B4965]">
                  <span>اشتراك شهري</span>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="rotate-180 group-hover:-translate-x-1 transition-transform">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </div>
              </div>

            </div>
          </div>

          {/* ==================================================================
              3. قسم تسجيل الكباتن وزيادة الدخل (Captain Recruitment Section)
              ================================================================== */}
          {captainBanner.enabled && (
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-[#1B4965] text-white p-5 shadow-md border border-slate-800">
              <div className="relative z-10 flex flex-col justify-between">
                <div>
                  {captainBanner.badge && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white/10 text-amber-300 border border-white/20 mb-2">
                      {captainBanner.badge}
                    </span>
                  )}
                  <h3 className="text-[16px] sm:text-[17px] font-bold text-white leading-snug">
                    {captainBanner.title}
                  </h3>
                  <p className="text-[12px] sm:text-[13px] font-medium text-slate-300 mt-1.5 leading-relaxed">
                    {captainBanner.subtitle}
                  </p>
                </div>

                <div className="mt-4 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleBannerCta(captainBanner.actionUrl)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 text-[13px] font-bold shadow-md transition-all active:scale-95 cursor-pointer"
                  >
                    <span>{captainBanner.ctaText || 'سجل كابتن الآن 🚗'}</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="rotate-180">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </button>

                  <a
                    href="tel:07706204066"
                    className="w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white transition-all active:scale-95"
                    title="اتصل بالدعم"
                    aria-label="اتصل بنا"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                  </a>
                </div>
              </div>

              {/* تأثير إضاءة خلفية خفيف */}
              <div className="absolute -right-10 -bottom-10 w-40 h-40 rounded-full bg-amber-400/15 blur-2xl pointer-events-none" />
            </div>
          )}

        </main>

        {/* مساحة تنفس سفلية لمنع حجب المحتوى بالشريط العائم */}
        <div className="h-6" />

        {/* ====================================================================
            4. شريط التنقل السفلي المينيمال (Minimal Bottom Navigation Bar)
            أيقونتان فقط: الرئيسية (مفعلة) والحساب (تفتح القائمة)
            ==================================================================== */}
        <nav
          className="fixed bottom-0 inset-x-0 z-30 max-w-[480px] mx-auto bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-8 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom,0.5rem))] flex items-center justify-around shadow-subtle"
          aria-label="شريط التنقل الرئيسي"
        >
          {/* زر الرئيسية (نشط دائماً في شاشة الهب) */}
          <button
            type="button"
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-amber-500/10 text-amber-700 font-bold text-[13.5px] transition-all cursor-default select-none"
            aria-current="page"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9.5L12 3l9 6.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span>الرئيسية</span>
          </button>

          {/* زر الحساب (يفتح القائمة الجانبية الكاملة والبروفايل والشكاوى) */}
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-bold text-[13.5px] transition-all cursor-pointer select-none active:scale-95"
            aria-label="الحساب والإعدادات"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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
