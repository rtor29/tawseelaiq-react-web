/**
 * Iraqi Governorates Coordinate & Bounds Registry
 * Supports all 18 governorates across Iraq.
 */

export interface Governorate {
  key: string;
  name: string;
  lng: number;
  lat: number;
  zoom?: number;
}

export const IRAQ_GOVERNORATES: Governorate[] = [
  { key: 'baghdad',     name: 'بغداد',        lng: 44.3661, lat: 33.3152, zoom: 12 },
  { key: 'basra',       name: 'البصرة',       lng: 47.7804, lat: 30.5085, zoom: 12 },
  { key: 'nineveh',     name: 'نينوى',        lng: 43.1189, lat: 36.3350, zoom: 12 },
  { key: 'erbil',       name: 'أربيل',        lng: 44.0092, lat: 36.1911, zoom: 12 },
  { key: 'najaf',       name: 'النجف الأشرف', lng: 44.3168, lat: 31.9961, zoom: 12 },
  { key: 'karbala',     name: 'كربلاء',       lng: 44.0249, lat: 32.6160, zoom: 12 },
  { key: 'kirkuk',      name: 'كركوك',        lng: 44.3922, lat: 35.4681, zoom: 12 },
  { key: 'sulaymaniyah',name: 'السليمانية',   lng: 45.4165, lat: 35.5669, zoom: 12 },
  { key: 'babil',       name: 'بابل',         lng: 44.4312, lat: 32.4839, zoom: 12 },
  { key: 'anbar',       name: 'الأنبار',      lng: 43.2974, lat: 33.4233, zoom: 11 },
  { key: 'diyala',      name: 'ديالى',        lng: 45.1436, lat: 33.7489, zoom: 11 },
  { key: 'wasit',       name: 'واسط',         lng: 45.8239, lat: 32.5126, zoom: 11 },
  { key: 'saladin',     name: 'صلاح الدين',   lng: 43.6793, lat: 34.6062, zoom: 11 },
  { key: 'dhi_qar',     name: 'ذي قار',       lng: 46.2573, lat: 31.0580, zoom: 12 },
  { key: 'maysan',      name: 'ميسان',        lng: 47.1435, lat: 31.8360, zoom: 12 },
  { key: 'muthanna',    name: 'المثنى',       lng: 45.2814, lat: 31.3115, zoom: 11 },
  { key: 'qadisiyyah',  name: 'القادسية',     lng: 44.9255, lat: 31.9929, zoom: 12 },
  { key: 'duhok',       name: 'دهوك',         lng: 42.9885, lat: 36.8679, zoom: 12 },
];

/** Center of Iraq for full nation view */
export const IRAQ_CENTER: [number, number] = [43.6793, 33.2232];

/** Iraq nationwide geographic bounding box [minLng, minLat, maxLng, maxLat] */
export const IRAQ_BOUNDS: [[number, number], [number, number]] = [
  [38.79, 29.06], // South-West
  [48.63, 37.38], // North-East
];

export function findGovernorate(query: string): Governorate | undefined {
  const q = query.trim().toLowerCase();
  return IRAQ_GOVERNORATES.find(
    (g) => g.key.toLowerCase() === q || g.name.includes(query) || query.includes(g.name)
  );
}
