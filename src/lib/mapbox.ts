// خدمة Mapbox — بديل MapboxService.dart (Directions + Geocoding العكسي والبحث)
// التوكن يُقرأ من متغير البيئة VITE_MAPBOX_TOKEN فقط

import { http, externalGet } from './api';
import { config, IS_MAPLIBRE } from './config';
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
      summary: 'مسار افتراضي مباشر',
      rawGeoJson: toGeoJsonLine(fallback),
    };
  }
}

// قائمة فارغة للتوافق العكسي — تم اعتماد بحث Mapbox و OpenStreetMap الحي لكل العراق
export const NAJAF_LOCAL_PLACES: PlaceResult[] = [];

import {
  getCachedSearchResults,
  setCachedSearchResults,
  getCachedReverseGeocode,
  setCachedReverseGeocode,
} from './cache';
import { sanitizeSearchQuery, normalizeArabicText } from './sanitize';

// بحث الأماكن الذكي باللغة العربية داخل كل محافظات العراق
// يدمج بين Mapbox Geocoding و OpenStreetMap Nominatim للأماكن والمحلات المحلية (مثل السوبرماركت والمعالم)
export async function searchPlaces(query: string, proximity?: LngLat): Promise<PlaceResult[]> {
  const q = sanitizeSearchQuery(query).trim();
  if (!q) return [];

  // التحقق من كاش المتصفح أولاً لتقليل استهلاك الـ API وتسريع الاستجابة الفورية
  const cached = getCachedSearchResults(q, proximity);
  if (cached && cached.length > 0) {
    return cached;
  }

  // تحديد ثقل البحث الجغرافي (Proximity Bias):
  // توجيه البحث جغرافياً حول موقع المستخدم إذا توفر
  const proximityParam = proximity
    ? `${proximity.lng},${proximity.lat}`
    : undefined;

  // 0. الاستعلام أولاً من خادم التطبيق المشترك (Redis Cache) لتوفير استدعاءات Mapbox
  try {
    const serverRes = await http.get<{
      success?: boolean;
      places?: Array<{ id: string; name: string; address?: string; lat: number; lng: number }>;
      source?: string;
    }>('/places/search', {
      params: { q, proximity: proximityParam },
      timeout: 3500,
    });
    if (serverRes.data?.success && Array.isArray(serverRes.data.places) && serverRes.data.places.length > 0) {
      const places: PlaceResult[] = serverRes.data.places.map((p) => ({
        name: p.name,
        subName: p.address || p.name,
        fullName: p.address || p.name,
        lat: p.lat,
        lon: p.lng,
      }));
      setCachedSearchResults(q, places, proximity);
      return places;
    }
  } catch (_) {
    // السقوط الآمن على استدعاء Mapbox المباشر في حال انقطاع الخادم
  }

  // 1. محرك Mapbox Geocoding API الصارم
  const fetchMapbox = async (): Promise<PlaceResult[]> => {
    if (!config.mapboxToken) return [];
    try {
      const url = `${GEOCODE_URL}/${encodeURIComponent(q)}.json`;
      const data = await externalGet<{
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
          access_token: config.mapboxToken,
          country: 'iq',
          language: 'ar',
          types: 'poi,address,neighborhood,locality',
          ...(proximityParam ? { proximity: proximityParam } : {}),
          autocomplete: 'true',
          fuzzyMatch: 'true',
          limit: '8',
        },
        timeout: 7000,
      });

      return (data?.features ?? []).map((f) => {
        const name =
          f.text_ar ||
          (f.place_name_ar ? f.place_name_ar.split(',')[0].trim() : '') ||
          f.text ||
          (f.place_name ? f.place_name.split(',')[0].trim() : '') ||
          '';

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
          subName = `${neighborhood}، العراق`;
        } else if (locality) {
          subName = locality;
        } else if (f.place_name_ar) {
          const parts = f.place_name_ar.split(',').map((p) => p.trim());
          if (parts.length > 1) {
            subName = parts.slice(1, 3).join('، ');
          }
        }
        if (!subName) subName = 'العراق';

        return {
          name,
          lat: f.center[1],
          lon: f.center[0],
          subName,
          fullName: f.place_name_ar || f.place_name || name,
        };
      });
    } catch {
      return [];
    }
  };

  // 2. محرك OpenStreetMap Nominatim للأماكن والمحلات المحلية الدقيقة بالعراق
  const fetchNominatim = async (): Promise<PlaceResult[]> => {
    try {
      // توجيه معلمات Nominatim مع حصر بالعراق كاملاً عبر countrycodes=iq ودعم اللغة العربية
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        q
      )}&format=json&countrycodes=iq&accept-language=ar&limit=8`;
      const res = await externalGet<
        Array<{
          place_id: number;
          lat: string;
          lon: string;
          name?: string;
          display_name: string;
          class?: string;
          type?: string;
        }>
      >(nominatimUrl, {
        headers: {
          'Accept-Language': 'ar',
        },
        timeout: 7000,
      });

      if (!Array.isArray(res)) return [];

      return res.map((item) => {
        const rawName = item.name || (item.display_name ? item.display_name.split(',')[0].trim() : q);
        let subName = '';
        if (item.display_name) {
          const parts = item.display_name.split(',').map((s) => s.trim());
          if (parts.length > 2) {
            subName = parts.slice(1, 3).join('، ');
          } else if (parts.length > 1) {
            subName = parts[1];
          }
        }
        if (!subName) subName = 'العراق';

        return {
          name: rawName,
          lat: parseFloat(item.lat),
          lon: parseFloat(item.lon),
          subName,
          fullName: item.display_name || rawName,
        };
      });
    } catch {
      return [];
    }
  };

  try {
    // تشغيل محركي Mapbox و OpenStreetMap معاً بالتوازي لتحقيق أقصى سرعة ودقة في كل العراق
    const [mapboxSettled, nominatimSettled] = await Promise.allSettled([fetchMapbox(), fetchNominatim()]);
    const mapboxResults = mapboxSettled.status === 'fulfilled' ? mapboxSettled.value : [];
    const nominatimResults = nominatimSettled.status === 'fulfilled' ? nominatimSettled.value : [];

    const normQ = normalizeArabicText(q);

    // دمج نتائج المصادر
    const combined = [...nominatimResults, ...mapboxResults];

    // إزالة التكرار مع الحفاظ على الأماكن المحددة داخل العراق
    const seen = new Set<string>();
    const finalResults: PlaceResult[] = [];

    for (const item of combined) {
      if (!item.name || isNaN(item.lat) || isNaN(item.lon)) continue;
      // تصفية جغرافية تضمن أن النتائج داخل جمهورية العراق (خطوط عرض 29 إلى 38، خطوط طول 38.5 إلى 49)
      if (item.lat < 29.0 || item.lat > 38.0 || item.lon < 38.5 || item.lon > 49.0) continue;

      const normName = normalizeArabicText(item.name).slice(0, 20);
      const key = `${normName}-${item.lat.toFixed(3)},${item.lon.toFixed(3)}`;
      if (!seen.has(key)) {
        seen.add(key);
        finalResults.push(item);
      }
    }

    // فرز ذكي: الأقرب لموقع المستخدم أولاً (إن توفر proximity) ثم قوة مطابقة الاسم
    finalResults.sort((a, b) => {
      if (proximity) {
        const distA = Math.hypot(a.lat - proximity.lat, a.lon - proximity.lng);
        const distB = Math.hypot(b.lat - proximity.lat, b.lon - proximity.lng);
        if (Math.abs(distA - distB) > 0.05) {
          return distA - distB;
        }
      }

      const aExact = normalizeArabicText(a.name).includes(normQ) ? 1 : 0;
      const bExact = normalizeArabicText(b.name).includes(normQ) ? 1 : 0;
      return bExact - aExact;
    });

    // تخزين النتائج في الكاش إذا وجدت نتائج
    if (finalResults.length > 0) {
      setCachedSearchResults(q, finalResults, proximity);
    }

    // إرجاع مصفوفة النتائج (أو مصفوفة فارغة إذا لم يعثر على شيء لإظهار رسالة عدم التطابق)
    return finalResults;
  } catch {
    return [];
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

// حدود جمهورية العراق الجغرافية الصارمة (تغطي كافة المحافظات الـ 18)
export const IRAQ_BOUNDS = {
  minLat: 29.0,
  maxLat: 37.5,
  minLon: 38.5,
  maxLon: 48.8,
} as const;

export function isInIraq(lat: number, lon: number): boolean {
  return lat >= IRAQ_BOUNDS.minLat && lat <= IRAQ_BOUNDS.maxLat &&
         lon >= IRAQ_BOUNDS.minLon && lon <= IRAQ_BOUNDS.maxLon;
}

// للتوافق العكسي
export function isStrictlyNajaf(_name: string, lat: number, lon: number): boolean {
  return isInIraq(lat, lon);
}

/**
 * تعريب وتكبير خطوط خريطة Mapbox وتوضيحها بنمط احترافي (Waze / Tawseela Design):
 * 1. تعريب أسماء الشوارع والأماكن والمعالم عبر ['coalesce', ['get', 'name_ar'], ['get', 'name']]
 * 2. تكبير حجم الخطوط بنسبة 25%: ['interpolate', ['linear'], ['zoom'], 10, 13, 14, 16.5, 18, 20.5]
 * 3. إضافة هالة بيضاء واضحة (White Halo): text-halo-color: '#ffffff', text-halo-width: 2
 */
export function applyArabicAndEnhancedLabels(rawMap: any, _isDark = true) {
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

          // 2. تعيين خط الخريطة (Font: Arial Unicode MS Regular لماب بوكس فقط؛ بينما MapLibre/OpenFreeMap يعتمد خطوط نمطه الأصلية Noto Sans)
          if (!IS_MAPLIBRE) {
            try {
              map.setLayoutProperty(layer.id, 'text-font', ['Arial Unicode MS Regular', 'Arial Unicode MS Bold']);
            } catch {
              try {
                map.setLayoutProperty(layer.id, 'text-font', ['Arial Unicode MS Regular']);
              } catch {}
            }
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

          // 9. هالة واضحة ومريحة لسهولة قراءة أسماء المعالم فوق خلفية الخريطة النهارية الموحدة
          try {
            // نصوص داكنة صريحة #0F172A مع هالة بيضاء 2.0px لسهولة القراءة السريعة وأقصى تباين دائماً
            map.setPaintProperty(layer.id, 'text-color', '#0F172A');
            map.setPaintProperty(layer.id, 'text-halo-color', '#FFFFFF');
            map.setPaintProperty(layer.id, 'text-halo-width', 2.0);
            map.setPaintProperty(layer.id, 'text-halo-blur', 0.5);
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

/**
 * توضيح خطوط الشوارع والأزقة باللون الفضي عالي التباين (#E2E8F0) مع خلفية كحلية/أوبسيديانية لخرائط الوضع الليلي
 */
export function enhanceDarkMapRoads(rawMap: any) {
  if (!rawMap) return;
  const map = typeof rawMap.getMap === 'function' ? rawMap.getMap() : rawMap;
  if (!map) return;

  const updateRoads = () => {
    try {
      if (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded()) return;
      const style = map.getStyle?.();
      if (!style || !Array.isArray(style.layers)) return;

      for (const layer of style.layers) {
        // خلفية الخريطة الداكنة
        if (layer.type === 'background') {
          try {
            map.setPaintProperty(layer.id, 'background-color', '#080E1A');
          } catch {}
        }

        // مسطحات المياه
        if (layer.type === 'fill' && layer.id.includes('water')) {
          try {
            map.setPaintProperty(layer.id, 'fill-color', '#0A1220');
          } catch {}
        }

        // المباني
        if (layer.type === 'fill' && layer.id.includes('building')) {
          try {
            map.setPaintProperty(layer.id, 'fill-color', '#111827');
            map.setPaintProperty(layer.id, 'fill-opacity', 0.6);
          } catch {}
        }

        // خطوط الشوارع والمسارات والأزقة
        if (layer.type === 'line' && (
          layer.id.includes('road') || 
          layer.id.includes('street') || 
          layer.id.includes('bridge') || 
          layer.id.includes('tunnel') ||
          layer.id.includes('highway')
        )) {
          try {
            if (layer.id.includes('motorway') || layer.id.includes('trunk') || layer.id.includes('primary')) {
              map.setPaintProperty(layer.id, 'line-color', '#E2E8F0');
              map.setPaintProperty(layer.id, 'line-opacity', 0.95);
            } else if (layer.id.includes('secondary') || layer.id.includes('tertiary')) {
              map.setPaintProperty(layer.id, 'line-color', '#CBD5E1');
              map.setPaintProperty(layer.id, 'line-opacity', 0.88);
            } else {
              map.setPaintProperty(layer.id, 'line-color', '#94A3B8');
              map.setPaintProperty(layer.id, 'line-opacity', 0.8);
            }
          } catch {}
        }
      }
    } catch {}
  };

  if (typeof map.isStyleLoaded === 'function' && map.isStyleLoaded()) {
    updateRoads();
  }

  if (typeof map.on === 'function') {
    map.on('style.load', updateRoads);
  }
}

/**
 * رفع تباين ووضوح شبكة الشوارع في الوضع النهاري (Day Mode Road Contrast Enhancement)
 * - الشوارع الرئيسية والسريعة: لون رمادي/كحلي واضح #475569 مع خط حافة ناصع #FFFFFF بعرض 1px
 * - الشوارع الفرعية والأزقة: لون #94A3B8 عالي التباين يمنع بهتانها تحت أشعة الشمس
 * - تسميات الشوارع والمعالم بالعربية: لون داكن صريح #0F172A مع هالة بيضاء 2.0px
 */
export function enhanceDayMapRoads(rawMap: any) {
  if (!rawMap) return;
  const map = typeof rawMap.getMap === 'function' ? rawMap.getMap() : rawMap;
  if (!map) return;

  const updateDayRoads = () => {
    try {
      if (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded()) return;
      const style = map.getStyle?.();
      if (!style || !Array.isArray(style.layers)) return;

      for (const layer of style.layers) {
        // 1. خلفية الخريطة النهارية
        if (layer.type === 'background') {
          try {
            map.setPaintProperty(layer.id, 'background-color', '#F8FAFC');
          } catch {}
        }

        // 2. مسطحات المياه
        if (layer.type === 'fill' && layer.id.includes('water')) {
          try {
            map.setPaintProperty(layer.id, 'fill-color', '#BAE6FD');
          } catch {}
        }

        // 3. المباني والكتل العمرانية
        if (layer.type === 'fill' && layer.id.includes('building')) {
          try {
            map.setPaintProperty(layer.id, 'fill-color', '#E2E8F0');
            map.setPaintProperty(layer.id, 'fill-opacity', 0.65);
            map.setPaintProperty(layer.id, 'fill-outline-color', '#CBD5E1');
          } catch {}
        }

        // 4. خطوط الشوارع والأزقة في النهار
        if (layer.type === 'line' && (
          layer.id.includes('road') || 
          layer.id.includes('street') || 
          layer.id.includes('bridge') || 
          layer.id.includes('tunnel') ||
          layer.id.includes('highway')
        )) {
          try {
            const isCasing = layer.id.includes('case') || layer.id.includes('casing');
            if (isCasing) {
              // خطوط الحواف الناصعة للفصل عن الكتل العمرانية
              map.setPaintProperty(layer.id, 'line-color', '#FFFFFF');
              map.setPaintProperty(layer.id, 'line-opacity', 1);
            } else if (layer.id.includes('motorway') || layer.id.includes('trunk') || layer.id.includes('primary')) {
              // الشوارع الرئيسية والسريعة: رمادي/كحلي واضح بدقة #475569
              map.setPaintProperty(layer.id, 'line-color', '#475569');
              map.setPaintProperty(layer.id, 'line-opacity', 1);
            } else if (layer.id.includes('secondary') || layer.id.includes('tertiary')) {
              // الشوارع الفرعية
              map.setPaintProperty(layer.id, 'line-color', '#64748B');
              map.setPaintProperty(layer.id, 'line-opacity', 0.95);
            } else {
              // الأزقة والشوارع الداخلية لمنع بهتانها تحت الشمس #94A3B8
              map.setPaintProperty(layer.id, 'line-color', '#94A3B8');
              map.setPaintProperty(layer.id, 'line-opacity', 0.9);
            }
          } catch {}
        }

        // 5. نصوص وتسميات المعالم بالعربية نهاراً
        if (layer.type === 'symbol') {
          try {
            map.setPaintProperty(layer.id, 'text-color', '#0F172A');
            map.setPaintProperty(layer.id, 'text-halo-color', '#FFFFFF');
            map.setPaintProperty(layer.id, 'text-halo-width', 2.0);
            map.setPaintProperty(layer.id, 'text-halo-blur', 0.5);
          } catch {}
        }
      }
    } catch {}
  };

  if (typeof map.isStyleLoaded === 'function' && map.isStyleLoaded()) {
    updateDayRoads();
  }

  if (typeof map.on === 'function') {
    map.on('style.load', updateDayRoads);
  }
}

/**
 * تطبيق تحسينات وتوضيح الخريطة الشاملة (نمط نهاري موحد دائم لجميع الشاشات والأوضاع)
 */
export function applyMapEnhancements(rawMap: any, _isDark = false) {
  applyArabicAndEnhancedLabels(rawMap, false);
  enhanceDayMapRoads(rawMap);
}

// ---------------------------------------------------------------------------
// تمييز خط المسار والأماكن الواقعة عليه بالأصفر الفاقع (#FFEA00) والحاشية السوداء
// مستخرج حصرياً من طبقات الخريطة النقطية والفيكتور المحملة (Vector Tiles) - صفر استدعاء خارجي
// ---------------------------------------------------------------------------

interface OriginalSymbolLayerStyle {
  textColor: any;
  haloColor: any;
  haloWidth: any;
}

const originalSymbolLayerStyles = new Map<string, OriginalSymbolLayerStyle>();

function distanceToSegmentSquared(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) {
    const dpx = px - x1;
    const dpy = py - y1;
    return dpx * dpx + dpy * dpy;
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  const dpx = px - projX;
  const dpy = py - projY;
  return dpx * dpx + dpy * dpy;
}

export function isPointNearPolyline(point: [number, number], line: [number, number][], thresholdDegrees = 0.005): boolean {
  if (!line || line.length === 0) return false;
  const thresholdSq = thresholdDegrees * thresholdDegrees;
  const [px, py] = point;
  for (let i = 0; i < line.length - 1; i++) {
    const [x1, y1] = line[i];
    const [x2, y2] = line[i + 1];
    const minX = Math.min(x1, x2) - thresholdDegrees;
    const maxX = Math.max(x1, x2) + thresholdDegrees;
    const minY = Math.min(y1, y2) - thresholdDegrees;
    const maxY = Math.max(y1, y2) + thresholdDegrees;
    if (px < minX || px > maxX || py < minY || py > maxY) continue;

    if (distanceToSegmentSquared(px, py, x1, y1, x2, y2) <= thresholdSq) {
      return true;
    }
  }
  return false;
}

/**
 * استخراج أسماء الأماكن والأحياء والشوارع القريبة من المسار من طبقات الخريطة نفسها دون أي استدعاء خارجي
 */
export function extractPlacesFromMapLayers(rawMap: any, routeCoords: [number, number][]): string[] {
  const map = typeof rawMap?.getMap === 'function' ? rawMap.getMap() : rawMap;
  if (!map || !routeCoords || routeCoords.length === 0) return [];

  const style = map.getStyle?.();
  if (!style || !Array.isArray(style.layers)) return [];

  const symbolLayers = style.layers.filter((l: any) => l.type === 'symbol' && l.layout && l.layout['text-field']);
  const layerIds = symbolLayers.map((l: any) => l.id);

  let renderedFeatures: any[] = [];
  try {
    renderedFeatures = map.queryRenderedFeatures({ layers: layerIds }) || [];
  } catch (err) {
    console.warn('[Mapbox Places] queryRenderedFeatures:', err);
  }

  const namesSet = new Set<string>();

  for (const f of renderedFeatures) {
    let pt: [number, number] | null = null;
    if (f.geometry?.type === 'Point' && Array.isArray(f.geometry.coordinates)) {
      pt = f.geometry.coordinates as [number, number];
    } else if (f.geometry?.type === 'LineString' && Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length > 0) {
      pt = f.geometry.coordinates[Math.floor(f.geometry.coordinates.length / 2)] as [number, number];
    }

    if (!pt) continue;

    if (isPointNearPolyline(pt, routeCoords, 0.006)) {
      const p = f.properties || {};
      const name = p.name_ar || p.name || p.name_en || p.text;
      if (typeof name === 'string') {
        const trimmed = name.trim();
        if (trimmed.length > 1 && !/^\d+$/.test(trimmed)) {
          namesSet.add(trimmed);
        }
      }
    }
  }

  return Array.from(namesSet);
}

/**
 * تلوين نصوص الأماكن على المسار بالأصفر الفاقع (#FFEA00) مع حاشية سوداء (#000000)
 * باستخدام طبقات الخريطة الحالية فقط
 */
export function highlightRoutePlacesOnMap(
  rawMap: any,
  routeCoords: [number, number][],
  cachedPlaces?: string[],
  isDark = true
): string[] {
  const map = typeof rawMap?.getMap === 'function' ? rawMap.getMap() : rawMap;
  if (!map || !routeCoords || routeCoords.length === 0) return [];

  // استعادة أي تلوين سابق أولاً
  restoreRoutePlacesOnMap(map, isDark);

  let placeNames: string[] = [];

  // إذا كانت القائمة مخزنة مسبقاً نستخدمها فوراً دون إعادة الحساب الهندسي (الجزء 3)
  if (Array.isArray(cachedPlaces) && cachedPlaces.length > 0) {
    placeNames = cachedPlaces;
  } else {
    // استخراج من طبقات الخريطة المحملة محلياً (الجزء 2)
    placeNames = extractPlacesFromMapLayers(map, routeCoords);
  }

  if (placeNames.length === 0) return [];

  const style = map.getStyle?.();
  if (!style || !Array.isArray(style.layers)) return placeNames;

  const symbolLayers = style.layers.filter((l: any) => l.type === 'symbol' && l.layout && l.layout['text-field']);

  const matchExpr = [
    'any',
    ['in', ['get', 'name'], ['literal', placeNames]],
    ['in', ['get', 'name_ar'], ['literal', placeNames]],
    ['in', ['get', 'name_en'], ['literal', placeNames]]
  ];

  for (const layer of symbolLayers) {
    try {
      if (!originalSymbolLayerStyles.has(layer.id)) {
        originalSymbolLayerStyles.set(layer.id, {
          textColor: map.getPaintProperty(layer.id, 'text-color') ?? (isDark ? '#FFFFFF' : '#0F172A'),
          haloColor: map.getPaintProperty(layer.id, 'text-halo-color') ?? (isDark ? '#090D16' : '#FFFFFF'),
          haloWidth: map.getPaintProperty(layer.id, 'text-halo-width') ?? 2.0,
        });
      }

      const orig = originalSymbolLayerStyles.get(layer.id)!;

      // أصفر فاقع جداً #FFEA00 للنص
      map.setPaintProperty(layer.id, 'text-color', [
        'case',
        matchExpr,
        '#FFEA00',
        orig.textColor
      ]);

      // حاشية/هالة سوداء صلبة #000000
      map.setPaintProperty(layer.id, 'text-halo-color', [
        'case',
        matchExpr,
        '#000000',
        orig.haloColor
      ]);

      // سماكة الحاشية 2.5px لإبرازها بوضوح
      map.setPaintProperty(layer.id, 'text-halo-width', [
        'case',
        matchExpr,
        2.5,
        orig.haloWidth
      ]);
    } catch (_) {}
  }

  return placeNames;
}

/**
 * إعادة جميع الأماكن لألوانها الأصلية عند إخفاء المسار
 */
export function restoreRoutePlacesOnMap(rawMap: any, _isDark = true): void {
  const map = typeof rawMap?.getMap === 'function' ? rawMap.getMap() : rawMap;
  if (!map) return;

  if (originalSymbolLayerStyles.size > 0) {
    for (const [layerId, orig] of originalSymbolLayerStyles.entries()) {
      try {
        if (map.getLayer(layerId)) {
          map.setPaintProperty(layerId, 'text-color', orig.textColor);
          map.setPaintProperty(layerId, 'text-halo-color', orig.haloColor);
          map.setPaintProperty(layerId, 'text-halo-width', orig.haloWidth);
        }
      } catch (_) {}
    }
    originalSymbolLayerStyles.clear();
  }
}
