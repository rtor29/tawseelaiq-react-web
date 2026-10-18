import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { http } from '../lib/api';
import { authStore, useSession } from '../lib/auth';
import { consumeLoginTokenFromUrl } from '../lib/googleAuth';
import type { Session } from '../types';
import { Spinner } from '../components/ui';
import { useToast } from '../components/Toast';

const CustomerHub = lazy(() => import('../components/CustomerHub').then((m) => ({ default: m.CustomerHub })));

export default function LoginPage() {
  const navigate = useNavigate();
  const { show } = useToast();
  const session = useSession();

  const [step, setStep] = useState<'phone' | 'otp' | 'profile' | 'service_select'>('phone');
  const [phone, setPhone] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const [fullName, setFullName] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [detectedRole, setDetectedRole] = useState<'Customer' | 'Driver'>('Customer');

  const otpInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const navigateAfterLogin = (role: string) => {
    navigate(role === 'Driver' ? '/driver' : '/', { replace: true });
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
    return val
      .replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d).toString())
      .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d).toString())
      .replace(/[^0-9+]/g, '');
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

  async function handleSubmitPhone() {
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
        // بديل endpoint
        await http.post('/auth/send-otp', {
          phoneNumber: cleanPhone,
          role: checkData.role || 'Customer',
        });
        show('تم إرسال رمز التحقق إلى واتساب 📲', 'success');
      }

      setStep('otp');
      setOtpDigits(['', '', '', '', '', '']);
      setTimeout(() => otpInputsRef.current[0]?.focus(), 200);
    } catch (err: any) {
      const serverErr = err?.response?.data?.error;
      setErrorMessage(serverErr || 'تعذر الاتصال بالخادم. تأكد من اتصال الإنترنت.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleOtpDigitChange(val: string, index: number) {
    const digit = val.replace(/[^0-9]/g, '').slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = digit;
    setOtpDigits(newDigits);
    setErrorMessage(null);

    if (digit && index < 5) {
      otpInputsRef.current[index + 1]?.focus();
    }

    if (newDigits.every((d) => d !== '')) {
      const fullCode = newDigits.join('');
      handleVerifyOtp(fullCode);
    }
  }

  function handleOtpKeyDown(e: React.KeyboardEvent<HTMLInputElement>, index: number) {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputsRef.current[index - 1]?.focus();
    } else if (e.key === 'Enter') {
      const fullCode = otpDigits.join('');
      if (fullCode.length >= 4) {
        handleVerifyOtp(fullCode);
      }
    }
  }

  async function handleVerifyOtp(code: string) {
    if (isLoading) return;
    setErrorMessage(null);
    setIsLoading(true);

    const cleanPhone = normalizePhone(phone);
    try {
      try {
        await http.post('/auth/verify-whatsapp-otp', {
          phone: cleanPhone,
          phoneNumber: cleanPhone,
          code,
          otp: code,
          role: detectedRole,
        });
      } catch (_) {
        await http.post('/auth/verify-otp', {
          phoneNumber: cleanPhone,
          otp: code,
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
            setIsLoading(false);
            setStep('service_select');
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

      // إذا لم يكن مسجلاً، الانتقال لإكمال الملف الشخصي
      setStep('profile');
    } catch (err: any) {
      const serverErr = err?.response?.data?.error;
      setErrorMessage(serverErr || 'رمز التحقق غير صحيح أو منتهي الصلاحية');
      setOtpDigits(['', '', '', '', '', '']);
      otpInputsRef.current[0]?.focus();
    } finally {
      setIsLoading(false);
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
      show('تمت إعادة إرسال رمز التحقق عبر واتساب', 'success');
    } catch (err) {
      show('تعذر إعادة الإرسال حالياً', 'error');
    } finally {
      setIsResending(false);
    }
  }

  async function handleCompleteProfile() {
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
        show('تم إنشاء حسابك بنجاح! مرحباً بك في توصيله 🚖', 'success');
        setStep('service_select');
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

  // في حال الوصول لخطوة اختيار الخدمة، عرض هب خدمات الزبون الحديث (Baly Style)
  if (step === 'service_select') {
    return (
      <Suspense fallback={<div className="min-h-[100dvh] flex items-center justify-center bg-gray-50"><Spinner className="w-8 h-8 text-[#1B4965]" /></div>}>
        <CustomerHub onSelectService={handleSelectService} />
      </Suspense>
    );
  }

  return (
    <div className="min-h-dvh bg-white flex flex-col justify-between max-w-[480px] mx-auto px-6 py-6 relative text-right font-cairo" dir="rtl">
      {/* 1. الخطوة الأولى: واجهة ياهلا ورقم الهاتف (مع موشن دخول الشعار من اليمين) */}
      {step === 'phone' && (
        <div className="flex-1 flex flex-col pt-4 overflow-hidden">
          {/* الشعار بالأعلى مع حركة الدخول من اليمين */}
          <div className="mb-10 text-center flex justify-center">
            <img
              src="/logo-v2.png"
              alt="شعار منصة توصيلة"
              width="250"
              height="136"
              fetchPriority="high"
              className="w-[250px] max-w-[85%] h-auto object-contain animate-drive-in"
            />
          </div>

          {/* نصوص الترحيب والحقول تظهر بعد استقرار الشعار في مكانه */}
          <div className="text-right animate-fade-in-text">
            <h1 className="text-[32px] font-bold text-[#1A1A1A] font-cairo mb-2 tracking-tight">
              ياهلا
            </h1>
            <p className="text-[16px] font-medium text-[#6C757D] font-cairo mb-7">
              قم بإدخال رقم هاتفك للمتابعة
            </p>

            {/* رسالة الخطأ إن وجدت */}
            {errorMessage && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-center text-[13px] font-bold text-red-700">
                {errorMessage}
              </div>
            )}

            {/* حقل إدخال رقم الهاتف — إزالة transition-all لمنع Non-composited animations */}
            <div className="bg-white border border-slate-200/90 rounded-xl shadow-card flex items-center px-4 py-3.5 mb-7 focus-within:border-[#1B4965] focus-within:ring-2 focus-within:ring-[#1B4965]/10">
              <input
                type="tel"
                aria-label="رقم الهاتف"
                dir="ltr"
                value={phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmitPhone()}
                placeholder=""
                autoFocus
                className="w-full border-none outline-none text-[20px] font-bold text-[#1A1A1A] text-left bg-transparent tracking-widest placeholder-slate-300"
              />
            </div>

            {/* عبارة الشروط والأحكام */}
            <p className="text-[12.5px] font-medium text-[#6C757D] text-center leading-relaxed">
              عند المتابعة أنت توافق على{' '}
              <a href="#" onClick={(e) => e.preventDefault()} className="text-[#1B4965] font-semibold hover:underline">
                شروط الاستخدام وسياسة الخصوصية
              </a>
            </p>
          </div>

          {/* زر المتابعة العائم في أسفل اليسار */}
          <button
            type="button"
            onClick={handleSubmitPhone}
            disabled={isLoading}
            className="fixed bottom-14 left-6 md:absolute md:bottom-16 md:left-8 w-14 h-14 rounded-xl bg-[#1B4965] hover:bg-[#14364A] text-white flex items-center justify-center shadow-subtle cursor-pointer transition-all duration-200 active:scale-95 disabled:opacity-60 z-40 animate-fade-in-text"
            aria-label="تسجيل الدخول"
          >
            {isLoading ? (
              <Spinner className="w-6 h-6 text-white" />
            ) : (
              <svg
                className="w-6 h-6 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            )}
          </button>
        </div>
      )}

      {/* 2. الخطوة الثانية: واجهة التحقق عبر واتساب (OTP) */}
      {step === 'otp' && (
        <div className="flex-1 flex flex-col pt-6">
          {/* أيقونة الواتساب الخضراء */}
          <div className="text-center mb-8 flex justify-center">
            <div className="w-20 h-20 bg-emerald-50 rounded-2xl flex items-center justify-center shadow-card border border-emerald-100">
              <svg className="w-10 h-10 text-emerald-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.664-.698c.972.531 1.942.812 2.802.812l.006-.001c3.178 0 5.767-2.587 5.768-5.766 0-3.18-2.589-5.768-5.78-5.768zm3.364 8.163c-.144.405-.837.774-1.17.824-.311.045-.698.077-2.226-.554-1.828-.756-3.003-2.612-3.094-2.733-.092-.122-.743-.988-.743-1.884 0-.896.469-1.338.636-1.52.167-.183.365-.228.487-.228.121 0 .243.001.349.006.112.006.262-.042.41.314.152.365.517 1.26.562 1.352.045.092.076.2.015.321-.061.122-.091.198-.182.304-.091.106-.192.237-.274.318-.091.091-.186.19-.08.372.106.183.473.78 1.017 1.265.7.625 1.29.818 1.472.91.183.091.289.076.395-.045.106-.122.456-.531.577-.714.122-.183.243-.152.41-.091.167.061 1.063.501 1.245.592.183.091.304.137.35.213.045.076.045.441-.099.846zm-3.364-10.335c-5.523 0-10 4.477-10 10 0 1.769.459 3.486 1.332 5.006l-1.417 5.176 5.309-1.392c1.464.799 3.116 1.22 4.776 1.22 5.523 0 10-4.477 10-10s-4.477-10-10-10z" />
              </svg>
            </div>
          </div>

          <div className="text-right">
            <h2 className="text-[24px] font-bold text-[#1A1A1A] font-cairo mb-1.5">
              أدخل رمز التفعيل
            </h2>
            <p className="text-[14px] font-medium text-[#6C757D] mb-1">
              تم إرسال رمز التفعيل إلى الواتساب على الرقم{' '}
              <span dir="ltr" className="font-bold text-[#1A1A1A]">
                {phone}
              </span>
            </p>
            <p className="text-[13px] font-medium text-[#6C757D] mb-7">
              الرجاء إدخال الرمز المكون من 6 أرقام
            </p>

            {errorMessage && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-center text-[13px] font-bold text-red-700">
                {errorMessage}
              </div>
            )}

            {/* خانات رمز OTP الست */}
            <div className="flex justify-center gap-2 mb-7" dir="ltr">
              {[0, 1, 2, 3, 4, 5].map((idx) => (
                <input
                  key={idx}
                  ref={(el) => (otpInputsRef.current[idx] = el)}
                  type="tel"
                  maxLength={1}
                  value={otpDigits[idx]}
                  onChange={(e) => handleOtpDigitChange(e.target.value, idx)}
                  onKeyDown={(e) => handleOtpKeyDown(e, idx)}
                  className="w-11 h-13 border border-slate-200 rounded-xl text-center text-[22px] font-bold text-[#1A1A1A] bg-slate-50 outline-none focus:bg-white focus:border-[#1B4965] focus:ring-2 focus:ring-[#1B4965]/10 transition-all"
                />
              ))}
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={isResending}
                className="text-[14px] font-bold text-[#1B4965] hover:underline disabled:opacity-50 cursor-pointer"
              >
                {isResending ? 'جاري الإرسال...' : 'إعادة إرسال'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('phone');
                  setErrorMessage(null);
                }}
                className="text-[13px] font-medium text-[#6C757D] hover:underline cursor-pointer"
              >
                تغيير رقم الهاتف
              </button>
            </div>
          </div>

          {/* زر المتابعة العائم */}
          <button
            type="button"
            onClick={() => handleVerifyOtp(otpDigits.join(''))}
            disabled={isLoading || otpDigits.join('').length < 4}
            className="fixed bottom-14 left-6 md:absolute md:bottom-16 md:left-8 w-14 h-14 rounded-xl bg-[#1B4965] hover:bg-[#14364A] text-white flex items-center justify-center shadow-subtle cursor-pointer transition-all duration-200 active:scale-95 disabled:opacity-60 z-40"
            aria-label="تأكيد"
          >
            {isLoading ? (
              <Spinner className="w-6 h-6 text-white" />
            ) : (
              <svg
                className="w-6 h-6 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
        </div>
      )}

      {/* 3. الخطوة الثالثة: إكمال الاسم للمستخدم الجديد */}
      {step === 'profile' && (
        <div className="flex-1 flex flex-col pt-4">
          <div className="mb-10 text-center flex justify-center">
            <img
              src="/logo-v2.png"
              alt="شعار منصة توصيلة"
              width="220"
              height="120"
              className="w-[220px] max-w-[80%] h-auto object-contain animate-drive-in"
            />
          </div>

          <div className="text-right animate-fade-in-text">
            <h1 className="text-[28px] font-bold text-[#1A1A1A] font-cairo mb-2">
              إنشاء حساب جديد
            </h1>
            <p className="text-[15px] font-medium text-[#6C757D] font-cairo mb-7">
              أدخل اسمك الكريم للمتابعة
            </p>

            {errorMessage && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-center text-[13px] font-bold text-red-700">
                {errorMessage}
              </div>
            )}

            <div className="bg-white border border-slate-200/90 rounded-xl shadow-card flex items-center px-4 py-3.5 mb-7 focus-within:border-[#1B4965] focus-within:ring-2 focus-within:ring-[#1B4965]/10">
              <input
                type="text"
                dir="rtl"
                value={fullName}
                onChange={(e) => {
                  setErrorMessage(null);
                  setFullName(e.target.value);
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleCompleteProfile()}
                placeholder="مثال: علي الموسوي"
                autoFocus
                className="w-full border-none outline-none text-[17px] font-medium text-[#1A1A1A] text-right bg-transparent placeholder-slate-400 placeholder:text-right"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleCompleteProfile}
            disabled={isLoading || !fullName.trim()}
            className="fixed bottom-14 left-6 md:absolute md:bottom-16 md:left-8 w-14 h-14 rounded-xl bg-[#1B4965] hover:bg-[#14364A] text-white flex items-center justify-center shadow-subtle cursor-pointer transition-all duration-200 active:scale-95 disabled:opacity-60 z-40 animate-fade-in-text"
            aria-label="إنهاء التسجيل"
          >
            {isLoading ? (
              <Spinner className="w-6 h-6 text-white" />
            ) : (
              <svg
                className="w-6 h-6 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
