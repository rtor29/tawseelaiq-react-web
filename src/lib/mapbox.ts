// خدمة Mapbox — بديل MapboxService.dart (Directions + Geocoding العكسي والبحث)
// التوكن يُقرأ من متغير البيئة VITE_MAPBOX_TOKEN فقط

import { externalGet } from './api';
import { config, NAJAF_BBOX, NAJAF_CENTER } from './config';
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

// أحياء ومعالم النجف للعرض الاحتياطي عند حقل البحث الفارغ
export const NAJAF_LOCAL_PLACES: PlaceResult[] = [
  { name: 'مرقد الإمام علي (ع)', lat: 32.0025, lon: 44.3158 },
  { name: 'مركز مدينة النجف', lat: 31.9961, lon: 44.3168 },
  { name: 'مطار النجف الدولي', lat: 31.9890, lon: 44.4040 },
  { name: 'جامعة الكوفة', lat: 32.0264, lon: 44.3862 },
  { name: 'حي الكرامة', lat: 31.9900, lon: 44.3050 },
  { name: 'حي السلام', lat: 31.9850, lon: 44.3200 },
  { name: 'حي الحنانة', lat: 32.0100, lon: 44.3350 },
  { name: 'حي النخيل', lat: 31.9750, lon: 44.3100 },
  { name: 'حي الضباط', lat: 32.0050, lon: 44.3400 },
  { name: 'حي الزهراء', lat: 31.9800, lon: 44.3300 },
  { name: 'حي الأمين', lat: 31.9920, lon: 44.3450 },
  { name: 'السوق الكبير', lat: 32.0010, lon: 44.3200 },
  { name: 'ساحة ثورة العشرين', lat: 32.0030, lon: 44.3180 },
  { name: 'حي الحانة', lat: 31.9870, lon: 44.3600 },
];

// بحث الأماكن داخل النجف حصراً — بديل searchPlaces + فلتر _isStrictlyNajaf
export async function searchPlaces(query: string, proximity?: LngLat): Promise<PlaceResult[]> {
  const q = query.trim();
  if (!q) return NAJAF_LOCAL_PLACES;

  try {
    const proximityParam = proximity
      ? `${proximity.lng},${proximity.lat}`
      : `${NAJAF_CENTER.lon},${NAJAF_CENTER.lat}`;

    const data = await externalGet<{ features?: Array<{ place_name_ar?: string; place_name?: string; text?: string; center: [number, number] }> }>(
      `${GEOCODE_URL}/${encodeURIComponent(q)}.json`,
      {
        params: {
          access_token: config.mapboxToken,
          country: 'iq',
          bbox: `${NAJAF_BBOX.west},${NAJAF_BBOX.south},${NAJAF_BBOX.east},${NAJAF_BBOX.north}`,
          language: 'ar',
          types: 'poi,address,neighborhood,locality,place,district',
          proximity: proximityParam,
          limit: '10',
          autocomplete: 'true',
        },
        timeout: 10000,
      },
    );

    const results = (data.features ?? [])
      .map((f) => ({
        name: f.place_name_ar || f.place_name || f.text || '',
        lat: f.center[1],
        lon: f.center[0],
      }))
      .filter((p) => isStrictlyNajaf(p.name, p.lat, p.lon));

    return results.length > 0 ? results : NAJAF_LOCAL_PLACES.filter(p =>
      p.name.includes(q)
    );
  } catch {
    return NAJAF_LOCAL_PLACES;
  }
}

// عكس الإحداثيات إلى عنوان عربي — بديل reverseGeocode
export async function reverseGeocode(point: LngLat): Promise<string | null> {
  try {
    const data = await externalGet<{ features?: Array<{ place_name_ar?: string; place_name?: string; text_ar?: string; text?: string }> }>(
      `${GEOCODE_URL}/${point.lng},${point.lat}.json`,
      {
        params: {
          access_token: config.mapboxToken,
          country: 'iq',
          language: 'ar',
          types: 'poi,neighborhood,locality,address',
        },
        timeout: 10000,
      },
    );
    const first = data.features?.[0];
    const name = first?.place_name_ar || first?.place_name || first?.text_ar || first?.text;
    return name && name.trim() ? name : null;
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
