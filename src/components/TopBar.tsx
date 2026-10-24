// شريط التطبيق العلوي الموحّد مع زر الحساب الموجه حسب الدور ودعم زر الرجوع
import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { storage } from '../lib/storage';
import { useTheme } from '../context/ThemeContext';

interface TopBarProps {
  title: string;
  actions?: ReactNode;
  onBack?: () => void;
  showBack?: boolean;
}

export function TopBar({ title, actions, onBack, showBack }: TopBarProps) {
  const navigate = useNavigate();
  const { isDark } = useTheme();

  function handleAccountClick() {
    const rawRole = (storage.getUserRole() || localStorage.getItem('role') || localStorage.getItem('user_role') || '').toLowerCase();
    if (rawRole === 'driver') {
      navigate('/driver-hub');
    } else {
      navigate('/hub');
    }
  }

  return (
    <header className={`relative z-20 flex h-14 items-center gap-2 px-3 shadow-md text-right font-cairo transition-colors ${
      isDark ? 'bg-[#0F172A] border-b border-slate-700/60 text-white' : 'bg-[#1B4965] text-white'
    }`} dir="rtl">
      {showBack || onBack ? (
        <button
          type="button"
          onClick={onBack || (() => navigate(-1))}
          className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10 transition active:scale-95 cursor-pointer text-white"
          aria-label="رجوع"
          title="رجوع"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleAccountClick}
          className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10 transition active:scale-95 cursor-pointer text-white"
          aria-label="الحساب والإعدادات"
          title="الحساب والإعدادات"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      )}
      <h1 className="flex-1 truncate text-center text-base font-bold text-white">{title}</h1>
      <div className="flex items-center gap-1">{actions}</div>
    </header>
  );
}
