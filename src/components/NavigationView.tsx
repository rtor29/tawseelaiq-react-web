// شاشة الملاحة — عرض فقط، على staging وحدها خلف VITE_NAV_DEMO
//
// الكاميرا تدور مع اتجاه السير وتميل، والشريط العلوي يعرض المناورة القادمة،
// والسفلي وقت الوصول والمتبقي. والصوت عربي من صياغتنا لا من ترجمة المحرك.
//
// ولأن الغرض العرض لا القيادة، فيها وضع محاكاة يقود المسار أمامك وأنت جالس.
// وتعمل بالموقع الحقيقي أيضاً إن سمح المتصفح، وتلصقه بالمسار قبل أن ترسمه.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Map as MapGL, Marker, type MapRef } from 'react-map-gl';
import { RouteLines } from './map/MapPins';
import { config } from '../lib/config';
import { searchPlacesInGovernorate, type PlaceSearchResult } from '../lib/placesApi';
import { useTheme } from '../context/ThemeContext';
import {
  requestRoute,
  cumulativeDistances,
  positionAtDistance,
  snapToRoute,
  nextManeuverIndex,
  formatDistance,
  formatDuration,
  maneuverIcon,
  voiceText,
  type LatLng,
  type NavRoute,
} from '../lib/navigation';

interface NavigationViewProps {
  origin: LatLng;
  destination: LatLng;
  destinationName?: string;
  onExit: () => void;
}

/** المسافات التي يُنطق عندها التنبيه، من الأبعد إلى الأقرب */
const VOICE_THRESHOLDS_M = [800, 400, 150, 30];

/** سرعة المحاكاة: 60 كم/س تقريباً، وهي سرعة مدينة معقولة للعرض */
const SIM_SPEED_MPS = 16.7;

/**
 * الفلاتر: كل واحد كلمة يفهمها بحث الأماكن فيحوّلها إلى فئة في قاعدة البيانات.
 * فلا حاجة إلى مسار جديد في الخادم، والكلمة نفسها يكتبها المستخدم في البحث.
 */
const PLACE_FILTERS = [
  { icon: '⛽', label: 'بنزين', query: 'بنزين' },
  { icon: '🍽️', label: 'مطاعم', query: 'مطعم' },
  { icon: '💊', label: 'صيدليات', query: 'صيدلية' },
  { icon: '🏦', label: 'بنوك', query: 'مصرف' },
  { icon: '🔧', label: 'تصليح', query: 'تصليح' },
  { icon: '🏥', label: 'مستشفيات', query: 'مستشفى' },
  { icon: '🏪', label: 'أسواق', query: 'سوق' },
  { icon: '🔌', label: 'شحن', query: 'شحن كهربائي' },
];

/** أبعد من هذا عن الخط نعدّه خروجاً عن المسار */
const OFF_ROUTE_LIMIT_M = 50;

export function NavigationView({ origin, destination: initialDestination, destinationName: initialName, onExit }: NavigationViewProps) {
  // الوجهة تصير حالة داخلية: البحث يغيّرها ويُعاد حساب المسار عليها
  const [destination, setDestination] = useState<LatLng>(initialDestination);
  const [destinationName, setDestinationName] = useState(initialName || 'الوجهة');
  const [startPoint, setStartPoint] = useState<LatLng>(origin);
  const [startName, setStartName] = useState('موقعي الحالي');

  // البحث عن وجهة من داخل الملاحة
  const [searchOpen, setSearchOpen] = useState(false);
  // أي حقل يُعدَّل الآن: الانطلاق أم الوصول
  const [searchTarget, setSearchTarget] = useState<'start' | 'destination'>('destination');
  // وضع «حدد على الخريطة»: الضغطة التالية على الخريطة تثبّت النقطة المقصودة
  const [pickOnMap, setPickOnMap] = useState<'start' | 'destination' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const { isDark, mapStyle } = useTheme();
  const mapRef = useRef<MapRef | null>(null);

  const [route, setRoute] = useState<NavRoute | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [distanceAlong, setDistanceAlong] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFollowing, setIsFollowing] = useState(true);
  const [offRouteM, setOffRouteM] = useState(0);

  // إصبع المستخدم على الشاشة الآن: لا نحرّك الكاميرا تحته
  const isGesturingRef = useRef(false);

  /**
   * اتجاه الجهاز من حسّاس البوصلة.
   * اتجاه المسار يقول إلى أين يمضي الخط، لا إلى أين يشير الهاتف. فالسائق الواقف
   * عند إشارة ويلتفت يمنة ويسرة يبقى سهمه ثابتاً، وهو ما يبدو معطّلاً. والبوصلة
   * تعطي الاتجاه الحقيقي، فنفضّلها حين تتوفّر ونرجع إلى اتجاه المسار حين تغيب.
   */
  const [deviceHeading, setDeviceHeading] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onOrientation = (e: DeviceOrientationEvent) => {
      // iOS يعطي الاتجاه جاهزاً، وأندرويد يعطي alpha وهي زاوية معكوسة عن الشمال
      const webkit = (e as DeviceOrientationEvent & { webkitCompassHeading?: number })
        .webkitCompassHeading;
      const heading = typeof webkit === 'number' && !isNaN(webkit)
        ? webkit
        : typeof e.alpha === 'number'
          ? (360 - e.alpha) % 360
          : null;
      if (heading !== null) setDeviceHeading(heading);
    };

    // absolute أدق لأنها منسوبة إلى الشمال المغناطيسي لا إلى وضع البدء
    const eventName = 'ondeviceorientationabsolute' in window
      ? 'deviceorientationabsolute'
      : 'deviceorientation';
    window.addEventListener(eventName, onOrientation as EventListener);
    return () => window.removeEventListener(eventName, onOrientation as EventListener);
  }, []);

  // فلاتر الأماكن: الكلمة تُرسل إلى بحث الأماكن، والخادم يحوّلها إلى فئة
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [filterPlaces, setFilterPlaces] = useState<PlaceSearchResult[]>([]);

  const cumulative = useMemo(
    () => (route ? cumulativeDistances(route.coordinates) : []),
    [route],
  );

  // ---------------------------------------------------------------------
  // حساب المسار
  // ---------------------------------------------------------------------
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    setRoute(null);
    setDistanceAlong(0);

    spokenRef.current = '';
    arrivedSpokenRef.current = false;
    firstVoiceSkipRef.current = true;
    setIsSimulating(false);
    stopSpeaking();

    requestRoute(startPoint, destination, controller.signal)
      .then(setRoute)
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'تعذّر حساب المسار');
      });

    return () => controller.abort();
  }, [startPoint.lat, startPoint.lng, destination.lat, destination.lng]);

  // ---------------------------------------------------------------------
  // الموضع الحالي والمناورة القادمة
  // ---------------------------------------------------------------------
  const live = useMemo(() => {
    if (!route || cumulative.length === 0) return null;
    const total = cumulative[cumulative.length - 1];
    const clamped = Math.max(0, Math.min(distanceAlong, total));
    const position = positionAtDistance(route.coordinates, cumulative, clamped);
    const maneuverIndex = nextManeuverIndex(route.maneuvers, cumulative, clamped);
    const maneuver = route.maneuvers[maneuverIndex];
    const maneuverAt = cumulative[maneuver?.shapeIndex ?? 0] ?? 0;

    const remainingM = Math.max(0, total - clamped);
    // الزمن المتبقي بنسبة المسافة: تقدير كافٍ للعرض ولا يحتاج إعادة حساب
    const remainingS = total > 0 ? (route.durationS * remainingM) / total : 0;

    return {
      position,
      maneuver,
      maneuverIndex,
      distanceToManeuverM: Math.max(0, maneuverAt - clamped),
      remainingM,
      remainingS,
      arrived: remainingM < 25,
    };
  }, [route, cumulative, distanceAlong]);

  // ---------------------------------------------------------------------
  // الصوت
  // ---------------------------------------------------------------------
  const spokenRef = useRef<string>('');
  const arrivedSpokenRef = useRef(false);
  // أول تنبيه بعد فتح الشاشة أو تبديل الوجهة لا يُنطق: المسافة تكون أصلاً تحت
  // العتبة، فيتكلّم فور الفتح بلا سبب. ننطق عند **عبور** العتبة لا عند وجودنا دونها.
  const firstVoiceSkipRef = useRef(true);

  const stopSpeaking = useCallback(() => {
    try {
      window.speechSynthesis?.cancel();
    } catch (_) {}
  }, []);

  // الجمل المنطوقة تبقى في طابور المتصفح بعد إغلاق الشاشة، فتتكلم فوق صفحة أخرى
  useEffect(() => () => {
    try {
      window.speechSynthesis?.cancel();
    } catch (_) {}
  }, []);

  // صوت عربي مُختار بالاسم، لا بالاعتماد على lang وحده.
  //
  // المتصفح يحمّل قائمة الأصوات بتكاسل: أول استدعاء بعد فتح الصفحة يجدها فارغة،
  // ثم يُطلق `voiceschanged`. فمن يقرأها مرة واحدة عند التحميل يجدها خالية دائماً.
  // ولا يكفي ضبط lang='ar': كثير من الأجهزة تنطق النص بصوت إنجليزي فيخرج مشوّهاً،
  // فنبحث عن صوت لغته تبدأ بـar ونمرّره صراحة.
  const arabicVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const [hasArabicVoice, setHasArabicVoice] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setHasArabicVoice(false);
      return;
    }

    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return;
      const arabic = voices.find((v) => v.lang?.toLowerCase().startsWith('ar'));
      arabicVoiceRef.current = arabic || null;
      setHasArabicVoice(Boolean(arabic));
    };

    pickVoice();
    window.speechSynthesis.addEventListener('voiceschanged', pickVoice);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', pickVoice);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (isMuted || typeof window === 'undefined' || !window.speechSynthesis) return;
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        if (arabicVoiceRef.current) utterance.voice = arabicVoiceRef.current;
        utterance.lang = arabicVoiceRef.current?.lang || 'ar-SA';
        // أبطأ قليلاً من الافتراضي: التعليمة تُسمع مرة واحدة والسائق منشغل بالطريق
        utterance.rate = 0.95;
        window.speechSynthesis.speak(utterance);
      } catch (_) {
        // جهاز بلا أصوات لا يوقف الملاحة
      }
    },
    [isMuted],
  );

  /**
   * أندرويد لا يسمح بالنطق إلا بعد لمسة من المستخدم. فنُطلق جملة صامتة عند أول
   * ضغطة على زر، فيُفتح الباب، وتُسمع التعليمة الأولى في وقتها لا بعد فوات المنعطف.
   */
  const primedRef = useRef(false);
  const primeVoice = useCallback(() => {
    if (primedRef.current || typeof window === 'undefined' || !window.speechSynthesis) return;
    primedRef.current = true;
    try {
      const warmup = new SpeechSynthesisUtterance(' ');
      warmup.volume = 0;
      window.speechSynthesis.speak(warmup);
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (!live || !live.maneuver || live.arrived) return;

    const threshold = VOICE_THRESHOLDS_M.find((t) => live.distanceToManeuverM <= t);
    if (threshold === undefined) return;

    // مفتاح يجمع المناورة والعتبة، فلا تُنطق الجملة نفسها مرتين
    const key = `${live.maneuverIndex}@${threshold}`;
    if (spokenRef.current === key) return;
    spokenRef.current = key;

    if (firstVoiceSkipRef.current) {
      firstVoiceSkipRef.current = false;
      return;
    }

    speak(voiceText(live.maneuver.text, threshold <= 30 ? null : live.distanceToManeuverM));
  }, [live, speak]);

  // الوصول يُنهي كل شيء: تتوقف المحاكاة ويُقال «وصلت» مرة واحدة
  useEffect(() => {
    if (!live?.arrived || arrivedSpokenRef.current) return;
    arrivedSpokenRef.current = true;
    setIsSimulating(false);
    stopSpeaking();
    speak('وصلت إلى وجهتك');
  }, [live?.arrived, speak, stopSpeaking]);

  // ---------------------------------------------------------------------
  // المحاكاة: تقدّم على المسار بسرعة ثابتة
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!isSimulating || !route || cumulative.length === 0) return;
    const total = cumulative[cumulative.length - 1];
    let frame = 0;
    let last = performance.now();

    const step = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      setDistanceAlong((prev) => {
        const next = prev + SIM_SPEED_MPS * dt;
        if (next >= total) {
          setIsSimulating(false);
          return total;
        }
        return next;
      });
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [isSimulating, route, cumulative]);

  // ---------------------------------------------------------------------
  // الموقع الحقيقي حين لا تكون محاكاة
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (isSimulating || !route || cumulative.length === 0) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const snapped = snapToRoute(route.coordinates, cumulative, {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setOffRouteM(snapped.offRouteM);
        // بعيداً عن المسار لا معنى لتحريك السهم عليه: نترك آخر موضع صحيح
        if (snapped.offRouteM <= OFF_ROUTE_LIMIT_M) setDistanceAlong(snapped.distanceAlongM);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [isSimulating, route, cumulative]);

  // ---------------------------------------------------------------------
  // الكاميرا تتبع السهم وتدور معه
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!isFollowing || !live || isGesturingRef.current) return;
    const map = mapRef.current?.getMap?.();
    if (!map) return;
    try {
      map.easeTo({
        center: [live.position.point.lng, live.position.point.lat],
        bearing: live.position.bearing,
        // التقريب والميل يبقيان كما ضبطهما السائق: الملاحقة تحرّك المركز
        // والاتجاه فقط. وفرض قيمة ثابتة هنا كان يُلغي تكبيره عند كل إطار.
        pitch: map.getPitch(),
        zoom: map.getZoom(),
        duration: 600,
        essential: true,
      });
    } catch (_) {}
  }, [live, isFollowing]);

  useEffect(() => {
    if (!activeFilter || !live) {
      setFilterPlaces([]);
      return;
    }
    const controller = new AbortController();
    searchPlacesInGovernorate(activeFilter, live.position.point, null, controller.signal)
      .then((res) => setFilterPlaces(res.results || []))
      .catch(() => setFilterPlaces([]));
    return () => controller.abort();
    // الموقع متعمَّد خارج التبعيات: الفلتر يُجلب مرة عند اختياره، لا مع كل متر
    // يقطعه السائق، وإلا صار طلباً كل جزء من الثانية.
  }, [activeFilter]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!searchOpen || q.length < 2) {
      setSearchResults([]);
      return;
    }
    const controller = new AbortController();
    // 350ms تمنع طلباً مع كل حرف، وهي القاعدة نفسها في شاشة البحث
    const timer = window.setTimeout(() => {
      setSearching(true);
      searchPlacesInGovernorate(q, live?.position.point || origin, null, controller.signal)
        .then((res) => setSearchResults(res.results || []))
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, searchOpen]);

  const routeLines = useMemo(
    () =>
      route
        ? [
            {
              id: 'nav-route',
              coordinates: route.coordinates,
              color: '#F59E0B',
              casingColor: '#000000',
              width: 6,
              casingWidth: 10,
            },
          ]
        : [],
    [route],
  );

  const arrivalClock = useMemo(() => {
    if (!live) return '';
    const at = new Date(Date.now() + live.remainingS * 1000);
    return at.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
  }, [live]);

  const panelBg = isDark ? 'bg-[#161C28]/95 text-[#DDE2F4]' : 'bg-white/95 text-[#0F172A]';

  return (
    <div className="fixed inset-0 z-[140] bg-[#080E1A]" dir="rtl">
      <MapGL
        ref={mapRef}
        mapboxAccessToken={config.mapboxToken}
        mapStyle={mapStyle}
        initialViewState={{
          longitude: origin.lng,
          latitude: origin.lat,
          zoom: 16,
          pitch: 60,
        }}
        style={{ width: '100%', height: '100%' }}
        // السحب وحده يوقف الملاحقة، فهو يقول «أريد النظر إلى مكان آخر».
        // أما التكبير والتدوير والإمالة فتبقى الملاحقة معها، لأن السائق يريد
        // أن يقترب أو يبتعد وهو ماضٍ في طريقه لا أن يتوقف عن المتابعة.
        onClick={(e) => {
          if (!pickOnMap) return;
          const point = { lat: e.lngLat.lat, lng: e.lngLat.lng };
          if (pickOnMap === 'start') {
            setStartPoint(point);
            setStartName('نقطة على الخريطة');
          } else {
            setDestination(point);
            setDestinationName('نقطة على الخريطة');
          }
          setPickOnMap(null);
        }}
        onDragStart={() => setIsFollowing(false)}
        onZoomStart={(e) => { if (e.originalEvent) isGesturingRef.current = true; }}
        onZoomEnd={(e) => { if (e.originalEvent) isGesturingRef.current = false; }}
        onRotateStart={(e) => { if (e.originalEvent) isGesturingRef.current = true; }}
        onRotateEnd={(e) => { if (e.originalEvent) isGesturingRef.current = false; }}
        onPitchStart={(e) => { if (e.originalEvent) isGesturingRef.current = true; }}
        onPitchEnd={(e) => { if (e.originalEvent) isGesturingRef.current = false; }}
      >
        <RouteLines lines={routeLines} />

        {live && (
          <Marker longitude={live.position.point.lng} latitude={live.position.point.lat} anchor="center">
            {/* سهم وحده بلا دائرة: الدائرة كانت تخفي اتجاهه وتزحم الشارع تحته */}
            <svg
              width="34"
              height="34"
              viewBox="0 0 34 34"
              style={{
                transform: `rotate(${
                  !isSimulating && deviceHeading !== null ? deviceHeading : live.position.bearing
                }deg)`,
                display: 'block',
                transition: 'transform 200ms linear',
              }}
            >
              <path
                d="M17 3 L28 29 L17 23 L6 29 Z"
                fill="#2563EB"
                stroke="#FFFFFF"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
          </Marker>
        )}

        {filterPlaces.map((place) => (
          <Marker key={place.id} longitude={place.lng} latitude={place.lat} anchor="bottom">
            <div
              className="flex flex-col items-center cursor-pointer"
              onClick={() => {
                setDestination({ lat: place.lat, lng: place.lng });
                setDestinationName(place.name);
                setActiveFilter(null);
                setIsFollowing(true);
              }}
            >
              <div className="px-2 py-0.5 rounded-md bg-slate-900/85 text-white text-[10px] font-bold max-w-[7rem] truncate">
                {place.name}
              </div>
              <span className="text-lg leading-none">📍</span>
            </div>
          </Marker>
        ))}

        <Marker
          longitude={startPoint.lng}
          latitude={startPoint.lat}
          anchor="bottom"
          draggable
          onDragEnd={(e) => {
            setStartPoint({ lat: e.lngLat.lat, lng: e.lngLat.lng });
            setStartName('نقطة على الخريطة');
          }}
        >
          <div className="flex flex-col items-center cursor-grab active:cursor-grabbing">
            <div className="px-2.5 py-1 rounded-lg bg-emerald-600/95 text-white text-[11px] font-bold shadow-lg">
              {startName}
            </div>
            <span className="text-2xl leading-none">●</span>
          </div>
        </Marker>

        <Marker
          longitude={destination.lng}
          latitude={destination.lat}
          anchor="bottom"
          draggable
          onDragEnd={(e) => {
            setDestination({ lat: e.lngLat.lat, lng: e.lngLat.lng });
            setDestinationName('نقطة على الخريطة');
          }}
        >
          <div className="flex flex-col items-center cursor-grab active:cursor-grabbing">
            <div className="px-2.5 py-1 rounded-lg bg-slate-900/90 text-white text-[11px] font-bold shadow-lg">
              {destinationName || 'الوجهة'}
            </div>
            <span className="text-2xl leading-none">⚑</span>
          </div>
        </Marker>
      </MapGL>

      {/* شريط المناورة القادمة */}
      <div className="absolute top-0 inset-x-0 pt-safe px-3 pt-3">
        {error ? (
          <div className={`rounded-2xl px-4 py-3 shadow-xl ${panelBg}`}>
            <p className="text-sm font-bold">{error}</p>
          </div>
        ) : !live ? (
          <div className={`rounded-2xl px-4 py-3 shadow-xl flex items-center gap-2.5 ${panelBg}`}>
            <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
            <span className="text-sm font-bold">جارٍ حساب المسار…</span>
          </div>
        ) : (
          <div className={`rounded-2xl px-4 py-3.5 shadow-xl flex items-center gap-3.5 ${panelBg}`}>
            <span className="text-4xl font-black leading-none text-amber-500">
              {maneuverIcon(live.maneuver?.type ?? 0)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-xl font-black leading-tight">
                {live.arrived ? 'وصلت' : formatDistance(live.distanceToManeuverM)}
              </div>
              <div className="text-xs font-bold opacity-75 truncate">
                {live.maneuver?.text || ''}
              </div>
            </div>
          </div>
        )}

        {offRouteM > OFF_ROUTE_LIMIT_M && !isSimulating && (
          <div className="mt-2 rounded-xl px-3 py-2 bg-red-500/90 text-white text-xs font-bold shadow-lg">
            أنت خارج المسار بـ{formatDistance(offRouteM)}
          </div>
        )}
      </div>

      {/* أزرار جانبية */}
      <div className="absolute top-28 left-3 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => { primeVoice(); setIsMuted((m) => !m); }}
          aria-label={isMuted ? 'تشغيل الصوت' : 'كتم الصوت'}
          className={`w-11 h-11 rounded-full shadow-lg flex items-center justify-center text-lg ${panelBg}`}
        >
          {isMuted ? '🔇' : hasArabicVoice === false ? '🔈' : '🔊'}
        </button>
        {hasArabicVoice === false && !isMuted && (
          <div className={`max-w-[9rem] rounded-xl px-2.5 py-1.5 text-[10px] font-bold shadow-lg ${panelBg}`}>
            لا يوجد صوت عربي في هذا الجهاز، والتعليمات تظهر مكتوبة
          </div>
        )}
        <button
          type="button"
          onClick={() => { setSearchTarget('destination'); setSearchOpen(true); }}
          aria-label="البحث عن وجهة"
          className={`w-11 h-11 rounded-full shadow-lg flex items-center justify-center text-lg ${panelBg}`}
        >
          🔎
        </button>
        {!isFollowing && (
          <button
            type="button"
            onClick={() => setIsFollowing(true)}
            aria-label="إعادة التوسيط"
            className="w-11 h-11 rounded-full shadow-lg flex items-center justify-center text-lg bg-amber-500 text-slate-950"
          >
            ⌖
          </button>
        )}
      </div>

      {pickOnMap && (
        <div className="absolute top-24 inset-x-0 z-[9] flex justify-center px-4">
          <div className="flex items-center gap-2 rounded-full bg-amber-500 text-slate-950 px-4 py-2.5 text-xs font-black shadow-xl">
            <span>اضغط على الخريطة لتحديد {pickOnMap === 'start' ? 'نقطة الانطلاق' : 'الوجهة'}</span>
            <button type="button" onClick={() => setPickOnMap(null)} aria-label="إلغاء">✕</button>
          </div>
        </div>
      )}

      {/* البحث عن وجهة: يغطي الشاشة ويغلق باختيار نتيجة أو بالرجوع */}
      {searchOpen && (
        <div className={`absolute inset-0 z-[5] ${isDark ? 'bg-[#080E1A]' : 'bg-white'} flex flex-col`}>
          <div className="p-3 pt-safe flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
              aria-label="رجوع"
              className={`w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0 ${panelBg}`}
            >
              ✕
            </button>
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchTarget === 'start' ? 'من أين تنطلق؟' : 'إلى أين تريد الذهاب؟'}
              className={`flex-1 min-h-[44px] px-3.5 rounded-xl text-sm font-bold outline-none border ${
                isDark
                  ? 'bg-[#161C28] border-white/10 text-[#DDE2F4] placeholder-slate-500'
                  : 'bg-slate-100 border-slate-200 text-[#0F172A] placeholder-slate-400'
              }`}
            />
          </div>

          <div className="px-3 pb-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setPickOnMap(searchTarget);
                setSearchOpen(false);
                setSearchQuery('');
                setIsFollowing(false);
              }}
              className="flex-1 min-h-[42px] rounded-xl bg-amber-500 text-slate-950 text-xs font-black"
            >
              📍 حدد على الخريطة
            </button>
            {searchTarget === 'start' && (
              <button
                type="button"
                onClick={() => {
                  setStartPoint(origin);
                  setStartName('موقعي الحالي');
                  setSearchOpen(false);
                  setSearchQuery('');
                }}
                className={`flex-1 min-h-[42px] rounded-xl text-xs font-black ${panelBg}`}
              >
                ⌖ موقعي الحالي
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-4">
            {searching && <p className="text-xs font-bold opacity-60 py-3">جارٍ البحث…</p>}
            {!searching && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
              <p className="text-xs font-bold opacity-60 py-3">لا نتائج</p>
            )}
            {searchResults.map((r, i) => (
              <button
                key={r.id}
                type="button"
                onClick={() => {
                  if (searchTarget === 'start') {
                    setStartPoint({ lat: r.lat, lng: r.lng });
                    setStartName(r.name);
                  } else {
                    setDestination({ lat: r.lat, lng: r.lng });
                    setDestinationName(r.name);
                  }
                  setSearchOpen(false);
                  setSearchQuery('');
                  setIsFollowing(true);
                }}
                className={`w-full text-right py-3 px-2 border-b flex items-center gap-3 ${
                  isDark ? 'border-white/5' : 'border-slate-100'
                }`}
              >
                <span className="text-xs font-black opacity-40 w-5 shrink-0">{i + 1}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold truncate">{r.name}</span>
                  <span className="block text-[11px] opacity-60 truncate">
                    {r.category}{r.area_name ? ` · ${r.area_name}` : ''}
                  </span>
                </span>
                <span className="text-[11px] font-bold opacity-70 shrink-0">
                  {formatDistance(r.distance_m)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* فلاتر الأماكن: شريط أفقي فوق شريط الوصول */}
      <div className="absolute bottom-[11.5rem] inset-x-0 z-[8] px-3 overflow-x-auto no-scrollbar">
        <div className="flex gap-2 w-max pb-1">
          {PLACE_FILTERS.map((f) => {
            const isOn = activeFilter === f.query;
            return (
              <button
                key={f.query}
                type="button"
                onClick={() => setActiveFilter(isOn ? null : f.query)}
                className={`shrink-0 px-3 py-2 rounded-full text-xs font-bold shadow-lg whitespace-nowrap ${
                  isOn ? 'bg-amber-500 text-slate-950' : panelBg
                }`}
              >
                {f.icon} {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {activeFilter && (
        <div className="absolute bottom-[15rem] inset-x-0 z-[8] flex justify-center px-3 pointer-events-none">
          <div className={`rounded-full px-3 py-1 text-[11px] font-bold shadow-lg ${panelBg}`}>
            {filterPlaces.length > 0
              ? `${filterPlaces.length} نتيجة قريبة`
              : 'لا نتائج قريبة'}
          </div>
        </div>
      )}

      {/* شريط الوصول */}
      <div className="absolute bottom-0 inset-x-0 p-3 pb-safe">
        <div className={`rounded-2xl px-4 py-3 shadow-xl ${panelBg}`}>
          <div className="mb-2 space-y-1">
            <button
              type="button"
              onClick={() => { setSearchTarget('start'); setSearchOpen(true); }}
              className="w-full text-right text-[11px] font-bold opacity-70 truncate flex items-center gap-1.5"
            >
              <span className="text-emerald-500 shrink-0">●</span>
              <span className="truncate">{startName}</span>
            </button>
            <button
              type="button"
              onClick={() => { setSearchTarget('destination'); setSearchOpen(true); }}
              className="w-full text-right text-[11px] font-bold opacity-70 truncate flex items-center gap-1.5"
            >
              <span className="text-red-500 shrink-0">◆</span>
              <span className="truncate">{destinationName}</span>
            </button>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-baseline gap-3">
              <span className="text-lg font-black">{live ? formatDuration(live.remainingS) : '—'}</span>
              <span className="text-xs font-bold opacity-70">
                {live ? formatDistance(live.remainingM) : ''}
              </span>
              <span className="text-xs font-bold opacity-70">{arrivalClock}</span>
            </div>
            <button
              type="button"
              onClick={() => { stopSpeaking(); onExit(); }}
              className="px-4 py-2 rounded-xl bg-red-500/90 text-white text-xs font-black"
            >
              إنهاء
            </button>
          </div>

          <button
            type="button"
            onClick={() => { primeVoice(); setIsSimulating((s) => !s); }}
            disabled={!route}
            className="mt-2.5 w-full py-2.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-black disabled:opacity-40"
          >
            {isSimulating ? '⏸ إيقاف المحاكاة' : '▶ ابدأ المحاكاة'}
          </button>
        </div>
      </div>
    </div>
  );
}
