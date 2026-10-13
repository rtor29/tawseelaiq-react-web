import React from 'react';

interface Props {
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  variant?: 'primary' | 'success' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  fullWidth?: boolean;
}

const variants = {
  primary: 'bg-primary hover:bg-orange-600 text-white',
  success: 'bg-success hover:bg-green-700 text-white',
  danger: 'bg-danger hover:bg-red-600 text-white',
  ghost: 'bg-white/10 hover:bg-white/20 text-white border border-white/20',
};

export default function Button({
  children, onClick, type = 'button', variant = 'primary',
  disabled, loading, className = '', fullWidth,
}: Props) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`
        ${variants[variant]} ${fullWidth ? 'w-full' : ''}
        px-4 py-3 rounded-xl font-semibold text-sm transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2
        ${className}
      `}
    >
      {loading && (
        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      )}
      {children}
    </button>
  );
}
