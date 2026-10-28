import React, { useEffect, useState, useCallback } from 'react';

export interface UnifiedOnboardingTourProps {
  isActive: boolean;
  step: 1 | 2;
  isGenderFilterEnabled: boolean;
  isDark: boolean;
  isExiting?: boolean;
}

export const UnifiedOnboardingTour: React.FC<UnifiedOnboardingTourProps> = ({
  isActive,
  step,
  isGenderFilterEnabled,
  isDark,
  isExiting = false,
}) => {
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);

  const updateRect = useCallback(() => {
    const targetId = step === 1 ? 'tour-step-ride-types' : 'tour-step-gender-row';
    const el = document.getElementById(targetId);
    if (el) {
      const rect = el.getBoundingClientRect();
      setHighlightRect(rect);
    }
  }, [step]);

  useEffect(() => {
    if (!isActive) return;
    updateRect();

    // Re-calculate after potential micro-animations and style updates
    const t1 = setTimeout(updateRect, 50);
    const t2 = setTimeout(updateRect, 150);
    const t3 = setTimeout(updateRect, 300);

    const handleResize = () => updateRect();
    const handleOrientationChange = () => {
      setTimeout(updateRect, 100);
      setTimeout(updateRect, 300);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);

    // Focus target element
    if (step === 1) {
      document.getElementById('ride-type-short-btn')?.focus();
    } else {
      document.getElementById('gender-btn-male')?.focus();
    }

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
    };
  }, [isActive, step, updateRect]);

  // Intercept and prevent Escape key during the tour
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isActive]);

  if (!isActive) return null;

  const totalSteps = isGenderFilterEnabled ? 2 : 1;
  const stepFraction = `${step}/${totalSteps}`;
  const stepLabel = step === 1 ? 'الخطوة الأولى: نوع المشوار' : 'الخطوة الثانية: الكابتن';

  return (
    <>
      {/* 1. طبقة التعتيم شبه الشفافة فوق الخريطة وكافة العناصر */}
      <div
        id="tour-backdrop"
        className={`fixed inset-0 bg-black/65 z-40 transition-opacity duration-200 ${
          isExiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onTouchStart={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
      />

      {/* 2. حلقة الإبراز البرتقالية المستديرة حول العنصر المستهدف */}
      {highlightRect && (
        <div
          id="tour-highlight-ring"
          style={{
            position: 'fixed',
            top: `${Math.round(highlightRect.top)}px`,
            left: `${Math.round(highlightRect.left)}px`,
            width: `${Math.round(highlightRect.width)}px`,
            height: `${Math.round(highlightRect.height)}px`,
            borderRadius: '14px',
            border: '2px solid #f59e0b',
            boxShadow: '0 0 16px rgba(245, 158, 11, 0.5), inset 0 0 6px rgba(245, 158, 11, 0.2)',
            pointerEvents: 'none',
            zIndex: 55,
            transition: 'all 200ms ease-out',
            opacity: isExiting ? 0 : 1,
          }}
        />
      )}

      {/* 3. بطاقة الشرح أسفل الشاشة (بلا أي أزرار) */}
      <div
        id="tour-explanation-card"
        role="dialog"
        aria-labelledby="tour-card-title"
        aria-describedby="tour-card-desc"
        dir="rtl"
        style={{
          bottom: 'calc(1.25rem + env(safe-area-inset-bottom, 0.5rem))',
        }}
        className={`fixed inset-x-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-96 rounded-2xl border border-amber-500/30 p-4 shadow-2xl backdrop-blur-2xl z-50 transition-all duration-200 select-none ${
          isDark
            ? 'bg-[#161C28]/98 text-white shadow-[0_12px_36px_rgba(0,0,0,0.85)]'
            : 'bg-white/98 text-slate-900 shadow-2xl'
        } ${isExiting ? 'opacity-0 translate-y-2 pointer-events-none' : 'opacity-100 translate-y-0'}`}
      >
        {/* رأس البطاقة: دائرة الخطوة والعنوان */}
        <div className="flex items-center gap-2 mb-2">
          <div
            id="tour-step-badge"
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
              step === 1 || !isGenderFilterEnabled
                ? 'bg-amber-500/20 text-amber-500'
                : 'bg-emerald-500/20 text-emerald-400'
            }`}
          >
            {stepFraction}
          </div>
          <span
            id="tour-step-label"
            className={`text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}
          >
            {stepLabel}
          </span>
        </div>

        {/* فاصل */}
        <div className={`mb-3 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}`} />

        {/* محتوى الخطوة */}
        {step === 1 || !isGenderFilterEnabled ? (
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center text-xl shrink-0">
              🚗
            </div>
            <div className="flex-1 min-w-0">
              <h3
                id="tour-card-title"
                className={`text-[15px] font-black leading-tight mb-1 ${
                  isDark ? 'text-white' : 'text-slate-900'
                }`}
              >
                اختر: حجز مشوار قصير أو حجز خط دائمي 🚕📅
              </h3>
              <p
                id="tour-card-desc"
                className={`text-xs leading-relaxed ${
                  isDark ? 'text-slate-300' : 'text-slate-600'
                }`}
              >
                اضغط على اختيارك في الأعلى:{' '}
                <strong className="text-amber-500 font-bold">مشوار قصير</strong> فوري، أو{' '}
                <strong className="text-amber-500 font-bold">حجز خط دائمي</strong> للمواعيد والدوام اليومي.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xl shrink-0">
              👥
            </div>
            <div className="flex-1 min-w-0">
              <h3
                id="tour-card-title"
                className={`text-[15px] font-black leading-tight mb-1 ${
                  isDark ? 'text-white' : 'text-slate-900'
                }`}
              >
                اختر الكابتن: سائق أو سائقة 👨👩
              </h3>
              <p
                id="tour-card-desc"
                className={`text-xs leading-relaxed ${
                  isDark ? 'text-slate-300' : 'text-slate-600'
                }`}
              >
                اضغط على تفضيلك في الأعلى بكل خصوصية:{' '}
                <strong style={{ color: '#2563eb' }} className="font-black">
                  سائق
                </strong>{' '}
                👨 أو{' '}
                <strong style={{ color: '#ec4899' }} className="font-black">
                  سائقة
                </strong>{' '}
                👩 أو{' '}
                <strong className={`font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  كلاهما
                </strong>
                .
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default UnifiedOnboardingTour;
