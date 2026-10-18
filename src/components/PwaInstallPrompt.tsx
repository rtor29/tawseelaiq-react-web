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
      className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] md:bottom-4 md:max-w-md md:mx-auto z-50 animate-sheet-up font-cairo select-none"
      dir="rtl"
    >
      <div className="relative rounded-2xl bg-white/95 backdrop-blur-md p-4 shadow-2xl border border-slate-200/90 text-right">
        {/* زر الإغلاق المؤقت للجلسة */}
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-2.5 left-2.5 flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition active:scale-90 cursor-pointer"
          aria-label="إغلاق التنبيه"
        >
          ✕
        </button>

        <div className="flex items-start gap-3 pl-6">
          {/* أيقونة التطبيق الرسمية */}
          <img
            src="/icons/icon-192.png"
            alt="تطبيق توصيله"
            className="h-12 w-12 rounded-xl shadow-xs border border-slate-100 shrink-0 object-cover"
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <h4 className="text-[15px] font-bold text-slate-900">تطبيق توصيله</h4>
              <span className="rounded-md bg-amber-50 text-amber-700 text-[10.5px] font-bold px-1.5 py-0.5 border border-amber-200/60">
                تثبيت سريع
              </span>
            </div>

            {isIos ? (
              <div className="space-y-1.5">
                <p className="text-[12px] font-medium text-slate-600 leading-relaxed">
                  للحصول على أفضل تجربة، أضف توصيلة لشاشتك الرئيسية. اضغط على زر المشاركة{' '}
                  <span className="inline-flex items-center justify-center align-middle mx-0.5 p-1 rounded-md bg-slate-100 text-[#1B4965] border border-slate-200/60">
                    <svg
                      className="h-3.5 w-3.5"
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
                  بالأسفل ثم اختر <span className="font-bold text-slate-900">«إضافة للشاشة الرئيسية» ➕</span>
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                <p className="text-[12px] font-medium text-slate-600 leading-relaxed">
                  ثبّت التطبيق على جهازك لتشغيل أسرع، وتتبع مباشر للكباتن بدون فتح المتصفح.
                </p>
                <button
                  type="button"
                  onClick={handleInstallClick}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-[0.98] py-2.5 px-4 text-[13.5px] font-bold text-white shadow-md shadow-amber-500/20 transition cursor-pointer"
                >
                  <span>تثبيت التطبيق 📲</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
