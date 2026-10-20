// شاشة التتبع المباشر — بديل live_tracking_screen.dart
// اشتراك في مجموعة الرحلة عبر الاتصال اللحظي + علامة كابتن متحركة بسلاسة

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import Map, { NavigationControl, type MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { config, NAJAF_CENTER } from '../lib/config';
import { realtime } from '../lib/realtime';
import { storage } from '../lib/storage';
import type { LngLat, RouteBroadcastEvent } from '../types';
import { VehicleMarker } from '../components/map/VehicleMarker';
import { RouteLines, type RouteLineData } from '../components/map/MapPins';
import { applyArabicAndEnhancedLabels } from '../lib/mapbox';
import { Button } from '../components/ui';
import { coordinatesLabel } from '../lib/format';

export default function LiveTrackingPage() {
  const { bookingId = '' } = useParams();
  const [params] = useSearchParams();
  const driverName = params.get('driverName') ?? 'الكابتن';
  const navigate = useNavigate();
  const mapRef = useRef<MapRef>(null);

  const [driverPos, setDriverPos] = useState<LngLat>({ lat: NAJAF_CENTER.lat, lng: NAJAF_CENTER.lon });
  const [heading, setHeading] = useState(0);
  const [connected, setConnected] = useState(false);
  const [routePoints, setRoutePoints] = useState<Array<{ latitude: number; longitude: number }>>([]);

  useEffect(() => {
    let mounted = true;

    async function start() {
      await realtime.connect(storage.getToken());
      if (!mounted) return;
      setConnected(realtime.isConnected());
      const unsubLoc = realtime.onDriverLocation((e) => {
        if (!mounted) return;
        setDriverPos({ lat: e.latitude, lng: e.longitude });
        setHeading(e.heading);
        mapRef.current?.easeTo({ center: [e.longitude, e.latitude], zoom: 16, duration: 900 });
      });

      const unsubRoute = realtime.onRouteBroadcast((data: RouteBroadcastEvent) => {
        if (mounted && data.points) setRoutePoints(data.points);
      });

      await realtime.joinTrip(bookingId);
      if (!mounted) {
        unsubLoc();
        unsubRoute();
        return;
      }

      return () => {
        unsubLoc();
        unsubRoute();
      };
    }

    let cleanup: (() => void) | undefined;
    void start().then((fn) => (cleanup = fn));

    return () => {
      mounted = false;
      cleanup?.();
      void realtime.leaveTrip(bookingId);
    };
  }, [bookingId]);

  const lines: RouteLineData[] = routePoints.length
    ? [{ id: 'live-route', coordinates: routePoints.map((p) => [p.longitude, p.latitude]), color: '#F59E0B' }]
    : [];

  return (
    <div className="flex h-dvh flex-col bg-brand-surface text-right font-cairo" dir="rtl">
      <header className="flex h-14 items-center gap-2 bg-brand-slate px-3 text-white">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-10 w-10 items-center justify-center rounded-xl hover:bg-white/10"
          aria-label="رجوع"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <h1 className="flex-1 truncate text-center text-sm font-bold">تتبع الرحلة: {driverName}</h1>
        <span className="w-10" />
      </header>

      <div className="relative flex-1">
        <Map
          ref={mapRef}
          mapboxAccessToken={config.mapboxToken}
          mapStyle={config.navigationStyle}
          initialViewState={{ longitude: driverPos.lng, latitude: driverPos.lat, zoom: 15.5 }}
          style={{ width: '100%', height: '100%' }}
          onLoad={(e) => applyArabicAndEnhancedLabels(e.target)}
        >
          <NavigationControl position="bottom-left" showCompass={false} />
          <RouteLines lines={lines} />
          <VehicleMarker targetLat={driverPos.lat} targetLng={driverPos.lng} targetHeading={heading} title={driverName} />
        </Map>

        {/* شريط حالة النجف المباشر */}
        <div className="absolute inset-x-4 top-3 z-10 flex items-center gap-2 rounded-2xl bg-white/95 px-4 py-2.5 shadow-card">
          <span className="text-red-500">📍</span>
          <span className="flex-1 text-[13px] font-bold text-brand-slate">محافظة النجف الأشرف | خريطة حية</span>
          <span
            className={`flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-[10px] font-bold ${
              connected ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${connected ? 'animate-pulse-dot bg-emerald-500' : 'bg-amber-500'}`} />
            {connected ? 'مباشر' : 'جاري الاتصال...'}
          </span>
        </div>

        {/* زر إعادة التمركز */}
        <button
          type="button"
          onClick={() => mapRef.current?.easeTo({ center: [driverPos.lng, driverPos.lat], zoom: 16, duration: 700 })}
          className="absolute bottom-52 left-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white text-brand-slate shadow-float"
          aria-label="إعادة التمركز"
        >
          🎯
        </button>

        {/* ورقة معلومات الرحلة */}
        <div className="absolute inset-x-0 bottom-0 z-10 rounded-t-3xl bg-white p-6 shadow-sheet">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-lg font-extrabold text-brand-slate">{driverName}</p>
              <p className="text-xs font-bold text-emerald-600">السائق في طريقه إليك</p>
              <p dir="ltr" className="mt-0.5 text-right text-[11px] text-slate-500">
                الإحداثيات: {coordinatesLabel(driverPos.lat, driverPos.lng)}
              </p>
            </div>
            <a
              href="tel:"
              className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-amber text-xl text-white shadow-card"
              aria-label="اتصال بالكابتن"
            >
              📞
            </a>
          </div>
          <Button variant="dark" className="mt-4 w-full" onClick={() => navigate('/hub')}>
            العودة للرئيسية
          </Button>
        </div>
      </div>
    </div>
  );
}
