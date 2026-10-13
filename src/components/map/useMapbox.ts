import { useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import type { Driver } from '@/types';
import { IRAQ_CENTER, findGovernorate } from '@/utils/governorates';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

interface UseMapboxOptions {
  containerId: string;
  drivers?: Driver[];
  initialGovernorate?: string;
  onMapClick?: (lngLat: mapboxgl.LngLat) => void;
}

export function useMapbox({
  containerId,
  drivers = [],
  initialGovernorate,
  onMapClick,
}: UseMapboxOptions) {
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());

  useEffect(() => {
    if (mapRef.current) return;

    // Determine initial center: governorate or nation-wide Iraq center
    let initialCenter = IRAQ_CENTER;
    let initialZoom = 6.5;

    if (initialGovernorate) {
      const gov = findGovernorate(initialGovernorate);
      if (gov) {
        initialCenter = [gov.lng, gov.lat];
        initialZoom = gov.zoom ?? 12;
      }
    }

    const map = new mapboxgl.Map({
      container: containerId,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: initialCenter,
      zoom: initialZoom,
    });

    map.addControl(new mapboxgl.NavigationControl(), 'top-left');
    const geolocate = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true,
    });
    map.addControl(geolocate, 'top-left');

    // Auto-detect user GPS on start and center map on their exact location anywhere in Iraq
    if ('geolocation' in navigator && !initialGovernorate) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          map.flyTo({
            center: [pos.coords.longitude, pos.coords.latitude],
            zoom: 14,
            duration: 1500,
          });
        },
        () => {
          // If permission denied, stays on full Iraq view
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }

    if (onMapClick) map.on('click', (e) => onMapClick(e.lngLat));
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [containerId, initialGovernorate]);

  // Update driver markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentIds = new Set(drivers.map((d) => d.id));

    // Remove stale markers
    markersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    drivers.forEach((driver) => {
      if (driver.lat == null || driver.lng == null) return;
      if (markersRef.current.has(driver.id)) {
        markersRef.current.get(driver.id)!.setLngLat([driver.lng, driver.lat]);
      } else {
        const el = document.createElement('div');
        el.className =
          'w-8 h-8 rounded-full bg-success border-2 border-white flex items-center justify-center text-sm shadow-md cursor-pointer hover:scale-110 transition-transform';
        el.textContent = '🚗';
        el.title = driver.fullName;
        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([driver.lng, driver.lat])
          .addTo(map);
        markersRef.current.set(driver.id, marker);
      }
    });
  }, [drivers]);

  const flyTo = useCallback((lng: number, lat: number, zoom = 14) => {
    mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 1000 });
  }, []);

  const flyToGovernorate = useCallback((governorateKeyOrName: string) => {
    const gov = findGovernorate(governorateKeyOrName);
    if (gov && mapRef.current) {
      mapRef.current.flyTo({
        center: [gov.lng, gov.lat],
        zoom: gov.zoom ?? 12,
        duration: 1200,
      });
    }
  }, []);

  const addMarker = useCallback(
    (id: string, lng: number, lat: number, color = '#f97316', label = '') => {
      const map = mapRef.current;
      if (!map) return;
      markersRef.current.get(id)?.remove();
      const el = document.createElement('div');
      el.style.cssText = `width:18px;height:18px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)`;
      if (label) {
        el.title = label;
      }
      const m = new mapboxgl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
      markersRef.current.set(id, m);
      return m;
    },
    []
  );

  const removeMarker = useCallback((id: string) => {
    markersRef.current.get(id)?.remove();
    markersRef.current.delete(id);
  }, []);

  const drawRoute = useCallback(
    (id: string, coords: [number, number][], color = '#f97316') => {
      const map = mapRef.current;
      if (!map || !map.isStyleLoaded()) return;
      if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(id)) map.removeSource(id);
      map.addSource(id, {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: coords },
        },
      });
      map.addLayer({
        id,
        type: 'line',
        source: id,
        paint: { 'line-color': color, 'line-width': 4, 'line-opacity': 0.85 },
      });
    },
    []
  );

  const removeRoute = useCallback((id: string) => {
    const map = mapRef.current;
    if (!map) return;
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
  }, []);

  return { mapRef, flyTo, flyToGovernorate, addMarker, removeMarker, drawRoute, removeRoute };
}
