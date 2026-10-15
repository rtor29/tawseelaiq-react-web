// إعدادات التطبيق المركزية — تُقرأ من متغيرات البيئة عبر Vite
// (بديل AppConfig من نسخة Flutter)

export const NAJAF_CENTER = { lat: 31.9961, lon: 44.3168 } as const;

// حدود محافظة النجف الأشرف للبحث الجغرافي الصارم
export const NAJAF_BBOX = { west: 44.05, south: 31.75, east: 44.65, north: 32.35 } as const;

export const config = {
  appName: 'توصيله',
  appVersion: '1.0.0',

  // في الإنتاج على نفس الدومين تُمرر /api عبر Nginx، وإلا رابط كامل
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || '/api',
  hubUrl: import.meta.env.VITE_REALTIME_HUB_URL || '/hubs/tracking',
  realtimeMode: (import.meta.env.VITE_REALTIME_MODE || 'polling') as 'polling' | 'signalr' | 'socketio',

  mapboxToken: import.meta.env.VITE_MAPBOX_TOKEN || '',
  mapStyle: import.meta.env.VITE_MAP_STYLE || 'mapbox://styles/mapbox/streets-v12',
  navigationStyle: import.meta.env.VITE_NAVIGATION_STYLE || 'mapbox://styles/mapbox/navigation-day-v1',

  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',

  // تسعيرة افتراضية (دينار عراقي) — أجرة الافتتاح + للأفقي كيلومتر
  fareBaseIqd: 3000,
  farePerKmIqd: 450,
} as const;

export function apiUrl(path: string): string {
  return `${config.apiBaseUrl}${path}`;
}
