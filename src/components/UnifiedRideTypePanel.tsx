import React, { useRef } from 'react';

export type UnifiedRideType = 'short' | 'commute';
export type GenderPreference = 'male' | 'female' | 'any';

export interface UnifiedRideTypePanelProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  selectedType: UnifiedRideType;
  onSelectType: (type: UnifiedRideType) => void;
  genderPreference: GenderPreference;
  onSelectGender: (gender: GenderPreference) => void;
  isGenderFilterEnabled: boolean;
  isDark: boolean;
  className?: string;
  isTourActive?: boolean;
  tourStep?: 1 | 2 | null;
}

export const UnifiedRideTypePanel: React.FC<UnifiedRideTypePanelProps> = ({
  isOpen,
  onToggleOpen,
  selectedType,
  onSelectType,
  genderPreference,
  onSelectGender,
  isGenderFilterEnabled,
  isDark,
  className = '',
  isTourActive = false,
  tourStep = null,
}) => {
  const touchStartYRef = useRef<number | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isTourActive) return;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (isTourActive) return;
    if (touchStartYRef.current === null) return;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaY = touchEndY - touchStartYRef.current;
    touchStartYRef.current = null;

    // سحب لأعلى (deltaY < -40) يطوي اللوحة
    if (deltaY < -40 && isOpen) {
      onToggleOpen();
    }
    // سحب لأسفل (deltaY > 40) يفتح اللوحة
    else if (deltaY > 40 && !isOpen) {
      onToggleOpen();
    }
  };

  return (
    <div
      id="unified-ride-type-panel-wrapper"
      className={`pointer-events-auto relative inline-flex flex-col items-center ${className}`}
      dir="rtl"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* 1. الشريط المطوي / رأس اللوحة العائمة */}
      <button
        type="button"
        id="unified-panel-header-btn"
        onClick={isTourActive ? undefined : onToggleOpen}
        disabled={isTourActive}
        className={`min-h-[44px] h-11 px-3 sm:px-3.5 rounded-full backdrop-blur-xl border flex items-center gap-2 font-cairo font-bold text-xs transition-all duration-200 active:scale-95 cursor-pointer shadow-lg select-none ${
          isDark
            ? 'bg-[#161C28]/95 border-amber-500/30 text-white hover:border-amber-400/60 shadow-[0_4px_16px_rgba(0,0,0,0.4)]'
            : 'bg-white/95 border-slate-200 text-slate-800 hover:border-amber-500/50 shadow-md'
        } ${isTourActive ? 'cursor-default pointer-events-none' : ''}`}
        aria-expanded={isOpen}
        aria-label="نوع المشوار والخيارات"
      >
        {/* أيقونة منزلقات الإعدادات في دائرة برتقالية خافتة */}
        <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0 text-[13px]">
          ⚙️
        </span>

        <span className="text-xs font-bold whitespace-nowrap">نوع المشوار والخيارات</span>

        {/* شارة برتقالية تعرض النوع الحالي («مشاوير» أو «خطوط») */}
        <span
          id="unified-current-type-badge"
          className="px-2 py-0.5 rounded-full text-[11px] font-black bg-amber-500 text-slate-950 shrink-0"
        >
          {selectedType === 'commute' ? 'خطوط' : 'مشاوير'}
        </span>

        {/* سهم الطي والفتح */}
        <svg
          className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-180 text-amber-500' : 'text-slate-400'
          }`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* 2. اللوحة المفتوحة (تطفو فوق الخريطة دون دفعها أو تغيير حجمها) */}
      {isOpen && (
        <div
          id="unified-panel-open-card"
          style={{ top: 'calc(4.25rem + env(safe-area-inset-top, 1rem))' }}
          className={`fixed inset-x-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-96 rounded-2xl border p-3.5 shadow-2xl backdrop-blur-2xl transition-all duration-200 z-50 animate-fade-in ${
            isTourActive
              ? isDark
                ? 'bg-[#161C28]/98 border-2 border-amber-500 text-white shadow-[0_0_24px_rgba(245,158,11,0.35)]'
                : 'bg-white/98 border-2 border-amber-500 text-slate-900 shadow-[0_0_24px_rgba(245,158,11,0.3)]'
              : isDark
              ? 'bg-[#161C28]/98 border-amber-500/40 text-white shadow-[0_12px_36px_rgba(0,0,0,0.85)]'
              : 'bg-white/98 border-slate-200 text-slate-900 shadow-2xl'
          }`}
          role="dialog"
          aria-label="خيارات نوع المشوار وفلتر الجنس"
        >
          {/* مقبض سحب صغير في أعلى اللوحة */}
          <div className="flex justify-center -mt-1 mb-2">
            <div className={`h-1 w-8 rounded-full ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />
          </div>

          {/* خيارا نوع المشوار: «مشاوير قصيرة» و«حجز خطوط دائمية» */}
          <div
            id="tour-step-ride-types"
            className={`flex flex-col gap-1.5 w-full transition-opacity duration-150 ${
              isTourActive && tourStep === 2
                ? 'pointer-events-none opacity-40 select-none'
                : 'pointer-events-auto opacity-100'
            }`}
            role="group"
            aria-label="تحديد نوع المشوار"
          >
            {/* خيار 1: مشاوير قصيرة */}
            <button
              type="button"
              id="ride-type-short-btn"
              onClick={() => onSelectType('short')}
              className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl flex items-center justify-between transition-all duration-150 cursor-pointer ${
                selectedType === 'short'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                  : isDark
                  ? 'bg-white/5 text-slate-300 hover:bg-white/10'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base">↗️</span>
                <span className="text-xs font-bold">مشاوير قصيرة</span>
              </div>
              {selectedType === 'short' && (
                <span className="text-[11px] font-black px-1.5 py-0.5 rounded bg-slate-950/15">محدد</span>
              )}
            </button>

            {/* خيار 2: حجز خطوط دائمية */}
            <button
              type="button"
              id="ride-type-commute-btn"
              onClick={() => onSelectType('commute')}
              className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl flex items-center justify-between transition-all duration-150 cursor-pointer ${
                selectedType === 'commute'
                  ? 'bg-amber-500 text-slate-950 font-black shadow-md'
                  : isDark
                  ? 'bg-white/5 text-slate-300 hover:bg-white/10'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base">📅</span>
                <span className="text-xs font-bold">حجز خطوط دائمية</span>
              </div>
              {selectedType === 'commute' && (
                <span className="text-[11px] font-black px-1.5 py-0.5 rounded bg-slate-950/15">محدد</span>
              )}
            </button>
          </div>

          {/* فاصل وصف فلتر الجنس (إن كان مفعّلاً) */}
          {isGenderFilterEnabled && (
            <>
              <div className={`my-2.5 border-t ${isDark ? 'border-slate-700/60' : 'border-slate-200'}`} />

              <div
                id="tour-step-gender-row"
                className={`w-full transition-opacity duration-150 ${
                  isTourActive && tourStep === 1
                    ? 'pointer-events-none opacity-40 select-none'
                    : 'pointer-events-auto opacity-100'
                }`}
                role="group"
                aria-label="تفضيل كابتن التوصيلة"
              >
                <div className="flex items-center justify-between mb-1.5 px-0.5">
                  <span className={`text-[11px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    تفضيل الكابتن:
                  </span>
                  <span className={`text-[10px] font-semibold ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                    خصوصية كاملة
                  </span>
                </div>

                <div className={`grid grid-cols-3 gap-1.5 p-1 rounded-xl border ${
                  isDark ? 'bg-slate-900/60 border-slate-700/50' : 'bg-slate-50 border-slate-200'
                }`}>
                  {/* سائق ذكر */}
                  <button
                    type="button"
                    id="gender-btn-male"
                    onClick={() => onSelectGender('male')}
                    style={{
                      backgroundColor: genderPreference === 'male' ? '#2563eb' : 'transparent',
                      color: genderPreference === 'male' ? '#ffffff' : (isDark ? '#94a3b8' : '#64748b'),
                    }}
                    className={`min-h-[40px] py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all duration-150 cursor-pointer ${
                      genderPreference === 'male' ? 'shadow-md shadow-blue-500/20' : 'hover:bg-white/5'
                    }`}
                    aria-label="تحديد سائق ذكر"
                    aria-pressed={genderPreference === 'male'}
                  >
                    <span>👨</span>
                    <span>سائق</span>
                  </button>

                  {/* سائقة أنثى */}
                  <button
                    type="button"
                    id="gender-btn-female"
                    onClick={() => onSelectGender('female')}
                    style={{
                      backgroundColor: genderPreference === 'female' ? '#ec4899' : 'transparent',
                      color: genderPreference === 'female' ? '#ffffff' : (isDark ? '#94a3b8' : '#64748b'),
                    }}
                    className={`min-h-[40px] py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all duration-150 cursor-pointer ${
                      genderPreference === 'female' ? 'shadow-md shadow-pink-500/20' : 'hover:bg-white/5'
                    }`}
                    aria-label="تحديد سائقة أنثى"
                    aria-pressed={genderPreference === 'female'}
                  >
                    <span className={genderPreference === 'female' ? 'text-white' : 'text-pink-400/80'}>👩</span>
                    <span>سائقة</span>
                  </button>

                  {/* كلاهما */}
                  <button
                    type="button"
                    id="gender-btn-any"
                    onClick={() => onSelectGender('any')}
                    style={{
                      backgroundColor: genderPreference === 'any' ? '#475569' : 'transparent',
                      color: genderPreference === 'any' ? '#ffffff' : (isDark ? '#94a3b8' : '#64748b'),
                    }}
                    className={`min-h-[40px] py-1.5 px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all duration-150 cursor-pointer ${
                      genderPreference === 'any' ? 'shadow-md shadow-slate-600/20' : 'hover:bg-white/5'
                    }`}
                    aria-label="تحديد كلاهما"
                    aria-pressed={genderPreference === 'any'}
                  >
                    <span>👥</span>
                    <span>كلاهما</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default UnifiedRideTypePanel;
