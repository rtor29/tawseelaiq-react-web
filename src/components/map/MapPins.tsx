// مكونات الخريطة المساندة: دبابيس الانطلاق/الوصول، علامة الكابتن، وطبقة الخطوط GeoJSON

import { Source, Layer, Marker } from 'react-map-gl';
import type { LngLat } from '../../types';

export function PickupPin({ point }: { point: LngLat }) {
  return (
    <Marker longitude={point.lng} latitude={point.lat} anchor="bottom">
      <div className="flex flex-col items-center">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="#10B981">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
        </svg>
        <span className="rounded bg-white/80 px-1 text-[10px] font-bold text-brand-slate">الانطلاق</span>
      </div>
    </Marker>
  );
}

export function DropoffPin({ point }: { point: LngLat }) {
  return (
    <Marker longitude={point.lng} latitude={point.lat} anchor="bottom">
      <div className="flex flex-col items-center">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="#EF4444">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
        </svg>
        <span className="rounded bg-white/80 px-1 text-[10px] font-bold text-brand-slate">الوصول</span>
      </div>
    </Marker>
  );
}

// علامة الكابتن التفاعلية على الخريطة (بديل marker بطاقة 🚖 في Flutter)
export function DriverTagPin({
  point,
  name,
  color = '#10B981',
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
          className="flex max-w-[150px] items-center gap-1 rounded-xl border-2 bg-brand-slate px-2 py-1 shadow-lg"
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

// مسار الملاحة الانسيابي فائق الدقة والأناقة (Sleek Slim Route Polyline):
// - تنحيف السماكة لتكون بعرض 2.5px إلى حد أقصى 3px (بدلاً من السماكة المفرطة السابقة 7-18px)
// - الحفاظ التام على الهوية الذهبية العنبرية #F59E0B
// - تقليص الهالة المتوهجة لتكون محصورة في 1px فقط حول الخط لمنع انتفاخه بصرياً وتغطية الشوارع
export function RouteLines({ lines }: { lines: RouteLineData[] }) {
  return (
    <>
      {lines.map((line) => {
        const casingId = line.id === 'route-line' ? 'route-casing' : `route-casing-${line.id}`;
        const innerId = line.id === 'route-line' ? 'route-inner' : `route-inner-${line.id}`;
        const innerColor = line.color || '#F59E0B';
        const casingColor = line.casingColor || 'rgba(15, 23, 42, 0.45)';

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
            {/* 1. الغلاف الخارجي الخفيف المحدد للمسار (Subtle 1px Halo Casing) */}
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
                  3.0,
                  14,
                  3.8,
                  18,
                  4.8,
                ],
                'line-blur': 1,
                'line-opacity': 0.4,
              }}
            />
            {/* 2. خط المسار الانسيابي الذهبي النحيف (2.5px - 3.0px) */}
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
                  2.0,
                  14,
                  2.8,
                  18,
                  3.5,
                ],
                'line-opacity': 0.95,
                ...(line.dashed ? { 'line-dasharray': [2, 2] } : {}),
              }}
            />
          </Source>
        );
      })}
    </>
  );
}
