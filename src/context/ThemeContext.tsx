import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { MAPBOX_DAY_STYLE, DEFAULT_DAY_STYLE, IS_MAPLIBRE } from '../lib/config';

export type ThemeMode = 'dark' | 'light';

export { MAPBOX_DAY_STYLE };

export interface ThemeContextValue {
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (mode: ThemeMode) => void;
  mapStyle: string;
  isDark: boolean;
}

const STORAGE_KEY = 'tawseela_theme';

export function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  try {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('tawseela_theme_mode');
    if (saved === 'light' || saved === 'dark') return saved;
    if (saved && saved.startsWith('{')) {
      const parsed = JSON.parse(saved);
      if (parsed.mode === 'light' || parsed.mode === 'dark') return parsed.mode;
      if (parsed.preset === 'light') return 'light';
    }
  } catch {}
  return 'dark'; // الوضع الافتراضي المعتمد لمنصة توصيله: Dark Obsidian
}

export function applyThemeToDom(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
    root.classList.remove('light');
    root.style.backgroundColor = '#080E1A';
    root.style.colorScheme = 'dark';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#080E1A');
    document.querySelector('meta[name="background-color"]')?.setAttribute('content', '#080E1A');
  } else {
    root.classList.add('light');
    root.classList.remove('dark');
    root.style.backgroundColor = '#F8FAFC';
    root.style.colorScheme = 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#F8FAFC');
    document.querySelector('meta[name="background-color"]')?.setAttribute('content', '#F8FAFC');
  }
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const initial = getInitialTheme();
    applyThemeToDom(initial);
    return initial;
  });

  const setTheme = (mode: ThemeMode) => {
    setThemeState(mode);
    applyThemeToDom(mode);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
      localStorage.setItem('tawseela_theme_mode', mode);
      window.dispatchEvent(new Event('theme-change'));
      window.dispatchEvent(new CustomEvent('tawseela-theme-change', { detail: { theme: mode } }));
    } catch {}
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  };

  // المزامنة اللحظية عبر Storage Events و Custom Events
  useEffect(() => {
    applyThemeToDom(theme);

    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY || e.key === 'tawseela_theme_mode') {
        const next = getInitialTheme();
        setThemeState(next);
        applyThemeToDom(next);
      }
    };

    const handleGeneralThemeChange = () => {
      const next = getInitialTheme();
      setThemeState(next);
      applyThemeToDom(next);
    };

    const handleCustomChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ theme: ThemeMode }>;
      if (customEvent.detail?.theme) {
        setThemeState(customEvent.detail.theme);
        applyThemeToDom(customEvent.detail.theme);
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('theme-change', handleGeneralThemeChange);
    window.addEventListener('tawseela-theme-change', handleCustomChange);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('theme-change', handleGeneralThemeChange);
      window.removeEventListener('tawseela-theme-change', handleCustomChange);
    };
  }, [theme]);

  // نمط الخريطة النهاري المعتمد دائماً لكافة الشاشات والأوقات
  const mapStyle = IS_MAPLIBRE
    ? (import.meta.env.VITE_MAPLIBRE_STYLE || DEFAULT_DAY_STYLE)
    : (import.meta.env.VITE_MAP_STYLE || DEFAULT_DAY_STYLE);

  const value = useMemo(
    () => ({
      theme,
      toggleTheme,
      setTheme,
      mapStyle,
      isDark: theme === 'dark',
    }),
    [theme, mapStyle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback if rendered outside ThemeProvider
    const fallbackTheme = getInitialTheme();
    return {
      theme: fallbackTheme,
      toggleTheme: () => {},
      setTheme: () => {},
      mapStyle: IS_MAPLIBRE
        ? (import.meta.env.VITE_MAPLIBRE_STYLE || DEFAULT_DAY_STYLE)
        : (import.meta.env.VITE_MAP_STYLE || DEFAULT_DAY_STYLE),
      isDark: fallbackTheme === 'dark',
    };
  }
  return ctx;
}
