import { useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import type { Driver } from '@/types';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const CENTER: [number, number] = [
  parseFloat(import.meta.env.VITE_MAP_CENTER_LNG ?? '44.3168'),
  parseFloat(import.meta.env.VITE_MAP_CENTER_LAT ?? '31.9961'),
];

interface UseMapboxOptions {
  containerId: string;
  drivers?: Driver[];
  onMapClick?: (lngLat: mapboxgl.LngLat) => void;
}

export function useMapbox({ containerId, drivers = [], onMapClick }: UseMapboxOptions) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());

  useEffect(() => {
    if (mapRef.current) return;
    const map = new mapboxgl.Map({
      container: containerId,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: CENTER,
      zoom: parseFloat(import.meta.env.VITE_MAP_ZOOM ?? '12'),
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-left');
    map.addControl(new mapboxgl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), 'top-left');
    if (onMapClick) map.on('click', (e) => onMapClick(e.lngLat));
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [containerId]);

  // Update driver markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set(drivers.map((d) => d.id));

    // Remove stale markers
    markersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) { marker.remove(); markersRef.current.delete(id); }
    });

    drivers.forEach((driver) => {
      if (driver.lat == null || driver.lng == null) return;
      if (markersRef.current.has(driver.id)) {
        markersRef.current.get(driver.id)!.setLngLat([driver.lng, driver.lat]);
      } else {
        const el = document.createElement('div');
        el.className = 'w-8 h-8 rounded-full bg-success border-2 border-white flex items-center justify-center text-sm';
        el.textContent = '🚗';
        el.title = driver.fullName;
        const marker = new mapboxgl.Marker({ element: el }).setLngLat([driver.lng, driver.lat]).addTo(map);
        markersRef.current.set(driver.id, marker);
      }
    });
  }, [drivers]);

  const flyTo = useCallback((lng: number, lat: number, zoom = 14) => {
    mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 1000 });
  }, []);

  const addMarker = useCallback((
    id: string, lng: number, lat: number,
    color = '#f97316', label = ''
  ) => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.get(id)?.remove();
    const el = document.createElement('div');
    el.style.cssText = `width:18px;height:18px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)`;
    if (label) { el.title = label; }
    const m = new mapboxgl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
    markersRef.current.set(id, m);
    return m;
  }, []);

  const removeMarker = useCallback((id: string) => {
    markersRef.current.get(id)?.remove();
    markersRef.current.delete(id);
  }, []);

  const drawRoute = useCallback((id: string, coords: [number, number][], color = '#f97316') => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
    map.addSource(id, { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } } });
    map.addLayer({ id, type: 'line', source: id, paint: { 'line-color': color, 'line-width': 4, 'line-opacity': 0.85 } });
  }, []);

  const removeRoute = useCallback((id: string) => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
  }, []);

  return { mapRef, flyTo, addMarker, removeMarker, drawRoute, removeRoute };
}
