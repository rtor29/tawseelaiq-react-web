import React from 'react';

export interface CommuteDriverData {
  id?: string;
  driverId?: string;
  name?: string;
  fullName?: string;
  phone?: string;
  phoneNumber?: string;
  rating?: number;
  vehicleInfo?: string;
  carModel?: string;
  plateNumber?: string;
  from?: string;
  to?: string;
  route?: string;
  routeStartName?: string;
  routeEndName?: string;
  routeId?: string;
  seats?: number;
  takenSeats?: number;
  isFull?: boolean;
  departureTime?: string;
  returnTime?: string;
  shift?: string;
}

export interface CommuteBookingCardProps {
  driver: CommuteDriverData;
  isDark: boolean;
  customerBookings: any[];
  isBooking: boolean;
  onBookSeat: () => void;
  onRequestCancellation: () => void;
  onCancelPendingBooking?: (bookingId: string) => void;
  onClose: () => void;
  showToast?: (msg: string, type?: 'info' | 'warning' | 'error' | 'success') => void;
  isLoadingRoute?: boolean;
  isRouteShown?: boolean;
  onToggleRoute?: () => void;
}

export const CommuteBookingCard: React.FC<CommuteBookingCardProps> = ({
  driver,
  isDark,
  customerBookings,
  isBooking,
  onBookSeat,
  onRequestCancellation,
  onCancelPendingBooking,
  onClose,
  showToast = () => {},
  isLoadingRoute = false,
  isRouteShown = false,
  onToggleRoute,
}) => {
  const driverId = String(driver.driverId || driver.id || '');
  const driverName = driver.name || driver.fullName || 'كابتن الخط الدائمي';
  const driverPhone = driver.phone || driver.phoneNumber || '';
  const totalSeats = driver.seats || 4;
  const takenSeats = driver.takenSeats || 0;
  const remainingSeats = Math.max(0, totalSeats - takenSeats);
  const fromLoc = driver.from || driver.routeStartName || 'نقطة الانطلاق';
  const toLoc = driver.to || driver.routeEndName || 'الوجهة';

  // البحث عن أي حجز للراكب مع هذا السائق
  const matchingBooking = customerBookings.find((b: any) => {
    const bDrvId = String(b.driverId || b.driver_id || '');
    const bDrvPhone = String(b.driverPhone || b.driver_phone || '');
    return (
      (driverId && bDrvId && bDrvId === driverId) ||
      (driverPhone && bDrvPhone && bDrvPhone === driverPhone)
    );
  });

  const bookingStatus = (matchingBooking?.status || matchingBooking?.booking_status || '').toLowerCase();
  const isBookingPending = bookingStatus === 'pending' || bookingStatus === 'قيد الانتظار';
  const isAlreadySubscribed =
    bookingStatus === 'confirmed' ||
    bookingStatus === 'accepted' ||
    bookingStatus === 'active' ||
    bookingStatus === 'مؤكد';

  // فحص وجود أي اشتراك خط دائمي نشط لدى سائق آخر
  const hasAnyActiveCommute = customerBookings.some((b: any) => {
    const st = (b.status || b.booking_status || '').toLowerCase();
    return st === 'confirmed' || st === 'accepted' || st === 'active' || st === 'مؤكد';
  });

  return (
    <div
      className={`absolute inset-x-3 bottom-[calc(1rem+env(safe-area-inset-bottom,0.5rem))] z-40 max-w-md mx-auto rounded-3xl border shadow-2xl p-5 animate-slide-up backdrop-blur-xl transition-all duration-200 ${
        isDark
          ? 'bg-[#161C28]/95 border-amber-500/40 text-white shadow-[0_-12px_40px_rgba(0,0,0,0.8)]'
          : 'bg-white/95 border-slate-200 text-slate-900 shadow-2xl'
      }`}
      dir="rtl"
      role="region"
      aria-label="تفاصيل كابتن الخط الدائمي وحجز المقعد"
    >
      {/* الرأس: اسم الكابتن والتقييم وزر الإغلاق */}
      <div className={`flex items-center justify-between pb-3 border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white text-2xl shadow-md">
            🚌
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[16px] font-black">{driverName}</h3>
              <span className="flex items-center gap-0.5 text-xs font-bold text-amber-500">
                <span>⭐</span>
                <span>{driver.rating ? Number(driver.rating).toFixed(1) : '5.0'}</span>
              </span>
            </div>
            <p className={`text-[12px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              {driver.carModel || driver.vehicleInfo || 'مركبة معتمدة'} {driver.plateNumber ? `(${driver.plateNumber})` : ''}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className={`h-9 w-9 rounded-full flex items-center justify-center text-sm font-bold border transition cursor-pointer active:scale-95 ${
            isDark
              ? 'bg-slate-800 border-white/15 text-slate-300 hover:text-white'
              : 'bg-slate-100 border-slate-300 text-slate-600 hover:text-slate-900'
          }`}
          aria-label="إغلاق بطاقة الكابتن"
        >
          ✕
        </button>
      </div>

      {/* تفاصيل مسار الخط والمقاعد */}
      <div className="py-3 space-y-2">
        <div className={`p-3 rounded-2xl border space-y-1.5 ${isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
          <div className="flex items-center justify-between text-xs font-bold">
            <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>مسار الخط:</span>
            <span className="text-emerald-500 dark:text-emerald-400">
              {driver.shift ? `فترة الدوام: ${driver.shift}` : 'دوام يومي منتظم 🕒'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-sm font-black">
            <span className="text-emerald-500">🟢 {fromLoc}</span>
            <span className="text-slate-400">➔</span>
            <span className="text-red-500">🔴 {toLoc}</span>
          </div>
        </div>

        {/* عداد المقاعد الشاغرة وشارات الحالة */}
        <div className="flex items-center justify-between px-1 text-xs">
          <div className="flex items-center gap-2">
            <span className={`font-bold ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>المقاعد المتاحة:</span>
            {driver.isFull || remainingSeats <= 0 ? (
              <span className="px-2 py-0.5 rounded-lg bg-red-500/20 text-red-500 font-bold border border-red-500/30">
                مكتمل غير متاح 🚫
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-500 font-bold border border-emerald-500/30">
                {remainingSeats} من {totalSeats} مقاعد شاغرة 💺
              </span>
            )}
          </div>

          {onToggleRoute && (
            <button
              type="button"
              onClick={onToggleRoute}
              disabled={isLoadingRoute}
              className={`text-xs font-bold transition flex items-center gap-1 cursor-pointer underline ${
                isDark ? 'text-amber-400 hover:text-amber-300' : 'text-amber-600 hover:text-amber-700'
              }`}
            >
              {isLoadingRoute ? (
                <span className="animate-pulse">جاري جلب المسار...</span>
              ) : isRouteShown ? (
                <>
                  <span>إخفاء المسار</span>
                  <span>✕</span>
                </>
              ) : (
                <>
                  <span>عرض المسار على الخريطة</span>
                  <span>🛣️</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* أزرار الإجراءات وحجز المقعد */}
      <div className="pt-2 space-y-2.5">
        {isBookingPending ? (
          <div className="space-y-2">
            <button
              type="button"
              disabled
              className="w-full min-h-[48px] rounded-xl bg-amber-500/20 border border-amber-500/40 py-3 text-center text-[15px] font-black text-amber-500 shadow-none cursor-not-allowed flex items-center justify-center gap-2"
            >
              <span className="animate-pulse">طلب الحجز قيد المراجعة لدى الكابتن</span>
              <span className="text-[17px]">⏳</span>
            </button>
            {onCancelPendingBooking && matchingBooking && (
              <button
                type="button"
                onClick={() => onCancelPendingBooking(matchingBooking.id || matchingBooking.bookingId)}
                className="w-full text-center text-xs font-bold text-red-400 hover:underline py-1 cursor-pointer"
              >
                إلغاء طلب الحجز المعلق ✕
              </button>
            )}
          </div>
        ) : isAlreadySubscribed ? (
          <div className="space-y-2">
            <button
              type="button"
              disabled
              className="w-full min-h-[48px] rounded-xl bg-gray-600/90 py-3 text-center text-[15px] font-black text-white/90 shadow-none cursor-not-allowed flex items-center justify-center gap-2 border border-white/10"
            >
              <span>مشترك بالفعل في هذا الخط</span>
              <span className="text-[17px]">✅</span>
            </button>
            <button
              type="button"
              onClick={onRequestCancellation}
              className="w-full min-h-[44px] rounded-xl border border-red-500/40 bg-red-500/15 hover:bg-red-500/25 py-2.5 text-center text-[13px] font-bold text-red-500 transition active:scale-95 cursor-pointer"
            >
              طلب إلغاء الاشتراك في الخط ✕
            </button>
          </div>
        ) : driver.isFull || remainingSeats <= 0 ? (
          <div className="space-y-1">
            <button
              type="button"
              disabled
              className="w-full min-h-[48px] rounded-xl bg-slate-600/90 py-3 text-center text-[15px] font-black text-white/90 shadow-none cursor-not-allowed flex items-center justify-center gap-2 border border-white/10"
            >
              <span>الكابتن مكتمل - غير متاح</span>
              <span className="text-[17px]">🚫</span>
            </button>
            <p className="text-center text-[11px] font-semibold text-slate-400">
              جميع مقاعد هذا الخط محجوزة بالكامل حالياً.
            </p>
          </div>
        ) : hasAnyActiveCommute && !matchingBooking ? (
          <div className="space-y-1">
            <div className="w-full min-h-[48px] rounded-xl bg-red-500/15 border border-red-500/40 py-3 text-center text-[14px] font-black text-red-500 flex items-center justify-center gap-2">
              <span>لديك اشتراك نشط في خط آخر</span>
              <span className="text-[17px]">🚫</span>
            </div>
            <p className="text-center text-[11px] font-semibold text-red-500">
              يجب إلغاء اشتراكك الحالي وتأكيد الإلغاء قبل الاشتراك في خط آخر.
            </p>
          </div>
        ) : (
          <button
            type="button"
            disabled={isBooking}
            onClick={onBookSeat}
            className="w-full min-h-[50px] rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] py-3.5 text-center text-[16px] font-black text-white shadow-[0_6px_20px_rgba(16,185,129,0.35)] cursor-pointer transition flex items-center justify-center gap-2 disabled:opacity-70"
          >
            {isBooking ? (
              <span className="animate-pulse">جاري إرسال طلب الحجز للكابتن...</span>
            ) : (
              <>
                <span>حجز مقعد</span>
                <span className="text-[18px]">💺</span>
              </>
            )}
          </button>
        )}

        {/* أزرار الاتصال والواتساب مع الكابتن */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              if (driverPhone) window.open(`tel:${driverPhone}`);
              else showToast('رقم هاتف السائق غير متوفر', 'info');
            }}
            className={`flex-1 flex min-h-[44px] h-11 items-center justify-center gap-1.5 rounded-xl border text-[13px] font-bold cursor-pointer transition active:scale-95 ${
              isDark ? 'border-white/20 text-white hover:bg-white/10' : 'border-slate-300 text-slate-700 hover:bg-slate-100 shadow-sm'
            }`}
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.95 12a19.79 19.79 0 0 1-3-8.59A2 2 0 0 1 4 1.37h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            <span>اتصال</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (driverPhone) {
                const text = encodeURIComponent(`مرحباً كابتن ${driverName}، أود الاستفسار عن الخط الدائمي.`);
                window.open(`https://wa.me/${driverPhone}?text=${text}`, '_blank');
              } else {
                showToast('رقم هاتف السائق غير متوفر', 'info');
              }
            }}
            className={`flex-1 flex min-h-[44px] h-11 items-center justify-center gap-1.5 rounded-xl border text-[13px] font-bold cursor-pointer transition active:scale-95 ${
              isDark ? 'border-white/20 text-white hover:bg-white/10' : 'border-slate-300 text-slate-700 hover:bg-slate-100 shadow-sm'
            }`}
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>واتساب</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CommuteBookingCard;
