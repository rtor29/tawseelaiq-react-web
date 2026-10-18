// إدارة المظهر والثيم ونظام الخطوط — متزامن مع لوحة التحكم المركزية (Admin Dashboard)

export interface ThemeConfig {
  preset?: string;
  primaryColor: string;
  primaryHover: string;
  accentColor: string;
  brandLogoColor?: string;
  fontFamily: string;
  fontSize: string;
  bgColor?: string;
  cardBg?: string;
  textColor?: string;
  appName?: string;
  logoEmoji?: string;
  footerText?: string;
}

export const DEFAULT_THEME: ThemeConfig = {
  preset: 'default',
  primaryColor: '#1B4965',
  primaryHover: '#14364A',
  accentColor: '#D97706',
  brandLogoColor: '#EBB812',
  fontFamily: 'Arial Unicode MS Regular',
  fontSize: '14px',
  bgColor: '#F8FAFC',
  cardBg: '#FFFFFF',
  textColor: '#0F172A',
  appName: 'توصيله',
  logoEmoji: '🚕',
  footerText: '© 2026 توصيله (Tawseela IQ) · النجف الأشرف',
};

const STORAGE_KEY = 'tawseela_theme';

export function getCachedTheme(): ThemeConfig {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_THEME, ...parsed };
    }
  } catch {
    // ignore json error
  }
  return DEFAULT_THEME;
}

export function applyTheme(theme: Partial<ThemeConfig>): ThemeConfig {
  const merged: ThemeConfig = {
    ...DEFAULT_THEME,
    ...(theme || {}),
  };

  if (typeof document !== 'undefined') {
    const root = document.documentElement;

    // تطبيق متغيرات الألوان
    root.style.setProperty('--primary-color', merged.primaryColor);
    root.style.setProperty('--primary-hover', merged.primaryHover);
    root.style.setProperty('--accent-color', merged.accentColor);
    root.style.setProperty('--brand-logo-color', merged.brandLogoColor || '#EBB812');
    root.style.setProperty('--bg-color', merged.bgColor || '#F8FAFC');
    root.style.setProperty('--card-bg', merged.cardBg || '#FFFFFF');
    root.style.setProperty('--text-color', merged.textColor || '#0F172A');

    // تطبيق الخط
    const chosenFont = merged.fontFamily || 'Arial Unicode MS Regular';
    const fontStack = chosenFont.includes('Arial Unicode MS')
      ? `'Arial Unicode MS Regular', 'Arial Unicode MS', 'Cairo', 'Tajawal', system-ui, -apple-system, sans-serif`
      : `"${chosenFont}", 'Tajawal', 'Cairo', system-ui, -apple-system, sans-serif`;
    root.style.setProperty('--font-family', fontStack);
    document.body.style.fontFamily = fontStack;

    // تطبيق حجم الخط
    const fontSize = merged.fontSize || '14px';
    root.style.setProperty('--app-font-size', fontSize);
    root.style.fontSize = fontSize;

    // تحديث عنوان الصفحة واسم التطبيق
    if (merged.appName) {
      document.title = `${merged.appName} | النقل الذكي في النجف الأشرف`;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // ignore storage error
    }
  }

  return merged;
}

export async function fetchAndApplyTheme(apiBase = '/api'): Promise<ThemeConfig> {
  // أولاً نطبق المخزن محلياً فوراً لمنع وميض الشاشة
  const initial = getCachedTheme();
  applyTheme(initial);

  try {
    const res = await fetch(`${apiBase}/app-config/theme`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      const themeData = data.theme || data;
      if (themeData && (themeData.primaryColor || themeData.preset)) {
        return applyTheme(themeData);
      }
    }
  } catch (err) {
    console.warn('[Theme] Could not fetch theme from server, using cached/default theme:', err);
  }

  return initial;
}
