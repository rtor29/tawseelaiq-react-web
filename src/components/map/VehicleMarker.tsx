// العلامة المتحركة السلسة — بديل SmoothVehicleMarker.dart
// يستخدم requestAnimationFrame للاستيفاء الخطي بين إحداثيتين مع دوران الاتجاه،
// بنفس منحنى easeInOut ومدة 1000ms من النسخة الأصلية

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

// استيفاء الزاوية عبر أقصر قوس (كما في _interpolateHeading)
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
  const [current, setCurrent] = useState({ lat: targetLat, lng: targetLng, heading: targetHeading });
  const frameRef = useRef<number>(0);
  const currentRef = useRef(current);

  useEffect(() => {
    const start = { ...currentRef.current };
    const changed =
      start.lat !== targetLat || start.lng !== targetLng || start.heading !== targetHeading;
    if (!changed) return;

    const t0 = performance.now();

    const tick = (now: number) => {
      const raw = Math.min((now - t0) / ANIMATION_MS, 1);
      const t = easeInOut(raw);
      const next = {
        lat: start.lat + (targetLat - start.lat) * t,
        lng: start.lng + (targetLng - start.lng) * t,
        heading: interpolateHeading(start.heading, targetHeading, t),
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
  isAvailable = true,
  onClick,
}: VehicleMarkerProps) {
  const current = useAnimatedPosition(targetLat, targetLng, targetHeading);

  return (
    <Marker longitude={current.lng} latitude={current.lat} anchor="center" onClick={onClick}>
      <div className="relative flex flex-col items-center justify-center cursor-pointer select-none">
        {title && (
          <span className="absolute -top-7 rounded-md bg-[#1B4965] px-2 py-0.5 text-[10px] font-bold text-white shadow-md whitespace-nowrap z-10 border border-white/20">
            {title}
          </span>
        )}
        <div
          className="transition-transform duration-500 ease-out will-change-transform filter drop-shadow-[0_4px_10px_rgba(27,73,101,0.38)]"
          style={{ transform: `rotate(${current.heading}deg)` }}
        >
          {/* أيقونة سيارة مسطحة وعصرية من الأعلى (Flat Minimal Top-down SVG) */}
          <svg
            width="42"
            height="42"
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* ظل خفيف للسيارة */}
            <rect x="11" y="6" width="26" height="38" rx="7" fill="rgba(0,0,0,0.18)" />

            {/* مرايا جانبية */}
            <rect x="8.5" y="16" width="3.5" height="5.5" rx="1.75" fill="#1B4965" stroke="#14364A" strokeWidth="0.75" />
            <rect x="36" y="16" width="3.5" height="5.5" rx="1.75" fill="#1B4965" stroke="#14364A" strokeWidth="0.75" />

            {/* هيكل السيارة الأساسي - كحلي التوصيلة #1B4965 */}
            <rect x="12" y="5" width="24" height="38" rx="6.5" fill="#1B4965" stroke="#14364A" strokeWidth="1" />

            {/* مصابيح أمامية مضيئة - كهرماني دافئ */}
            <rect x="13.5" y="5.5" width="4" height="2" rx="1" fill="#FBBF24" />
            <rect x="30.5" y="5.5" width="4" height="2" rx="1" fill="#FBBF24" />

            {/* شفة الصدام الأمامي - لمسة كهرمانية دافئة #D97706 */}
            <rect x="18" y="5.2" width="12" height="1.6" rx="0.8" fill="#D97706" />

            {/* الزجاج الأمامي - سماوي ناعم */}
            <path
              d="M 15 17.5 L 33 17.5 C 32 12.5 31.5 10.5 30 9.5 C 28.5 8.5 19.5 8.5 18 9.5 C 16.5 10.5 16 12.5 15 17.5 Z"
              fill="#BAE6FD"
              stroke="#7DD3FC"
              strokeWidth="0.5"
            />

            {/* النوافذ الجانبية - سماوي ناعم */}
            <path d="M 14.2 19 L 15.5 19 L 15.5 30 L 14.2 29.5 Z" fill="#BAE6FD" />
            <path d="M 32.5 19 L 33.8 19 L 33.8 29.5 L 32.5 30 Z" fill="#BAE6FD" />

            {/* سقف السيارة الداخلي مع شعار توصيلة */}
            <rect x="16.5" y="18.5" width="15" height="12" rx="2.5" fill="#163A50" />
            <image href="/logo.png" x="18" y="19" width="12" height="11" preserveAspectRatio="xMidYMid meet" />

            {/* لافتة تاكسي على السقف / شارة كهرمانية أنيقة #D97706 */}
            <rect x="20" y="23" width="8" height="3.2" rx="1.6" fill={isAvailable ? '#F59E0B' : '#D97706'} />
            <circle cx="24" cy="24.6" r="0.75" fill={isAvailable ? '#FEF08A' : '#FEF3C7'} />

            {/* الزجاج الخلفي - سماوي ناعم */}
            <path
              d="M 16 31.5 L 32 31.5 C 31 34.5 30 35.5 28.5 36 C 27 36.5 21 36.5 19.5 36 C 18 35.5 17 34.5 16 31.5 Z"
              fill="#BAE6FD"
              stroke="#7DD3FC"
              strokeWidth="0.5"
            />

            {/* المصابيح الخلفية - أحمر أنيق */}
            <rect x="13.5" y="41.5" width="4" height="1.5" rx="0.75" fill="#EF4444" />
            <rect x="30.5" y="41.5" width="4" height="1.5" rx="0.75" fill="#EF4444" />
          </svg>
        </div>
      </div>
    </Marker>
  );
}
