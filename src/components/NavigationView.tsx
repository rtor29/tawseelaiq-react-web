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

/** أبعد من هذا عن الخط نعدّه خروجاً عن المسار */
const OFF_ROUTE_LIMIT_M = 50;

export function NavigationView({ origin, destination, destinationName, onExit }: NavigationViewProps) {
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

    requestRoute(origin, destination, controller.signal)
      .then(setRoute)
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'تعذّر حساب المسار');
      });

    return () => controller.abort();
  }, [origin.lat, origin.lng, destination.lat, destination.lng]);

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

    speak(voiceText(live.maneuver.text, threshold <= 30 ? null : live.distanceToManeuverM));
  }, [live, speak]);

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
            <div
              className="w-11 h-11 rounded-full bg-amber-500 border-[3px] border-white shadow-xl flex items-center justify-center"
              style={{ transform: `rotate(${live.position.bearing}deg)` }}
            >
              <span className="text-slate-950 text-xl font-black leading-none">▲</span>
            </div>
          </Marker>
        )}

        <Marker longitude={destination.lng} latitude={destination.lat} anchor="bottom">
          <div className="flex flex-col items-center">
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

      {/* شريط الوصول */}
      <div className="absolute bottom-0 inset-x-0 p-3 pb-safe">
        <div className={`rounded-2xl px-4 py-3 shadow-xl ${panelBg}`}>
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
              onClick={onExit}
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
