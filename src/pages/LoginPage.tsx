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

  // Phone check state for real-time pre-check
  const [phoneStatus, setPhoneStatus] = useState<{
    checked: boolean;
    checking: boolean;
    exists: boolean;
    role: 'passenger' | 'driver' | null;
    name?: string | null;
    message: string;
  }>({
    checked: false,
    checking: false,
    exists: false,
    role: null,
    name: null,
    message: '',
  });

  // التحقق التلقائي الذكي عند الإدخال (Debounced Phone Check - 350ms)
  useEffect(() => {
    const cleanPhone = normalizeArabicDigits(phone).replace(/[^0-9]/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
      setPhoneStatus({
        checked: false,
        checking: false,
        exists: false,
        role: null,
        name: null,
        message: '',
      });
      return;
    }

    setPhoneStatus((prev) => ({ ...prev, checking: true }));

    const timer = setTimeout(async () => {
      try {
        const { data } = await http.post<{
          exists: boolean;
          role?: string | null;
          roleAr?: string;
          name?: string;
          message?: string;
        }>('/auth/check-phone', { phone: cleanPhone });

        const rawRole = (data?.role || '').toLowerCase();
        const normRole: 'passenger' | 'driver' | null =
          rawRole === 'driver' ? 'driver' : rawRole === 'passenger' || rawRole === 'customer' ? 'passenger' : null;

        setPhoneStatus({
          checked: true,
          checking: false,
          exists: !!data?.exists,
          role: normRole,
          name: data?.name || null,
          message: data?.message || (data?.exists ? (normRole === 'driver' ? 'هذا الرقم مسجل مسبقاً ككابتن معتمد 🚖' : 'هذا الرقم مسجل مسبقاً كراكب 👋') : 'رقم جديد.. أهلاً بك في عائلة توصيلة ✨'),
        });

        if (normRole === 'driver') {
          setDetectedRole('Driver');
          setRole('driver');
        } else if (normRole === 'passenger') {
          setDetectedRole('Customer');
        }
      } catch (_) {
        // Fallback: حاول عبر GET
        try {
          const { data } = await http.get<{
            exists: boolean;
            role?: string | null;
            roleAr?: string;
            name?: string;
            message?: string;
          }>(`/auth/check-phone?phone=${encodeURIComponent(cleanPhone)}`);

          const rawRole = (data?.role || '').toLowerCase();
          const normRole: 'passenger' | 'driver' | null =
            rawRole === 'driver' ? 'driver' : rawRole === 'passenger' || rawRole === 'customer' ? 'passenger' : null;

          setPhoneStatus({
            checked: true,
            checking: false,
            exists: !!data?.exists,
            role: normRole,
            name: data?.name || null,
            message: data?.message || (data?.exists ? (normRole === 'driver' ? 'هذا الرقم مسجل مسبقاً ككابتن معتمد 🚖' : 'هذا الرقم مسجل مسبقاً كراكب 👋') : 'رقم جديد.. أهلاً بك في عائلة توصيلة ✨'),
          });

          if (normRole === 'driver') {
            setDetectedRole('Driver');
            setRole('driver');
          } else if (normRole === 'passenger') {
            setDetectedRole('Customer');
          }
        } catch (__) {
          setPhoneStatus((prev) => ({ ...prev, checking: false }));
        }
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [phone]);

  const navigateAfterLogin = (userRole: string) => {
    const urlParams = new URLSearchParams(window.location.search);
    const redirect = urlParams.get('redirect');
    if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
      navigate(redirect, { replace: true });
      return;
    }
    navigate(userRole?.toLowerCase() === 'driver' ? '/drive' : '/hub', { replace: true });
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
      navigate('/taxi', { replace: true, state: { serviceType: type } });
    }
  }

  // الدخول الفوري والمباشر للمستخدمين المسجلين (كابتن أو راكب) دون إرسال كود واتساب
  async function handleDirectLogin() {
    if (isLoading) return;
    setErrorMessage(null);
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone || cleanPhone.replace(/[^0-9]/g, '').length < 10) {
      setErrorMessage('يرجى إدخال رقم هاتف عراقي صالح (مثال: 07701234567)');
      return;
    }

    setIsLoading(true);
    try {
      const targetRole = (phoneStatus.role === 'driver' || role === 'driver') ? 'driver' : 'passenger';
      const { data } = await http.post<{
        success: boolean;
        direct: boolean;
        token: string;
        role: string;
        userId?: string;
        fullName?: string;
        user?: any;
        redirect?: string;
        error?: string;
      }>('/auth/direct-login', {
        phone: cleanPhone,
        phoneNumber: cleanPhone,
        requestedRole: targetRole,
      });

      if (data.success && data.token) {
        const finalRole = (data.role === 'Driver' || data.role === 'driver') ? 'Driver' : 'Customer';
        authStore.save(
          {
            token: data.token,
            userId: data.userId || data.user?.id || (finalRole === 'Driver' ? 'drv-' : 'usr-') + Date.now(),
            role: finalRole,
            fullName: data.fullName || data.user?.fullName || phoneStatus.name || (finalRole === 'Driver' ? 'كابتن توصيلة' : 'مستخدم توصيلة'),
          },
          cleanPhone
        );

        show(
          finalRole === 'Driver'
            ? `أهلاً بك يا كابتن ${data.fullName || phoneStatus.name || ''} 🚖`
            : `مرحباً بك مجدداً ${data.fullName || phoneStatus.name || ''} 👋`,
          'success'
        );

        navigateAfterLogin(finalRole);
        return;
      }

      if (data.error) {
        setErrorMessage(data.error);
      }
    } catch (err: any) {
      const serverErr = err?.response?.data?.error;
      setErrorMessage(serverErr || 'تعذر تسجيل الدخول المباشر. يرجى المحاولة لاحقاً.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSubmitPhone(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (isLoading) return;
    setErrorMessage(null);

    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone || cleanPhone.replace(/[^0-9]/g, '').length < 10) {
      setErrorMessage('يرجى إدخال رقم هاتف عراقي صالح (مثال: 07701234567)');
      return;
    }

    // إذا كان الرقم مسجلاً مسبقاً (سائق أو راكب): دخول فوري ومباشر دون إرسال كود
    if (phoneStatus.checked && phoneStatus.exists) {
      return handleDirectLogin();
    }

    // إذا كان المستخدم في تبويب الكابتن والرقم غير مسجل: حظر فوري ومنع إرسال كود الواتساب
    if (role === 'driver' || phoneStatus.role === 'driver') {
      if (phoneStatus.checked && (!phoneStatus.exists || phoneStatus.role !== 'driver')) {
        setErrorMessage('عذراً، هذا الرقم غير مسجل ككابتن معتمد. يرجى مراجعة إدارة المنصة للتسجيل والتدريب.');
        return;
      }
    }

    setIsLoading(true);
    try {
      // 1. التحقق الفوري إذا لم يكن الفحص المسبق مكتملاً
      let currentCheck = phoneStatus;
      if (!currentCheck.checked) {
        try {
          const { data: checkData } = await http.post<{
            exists: boolean;
            role?: string | null;
            roleAr?: string;
            name?: string;
            message?: string;
          }>('/auth/check-phone', { phone: cleanPhone });

          const rawRole = (checkData?.role || '').toLowerCase();
          const normRole: 'passenger' | 'driver' | null =
            rawRole === 'driver' ? 'driver' : rawRole === 'passenger' || rawRole === 'customer' ? 'passenger' : null;

          currentCheck = {
            checked: true,
            checking: false,
            exists: !!checkData?.exists,
            role: normRole,
            name: checkData?.name || null,
            message: checkData?.message || '',
          };
          setPhoneStatus(currentCheck);
        } catch (_) {}
      }

      // إذا تبين بعد الفحص أنه مسجل مسبقاً: دخول مباشر فوري
      if (currentCheck.exists) {
        setIsLoading(false);
        return handleDirectLogin();
      }

      // إذا كان في وضع الكابتن وهو غير مسجل: حظر فوري
      if (role === 'driver') {
        setIsLoading(false);
        setErrorMessage('عذراً، هذا الرقم غير مسجل ككابتن معتمد. يرجى مراجعة إدارة المنصة للتسجيل والتدريب.');
        return;
      }

      const activeUserRole: 'Driver' | 'Customer' = 'Customer';
      setDetectedRole(activeUserRole);

      // 2. إرسال رمز التحقق عبر واتساب حصراً للركاب الجدد
      try {
        await http.post('/auth/send-whatsapp-otp', {
          phone: cleanPhone,
          phoneNumber: cleanPhone,
          role: activeUserRole,
        });
        show('تم إرسال رمز التحقق إلى واتساب 📲', 'success');
      } catch (err: any) {
        if (err?.response?.data?.alreadyRegistered) {
          setIsLoading(false);
          return handleDirectLogin();
        }
        await http.post('/auth/send-otp', {
          phoneNumber: cleanPhone,
          role: activeUserRole,
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
    const targetRole: 'Driver' | 'Customer' = (phoneStatus.role === 'driver' || detectedRole === 'Driver') ? 'Driver' : 'Customer';

    try {
      try {
        await http.post('/auth/verify-whatsapp-otp', {
          phone: cleanPhone,
          phoneNumber: cleanPhone,
          code: cleanCode,
          otp: cleanCode,
          role: targetRole,
        });
      } catch (_) {
        await http.post('/auth/verify-otp', {
          phoneNumber: cleanPhone,
          code: cleanCode,
          otp: cleanCode,
          role: targetRole,
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
          role: targetRole,
          autoOtpLogin: true,
        });

        if (loginData.success && loginData.token) {
          const finalRole = (loginData.role as Session['role']) || targetRole;
          authStore.save(
            {
              token: loginData.token,
              userId: loginData.userId,
              role: finalRole,
              fullName: loginData.fullName || phoneStatus.name || (finalRole === 'Driver' ? 'كابتن توصيلة' : 'مستخدم توصيلة'),
            },
            cleanPhone
          );
          show(`تم التحقق بنجاح! مرحباً بك يا ${loginData.fullName || (finalRole === 'Driver' ? 'كابتن' : 'راكب')} ✅`, 'success');

          if (finalRole === 'Driver') {
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
          if (targetRole === 'Driver') {
            show('هذا الرقم غير مسجل ككابتن معتمد بعد، يرجى التواصل مع الإدارة للتفعيل.', 'info');
            setIsLoading(false);
            setStep('phone');
            return;
          }
          setStep('profile');
          return;
        }
      } catch (err: any) {
        if (err?.response?.data?.notFound) {
          if (targetRole === 'Driver') {
            show('هذا الرقم غير مسجل ككابتن معتمد بعد، يرجى التواصل مع الإدارة للتفعيل.', 'info');
            setIsLoading(false);
            setStep('phone');
            return;
          }
          setStep('profile');
          return;
        }
      }

      if (targetRole === 'Driver') {
        navigateAfterLogin('Driver');
      } else {
        setStep('profile');
      }
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
    <div 
      className="w-full min-h-[100dvh] bg-[#080E1A] text-[#DDE2F4] flex flex-col justify-center items-center px-4 py-6 font-cairo relative overflow-x-hidden" 
      style={{ touchAction: 'pan-y' }}
      dir="rtl"
    >
      {/* هالات التوهج الضبابية المحيطية في الخلفية */}
      <div className="absolute top-1/4 -right-24 w-96 h-96 rounded-full bg-amber-500/10 blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-10 -left-20 w-80 h-80 rounded-full bg-orange-600/10 blur-[100px] pointer-events-none"></div>

      {/* الحاوية المركزية الفاخرة */}
      <div className="relative z-10 w-full max-w-md mx-auto flex flex-col items-center gap-4">
        
        {/* البطاقة الزجاجية الأوبسيديانية الفاخرة */}
        <div className="w-full bg-[#161C28]/95 backdrop-blur-2xl p-6 rounded-3xl border border-amber-500/20 shadow-2xl flex flex-col gap-5 relative overflow-hidden">
          {/* خط التوهج الذهبي العلوي */}
          <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400 to-transparent opacity-80"></div>

          {/* ترويسة الشعار المحصورة بحاوية محكمة ومقيدة بدقة */}
          <div className="flex flex-col items-center text-center pt-1">
            <div className="w-full flex items-center justify-center my-3 overflow-hidden">
              <img 
                src="/logo.png?v=40" 
                alt="شعار توصيلة" 
                className="h-14 sm:h-16 w-auto max-w-[160px] object-contain drop-shadow-md select-none" 
                style={{ maxHeight: '64px', maxWidth: '160px', width: 'auto' }}
              />
            </div>
            
            <h1 className="text-xl font-bold text-white mb-1">أهلاً بك في توصيلة</h1>
            <p className="text-xs text-slate-400 mb-2">خدمة النقل الذكية في النجف الأشرف</p>
          </div>

          {/* محدد الأدوار: أنا راكب / أنا كابتن (معايير Google Material 3 لمساحات اللمس) */}
          <div className="relative w-full p-1 bg-[#1A202C] rounded-2xl flex items-center justify-between shadow-inner gap-1">
            <button 
              type="button"
              onClick={() => {
                setRole('passenger');
                setErrorMessage(null);
              }}
              className={`relative z-10 flex-1 min-h-[48px] py-3 px-2 rounded-xl text-sm font-bold transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer ${
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
              className={`relative z-10 flex-1 min-h-[48px] py-3 px-2 rounded-xl text-sm font-bold transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer ${
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
                  <div className="flex flex-col gap-2">
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

                    {/* شارات حالة وتصنيف الرقم الفورية وفق مصفوفة التوثيق الذكية */}
                    {phoneStatus.checking && (
                      <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-2xl bg-slate-800/80 border border-slate-700/80 text-slate-300 text-xs font-semibold animate-pulse shadow-sm">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping shrink-0"></span>
                        <span>جاري التحقق ومطابقة الرقم في المنظومة...</span>
                      </div>
                    )}

                    {!phoneStatus.checking && phoneStatus.checked && phoneStatus.exists && phoneStatus.role === 'passenger' && (
                      <div className="flex items-center justify-between px-3.5 py-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold animate-fade-in shadow-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">👋</span>
                          <span>مرحباً بك مجدداً {phoneStatus.name ? phoneStatus.name : ''}! حسابك مسجل كراكب</span>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 shrink-0 font-bold">حساب نشط</span>
                      </div>
                    )}

                    {!phoneStatus.checking && phoneStatus.checked && phoneStatus.exists && phoneStatus.role === 'driver' && (
                      <div className="flex items-center justify-between px-3.5 py-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold animate-fade-in shadow-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">🚖</span>
                          <span>أهلاً بك يا كابتن {phoneStatus.name || 'توصيلة'}! حسابك معتمد ومسجل</span>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/25 text-amber-300 border border-amber-500/40 shrink-0 font-bold">كابتن رسمي</span>
                      </div>
                    )}

                    {!phoneStatus.checking && phoneStatus.checked && !phoneStatus.exists && (
                      <div className="flex items-center justify-between px-3.5 py-3 rounded-2xl bg-sky-500/15 border border-sky-500/30 text-sky-300 text-xs font-bold animate-fade-in shadow-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">✨</span>
                          <span>رقم جديد.. أهلاً بك في عائلة توصيلة</span>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/25 text-sky-300 border border-sky-500/40 shrink-0 font-bold">تسجيل فوري</span>
                      </div>
                    )}
                  </div>

                  {/* أزرار الإجراء للراكب وفق مصفوفة الدخول */}
                  {phoneStatus.checked && phoneStatus.exists && phoneStatus.role === 'passenger' && (
                    <button 
                      type="button"
                      onClick={handleDirectLogin}
                      disabled={isLoading}
                      className="w-full min-h-[56px] rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 text-white font-bold text-base shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform duration-150 disabled:opacity-60 cursor-pointer"
                    >
                      {isLoading ? (
                        <span className="animate-pulse flex items-center justify-center gap-2">
                          <Spinner className="w-5 h-5 text-white" />
                          <span>جاري تسجيل الدخول السريع...</span>
                        </span>
                      ) : (
                        <>
                          <span>دخول سريع كراكب 🚀</span>
                          <span>←</span>
                        </>
                      )}
                    </button>
                  )}

                  {phoneStatus.checked && phoneStatus.exists && phoneStatus.role === 'driver' && (
                    <button 
                      type="button"
                      onClick={handleDirectLogin}
                      disabled={isLoading}
                      className="w-full min-h-[56px] rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-slate-950 font-bold text-base shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform duration-150 disabled:opacity-60 cursor-pointer"
                    >
                      {isLoading ? (
                        <span className="animate-pulse flex items-center justify-center gap-2">
                          <Spinner className="w-5 h-5 text-slate-950" />
                          <span>جاري تسجيل الدخول المباشر...</span>
                        </span>
                      ) : (
                        <>
                          <span>دخول مباشر للمنظومة 🚖</span>
                          <span>←</span>
                        </>
                      )}
                    </button>
                  )}

                  {phoneStatus.checked && !phoneStatus.exists && (
                    <button 
                      type="submit"
                      disabled={isLoading || !phone.trim()}
                      className="w-full min-h-[56px] rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-slate-950 font-bold text-base shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform duration-150 disabled:opacity-60 cursor-pointer"
                    >
                      {isLoading ? (
                        <span className="animate-pulse flex items-center justify-center gap-2">
                          <Spinner className="w-5 h-5 text-slate-950" />
                          <span>جاري إرسال رمز التحقق...</span>
                        </span>
                      ) : (
                        <>
                          <span>تأكيد الرقم واستلام الرمز عبر واتساب 💬</span>
                          <span>←</span>
                        </>
                      )}
                    </button>
                  )}

                  {(!phoneStatus.checked || !phone.trim() || phone.replace(/[^0-9]/g, '').length < 10) && (
                    <button 
                      type="submit"
                      disabled
                      className="w-full min-h-[56px] rounded-2xl bg-slate-800 text-slate-400 font-bold text-base border border-slate-700/60 flex items-center justify-center gap-2 disabled:opacity-50 cursor-not-allowed select-none"
                    >
                      <span>يرجى إدخال رقم الهاتف للمتابعة</span>
                      <span>←</span>
                    </button>
                  )}

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

          {/* 2. مسار الكابتن: تسجيل دخول الكابتن أو الانضمام */}
          {role === 'driver' && (
            <div className="flex flex-col gap-4 animate-fade-in text-right">
              {/* نموذج تسجيل دخول الكابتن بالهاتف */}
              {step === 'phone' && (
                <form onSubmit={handleSubmitPhone} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between px-1">
                      <label className="text-xs font-bold text-slate-200">رقم هاتف الكابتن المسجل</label>
                      <span className="text-[11px] text-amber-400 font-medium flex items-center gap-1">
                        🚖 دخول الكباتن المعتمدين
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

                    {/* شارة حالة وتصنيف الرقم الفورية للكابتن */}
                    {phoneStatus.checking && (
                      <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-2xl bg-slate-800/80 border border-slate-700/80 text-slate-300 text-xs font-semibold animate-pulse shadow-sm">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping shrink-0"></span>
                        <span>جاري التحقق ومطابقة رقم الكابتن في المنظومة...</span>
                      </div>
                    )}

                    {!phoneStatus.checking && phoneStatus.checked && phoneStatus.exists && phoneStatus.role === 'driver' && (
                      <div className="flex items-center justify-between px-3.5 py-3 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold animate-fade-in shadow-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">🚖</span>
                          <span>أهلاً بك يا كابتن {phoneStatus.name || 'توصيلة'}! حسابك معتمد ومسجل</span>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/25 text-amber-300 border border-amber-500/40 shrink-0 font-bold">كابتن رسمي</span>
                      </div>
                    )}

                    {!phoneStatus.checking && phoneStatus.checked && (!phoneStatus.exists || phoneStatus.role !== 'driver') && (
                      <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold animate-fade-in shadow-sm">
                        <span className="text-lg">⚠️</span>
                        <span>هذا الرقم غير مسجل ككابتن معتمد في أسطول توصيلة</span>
                      </div>
                    )}
                  </div>

                  {/* في حالة الكابتن المسجل: زر الدخول الفوري المباشر 56px دون إرسال كود */}
                  {phoneStatus.checked && phoneStatus.exists && phoneStatus.role === 'driver' && (
                    <button 
                      type="button"
                      onClick={handleDirectLogin}
                      disabled={isLoading}
                      className="w-full min-h-[56px] rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-slate-950 font-bold text-base shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 active:scale-[0.98] transition-transform duration-150 disabled:opacity-60 cursor-pointer"
                    >
                      {isLoading ? (
                        <span className="animate-pulse flex items-center justify-center gap-2">
                          <Spinner className="w-5 h-5 text-slate-950" />
                          <span>جاري تسجيل الدخول المباشر...</span>
                        </span>
                      ) : (
                        <>
                          <span>دخول مباشر للمنظومة 🚖</span>
                          <span>←</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* في حالة السائق غير المسجل: حظر زر الدخول وإظهار بطاقة التوجيه لمراجعة الإدارة */}
                  {phoneStatus.checked && (!phoneStatus.exists || phoneStatus.role !== 'driver') && (
                    <div className="rounded-2xl bg-[#1A202C] border border-amber-500/20 p-4 flex flex-col gap-3 shadow-lg">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-xl shrink-0">
                          🛡️
                        </div>
                        <div className="flex flex-col">
                          <h3 className="text-sm font-bold text-white">مراجعة الإدارة لاعتماد الكابتن</h3>
                          <span className="text-[11px] text-amber-400">اعتماد النخبة • تدقيق رسمي بالنجف الأشرف</span>
                        </div>
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed">
                        التسجيل والتدريب وتفعيل حساب الكابتن يتم حضورياً أو عبر التواصل المباشر مع إدارة الشركة بالنجف الأشرف.
                      </p>

                      <div className="flex flex-col gap-2.5 pt-1">
                        {/* 1. زر واتساب الإدارة */}
                        <a 
                          href="https://wa.me/9647722154182?text=تحية%20طيبة،%20أرغب%20بالانضمام%20ككابتن%20في%20توصيلة%20النجف" 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="w-full min-h-[50px] py-3 px-4 rounded-2xl bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#25D366] border border-[#25D366]/30 font-bold flex items-center justify-between transition-all active:scale-[0.98] no-underline"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-xl">💬</span>
                            <span className="text-sm">واتساب الإدارة المباشر</span>
                          </div>
                          <span>←</span>
                        </a>

                        {/* 2. زر تيليجرام الإدارة */}
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

                        {/* 3. زر الاتصال الهاتفي المباشر */}
                        <a 
                          href="tel:07722154182"
                          className="w-full min-h-[48px] py-2.5 px-4 rounded-2xl bg-[#242A37] hover:bg-[#2D3546] text-slate-200 font-bold flex items-center justify-between transition-all active:scale-[0.98] border border-slate-700/60 no-underline"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-lg">📞</span>
                            <span className="text-xs">اتصال هاتفي مباشر</span>
                          </div>
                          <span dir="ltr" className="font-mono text-xs text-amber-400 font-bold">07722154182</span>
                        </a>
                      </div>
                    </div>
                  )}

                  {/* في حالة عدم الفحص أو الرقم غير مكتمل */}
                  {(!phoneStatus.checked || !phone.trim() || phone.replace(/[^0-9]/g, '').length < 10) && (
                    <button 
                      type="submit"
                      disabled
                      className="w-full min-h-[56px] rounded-2xl bg-slate-800 text-slate-400 font-bold text-base border border-slate-700/60 flex items-center justify-center gap-2 disabled:opacity-50 cursor-not-allowed select-none"
                    >
                      <span>أدخل رقم هاتف الكابتن المسجل للمتابعة</span>
                      <span>←</span>
                    </button>
                  )}
                </form>
              )}

              {/* بوابة انضمام الكباتن الجدد عند عدم إدخال رقم بعد */}
              {(!phoneStatus.checked || phoneStatus.role === 'driver') && (
                <div className="mt-1 pt-3 border-t border-white/5 flex flex-col gap-3">
                  <div className="bg-[#1A202C] rounded-2xl p-4 flex flex-col gap-2 relative overflow-hidden border border-white/5">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-xl shrink-0">
                        🛡️
                      </div>
                      <div className="flex flex-col">
                        <h3 className="text-base font-bold text-white">بوابة انضمام الكباتن الجدد</h3>
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
                    className="w-full py-3 text-center text-xs text-slate-400 hover:text-amber-400 transition-colors cursor-pointer min-h-[48px] flex items-center justify-center"
                  >
                    العودة لواجهة الركاب
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* شارات الأمان والترخيص السفلي */}
        <div className="flex items-center justify-center gap-3 text-slate-500 text-[11px] pt-1 pb-4 select-none">
          <span>🔒 تشفير كامل للبيانات</span>
          <span>•</span>
          <span>🚖 ترخيص رسمي</span>
          <span>•</span>
          <span>النجف • الكوفة</span>
        </div>
      </div>

      {/* نافذة شروط الاستخدام وسياسة الخصوصية المنبثقة */}
      <TermsPrivacyModal
        isOpen={Boolean(termsModalTab)}
        initialTab={termsModalTab || 'terms'}
        onClose={() => setTermsModalTab(null)}
      />
    </div>
  );
}
