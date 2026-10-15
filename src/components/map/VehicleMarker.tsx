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
    <Marker longitude={current.lng} latitude={current.lat} anchor="bottom" onClick={onClick}>
      <div className="flex flex-col items-center cursor-pointer select-none">
        {title && (
          <span className="mb-0.5 rounded-lg bg-brand-slate/90 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-md whitespace-nowrap">
            {title}
          </span>
        )}
        <div
          className="flex h-11 w-11 items-center justify-center rounded-full border-[2.5px] border-white shadow-lg transition-colors"
          style={{ backgroundColor: isAvailable ? '#F59E0B' : '#6B7280' }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            style={{ transform: `rotate(${current.heading}deg)` }}
          >
            <path d="M12 2L19 21L12 17.5L5 21L12 2Z" fill="#0F172A" />
          </svg>
        </div>
      </div>
    </Marker>
  );
}
