// تخطيط وإنشاء خط السير — بديل create_route_screen.dart
// خريطة Mapbox بثلاثة أنماط (انطلاق/وصول/نقاط وسيطة)، مسار تلقائي على الشوارع،
// بحث جغرافي، وGPS مع عكس العنوان العربي، دعم الثيم (isDark) وقفل المسار

import { useCallback, useEffect, useRef, useState } from 'react';
import Map, { NavigationControl, Marker, type MapMouseEvent, type MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { endpoints, http } from '../lib/api';
import { authStore } from '../lib/auth';
import { storage } from '../lib/storage';
import { config, IRAQ_DEFAULT_CENTER } from '../lib/config';
import { getDirections, reverseGeocode, searchPlaces, applyArabicAndEnhancedLabels, type PlaceResult, type RouteResult } from '../lib/mapbox';
import { RouteLines } from '../components/map/MapPins';
import { sanitizeSearchQuery } from '../lib/sanitize';
import type { LngLat } from '../types';
import { TopBar } from '../components/TopBar';
import { Button, Field, SelectField, Spinner } from '../components/ui';
import { useToast } from '../components/Toast';
import { useTheme } from '../context/ThemeContext';
import { ThemeToggleButton } from '../components/ThemeToggleButton';
import { getCurrentPositionWithFallback, isIosDevice, isStandalonePwa } from '../lib/geo';

type MapMode = 'start' | 'end' | 'waypoint';

const DEFAULT_END_POINT: LngLat = { lat: 33.3250, lng: 44.3750 };

export default function CreateRoutePage() {
  const mapRef = useRef<MapRef>(null);
  const { show } = useToast();
  const { isDark } = useTheme();
  const driverId = authStore.getSession()?.userId || storage.getUserId() || '';

  const [routeName, setRouteName] = useState('خط يومي منتظم');
  const [startName, setStartName] = useState('نقطة الانطلاق');
  const [endName, setEndName] = useState('نقطة الوصول');
  const [seats, setSeats] = useState('4');
  const [price, setPrice] = useState('3000');
  const [departureTime, setDepartureTime] = useState('07:30');

  const [startPoint, setStartPoint] = useState<LngLat>({ lat: IRAQ_DEFAULT_CENTER.lat, lng: IRAQ_DEFAULT_CENTER.lon });
  const [endPoint, setEndPoint] = useState<LngLat>(DEFAULT_END_POINT);
  const [waypoints, setWaypoints] = useState<LngLat[]>([]);
  const [mode, setMode] = useState<MapMode>('start');

  const [route, setRoute] = useState<RouteResult | null>(null);
  const [isFetchingRoute, setIsFetchingRoute] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [isRouteLocked, setIsRouteLocked] = useState(false);

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

  // جلب مسار الكابتن الحالي وحالة القفل من الخادم
  useEffect(() => {
    let isMounted = true;
    async function loadDriverRoute() {
      try {
        const { data } = await http.get<any>('/driver/fixed-location');
        if (isMounted && data?.success) {
          setIsRouteLocked(Boolean(data.route_locked));
          if (data.fixed_lat && data.fixed_lng) {
            const sp: LngLat = { lat: Number(data.fixed_lat), lng: Number(data.fixed_lng) };
            setStartPoint(sp);
            if (data.fixed_label) setStartName(data.fixed_label);

            let ep: LngLat = DEFAULT_END_POINT;
            if (data.fixed_dest_lat && data.fixed_dest_lng) {
              ep = { lat: Number(data.fixed_dest_lat), lng: Number(data.fixed_dest_lng) };
              setEndPoint(ep);
              if (data.fixed_dest_label) setEndName(data.fixed_dest_label);
            }
            if (data.route_name) setRouteName(data.route_name);
            void traceRoute(sp, ep, []);
          } else {
            void traceRoute(startPoint, endPoint, waypoints);
          }
        } else if (isMounted) {
          void traceRoute(startPoint, endPoint, waypoints);
        }
      } catch (_) {
        if (isMounted) void traceRoute(startPoint, endPoint, waypoints);
      }
    }
    void loadDriverRoute();
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleMapClick(e: MapMouseEvent) {
    if (isRouteLocked) {
      show('مسارك مثبّت ومقفل، للتعديل راجع الإدارة', 'warning');
      return;
    }

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
    if (isRouteLocked) return;
    setIsLocating(true);
    getCurrentPositionWithFallback(
      async (pos) => {
        const point: LngLat = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setStartPoint(point);
        mapRef.current?.flyTo({ center: [point.lng, point.lat], zoom: 15, duration: 800 });
        const placeName = await reverseGeocode(point);
        setStartName(placeName ?? `موقعي الحالي (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`);
        await traceRoute(point, endPoint, waypoints);
        setIsLocating(false);
        show('تم تحديد موقعك الحالي كنقطة الانطلاق بنجاح! 📍', 'success', 3000);
      },
      (_err, isPermissionDenied) => {
        setIsLocating(false);
        if (isPermissionDenied) {
          const isIOS = isIosDevice();
          const isPWA = isStandalonePwa();
          show(
            isIOS
              ? isPWA
                ? 'يرجى السماح بالوصول للموقع من إعدادات الهاتف > الخصوصية > خدمات الموقع > تطبيق توصيلة'
                : 'يرجى السماح بالوصول للموقع من إعدادات الهاتف > الخصوصية > خدمات الموقع > Safari'
              : 'يرجى السماح للتطبيق بالوصول إلى موقعك من إعدادات المتصفح',
            'warning',
            5000
          );
        } else {
          show('تعذر تحديد موقع GPS، يمكنك النقر على الخريطة لتحديده 📍', 'warning', 5000);
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 600000 }
    );
  }

  function onSearchChange(q: string) {
    if (isRouteLocked) return;
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
    if (isRouteLocked) return;
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
    if (isRouteLocked) {
      show('مسارك مثبّت ومقفل. للتعديل راجع الإدارة.', 'error');
      return;
    }

    if (!routeName.trim() || !startName.trim() || !endName.trim()) {
      show('يرجى إدخال اسم الخط ونقاط الانطلاق والوصول', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      const [hh, mm] = departureTime.split(':');
      const formattedTime = `${hh || '07'}:${mm || '30'}:00`;

      const coordinates = (route?.coordinates.length ? route.coordinates : [startPoint, ...waypoints, endPoint]).map((p) => ({
        latitude: p.lat,
        longitude: p.lng,
      }));

      const activeTargetId = driverId || authStore.getSession()?.userId || storage.getUserId() || '';

      const { data } = await http.post<any>(endpoints.createRoute(activeTargetId), {
        driverId: activeTargetId,
        routeName: routeName.trim(),
        startName: startName.trim(),
        endName: endName.trim(),
        lat: startPoint.lat,
        lng: startPoint.lng,
        destLat: endPoint.lat,
        destLng: endPoint.lng,
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

      if (data?.success) {
        show('تم إنشاء وتثبيت خط النقل بنجاح مع مسار Mapbox! 🛣️', 'success');
        setIsRouteLocked(true);
        setTimeout(() => {
          navigateBack();
        }, 1200);
      } else {
        show(data?.error || 'فشل حفظ المسار', 'error');
      }
    } catch (err: any) {
      const errMsg = err?.response?.data?.error || 'فشل حفظ المسار';
      show(errMsg, 'error');
    } finally {
      setIsSaving(false);
    }
  }

  const navigateBack = () => window.history.back();

  return (
    <div className={`flex h-dvh flex-col text-right font-cairo transition-colors ${
      isDark ? 'bg-[#080E1A] text-[#DDE2F4]' : 'bg-[#F8FAFC] text-[#0F172A]'
    }`} dir="rtl">
      <TopBar
        title="تخطيط وإنشاء خط السير (Mapbox)"
        actions={
          <div className="flex items-center gap-1.5">
            <ThemeToggleButton />
            <button
              type="button"
              onClick={() => void traceRoute(startPoint, endPoint, waypoints)}
              className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/10"
              aria-label="تحديث المسار"
              title="تحديث المسار"
            >
              {isFetchingRoute ? <Spinner light className="h-4 w-4" /> : '🔄'}
            </button>
          </div>
        }
      />

      <div className="flex flex-1 flex-col-reverse overflow-hidden lg:flex-row">
        {/* نموذج الإدخال الجانبي المستجيب للثيم */}
        <aside className={`w-full space-y-3.5 overflow-y-auto p-5 lg:w-[420px] transition-colors border-t lg:border-t-0 lg:border-s ${
          isDark ? 'bg-[#161C28] border-slate-700/50 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-sm'
        }`}>
          {/* إشعار القفل عند تثبيت المسار */}
          {isRouteLocked && (
            <div className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-center gap-2 ${
              isDark ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-amber-50 border-amber-300 text-amber-900'
            }`}>
              <span className="text-base">🔒</span>
              <span>مسارك مثبّت. للتعديل راجع الإدارة.</span>
            </div>
          )}

          <Field
            label="اسم الخط *"
            value={routeName}
            disabled={isRouteLocked}
            onChange={(e) => setRouteName(e.target.value)}
            className={isDark ? '!bg-[#242A37] !border-slate-700 !text-white' : ''}
          />
          <Field
            label="نقطة الانطلاق *"
            value={startName}
            disabled={isRouteLocked}
            onChange={(e) => setStartName(e.target.value)}
            className={isDark ? '!bg-[#242A37] !border-slate-700 !text-white' : ''}
          />
          <Field
            label="نقطة الوصول *"
            value={endName}
            disabled={isRouteLocked}
            onChange={(e) => setEndName(e.target.value)}
            className={isDark ? '!bg-[#242A37] !border-slate-700 !text-white' : ''}
          />

          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="عدد المقاعد"
              value={seats}
              disabled={isRouteLocked}
              onChange={(e) => setSeats(e.target.value)}
              className={isDark ? '!bg-[#242A37] !border-slate-700 !text-white' : ''}
            >
              {['1', '2', '3', '4', '5', '6'].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </SelectField>
            <Field
              label="الأجرة للمقعد (د.ع)"
              inputMode="numeric"
              value={price}
              disabled={isRouteLocked}
              onChange={(e) => setPrice(e.target.value)}
              className={isDark ? '!bg-[#242A37] !border-slate-700 !text-white' : ''}
            />
          </div>

          <Field
            label="وقت الانطلاق"
            type="time"
            value={departureTime}
            disabled={isRouteLocked}
            onChange={(e) => setDepartureTime(e.target.value)}
            className={isDark ? '!bg-[#242A37] !border-slate-700 !text-white' : ''}
          />

          {/* مبدّل نمط النقر */}
          <div>
            <p className={`mb-1.5 text-xs font-bold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              نمط النقر على الخريطة:
            </p>
            <div className="flex gap-2" dir="rtl">
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
                  disabled={isRouteLocked}
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded-xl border py-2 text-xs font-bold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    mode === m
                      ? isDark
                        ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                        : 'border-amber-500 bg-amber-50 text-amber-900'
                      : isDark
                        ? 'border-slate-700 text-slate-400 hover:text-white'
                        : 'border-slate-200 text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              className={`flex-1 text-sm ${isDark ? 'border-slate-700 text-slate-200 hover:bg-white/5' : ''}`}
              onClick={useGpsAsStart}
              disabled={isLocating || isRouteLocked}
            >
              {isLocating ? <Spinner className="h-4 w-4" /> : '📍'} موقعي كانطلاق
            </Button>
            <Button
              variant="outline"
              className={`flex-1 text-sm ${isDark ? 'border-slate-700 text-slate-200 hover:bg-white/5' : ''}`}
              onClick={() => setSearchOpenFor(mode === 'end' ? 'end' : 'start')}
              disabled={isRouteLocked}
            >
              🔍 بحث أماكن
            </Button>
          </div>

          {route && (
            <div className={`rounded-xl p-3 text-xs border ${
              isDark ? 'bg-[#242A37]/80 border-slate-700 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}>
              <p className={`font-bold ${isDark ? 'text-amber-400' : 'text-slate-900'}`}>ملخص المسار المرسوم:</p>
              <p className="mt-1">المسافة: {route.distanceKm.toFixed(1)} كم • المدة: ≈ {Math.round(route.durationMinutes)} دقيقة</p>
              <p className="truncate mt-0.5">{route.summary}</p>
            </div>
          )}

          {isRouteLocked ? (
            <div className="w-full py-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 font-bold text-center text-xs flex items-center justify-center gap-2 shadow-sm">
              <span>🔒</span>
              <span>مسارك مثبّت (للتعديل راجع الإدارة)</span>
            </div>
          ) : (
            <Button
              variant="primary"
              className="w-full py-3.5 font-black text-sm shadow-md"
              onClick={() => void handleSaveRoute()}
              disabled={isSaving}
            >
              {isSaving ? <Spinner /> : '🛣️ حفظ ونشر الخط'}
            </Button>
          )}
        </aside>

        {/* الخريطة */}
        <div className="relative min-h-[360px] flex-1">
          <Map
            ref={mapRef}
            mapboxAccessToken={config.mapboxToken}
            mapStyle={isDark ? 'mapbox://styles/almusawy/cmvdwkv6q003801s82f9t02om' : config.navigationStyle}
            initialViewState={{ longitude: startPoint.lng, latitude: startPoint.lat, zoom: 13 }}
            style={{ width: '100%', height: '100%' }}
            onClick={handleMapClick}
            onLoad={(e) => applyArabicAndEnhancedLabels(e.target)}
          >
            <NavigationControl position="bottom-left" showCompass={false} />

            {/* خط المسار الانسيابي النحيف */}
            {route && route.coordinates.length > 1 && (
              <RouteLines
                lines={[
                  {
                    id: 'create-route-line',
                    coordinates: route.coordinates.map((p) => [p.lng, p.lat]),
                    color: '#F59E0B',
                  },
                ]}
              />
            )}

            <Marker longitude={startPoint.lng} latitude={startPoint.lat} anchor="center">
              <span className="text-3xl drop-shadow select-none cursor-pointer" title={`الانطلاق: ${startName}`}>🟢</span>
            </Marker>
            {waypoints.map((w, i) => (
              <Marker key={i} longitude={w.lng} latitude={w.lat} anchor="center">
                <span className="text-2xl select-none cursor-pointer">{`📍${i + 1}`}</span>
              </Marker>
            ))}
            <Marker longitude={endPoint.lng} latitude={endPoint.lat} anchor="center">
              <span className="text-3xl drop-shadow select-none cursor-pointer" title={`الوصول: ${endName}`}>🔴</span>
            </Marker>
          </Map>

          {/* نافذة البحث الموحدة المستجيبة للثيم */}
          {searchOpenFor && (
            <div className={`absolute inset-x-4 top-4 z-20 rounded-2xl p-4 border shadow-2xl font-map-search ${
              isDark ? 'bg-[#161C28] text-white border-slate-700' : 'bg-white text-slate-900 border-slate-200'
            }`}>
              <div className="mb-2 flex items-center justify-between">
                <p className={`text-sm font-extrabold font-map-search ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  بحث عن {searchOpenFor === 'start' ? 'نقطة الانطلاق' : 'نقطة الوصول'}
                </p>
                <button type="button" onClick={() => setSearchOpenFor(null)} className="text-slate-400 hover:text-white" aria-label="إغلاق">
                  ✕
                </button>
              </div>
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="ابحث عن منطقة أو حي أو شارع في أي محافظة..."
                className={`w-full rounded-xl border px-4 py-2.5 text-sm outline-none font-map-search ${
                  isDark ? 'bg-[#242A37] border-slate-700 text-white focus:border-amber-500' : 'bg-white border-slate-200 text-slate-900 focus:border-amber-500'
                }`}
              />
              {searchResults.length > 0 && (
                <div
                  onMouseDown={(e) => e.preventDefault()}
                  className={`mt-2 max-h-52 overflow-y-auto rounded-xl border font-map-search divide-y ${
                    isDark ? 'bg-[#161C28] border-slate-700 divide-slate-700/50' : 'bg-white border-slate-100 divide-slate-100'
                  }`}
                >
                  {searchResults.map((p, i) => (
                    <button
                      key={`${p.lat}-${p.lon}-${i}`}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        e.stopPropagation();
                        selectPlace(p);
                      }}
                      className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-right text-sm cursor-pointer font-map-search transition ${
                        isDark ? 'hover:bg-amber-500/20 text-white' : 'hover:bg-amber-50 text-slate-800'
                      }`}
                    >
                      <span className="text-amber-500 shrink-0">📍</span>
                      <div className="flex flex-col text-right truncate font-map-search">
                        <span className="truncate font-bold">{p.name}</span>
                        <span className={`truncate text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{p.subName || p.fullName || ''}</span>
                      </div>
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
