// العلامة المتحركة السلسة — بديل SmoothVehicleMarker.dart
// يستخدم requestAnimationFrame للاستيفاء الخطي بين إحداثيتين مع دوران الاتجاه،
// بنفس منحنى easeInOut ومدة 1000ms، مع حماية تامة ضد وميض أو اختفاء الأيقونة

import { useEffect, useRef, useState } from 'react';
import { Marker } from 'react-map-gl';

interface VehicleMarkerProps {
  targetLat: number;
  targetLng: number;
  targetHeading: number;
  title?: string;
  isAvailable?: boolean;
  onClick?: () => void;
}

const ANIMATION_MS = 1000;

function isValidCoord(lat: any, lng: any): boolean {
  return typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng) && lat > 0 && lng > 0;
}

// استيفاء الزاوية عبر أقصر قوس
function interpolateHeading(start: number, end: number, t: number): number {
  let diff = (end - start) % 360;
  if (diff > 180) diff -= 360;
  if (diff < -180) diff += 360;
  return (start + diff * t) % 360;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

export function useAnimatedPosition(
  targetLat: number,
  targetLng: number,
  targetHeading: number,
): { lat: number; lng: number; heading: number } {
  const validInitial = isValidCoord(targetLat, targetLng);
  const [current, setCurrent] = useState({
    lat: validInitial ? targetLat : 31.9961,
    lng: validInitial ? targetLng : 44.3168,
    heading: typeof targetHeading === 'number' && !isNaN(targetHeading) ? targetHeading : 0,
  });
  const frameRef = useRef<number>(0);
  const currentRef = useRef(current);

  useEffect(() => {
    // حماية قصوى: في حال ورود إحداثيات فارغة أو غير صحيحة، نحتفظ بآخر موقع صالح ولا نتحرك إطلاقاً
    if (!isValidCoord(targetLat, targetLng)) return;

    const start = { ...currentRef.current };
    const safeHeading = typeof targetHeading === 'number' && !isNaN(targetHeading) ? targetHeading : start.heading;

    // إذا كان الموضع السابق غير صالح، ننتقل فوراً بدون استيفاء من الصفر
    if (!isValidCoord(start.lat, start.lng)) {
      const snap = { lat: targetLat, lng: targetLng, heading: safeHeading };
      currentRef.current = snap;
      setCurrent(snap);
      return;
    }

    const changed =
      start.lat !== targetLat || start.lng !== targetLng || start.heading !== safeHeading;
    if (!changed) return;

    const t0 = performance.now();

    const tick = (now: number) => {
      const raw = Math.min((now - t0) / ANIMATION_MS, 1);
      const t = easeInOut(raw);
      const next = {
        lat: start.lat + (targetLat - start.lat) * t,
        lng: start.lng + (targetLng - start.lng) * t,
        heading: interpolateHeading(start.heading, safeHeading, t),
      };
      currentRef.current = next;
      setCurrent(next);
      if (raw < 1) frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [targetLat, targetLng, targetHeading]);

  return current;
}

export function VehicleMarker({
  targetLat,
  targetLng,
  targetHeading,
  title,
  isAvailable: _isAvailable = true,
  onClick,
}: VehicleMarkerProps) {
  const current = useAnimatedPosition(targetLat, targetLng, targetHeading);

  if (!isValidCoord(current.lat, current.lng)) return null;

  return (
    <Marker longitude={current.lng} latitude={current.lat} anchor="center" onClick={onClick}>
      <div className="relative flex flex-col items-center justify-center cursor-pointer select-none">
        {title && (
          <span className="absolute -top-7 rounded-md bg-[#161C28] px-2 py-0.5 text-[10px] font-black text-amber-300 shadow-md whitespace-nowrap z-20 border border-amber-500/40">
            {title}
          </span>
        )}
        <div
          className="relative flex items-center justify-center transition-transform duration-500 ease-out will-change-transform"
          style={{ transform: `rotate(${current.heading}deg)` }}
        >
          {/* حلقة نبض هادئة */}
          <span className="absolute w-12 h-12 rounded-full bg-amber-400/20 animate-ping pointer-events-none" />

          {/* مؤشر اتجاه أمامي مميز */}
          <div className="absolute -top-2 w-3 h-3 rotate-45 bg-amber-400 border border-slate-900 shadow-sm z-0" />

          {/* قرص شعار توصيلة الموحد مع إيقونة احتياطية تضمن عدم الاختفاء */}
          <div className="relative z-10 w-11 h-11 rounded-full bg-[#161C28] border-2 border-[#FFB77D] shadow-[0_4px_14px_rgba(245,158,11,0.35)] flex items-center justify-center p-1.5 hover:scale-105 transition-transform">
            <img
              src="/logo.png"
              alt="توصيلة"
              className="w-full h-full object-contain drop-shadow"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <span className="text-amber-400 text-lg font-black select-none pointer-events-none absolute opacity-30">
              🚖
            </span>
          </div>
        </div>
      </div>
    </Marker>
  );
}
