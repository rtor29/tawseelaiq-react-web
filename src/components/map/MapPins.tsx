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
  color: string;
  width?: number;
}

// طبقة الخطوط المجمعة — مسار الراكب الأسود، خطوط الكباتن الملونة، وخط التتبع الأخضر
export function RouteLines({ lines }: { lines: RouteLineData[] }) {
  return (
    <>
      {lines.map((line) => (
        <Source key={line.id} id={`line-${line.id}`} type="geojson" data={{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line.coordinates } }}>
          <Layer
            id={`line-layer-${line.id}`}
            type="line"
            layout={{ 'line-join': 'round', 'line-cap': 'round' }}
            paint={{
              'line-color': line.color,
              'line-width': line.width ?? 4.5,
            }}
          />
        </Source>
      ))}
    </>
  );
}
