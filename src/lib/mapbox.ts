// خدمة Mapbox — بديل MapboxService.dart (Directions + Geocoding العكسي والبحث)
// التوكن يُقرأ من متغير البيئة VITE_MAPBOX_TOKEN فقط

import { externalGet } from './api';
import { config, NAJAF_BBOX } from './config';
import type { LngLat } from '../types';

export interface RouteResult {
  coordinates: LngLat[];
  distanceKm: number;
  durationMinutes: number;
  summary: string;
  rawGeoJson: GeoJSON.LineString;
}

export interface PlaceResult {
  name: string;
  lat: number;
  lon: number;
  subName?: string;
  fullName?: string;
}

const DIRECTIONS_URL = 'https://api.mapbox.com/directions/v5/mapbox/driving';
const GEOCODE_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

function toGeoJsonLine(coords: LngLat[]): GeoJSON.LineString {
  return { type: 'LineString', coordinates: coords.map((p) => [p.lng, p.lat]) };
}

// استرجاع مسار القيادة الحقيقي على الشوارع (بديل getDirections)
export async function getDirections(
  origin: LngLat,
  destination: LngLat,
  waypoints: LngLat[] = [],
): Promise<RouteResult> {
  const points = [origin, ...waypoints, destination];
  const coordsParam = points.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = `${DIRECTIONS_URL}/${coordsParam}`;

  try {
    const data = await externalGet<{
      routes?: Array<{
        distance: number;
        duration: number;
        geometry: { coordinates: [number, number][] };
        legs?: Array<{ summary?: string }>;
      }>;
    }>(url, {
      params: {
        access_token: config.mapboxToken,
        geometries: 'geojson',
        overview: 'full',
        steps: 'true',
        language: 'ar',
      },
      timeout: 15000,
    });

    const route = data.routes?.[0];
    if (!route) throw new Error('لم يتم العثور على مسار صالح من ماب بوكس');

    const coordinates: LngLat[] = route.geometry.coordinates.map(([lon, lat]) => ({
      lng: lon,
      lat,
    }));
    const rawGeoJson: GeoJSON.LineString = { type: 'LineString', coordinates: route.geometry.coordinates };

    return {
      coordinates,
      distanceKm: route.distance / 1000,
      durationMinutes: route.duration / 60,
      summary: route.legs?.[0]?.summary || 'طريق مباشر',
      rawGeoJson,
    };
  } catch {
    // احتياط: خط مستقيم عند تعذر الاتصال أو تجاوز الحدود — كما في النسخة الأصلية
    const mid: LngLat = {
      lat: (origin.lat + destination.lat) / 2,
      lng: (origin.lng + destination.lng) / 2,
    };
    const fallback = [origin, mid, destination];
    return {
      coordinates: fallback,
      distanceKm: 5.2,
      durationMinutes: 10,
      summary: 'مسار افتراضي مباشر - النجف الأشرف',
      rawGeoJson: toGeoJsonLine(fallback),
    };
  }
}

// أحياء ومعالم وفنادق ومطاعم النجف للعرض المقترح والاحتياطي
export const NAJAF_LOCAL_PLACES: PlaceResult[] = [
  { name: 'مرقد الإمام علي (ع)', lat: 32.0025, lon: 44.3158, subName: 'المدينة القديمة، النجف الأشرف' },
  { name: 'مركز مدينة النجف', lat: 31.9961, lon: 44.3168, subName: 'مركز المدينة، النجف الأشرف' },
  { name: 'مطار النجف الدولي', lat: 31.9890, lon: 44.4040, subName: 'طريق المطار، النجف الأشرف' },
  { name: 'جامعة الكوفة', lat: 32.0264, lon: 44.3862, subName: 'مجمع الكليات، الكوفة' },
  { name: 'حي الكرامة', lat: 31.9900, lon: 44.3050, subName: 'حي الكرامة، النجف الأشرف' },
  { name: 'حي السلام', lat: 31.9850, lon: 44.3200, subName: 'حي السلام، النجف الأشرف' },
  { name: 'حي الحنانة', lat: 32.0100, lon: 44.3350, subName: 'حي الحنانة، النجف الأشرف' },
  { name: 'حي النخيل', lat: 31.9750, lon: 44.3100, subName: 'حي النخيل، النجف الأشرف' },
  { name: 'حي الضباط', lat: 32.0050, lon: 44.3400, subName: 'حي الضباط، النجف الأشرف' },
  { name: 'حي الزهراء', lat: 31.9800, lon: 44.3300, subName: 'حي الزهراء، النجف الأشرف' },
  { name: 'حي الأمين', lat: 31.9920, lon: 44.3450, subName: 'حي الأمين، النجف الأشرف' },
  { name: 'حي الأنصار', lat: 31.9870, lon: 44.3600, subName: 'حي الأنصار، النجف الأشرف' },
  { name: 'حي النصار', lat: 31.9880, lon: 44.3580, subName: 'حي النصار، النجف الأشرف' },
  { name: 'حي الأمير', lat: 32.0120, lon: 44.3250, subName: 'حي الأمير، النجف الأشرف' },
  { name: 'حي السعد', lat: 32.0080, lon: 44.3220, subName: 'حي السعد، النجف الأشرف' },
  { name: 'حي العدالة', lat: 32.0150, lon: 44.3450, subName: 'حي العدالة، النجف الأشرف' },
  { name: 'حي ميسان', lat: 32.0180, lon: 44.3800, subName: 'الكوفة، النجف الأشرف' },
  { name: 'حي الاشتراكي', lat: 31.9830, lon: 44.3350, subName: 'حي الاشتراكي، النجف الأشرف' },
  { name: 'السوق الكبير', lat: 32.0010, lon: 44.3200, subName: 'المدينة القديمة، النجف الأشرف' },
  { name: 'ساحة ثورة العشرين', lat: 32.0030, lon: 44.3180, subName: 'ساحة ثورة العشرين، النجف الأشرف' },
  { name: 'شارع الروان', lat: 32.0130, lon: 44.3400, subName: 'شارع الروان التجاري، النجف الأشرف' },
  { name: 'شارع المدينة', lat: 32.0050, lon: 44.3250, subName: 'شارع المدينة، النجف الأشرف' },
  { name: 'شارع كربلاء', lat: 32.0250, lon: 44.3100, subName: 'طريق يا حسين، النجف الأشرف' },
  { name: 'شارع الكوفة', lat: 32.0150, lon: 44.3600, subName: 'طريق النجف - الكوفة' },
  { name: 'كورنيش الكوفة', lat: 32.0300, lon: 44.4000, subName: 'كورنيش الكوفة، النجف الأشرف' },
  { name: 'مسجد الكوفة المعظم', lat: 32.0290, lon: 44.4010, subName: 'الكوفة، النجف الأشرف' },
  { name: 'مسجد السهلة المعظم', lat: 32.0380, lon: 44.3850, subName: 'الكوفة، النجف الأشرف' },
  { name: 'فندق قصر الدر', lat: 32.0040, lon: 44.3140, subName: 'فندق قصر الدر، المدينة القديمة' },
  { name: 'فندق قصر الشفاعة', lat: 32.0035, lon: 44.3145, subName: 'المدينة القديمة، النجف الأشرف' },
  { name: 'فندق بلاس النجف', lat: 32.0060, lon: 44.3180, subName: 'فندق بلاس، النجف الأشرف' },
  { name: 'فندق الطاووس', lat: 32.0020, lon: 44.3170, subName: 'فندق الطاووس، المدينة القديمة' },
  { name: 'مستشفى الصدر التعليمي', lat: 32.0150, lon: 44.3350, subName: 'مستشفى الصدر، النجف الأشرف' },
  { name: 'مستشفى الحكيم العام', lat: 32.0080, lon: 44.3280, subName: 'مستشفى الحكيم، النجف الأشرف' },
  { name: 'مستشفى الفرات الأوسط', lat: 32.0200, lon: 44.3900, subName: 'الكوفة، النجف الأشرف' },
  { name: 'سيتي مول النجف', lat: 32.0120, lon: 44.3420, subName: 'حي الأمير، النجف الأشرف' },
  { name: 'مطعم ومشاوي الفردوس', lat: 32.0070, lon: 44.3320, subName: 'النجف الأشرف' },
  { name: 'مطعم الطازج', lat: 32.0110, lon: 44.3380, subName: 'شارع الروان، النجف الأشرف' },
];

import {
  getCachedSearchResults,
  setCachedSearchResults,
  getCachedReverseGeocode,
  setCachedReverseGeocode,
} from './cache';
import { sanitizeSearchQuery, normalizeArabicText } from './sanitize';

// بحث الأماكن الذكي باللغة العربية داخل النجف الأشرف والعراق
// يدعم كافة المعالم، الأحياء، الفنادق، المطاعم والشوارع مع Proximity للنجف و Fuzzy Matching
export async function searchPlaces(query: string, proximity?: LngLat): Promise<PlaceResult[]> {
  const q = sanitizeSearchQuery(query).trim();
  if (!q) return NAJAF_LOCAL_PLACES;

  // التحقق من كاش المتصفح أولاً لتقليل استهلاك الـ API وتسريع الاستجابة الفورية
  const cached = getCachedSearchResults(q, proximity);
  if (cached && cached.length > 0) {
    return cached;
  }

  // 1. تحديد ثقل البحث الجغرافي (Proximity Bias):
  // توجيه البحث مباشرة نحو مركز محافظة النجف الأشرف 44.3358,31.9922 لتعطى الأولوية للأحياء والمعالم القريبة
  const proximityParam = proximity
    ? `${proximity.lng},${proximity.lat}`
    : '44.3358,31.9922';

  // 2. تجهيز معلمات استدعاء Mapbox Geocoding API الصارمة:
  // language=ar, country=iq, proximity=44.3358,31.9922,
  // types=poi,neighborhood,locality,address,street, fuzzyMatch=true
  const baseParams: Record<string, string> = {
    access_token: config.mapboxToken,
    country: 'iq',
    language: 'ar',
    proximity: proximityParam,
    types: 'poi,neighborhood,locality,address,street',
    fuzzyMatch: 'true',
    autocomplete: 'true',
    limit: '10',
  };

  try {
    const url = `${GEOCODE_URL}/${encodeURIComponent(q)}.json`;

    // استعلام أول مع BBOX النجف لحصر النتائج بدقة محلية عالية
    let data = await externalGet<{
      features?: Array<{
        id: string;
        place_name_ar?: string;
        place_name?: string;
        text_ar?: string;
        text?: string;
        center: [number, number];
        context?: Array<{ id: string; text_ar?: string; text?: string }>;
        properties?: { address?: string; category?: string };
      }>;
    }>(url, {
      params: {
        ...baseParams,
        bbox: `${NAJAF_BBOX.west},${NAJAF_BBOX.south},${NAJAF_BBOX.east},${NAJAF_BBOX.north}`,
      },
      timeout: 10000,
    });

    let rawFeatures = data?.features ?? [];

    // إذا لم تُرجع الـ BBOX نتائج (مثلاً لمعلم قريب جداً من الحدود)، نبحث بمرونة في العراق مع ثقل Proximity النجف
    if (rawFeatures.length === 0) {
      try {
        const fallbackData = await externalGet<{
          features?: Array<{
            id: string;
            place_name_ar?: string;
            place_name?: string;
            text_ar?: string;
            text?: string;
            center: [number, number];
            context?: Array<{ id: string; text_ar?: string; text?: string }>;
            properties?: { address?: string; category?: string };
          }>;
        }>(url, {
          params: baseParams,
          timeout: 8000,
        });
        if (fallbackData?.features && fallbackData.features.length > 0) {
          rawFeatures = fallbackData.features;
        }
      } catch {}
    }

    const mapped: PlaceResult[] = rawFeatures
      .map((f) => {
        // استخراج الاسم العربي المباشر للمعلم أو الحي أو الشارع
        const name =
          f.text_ar ||
          (f.place_name_ar ? f.place_name_ar.split(',')[0].trim() : '') ||
          f.text ||
          (f.place_name ? f.place_name.split(',')[0].trim() : '') ||
          '';

        // استخراج اسم الحي والمدينة من context أو place_name_ar
        const neighborhood =
          f.context?.find((c) => c.id?.startsWith('neighborhood'))?.text_ar ||
          f.context?.find((c) => c.id?.startsWith('neighborhood'))?.text;
        const locality =
          f.context?.find((c) => c.id?.startsWith('locality') || c.id?.startsWith('place'))?.text_ar ||
          f.context?.find((c) => c.id?.startsWith('locality') || c.id?.startsWith('place'))?.text;

        let subName = '';
        if (neighborhood && locality) {
          subName = `${neighborhood}، ${locality}`;
        } else if (neighborhood) {
          subName = `${neighborhood}، النجف الأشرف`;
        } else if (locality) {
          subName = locality;
        } else if (f.place_name_ar) {
          const parts = f.place_name_ar.split(',').map((p) => p.trim());
          if (parts.length > 1) {
            subName = parts.slice(1, 3).join('، ');
          }
        }
        if (!subName) {
          subName = 'النجف الأشرف';
        }

        return {
          name,
          lat: f.center[1],
          lon: f.center[0],
          subName,
          fullName: f.place_name_ar || f.place_name || name,
        };
      })
      .filter((p) => isStrictlyNajaf(p.name, p.lat, p.lon));

    // مطابقة محلية مرنة في قائمة أحياء ومعالم النجف (Local Arabic Normalization)
    const normQ = normalizeArabicText(q);
    const localMatches = NAJAF_LOCAL_PLACES.filter((p) => {
      const normName = normalizeArabicText(p.name);
      const normSub = p.subName ? normalizeArabicText(p.subName) : '';
      return normName.includes(normQ) || normSub.includes(normQ) || normQ.includes(normName);
    });

    // دمج النتائج مع إزالة التكرار
    const seen = new Set<string>();
    const finalResults: PlaceResult[] = [];

    for (const item of [...mapped, ...localMatches]) {
      const key = `${normalizeArabicText(item.name)}-${item.lat.toFixed(3)},${item.lon.toFixed(3)}`;
      if (!seen.has(key)) {
        seen.add(key);
        finalResults.push(item);
      }
    }

    const fallbackResults = finalResults.length > 0 ? finalResults : localMatches;

    if (fallbackResults.length > 0) {
      setCachedSearchResults(q, fallbackResults, proximity);
    }

    return fallbackResults.length > 0 ? fallbackResults : NAJAF_LOCAL_PLACES;
  } catch {
    // السقوط الآمن على المطابقة المحلية الذكية في النجف الأشرف
    const normQ = normalizeArabicText(q);
    const localMatches = NAJAF_LOCAL_PLACES.filter((p) => {
      const normName = normalizeArabicText(p.name);
      const normSub = p.subName ? normalizeArabicText(p.subName) : '';
      return normName.includes(normQ) || normSub.includes(normQ) || normQ.includes(normName);
    });

    return localMatches.length > 0 ? localMatches : NAJAF_LOCAL_PLACES;
  }
}

// عكس الإحداثيات إلى عنوان عربي دقيق باللغة العربية ومعالم النجف — بديل reverseGeocode مع كاش محلي
export async function reverseGeocode(point: LngLat): Promise<string | null> {
  // التحقق من كاش العناوين العكسية أولاً
  const cached = getCachedReverseGeocode(point.lat, point.lng);
  if (cached) return cached;

  try {
    const data = await externalGet<{ features?: Array<{ place_name_ar?: string; place_name?: string; text_ar?: string; text?: string }> }>(
      `${GEOCODE_URL}/${point.lng},${point.lat}.json`,
      {
        params: {
          access_token: config.mapboxToken,
          country: 'iq',
          language: 'ar',
          types: 'poi,neighborhood,locality,address,street',
          proximity: `${point.lng},${point.lat}`,
        },
        timeout: 10000,
      },
    );
    const first = data.features?.[0];
    const name = first?.place_name_ar || first?.place_name || first?.text_ar || first?.text;
    const finalName = name && name.trim() ? name.trim() : null;
    if (finalName) {
      setCachedReverseGeocode(point.lat, point.lng, finalName);
    }
    return finalName;
  } catch {
    return null;
  }
}

const OTHER_GOVERNORATES = [
  'بغداد', 'كربلاء', 'بابل', 'البصرة', 'أربيل', 'الموصل', 'السليمانية', 'الأنبار',
  'ديالى', 'كركوك', 'واسط', 'ميسان', 'المثنى', 'ذي قار', 'القادسية', 'صلاح الدين',
  'دهوك', 'الديوانية', 'الحلة', 'الناصرية', 'العمارة', 'الكوت', 'السماوة',
];

export function isStrictlyNajaf(name: string, lat: number, lon: number): boolean {
  if (lon < NAJAF_BBOX.west || lon > NAJAF_BBOX.east || lat < NAJAF_BBOX.south || lat > NAJAF_BBOX.north) {
    return false;
  }
  const lower = name.toLowerCase();
  return !OTHER_GOVERNORATES.some(
    (gov) => lower.includes(gov) && !lower.includes('النجف') && !lower.includes('الكوفة'),
  );
}

/**
 * تعريب وتكبير خطوط خريطة Mapbox وتوضيحها بنمط احترافي (Waze / Tawseela Design):
 * 1. تعريب أسماء الشوارع والأماكن والمعالم عبر ['coalesce', ['get', 'name_ar'], ['get', 'name']]
 * 2. تكبير حجم الخطوط بنسبة 25%: ['interpolate', ['linear'], ['zoom'], 10, 13, 14, 16.5, 18, 20.5]
 * 3. إضافة هالة بيضاء واضحة (White Halo): text-halo-color: '#ffffff', text-halo-width: 2
 */
export function applyArabicAndEnhancedLabels(rawMap: any) {
  if (!rawMap) return;
  const map = typeof rawMap.getMap === 'function' ? rawMap.getMap() : rawMap;
  if (!map) return;

  const updateLayers = () => {
    try {
      if (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded()) return;
      const style = map.getStyle?.();
      if (!style || !Array.isArray(style.layers)) return;

      for (const layer of style.layers) {
        if (layer.type === 'symbol' && layer.layout && layer.layout['text-field']) {
          // 1. صيغة استرجاع النص العربي (Text field Formula: coalesce(name_ar, name_en, name))
          try {
            map.setLayoutProperty(layer.id, 'text-field', [
              'coalesce',
              ['get', 'name_ar'],
              ['get', 'name_en'],
              ['get', 'name'],
            ]);
          } catch {}

          // 2. تعيين خط الخريطة (Font: Arial Unicode MS Regular)
          try {
            map.setLayoutProperty(layer.id, 'text-font', ['Arial Unicode MS Regular', 'Arial Unicode MS Bold']);
          } catch {
            try {
              map.setLayoutProperty(layer.id, 'text-font', ['Arial Unicode MS Regular']);
            } catch {}
          }

          // 3. تباعد الأحرف (Letter spacing: 0.01 em)
          try {
            map.setLayoutProperty(layer.id, 'text-letter-spacing', 0.01);
          } catch {}

          // 4. ارتفاع السطر (Line height: 1.2 em)
          try {
            map.setLayoutProperty(layer.id, 'text-line-height', 1.2);
          } catch {}

          // 5. أقصى عرض للسطر (Max width: 10 em)
          try {
            map.setLayoutProperty(layer.id, 'text-max-width', 10);
          } catch {}

          // 6. التحويل (Transform: none / Tt)
          try {
            map.setLayoutProperty(layer.id, 'text-transform', 'none');
          } catch {}

          // 7. حجم الخط وتدرجه بنطاق مقياس دقيق (Size scale range: 0.8, 2)
          try {
            map.setLayoutProperty(layer.id, 'text-size', [
              'interpolate',
              ['linear'],
              ['zoom'],
              10,
              13,
              14,
              16.5,
              18,
              20.5,
            ]);
          } catch {}

          // 8. الشفافية (Opacity: 1)
          try {
            map.setPaintProperty(layer.id, 'text-opacity', 1);
          } catch {}

          // 9. هالة بيضاء ناصعة ومريحة لسهولة قراءة أسماء المعالم فوق خلفيات الخريطة
          try {
            map.setPaintProperty(layer.id, 'text-halo-color', '#ffffff');
            map.setPaintProperty(layer.id, 'text-halo-width', 2);
          } catch {}
        }
      }
    } catch {}
  };

  if (typeof map.isStyleLoaded === 'function' && map.isStyleLoaded()) {
    updateLayers();
  }

  if (typeof map.on === 'function') {
    map.on('style.load', updateLayers);
  }
}
