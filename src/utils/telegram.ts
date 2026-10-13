/**
 * Telegram WebApp integration utility.
 * Reads Telegram.WebApp context when app is opened inside Telegram.
 */

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe: {
          user?: { id: number; first_name: string; last_name?: string; username?: string; language_code?: string };
          start_param?: string;
        };
        ready: () => void;
        expand: () => void;
        close: () => void;
        MainButton: {
          text: string;
          show: () => void;
          hide: () => void;
          onClick: (fn: () => void) => void;
        };
        BackButton: { show: () => void; hide: () => void; onClick: (fn: () => void) => void };
        themeParams: Record<string, string>;
        colorScheme: 'light' | 'dark';
        platform: string;
      };
    };
  }
}

export function isTelegramWebApp(): boolean {
  return typeof window !== 'undefined' && !!window.Telegram?.WebApp?.initData;
}

export function getTelegramUser() {
  return window.Telegram?.WebApp?.initDataUnsafe?.user ?? null;
}

export function initTelegramWebApp() {
  if (!isTelegramWebApp()) return;
  window.Telegram!.WebApp.ready();
  window.Telegram!.WebApp.expand();
}

/** Parse URL ?role= and ?tripType= params set by the Telegram bot buttons */
export function getTelegramStartParams(): { role?: string; tripType?: string } {
  const params = new URLSearchParams(window.location.search);
  return {
    role:     params.get('role')     ?? undefined,
    tripType: params.get('tripType') ?? undefined,
  };
}
