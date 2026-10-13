import React from 'react';

interface Props {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  dir?: 'rtl' | 'ltr';
  className?: string;
  icon?: React.ReactNode;
}

export default function Input({ label, value, onChange, type = 'text', placeholder, dir = 'rtl', className = '', icon }: Props) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && <label className="text-sm text-gray-300">{label}</label>}
      <div className="relative">
        {icon && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">{icon}</span>
        )}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          dir={dir}
          className={`
            w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3
            text-white placeholder-gray-400 focus:outline-none focus:border-primary
            transition-colors ${icon ? 'pr-10' : ''}
          `}
        />
      </div>
    </div>
  );
}
