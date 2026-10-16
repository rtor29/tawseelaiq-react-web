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

  function logout() {
    authStore.clear();
    onClose();
    navigate('/login', { replace: true });
  }

  if (!open) return null;

  const navItems = [
    { key: 'home', icon: '🏠', label: 'الرئيسية (الخريطة)', action: () => go(isDriver ? '/driver' : '/') },
    { key: 'ads', icon: '📣', label: 'إعلانات الرحلات الشاغرة', badge: 'جديد', action: () => go('/ads') },
    ...(isDriver
      ? [
          { key: 'requests', icon: '🔔', label: 'طلبات الحجز الواردة', badge: 'فوري', action: () => go('/driver/requests') },
          { key: 'documents', icon: '🛡️', label: 'رفع المستمسكات والوثائق', action: () => go('/driver/documents') },
        ]
      : []),
    { key: 'support', icon: '🎧', label: 'الدعم الفني والشكاوى', action: () => go('/support') },
  ];

  return (
    <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 flex w-[86%] max-w-xs animate-fade-up flex-col bg-white shadow-float">
        {/* الترويسة */}
        <header className="bg-gradient-to-bl from-brand-slate to-brand-slate2 p-5">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-amber text-2xl font-extrabold text-brand-slate"
              aria-label="تغيير الصورة الشخصية"
            >
              {avatar ? (
                <img src={avatar} alt="الصورة الشخصية" className="h-16 w-16 rounded-full object-cover" />
              ) : (
                fullName.charAt(0) || 'ت'
              )}
              <span className="absolute -bottom-0.5 -left-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-brand-slate bg-brand-amber text-[11px]">
                📷
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => onPickAvatar(e.target.files?.[0] ?? null)}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate font-bold text-white">{fullName}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold text-brand-slate ${
                    isDriver ? 'bg-brand-amber' : 'bg-brand-emerald'
                  }`}
                >
                  {isDriver ? 'كابتن توصيله' : 'زبون'}
                </span>
              </div>
              <p dir="ltr" className="mt-1 text-right text-xs text-white/70">
                {phone}
              </p>
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
              className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-right text-sm font-semibold text-brand-slate transition hover:bg-amber-50"
            >
              <span className="text-lg">{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {item.badge && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${
                    item.badge === 'فوري' ? 'bg-brand-amber' : 'bg-brand-emerald'
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
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-right text-sm font-semibold text-brand-slate transition hover:bg-slate-100"
          >
            <span className="text-lg">ℹ️</span>
            <span>حول تطبيق توصيله</span>
          </button>
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-right text-sm font-semibold text-red-500 transition hover:bg-red-50"
          >
            <span className="text-lg">🚪</span>
            <span>تسجيل الخروج</span>
          </button>
        </nav>

        <footer className="flex items-center justify-center gap-1 p-4 text-[11px] text-slate-400">
          <span className="text-brand-amber">⚡</span>
          <span>توصيله v1.0 • النجف الأشرف</span>
        </footer>
      </aside>
    </div>
  );
}
