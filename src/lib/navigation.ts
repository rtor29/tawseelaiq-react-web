// محرك الملاحة — حساب المسار وصياغة التعليمات بالعربية
//
// المسار من Valhalla (مفتوح المصدر، بيانات OpenStreetMap). واخترناه على بديله
// لسببين: يُرجع الشكل بست خانات عشرية (نحو 11 سم) لا بخمس (نحو متر)، ولا تقيّده
// شروط تمنع الملاحة داخل المركبات.
//
// ولا نستعمل جملته الجاهزة: ترجمته العربية ناقصة ومكسورة، يطبع «Turn اليمين»
// و«تحملاليمين» بلا مسافة. فنبني الجملة من نوع المناورة واسم الشارع، وكلاهما
// يصل سليماً. والنتيجة عربية صحيحة ومتّسقة مع لهجة التطبيق.

export interface LatLng {
  lat: number;
  lng: number;
}

/** مناورة واحدة على المسار بعد تحويلها إلى صيغتنا */
export interface NavManeuver {
  /** نوع المناورة كما يرقّمه Valhalla */
  type: number;
  /** الجملة المكتوبة على الشاشة */
  text: string;
  /** الجملة المنطوقة قبل الوصول إلى المناورة */
  voice: string;
  /** اسم الشارع الذي تؤدي إليه المناورة، إن كان في الخريطة */
  streetName: string | null;
  /**
   * طول المرحلة التي **تلي** هذه المناورة، لا المسافة إليها.
   * فالمسافة التي تُقال في «بعد كذا متر انعطف» هي طول مرحلة المناورة
   * **السابقة**. والخلط بينهما يعطي تعليمات مزاحة بمناورة كاملة.
   */
  segmentDistanceM: number;
  /** زمن المرحلة بالثواني */
  durationS: number;
  /** موضع المناورة في مصفوفة نقاط المسار */
  shapeIndex: number;
  /** الإحداثي الذي تقع عنده المناورة */
  point: LatLng;
  /** رقم المخرج في الدوار، إن كانت دواراً */
  roundaboutExit?: number;
}

export interface NavRoute {
  /** نقاط المسار بالترتيب، [lng, lat] لتوافق GeoJSON */
  coordinates: [number, number][];
  maneuvers: NavManeuver[];
  distanceM: number;
  durationS: number;
}

export class NavRouteError extends Error {}

const VALHALLA_URL =
  import.meta.env.VITE_VALHALLA_URL || 'https://valhalla1.openstreetmap.de/route';

// ---------------------------------------------------------------------------
// فكّ ترميز الشكل
// ---------------------------------------------------------------------------

/**
 * يفكّ polyline المشفّر. وValhalla يستعمل ست خانات عشرية افتراضياً لا خمساً،
 * فالمعامل 1e6. ولو فُكّ بـ1e5 لظهر المسار مزاحاً عشرة أضعاف عن الشارع.
 */
export function decodePolyline6(encoded: string, precision = 1e6): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    for (let axis = 0; axis < 2; axis++) {
      let shift = 0;
      let result = 0;
      let byte = 0;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    points.push([lng / precision, lat / precision]);
  }

  return points;
}

// ---------------------------------------------------------------------------
// صياغة العربية
// ---------------------------------------------------------------------------

/** أنواع المناورات التي يرقّمها Valhalla، بالأسماء التي نحتاجها */
const TURN_PHRASES: Record<number, string> = {
  1: 'انطلق',
  2: 'انطلق',
  3: 'انطلق',
  7: 'واصل',
  8: 'واصل مستقيماً',
  9: 'انعطف يميناً قليلاً',
  10: 'انعطف يميناً',
  11: 'انعطف يميناً بحدة',
  12: 'در دوراناً كاملاً',
  13: 'در دوراناً كاملاً',
  14: 'انعطف يساراً بحدة',
  15: 'انعطف يساراً',
  16: 'انعطف يساراً قليلاً',
  17: 'واصل على المنحدر',
  18: 'اسلك المنحدر يميناً',
  19: 'اسلك المنحدر يساراً',
  20: 'اسلك المخرج يميناً',
  21: 'اسلك المخرج يساراً',
  22: 'ابقَ مستقيماً',
  23: 'ابقَ يميناً',
  24: 'ابقَ يساراً',
  25: 'اندمج',
  28: 'اركب العبّارة',
  29: 'انزل من العبّارة',
};

const DESTINATION_TYPES = new Set([4, 5, 6]);
const ROUNDABOUT_ENTER = 26;
const ROUNDABOUT_EXIT = 27;

/** ترتيب المخرج في الدوار بصيغة عربية طبيعية */
const EXIT_ORDINALS: Record<number, string> = {
  1: 'الأول',
  2: 'الثاني',
  3: 'الثالث',
  4: 'الرابع',
  5: 'الخامس',
  6: 'السادس',
};

function onStreet(streetName: string | null): string {
  return streetName ? ` إلى ${streetName}` : '';
}

/** يبني جملة المناورة بالعربية من نوعها واسم شارعها */
export function maneuverText(
  type: number,
  streetName: string | null,
  roundaboutExit?: number,
): string {
  if (DESTINATION_TYPES.has(type)) return 'وصلت إلى وجهتك';

  if (type === ROUNDABOUT_ENTER) {
    const ordinal = roundaboutExit ? EXIT_ORDINALS[roundaboutExit] : null;
    const where = streetName ? ` عند ${streetName}` : '';
    return ordinal ? `ادخل الدوار${where} واسلك المخرج ${ordinal}` : `ادخل الدوار${where}`;
  }

  if (type === ROUNDABOUT_EXIT) return `اخرج من الدوار${onStreet(streetName)}`;

  const phrase = TURN_PHRASES[type];
  if (!phrase) return streetName ? `واصل${onStreet(streetName)}` : 'واصل';

  // «انطلق إلى شارع كذا» أصحّ من «انطلق على شارع كذا»
  return `${phrase}${onStreet(streetName)}`;
}

/** مسافة بصيغة يقرأها السائق بلمحة: أمتار تحت الكيلومتر، وكسر واحد فوقه */
export function formatDistance(meters: number): string {
  if (!isFinite(meters) || meters < 0) return '';
  if (meters < 1000) {
    // التقريب إلى أقرب عشرة أمتار: الرقم الدقيق لا يفيد السائق ويشتّته
    const rounded = meters < 100 ? Math.round(meters / 10) * 10 : Math.round(meters / 50) * 50;
    return `${rounded} متر`;
  }
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} كم`;
}

/** زمن بصيغة عربية مختصرة */
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '';
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  if (totalMinutes < 60) return `${totalMinutes} دقيقة`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} ساعة و${minutes} دقيقة` : `${hours} ساعة`;
}

/**
 * الجملة المنطوقة: المسافة أولاً ثم الفعل، كما ينطقها الملاحون.
 * وتحت العشرين متراً لا تُذكر مسافة، لأن «بعد 0 متر انعطف» ليست جملة.
 */
export function voiceText(maneuverSentence: string, distanceM: number | null): string {
  if (distanceM === null || distanceM < 20) return maneuverSentence;
  return `بعد ${formatDistance(distanceM)}، ${maneuverSentence}`;
}

/**
 * المسافة التي يقطعها السائق قبل أن يبلغ المناورة رقم index.
 * وهي طول مرحلة المناورة السابقة، لا طول مرحلتها هي.
 */
export function distanceToManeuver(maneuvers: NavManeuver[], index: number): number {
  if (index <= 0) return 0;
  return maneuvers[index - 1]?.segmentDistanceM ?? 0;
}

// ---------------------------------------------------------------------------
// طلب المسار
// ---------------------------------------------------------------------------

interface ValhallaManeuver {
  type: number;
  length: number;
  time: number;
  begin_shape_index: number;
  street_names?: string[];
  roundabout_exit_count?: number;
}

/** يطلب مساراً للسيارة بين نقطتين ويحوّله إلى صيغتنا */
export async function requestRoute(
  from: LatLng,
  to: LatLng,
  signal?: AbortSignal,
): Promise<NavRoute> {
  const body = {
    locations: [
      { lat: from.lat, lon: from.lng },
      { lat: to.lat, lon: to.lng },
    ],
    costing: 'auto',
    directions_options: { units: 'kilometers' },
  };

  const res = await fetch(VALHALLA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) throw new NavRouteError(`تعذّر حساب المسار (${res.status})`);

  const data = await res.json();
  const leg = data?.trip?.legs?.[0];
  if (!leg?.shape || !Array.isArray(leg.maneuvers)) {
    throw new NavRouteError('لم يُعثر على مسار بين النقطتين');
  }

  const coordinates = decodePolyline6(leg.shape);

  const maneuvers: NavManeuver[] = leg.maneuvers.map((m: ValhallaManeuver) => {
    const streetName = m.street_names?.[0] || null;
    const text = maneuverText(m.type, streetName, m.roundabout_exit_count);
    const point = coordinates[m.begin_shape_index] || coordinates[0];
    return {
      type: m.type,
      text,
      voice: text,
      streetName,
      // Valhalla يُرجع الأطوال بالكيلومتر حين تكون الوحدات kilometers
      segmentDistanceM: Math.round((m.length || 0) * 1000),
      durationS: Math.round(m.time || 0),
      shapeIndex: m.begin_shape_index,
      point: { lat: point[1], lng: point[0] },
      roundaboutExit: m.roundabout_exit_count,
    };
  });

  return {
    coordinates,
    maneuvers,
    distanceM: Math.round((data.trip.summary.length || 0) * 1000),
    durationS: Math.round(data.trip.summary.time || 0),
  };
}

// ---------------------------------------------------------------------------
// رياضيات التتبّع على المسار
//
// كل ما يحتاجه المتتبّع: أين أنا على الخط، وكم بقي للمناورة، وإلى أين أتّجه.
// دوال صرف بلا حالة، كي تُختبر وحدها بلا خريطة ولا متصفح.
// ---------------------------------------------------------------------------

const EARTH_RADIUS_M = 6371000;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/** المسافة بين نقطتين بالأمتار */
export function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** الاتجاه من نقطة إلى أخرى بالدرجات، صفر شمالاً */
export function bearingBetween(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * المسافة التراكمية عند كل نقطة من المسار.
 * تُحسب مرة عند استلام المسار، فكل سؤال بعدها عن الموضع يصير بحثاً لا حساباً.
 */
export function cumulativeDistances(coordinates: [number, number][]): number[] {
  const out = new Array(coordinates.length).fill(0);
  for (let i = 1; i < coordinates.length; i++) {
    const prev = { lat: coordinates[i - 1][1], lng: coordinates[i - 1][0] };
    const cur = { lat: coordinates[i][1], lng: coordinates[i][0] };
    out[i] = out[i - 1] + haversineM(prev, cur);
  }
  return out;
}

export interface RoutePosition {
  point: LatLng;
  /** رقم النقطة التي قبل الموضع مباشرة */
  index: number;
  /** الاتجاه الذي يسير فيه الخط عند هذا الموضع */
  bearing: number;
}

/**
 * الموضع على المسار بعد قطع مسافة معيّنة من بدايته.
 * يُقحم بين النقطتين المحيطتين، فالسهم يتحرّك بانسياب لا يقفز من نقطة إلى نقطة.
 */
export function positionAtDistance(
  coordinates: [number, number][],
  cumulative: number[],
  distanceM: number,
): RoutePosition {
  const last = coordinates.length - 1;
  if (coordinates.length === 0) {
    return { point: { lat: 0, lng: 0 }, index: 0, bearing: 0 };
  }
  if (coordinates.length === 1 || distanceM <= 0) {
    return {
      point: { lat: coordinates[0][1], lng: coordinates[0][0] },
      index: 0,
      bearing: coordinates.length > 1
        ? bearingBetween(
            { lat: coordinates[0][1], lng: coordinates[0][0] },
            { lat: coordinates[1][1], lng: coordinates[1][0] },
          )
        : 0,
    };
  }

  const total = cumulative[last];
  if (distanceM >= total) {
    return {
      point: { lat: coordinates[last][1], lng: coordinates[last][0] },
      index: last,
      bearing: bearingBetween(
        { lat: coordinates[last - 1][1], lng: coordinates[last - 1][0] },
        { lat: coordinates[last][1], lng: coordinates[last][0] },
      ),
    };
  }

  // بحث ثنائي: المسافات التراكمية مرتّبة تصاعدياً دائماً
  let lo = 0;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cumulative[mid] <= distanceM) lo = mid;
    else hi = mid - 1;
  }

  const a = { lat: coordinates[lo][1], lng: coordinates[lo][0] };
  const b = { lat: coordinates[lo + 1][1], lng: coordinates[lo + 1][0] };
  const segment = cumulative[lo + 1] - cumulative[lo];
  const ratio = segment > 0 ? (distanceM - cumulative[lo]) / segment : 0;

  return {
    point: {
      lat: a.lat + (b.lat - a.lat) * ratio,
      lng: a.lng + (b.lng - a.lng) * ratio,
    },
    index: lo,
    bearing: bearingBetween(a, b),
  };
}

/**
 * ألصِق موقعاً حقيقياً بأقرب نقطة على المسار، وأعِد المسافة المقطوعة عندها.
 * مستشعر الهاتف يتأرجح أمتاراً، فبلا هذا يبدو السهم على الرصيف أو في البيت
 * المجاور، وتُحسب المسافة الباقية خطأً.
 */
export function snapToRoute(
  coordinates: [number, number][],
  cumulative: number[],
  position: LatLng,
): { distanceAlongM: number; offRouteM: number } {
  let bestDistance = Infinity;
  let bestAlong = 0;

  for (let i = 0; i < coordinates.length - 1; i++) {
    const a = { lat: coordinates[i][1], lng: coordinates[i][0] };
    const b = { lat: coordinates[i + 1][1], lng: coordinates[i + 1][0] };

    // إسقاط مستوٍ: على أطوال مقطع واحد يكفي ويُجنّبنا مثلثات كروية لكل نقطة
    const latScale = Math.cos(toRad(position.lat));
    const ax = (b.lng - a.lng) * latScale;
    const ay = b.lat - a.lat;
    const px = (position.lng - a.lng) * latScale;
    const py = position.lat - a.lat;
    const lenSq = ax * ax + ay * ay;
    const t = lenSq > 0 ? Math.max(0, Math.min(1, (px * ax + py * ay) / lenSq)) : 0;

    const proj = { lat: a.lat + ay * t, lng: a.lng + (b.lng - a.lng) * t };
    const d = haversineM(position, proj);
    if (d < bestDistance) {
      bestDistance = d;
      bestAlong = cumulative[i] + (cumulative[i + 1] - cumulative[i]) * t;
    }
  }

  return { distanceAlongM: bestAlong, offRouteM: bestDistance };
}

/** رقم المناورة القادمة بعد موضعنا الحالي على المسار */
export function nextManeuverIndex(
  maneuvers: NavManeuver[],
  cumulative: number[],
  distanceAlongM: number,
): number {
  for (let i = 0; i < maneuvers.length; i++) {
    const at = cumulative[maneuvers[i].shapeIndex] ?? 0;
    // هامش عشرة أمتار: المناورة تُعدّ منتهية بمجرد تجاوزها لا قبله بلحظة
    if (at > distanceAlongM + 10) return i;
  }
  return maneuvers.length - 1;
}
