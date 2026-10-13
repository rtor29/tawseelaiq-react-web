import { useState, useRef, useCallback, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import { useMapbox } from '@/components/map/useMapbox';
import { routeApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import type { PermanentRoute } from '@/types';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

// Tier color map
const TIER_COLOR: Record<number, string> = { 1: '#059669', 2: '#7c3aed', 3: '#ef4444' };
const TIER_LABEL: Record<number, string> = { 1: '🟢 قريب جداً', 2: '🟣 قريب', 3: '🔴 بعيد نسبياً' };

export default function DailyPage() {
  const { user } = useAuthStore();
  const [waypoints, setWaypoints] = useState<[number, number][]>([]);
  const [matched, setMatched] = useState<PermanentRoute[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<PermanentRoute | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingDone, setBookingDone] = useState(false);

  const { mapRef, addMarker, drawRoute, removeRoute } = useMapbox({
    containerId: 'daily-map',
    onMapClick: useCallback((lngLat: mapboxgl.LngLat) => {
      const point: [number, number] = [lngLat.lng, lngLat.lat];
      setWaypoints((prev) => {
        const next = [...prev, point];
        return next;
      });
      addMarker(`wp-${Date.now()}`, lngLat.lng, lngLat.lat, '#f97316');
    }, [addMarker]),
  });

  // Draw passenger route line when waypoints change
  useEffect(() => {
    if (waypoints.length >= 2) {
      drawRoute('passenger-route', waypoints, '#f97316');
    }
  }, [waypoints, drawRoute]);

  const resetMap = () => {
    setWaypoints([]); setMatched([]); setError('');
    removeRoute('passenger-route');
    matched.forEach((r) => removeRoute(`driver-route-${r.id}`));
    // Remove all markers by reloading map style
    mapRef.current?.remove();
  };

  const searchDrivers = async () => {
    if (waypoints.length < 2) { setError('حدد نقطتين على الأقل على الخريطة'); return; }
    setLoading(true); setError('');
    try {
      const results: PermanentRoute[] = await routeApi.matchPassengerRoute(waypoints);
      setMatched(results ?? []);
      // Draw each driver route
      results?.forEach((r) => {
        const color = TIER_COLOR[r.proximity_tier ?? 3];
        drawRoute(`driver-route-${r.id}`, r.waypoints, color);
      });
    } catch (e: any) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  const handleBook = async () => {
    if (!selected || !user) return;
    setBookingLoading(true);
    try {
      await routeApi.atomicBook(selected.id);
      setBookingDone(true);
    } catch (e: any) {
      setError(e.message);
    } finally { setBookingLoading(false); }
  };

  return (
    <div className="pt-14 h-screen flex flex-col">
      {/* Top instructions */}
      <div className="absolute top-16 right-4 left-4 z-20 max-w-sm mx-auto bg-slate-900/95 backdrop-blur border border-white/10 rounded-xl p-3">
        <p className="text-sm text-gray-300 text-center">
          {waypoints.length === 0
            ? '📍 انقر على الخريطة لتحديد مسارك اليومي'
            : waypoints.length === 1
            ? '📍 حدد نقطة الوصول'
            : `✅ تم تحديد ${waypoints.length} نقاط`}
        </p>
        <div className="flex gap-2 mt-2">
          <Button
            fullWidth
            disabled={waypoints.length < 2}
            loading={loading}
            onClick={searchDrivers}
          >
            🔍 إظهار السائقين القريبين
          </Button>
          <Button variant="ghost" onClick={resetMap}>↺</Button>
        </div>
        {error && <p className="text-red-400 text-xs mt-2 text-center">{error}</p>}
      </div>

      {/* Map */}
      <div id="daily-map" className="flex-1 w-full" />

      {/* Results Panel */}
      {matched.length > 0 && (
        <div className="absolute bottom-0 right-0 left-0 bg-slate-900/97 backdrop-blur border-t border-white/10 rounded-t-2xl max-h-[45vh] overflow-y-auto">
          <div className="p-3 border-b border-white/10">
            <h2 className="font-bold text-center">السائقون المتطابقون ({matched.length})</h2>
          </div>
          <div className="divide-y divide-white/5">
            {matched.map((r) => (
              <button
                key={r.id}
                onClick={() => { setSelected(r); setBookingDone(false); }}
                className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition"
              >
                <div className="text-right">
                  <p className="font-semibold">{r.driver_name}</p>
                  <p className="text-xs text-gray-400">{r.from_name} → {r.to_name}</p>
                </div>
                <div className="text-left flex flex-col items-end gap-1">
                  <span className="text-xs">{TIER_LABEL[r.proximity_tier ?? 3]}</span>
                  <span className="text-xs text-gray-400">
                    {r.available_seats}/{r.total_seats} مقاعد
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Driver Detail Modal */}
      {selected && (
        <Modal onClose={() => setSelected(null)} title={selected.driver_name}>
          {bookingDone ? (
            <div className="text-center py-6">
              <div className="text-5xl mb-3">✅</div>
              <p className="font-bold text-success text-lg">تم الحجز بنجاح!</p>
              <Button fullWidth className="mt-4" onClick={() => setSelected(null)}>إغلاق</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-white/5 rounded-xl p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">المسار</span>
                  <span>{selected.from_name} → {selected.to_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">المقاعد المتاحة</span>
                  <span className="text-success font-bold">{selected.available_seats} / {selected.total_seats}</span>
                </div>
                {selected.price && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">السعر</span>
                    <span className="text-primary font-bold">{selected.price.toLocaleString()} د.ع</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-400">التطابق</span>
                  <span>{TIER_LABEL[selected.proximity_tier ?? 3]}</span>
                </div>
              </div>
              <a
                href={`tel:${selected.driver_phone}`}
                className="flex items-center justify-center gap-2 w-full bg-white/10 border border-white/20 text-white py-3 rounded-xl font-semibold hover:bg-white/20 transition"
              >
                📞 اتصل بالسائق
              </a>
              <Button
                fullWidth
                onClick={handleBook}
                loading={bookingLoading}
                disabled={selected.available_seats <= 0}
              >
                {selected.available_seats <= 0 ? 'المقاعد ممتلئة' : '🪑 احجز مقعداً'}
              </Button>
              {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
