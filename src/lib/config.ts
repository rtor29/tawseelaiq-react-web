// إعدادات التطبيق المركزية — تُقرأ من متغيرات البيئة عبر Vite
// (بديل AppConfig من نسخة Flutter)

export const IRAQ_DEFAULT_CENTER = { lat: 33.3152, lon: 44.3661 } as const;
export const NAJAF_CENTER = IRAQ_DEFAULT_CENTER; // للتوافق العكسي

// حدود جمهورية العراق للبحث والتوسيط الجغرافي العام
export const IRAQ_BBOX = { west: 38.5, south: 29.0, east: 48.8, north: 37.5 } as const;
export const NAJAF_BBOX = IRAQ_BBOX; // للتوافق العكسي

// محرك الخريطة المعتمد: mapbox (الافتراضي) أو maplibre
export const MAP_ENGINE = (import.meta.env.VITE_MAP_ENGINE || 'mapbox') as 'mapbox' | 'maplibre';
export const IS_MAPLIBRE = MAP_ENGINE === 'maplibre';

// أنماط OpenFreeMap النهارية (مفتوحة ومجانية)
export const OPENFREEMAP_LIBERTY_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
export const OPENFREEMAP_BRIGHT_STYLE = 'https://tiles.openfreemap.org/styles/bright';
export const OPENFREEMAP_POSITRON_STYLE = 'https://tiles.openfreemap.org/styles/positron';

// نمط Mapbox النهاري المعتمد لمنصة توصيلة
export const MAPBOX_DAY_STYLE = 'mapbox://styles/almusawy/cmvdwkv6q003801s82f9t02om';

// النمط النهاري الافتراضي بحسب محرك الخريطة
export const DEFAULT_DAY_STYLE = IS_MAPLIBRE ? OPENFREEMAP_LIBERTY_STYLE : MAPBOX_DAY_STYLE;

export interface AppConfig {
  appName: string;
  appVersion: string;
  apiBaseUrl: string;
  hubUrl: string;
  realtimeMode: 'polling' | 'signalr' | 'socketio';
  mapboxToken: string;
  mapStyle: string;
  navigationStyle: string;
  googleClientId: string;
  fareBaseIqd: number;
  farePerKmIqd: number;
  farePerMinuteIqd: number;
  fareMinIqd: number;
  fareCancellationIqd: number;
}

export const config: AppConfig = {
  appName: 'توصيله',
  appVersion: '1.0.0',

  // في الإنتاج على نفس الدومين تُمرر /api عبر Nginx، وإلا رابط كامل
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '/api',
  hubUrl: import.meta.env.VITE_REALTIME_HUB_URL || '/hubs/tracking',
  realtimeMode: (import.meta.env.VITE_REALTIME_MODE || 'polling') as 'polling' | 'signalr' | 'socketio',

  mapboxToken: import.meta.env.VITE_MAPBOX_TOKEN || '',
  mapStyle: import.meta.env.VITE_MAP_STYLE || DEFAULT_DAY_STYLE,
  navigationStyle: import.meta.env.VITE_NAVIGATION_STYLE || DEFAULT_DAY_STYLE,

  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',

  // تسعيرة بلي القياسية في العراق (الوضع الافتراضي نظامياً)
  fareBaseIqd: 1000,
  farePerKmIqd: 500,
  farePerMinuteIqd: 100,
  fareMinIqd: 3000,
  fareCancellationIqd: 1500,
};

// تحميل المفاتيح والتوكنات العامة بأمان من بيئة السيرفر عند غيابها
if (typeof window !== 'undefined' && !config.mapboxToken) {
  fetch(`${config.apiBaseUrl}/config/public`)
    .then((r) => r.json())
    .then((data: { success?: boolean; mapboxToken?: string; googleClientId?: string }) => {
      if (data.mapboxToken) config.mapboxToken = data.mapboxToken;
      if (data.googleClientId) config.googleClientId = data.googleClientId;
    })
    .catch(() => {});
}

export function apiUrl(path: string): string {
  return `${config.apiBaseUrl}${path}`;
}
