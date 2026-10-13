import { useEffect, useRef, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { useMapbox } from '@/components/map/useMapbox';
import { useDriverPolling } from '@/hooks/useDriverPolling';
import { useRideStore } from '@/store/rideStore';
import { useAddressSearch } from '@/hooks/useAddressSearch';
import { rideApi, mapApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import type { Driver } from '@/types';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

type MapMode = 'idle' | 'pickup' | 'dropoff' | 'confirming' | 'waiting';

export default function MapPage() {
  const { user } = useAuthStore();
  const { nearbyDrivers } = useRideStore();
  useDriverPolling(true);

  const [mode, setMode] = useState<MapMode>('idle');
  const [pickup, setPickup] = useState<{ lng: number; lat: number; address?: string } | null>(null);
  const [dropoff, setDropoff] = useState<{ lng: number; lat: number; address?: string } | null>(null);
  const [priceEst, setPriceEst] = useState<number | null>(null);
  const [rideId, setRideId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const { results: searchResults, search, setResults } = useAddressSearch();

  const { mapRef, flyTo, addMarker, removeMarker, drawRoute, removeRoute } = useMapbox({
    containerId: 'main-map',
    drivers: nearbyDrivers,
    onMapClick: useCallback((lngLat: mapboxgl.LngLat) => {
      if (mode === 'pickup') {
        setPickup({ lng: lngLat.lng, lat: lngLat.lat });
        addMarker('pickup', lngLat.lng, lngLat.lat, '#f97316', 'نقطة الانطلاق');
        setMode('dropoff');
      } else if (mode === 'dropoff') {
        setDropoff({ lng: lngLat.lng, lat: lngLat.lat });
        addMarker('dropoff', lngLat.lng, lngLat.lat, '#059669', 'الوجهة');
        setMode('confirming');
      }
    }, [mode, addMarker]),
  });

  // Fetch route line + price when both points set
  useEffect(() => {
    if (!pickup || !dropoff) return;
    const from = `${pickup.lng},${pickup.lat}`;
    const to = `${dropoff.lng},${dropoff.lat}`;
    mapApi.getRoute(from, to).then((data) => {
      const coords = data?.routes?.[0]?.geometry?.coordinates;
      if (coords) drawRoute('trip-route', coords, '#f97316');
    }).catch(() => {});
    mapApi.getPriceEstimate({ fromLng: pickup.lng, fromLat: pickup.lat, toLng: dropoff.lng, toLat: dropoff.lat }).then((d) => {
      setPriceEst(d?.estimate ?? d?.price ?? null);
    }).catch(() => {});
  }, [pickup, dropoff]);

  const reset = () => {
    setPickup(null); setDropoff(null); setPriceEst(null); setRideId(null);
    removeMarker('pickup'); removeMarker('dropoff'); removeRoute('trip-route');
    setMode('idle'); setError('');
  };

  const requestRide = async () => {
    if (!pickup || !dropoff || !user) return;
    setLoading(true); setError('');
    try {
      const res = await rideApi.request({
        passengerId: user.id,
        pickupLat: pickup.lat, pickupLng: pickup.lng,
        dropoffLat: dropoff.lat, dropoffLng: dropoff.lng,
      });
      setRideId(res.rideId ?? res.id);
      setMode('waiting');
    } catch (e: any) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  const handleSearch = (q: string) => {
    setSearchQ(q);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 400);
  };

  const selectSearchResult = (r: { center: [number, number]; place_name: string }) => {
    const [lng, lat] = r.center;
    flyTo(lng, lat);
    if (mode === 'pickup' || mode === 'idle') {
      setPickup({ lng, lat, address: r.place_name });
      addMarker('pickup', lng, lat, '#f97316', 'نقطة الانطلاق');
      setMode('dropoff');
    } else if (mode === 'dropoff') {
      setDropoff({ lng, lat, address: r.place_name });
      addMarker('dropoff', lng, lat, '#059669', 'الوجهة');
      setMode('confirming');
    }
    setSearchQ(''); setResults([]);
  };

  return (
    <div className="pt-14 h-screen flex flex-col">
      {/* Search Bar */}
      <div className="absolute top-16 right-4 left-4 z-20 max-w-md mx-auto">
        <div className="relative">
          <input
            value={searchQ}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={mode === 'dropoff' ? '🎯 ابحث عن وجهتك...' : '📍 ابحث عن موقعك...'}
            className="w-full bg-slate-900/95 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:border-primary text-sm shadow-lg"
            dir="rtl"
          />
          {searchResults.length > 0 && (
            <div className="absolute top-full right-0 left-0 mt-1 bg-slate-900 border border-white/20 rounded-xl overflow-hidden shadow-xl">
              {searchResults.map((r) => (
                <button
                  key={r.id}
                  onClick={() => selectSearchResult(r)}
                  className="w-full text-right px-4 py-2.5 text-sm text-gray-200 hover:bg-white/10 border-b border-white/5 last:border-0"
                >
                  📍 {r.place_name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Map */}
      <div id="main-map" className="flex-1 w-full" />

      {/* Bottom Panel */}
      <div className="absolute bottom-0 right-0 left-0 bg-slate-900/95 backdrop-blur border-t border-white/10 p-4 rounded-t-2xl">
        {error && <p className="text-red-400 text-sm mb-2 text-center">{error}</p>}

        {mode === 'idle' && (
          <div className="flex gap-2">
            <Button fullWidth onClick={() => setMode('pickup')} variant="primary">
              📍 تحديد نقطة الانطلاق
            </Button>
          </div>
        )}

        {mode === 'pickup' && (
          <p className="text-center text-gray-300 text-sm">انقر على الخريطة لتحديد نقطة الانطلاق</p>
        )}

        {mode === 'dropoff' && (
          <div className="space-y-2">
            <p className="text-sm text-gray-300">✅ نقطة الانطلاق محددة — الآن حدد وجهتك</p>
            <p className="text-center text-gray-400 text-xs">انقر على الخريطة أو ابحث أعلاه</p>
          </div>
        )}

        {mode === 'confirming' && (
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">التكلفة التقديرية</span>
              <span className="text-primary font-bold">{priceEst != null ? `${priceEst.toLocaleString()} د.ع` : '...'}</span>
            </div>
            <div className="flex gap-2">
              <Button fullWidth onClick={requestRide} loading={loading}>🚕 اطلب الآن</Button>
              <Button variant="ghost" onClick={reset}>إلغاء</Button>
            </div>
          </div>
        )}

        {mode === 'waiting' && (
          <div className="text-center space-y-2">
            <div className="text-2xl animate-bounce">🔍</div>
            <p className="text-white font-bold">جاري البحث عن سائق...</p>
            <p className="text-gray-400 text-sm">رقم الطلب: {rideId}</p>
            <Button variant="danger" onClick={reset} className="mt-2">إلغاء الطلب</Button>
          </div>
        )}
      </div>

      {selectedDriver && (
        <Modal onClose={() => setSelectedDriver(null)} title={selectedDriver.fullName}>
          <div className="space-y-3">
            <p className="text-gray-300 text-sm">📞 <a href={`tel:${selectedDriver.phone}`} className="text-primary">{selectedDriver.phone}</a></p>
            <p className="text-gray-300 text-sm">⭐ التقييم: {selectedDriver.rating?.toFixed(1) ?? 'لا يوجد'}</p>
            <Button fullWidth onClick={() => setSelectedDriver(null)}>إغلاق</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
