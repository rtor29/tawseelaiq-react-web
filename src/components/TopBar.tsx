// شريط التطبيق العلوي الموحّد مع زر القائمة الجانبية

import { useState, type ReactNode } from 'react';
import { AppDrawer } from './AppDrawer';

interface TopBarProps {
  title: string;
  actions?: ReactNode;
}

export function TopBar({ title, actions }: TopBarProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <header className="relative z-20 flex h-14 items-center gap-2 bg-brand-slate px-3 text-white shadow-md text-right font-cairo" dir="rtl">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10 transition active:scale-95 cursor-pointer"
          aria-label="فتح القائمة"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
        <h1 className="flex-1 truncate text-center text-base font-bold">{title}</h1>
        <div className="flex items-center gap-1">{actions}</div>
      </header>
      <AppDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
