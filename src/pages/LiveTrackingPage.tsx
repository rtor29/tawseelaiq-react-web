// شاشة التتبع المباشر — بديل live_tracking_screen.dart
// اشتراك في مجموعة الرحلة عبر الاتصال اللحظي + علامة كابتن متحركة بسلاسة + حساب وقت وصول دقيق واقتصادي (Mapbox)

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Map, { NavigationControl, type MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { config, IRAQ_DEFAULT_CENTER } from '../lib/config';
import { realtime } from '../lib/realtime';
import { storage } from '../lib/storage';
import type { LngLat } from '../types';
import { VehicleMarker } from '../components/map/VehicleMarker';
import { getDirections, applyArabicAndEnhancedLabels, keepMapSized } from '../lib/mapbox';
import { distanceMeters, minDistanceToPolylineMeters, formatEtaArabic } from '../lib/geo';
import { Button } from '../components/ui';
import { coordinatesLabel } from '../lib/format';

export default function LiveTrackingPage() {
  const { bookingId = '' } = useParams();
  const [params] = useSearchParams();
  const driverName = params.get('driverName') ?? 'الكابتن';
  const rawPickupLat = parseFloat(params.get('pickupLat') ?? '');
  const rawPickupLng = parseFloat(params.get('pickupLng') ?? '');
  const pickupPoint: LngLat = {
    lat: !isNaN(rawPickupLat) && rawPickupLat > 0 ? rawPickupLat : IRAQ_DEFAULT_CENTER.lat,
    lng: !isNaN(rawPickupLng) && rawPickupLng > 0 ? rawPickupLng : IRAQ_DEFAULT_CENTER.lon,
  };

  const navigate = useNavigate();
  const mapRef = useRef<MapRef>(null);

  const [driverPos, setDriverPos] = useState<LngLat>({ lat: IRAQ_DEFAULT_CENTER.lat, lng: IRAQ_DEFAULT_CENTER.lon });
  const [heading, setHeading] = useState(0);
  const [connected, setConnected] = useState(false);

  // نظام تتبع الكابتن الذكي والاقتصادي (Smart Mapbox Directions & Accurate ETA)
  const [etaText, setEtaText] = useState<string>('جاري حساب وقت الوصول...');
  const [isStationary, setIsStationary] = useState<boolean>(false);
  const trackingInitialDirectionsDoneRef = useRef<boolean>(false);
  const lastDirectionsCallTimeRef = useRef<number>(0);
  const directionsCallCountRef = useRef<number>(0);
  const expectedRoutePointsRef = useRef<Array<[number, number]>>([]);
  const remainingSecondsRef = useRef<number>(0);
  const initialDurationSecondsRef = useRef<number>(0);
  const initialDistanceMetersRef = useRef<number>(0);
  const prevPosRef = useRef<LngLat | null>(null);

  useEffect(() => {
    let mounted = true;

    async function start() {
      await realtime.connect(storage.getToken());
      if (!mounted) return;
      setConnected(realtime.isConnected());

      const unsubLoc = realtime.onDriverLocation(async (e) => {
        if (!mounted) return;
        const newLat = e.latitude;
        const newLng = e.longitude;
        if (typeof newLat !== 'number' || typeof newLng !== 'number' || isNaN(newLat) || isNaN(newLng) || newLat <= 0 || newLng <= 0) return;

        setDriverPos({ lat: newLat, lng: newLng });
        if (typeof e.heading === 'number') setHeading(e.heading);
        mapRef.current?.easeTo({ center: [newLng, newLat], zoom: 16, duration: 900 });

        const prev = prevPosRef.current;
        let moved = 0;
        let stationary = false;

        if (prev) {
          moved = distanceMeters(prev.lat, prev.lng, newLat, newLng);
          stationary = moved < 3;
        }
        prevPosRef.current = { lat: newLat, lng: newLng };
        setIsStationary(stationary);

        const distToPickup = distanceMeters(newLat, newLng, pickupPoint.lat, pickupPoint.lng);
        if (distToPickup <= 50) {
          setEtaText('الكابتن وصل 🚖');
          remainingSecondsRef.current = 0;
          return;
        }

        const now = Date.now();
        const timeSinceLastCall = now - lastDirectionsCallTimeRef.current;

        // الحالة أ: بدء التتبع (استدعاء أولي لمرة واحدة لحساب المسار والوقت الأولي)
        if (!trackingInitialDirectionsDoneRef.current) {
          trackingInitialDirectionsDoneRef.current = true;
          lastDirectionsCallTimeRef.current = now;
          directionsCallCountRef.current += 1;
          const count = directionsCallCountRef.current;
          (window as any).__DIRECTIONS_CALL_COUNT__ = count;
          console.log(`[Mapbox Directions Tracker - LiveTracking] Call #${count}: Initial route fetch`);

          try {
            const origin: LngLat = { lat: newLat, lng: newLng };
            const res = await getDirections(origin, pickupPoint);
            if (res && res.durationMinutes) {
              const totalSec = Math.round(res.durationMinutes * 60);
              const totalDist = (res.distanceKm || 1) * 1000;
              initialDurationSecondsRef.current = totalSec;
              initialDistanceMetersRef.current = totalDist;
              remainingSecondsRef.current = totalSec;
              expectedRoutePointsRef.current = (res.rawGeoJson?.coordinates as Array<[number, number]>) || [];
              setEtaText(formatEtaArabic(totalSec, distToPickup));
            }
          } catch (_) {
            const fallbackSec = Math.round(distToPickup / 7);
            remainingSecondsRef.current = fallbackSec;
            setEtaText(formatEtaArabic(fallbackSec, distToPickup));
          }
          return;
        }

        // الحالة د: عند توقف الكابتن (Stationary): تجميد العداد وعدم استدعاء Directions إطلاقاً
        if (stationary) {
          setEtaText((prev) => prev || formatEtaArabic(remainingSecondsRef.current, distToPickup));
          return;
        }

        // الحالة ب + ج: انحراف الكابتن > 500م + throttle كحد أدنى 60 ثانية
        let deviationMeters = 0;
        if (expectedRoutePointsRef.current.length > 0) {
          deviationMeters = minDistanceToPolylineMeters(newLat, newLng, expectedRoutePointsRef.current);
        }

        const shouldReroute = deviationMeters > 500 && timeSinceLastCall >= 60000;

        if (shouldReroute) {
          lastDirectionsCallTimeRef.current = now;
          directionsCallCountRef.current += 1;
          const count = directionsCallCountRef.current;
          (window as any).__DIRECTIONS_CALL_COUNT__ = count;
          console.log(`[Mapbox Directions Tracker - LiveTracking] Call #${count}: Deviation detected (${Math.round(deviationMeters)}m > 500m), re-routing`);

          try {
            const origin: LngLat = { lat: newLat, lng: newLng };
            const res = await getDirections(origin, pickupPoint);
            if (res && res.durationMinutes) {
              const totalSec = Math.round(res.durationMinutes * 60);
              const totalDist = (res.distanceKm || 1) * 1000;
              initialDurationSecondsRef.current = totalSec;
              initialDistanceMetersRef.current = totalDist;
              remainingSecondsRef.current = totalSec;
              expectedRoutePointsRef.current = (res.rawGeoJson?.coordinates as Array<[number, number]>) || [];
              setEtaText(formatEtaArabic(totalSec, distToPickup));
            }
          } catch (_) {
            const fallbackSec = Math.round(distToPickup / 7);
            remainingSecondsRef.current = fallbackSec;
            setEtaText(formatEtaArabic(fallbackSec, distToPickup));
          }
          return;
        }

        // الحركة الطبيعية على المسار: إنقاص الوقت محلياً (Zero API Calls)
        if (initialDistanceMetersRef.current > 0 && initialDurationSecondsRef.current > 0) {
          const ratio = Math.min(1, Math.max(0, distToPickup / initialDistanceMetersRef.current));
          remainingSecondsRef.current = Math.round(initialDurationSecondsRef.current * ratio);
        } else {
          remainingSecondsRef.current = Math.round(distToPickup / 7);
        }

        setEtaText(formatEtaArabic(remainingSecondsRef.current, distToPickup));
      });

      await realtime.joinTrip(bookingId);
      if (!mounted) {
        unsubLoc();
        return;
      }

      return () => {
        unsubLoc();
      };
    }

    let cleanup: (() => void) | undefined;
    void start().then((fn) => (cleanup = fn));

    return () => {
      mounted = false;
      cleanup?.();
      void realtime.leaveTrip(bookingId);
    };
  }, [bookingId, pickupPoint.lat, pickupPoint.lng]);

  return (
    <div className="flex h-dvh flex-col bg-brand-surface text-right font-cairo" dir="rtl">
      <header className="flex h-14 items-center gap-2 bg-brand-slate px-3 text-white">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10 cursor-pointer"
          aria-label="رجوع"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <h1 className="flex-1 truncate text-center text-sm font-bold">تتبع الرحلة: {driverName}</h1>
        <span className="w-10" />
      </header>

      <div className="relative flex-1 touch-none" style={{ touchAction: 'none' }}>
        <Map
          ref={mapRef}
          reuseMaps
          mapboxAccessToken={config.mapboxToken}
          mapStyle={config.navigationStyle}
          initialViewState={{ longitude: driverPos.lng, latitude: driverPos.lat, zoom: 15.5 }}
          dragPan={true}
          cooperativeGestures={false}
          style={{ width: '100%', height: '100%' }}
          onLoad={(e) => {
            applyArabicAndEnhancedLabels(e.target);
            keepMapSized(e.target);
          }}
        >
          <NavigationControl position="bottom-left" showCompass={false} />
          <VehicleMarker targetLat={driverPos.lat} targetLng={driverPos.lng} targetHeading={heading} title={driverName} />
        </Map>

        {/* شريط الحالة المباشر مع وقت الوصول المتبقي (ETA) */}
        <div className="absolute inset-x-4 top-3 z-10 flex flex-col gap-1.5 rounded-2xl bg-white/95 p-3 shadow-card border border-amber-500/30 backdrop-blur-md">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-xl shrink-0">🚖</span>
              <span className="text-[14px] font-black text-brand-slate">{etaText}</span>
            </div>
            <span
              className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-[10px] font-bold shrink-0 ${
                connected ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${connected ? 'animate-pulse-dot bg-emerald-500' : 'bg-amber-500'}`} />
              {connected ? 'مباشر' : 'جاري الاتصال...'}
            </span>
          </div>
          {isStationary && !etaText.includes('وصل') && (
            <p className="text-[10.5px] text-amber-600 font-bold flex items-center gap-1">
              <span>⏸️</span>
              <span>الكابتن متوقف في ازدحام/إشارة (العداد مجمّد)</span>
            </p>
          )}
        </div>

        {/* زر إعادة التمركز */}
        <button
          type="button"
          onClick={() => mapRef.current?.easeTo({ center: [driverPos.lng, driverPos.lat], zoom: 16, duration: 700 })}
          className="absolute bottom-52 left-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white text-brand-slate shadow-float cursor-pointer hover:bg-slate-50 transition"
          aria-label="إعادة التمركز"
        >
          🎯
        </button>

        {/* ورقة معلومات الرحلة */}
        <div className="absolute inset-x-0 bottom-0 z-10 rounded-t-3xl bg-white p-6 shadow-sheet">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-lg font-extrabold text-brand-slate">{driverName}</p>
              <p className="text-sm font-black text-amber-600 mt-0.5">{etaText}</p>
              <p dir="ltr" className="mt-1 text-right text-[11px] text-slate-500">
                الإحداثيات: {coordinatesLabel(driverPos.lat, driverPos.lng)}
              </p>
            </div>
            <a
              href="tel:"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-amber text-xl text-white shadow-card cursor-pointer hover:scale-105 transition"
              aria-label="اتصال بالكابتن"
            >
              📞
            </a>
          </div>
          <Button variant="dark" className="mt-4 w-full cursor-pointer" onClick={() => navigate('/hub')}>
            العودة للرئيسية
          </Button>
        </div>
      </div>
    </div>
  );
}
