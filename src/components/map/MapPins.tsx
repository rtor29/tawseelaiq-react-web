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
          <div className="w-9 h-9 rounded-full bg-[#161C28] border-2 border-[#FFB77D] shadow-xl flex items-center justify-center p-1">
            <img src="/logo.png" alt="توصيلة" className="w-full h-full object-contain drop-shadow" />
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
        <div className="w-8 h-8 rounded-full bg-[#161C28]/95 border-2 border-[#FFB77D]/80 shadow-lg flex items-center justify-center p-1 hover:scale-110 transition-transform">
          <img src="/logo.png" alt="توصيلة" className="w-full h-full object-contain drop-shadow" />
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
  casingWidth?: number;
  casingBlur?: number;
  casingOpacity?: number;
  dashed?: boolean;
}

// مسار ملاحي مخصص أو أصفر فاقع #FFEA00 مع حاشية سوداء صلبة #000000
export function RouteLines({ lines }: { lines: RouteLineData[] }) {
  return (
    <>
      {lines.map((line) => {
        const casingId = line.id === 'route-line' ? 'route-glow' : `route-glow-${line.id}`;
        const innerId = line.id === 'route-line' ? 'route-core' : `route-core-${line.id}`;
        const innerColor = line.color || '#F59E0B';
        const casingColor = line.casingColor || '#F59E0B';
        const isBlackCasing = casingColor.toLowerCase() === '#000000' || casingColor.toLowerCase() === '#000';

        return (
          <Source
            key={line.id}
            id={`line-${line.id}`}
            type="geojson"
            // المحرك يبسّط هندسة أي مصدر geojson بخوارزمية دوغلاس-بوكر، و`tolerance`
            // الافتراضي 0.375 لا صفر. فكل مسار نرسمه اليوم يصل الشاشة مبسّطاً، وتُقَصّ
            // زواياه كلما قرّبنا — وهو ما يظهر كخطّ يقطع الرصيف بدل أن يتبع الشارع.
            // الصفر يعني: ارسم الإحداثيات كما جاءت من محرك المسار بلا حذف نقطة.
            tolerance={0}
            data={{
              type: 'Feature',
              properties: {},
              geometry: { type: 'LineString', coordinates: line.coordinates },
            }}
          >
            {/* 1. الحاشية/الهالة السفلية (مثلاً 8px أسود صلب أو هالة متوهجة) */}
            <Layer
              id={casingId}
              type="line"
              layout={{ 'line-join': 'round', 'line-cap': 'round' }}
              paint={{
                'line-color': casingColor,
                'line-width': line.casingWidth !== undefined ? line.casingWidth : [
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
                'line-blur': line.casingBlur !== undefined ? line.casingBlur : (isBlackCasing ? 0 : 4),
                'line-opacity': line.casingOpacity !== undefined ? line.casingOpacity : (isBlackCasing ? 1.0 : 0.45),
              }}
            />
            {/* 2. خط المسار الرئيسي (مثلاً خط أصفر فاقع 5px) */}
            <Layer
              id={innerId}
              type="line"
              layout={{
                'line-join': 'round',
                'line-cap': 'round',
              }}
              paint={{
                'line-color': innerColor,
                'line-width': line.width !== undefined ? line.width : [
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

// دبوس نتيجة بحث مرقّم (شاشة البحث V2) — الرقم يطابق ترتيب النتيجة في القائمة
export function NumberedPlacePin({
  point,
  index,
  label,
  isActive = false,
  onClick,
}: {
  point: LngLat;
  index: number;
  label?: string;
  isActive?: boolean;
  onClick?: () => void;
}) {
  return (
    <Marker longitude={point.lng} latitude={point.lat} anchor="bottom" onClick={onClick}>
      <div className="flex cursor-pointer flex-col items-center select-none" role="button">
        {label && isActive && (
          <div className="mb-1 max-w-[9rem] truncate rounded-full bg-[#161C28] px-2.5 py-0.5 text-[11px] font-bold text-amber-300 shadow-lg border border-amber-500/40">
            {label}
          </div>
        )}
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-[12px] font-black shadow-xl transition-transform ${
            isActive
              ? 'bg-amber-400 border-[#080E1A] text-slate-950 scale-110'
              : 'bg-[#161C28] border-amber-400/80 text-amber-300 hover:scale-105'
          }`}
        >
          {index}
        </div>
        <div className="h-2 w-[2px] bg-amber-400/80" />
      </div>
    </Marker>
  );
}
