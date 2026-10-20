// مكونات الخريطة المساندة: دبابيس الانطلاق/الوصول، علامة الكابتن، وطبقة الخطوط GeoJSON
// نمط خريطة Mapbox المعتمد (Midnight Executive Mapbox)

import { Source, Layer, Marker } from 'react-map-gl';
import type { LngLat } from '../../types';

// دبوس موقعك الحالي الزمردي #56E5A9 مع رادار نابض
export function PickupPin({ point }: { point: LngLat }) {
  return (
    <Marker longitude={point.lng} latitude={point.lat} anchor="center">
      <div className="relative flex items-center justify-center select-none">
        <span className="absolute w-8 h-8 rounded-full bg-[#56E5A9]/30 animate-ping"></span>
        <div className="w-5 h-5 rounded-full bg-[#56E5A9] border-2 border-[#080E1A] shadow-[0_0_14px_#56E5A9] flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-[#080E1A]" />
        </div>
      </div>
    </Marker>
  );
}

// دبوس أقرب كابتن مع كبسولة «٣ دقيقة» النطاطة bg-[#FFC174]
export function NearestDriverPin({
  point,
  duration = '٣ دقيقة',
  onClick,
}: {
  point: LngLat;
  duration?: string;
  onClick?: () => void;
}) {
  return (
    <Marker longitude={point.lng} latitude={point.lat} anchor="bottom" onClick={onClick}>
      <div className="flex cursor-pointer flex-col items-center select-none" role="button">
        <div className="px-2.5 py-0.5 rounded-full bg-[#FFC174] text-slate-950 text-[11px] font-black mb-1 shadow-lg flex items-center gap-1 animate-bounce border border-amber-300">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-950"></span>
          <span>{duration}</span>
        </div>
        <div className="relative flex items-center justify-center">
          <span className="absolute w-10 h-10 rounded-full bg-amber-400/20 animate-ping"></span>
          <div className="w-9 h-9 rounded-full bg-[#161C28] border-2 border-[#FFB77D] shadow-xl flex items-center justify-center text-[#FFB77D] text-lg font-bold">
            🚖
          </div>
        </div>
      </div>
    </Marker>
  );
}

// دبابيس الكباتن المحيطة باللون الرمادي والذهبي #FFB77D
export function SurroundingDriverPin({
  point,
  onClick,
}: {
  point: LngLat;
  onClick?: () => void;
}) {
  return (
    <Marker longitude={point.lng} latitude={point.lat} anchor="center" onClick={onClick}>
      <div className="cursor-pointer select-none" role="button">
        <div className="w-8 h-8 rounded-full bg-[#161C28]/95 border-2 border-[#FFB77D]/80 shadow-lg flex items-center justify-center text-[#FFB77D] text-sm hover:scale-110 transition-transform">
          🚖
        </div>
      </div>
    </Marker>
  );
}

// راية الوجهة «جامعة الكوفة»
export function DestinationFlagPin({
  point,
  name = 'جامعة الكوفة',
  onClick,
}: {
  point: LngLat;
  name?: string;
  onClick?: () => void;
}) {
  return (
    <Marker longitude={point.lng} latitude={point.lat} anchor="bottom" onClick={onClick}>
      <div className="flex cursor-pointer flex-col items-center select-none group" role="button">
        <div className="px-3 py-1 rounded-full bg-[#161C28]/95 border border-amber-500/40 text-amber-300 text-xs font-bold shadow-xl flex items-center gap-1.5 backdrop-blur-md mb-1">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
          <span>{name}</span>
        </div>
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center text-slate-950 shadow-lg border-2 border-white/20 font-bold text-sm">
          🎓
        </div>
        <div className="h-2 w-0.5 bg-amber-500/80 -mt-0.5"></div>
      </div>
    </Marker>
  );
}

export function DropoffPin({ point }: { point: LngLat }) {
  return (
    <Marker longitude={point.lng} latitude={point.lat} anchor="bottom">
      <div className="flex flex-col items-center select-none">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="#EF4444">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
        </svg>
        <span className="rounded bg-white/90 px-1 text-[10px] font-bold text-slate-900 shadow-xs">الوصول</span>
      </div>
    </Marker>
  );
}

// علامة الكابتن التفاعلية على الخريطة
export function DriverTagPin({
  point,
  name,
  color = '#FFB77D',
  onClick,
}: {
  point: LngLat;
  name: string;
  color?: string;
  onClick?: () => void;
}) {
  return (
    <Marker longitude={point.lng} latitude={point.lat} anchor="bottom" onClick={onClick}>
      <div className="flex cursor-pointer flex-col items-center" role="button">
        <div
          className="flex max-w-[150px] items-center gap-1 rounded-xl border-2 bg-[#161C28] px-2 py-1 shadow-lg"
          style={{ borderColor: color }}
        >
          <span className="text-xs">🚖</span>
          <span className="truncate text-[11px] font-bold text-white">{name}</span>
        </div>
        <svg width="14" height="8" viewBox="0 0 14 8" style={{ fill: color }}>
          <path d="M7 8L0 0h14L7 8z" />
        </svg>
      </div>
    </Marker>
  );
}

export interface RouteLineData {
  id: string;
  coordinates: [number, number][];
  color?: string;
  width?: number;
  casingColor?: string;
  dashed?: boolean;
}

// مسار ملاحي ذهبي عنبري متوهج #F59E0B:
// - خط رئيسي route-core بعرض 3px بلون #F59E0B
// - هالة ضوئية متوهجة route-glow بعرض 8px و blur: 4 وشفافية 0.45 بلون rgba(245, 158, 11, 0.45)
export function RouteLines({ lines }: { lines: RouteLineData[] }) {
  return (
    <>
      {lines.map((line) => {
        const casingId = line.id === 'route-line' ? 'route-glow' : `route-glow-${line.id}`;
        const innerId = line.id === 'route-line' ? 'route-core' : `route-core-${line.id}`;
        const innerColor = line.color || '#F59E0B';
        const casingColor = line.casingColor || '#F59E0B';

        return (
          <Source
            key={line.id}
            id={`line-${line.id}`}
            type="geojson"
            data={{
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: line.coordinates },
            }}
          >
            {/* 1. الهالة الضوئية المتوهجة 8px مع blur 4 وشفافية 0.45 */}
            <Layer
              id={casingId}
              type="line"
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
              paint={{
                'line-color': casingColor,
                'line-width': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  10,
                  6.0,
                  14,
                  8.0,
                  18,
                  10.0,
                ],
                'line-blur': 4,
                'line-opacity': 0.45,
              }}
            />
            {/* 2. خط المسار الرئيسي المتوهج route-core بعرض 3px */}
            <Layer
              id={innerId}
              type="line"
              layout={{
                'line-join': 'round',
                'line-cap': 'round',
              }}
              paint={{
                'line-color': innerColor,
                'line-width': [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  10,
                  2.5,
                  14,
                  3.0,
                  18,
                  3.5,
                ],
                'line-opacity': 1.0,
                ...(line.dashed ? { 'line-dasharray': [2, 2] } : {}),
              }}
            />
          </Source>
        );
      })}
    </>
  );
}
