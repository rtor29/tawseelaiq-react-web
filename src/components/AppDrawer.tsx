// القائمة الجانبية الموحدة لتطبيق توصيله — مطابقة للصورة المعتمدة
// تتضمن: ترويسة البروفايل، وسائل الدفع، الرحلات، المفضلة، الإعدادات، الشكاوى، وتسجيل الخروج والدعم

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { endpoints, http } from '../lib/api';
import { authStore } from '../lib/auth';
import { storage } from '../lib/storage';
import { useToast } from './Toast';
import { useTheme } from '../context/ThemeContext';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
}

export function AppDrawer({ open, onClose }: DrawerProps) {
  const navigate = useNavigate();
  const { show } = useToast();
  const session = authStore.getSession();
  const [fullName, setFullName] = useState(session?.fullName || storage.getFullName() || 'مستخدم توصيله');
  const [phone, setPhone] = useState(storage.getPhone() || '');
  const [avatar, setAvatar] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isDriver = (session?.role ?? 'Customer').toLowerCase() === 'driver';

  useEffect(() => {
    setFullName(session?.fullName || storage.getFullName() || 'مستخدم توصيله');
    setPhone(storage.getPhone() || '');
    setAvatar(storage.getAvatar());
  }, [session, open]);

  const { toggleTheme, isDark } = useTheme();

  // التحقق من أن الحساب غير محظور — بدون طرد أو حظر قسري عند فشل الاتصال العرضي
  useEffect(() => {
    if (!open) return;
    const userId = storage.getUserId();
    if (!userId) return;
    http
      .get(`${endpoints.profile}?userId=${userId}`)
      .then((res) => {
        if (res.data?.isBlocked === true) handleBlocked();
      })
      .catch(() => {
        // حماية تامة: لا نقوم بتسجيل الخروج أو الحظر عند فشل الاستعلام أو غياب نقطة النهاية
      });
  }, [open]);

  function handleBlocked() {
    authStore.clear();
    navigate('/login', { replace: true });
    show('تم حظر أو إيقاف هذا الحساب من قبل إدارة المنصة.', 'error');
  }

  function onPickAvatar(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = String(reader.result);
      storage.setAvatar(base64);
      setAvatar(base64);
      show('تم تحديث الصورة الشخصية بنجاح! ✅', 'success');
    };
    reader.readAsDataURL(file);
  }

  function go(path: string) {
    onClose();
    navigate(path);
  }

  function handleLogout() {
    if (!window.confirm('هل أنت متأكد من رغبتك في تسجيل الخروج من حسابك؟')) {
      return;
    }
    const currentTheme = localStorage.getItem('tawseela_theme') || localStorage.getItem('tawseela_theme_mode');
    authStore.clear();
    storage.clearAll();
    try {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('auth');
      localStorage.removeItem('tawseela_auth');
      localStorage.removeItem('tawseela_session');
      if (currentTheme) {
        localStorage.setItem('tawseela_theme', currentTheme);
      }
      sessionStorage.clear();
    } catch (_) {}
    if (onClose) onClose();
    window.location.replace('/login');
  }

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-[120] transition-opacity duration-300 font-cairo text-right ${
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      role="dialog"
      aria-modal="true"
      dir="rtl"
    >
      {/* خلفية معتمة قابلة للنقر للإغلاق */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* الحاوية المنزلقة من اليمين بالكامل وفق المتطلبات وتطابق الصورة */}
      <aside
        className={`fixed inset-y-0 right-0 w-[85%] max-w-sm bg-white z-50 shadow-2xl flex flex-col font-cairo text-right transform transition-transform duration-300 ease-out select-none ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        dir="rtl"
      >
        {/* زر الإغلاق (✕) أعلى اليسار بمساحة لمس قياسية >= 48px */}
        <div className="flex items-center justify-end px-5 pt-[calc(0.75rem+env(safe-area-inset-top,0.75rem))] pb-1">
          <button
            type="button"
            onClick={onClose}
            className="w-12 h-12 flex items-center justify-center rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 cursor-pointer transition active:scale-95"
            aria-label="إغلاق القائمة"
          >
            <svg
              className="h-6 w-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* قسم الملف الشخصي (صورة الرمز التعبيري في أقصى اليمين، الاسم ورقم الهاتف بجانبها إلى اليمين، وسهم التنقل في أقصى اليسار) */}
        <div
          onClick={() => fileRef.current?.click()}
          className="flex items-center justify-between px-6 py-3 cursor-pointer hover:bg-gray-50 transition border-b border-gray-100 min-h-[64px]"
          title="تغيير الصورة الشخصية"
        >
          {/* اليمين: الصورة الرمزية في أقصى اليمين + الاسم ورقم الهاتف بجانبها مباشرة */}
          <div className="flex items-center gap-3.5">
            <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-gray-100 to-gray-200 border-2 border-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] overflow-hidden">
              {avatar ? (
                <img src={avatar} alt="الصورة الشخصية" className="h-full w-full object-cover" />
              ) : (
                <svg className="h-10 w-10 text-gray-400 mt-1" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              )}
            </div>

            <div className="text-right">
              <h3 className="text-[19px] font-black text-gray-900 leading-tight truncate max-w-[170px]">{fullName}</h3>
              <p dir="ltr" className="text-[13px] font-bold text-gray-500 mt-0.5 font-sans tracking-wide text-right">
                {phone || 'بدون رقم'}
              </p>
            </div>
          </div>

          {/* اليسار: سهم التنقل الأيسر (<) في أقصى اليسار */}
          <div className="text-gray-400 shrink-0">
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </div>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => onPickAvatar(e.target.files?.[0] ?? null)}
        />

        {/* قائمة البنود: الأيقونة في أقصى اليمين، النصوص بجانبها إلى اليمين، وسهم التنقل في أقصى اليسار */}
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {/* وسائل الدفع */}
          <div
            onClick={() => show('الرصيد المتاح: 0 د.ع • لشحن المحفظة يرجى مراجعة أحد مراكزنا المعتمدة', 'info', 4000)}
            className="flex items-center justify-between px-6 py-3.5 cursor-pointer hover:bg-gray-50 transition active:bg-gray-100 min-h-[52px]"
          >
            <div className="flex items-center gap-3.5">
              <div className="text-gray-600 shrink-0">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="5" width="20" height="14" rx="2" />
                  <line x1="2" y1="10" x2="22" y2="10" />
                </svg>
              </div>
              <div className="text-right">
                <p className="text-[16px] font-black text-gray-900">وسائل الدفع</p>
                <p className="text-[12.5px] font-bold text-gray-500 mt-0.5">الرصيد: 0 دينار</p>
              </div>
            </div>
            <div className="text-gray-400 shrink-0">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </div>
          </div>

          {/* الرحلات */}
          <div
            onClick={() => go('/ads')}
            className="flex items-center justify-between px-6 py-3.5 cursor-pointer hover:bg-gray-50 transition active:bg-gray-100 min-h-[52px]"
          >
            <div className="flex items-center gap-3.5">
              <div className="text-gray-600 shrink-0">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <p className="text-[16px] font-black text-gray-900 text-right">الرحلات</p>
            </div>
            <div className="text-gray-400 shrink-0">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </div>
          </div>

          {/* العناوين المفضلة */}
          <div
            onClick={() => show('يمكنك إضافة الأماكن إلى المفضلة من شريط البحث في الخريطة ⭐', 'info', 4000)}
            className="flex items-center justify-between px-6 py-3.5 cursor-pointer hover:bg-gray-50 transition active:bg-gray-100 min-h-[52px]"
          >
            <div className="flex items-center gap-3.5">
              <div className="text-gray-600 shrink-0">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </div>
              <p className="text-[16px] font-black text-gray-900 text-right">العناوين المفضلة</p>
            </div>
            <div className="text-gray-400 shrink-0">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </div>
          </div>

          {/* قسائم الخصومات والجوائز */}
          <div
            onClick={() => show('لا توجد قسائم خصم أو جوائز نشطة لحسابك حالياً 🏷️', 'info', 4000)}
            className="flex items-center justify-between px-6 py-3.5 cursor-pointer hover:bg-gray-50 transition active:bg-gray-100 min-h-[52px]"
          >
            <div className="flex items-center gap-3.5">
              <div className="text-gray-600 shrink-0">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                  <line x1="7" y1="7" x2="7.01" y2="7" />
                </svg>
              </div>
              <p className="text-[16px] font-black text-gray-900 text-right">قسائم الخصومات والجوائز</p>
            </div>
            <div className="text-gray-400 shrink-0">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </div>
          </div>

          {/* إرسال دعوة لأصدقائك */}
          <div
            onClick={() => {
              if (navigator.share) {
                navigator.share({ title: 'تطبيق توصيلة', text: 'حمل تطبيق توصيلة لحجز مشاوير التكسي والخطوط في النجف', url: 'https://tawseelaiq.app' }).catch(() => {});
              } else {
                navigator.clipboard?.writeText('https://tawseelaiq.app');
                show('تم نسخ رابط التطبيق لمشاركته مع أصدقائك 🎁', 'success');
              }
            }}
            className="flex items-center justify-between px-6 py-3.5 cursor-pointer hover:bg-gray-50 transition active:bg-gray-100 min-h-[52px]"
          >
            <div className="flex items-center gap-3.5">
              <div className="text-gray-600 shrink-0">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 12 20 22 4 22 4 12" />
                  <rect x="2" y="7" width="20" height="5" />
                  <line x1="12" y1="22" x2="12" y2="7" />
                  <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                  <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                </svg>
              </div>
              <p className="text-[16px] font-black text-gray-900 text-right">إرسال دعوة لأصدقائك</p>
            </div>
            <div className="text-gray-400 shrink-0">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </div>
          </div>

          {/* الإعدادات */}
          <div
            onClick={() => fileRef.current?.click()}
            className="flex items-center justify-between px-6 py-3.5 cursor-pointer hover:bg-gray-50 transition active:bg-gray-100 min-h-[52px]"
          >
            <div className="flex items-center gap-3.5">
              <div className="text-gray-600 shrink-0">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </div>
              <p className="text-[16px] font-black text-gray-900 text-right">الإعدادات</p>
            </div>
            <div className="text-gray-400 shrink-0">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </div>
          </div>

          {/* مظهر التطبيق (نهاري / ليلي) */}
          <div
            onClick={toggleTheme}
            className="flex items-center justify-between px-6 py-3.5 cursor-pointer hover:bg-amber-50/40 transition active:bg-amber-100/50 min-h-[52px]"
          >
            <div className="flex items-center gap-3.5">
              <div className="text-amber-500 shrink-0 text-2xl flex items-center justify-center w-6 h-6">
                {isDark ? '☀️' : '🌙'}
              </div>
              <div className="text-right">
                <p className="text-[16px] font-black text-gray-900">مظهر التطبيق</p>
                <p className="text-[12.5px] font-bold text-gray-500 mt-0.5">
                  {isDark ? 'الوضع الليلي نشط (انقر للنهاري)' : 'الوضع النهاري نشط (انقر لليلي)'}
                </p>
              </div>
            </div>
            <span className="rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900 shrink-0">
              {isDark ? '🌙 ليلي' : '☀️ نهاري'}
            </span>
          </div>

          {/* حول توصيلة */}
          <div
            onClick={() => {
              onClose();
              alert('تطبيق النقل الذكي الأول المخصص لمحافظة النجف الأشرف.\nتوصيله v1.0.0 (Release)');
            }}
            className="flex items-center justify-between px-6 py-3.5 cursor-pointer hover:bg-gray-50 transition active:bg-gray-100 min-h-[52px]"
          >
            <div className="flex items-center gap-3.5">
              <div className="text-gray-600 shrink-0">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </div>
              <p className="text-[16px] font-black text-gray-900 text-right">حول توصيلة</p>
            </div>
            <div className="text-gray-400 shrink-0">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </div>
          </div>

          {/* إذا كان كابتن: طلبات الحجز والمستمسكات */}
          {isDriver && (
            <>
              <div
                onClick={() => go('/driver/requests')}
                className="flex items-center justify-between px-6 py-3.5 cursor-pointer hover:bg-amber-50/50 transition active:bg-amber-100 min-h-[52px]"
              >
                <div className="flex items-center gap-3.5">
                  <div className="text-amber-600 shrink-0">
                    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                    </svg>
                  </div>
                  <p className="text-[16px] font-black text-amber-900 text-right">طلبات الحجز الواردة</p>
                </div>
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 shrink-0">فوري</span>
              </div>

              {/* TODO: driver_documents_enabled (معطلة افتراضياً حتى تفعيلها رسمياً من لوحة التحكم) */}
              {false && (
                <div
                  onClick={() => go('/driver/documents')}
                  className="flex items-center justify-between px-6 py-3.5 cursor-pointer hover:bg-amber-50/50 transition active:bg-amber-100 min-h-[52px]"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="text-amber-600 shrink-0">
                      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                    </div>
                    <p className="text-[16px] font-black text-amber-900 text-right">رفع المستمسكات والوثائق</p>
                  </div>
                  <div className="text-gray-400 shrink-0">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </div>
                </div>
              )}
            </>
          )}

          {/* تقديم شكوى أو بلاغ 🛡️ */}
          <div
            onClick={() => go('/support')}
            className="flex items-center justify-between px-6 py-3.5 cursor-pointer hover:bg-red-50/60 transition border-t border-red-100 bg-red-50/20 active:bg-red-100 min-h-[52px]"
          >
            <div className="flex items-center gap-3.5">
              <div className="text-red-600 shrink-0">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <div className="text-right">
                <p className="text-[16px] font-black text-red-700">تقديم شكوى أو بلاغ 🛡️</p>
                <p className="text-[12px] font-medium text-red-500 mt-0.5">بلاغ فوري عن الكابتن أو الرحلة</p>
              </div>
            </div>
            <div className="text-red-400 shrink-0">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </div>
          </div>

          {/* زر تسجيل الخروج */}
          <div
            onClick={handleLogout}
            className="flex items-center justify-between px-6 py-3.5 cursor-pointer hover:bg-rose-50/60 transition border-t border-b border-slate-100 active:scale-[0.99] min-h-[52px]"
          >
            <div className="flex items-center gap-3.5">
              <div className="text-rose-600 shrink-0">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </div>
              <p className="text-[16px] font-black text-rose-600 text-right">تسجيل الخروج</p>
            </div>
            <div />
          </div>
        </div>

        {/* كارد التواصل مع الدعم أسفل القائمة: الأيقونة في أقصى اليمين، النصوص بجانبها لليمين، والسهم في أقصى اليسار */}
        <div
          onClick={() => go('/support')}
          className="flex items-center justify-between bg-slate-50 px-6 py-4 cursor-pointer hover:bg-slate-100/70 transition border-t border-slate-100 pb-[calc(1rem+env(safe-area-inset-bottom,0.5rem))] min-h-[56px]"
        >
          {/* اليمين: الأيقونة + النصوص */}
          <div className="flex items-center gap-3.5">
            <div className="text-[#1B4965] shrink-0">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
              </svg>
            </div>
            <div className="text-right">
              <h4 className="text-[15px] font-bold text-[#1A1A1A]">التواصل مع الدعم</h4>
              <p className="text-[12.5px] font-medium text-[#6C757D] mt-0.5">
                لأي مشاكل أو استفسارات، فريقنا بخدمتكم.
              </p>
            </div>
          </div>

          {/* اليسار: سهم التنقل الأيسر (<) */}
          <div className="text-gray-400 shrink-0">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </div>
        </div>
      </aside>
    </div>
  );
}
