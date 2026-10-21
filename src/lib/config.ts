// إعدادات التطبيق المركزية — تُقرأ من متغيرات البيئة عبر Vite
// (بديل AppConfig من نسخة Flutter)

export const NAJAF_CENTER = { lat: 31.9961, lon: 44.3168 } as const;

// حدود محافظة النجف الأشرف للبحث الجغرافي الصارم
export const NAJAF_BBOX = { west: 44.05, south: 31.75, east: 44.65, north: 32.35 } as const;

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
  mapStyle: import.meta.env.VITE_MAP_STYLE || 'mapbox://styles/almusawy/cmvdwkv6q003801s82f9t02om',
  navigationStyle: import.meta.env.VITE_NAVIGATION_STYLE || 'mapbox://styles/almusawy/cmvdwkv6q003801s82f9t02om',

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
