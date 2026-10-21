import React, { useState, useEffect, useRef } from 'react';
import { playIncomingTripAlert } from '../lib/sound';

export interface IncomingRideRequest {
  id: string;
  rideId?: string;
  status?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  pickupName: string;
  dropoffName: string;
  fare: number;
  totalFare?: number;
  pickupLat: number;
  pickupLon: number;
  distanceKm?: number;
  surgeMultiplier?: number;
  surgeBadge?: { text: string; type: string; percent?: number };
  isRoundTrip?: boolean;
  tripType?: string;
  secondDestination?: string;
  stopDuration?: number;
  expectedWaitMinutes?: number;
  waitDuration?: number;
  stepTimeoutAt?: number;
  serverTimestamp?: number;
  tier?: string;
  price?: number;
  routeCoordinates?: [number, number][];
  pickupLocation?: any;
  pickupLng?: number;
}

interface IncomingTripDispatchSheetProps {
  incomingRequest: IncomingRideRequest | null;
  isDark: boolean;
  onAccept: () => void;
  onReject: () => void;
}

export const IncomingTripDispatchSheet: React.FC<IncomingTripDispatchSheetProps> = React.memo(
  ({ incomingRequest, isDark, onAccept, onReject }) => {
    const currentRideId = incomingRequest ? String(incomingRequest.id || incomingRequest.rideId || '') : null;

    // احتساب الثواني المتبقية استناداً إلى stepTimeoutAt من الخادم وفرق الساعة
    const computeInitialRemaining = () => {
      if (incomingRequest?.stepTimeoutAt) {
        const skew = incomingRequest.serverTimestamp ? (Date.now() - incomingRequest.serverTimestamp) : 0;
        const remaining = Math.max(0, Math.round((incomingRequest.stepTimeoutAt - (Date.now() - skew)) / 1000));
        return Math.min(20, Math.max(0, remaining));
      }
      return 20;
    };

    const [countdown, setCountdown] = useState<number>(computeInitialRemaining);
    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const lastAlertRideIdRef = useRef<string | null>(null);

    useEffect(() => {
      if (!currentRideId) {
        lastAlertRideIdRef.current = null;
        setIsSubmitting(false);
        return;
      }

      // حساب العداد عند وصول طلب جديد أو تغير المعرّف
      const initial = computeInitialRemaining();
      setCountdown(initial);
      setIsSubmitting(false);

      // تشغيل نغمة التنبيه والاهتزاز مرة واحدة فقط لكل طلب فريد
      if (lastAlertRideIdRef.current !== currentRideId) {
        lastAlertRideIdRef.current = currentRideId;
        try {
          playIncomingTripAlert();
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate([200, 100, 200, 100, 300]);
          }
        } catch (err) {
          console.warn('[DispatchSheet] Audio/Haptic notification error:', err);
        }
      }

      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (incomingRequest?.stepTimeoutAt) {
            const skew = incomingRequest.serverTimestamp ? (Date.now() - incomingRequest.serverTimestamp) : 0;
            const remaining = Math.round((incomingRequest.stepTimeoutAt - (Date.now() - skew)) / 1000);
            if (remaining <= 0) {
              clearInterval(timer);
              onReject();
              return 0;
            }
            return Math.min(20, remaining);
          }
          if (prev <= 1) {
            clearInterval(timer);
            onReject();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }, [currentRideId, incomingRequest?.stepTimeoutAt, onReject]);

    if (!incomingRequest || !currentRideId) {
      return null;
    }

    const totalFareDisplay = Number(
      incomingRequest.totalFare ?? incomingRequest.fare ?? incomingRequest.price ?? 0
    ).toLocaleString();

    const isRoundTripRide = Boolean(incomingRequest.isRoundTrip || incomingRequest.tripType === 'ROUND_TRIP');
    const expectedWaitMins = incomingRequest.expectedWaitMinutes || incomingRequest.waitDuration || incomingRequest.stopDuration || 15;

    const handleAcceptClick = () => {
      if (isSubmitting) return;
      setIsSubmitting(true);
      onAccept();
    };

    const handleRejectClick = () => {
      if (isSubmitting) return;
      setIsSubmitting(true);
      onReject();
    };

    return (
      <div className="fixed inset-x-0 bottom-0 z-[9999] p-4 max-w-lg mx-auto pointer-events-auto animate-slide-up" dir="rtl">
        <div
          className={`rounded-3xl border-2 border-amber-500 p-5 shadow-[0_-12px_40px_rgba(0,0,0,0.9)] backdrop-blur-2xl space-y-3 ${
            isDark ? 'bg-[#161C28]/95 text-white' : 'bg-white/98 text-slate-900 shadow-2xl'
          }`}
          role="dialog"
          aria-modal="true"
          aria-label="طلب مشوار جديد وارد"
        >
          {/* شريط العد التنازلي التفاعلي المنفصل في هذا المكون فقط */}
          <div className={`w-full h-2 rounded-full overflow-hidden mb-1 ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all duration-1000 ease-linear rounded-full"
              style={{ width: `${Math.min(100, Math.max(0, (countdown / 20) * 100))}%` }}
              role="progressbar"
              aria-valuenow={countdown}
              aria-valuemin={0}
              aria-valuemax={20}
            />
          </div>

          <div className={`flex items-center justify-between pb-2 border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-500 dark:text-amber-300 px-3 py-1 text-xs font-black animate-pulse" aria-live="polite">
                طلب مشوار جديد ({countdown} ثانية) 🚖
              </span>
              {(incomingRequest.surgeBadge || (incomingRequest.surgeMultiplier && incomingRequest.surgeMultiplier > 1.05)) && (
                <span className="rounded-full bg-amber-500 text-slate-950 font-black px-2 py-0.5 text-[11px] shadow-xs">
                  ⚡ ذروة
                </span>
              )}
            </div>
            <span className="text-xl font-black text-amber-500 dark:text-amber-400 font-mono">
              {totalFareDisplay} د.ع
            </span>
          </div>

          <div className="text-right space-y-1.5 text-xs">
            <p className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>
              الراكب: {incomingRequest.customerName || 'راكب توصيلة'}
            </p>
            <div
              className={`p-3 rounded-2xl border space-y-1 ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <p className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                🟢 من: <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{incomingRequest.pickupName}</span>
              </p>
              <p className={isDark ? 'text-slate-300' : 'text-slate-700'}>
                🔴 إلى: <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{incomingRequest.dropoffName}</span>
              </p>

              {/* شارة ذهاب وإياب مع مدة الانتظار المتوقعة */}
              {isRoundTripRide && (
                <div className="pt-1 flex items-center justify-between border-t border-amber-500/20 mt-1">
                  <span className="text-amber-500 dark:text-amber-400 font-bold flex items-center gap-1.5">
                    <span>🔄</span>
                    <span>رحلة ذهاب وإياب</span>
                  </span>
                  <span className="text-slate-400 font-medium text-[11px]">
                    مدة الانتظار: {expectedWaitMins} دقيقة ⏳
                  </span>
                </div>
              )}

              {incomingRequest.secondDestination && (
                <p className="text-amber-600 dark:text-amber-300 flex items-center gap-1.5 pt-0.5">
                  <span>📍</span>
                  <span>
                    محطة إضافية: <b className={isDark ? 'text-white' : 'text-slate-900'}>{incomingRequest.secondDestination}</b>
                  </span>
                </p>
              )}
              {incomingRequest.stopDuration && !isRoundTripRide ? (
                <p className="text-amber-600 dark:text-amber-300 flex items-center gap-1.5 pt-0.5">
                  <span>⏱️</span>
                  <span>
                    توقف في الطريق: <b className={isDark ? 'text-white' : 'text-slate-900'}>{incomingRequest.stopDuration} دقائق</b>
                  </span>
                </p>
              ) : null}
            </div>
          </div>

          {/* أزرار القبول والرفض - معايير Google Material 3 (مسافات أمان >= 12px) */}
          <div className="flex flex-col gap-3 pt-1">
            {/* زر القبول العريض الفاخر (56px) */}
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleAcceptClick}
              aria-label={`قبول المشوار، الأجرة ${totalFareDisplay} دينار عراقي`}
              className="w-full min-h-[56px] h-14 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-slate-950 font-black text-lg flex items-center justify-center gap-2 shadow-xl shadow-amber-500/30 active:scale-[0.98] transition hover:brightness-105 cursor-pointer font-cairo disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span>🚖</span>
              <span>{isSubmitting ? 'جاري القبول...' : `قبول المشوار 🚖 (${totalFareDisplay} د.ع)`}</span>
            </button>

            {/* زر الرفض والتجاهل (48px) */}
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleRejectClick}
              aria-label="رفض وتجاهل طلب المشوار"
              className={`w-full min-h-[48px] h-12 rounded-2xl border font-bold text-sm flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                isDark
                  ? 'bg-[#242A37] text-slate-400 hover:text-white border-slate-700/60'
                  : 'bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-300'
              }`}
            >
              <span>رفض وتجاهل ✕</span>
            </button>
          </div>
        </div>
      </div>
    );
  }
);
