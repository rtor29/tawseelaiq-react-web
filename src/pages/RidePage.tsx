import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import { useMapbox } from '@/components/map/useMapbox';
import { rideApi, driverApi } from '@/api';
import Button from '@/components/ui/Button';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const STATUS_AR: Record<string, string> = {
  Pending:    '⏳ جاري البحث عن سائق...',
  Accepted:   '✅ السائق في الطريق إليك',
  Arrived:    '🚗 السائق وصل — اركب الآن',
  InProgress: '🛣️ في الطريق إلى وجهتك',
  Completed:  '🏁 وصلت! رحلة موفقة',
  Cancelled:  '❌ تم إلغاء الرحلة',
};

export default function RidePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ride, setRide]     = useState<any | null>(null);
  const [driver, setDriver] = useState<any | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const { addMarker, drawRoute } = useMapbox({ containerId: 'ride-map' });

  const fetchStatus = async () => {
    if (!id) return;
    try {
      const data = await rideApi.getStatus(id);
      setRide(data);
      if (data.driver_id && (!driver || driver.id !== data.driver_id)) {
        const d = await driverApi.getLive(data.driver_id);
        setDriver(d);
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 3000);
    return () => clearInterval(pollRef.current);
  }, [id]);

  // Update driver marker on map
  useEffect(() => {
    if (driver?.lat && driver?.lon) {
      addMarker('live-driver', driver.lon, driver.lat, '#059669', driver.fullName ?? 'السائق');
    }
    if (ride?.pickup_lng && ride?.pickup_lat) {
      addMarker('pickup', ride.pickup_lng, ride.pickup_lat, '#f97316', 'موقعك');
    }
    if (ride?.dropoff_lng && ride?.dropoff_lat) {
      addMarker('dropoff', ride.dropoff_lng, ride.dropoff_lat, '#7c3aed', 'وجهتك');
    }
  }, [driver, ride]);

  const cancel = async () => {
    if (!id) return;
    await rideApi.cancel({ rideId: id });
    navigate('/map');
  };

  const isDone = ride?.status === 'Completed' || ride?.status === 'Cancelled';

  return (
    <div className="pt-14 h-screen flex flex-col">
      <div id="ride-map" className="flex-1 w-full" />

      <div className="bg-slate-900/97 backdrop-blur border-t border-white/10 p-4 rounded-t-2xl space-y-3">
        <p className="text-center font-bold text-lg">
          {STATUS_AR[ride?.status ?? 'Pending'] ?? '⏳ جاري التحميل...'}
        </p>

        {driver && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center justify-between">
            <div>
              <p className="font-semibold">{driver.fullName ?? driver.full_name}</p>
              <p className="text-xs text-gray-400">{driver.vehicle_type} · {driver.vehicle_plate}</p>
              <p className="text-xs text-gray-400">⭐ {driver.rating?.toFixed(1) ?? '-'}</p>
            </div>
            <a href={`tel:${driver.phone}`}
              className="bg-success/20 text-success border border-success/30 rounded-xl px-4 py-2 text-sm font-semibold">
              📞 اتصال
            </a>
          </div>
        )}

        {isDone ? (
          <Button fullWidth onClick={() => navigate('/map')}>العودة للرئيسية</Button>
        ) : (
          <Button fullWidth variant="danger" onClick={cancel}>❌ إلغاء الرحلة</Button>
        )}
      </div>
    </div>
  );
}
