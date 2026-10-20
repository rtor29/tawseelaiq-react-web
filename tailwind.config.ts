import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: 'var(--primary-color, #1B4965)',       // أزرق نفطي راقٍ للأزرار الرئيسية والتفاعل
          primaryHover: 'var(--primary-hover, #14364A)',  // كحلي بترولي داكن عند التمرير
          dark: '#0D1B2A',          // كحلي منتصف الليل للعناوين البارزة
          accent: 'var(--accent-color, #D97706)',        // لمسة التمييز الكهرمانية / السماوية
          amber: '#D97706',         // عنبري دافئ هادئ لنقطة الانطلاق
          emerald: '#059669',       // أخضر زمردي هادئ للحالات النشطة
          rose: '#E11D48',          // أحمر وردي راقٍ للإلغاء والحذف
          surface: '#F8F9FA',       // خلفية ناعمة مريحة للعين بدلاً من الأبيض الصارخ
          subtle: '#EDF2F7',        // رمادي فاتح ناعم للحدود والخلفيات الفرعية
          charcoal: '#1A1A1A',      // رمادي داكن مريح جداً للنصوص الرئيسية
          muted: '#6C757D',         // رمادي متوازن للنصوص الوصفية
        },
      },
      fontFamily: {
        sans: ['var(--font-family)', 'IBM Plex Sans Arabic', 'Tajawal', 'Cairo', 'system-ui', 'sans-serif'],
        cairo: ['var(--font-family)', 'IBM Plex Sans Arabic', 'Tajawal', 'Cairo', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl2: '1rem',
      },
      boxShadow: {
        card: '0 2px 8px -1px rgba(15, 23, 42, 0.06)',
        subtle: '0 4px 16px -2px rgba(15, 23, 42, 0.08)',
        float: '0 6px 20px -3px rgba(15, 23, 42, 0.10)',
        sheet: '0 -4px 24px -4px rgba(15, 23, 42, 0.10)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-down': {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-dot': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.35' },
        },
        'sheet-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.2s ease-out',
        'fade-in': 'fade-in 0.2s ease-out',
        'slide-down': 'slide-down 0.25s ease-out',
        'pulse-dot': 'pulse-dot 1.4s ease-in-out infinite',
        'sheet-up': 'sheet-up 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
} satisfies Config;
