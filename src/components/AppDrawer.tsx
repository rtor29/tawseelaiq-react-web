// القائمة الجانبية — بديل CustomSideDrawer.dart
// تتضمن: ترويسة البروفايل مع تغيير الصورة، التحقق من حالة الحساب، وتنقل حسب الدور

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { endpoints, http } from '../lib/api';
import { authStore } from '../lib/auth';
import { storage } from '../lib/storage';
import { useToast } from './Toast';

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

  // التحقق من أن الحساب غير محظور (كما في _verifyAccountActiveStatus)
  useEffect(() => {
    if (!open) return;
    const userId = storage.getUserId();
    if (!userId) return;
    http
      .get(`${endpoints.profile}?userId=${userId}`)
      .then((res) => {
        if (res.data?.isBlocked === true) handleBlocked();
      })
      .catch((err) => {
        const status = err?.response?.status;
        if (status === 403 || status === 404) handleBlocked();
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
    localStorage.clear();
    if (onClose) onClose();
    navigate('/login', { replace: true });
  }

  if (!open) return null;

  const navItems = [
    {
      key: 'home',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      ),
      label: 'الرئيسية (الخريطة)',
      action: () => go(isDriver ? '/driver' : '/'),
    },
    {
      key: 'ads',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 11 18-5v12L3 14v-3z" />
          <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
        </svg>
      ),
      label: 'إعلانات الرحلات الشاغرة',
      badge: 'جديد',
      action: () => go('/ads'),
    },
    ...(isDriver
      ? [
          {
            key: 'requests',
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
            ),
            label: 'طلبات الحجز الواردة',
            badge: 'فوري',
            action: () => go('/driver/requests'),
          },
          {
            key: 'documents',
            icon: (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            ),
            label: 'رفع المستمسكات والوثائق',
            action: () => go('/driver/documents'),
          },
        ]
      : []),
    {
      key: 'support',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
          <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
        </svg>
      ),
      label: 'الدعم الفني والشكاوى',
      action: () => go('/support'),
    },
  ];

  return (
    <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-[86%] max-w-xs animate-fade-up flex-col bg-white shadow-2xl">
        {/* الترويسة */}
        <header className="bg-gradient-to-b from-[#1B4965] to-[#14364A] p-5 text-white">
          <div className="flex items-center gap-3.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/10 border border-white/20 text-xl font-bold text-white transition hover:bg-white/20"
              aria-label="تغيير الصورة الشخصية"
            >
              {avatar ? (
                <img src={avatar} alt="الصورة الشخصية" className="h-14 w-14 rounded-xl object-cover" />
              ) : (
                fullName.charAt(0) || 'ت'
              )}
              <span className="absolute -bottom-1 -left-1 flex h-5 w-5 items-center justify-center rounded-full border border-white/60 bg-[#1B4965] text-[10px] text-white">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => onPickAvatar(e.target.files?.[0] ?? null)}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-base font-bold text-white">{fullName}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                    isDriver ? 'bg-amber-500/20 text-amber-200 border border-amber-400/30' : 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30'
                  }`}
                >
                  {isDriver ? 'كابتن توصيله' : 'مستخدم'}
                </span>
                <span dir="ltr" className="text-xs text-white/70 truncate">
                  {phone}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* البنود */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={item.action}
              className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-right text-sm font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-[#1B4965]"
            >
              <span className="text-[#1B4965]">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span
                  className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                    item.badge === 'فوري' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          ))}
          <hr className="my-3 border-slate-100" />
          <button
            type="button"
            onClick={() => {
              onClose();
              alert('تطبيق النقل الذكي الأول المخصص لمحافظة النجف الأشرف.\nتوصيله v1.0.0 (Release)');
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-right text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            <span className="text-slate-500">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </span>
            <span>حول تطبيق توصيله</span>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-right text-sm font-semibold text-red-600 transition hover:bg-red-50"
          >
            <span className="text-red-500">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </span>
            <span>تسجيل الخروج</span>
          </button>
        </nav>

        <footer className="flex items-center justify-center gap-1.5 p-4 text-[11px] text-slate-400 border-t border-slate-100">
          <span>توصيله v1.0 • النجف الأشرف</span>
        </footer>
      </aside>
    </div>
  );
}
