import { useState, useEffect } from 'react';
import mapboxgl from 'mapbox-gl';
import { useMapbox } from '@/components/map/useMapbox';
import { driverApi, routeApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

export default function DriverPage() {
  const { user } = useAuthStore();
  const [online, setOnline] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [requests, setRequests] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [tab, setTab] = useState<'requests' | 'route' | 'bookings'>('requests');
  const [routeWaypoints, setRouteWaypoints] = useState<[number, number][]>([]);
  const [fromName, setFromName] = useState('');
  const [toName, setToName] = useState('');
  const [seats, setSeats] = useState('4');
  const [saveLoading, setSaveLoading] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  const { addMarker, drawRoute } = useMapbox({
    containerId: 'driver-map',
    onMapClick: tab === 'route' ? (lngLat) => {
      const pt: [number, number] = [lngLat.lng, lngLat.lat];
      setRouteWaypoints((p) => [...p, pt]);
      addMarker(`wp-${Date.now()}`, lngLat.lng, lngLat.lat, '#059669');
    } : undefined,
  });

  useEffect(() => {
    if (!user) return;
    driverApi.getPendingRequests(user.id).then((d) => setRequests(d ?? [])).catch(() => {});
    driverApi.getBookings(user.id).then((d) => setBookings(d ?? [])).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (routeWaypoints.length >= 2) drawRoute('driver-route', routeWaypoints, '#059669');
  }, [routeWaypoints]);

  const toggleOnline = async () => {
    setToggleLoading(true);
    try {
      await driverApi.toggleOnline();
      setOnline((v) => !v);
    } catch (_) {} finally { setToggleLoading(false); }
  };

  const saveRoute = async () => {
    if (routeWaypoints.length < 2) return;
    setSaveLoading(true); setSavedMsg('');
    try {
      await routeApi.savePermanent({
        waypoints: routeWaypoints,
        fromName, toName,
        totalSeats: parseInt(seats),
      });
      setSavedMsg('✅ تم حفظ المسار بنجاح');
    } catch (e: any) {
      setSavedMsg(`❌ ${e.message}`);
    } finally { setSaveLoading(false); }
  };

  const respondRequest = async (rideId: string, accept: boolean) => {
    try {
      await driverApi.approveJoin({ rideId, accept });
      setRequests((r) => r.filter((x) => x.id !== rideId));
    } catch (_) {}
  };

  return (
    <div className="pt-14 min-h-screen">
      {/* Status Bar */}
      <div className="p-4 flex items-center justify-between border-b border-white/10">
        <div>
          <h1 className="font-bold text-lg">لوحة السائق</h1>
          <p className="text-sm text-gray-400">{user?.fullName}</p>
        </div>
        <Button
          variant={online ? 'success' : 'ghost'}
          loading={toggleLoading}
          onClick={toggleOnline}
        >
          {online ? '🟢 متصل' : '⚫ غير متصل'}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/10">
        {(['requests', 'route', 'bookings'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-3 text-sm font-medium transition-colors ${tab === t ? 'text-primary border-b-2 border-primary' : 'text-gray-400'}`}
          >
            {t === 'requests' ? '📩 الطلبات' : t === 'route' ? '🗺️ مساري' : '📋 الحجوزات'}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'requests' && (
        <div className="p-4 space-y-3">
          {requests.length === 0 ? (
            <p className="text-center text-gray-400 py-8">لا توجد طلبات حالية</p>
          ) : (
            requests.map((r) => (
              <div key={r.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                <p className="font-semibold mb-3">{r.passenger_name ?? 'راكب'}</p>
                <div className="flex gap-2">
                  <Button fullWidth variant="success" onClick={() => respondRequest(r.id, true)}>✅ قبول</Button>
                  <Button fullWidth variant="danger" onClick={() => respondRequest(r.id, false)}>❌ رفض</Button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'route' && (
        <div className="flex flex-col">
          <div id="driver-map" className="h-64 w-full" />
          <div className="p-4 space-y-3">
            <p className="text-sm text-gray-400 text-center">انقر على الخريطة لرسم مسارك الدائمي</p>
            <p className="text-xs text-gray-500 text-center">{routeWaypoints.length} نقاط محددة</p>
            <Input label="من" value={fromName} onChange={setFromName} placeholder="اسم نقطة الانطلاق" />
            <Input label="إلى" value={toName} onChange={setToName} placeholder="اسم الوجهة" />
            <Input label="عدد المقاعد" value={seats} onChange={setSeats} type="number" dir="ltr" />
            <Button fullWidth onClick={saveRoute} loading={saveLoading} disabled={routeWaypoints.length < 2}>
              💾 حفظ المسار
            </Button>
            {savedMsg && <p className="text-center text-sm">{savedMsg}</p>}
          </div>
        </div>
      )}

      {tab === 'bookings' && (
        <div className="p-4 space-y-3">
          {bookings.length === 0 ? (
            <p className="text-center text-gray-400 py-8">لا توجد حجوزات</p>
          ) : (
            bookings.map((b) => (
              <div key={b.id} className="bg-white/5 border border-white/10 rounded-xl p-4 text-sm">
                <div className="flex justify-between mb-1">
                  <span className="font-semibold">{b.passenger_name ?? 'راكب'}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${b.status === 'Confirmed' ? 'bg-success/20 text-success' : 'bg-gray-500/20 text-gray-400'}`}>
                    {b.status}
                  </span>
                </div>
                <p className="text-gray-400">{new Date(b.created_at).toLocaleDateString('ar-IQ')}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
