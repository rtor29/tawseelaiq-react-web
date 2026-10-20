import React from 'react';
import { useTheme } from '../context/ThemeContext';

interface ThemeToggleButtonProps {
  className?: string;
  showLabel?: boolean;
}

export const ThemeToggleButton: React.FC<ThemeToggleButtonProps> = ({
  className = '',
  showLabel = false,
}) => {
  const { toggleTheme, isDark } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? 'التبديل إلى الوضع النهاري' : 'التبديل إلى الوضع الليلي'}
      title={isDark ? 'التبديل إلى الوضع النهاري (☀️)' : 'التبديل إلى الوضع الليلي (🌙)'}
      className={`min-w-[48px] min-h-[48px] h-12 w-12 rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-95 cursor-pointer shadow-md select-none shrink-0 ${
        isDark
          ? 'bg-[#161C28] text-amber-400 border border-amber-500/30 hover:border-amber-400 hover:bg-[#1E2638] shadow-black/30'
          : 'bg-white text-indigo-700 border border-slate-200 hover:border-indigo-300 hover:bg-slate-50 shadow-slate-200/80'
      } ${className}`}
    >
      <span className="text-xl leading-none transition-transform duration-300 transform hover:rotate-12">
        {isDark ? '☀️' : '🌙'}
      </span>
      {showLabel && (
        <span className="text-xs font-bold mr-2">
          {isDark ? 'نهاري' : 'ليلي'}
        </span>
      )}
    </button>
  );
};

export default ThemeToggleButton;
