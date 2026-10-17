// عناصر واجهة صغيرة موحّدة (أزرار، حقول، شارات، أوراق القاع)

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'dark' | 'emerald' | 'danger' | 'blue' | 'outline' | 'ghost';

const BTN_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-[#1B4965] text-white hover:bg-[#14364A] shadow-sm active:scale-[0.98]',
  dark: 'bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98]',
  emerald: 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98]',
  danger: 'bg-red-600 text-white hover:bg-red-700 active:scale-[0.98]',
  blue: 'bg-[#1B4965] text-white hover:bg-[#14364A] active:scale-[0.98]',
  outline: 'border border-slate-300 bg-white text-slate-800 hover:border-[#1B4965] hover:text-[#1B4965]',
  ghost: 'text-slate-700 hover:bg-slate-100',
};

export function Button({
  variant = 'primary',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-50 ${BTN_VARIANTS[variant]} ${className}`}
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
      {label && <span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</span>}
      <span className="relative block">
        {icon && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-slate-400">{icon}</span>}
        <input
          className={`w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-[#1B4965] focus:ring-2 focus:ring-[#1B4965]/20 ${icon ? 'pr-10' : ''} ${className}`}
          {...rest}
        />
      </span>
      {error && <span className="mt-1 block text-xs font-semibold text-red-600">{error}</span>}
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
      {label && <span className="mb-1.5 block text-xs font-semibold text-slate-700">{label}</span>}
      <select
        className={`w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#1B4965] focus:ring-2 focus:ring-[#1B4965]/20 ${className}`}
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
