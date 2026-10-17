// نظام الإشعارات (Toast) — بديل SnackBar في Flutter

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastApi {
  show: (message: string, type?: ToastType, durationMs?: number) => void;
  dismiss: (id?: number) => void;
  dismissAll: () => void;
}

const ToastContext = createContext<ToastApi>({
  show: () => undefined,
  dismiss: () => undefined,
  dismissAll: () => undefined,
});

const STYLES: Record<ToastType, string> = {
  success: 'bg-emerald-600 text-white',
  error: 'bg-red-600 text-white',
  info: 'bg-[#1B4965] text-white',
  warning: 'bg-amber-600 text-white',
};

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<number, number>>(new Map());

  const dismiss = useCallback((id?: number) => {
    if (id !== undefined) {
      const timer = timersRef.current.get(id);
      if (timer) {
        clearTimeout(timer);
        timersRef.current.delete(id);
      }
      setToasts((prev) => prev.filter((t) => t.id !== id));
    } else {
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
      setToasts([]);
    }
  }, []);

  const dismissAll = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current.clear();
    setToasts([]);
  }, []);

  const show = useCallback((message: string, type: ToastType = 'info', durationMs = 3500) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, type, message }]);
    const timer = window.setTimeout(() => {
      timersRef.current.delete(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, durationMs);
    timersRef.current.set(id, timer);
  }, []);

  return (
    <ToastContext.Provider value={{ show, dismiss, dismissAll }}>
      {children}
      {/* موضع الإشعارات ثابت في أعلى الشاشة دون حجب أزرار الواجهة السفلية */}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[9999] flex flex-col items-center gap-2 px-4 pt-safe transition-all duration-200">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto max-w-md animate-fade-in rounded-xl px-5 py-2.5 text-center text-sm font-bold shadow-lg border border-white/10 ${STYLES[t.type]}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
