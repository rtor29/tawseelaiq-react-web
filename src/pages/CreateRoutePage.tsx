// تخطيط وإنشاء خط السير — بديل create_route_screen.dart
// خريطة Mapbox بثلاثة أنماط (انطلاق/وصول/نقاط وسيطة)، مسار تلقائي على الشوارع،
// بحث جغرافي مباشر من حقول المسار مع كاش وقائمة منسدلة، وGPS، دعم الثيم (isDark) وقفل المسار

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Map, { NavigationControl, Marker, type MapMouseEvent, type MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { endpoints, http } from '../lib/api';
import { authStore } from '../lib/auth';
import { storage } from '../lib/storage';
import { config, IRAQ_DEFAULT_CENTER, MAPBOX_DAY_STYLE } from '../lib/config';
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
  const navigate = useNavigate();
  const mapRef = useRef<MapRef>(null);
  const { show } = useToast();
  const { isDark } = useTheme();
  const rawId = authStore.getSession()?.userId || storage.getUserId() || '';
  const driverId = rawId;

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

  // اقتراحات البحث المباشر لنقطة الانطلاق
  const [startResults, setStartResults] = useState<PlaceResult[]>([]);
  const [isSearchingStart, setIsSearchingStart] = useState(false);
  const startTimer = useRef<number | null>(null);

  // اقتراحات البحث المباشر لنقطة الوصول
  const [destResults, setDestResults] = useState<PlaceResult[]>([]);
  const [isSearchingDest, setIsSearchingDest] = useState(false);
  const destTimer = useRef<number | null>(null);

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
          const savedFare = data.fare || data.pricePerSeat || data.price;
          if (savedFare) {
            setPrice(String(savedFare));
          }
          if (data.route_name) setRouteName(data.route_name);
          if (data.total_seats || data.seats) setSeats(String(data.total_seats || data.seats));
          if (data.departure_time) setDepartureTime(data.departure_time);

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

    if (mode === 'start') {
      setStartPoint(point);
      setStartResults([]);
    } else {
      setEndPoint(point);
      setDestResults([]);
    }
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
        setIsLocating(false);
        const point: LngLat = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setStartPoint(point);
        setStartResults([]);
        mapRef.current?.flyTo({ center: [point.lng, point.lat], zoom: 15, duration: 800 });
        void traceRoute(point, endPoint, waypoints);
        const addr = await reverseGeocode(point);
        setStartName(addr ?? `موقعي الحالي (${point.lat.toFixed(4)}, ${point.lng.toFixed(4)})`);
        show('تم تحديد موقعك كنقطة انطلاق 📍', 'info');
      },
      (err) => {
        setIsLocating(false);
        if (err.code === 1) {
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

  // البحث المباشر لنقطة الانطلاق (مع debounce و cache)
  function handleStartInputChange(val: string) {
    setStartName(val);
    if (isRouteLocked) return;
    if (startTimer.current) window.clearTimeout(startTimer.current);
    const cleaned = sanitizeSearchQuery(val);
    if (!cleaned || cleaned.length < 2) {
      setStartResults([]);
      setIsSearchingStart(false);
      return;
    }
    setIsSearchingStart(true);
    startTimer.current = window.setTimeout(async () => {
      try {
        const results = await searchPlaces(cleaned, startPoint);
        setStartResults(results || []);
      } catch {
        setStartResults([]);
      } finally {
        setIsSearchingStart(false);
      }
    }, 400);
  }

  function selectStartPlace(place: PlaceResult) {
    setStartName(place.name);
    const pt = { lat: place.lat, lng: place.lon };
    setStartPoint(pt);
    setStartResults([]);
    mapRef.current?.flyTo({ center: [place.lon, place.lat], zoom: 14.5, duration: 800 });
    void traceRoute(pt, endPoint, waypoints);
  }

  // البحث المباشر لنقطة الوصول (مع debounce و cache)
  function handleDestInputChange(val: string) {
    setEndName(val);
    if (isRouteLocked) return;
    if (destTimer.current) window.clearTimeout(destTimer.current);
    const cleaned = sanitizeSearchQuery(val);
    if (!cleaned || cleaned.length < 2) {
      setDestResults([]);
      setIsSearchingDest(false);
      return;
    }
    setIsSearchingDest(true);
    destTimer.current = window.setTimeout(async () => {
      try {
        const results = await searchPlaces(cleaned, endPoint);
        setDestResults(results || []);
      } catch {
        setDestResults([]);
      } finally {
        setIsSearchingDest(false);
      }
    }, 400);
  }

  function selectDestPlace(place: PlaceResult) {
    setEndName(place.name);
    const pt = { lat: place.lat, lng: place.lon };
    setEndPoint(pt);
    setDestResults([]);
    mapRef.current?.flyTo({ center: [place.lon, place.lat], zoom: 14.5, duration: 800 });
    void traceRoute(startPoint, pt, waypoints);
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

      const activeTargetId = driverId || 'drv-default';

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
          navigate('/drive');
        }, 300);
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

  return (
    <div className={`flex h-dvh flex-col text-right font-cairo transition-colors ${
      isDark ? 'bg-[#080E1A] text-[#DDE2F4]' : 'bg-[#F8FAFC] text-[#0F172A]'
    }`} dir="rtl">
      <TopBar
        title="تخطيط وإنشاء خط السير (Mapbox)"
        showBack={true}
        onBack={() => navigate(-1)}
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
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200 dark:border-slate-700/60">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">تفاصيل خط السير</h2>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                اكتب اسم المنطقة أو انقر على الخريطة لتحديد المسار
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                isDark
                  ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white'
                  : 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200 hover:text-black shadow-xs'
              }`}
              title="رجوع للصفحة السابقة"
            >
              <span>→</span>
              <span>رجوع</span>
            </button>
          </div>

          <Field
            label="اسم الخط"
            value={routeName}
            disabled={isRouteLocked}
            onChange={(e) => setRouteName(e.target.value)}
            className={isDark ? '!bg-[#242A37] !border-slate-700 !text-white' : '!bg-white !border-slate-300 !text-slate-900 shadow-xs'}
          />

          {/* حقل نقطة الانطلاق مع قائمة الاقتراحات المنسدلة المباشرة */}
          <div className="relative">
            <Field
              label="نقطة الانطلاق *"
              value={startName}
              disabled={isRouteLocked}
              onChange={(e) => handleStartInputChange(e.target.value)}
              className={isDark ? '!bg-[#242A37] !border-slate-700 !text-white' : '!bg-white !border-slate-300 !text-slate-900 shadow-xs'}
              placeholder="اكتب منطقة أو حي أو شارع..."
            />
            {isSearchingStart && (
              <span className="absolute left-3 top-8 text-xs text-amber-500 animate-spin">⏳</span>
            )}
            {startResults.length > 0 && !isRouteLocked && (
              <div
                onMouseDown={(e) => e.preventDefault()}
                className={`absolute inset-x-0 top-full mt-1 z-30 max-h-52 overflow-y-auto rounded-xl border shadow-xl divide-y font-map-search ${
                  isDark ? 'bg-[#161C28] border-slate-700 divide-slate-700/60 text-white' : 'bg-white border-slate-200 divide-slate-100 text-slate-800'
                }`}
              >
                {startResults.map((p, i) => (
                  <button
                    key={`start-${p.lat}-${p.lon}-${i}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectStartPlace(p)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-right text-xs cursor-pointer transition ${
                      isDark ? 'hover:bg-amber-500/20 text-white' : 'hover:bg-amber-50 text-slate-800'
                    }`}
                  >
                    <span className="text-emerald-500 shrink-0">📍</span>
                    <div className="flex flex-col text-right truncate">
                      <span className="truncate font-bold">{p.name}</span>
                      <span className={`truncate text-[10.5px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{p.subName || p.fullName || ''}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* حقل نقطة الوصول مع قائمة الاقتراحات المنسدلة المباشرة */}
          <div className="relative">
            <Field
              label="نقطة الوصول *"
              value={endName}
              disabled={isRouteLocked}
              onChange={(e) => handleDestInputChange(e.target.value)}
              className={isDark ? '!bg-[#242A37] !border-slate-700 !text-white' : '!bg-white !border-slate-300 !text-slate-900 shadow-xs'}
              placeholder="اكتب وجهة الوصول..."
            />
            {isSearchingDest && (
              <span className="absolute left-3 top-8 text-xs text-amber-500 animate-spin">⏳</span>
            )}
            {destResults.length > 0 && !isRouteLocked && (
              <div
                onMouseDown={(e) => e.preventDefault()}
                className={`absolute inset-x-0 top-full mt-1 z-30 max-h-52 overflow-y-auto rounded-xl border shadow-xl divide-y font-map-search ${
                  isDark ? 'bg-[#161C28] border-slate-700 divide-slate-700/60 text-white' : 'bg-white border-slate-200 divide-slate-100 text-slate-800'
                }`}
              >
                {destResults.map((p, i) => (
                  <button
                    key={`dest-${p.lat}-${p.lon}-${i}`}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectDestPlace(p)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-right text-xs cursor-pointer transition ${
                      isDark ? 'hover:bg-amber-500/20 text-white' : 'hover:bg-amber-50 text-slate-800'
                    }`}
                  >
                    <span className="text-amber-500 shrink-0">🎯</span>
                    <div className="flex flex-col text-right truncate">
                      <span className="truncate font-bold">{p.name}</span>
                      <span className={`truncate text-[10.5px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{p.subName || p.fullName || ''}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="عدد المقاعد"
              value={seats}
              disabled={isRouteLocked}
              onChange={(e) => setSeats(e.target.value)}
              className={isDark ? '!bg-[#242A37] !border-slate-700 !text-white' : '!bg-white !border-slate-300 !text-slate-900 shadow-xs'}
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
              className={isDark ? '!bg-[#242A37] !border-slate-700 !text-white' : '!bg-white !border-slate-300 !text-slate-900 shadow-xs'}
            />
          </div>

          <Field
            label="وقت الانطلاق"
            type="time"
            value={departureTime}
            disabled={isRouteLocked}
            onChange={(e) => setDepartureTime(e.target.value)}
            className={isDark ? '!bg-[#242A37] !border-slate-700 !text-white' : '!bg-white !border-slate-300 !text-slate-900 shadow-xs'}
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
              className={`w-full text-sm ${isDark ? 'border-slate-700 text-slate-200 hover:bg-white/5' : ''}`}
              onClick={useGpsAsStart}
              disabled={isLocating || isRouteLocked}
            >
              {isLocating ? <Spinner className="h-4 w-4" /> : '📍'} موقعي كانطلاق
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

        {/* الخريطة مع لون خلفية متوافق لمنع الشاشة السوداء */}
        <div className={`relative min-h-[360px] flex-1 transition-colors ${isDark ? 'bg-[#080E1A]' : 'bg-[#E2E8F0]'}`}>
          <Map
            ref={mapRef}
            reuseMaps
            mapboxAccessToken={config.mapboxToken}
            mapStyle={MAPBOX_DAY_STYLE}
            initialViewState={{ longitude: startPoint.lng, latitude: startPoint.lat, zoom: 13 }}
            style={{ width: '100%', height: '100%', backgroundColor: isDark ? '#080E1A' : '#E2E8F0' }}
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
                    casingColor: '#B45309',
                    width: 3.5,
                  },
                ]}
              />
            )}

            {/* دبوس الانطلاق الأخضر */}
            <Marker longitude={startPoint.lng} latitude={startPoint.lat} draggable={!isRouteLocked} onDragEnd={(e) => {
              const pt = { lat: e.lngLat.lat, lng: e.lngLat.lng };
              setStartPoint(pt);
              setStartResults([]);
              void traceRoute(pt, endPoint, waypoints);
            }}>
              <div className="flex flex-col items-center">
                <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-black text-white shadow">الانطلاق</span>
                <span className="text-2xl drop-shadow">🟢</span>
              </div>
            </Marker>

            {/* نقاط وسيطة اختيارية */}
            {waypoints.map((wp, i) => (
              <Marker key={`${wp.lat}-${wp.lng}-${i}`} longitude={wp.lng} latitude={wp.lat} draggable={!isRouteLocked} onDragEnd={(e) => {
                const next = [...waypoints];
                next[i] = { lat: e.lngLat.lat, lng: e.lngLat.lng };
                setWaypoints(next);
                void traceRoute(startPoint, endPoint, next);
              }}>
                <div className="flex flex-col items-center">
                  <span className="rounded-full bg-amber-600 px-1.5 py-0.5 text-[9px] font-bold text-white shadow">{i + 1}</span>
                  <span className="text-xl">📌</span>
                </div>
              </Marker>
            ))}

            {/* دبوس الوصول الأحمر */}
            <Marker longitude={endPoint.lng} latitude={endPoint.lat} draggable={!isRouteLocked} onDragEnd={(e) => {
              const pt = { lat: e.lngLat.lat, lng: e.lngLat.lng };
              setEndPoint(pt);
              setDestResults([]);
              void traceRoute(startPoint, pt, waypoints);
            }}>
              <div className="flex flex-col items-center">
                <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black text-white shadow">الوصول</span>
                <span className="text-2xl drop-shadow">🔴</span>
              </div>
            </Marker>
          </Map>
        </div>
      </div>
    </div>
  );
}
