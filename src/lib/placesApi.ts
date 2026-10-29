// عميل خدمة الأماكن المفتوحة في الخادم (قاعدة places: OpenStreetMap + Overture + Foursquare)
// كل الاستدعاءات POST حتى لا يظهر نص البحث ولا موقع الراكب في سجلات Nginx
// العقد في الخادم: src/backend/placesSearch.js خلف المفتاح PLACES_SEARCH_ENABLED

import { http } from './api';
import { sanitizeSearchQuery } from './sanitize';

export interface PlaceSearchResult {
  id: string;
  name: string;
  category: string;
  area_name: string;
  gov_name_ar: string;
  lat: number;
  lng: number;
  /** المسافة من الموقع الممرَّر في الطلب، بالأمتار */
  distance_m: number;
}

export interface GovernorateRef {
  code: string;
  name_ar: string;
}

export interface PlacesSearchResponse {
  gov: GovernorateRef | null;
  results: PlaceSearchResult[];
  data_version?: string;
  server_duration_ms?: number;
  reason?: string;
}

/** إشارة المصادر الإلزامية حسب رخص البيانات المفتوحة */
export const PLACES_ATTRIBUTION =
  '© OpenStreetMap contributors · Overture Maps Foundation · Foursquare';

/** الحد الأدنى لطول الاستعلام الذي يقبله الخادم */
export const MIN_QUERY_LENGTH = 2;

// ---------------------------------------------------------------------------
// كاش في الذاكرة: يقلّل الاستدعاءات ويحمي من حدّ 40 طلباً في الدقيقة
// ---------------------------------------------------------------------------

interface CacheEntry {
  at: number;
  value: PlacesSearchResponse;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 60;
const searchCache = new Map<string, CacheEntry>();

function cacheKey(q: string, govCode: string | null): string {
  return `${govCode ?? 'auto'}::${q.toLowerCase()}`;
}

function cacheGet(key: string): PlacesSearchResponse | null {
  const hit = searchCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    searchCache.delete(key);
    return null;
  }
  // تحديث الترتيب ليبقى الأحدث استخداماً في آخر القائمة (LRU)
  searchCache.delete(key);
  searchCache.set(key, hit);
  return hit.value;
}

function cacheSet(key: string, value: PlacesSearchResponse): void {
  searchCache.set(key, { at: Date.now(), value });
  while (searchCache.size > CACHE_MAX_ENTRIES) {
    const oldest = searchCache.keys().next().value;
    if (oldest === undefined) break;
    searchCache.delete(oldest);
  }
}

export function clearPlacesCache(): void {
  searchCache.clear();
}

// ---------------------------------------------------------------------------
// الاستدعاءات
// ---------------------------------------------------------------------------

export class PlacesQueryTooShortError extends Error {
  constructor() {
    super('نص البحث أقصر من الحد الذي يقبله الخادم');
    this.name = 'PlacesQueryTooShortError';
  }
}

export class PlacesServiceUnavailableError extends Error {
  constructor() {
    super('خدمة الأماكن مطفأة في هذه البيئة');
    this.name = 'PlacesServiceUnavailableError';
  }
}

// الخدمة محجوبة بمفتاح PLACES_SEARCH_ENABLED في الخادم. إن ردّ 404 مرة واحدة
// نتوقف عن مناداتها لبقية الجلسة، فلا تُهدر طلبات مع كل حرف يُكتب.
let serviceUnavailable = false;

function noteRequestError(err: unknown): void {
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 404) serviceUnavailable = true;
}

export function isPlacesServiceUnavailable(): boolean {
  return serviceUnavailable;
}

/**
 * البحث في الأماكن داخل محافظة واحدة.
 * يرسل POST فقط، ويمرّ على الكاش أولاً، ويدعم الإلغاء عبر signal.
 */
export async function searchPlacesInGovernorate(
  rawQuery: string,
  proximity: { lat: number; lng: number },
  govCode: string | null,
  signal?: AbortSignal,
): Promise<PlacesSearchResponse> {
  const q = sanitizeSearchQuery(rawQuery, 60).trim();
  if (q.length < MIN_QUERY_LENGTH) throw new PlacesQueryTooShortError();

  if (serviceUnavailable) throw new PlacesServiceUnavailableError();

  const key = cacheKey(q, govCode);
  const cached = cacheGet(key);
  if (cached) return cached;

  let res;
  try {
    res = await http.post<PlacesSearchResponse>(
      '/places/search',
      {
        q,
        lat: proximity.lat,
        lng: proximity.lng,
        ...(govCode ? { gov: govCode } : {}),
      },
      { signal, timeout: 8000 },
    );
  } catch (err) {
    noteRequestError(err);
    throw err;
  }

  const value: PlacesSearchResponse = {
    gov: res.data?.gov ?? null,
    results: Array.isArray(res.data?.results) ? res.data.results : [],
    data_version: res.data?.data_version,
    server_duration_ms: res.data?.server_duration_ms,
    reason: res.data?.reason,
  };

  cacheSet(key, value);
  return value;
}

/** كشف محافظة الراكب من إحداثياته */
export async function detectGovernorateByCoords(
  point: { lat: number; lng: number },
  signal?: AbortSignal,
): Promise<GovernorateRef | null> {
  try {
    const res = await http.post<{ gov: GovernorateRef | null }>(
      '/places/governorate',
      { lat: point.lat, lng: point.lng },
      { signal, timeout: 8000 },
    );
    return res.data?.gov ?? null;
  } catch (err) {
    noteRequestError(err);
    throw err;
  }
}

/** قائمة المحافظات المعتمدة في الخادم (للتغيير اليدوي) */
export async function fetchGovernorates(signal?: AbortSignal): Promise<GovernorateRef[]> {
  const res = await http.get<{ governorates: GovernorateRef[] }>('/places/governorates', {
    signal,
    timeout: 8000,
  });
  return Array.isArray(res.data?.governorates) ? res.data.governorates : [];
}

/** صياغة المسافة بالعربية: تحت الكيلومتر بالأمتار، وفوقه بكسر عشري واحد */
export function formatPlaceDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '';
  if (meters < 1000) return `${Math.round(meters)} م`;
  return `${(meters / 1000).toFixed(1)} كم`;
}
