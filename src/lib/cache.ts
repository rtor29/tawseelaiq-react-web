// طبقة التخزين المؤقت في المتصفح (Browser Caching Layer)
// - حفظ نتائج البحث الجغرافي الأخيرة والمواقع الشائعة لتفادي استعلامات API مكررة
// - حفظ الأماكن المفضلة والأماكن الأخيرة محلياً في LocalStorage
// - حفظ إعدادات وتفضيلات المستخدم محلياً

import type { PlaceResult } from './mapbox';
import type { LngLat } from '../types';

export interface FavoritePlace {
  id: string;
  name: string;
  address?: string;
  lat: number;
  lng: number;
  icon?: string;
  createdAt: number;
}

export interface RecentPlaceItem {
  name: string;
  address?: string;
  lat: number;
  lng: number;
  timestamp: number;
}

export interface UserSettings {
  language: string;
  theme: 'light' | 'dark' | 'system';
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  autoCenterMap: boolean;
}

const GEOCODE_CACHE_KEY = 'tawseela_geocode_cache_v1';
const REVERSE_CACHE_KEY = 'tawseela_reverse_cache_v1';
const FAVORITES_KEY = 'tawseela_favorite_places_v1';
const RECENT_PLACES_KEY = 'tawseela_recent_places_v1';
const SETTINGS_KEY = 'tawseela_user_settings_v1';

// مدة صلاحية كاش البحث: 7 أيام
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_GEOCODE_CACHE_ENTRIES = 120;

// كاش في الذاكرة لتسريع القراءة الفورية
const memoryGeocodeCache = new Map<string, { timestamp: number; data: PlaceResult[] }>();
const memoryReverseCache = new Map<string, { timestamp: number; address: string }>();

// تحميل الكاش الأولي من LocalStorage إلى الذاكرة
function initCaches() {
  if (typeof window === 'undefined') return;
  try {
    const rawGeocode = localStorage.getItem(GEOCODE_CACHE_KEY);
    if (rawGeocode) {
      const parsed = JSON.parse(rawGeocode);
      const now = Date.now();
      for (const [key, item] of Object.entries(parsed)) {
        const val = item as { timestamp: number; data: PlaceResult[] };
        if (now - val.timestamp < CACHE_TTL_MS) {
          memoryGeocodeCache.set(key, val);
        }
      }
    }

    const rawReverse = localStorage.getItem(REVERSE_CACHE_KEY);
    if (rawReverse) {
      const parsed = JSON.parse(rawReverse);
      const now = Date.now();
      for (const [key, item] of Object.entries(parsed)) {
        const val = item as { timestamp: number; address: string };
        if (now - val.timestamp < CACHE_TTL_MS) {
          memoryReverseCache.set(key, val);
        }
      }
    }
  } catch {
    // تجاهل أخطاء التخزين المؤقت
  }
}

initCaches();

function persistGeocodeCache() {
  if (typeof window === 'undefined') return;
  try {
    // تقليم الكاش إذا زاد عن الحد الأقصى
    if (memoryGeocodeCache.size > MAX_GEOCODE_CACHE_ENTRIES) {
      const keysToDelete = Array.from(memoryGeocodeCache.keys()).slice(0, memoryGeocodeCache.size - MAX_GEOCODE_CACHE_ENTRIES);
      for (const k of keysToDelete) memoryGeocodeCache.delete(k);
    }
    const obj: Record<string, { timestamp: number; data: PlaceResult[] }> = {};
    for (const [k, v] of memoryGeocodeCache.entries()) {
      obj[k] = v;
    }
    localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(obj));
  } catch {
    // LocalStorage quota exceeded or private mode
  }
}

function persistReverseCache() {
  if (typeof window === 'undefined') return;
  try {
    if (memoryReverseCache.size > MAX_GEOCODE_CACHE_ENTRIES) {
      const keysToDelete = Array.from(memoryReverseCache.keys()).slice(0, memoryReverseCache.size - MAX_GEOCODE_CACHE_ENTRIES);
      for (const k of keysToDelete) memoryReverseCache.delete(k);
    }
    const obj: Record<string, { timestamp: number; address: string }> = {};
    for (const [k, v] of memoryReverseCache.entries()) {
      obj[k] = v;
    }
    localStorage.setItem(REVERSE_CACHE_KEY, JSON.stringify(obj));
  } catch {
    // LocalStorage quota exceeded
  }
}

// 1. كاش البحث الجغرافي (searchPlaces)
export function getCachedSearchResults(query: string, proximity?: LngLat): PlaceResult[] | null {
  const norm = query.toLowerCase().trim();
  if (!norm) return null;
  const proxKey = proximity ? `${proximity.lng.toFixed(2)},${proximity.lat.toFixed(2)}` : 'default';
  const key = `${norm}#${proxKey}`;

  const cached = memoryGeocodeCache.get(key);
  if (cached) {
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
    memoryGeocodeCache.delete(key);
  }
  return null;
}

export function setCachedSearchResults(query: string, results: PlaceResult[], proximity?: LngLat): void {
  const norm = query.toLowerCase().trim();
  if (!norm || !results || results.length === 0) return;
  const proxKey = proximity ? `${proximity.lng.toFixed(2)},${proximity.lat.toFixed(2)}` : 'default';
  const key = `${norm}#${proxKey}`;

  memoryGeocodeCache.set(key, { timestamp: Date.now(), data: results });
  persistGeocodeCache();
}

// 2. كاش العنوان العكسي (reverseGeocode)
export function getCachedReverseGeocode(lat: number, lng: number): string | null {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = memoryReverseCache.get(key);
  if (cached) {
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.address;
    }
    memoryReverseCache.delete(key);
  }
  return null;
}

export function setCachedReverseGeocode(lat: number, lng: number, address: string): void {
  if (!address || !address.trim()) return;
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  memoryReverseCache.set(key, { timestamp: Date.now(), address: address.trim() });
  persistReverseCache();
}

// 3. إدارة الأماكن المفضلة (Favorite Places)
const DEFAULT_FAVORITES: FavoritePlace[] = [
  {
    id: 'fav-home',
    name: 'المنزل 🏠',
    address: 'النجف، حي السلام',
    lat: 31.985,
    lng: 44.32,
    icon: 'home',
    createdAt: Date.now(),
  },
  {
    id: 'fav-work',
    name: 'العمل 💼',
    address: 'النجف، شارع الكوفة',
    lat: 32.015,
    lng: 44.345,
    icon: 'work',
    createdAt: Date.now(),
  },
];

export function getFavoritePlaces(): FavoritePlace[] {
  if (typeof window === 'undefined') return DEFAULT_FAVORITES;
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(DEFAULT_FAVORITES));
      return DEFAULT_FAVORITES;
    }
    const items = JSON.parse(raw);
    return Array.isArray(items) && items.length > 0 ? items : DEFAULT_FAVORITES;
  } catch {
    return DEFAULT_FAVORITES;
  }
}

export function addFavoritePlace(place: { name: string; address?: string; lat: number; lng: number; icon?: string }): FavoritePlace {
  const current = getFavoritePlaces();
  const existing = current.find(f => f.name === place.name || (Math.abs(f.lat - place.lat) < 0.0005 && Math.abs(f.lng - place.lng) < 0.0005));
  if (existing) {
    return existing;
  }
  const newFav: FavoritePlace = {
    id: `fav_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    name: place.name,
    address: place.address || 'النجف الأشرف',
    lat: place.lat,
    lng: place.lng,
    icon: place.icon || 'star',
    createdAt: Date.now(),
  };
  const updated = [newFav, ...current];
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
  } catch {
    // ignore storage error
  }
  return newFav;
}

export function removeFavoritePlace(id: string): FavoritePlace[] {
  const current = getFavoritePlaces();
  const updated = current.filter(f => f.id !== id);
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(updated));
  } catch {
    // ignore storage error
  }
  return updated;
}

export function isFavoritePlace(name: string, lat: number, lng: number): boolean {
  const current = getFavoritePlaces();
  return current.some(f => f.name === name || (Math.abs(f.lat - lat) < 0.0005 && Math.abs(f.lng - lng) < 0.0005));
}

// 4. إدارة الأماكن الأخيرة (Recent Places)
const DEFAULT_RECENT: RecentPlaceItem[] = [
  {
    name: 'كراج العلاوي',
    address: 'بغداد، الصالحية، قرب شارع دمشق',
    lat: 33.3289,
    lng: 44.382,
    timestamp: Date.now(),
  },
  {
    name: 'سوبر ماركت وفر',
    address: 'النجف، السلام، قرب شارع الحزام',
    lat: 32.015,
    lng: 44.325,
    timestamp: Date.now(),
  },
  {
    name: 'جسر كراج بغداد',
    address: 'النجف، السلام، قرب شارع الخيمة',
    lat: 32.0255,
    lng: 44.341,
    timestamp: Date.now(),
  },
];

export function getRecentPlaces(): RecentPlaceItem[] {
  if (typeof window === 'undefined') return DEFAULT_RECENT;
  try {
    const raw = localStorage.getItem(RECENT_PLACES_KEY);
    if (!raw) {
      localStorage.setItem(RECENT_PLACES_KEY, JSON.stringify(DEFAULT_RECENT));
      return DEFAULT_RECENT;
    }
    const items = JSON.parse(raw);
    return Array.isArray(items) && items.length > 0 ? items : DEFAULT_RECENT;
  } catch {
    return DEFAULT_RECENT;
  }
}

export function addRecentPlace(place: { name: string; address?: string; lat: number; lng: number }): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getRecentPlaces();
    const filtered = current.filter(p => p.name !== place.name && !(Math.abs(p.lat - place.lat) < 0.0005 && Math.abs(p.lng - place.lng) < 0.0005));
    const newItem: RecentPlaceItem = {
      name: place.name,
      address: place.address || '',
      lat: place.lat,
      lng: place.lng,
      timestamp: Date.now(),
    };
    const updated = [newItem, ...filtered].slice(0, 10);
    localStorage.setItem(RECENT_PLACES_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

// 5. إعدادات المستخدم (User Settings)
export const DEFAULT_USER_SETTINGS: UserSettings = {
  language: 'ar',
  theme: 'light',
  soundEnabled: true,
  notificationsEnabled: true,
  autoCenterMap: true,
};

export function getUserSettings(): UserSettings {
  if (typeof window === 'undefined') return DEFAULT_USER_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_USER_SETTINGS;
    return { ...DEFAULT_USER_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}

export function saveUserSettings(settings: Partial<UserSettings>): UserSettings {
  const current = getUserSettings();
  const updated: UserSettings = { ...current, ...settings };
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }
  return updated;
}
