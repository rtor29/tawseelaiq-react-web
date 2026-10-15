// عناصر واجهة صغيرة موحّدة (أزرار، حقول، شارات، أوراق القاع)

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'dark' | 'emerald' | 'danger' | 'blue' | 'outline' | 'ghost';

const BTN_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-amber text-brand-slate hover:bg-amber-400',
  dark: 'bg-brand-slate text-white hover:bg-brand-slate2',
  emerald: 'bg-brand-emerald text-white hover:bg-emerald-500',
  danger: 'bg-red-500 text-white hover:bg-red-600',
  blue: 'bg-blue-600 text-white hover:bg-blue-700',
  outline: 'border-2 border-slate-300 bg-white text-brand-slate hover:border-brand-amber',
  ghost: 'text-brand-slate hover:bg-slate-100',
};

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-base font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${BTN_VARIANTS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Spinner({ className = '', light = false }: { className?: string; light?: boolean }) {
  return (
    <span
      className={`inline-block h-5 w-5 animate-spin rounded-full border-2 border-solid border-current border-r-transparent align-[-0.125em] ${className}`}
      role="status"
      aria-label="جاري التحميل"
      style={light ? undefined : { color: 'currentColor' }}
    />
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label?: string; icon?: ReactNode; error?: string };

export function Field({ label, icon, error, className = '', ...rest }: FieldProps) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-sm font-bold text-brand-slate">{label}</span>}
      <span className="relative block">
        {icon && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">{icon}</span>}
        <input
          className={`w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-brand-slate outline-none transition placeholder:text-slate-400 focus:border-brand-amber focus:ring-2 focus:ring-amber-200 ${icon ? 'pr-10' : ''} ${className}`}
          {...rest}
        />
      </span>
      {error && <span className="mt-1 block text-xs font-bold text-red-600">{error}</span>}
    </label>
  );
}

export function SelectField({
  label,
  className = '',
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="block">
      {label && <span className="mb-1.5 block text-sm font-bold text-brand-slate">{label}</span>}
      <select
        className={`w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-brand-slate outline-none focus:border-brand-amber focus:ring-2 focus:ring-amber-200 ${className}`}
        {...rest}
      >
        {children}
      </select>
    </label>
  );
}

export function Badge({ color = '#10B981', children }: { color?: string; children: ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold"
      style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}66` }}
    >
      {children}
    </span>
  );
}

// ورقة القاع (Bottom Sheet) — بديل showModalBottomSheet
export function BottomSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 max-h-[85vh] w-full max-w-lg animate-sheet-up overflow-y-auto rounded-t-3xl bg-brand-slate p-5 shadow-sheet">
        <div className="mx-auto mb-4 h-1 w-11 rounded-full bg-white/25" />
        {children}
      </div>
    </div>
  );
}

export function AlertDialog({
  open,
  title,
  icon,
  children,
  actions,
}: {
  open: boolean;
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" role="alertdialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative z-10 w-full max-w-sm animate-fade-up rounded-2xl bg-white p-6 shadow-float">
        <div className="mb-3 flex items-center gap-2">
          {icon}
          <h3 className="text-base font-extrabold text-brand-slate">{title}</h3>
        </div>
        <div className="text-sm leading-relaxed text-slate-600">{children}</div>
        <div className="mt-5 flex justify-start gap-2">{actions}</div>
      </div>
    </div>
  );
}
