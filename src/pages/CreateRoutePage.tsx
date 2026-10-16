// تخطيط وإنشاء خط السير — بديل create_route_screen.dart
// خريطة Mapbox بثلاثة أنماط (انطلاق/وصول/نقاط وسيطة)، مسار تلقائي على الشوارع،
// بحث جغرافي، وGPS مع عكس العنوان العربي

import { useCallback, useEffect, useRef, useState } from 'react';
import Map, { NavigationControl, Marker, Source, Layer, type MapMouseEvent, type MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { endpoints, http } from '../lib/api';
import { authStore } from '../lib/auth';
import { config, NAJAF_CENTER } from '../lib/config';
import { getDirections, reverseGeocode, searchPlaces, type PlaceResult, type RouteResult } from '../lib/mapbox';
import { sanitizeSearchQuery } from '../lib/sanitize';
import type { LngLat } from '../types';
import { TopBar } from '../components/TopBar';
import { Button, Field, SelectField, Spinner } from '../components/ui';
import { useToast } from '../components/Toast';

type MapMode = 'start' | 'end' | 'waypoint';

const KUFA_UNIVERSITY: LngLat = { lat: 32.03, lng: 44.37 };

export default function CreateRoutePage() {
  const mapRef = useRef<MapRef>(null);
  const { show } = useToast();
  const driverId = authStore.getSession()?.userId ?? '';

  const [routeName, setRouteName] = useState('خط النجف - الكوفة اليومي');
  const [startName, setStartName] = useState('مرقد الإمام علي (ع) - مركز النجف');
  const [endName, setEndName] = useState('جامعة الكوفة - مجمع الكليات');
  const [seats, setSeats] = useState('4');
  const [price, setPrice] = useState('3000');
  const [departureTime, setDepartureTime] = useState('07:30');

  const [startPoint, setStartPoint] = useState<LngLat>({ lat: NAJAF_CENTER.lat, lng: NAJAF_CENTER.lon });
  const [endPoint, setEndPoint] = useState<LngLat>(KUFA_UNIVERSITY);
  const [waypoints, setWaypoints] = useState<LngLat[]>([]);
  const [mode, setMode] = useState<MapMode>('start');

  const [route, setRoute] = useState<RouteResult | null>(null);
  const [isFetchingRoute, setIsFetchingRoute] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  // بحث الأماكن داخل نافذة مشتركة
  const [searchOpenFor, setSearchOpenFor] = useState<'start' | 'end' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const searchTimer = useRef<number | null>(null);

  const traceRoute = useCallback(async (from: LngLat, to: LngLat, wps: LngLat[]) => {
    setIsFetchingRoute(true);
    try {
      const result = await getDirections(from, to, wps);
      setRoute(result);
      // ملاءمة الخريطة على حدود المسار
      const lons = result.coordinates.map((p) => p.lng);
      const lats = result.coordinates.map((p) => p.lat);
      mapRef.current?.fitBounds(
        [
          [Math.min(...lons), Math.min(...lats)],
          [Math.max(...lons), Math.max(...lats)],
        ],
        { padding: 60, duration: 800 },
      );
    } finally {
      setIsFetchingRoute(false);
    }
  }, []);

  useEffect(() => {
    void traceRoute(startPoint, endPoint, waypoints);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleMapClick(e: MapMouseEvent) {
    const point: LngLat = { lat: e.lngLat.lat, lng: e.lngLat.lng };
    if (mode === 'waypoint') {
      const next = [...waypoints, point];
      setWaypoints(next);
      void traceRoute(startPoint, endPoint, next);
      return;
    }

    if (mode === 'start') setStartPoint(point);
    else setEndPoint(point);
    void traceRoute(mode === 'start' ? point : startPoint, mode === 'start' ? endPoint : point, waypoints);

    const addr = await reverseGeocode(point);
    const label = addr ?? `${mode === 'start' ? 'نقطة انطلاق' : 'نقطة وصول'} (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`;
    if (mode === 'start') setStartName(label);
    else setEndName(label);
  }

  function useGpsAsStart() {
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const point: LngLat = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setStartPoint(point);
        mapRef.current?.flyTo({ center: [point.lng, point.lat], zoom: 15, duration: 800 });
        const placeName = await reverseGeocode(point);
        setStartName(placeName ?? `موقعي الحالي (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`);
        await traceRoute(point, endPoint, waypoints);
        setIsLocating(false);
        show('تم تحديد موقعك الحالي كنقطة الانطلاق بنجاح! 📍', 'success');
      },
      (err) => {
        setIsLocating(false);
        show(`تعذر تحديد الموقع: ${err.message}`, 'warning');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function onSearchChange(q: string) {
    const cleaned = sanitizeSearchQuery(q);
    setSearchQuery(q);
    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    if (!cleaned) {
      setSearchResults([]);
      return;
    }
    searchTimer.current = window.setTimeout(async () => {
      const results = await searchPlaces(cleaned);
      setSearchResults(results);
    }, 400);
  }

  function selectPlace(place: PlaceResult) {
    if (searchOpenFor === 'start') {
      setStartPoint({ lat: place.lat, lng: place.lon });
      setStartName(place.name);
    } else {
      setEndPoint({ lat: place.lat, lng: place.lon });
      setEndName(place.name);
    }
    setSearchOpenFor(null);
    setSearchQuery('');
    setSearchResults([]);
    mapRef.current?.flyTo({ center: [place.lon, place.lat], zoom: 14.5, duration: 800 });
    void traceRoute(
      searchOpenFor === 'start' ? { lat: place.lat, lng: place.lon } : startPoint,
      searchOpenFor === 'end' ? { lat: place.lat, lng: place.lon } : endPoint,
      waypoints,
    );
  }

  async function handleSaveRoute() {
    if (!routeName.trim() || !startName.trim() || !endName.trim()) {
      show('يرجى إدخال اسم الخط ونقاط الانطلاق والوصول', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      const [hh, mm] = departureTime.split(':');
      const formattedTime = `${hh}:${mm}:00`;

      const coordinates = (route?.coordinates.length ? route.coordinates : [startPoint, ...waypoints, endPoint]).map((p) => ({
        latitude: p.lat,
        longitude: p.lng,
      }));

      await http.post(endpoints.createRoute(driverId), {
        routeName: routeName.trim(),
        startName: startName.trim(),
        endName: endName.trim(),
        coordinates,
        waypoints: waypoints.map((w) => ({ latitude: w.lat, longitude: w.lng })),
        geoJsonPolyline: route?.rawGeoJson ?? null,
        distanceKm: route?.distanceKm ?? 0,
        durationMinutes: route?.durationMinutes ?? 0,
        bufferDistanceMeters: 1000.0,
        departureTime: formattedTime,
        availableSeats: parseInt(seats, 10) || 4,
        pricePerSeat: parseFloat(price) || 3000.0,
        isRecurring: true,
        recurringDays: '1,2,3,4,5',
      });

      show('تم إنشاء وتثبيت خط النقل بنجاح مع مسار Mapbox! 🛣️', 'success');
      navigateBack();
    } catch {
      show('فشل حفظ المسار', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  const navigateBack = () => window.history.back();

  return (
    <div className="flex h-dvh flex-col bg-white">
      <TopBar
        title="تخطيط وإنشاء خط السير (Mapbox)"
        actions={
          <button
            type="button"
            onClick={() => void traceRoute(startPoint, endPoint, waypoints)}
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/10"
            aria-label="تحديث المسار"
          >
            {isFetchingRoute ? <Spinner light className="h-4 w-4" /> : '🔄'}
          </button>
        }
      />

      <div className="flex flex-1 flex-col-reverse overflow-hidden lg:flex-row">
        {/* نموذج الإدخال */}
        <aside className="w-full space-y-3.5 overflow-y-auto border-slate-200 p-5 lg:w-[420px] lg:border-l">
          <Field label="اسم الخط *" value={routeName} onChange={(e) => setRouteName(e.target.value)} />
          <Field label="نقطة الانطلاق *" value={startName} onChange={(e) => setStartName(e.target.value)} />
          <Field label="نقطة الوصول *" value={endName} onChange={(e) => setEndName(e.target.value)} />

          <div className="grid grid-cols-2 gap-3">
            <SelectField label="عدد المقاعد" value={seats} onChange={(e) => setSeats(e.target.value)}>
              {['1', '2', '3', '4', '5', '6'].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </SelectField>
            <Field label="الأجرة للمقعد (د.ع)" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>

          <Field label="وقت الانطلاق" type="time" value={departureTime} onChange={(e) => setDepartureTime(e.target.value)} />

          {/* مبدّل نمط النقر */}
          <div>
            <p className="mb-1.5 text-sm font-bold text-brand-slate">نمط النقر على الخريطة:</p>
            <div className="flex gap-2">
              {(
                [
                  ['start', '🟢 الانطلاق'],
                  ['end', '🔴 الوصول'],
                  ['waypoint', '📌 نقاط وسيطة'],
                ] as [MapMode, string][]
              ).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded-xl border py-2 text-xs font-bold transition ${
                    mode === m ? 'border-brand-amber bg-amber-50 text-amber-800' : 'border-slate-200 text-slate-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 text-sm" onClick={useGpsAsStart} disabled={isLocating}>
              {isLocating ? <Spinner className="h-4 w-4" /> : '📍'} موقعي كانطلاق
            </Button>
            <Button variant="outline" className="flex-1 text-sm" onClick={() => setSearchOpenFor(mode === 'end' ? 'end' : 'start')}>
              🔍 بحث أماكن
            </Button>
          </div>

          {route && (
            <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
              <p className="font-bold text-brand-slate">ملخص المسار المرسوم:</p>
              <p className="mt-1">المسافة: {route.distanceKm.toFixed(1)} كم • المدة: ≈ {Math.round(route.durationMinutes)} دقيقة</p>
              <p className="truncate">{route.summary}</p>
            </div>
          )}

          <Button variant="primary" className="w-full" onClick={() => void handleSaveRoute()} disabled={isSaving}>
            {isSaving ? <Spinner /> : '🛣️ حفظ ونشر الخط'}
          </Button>
        </aside>

        {/* الخريطة */}
        <div className="relative min-h-[360px] flex-1">
          <Map
            ref={mapRef}
            mapboxAccessToken={config.mapboxToken}
            mapStyle={config.navigationStyle}
            initialViewState={{ longitude: startPoint.lng, latitude: startPoint.lat, zoom: 13 }}
            style={{ width: '100%', height: '100%' }}
            onClick={handleMapClick}
          >
            <NavigationControl position="bottom-left" showCompass={false} />

            {/* خط المسار الأزرق */}
            {route && route.coordinates.length > 1 && (
              <SourceLine coordinates={route.coordinates.map((p) => [p.lng, p.lat])} />
            )}

            <Marker longitude={startPoint.lng} latitude={startPoint.lat} anchor="center">
              <span className="text-3xl drop-shadow" title={`الانطلاق: ${startName}`}>🟢</span>
            </Marker>
            {waypoints.map((w, i) => (
              <Marker key={i} longitude={w.lng} latitude={w.lat} anchor="center">
                <span className="text-2xl">{`📍${i + 1}`}</span>
              </Marker>
            ))}
            <Marker longitude={endPoint.lng} latitude={endPoint.lat} anchor="center">
              <span className="text-3xl drop-shadow" title={`الوصول: ${endName}`}>🔴</span>
            </Marker>
          </Map>

          {/* نافذة البحث */}
          {searchOpenFor && (
            <div className="absolute inset-x-4 top-4 z-20 rounded-2xl bg-white p-4 shadow-float">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-extrabold text-brand-slate">
                  بحث عن {searchOpenFor === 'start' ? 'نقطة الانطلاق' : 'نقطة الوصول'}
                </p>
                <button type="button" onClick={() => setSearchOpenFor(null)} className="text-slate-400" aria-label="إغلاق">
                  ✕
                </button>
              </div>
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="اكتب اسم منطقة في النجف..."
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-brand-amber"
              />
              {searchResults.length > 0 && (
                <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-slate-100">
                  {searchResults.map((p, i) => (
                    <button
                      key={`${p.lat}-${p.lon}-${i}`}
                      type="button"
                      onClick={() => selectPlace(p)}
                      className="flex w-full items-center gap-2 border-b border-slate-50 px-3 py-2.5 text-right text-sm hover:bg-amber-50"
                    >
                      <span className="text-brand-amber">📍</span>
                      <span className="truncate">{p.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// طبقة خط المسار (Source + Layer)
function SourceLine({ coordinates }: { coordinates: [number, number][] }) {
  return (
    <Source id="driver-route" type="geojson" data={{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }}>
      <Layer
        id="driver-route-line"
        type="line"
        layout={{ 'line-join': 'round', 'line-cap': 'round' }}
        paint={{ 'line-color': '#2563EB', 'line-width': 5.5 }}
      />
    </Source>
  );
}
