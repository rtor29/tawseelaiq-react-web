// أدوات جغرافية — بديل Geolocator.distanceBetween و latlong2 Distance

import { IRAQ_DEFAULT_CENTER } from './config';
import type { LngLat } from '../types';

const EARTH_RADIUS_M = 6371000;

export function distanceMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s));
}

export function distanceKm(a: LngLat, b: LngLat): number {
  return distanceMeters(a.lat, a.lng, b.lat, b.lng) / 1000;
}

/**
 * حساب زاوية الاتجاه (Bearing / Heading) بالدرجات بين نقطتين جغرافيين
 * الصيغة الكروية الرياضية:
 * bearing = atan2(sin(Δλ) * cos(φ2), cos(φ1) * sin(φ2) - sin(φ1) * cos(φ2) * cos(Δλ))
 */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);

  const θ = Math.atan2(y, x);
  const deg = (θ * 180) / Math.PI;
  return (deg + 360) % 360;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function formatDistanceAr(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} متر`;
  return `${(meters / 1000).toFixed(1)} كم`;
}

/**
 * حساب أقصر مسافة بالأمتار بين نقطة ومسار هندسي (Polyline)
 * يستخدم صيغة الإسقاط العمودي مع قانون هافرسين لحساب انحراف الكابتن
 */
export function minDistanceToPolylineMeters(
  lat: number,
  lon: number,
  coordinates: Array<[number, number]>
): number {
  if (!coordinates || coordinates.length === 0) return 0;
  if (coordinates.length === 1) {
    return distanceMeters(lat, lon, coordinates[0][1], coordinates[0][0]);
  }

  let minMeters = Infinity;

  for (let i = 0; i < coordinates.length - 1; i++) {
    const [lon1, lat1] = coordinates[i];
    const [lon2, lat2] = coordinates[i + 1];

    const dx = lon2 - lon1;
    const dy = lat2 - lat1;
    const lenSq = dx * dx + dy * dy;

    let projLat = lat1;
    let projLon = lon1;

    if (lenSq > 0) {
      const u = Math.max(0, Math.min(1, ((lon - lon1) * dx + (lat - lat1) * dy) / lenSq));
      projLon = lon1 + u * dx;
      projLat = lat1 + u * dy;
    }

    const d = distanceMeters(lat, lon, projLat, projLon);
    if (d < minMeters) {
      minMeters = d;
    }
  }

  return minMeters;
}

/**
 * تنسيق الوقت المتبقي لوصول الكابتن باللغة العربية
 */
export function formatEtaArabic(secondsRemaining: number, distMeters: number): string {
  if (distMeters <= 50 || secondsRemaining <= 0) {
    return 'الكابتن وصل 🚖';
  }
  const mins = Math.max(1, Math.round(secondsRemaining / 60));
  if (mins === 1) return 'باقي دقيقة واحدة';
  if (mins === 2) return 'باقي دقيقتان';
  if (mins >= 3 && mins <= 10) return `باقي ${mins} دقائق`;
  return `باقي ${mins} دقيقة`;
}

export function iraqCenterLngLat(): LngLat {
  return { lat: IRAQ_DEFAULT_CENTER.lat, lng: IRAQ_DEFAULT_CENTER.lon };
}

export function najafCenterLngLat(): LngLat {
  return iraqCenterLngLat();
}

export function isIosDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
  );
}

export interface GeolocationFetchOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

/**
 * الحصول على الموقع الجغرافي بما يتوافق مع قيود Safari على iOS:
 * 1. timeout ممتد إلى 10 ثوانٍ مع كاش يصل إلى 10 دقائق لتسريع الاستجابة.
 * 2. محاولة بديلة تلقائية (Fallback) بدون دقة عالية (enableHighAccuracy: false) عند الـ Timeout.
 * 3. تمييز صريح لخطأ PERMISSION_DENIED لتقديم إرشادات Safari و iOS الصحيحة للمستخدم.
 */
export function getCurrentPositionWithFallback(
  onSuccess: (pos: GeolocationPosition) => void,
  onError: (err: GeolocationPositionError, isPermissionDenied: boolean, isTimeout: boolean) => void,
  options?: GeolocationFetchOptions
) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    onError(
      {
        code: 2,
        message: 'Geolocation not supported',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
      } as GeolocationPositionError,
      false,
      false
    );
    return;
  }

  const initialHighAccuracy = options?.enableHighAccuracy ?? true;
  const timeoutMs = options?.timeout ?? 10000;
  const maxAgeMs = options?.maximumAge ?? 600000;

  navigator.geolocation.getCurrentPosition(
    (pos) => onSuccess(pos),
    (err) => {
      // 1. معالجة خطأ رفض الإذن PERMISSION_DENIED (Code 1)
      if (err.code === 1) {
        onError(err, true, false);
        return;
      }

      // 2. خطة بديلة (Fallback) عند حدوث خطأ TIMEOUT (Code 3) أو تعذر الدقة العالية (Code 2):
      // إعادة المحاولة فوراً وتلقائياً بدون تفعيل الدقة العالية (enableHighAccuracy: false)
      if (initialHighAccuracy && (err.code === 3 || err.code === 2)) {
        navigator.geolocation.getCurrentPosition(
          (fallbackPos) => onSuccess(fallbackPos),
          (fallbackErr) => {
            onError(fallbackErr, fallbackErr.code === 1, fallbackErr.code === 3);
          },
          {
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 600000,
          }
        );
        return;
      }

      onError(err, false, err.code === 3);
    },
    {
      enableHighAccuracy: initialHighAccuracy,
      timeout: timeoutMs,
      maximumAge: maxAgeMs,
    }
  );
}
