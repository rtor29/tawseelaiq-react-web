import { Suspense, lazy, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { http } from '../lib/api';
import { authStore, useSession } from '../lib/auth';
import { storage } from '../lib/storage';
import { consumeLoginTokenFromUrl } from '../lib/googleAuth';
import type { Session } from '../types';
import { Spinner } from '../components/ui';
import { useToast } from '../components/Toast';
import TermsPrivacyModal from '../components/TermsPrivacyModal';
import { OtpVerificationView } from '../components/OtpVerificationView';
import { normalizeArabicDigits } from '../lib/utils';

const CustomerHub = lazy(() => import('../components/CustomerHub').then((m) => ({ default: m.CustomerHub })));

export default function LoginPage() {
  const navigate = useNavigate();
  const { show } = useToast();
  const session = useSession();

  // Role switching: 'passenger' or 'driver'
  const [role, setRole] = useState<'passenger' | 'driver'>('passenger');

  // Auth flow steps
  const [step, setStep] = useState<'phone' | 'otp' | 'profile' | 'telegram_link' | 'service_select'>('phone');
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [detectedRole, setDetectedRole] = useState<'Customer' | 'Driver'>('Customer');
  const [termsModalTab, setTermsModalTab] = useState<'terms' | 'privacy' | null>(null);
  const [isCheckingTelegram, setIsCheckingTelegram] = useState(false);
  const [telegramAlert, setTelegramAlert] = useState<string | null>(null);

  // Smart PWA prompt dismissal & Native Install/Share
  const [isPwaDismissed, setIsPwaDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    if (isStandalone) return true;
    return sessionStorage.getItem('tawseela_pwa_dismissed') === 'true';
  });

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showIosPrompt, setShowIosPrompt] = useState(false);

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const dismissPwa = () => {
    setIsPwaDismissed(true);
    try {
      sessionStorage.setItem('tawseela_pwa_dismissed', 'true');
    } catch (_) {}
  };

  async function handleShareApp() {
    const shareData = {
      title: 'تطبيق توصيلة | Tawseela IQ',
      text: 'تطبيق توصيلة الرسمي لحجز التكسي والخطوط اليومية في النجف الأشرف 🚖',
      url: window.location.origin,
    };
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(window.location.origin);
      show('تم نسخ رابط تطبيق توصيلة للحافظة بنجاح 📋', 'success');
    } catch (_) {
      show(`رابط المنصة: ${window.location.origin}`, 'info');
    }
  }

  async function handleInstallApp() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice?.outcome === 'accepted') {
        show('شكراً لتثبيت تطبيق توصيلة! 🚖', 'success');
        setDeferredPrompt(null);
        dismissPwa();
      }
      return;
    }

    const isIos =
      typeof navigator !== 'undefined' &&
      (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
        ((navigator as any).platform === 'MacIntel' && navigator.maxTouchPoints > 1));

    if (isIos) {
      setShowIosPrompt(true);
      return;
    }

    show('اضغط على خيارات المتصفح (⋮) ثم اختر "تثبيت التطبيق" أو "إضافة إلى الشاشة الرئيسية"', 'info');
  }

  const navigateAfterLogin = (userRole: string) => {
    navigate(userRole === 'Driver' ? '/driver' : '/hub', { replace: true });
  };

  useEffect(() => {
    const viaToken = consumeLoginTokenFromUrl();
    if (viaToken) {
      navigateAfterLogin(viaToken.role);
      return;
    }

    if (session) {
      if (session.role === 'Driver') {
        navigateAfterLogin('Driver');
      } else {
        setStep('service_select');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function normalizePhone(val: string): string {
    return normalizeArabicDigits(val).replace(/[^0-9+]/g, '');
  }

  function handlePhoneChange(rawVal: string) {
    setErrorMessage(null);
    setPhone(normalizePhone(rawVal));
  }

  function handleSelectService(type: 'taxi' | 'permanent') {
    localStorage.setItem('selected_trip_type', type);
    if (type === 'permanent') {
      navigate('/daily', { replace: true });
    } else {
      navigate('/', { replace: true, state: { serviceType: type } });
    }
  }

  async function handleSubmitPhone(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (isLoading) return;
    setErrorMessage(null);

    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone || cleanPhone.length < 10) {
      setErrorMessage('يرجى إدخال رقم هاتف عراقي صالح (مثال: 07701234567)');
      return;
    }

    setIsLoading(true);
    try {
      // 1. التحقق من وجود الرقم والدور في النظام
      const { data: checkData } = await http.get<{
        exists: boolean;
        role?: 'Customer' | 'Driver' | null;
        roleAr?: string;
        name?: string;
        error?: string;
      }>(`/auth/check-phone?phone=${encodeURIComponent(cleanPhone)}`);

      if (checkData.exists) {
        const userRole = checkData.role || 'Customer';
        setDetectedRole(userRole);

        // محاولة تسجيل الدخول المباشر بالرقم المحفوظ
        try {
          const { data: loginData } = await http.post<{
            success: boolean;
            token: string;
            userId: string;
            role: string;
            fullName: string;
            error?: string;
            isBlocked?: boolean;
          }>('/auth/login', {
            identifier: cleanPhone,
            role: userRole,
            autoOtpLogin: true,
            password: 'auto-generated',
          });

          if (loginData.success && loginData.token) {
            authStore.save(
              {
                token: loginData.token,
                userId: loginData.userId,
                role: (loginData.role as Session['role']) || userRole,
                fullName: loginData.fullName || checkData.name || 'مستخدم توصيله',
              },
              cleanPhone
            );
            show(`أهلاً بك مجدداً يا ${loginData.fullName || 'كابتن'} 🚖`, 'success');

            if (userRole === 'Driver') {
              navigateAfterLogin('Driver');
            } else {
              setIsLoading(false);
              setStep('service_select');
            }
            return;
          } else if (loginData.isBlocked) {
            setErrorMessage(loginData.error || 'تم تعليق هذا الحساب من قبل إدارة المنصة.');
            setIsLoading(false);
            return;
          }
        } catch (loginErr: any) {
          if (loginErr?.response?.data?.isBlocked) {
            setErrorMessage(loginErr.response.data.error || 'تم تعليق هذا الحساب من قبل إدارة المنصة.');
            setIsLoading(false);
            return;
          }
        }
      }

      // 2. إرسال رمز التحقق عبر واتساب
      try {
        await http.post('/auth/send-whatsapp-otp', {
          phone: cleanPhone,
          phoneNumber: cleanPhone,
          role: checkData.role || 'Customer',
        });
        show('تم إرسال رمز التحقق إلى واتساب 📲', 'success');
      } catch (_) {
        await http.post('/auth/send-otp', {
          phoneNumber: cleanPhone,
          role: checkData.role || 'Customer',
        });
        show('تم إرسال رمز التحقق إلى واتساب 📲', 'success');
      }

      setStep('otp');
    } catch (err: any) {
      const serverErr = err?.response?.data?.error;
      setErrorMessage(serverErr || 'تعذر الاتصال بالخادم. تأكد من اتصال الإنترنت.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleVerifyOtp(code: string) {
    if (isLoading) return;
    setErrorMessage(null);
    setIsLoading(true);

    const cleanCode = normalizeArabicDigits(code).replace(/[^0-9]/g, '');
    const cleanPhone = normalizePhone(phone);
    try {
      try {
        await http.post('/auth/verify-whatsapp-otp', {
          phone: cleanPhone,
          phoneNumber: cleanPhone,
          code: cleanCode,
          otp: cleanCode,
          role: detectedRole,
        });
      } catch (_) {
        await http.post('/auth/verify-otp', {
          phoneNumber: cleanPhone,
          code: cleanCode,
          otp: cleanCode,
          role: detectedRole,
        });
      }

      // بعد نجاح التحقق، تسجيل الدخول
      try {
        const { data: loginData } = await http.post<{
          success: boolean;
          token: string;
          userId: string;
          role: string;
          fullName: string;
          notFound?: boolean;
          error?: string;
        }>('/auth/login', {
          identifier: cleanPhone,
          role: detectedRole,
          autoOtpLogin: true,
        });

        if (loginData.success && loginData.token) {
          authStore.save(
            {
              token: loginData.token,
              userId: loginData.userId,
              role: (loginData.role as Session['role']) || detectedRole,
              fullName: loginData.fullName || 'مستخدم توصيله',
            },
            cleanPhone
          );
          show('تم التحقق بنجاح ✅', 'success');

          if (detectedRole === 'Driver') {
            navigateAfterLogin('Driver');
          } else {
            // التحقق مما إذا كان حساب التيليجرام مربوطاً بالفعل
            try {
              const tgRes = await http.get<{
                success: boolean;
                linked: boolean;
              }>(`/auth/check-telegram-linked?phone=${encodeURIComponent(cleanPhone)}&userId=${encodeURIComponent(loginData.userId)}`);

              if (tgRes.data?.linked) {
                setIsLoading(false);
                setStep('service_select');
              } else {
                setIsLoading(false);
                setStep('telegram_link');
              }
            } catch (_) {
              setIsLoading(false);
              setStep('telegram_link');
            }
          }
          return;
        }

        if (loginData.notFound) {
          setStep('profile');
          return;
        }
      } catch (err: any) {
        if (err?.response?.data?.notFound) {
          setStep('profile');
          return;
        }
      }

      setStep('profile');
    } catch (err: any) {
      const serverErr = err?.response?.data?.error;
      setErrorMessage(serverErr || 'رمز التحقق غير صحيح أو منتهي الصلاحية');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCheckTelegramLinked() {
    if (isCheckingTelegram) return;
    setIsCheckingTelegram(true);
    setTelegramAlert(null);
    const cleanPhone = normalizePhone(phone);
    const currentUserId = session?.userId || storage.getUserId() || '';

    try {
      const res = await http.get<{
        success: boolean;
        linked: boolean;
        telegramChatId?: string;
        telegramUsername?: string;
      }>(`/auth/check-telegram-linked?phone=${encodeURIComponent(cleanPhone)}&userId=${encodeURIComponent(currentUserId)}`);

      if (res.data?.linked) {
        show('تم التحقق من ربط بوت التيليجرام بنجاح! مرحباً بك 🚖', 'success');
        setStep('service_select');
      } else {
        setTelegramAlert('يرجى الضغط على Start داخل البوت أولاً لإتمام التفعيل');
        show('يرجى الضغط على Start داخل البوت أولاً لإتمام التفعيل', 'info');
      }
    } catch (_) {
      setTelegramAlert('يرجى التأكد من الضغط على Start داخل البوت والمحاولة مجدداً');
      show('يرجى الضغط على Start داخل البوت أولاً لإتمام التفعيل', 'info');
    } finally {
      setIsCheckingTelegram(false);
    }
  }

  async function handleResendOtp() {
    if (isResending) return;
    setIsResending(true);
    setErrorMessage(null);
    const cleanPhone = normalizePhone(phone);
    try {
      await http.post('/auth/send-whatsapp-otp', {
        phone: cleanPhone,
        phoneNumber: cleanPhone,
        role: detectedRole,
      });
      show('تمت إعادة إرسال رمز التحقق عبر واتساب 📲', 'success');
    } catch (_) {
      show('تعذر إعادة الإرسال حالياً', 'error');
    } finally {
      setIsResending(false);
    }
  }

  async function handleCompleteProfile(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (isLoading) return;
    if (!fullName.trim()) {
      setErrorMessage('يرجى إدخال اسمك الكريم');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    const cleanPhone = normalizePhone(phone);

    try {
      const { data } = await http.post<{
        success: boolean;
        token?: string;
        userId?: string;
        role?: string;
        fullName?: string;
        error?: string;
      }>('/auth/complete-passenger-registration', {
        fullName: fullName.trim(),
        phoneNumber: cleanPhone,
        password: 'auto-generated',
        route: 'النجف الأشرف',
        address: 'النجف الأشرف',
      });

      if (data.success && data.token) {
        authStore.save(
          {
            token: data.token,
            userId: data.userId || 'usr-' + Date.now(),
            role: (data.role as Session['role']) || 'Customer',
            fullName: data.fullName || fullName.trim(),
          },
          cleanPhone
        );
        show('تم إنشاء حسابك بنجاح! مرحباً بك في توصيلة 🚖', 'success');
        setStep('telegram_link');
      } else {
        setErrorMessage(data.error || 'حدث خطأ أثناء إكمال التسجيل');
      }
    } catch (err: any) {
      const serverErr = err?.response?.data?.error;
      setErrorMessage(serverErr || 'فشل إكمال التسجيل. حاول مرة أخرى.');
    } finally {
      setIsLoading(false);
    }
  }

  // إذا تم اختيار الخدمة والانتقال للهب الرئيسي
  if (step === 'service_select') {
    return (
      <Suspense fallback={<div className="min-h-[100dvh] flex items-center justify-center bg-[#080E1A]"><Spinner className="w-8 h-8 text-amber-400" /></div>}>
        <CustomerHub onSelectService={handleSelectService} />
      </Suspense>
    );
  }

  // واجهة تأكيد رمز التحقق (OTP) الفاخرة
  if (step === 'otp') {
    return (
      <div className="relative w-full min-h-[100dvh] flex items-center justify-center p-3 sm:p-6 bg-[#080E1A] text-[#DDE2F4] overflow-x-hidden font-cairo" dir="rtl">
        {/* هالات التوهج الضبابية المحيطية في الخلفية */}
        <div className="absolute top-1/4 -right-24 w-96 h-96 rounded-full bg-amber-500/10 blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-10 -left-20 w-80 h-80 rounded-full bg-orange-600/10 blur-[100px] pointer-events-none"></div>

        <OtpVerificationView
          phone={phone}
          onBack={() => {
            setStep('phone');
            setErrorMessage(null);
          }}
          onVerify={handleVerifyOtp}
          onResend={handleResendOtp}
          isLoading={isLoading}
          errorMessage={errorMessage}
        />
      </div>
    );
  }

  return (
    <div className="relative w-full min-h-[100dvh] flex items-center justify-center p-3 sm:p-6 bg-[#080E1A] text-[#DDE2F4] overflow-x-hidden font-cairo" dir="rtl">
      {/* هالات التوهج الضبابية المحيطية في الخلفية */}
      <div className="absolute top-1/4 -right-24 w-96 h-96 rounded-full bg-amber-500/10 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-10 -left-20 w-80 h-80 rounded-full bg-orange-600/10 blur-[100px] pointer-events-none"></div>

      {/* الحاوية المركزية الفاخرة */}
      <div className="relative z-10 w-full max-w-[430px] mx-auto flex flex-col gap-4">
        
        {/* البطاقة الزجاجية المعتمة */}
        <div className="w-full bg-[#161C28]/90 backdrop-blur-2xl rounded-3xl border border-white/5 shadow-2xl p-6 flex flex-col gap-5 relative overflow-hidden">
          {/* خط التوهج الذهبي العلوي */}
          <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400 to-transparent opacity-80"></div>

          {/* ترويسة الشعار مع حركة الدخول من اليمين */}
          <div className="flex flex-col items-center text-center pt-1">
            <div className="relative mb-2 flex items-center justify-center animate-logo-entrance">
              <img 
                src="/logo.png?v=40" 
                alt="شعار توصيلة" 
                className="h-20 w-auto max-w-[200px] object-contain drop-shadow-md"
              />
            </div>
            
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 text-amber-400 text-xs font-semibold mb-2 shadow-sm border border-amber-500/15">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>النسخة الحصرية • النجف الأشرف</span>
            </div>
            
            <h1 className="text-2xl font-bold text-white tracking-tight font-alexandria">
              أهلاً بك في <span className="text-amber-400">توصيلة</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1">ياهلا بيكم وين تردون نوديكم</p>
          </div>

          {/* محدد الأدوار: أنا راكب / أنا كابتن */}
          <div className="relative w-full p-1 bg-[#1A202C] rounded-2xl flex items-center justify-between shadow-inner">
            <button 
              type="button"
              onClick={() => {
                setRole('passenger');
                setErrorMessage(null);
              }}
              className={`relative z-10 flex-1 py-3 px-2 rounded-xl text-sm font-bold transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer ${
                role === 'passenger' 
                  ? 'text-slate-950 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 shadow-md' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span className="text-base">🧳</span>
              <span>أنا راكب</span>
            </button>

            <button 
              type="button"
              onClick={() => {
                setRole('driver');
                setErrorMessage(null);
              }}
              className={`relative z-10 flex-1 py-3 px-2 rounded-xl text-sm font-bold transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer ${
                role === 'driver' 
                  ? 'text-slate-950 bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 shadow-md' 
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span className="text-base">🚖</span>
              <span>أنا كابتن / سائق</span>
            </button>
          </div>

          {/* رسالة الخطأ إن وجدت */}
          {errorMessage && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/40 p-3 text-center text-xs font-bold text-rose-300 animate-fade-in">
              {errorMessage}
            </div>
          )}

          {/* 1. مسار الراكب: إدخال الرقم والـ OTP */}
          {role === 'passenger' && (
            <div className="flex flex-col gap-4 animate-fade-in">
              {/* الخطوة 1: إدخال رقم الهاتف */}
              {step === 'phone' && (
                <form onSubmit={handleSubmitPhone} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between px-1">
                      <label className="text-xs font-bold text-slate-200">رقم الهاتف العراقي</label>
                      <span className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
                        🛡️ تسجيل سريع وآمن
                      </span>
                    </div>

                    {/* صندوق إدخال الهاتف المطور */}
                    <div className="relative flex items-center w-full bg-[#242A37] border border-slate-700/60 rounded-2xl p-1.5 focus-within:ring-2 focus-within:ring-amber-500/70 focus-within:border-amber-500 transition-all shadow-inner">
                      {/* شارة كود العراق */}
                      <div className="flex items-center gap-1.5 px-3 py-2 bg-[#1A202C] rounded-xl text-white select-none">
                        <span className="text-base">🇮🇶</span>
                        <span className="text-xs font-mono font-bold tracking-wider" dir="ltr">+964</span>
                      </div>
                      
                      {/* حقل الإدخال */}
                      <input 
                        type="tel"
                        inputMode="tel"
                        dir="ltr"
                        placeholder="07XXXXXXXX"
                        value={phone}
                        onChange={(e) => handlePhoneChange(e.target.value)}
                        className="w-full bg-transparent border-0 outline-none px-3 py-2 text-white font-mono text-lg font-bold text-left placeholder:text-slate-500"
                        autoFocus
                      />

                      {phone && (
                        <button 
                          type="button" 
                          onClick={() => setPhone('')} 
                          className="p-2 text-slate-400 hover:text-white transition-colors cursor-pointer"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* زر المتابعة */}
                  <button 
                    type="submit"
                    disabled={isLoading || !phone.trim()}
                    className="w-full min-h-[52px] rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-slate-950 font-bold text-base shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform duration-150 disabled:opacity-60 cursor-pointer"
                  >
                    {isLoading ? (
                      <span className="animate-pulse">جاري التحقق...</span>
                    ) : (
                      <>
                        <span>متابعة 🚖</span>
                        <span>←</span>
                      </>
                    )}
                  </button>

                  {/* رابط الشروط والخصوصية */}
                  <div className="text-center pt-1">
                    <p className="text-xs text-slate-400">
                      بالمتابعة أنت توافق على{' '}
                      <button 
                        type="button" 
                        onClick={() => setTermsModalTab('terms')} 
                        className="text-amber-400 hover:underline font-semibold cursor-pointer"
                      >
                        شروط الخدمة
                      </button>
                      {' '}و{' '}
                      <button 
                        type="button" 
                        onClick={() => setTermsModalTab('privacy')} 
                        className="text-amber-400 hover:underline font-semibold cursor-pointer"
                      >
                        سياسة الخصوصية
                      </button>
                    </p>
                  </div>
                </form>
              )}

              {/* الخطوة 3: إدخال اسم الراكب الجديد */}
              {step === 'profile' && (
                <form onSubmit={handleCompleteProfile} className="flex flex-col gap-4 animate-fade-in text-right">
                  <div>
                    <h2 className="text-lg font-bold text-white mb-1">
                      إنشاء حساب راكب جديد
                    </h2>
                    <p className="text-xs text-slate-300">
                      أدخل اسمك الكريم للمتابعة وحجز رحلاتك
                    </p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-bold text-slate-200">الاسم الكامل</label>
                    <input
                      type="text"
                      dir="rtl"
                      value={fullName}
                      onChange={(e) => {
                        setErrorMessage(null);
                        setFullName(e.target.value);
                      }}
                      placeholder="مثال: علي الموسوي"
                      autoFocus
                      className="w-full bg-[#242A37] border border-slate-700/80 rounded-2xl p-3 text-white font-bold text-base outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-500/20 transition-all placeholder:text-slate-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || !fullName.trim()}
                    className="w-full min-h-[52px] rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-slate-950 font-bold text-base shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform duration-150 disabled:opacity-60 cursor-pointer"
                  >
                    {isLoading ? (
                      <span className="animate-pulse">جاري الحفظ...</span>
                    ) : (
                      <>
                        <span>إكمال التسجيل والدخول</span>
                        <span>🚖</span>
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* الخطوة 4: توثيق بوت التيليجرام الإلزامي */}
              {step === 'telegram_link' && (
                <div className="flex flex-col gap-4 animate-fade-in text-right">
                  {/* شارة الترويسة الإلزامية */}
                  <div className="flex justify-center">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-400 text-xs font-bold shadow-sm">
                      <span>🛡️</span>
                      <span>خطوة أمان إلزامية • توثيق الحساب</span>
                    </div>
                  </div>

                  <div className="text-center">
                    <h2 className="text-xl font-bold text-white mb-1.5">
                      تفعيل إشعارات رحلاتك عبر التيليجرام ✈️
                    </h2>
                    <p className="text-xs text-slate-300 leading-relaxed max-w-sm mx-auto">
                      لضمان وصول إشعارات وصول الكابتن، تفاصيل المركبة، والتسعيرة الرسمية، يتوجب عليك تفعيل البوت الرسمي للمنظومة قبل بدء استخدام التطبيق.
                    </p>
                  </div>

                  {/* مميزات التفعيل */}
                  <div className="bg-[#1A202C] border border-sky-500/20 rounded-2xl p-3.5 space-y-2 text-xs">
                    <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                      <span>✓</span>
                      <span>إشعار فوري وصوت هورن "بيب بيب" عند وصول الكابتن</span>
                    </div>
                    <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                      <span>✓</span>
                      <span>تفاصيل سيارة الكابتن ورقم اللوحة بأمان</span>
                    </div>
                    <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                      <span>✓</span>
                      <span>تأكيد التسعيرة الرسمية للرحلة بدون أي زيادة</span>
                    </div>
                  </div>

                  {/* تنبيه حالة الربط إن وجد */}
                  {telegramAlert && (
                    <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs text-center font-bold animate-shake">
                      ⚠️ {telegramAlert}
                    </div>
                  )}

                  {/* أزرار الإجراء: فتح البوت أولاً ثم التحقق والاستمرار (بدون أي خيار تخطي) */}
                  <div className="flex flex-col gap-3 pt-1">
                    {/* الزر الأول: فتح البوت */}
                    <a
                      href={`https://t.me/tawseela_najaf_bot?start=${encodeURIComponent(normalizePhone(phone))}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full min-h-[50px] py-3.5 px-4 rounded-2xl bg-[#0088CC] hover:bg-[#0077B5] text-white font-bold text-sm shadow-lg shadow-sky-600/25 flex items-center justify-center gap-2 active:scale-[0.98] transition-all no-underline cursor-pointer"
                    >
                      <span className="text-xl">🤖</span>
                      <span>فتح بوت توصيلة والتفعيل</span>
                    </a>

                    {/* الزر الثاني: التحقق والاستمرار */}
                    <button
                      type="button"
                      disabled={isCheckingTelegram}
                      onClick={handleCheckTelegramLinked}
                      className="w-full min-h-[50px] py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-400 to-amber-600 hover:from-amber-300 hover:to-amber-500 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-all disabled:opacity-60 cursor-pointer"
                    >
                      {isCheckingTelegram ? (
                        <span className="animate-pulse">جاري التحقق من التفعيل في البوت...</span>
                      ) : (
                        <>
                          <span>تم التفعيل في البوت.. دخول للتطبيق</span>
                          <span>🚖</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 2. مسار الكابتن: بطاقة الانضمام والتواصل المباشر */}
          {role === 'driver' && (
            <div className="flex flex-col gap-4 animate-fade-in text-right">
              <div className="bg-[#1A202C] rounded-2xl p-4 flex flex-col gap-2 relative overflow-hidden border border-white/5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-xl shrink-0">
                    🛡️
                  </div>
                  <div className="flex flex-col">
                    <h3 className="text-base font-bold text-white">بوابة انضمام الكباتن</h3>
                    <span className="text-xs text-amber-400">اعتماد النخبة • تدقيق رسمي</span>
                  </div>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed mt-1">
                  انضمام الكباتن يتم حصرياً عبر الإدارة المركزية لضمان أعلى معايير الأمان وفحص المركبات لحماية العائلات والزائرين في النجف.
                </p>
                <div className="flex items-center gap-2 pt-1 text-emerald-400 text-xs font-semibold">
                  <span>🌟</span>
                  <span>أعلى نسبة أرباح للمشاوير في النجف الأشرف والكوفة</span>
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                <span className="text-xs text-slate-400 px-1 font-semibold">تواصل مباشر مع مسؤولي التسجيل:</span>
                
                {/* زر واتساب */}
                <a 
                  href="https://wa.me/9647722154182?text=تحية%20طيبة،%20أرغب%20بالانضمام%20ككابتن%20في%20توصيلة%20النجف" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full min-h-[50px] py-3 px-4 rounded-2xl bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#25D366] border border-[#25D366]/30 font-bold flex items-center justify-between transition-all active:scale-[0.98] no-underline"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">💬</span>
                    <span className="text-sm">تفعيل الحساب عبر واتساب (WhatsApp)</span>
                  </div>
                  <span>←</span>
                </a>

                {/* زر تيليجرام */}
                <a 
                  href="https://t.me/wsam_ta" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="w-full min-h-[50px] py-3 px-4 rounded-2xl bg-[#0088CC]/15 hover:bg-[#0088CC]/25 text-[#29B6F6] border border-[#0088CC]/30 font-bold flex items-center justify-between transition-all active:scale-[0.98] no-underline"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">✈️</span>
                    <span className="text-sm">المكتب الرقمي تيليجرام (@wsam_ta)</span>
                  </div>
                  <span>←</span>
                </a>

                {/* الاتصال الهاتفي المباشر */}
                <a 
                  href="tel:07722154182"
                  className="w-full min-h-[48px] py-2.5 px-4 rounded-2xl bg-[#1A202C] hover:bg-[#242A37] text-slate-300 font-bold flex items-center justify-between transition-all active:scale-[0.98] border border-white/5 no-underline"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📞</span>
                    <span className="text-xs">اتصال هاتفي مباشر</span>
                  </div>
                  <span dir="ltr" className="font-mono text-xs text-amber-400 font-bold">07722154182</span>
                </a>
              </div>

              <button 
                type="button"
                onClick={() => setRole('passenger')}
                className="w-full py-2 text-center text-xs text-slate-400 hover:text-amber-400 transition-colors cursor-pointer"
              >
                العودة لواجهة الركاب
              </button>
            </div>
          )}
        </div>

        {/* شريط تثبيت ومشاركة التطبيق الفوري الذكي (PWA Smart Install & Share) */}
        {!isPwaDismissed && (
          <div className="w-full bg-[#161C28]/95 backdrop-blur-xl rounded-2xl p-4 shadow-xl border border-amber-500/20 flex flex-col gap-3 relative">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-slate-950 flex items-center justify-center font-bold text-base shadow-sm">
                  ⚡
                </div>
                <div className="flex flex-col text-right">
                  <h4 className="text-xs font-bold text-white">تثبيت ومشاركة التطبيق الفوري (PWA)</h4>
                  <p className="text-[11px] text-slate-400">يعمل كأي تطبيق أصلي بدون الحاجة للمتجر وبسرعة فائقة</p>
                </div>
              </div>
              <button 
                type="button"
                onClick={dismissPwa}
                className="min-h-[48px] min-w-[48px] flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer rounded-xl active:scale-95"
                title="إغلاق التنبيه"
                aria-label="إغلاق التنبيه"
              >
                ✕
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-2.5 pt-0.5">
              {/* زر مشاركة الرابط عبر Web Share API */}
              <button
                type="button"
                onClick={handleShareApp}
                className="min-h-[48px] w-full px-3 py-2.5 rounded-xl bg-[#080E1A] hover:bg-[#1A202C] active:scale-[0.98] border border-slate-700/60 text-slate-200 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs"
              >
                <span className="text-base text-sky-400">⎋</span>
                <span>مشاركة الرابط</span>
              </button>

              {/* زر إضافة للشاشة عبر Native PWA Prompt / iOS Guidance */}
              <button
                type="button"
                onClick={handleInstallApp}
                className="min-h-[48px] w-full px-3 py-2.5 rounded-xl bg-gradient-to-l from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 active:scale-[0.98] text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-md shadow-amber-500/10"
              >
                <span className="text-sm">➕</span>
                <span>إضافة للشاشة</span>
              </button>
            </div>
          </div>
        )}

        {/* شارات الأمان والترخيص السفلي */}
        <div className="flex items-center justify-center gap-4 text-slate-500 text-[11px] pb-6">
          <span>🔒 تشفير كامل للبيانات</span>
          <span>•</span>
          <span>🚖 ترخيص رسمي</span>
          <span>•</span>
          <span>النجف • الكوفة</span>
        </div>
      </div>

      {/* نافذة إرشاد التثبيت لـ iOS */}
      {showIosPrompt && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-fade-in font-cairo"
          onClick={() => setShowIosPrompt(false)}
        >
          <div 
            className="w-full max-w-sm bg-[#161C28] rounded-3xl p-5 border border-amber-500/30 text-white flex flex-col gap-4 text-right shadow-2xl animate-sheet-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-700/50">
              <div className="flex items-center gap-2">
                <span className="text-xl">🍎</span>
                <h3 className="font-bold text-sm text-white">تثبيت التطبيق على آيفون (iOS)</h3>
              </div>
              <button 
                onClick={() => setShowIosPrompt(false)} 
                className="min-h-[48px] min-w-[48px] rounded-xl bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center cursor-pointer"
                aria-label="إغلاق"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-3 text-xs leading-relaxed text-slate-300">
              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#080E1A]/80 border border-slate-700/50">
                <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold shrink-0">١</span>
                <p>اضغط على زر المشاركة <span className="text-sky-400 font-bold">⎋ (Share)</span> في شريط سفاري السفلي.</p>
              </div>
              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#080E1A]/80 border border-slate-700/50">
                <span className="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold shrink-0">٢</span>
                <p>مرر للأسفل بالقائمة واختر <span className="text-amber-400 font-bold">«إضافة إلى الصفحة الرئيسية ➕»</span>.</p>
              </div>
              <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#080E1A]/80 border border-slate-700/50">
                <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold shrink-0">٣</span>
                <p>اضغط على <span className="text-emerald-400 font-bold">«إضافة (Add)»</span> أعلى اليمين ليظهر التطبيق في شاشتك الرئيسية فوراً!</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowIosPrompt(false)}
              className="w-full min-h-[48px] rounded-xl bg-gradient-to-l from-amber-400 to-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center cursor-pointer shadow-md"
            >
              فهمت ذلك 👍
            </button>
          </div>
        </div>
      )}

      {/* نافذة شروط الاستخدام وسياسة الخصوصية المنبثقة */}
      <TermsPrivacyModal
        isOpen={Boolean(termsModalTab)}
        initialTab={termsModalTab || 'terms'}
        onClose={() => setTermsModalTab(null)}
      />
    </div>
  );
}
