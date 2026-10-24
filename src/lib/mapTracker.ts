// عداد وتتبع تهيئة خرائط Mapbox (Map Loads Tracker)
// يرصد ويقيس بدقة عدد مرات استدعاء new mapboxgl.Map لتجنب أي هدر في Map Loads

import mapboxgl from 'mapbox-gl';

declare global {
  interface Window {
    __TAWSEELA_MAP_LOADS__: number;
    __TAWSEELA_MAP_INSTANCES__: any[];
    getMapboxLoadsCount?: () => number;
  }
}

if (typeof window !== 'undefined') {
  if (typeof window.__TAWSEELA_MAP_LOADS__ === 'undefined') {
    window.__TAWSEELA_MAP_LOADS__ = 0;
    window.__TAWSEELA_MAP_INSTANCES__ = [];
  }

  window.getMapboxLoadsCount = () => window.__TAWSEELA_MAP_LOADS__;

  // فحص ما إذا تم تغليف الـ Constructor مسبقاً لمنع التكرار
  const isWrapped = (mapboxgl as any).__isMapboxLoadsTracked;
  if (!isWrapped) {
    const OriginalMap = mapboxgl.Map;
    const TrackedMap = function (this: any, options: any) {
      window.__TAWSEELA_MAP_LOADS__ = (window.__TAWSEELA_MAP_LOADS__ || 0) + 1;
      const currentLoad = window.__TAWSEELA_MAP_LOADS__;
      console.info(`[MapboxLoadTracker] 🗺️ Mapbox Map initialized (Map Load #${currentLoad})`, {
        container: options?.container,
        style: options?.style,
        totalLoads: currentLoad,
      });
      // @ts-ignore
      const instance = new OriginalMap(options);
      window.__TAWSEELA_MAP_INSTANCES__.push(instance);
      return instance;
    } as unknown as typeof mapboxgl.Map;

    TrackedMap.prototype = OriginalMap.prototype;
    Object.assign(TrackedMap, OriginalMap);
    (TrackedMap as any).__isMapboxLoadsTracked = true;
    (mapboxgl as any).Map = TrackedMap;
    (mapboxgl as any).__isMapboxLoadsTracked = true;
  }
}

export function getMapLoadsCount(): number {
  if (typeof window === 'undefined') return 0;
  return window.__TAWSEELA_MAP_LOADS__ || 0;
}
