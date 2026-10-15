// أدوات جغرافية — بديل Geolocator.distanceBetween و latlong2 Distance

import { NAJAF_CENTER } from './config';
import type { LngLat } from '../types';

const EARTH_RADIUS_M = 6371000;

export function distanceMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(s));
}

export function distanceKm(a: LngLat, b: LngLat): number {
  return distanceMeters(a.lat, a.lng, b.lat, b.lng) / 1000;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function formatDistanceAr(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} متر`;
  return `${(meters / 1000).toFixed(1)} كم`;
}

export function najafCenterLngLat(): LngLat {
  return { lat: NAJAF_CENTER.lat, lng: NAJAF_CENTER.lon };
}
