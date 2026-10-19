import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export default function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // 1. فحص ما إذا كان التطبيق مثبتاً بالفعل ويعمل كـ Standalone
    const checkStandalone = (): boolean => {
      const isStandaloneMedia = window.matchMedia('(display-mode: standalone)').matches;
      const isNavigatorStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      return isStandaloneMedia || isNavigatorStandalone;
    };

    if (checkStandalone()) {
      setIsStandalone(true);
      return;
    }

    // 2. التحقق مما إذا كان المستخدم أغلق التنبيه في نفس جلسة التصفح
    try {
      if (sessionStorage.getItem('pwa_prompt_dismissed') === 'true') {
        setIsDismissed(true);
      }
    } catch {
      // تجاهل قيود التخزين
    }

    // 3. التحقق من أجهزة iOS
    const ua = window.navigator.userAgent.toLowerCase();
    const isIosDevice =
      /iphone|ipad|ipod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (isIosDevice) {
      setIsIos(true);
    }

    // 4. اعتراض حدث التثبيت لأجهزة Android و Chromium
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    // 5. الاستماع لنجاح التثبيت لإخفاء المكون نهائياً
    const handleAppInstalled = () => {
      setIsStandalone(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setIsStandalone(true);
      }
    } catch {
      // استثناءات غير متوقعة
    } finally {
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      sessionStorage.setItem('pwa_prompt_dismissed', 'true');
    } catch {
      // تجاهل قيود التخزين
    }
  };

  // شروط عدم الظهور: التطبيق مثبت، أو أُغلق في الجلسة، أو لا يوجد حدث تثبيت وليس iOS
  if (isStandalone || isDismissed || (!deferredPrompt && !isIos)) {
    return null;
  }

  return (
    <div
      className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] md:bottom-5 md:max-w-lg md:mx-auto z-50 animate-sheet-up font-cairo select-none"
      dir="rtl"
    >
      <div className="relative rounded-3xl bg-white/98 backdrop-blur-lg p-5 sm:p-6 shadow-2xl border-2 border-amber-100 text-right">
        {/* زر الإغلاق المؤقت للجلسة بمساحة لمس مريحة >= 44x44px */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-2.5 left-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition active:scale-90 cursor-pointer"
          aria-label="إغلاق التنبيه"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* ترويسة بطاقة التثبيت مع اللوجو والشارة */}
        <div className="flex items-center gap-3.5 pl-9 mb-3">
          <div className="w-13 h-13 rounded-2xl bg-amber-500/10 flex items-center justify-center p-2 border border-amber-500/20 shadow-xs flex-shrink-0">
            <img src="/logo.png?v=40" alt="توصيلة" className="w-full h-full object-contain drop-shadow" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-[17px] font-black text-slate-900 leading-tight">تطبيق توصيلة</h4>
              <span className="rounded-full bg-amber-50 text-amber-800 text-[11.5px] font-black px-2.5 py-0.5 border border-amber-300 shadow-xs">
                تثبيت سريع ⚡
              </span>
            </div>
            <p className="text-[12.5px] font-semibold text-slate-500 mt-0.5">
              تطبيق نقل الركاب الأول في النجف الأشرف
            </p>
          </div>
        </div>

        {/* محتوى الشرح المخصص حسب نظام التشغيل */}
        {isIos ? (
          <div className="space-y-3">
            <p className="text-[13.5px] font-bold text-slate-700 leading-relaxed">
              لتثبيت التطبيق على جهاز الآيفون وتلقي التنبيهات المباشرة، اتبع الخطوات الثلاث البسيطة:
            </p>

            <div className="space-y-2 rounded-2xl bg-slate-50 border border-slate-200/80 p-3.5 text-[13px] font-semibold text-slate-800">
              {/* الخطوة 1 */}
              <div className="flex items-start gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white font-black text-[12px] shadow-xs">
                  ١
                </span>
                <p className="leading-relaxed flex-1">
                  اضغط على زر المشاركة{' '}
                  <span className="inline-flex items-center justify-center align-middle mx-1 px-1.5 py-0.5 rounded-lg bg-white border border-slate-300 shadow-xs font-mono font-bold text-[#1B4965]">
                    <svg
                      className="h-4 w-4 inline-block"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                      <polyline points="16 6 12 2 8 6" />
                      <line x1="12" y1="2" x2="12" y2="15" />
                    </svg>
                  </span>{' '}
                  في شريط سفاري السفلي.
                </p>
              </div>

              {/* الخطوة 2 */}
              <div className="flex items-start gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white font-black text-[12px] shadow-xs">
                  ٢
                </span>
                <p className="leading-relaxed flex-1">
                  مرر القائمة لأسفل ثم اضغط على <span className="font-bold text-slate-900">«عرض المزيد»</span> (إن لم تظهر مباشرة).
                </p>
              </div>

              {/* الخطوة 3 */}
              <div className="flex items-start gap-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white font-black text-[12px] shadow-xs">
                  ٣
                </span>
                <p className="leading-relaxed flex-1">
                  اختر <span className="font-black text-amber-700 bg-amber-100/70 px-1.5 py-0.5 rounded-md">«إضافة إلى الصفحة الرئيسية ➕»</span> (Add to Home Screen) ليثبت على شاشتك.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[13.5px] font-bold text-slate-700 leading-relaxed">
              ثبّت التطبيق على هاتفك لتجربة تصفح فائقة السرعة، وتتبع حي للكباتن بدقة دون الحاجة لفتح المتصفح في كل مرة.
            </p>
            <button
              type="button"
              onClick={handleInstallClick}
              className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-2xl bg-amber-500 hover:bg-amber-600 active:scale-[0.98] py-2.5 px-4 text-[15px] font-black text-white shadow-lg shadow-amber-500/25 transition cursor-pointer"
            >
              <span>تثبيت التطبيق الآن 📲</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
