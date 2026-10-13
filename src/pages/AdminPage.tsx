import { useState, useEffect, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { useMapbox } from '@/components/map/useMapbox';
import { adminApi, routeApi } from '@/api';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import type { AdminStats } from '@/types';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

type Tab = 'stats' | 'drivers' | 'customers' | 'bookings' | 'routes' | 'map';

const STATUS_COLOR: Record<string, string> = {
  Online:    'bg-green-500/20 text-green-300',
  Offline:   'bg-gray-500/20 text-gray-400',
  Approved:  'bg-blue-500/20 text-blue-300',
  Pending:   'bg-yellow-500/20 text-yellow-300',
  Suspended: 'bg-red-500/20 text-red-300',
  Rejected:  'bg-red-700/20 text-red-400',
};

export default function AdminPage() {
  const [tab, setTab]           = useState<Tab>('stats');
  const [stats, setStats]       = useState<AdminStats | null>(null);
  const [drivers, setDrivers]   = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [routes, setRoutes]     = useState<any[]>([]);
  const [loading, setLoading]   = useState(false);
  const [search, setSearch]     = useState('');
  const [selected, setSelected] = useState<any | null>(null);

  // Route-edit state (admin draws driver route on map)
  const [editRouteDriver, setEditRouteDriver] = useState<any | null>(null);
  const [routeWaypoints, setRouteWaypoints]   = useState<[number, number][]>([]);
  const [routeSaving, setRouteSaving]         = useState(false);
  const [routeMsg, setRouteMsg]               = useState('');

  const { addMarker, drawRoute, removeRoute } = useMapbox({
    containerId: 'admin-map',
    onMapClick: useCallback((lngLat: mapboxgl.LngLat) => {
      if (!editRouteDriver) return;
      const pt: [number, number] = [lngLat.lng, lngLat.lat];
      setRouteWaypoints((prev) => {
        const next = [...prev, pt];
        if (next.length >= 2) drawRoute(`admin-route-${editRouteDriver.id}`, next, '#f97316');
        return next;
      });
      addMarker(`wp-admin-${Date.now()}`, lngLat.lng, lngLat.lat, '#f97316');
    }, [editRouteDriver, addMarker, drawRoute]),
  });

  const load = async (t: Tab) => {
    setLoading(true);
    try {
      if (t === 'stats')     setStats(await adminApi.getStats());
      if (t === 'drivers')   setDrivers(await adminApi.getDrivers());
      if (t === 'customers') setCustomers(await adminApi.getCustomers());
      if (t === 'bookings')  setBookings(await adminApi.getBookings());
      if (t === 'routes')    setRoutes(await adminApi.getRoutes());
      if (t === 'map') {
        setDrivers(await adminApi.getDrivers());
        setRoutes(await adminApi.getRoutes());
      }
    } catch (_) {} finally { setLoading(false); }
  };

  useEffect(() => { load(tab); }, [tab]);

  // Draw all driver routes when map tab loads
  useEffect(() => {
    if (tab !== 'map') return;
    routes.forEach((r) => {
      if (r.waypoints?.length >= 2) {
        drawRoute(`route-${r.id}`, r.waypoints, r.is_active ? '#059669' : '#6b7280');
      }
    });
    drivers.forEach((d) => {
      if (d.lat && d.lng) addMarker(`driver-${d.id}`, d.lng, d.lat, '#f97316', d.fullName ?? d.full_name);
    });
  }, [tab, routes, drivers]);

  const approveDriver  = async (id: string) => { await adminApi.updateDriverStatus(id, 'approve'); load('drivers'); };
  const blockDriver    = async (id: string) => { await adminApi.updateDriverStatus(id, 'block');   load('drivers'); };
  const deleteDriver   = async (id: string) => { if (!confirm('حذف؟')) return; await adminApi.deleteDriver(id); load('drivers'); };
  const deleteCustomer = async (id: string) => { if (!confirm('حذف؟')) return; await adminApi.deleteCustomer(id); load('customers'); };
  const toggleRoute    = async (r: any)     => { await routeApi.updatePermanent(r.id, { is_active: !r.is_active }); load('routes'); };
  const deleteRoute    = async (id: string) => { if (!confirm('حذف المسار؟')) return; await routeApi.deletePermanent(id); load('routes'); };

  const saveDriverRoute = async () => {
    if (!editRouteDriver || routeWaypoints.length < 2) return;
    setRouteSaving(true); setRouteMsg('');
    try {
      await routeApi.savePermanent({
        driverId: editRouteDriver.id,
        waypoints: routeWaypoints,
        fromName: `مسار ${editRouteDriver.fullName ?? editRouteDriver.full_name}`,
        toName: 'وجهة السائق',
        totalSeats: editRouteDriver.total_seats ?? 4,
      });
      setRouteMsg('✅ تم حفظ المسار');
      setEditRouteDriver(null);
      setRouteWaypoints([]);
      removeRoute(`admin-route-${editRouteDriver.id}`);
      load('routes');
    } catch (e: any) {
      setRouteMsg(`❌ ${e.message}`);
    } finally { setRouteSaving(false); }
  };

  const filterText = search.toLowerCase();
  const filteredDrivers   = drivers.filter((d) => (d.fullName ?? d.full_name ?? '').toLowerCase().includes(filterText) || (d.phone ?? '').includes(filterText));
  const filteredCustomers = customers.filter((c) => (c.fullName ?? c.full_name ?? '').toLowerCase().includes(filterText) || (c.phone ?? '').includes(filterText));
  const filteredBookings  = bookings.filter((b) => (b.passenger_name ?? '').toLowerCase().includes(filterText) || (b.driver_name ?? '').toLowerCase().includes(filterText));
  const filteredRoutes    = routes.filter((r) => (r.from_name ?? '').toLowerCase().includes(filterText) || (r.to_name ?? '').toLowerCase().includes(filterText) || (r.driver_name ?? '').toLowerCase().includes(filterText));

  const TABS: { key: Tab; label: string }[] = [
    { key: 'stats',     label: '📊 إحصائيات' },
    { key: 'map',       label: '🗺️ خريطة' },
    { key: 'drivers',   label: '🚗 سائقون' },
    { key: 'customers', label: '👥 ركاب' },
    { key: 'bookings',  label: '📋 حجوزات' },
    { key: 'routes',    label: '🛣️ خطوط' },
  ];

  return (
    <div className="pt-14 min-h-screen">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <h1 className="font-extrabold text-lg text-primary">⚙️ لوحة الإدارة</h1>
        <button onClick={() => load(tab)} className="text-gray-400 hover:text-white text-sm">🔄 تحديث</button>
      </div>

      {/* Tabs */}
      <div className="border-b border-white/10 overflow-x-auto">
        <div className="flex min-w-max">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${tab === t.key ? 'text-primary border-b-2 border-primary' : 'text-gray-400 hover:text-white'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search bar (hidden on stats/map) */}
      {tab !== 'stats' && tab !== 'map' && (
        <div className="px-4 pt-3">
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 بحث..."
            className="w-full max-w-md bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-white placeholder-gray-400 focus:outline-none focus:border-primary text-sm"
            dir="rtl"
          />
        </div>
      )}

      <div className="p-4 max-w-5xl mx-auto">
        {loading && <div className="text-center py-10 text-gray-400 animate-pulse">جاري التحميل...</div>}

        {/* ── STATS ─────────────────────────────────────────── */}
        {tab === 'stats' && stats && !loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label: 'إجمالي السائقين', value: stats.totalDrivers,   icon: '🚗', color: 'text-blue-300' },
              { label: 'سائقون نشطون',    value: stats.activeDrivers,  icon: '🟢', color: 'text-green-300' },
              { label: 'الركاب',           value: stats.totalCustomers, icon: '👥', color: 'text-yellow-300' },
              { label: 'الحجوزات',         value: stats.totalBookings,  icon: '📋', color: 'text-purple-300' },
              { label: 'طلبات معلقة',     value: stats.pendingDrivers, icon: '⏳', color: 'text-orange-300' },
              { label: 'الخطوط الدائمية', value: stats.totalRoutes,    icon: '🛣️', color: 'text-primary' },
            ].map((s) => (
              <div key={s.label} className="bg-white/5 border border-white/10 rounded-2xl p-5 text-center hover:bg-white/8 transition">
                <div className="text-3xl mb-2">{s.icon}</div>
                <div className={`text-3xl font-extrabold ${s.color}`}>{s.value ?? 0}</div>
                <div className="text-xs text-gray-400 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── MAP ───────────────────────────────────────────── */}
        {tab === 'map' && (
          <div className="space-y-3">
            <div id="admin-map" className="w-full h-[420px] rounded-2xl overflow-hidden border border-white/10" />

            {editRouteDriver && (
              <div className="bg-primary/20 border border-primary/40 rounded-xl p-4 space-y-3">
                <p className="font-bold text-primary">✏️ رسم مسار: {editRouteDriver.fullName ?? editRouteDriver.full_name}</p>
                <p className="text-sm text-gray-300">انقر على الخريطة لتثبيت نقاط المسار ({routeWaypoints.length} نقاط)</p>
                <div className="flex gap-2">
                  <Button onClick={saveDriverRoute} loading={routeSaving} disabled={routeWaypoints.length < 2}>
                    💾 حفظ المسار
                  </Button>
                  <Button variant="ghost" onClick={() => { setEditRouteDriver(null); setRouteWaypoints([]); }}>إلغاء</Button>
                </div>
                {routeMsg && <p className="text-sm">{routeMsg}</p>}
              </div>
            )}

            <p className="text-sm text-gray-400 text-center">
              🟢 خطوط نشطة &nbsp;|&nbsp; ⚫ خطوط موقوفة &nbsp;|&nbsp; 🔶 مواقع السائقين
            </p>

            {/* Driver list for route editing */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
              {drivers.filter((d) => ['Approved','Online'].includes(d.status)).map((d) => (
                <div key={d.id} className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">{d.fullName ?? d.full_name}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[d.status] ?? 'bg-gray-500/20 text-gray-400'}`}>{d.status}</span>
                  </div>
                  <Button
                    variant="ghost"
                    className="text-xs py-1.5 px-3"
                    onClick={() => { setEditRouteDriver(d); setRouteWaypoints([]); setRouteMsg(''); }}
                  >
                    ✏️ رسم مساره
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── DRIVERS ───────────────────────────────────────── */}
        {tab === 'drivers' && !loading && (
          <div className="space-y-3">
            {filteredDrivers.length === 0 && <p className="text-center text-gray-400 py-8">لا يوجد نتائج</p>}
            {filteredDrivers.map((d) => (
              <div key={d.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="font-semibold">{d.fullName ?? d.full_name}</p>
                    <p className="text-sm text-gray-400" dir="ltr">{d.phone}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{d.work_mode ?? 'غير محدد'} · ⭐ {d.rating?.toFixed(1) ?? '-'}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${STATUS_COLOR[d.status] ?? 'bg-gray-500/20 text-gray-400'}`}>
                    {d.status}
                  </span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {d.status === 'Pending' && (
                    <Button variant="success" onClick={() => approveDriver(d.id)} className="text-xs py-1.5 px-3">✅ اعتماد</Button>
                  )}
                  <Button variant="ghost" onClick={() => blockDriver(d.id)} className="text-xs py-1.5 px-3">🚫 حظر</Button>
                  <Button variant="danger" onClick={() => deleteDriver(d.id)} className="text-xs py-1.5 px-3">🗑️ حذف</Button>
                  <Button variant="ghost" onClick={() => setSelected(d)} className="text-xs py-1.5 px-3">👁️ تفاصيل</Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── CUSTOMERS ─────────────────────────────────────── */}
        {tab === 'customers' && !loading && (
          <div className="space-y-3">
            {filteredCustomers.length === 0 && <p className="text-center text-gray-400 py-8">لا يوجد نتائج</p>}
            {filteredCustomers.map((c) => (
              <div key={c.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold">{c.fullName ?? c.full_name}</p>
                  <p className="text-sm text-gray-400" dir="ltr">{c.phone}</p>
                  <p className="text-xs text-gray-500">{c.governorate ?? ''}</p>
                </div>
                <Button variant="danger" className="text-xs py-1.5 px-3" onClick={() => deleteCustomer(c.id)}>🗑️</Button>
              </div>
            ))}
          </div>
        )}

        {/* ── BOOKINGS ──────────────────────────────────────── */}
        {tab === 'bookings' && !loading && (
          <div className="space-y-3">
            {filteredBookings.length === 0 && <p className="text-center text-gray-400 py-8">لا يوجد نتائج</p>}
            {filteredBookings.map((b) => (
              <div key={b.id} className="bg-white/5 border border-white/10 rounded-xl p-4 text-sm">
                <div className="flex justify-between items-start mb-1">
                  <div>
                    <p className="font-semibold">{b.passenger_name ?? 'راكب'}</p>
                    <p className="text-gray-400 text-xs">← {b.driver_name ?? 'سائق'}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[b.status] ?? 'bg-gray-500/20 text-gray-400'}`}>
                    {b.status}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-2">
                  <span>{b.platform === 'telegram' ? '📱 تلغرام' : '🌐 ويب'}</span>
                  <span>{new Date(b.created_at).toLocaleString('ar-IQ')}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── ROUTES ────────────────────────────────────────── */}
        {tab === 'routes' && !loading && (
          <div className="space-y-3">
            {filteredRoutes.length === 0 && <p className="text-center text-gray-400 py-8">لا يوجد نتائج</p>}
            {filteredRoutes.map((r) => (
              <div key={r.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-semibold">{r.from_name ?? '—'} ← {r.to_name ?? '—'}</p>
                    <p className="text-xs text-gray-400">{r.driver_name} · 🪑 {r.available_seats}/{r.total_seats}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${r.is_active ? 'bg-green-500/20 text-green-300' : 'bg-gray-500/20 text-gray-400'}`}>
                    {r.is_active ? 'نشط' : 'موقوف'}
                  </span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button variant={r.is_active ? 'ghost' : 'success'} className="text-xs py-1.5 px-3" onClick={() => toggleRoute(r)}>
                    {r.is_active ? '⏸️ إيقاف' : '▶️ تفعيل'}
                  </Button>
                  <Button variant="danger" className="text-xs py-1.5 px-3" onClick={() => deleteRoute(r.id)}>🗑️ حذف</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Driver Detail Modal */}
      {selected && (
        <Modal onClose={() => setSelected(null)} title={selected.fullName ?? selected.full_name}>
          <div className="space-y-3 text-sm">
            {[
              ['📞 هاتف', selected.phone],
              ['⚙️ الحالة', selected.status],
              ['🚗 نوع العمل', selected.work_mode],
              ['🏎️ نوع السيارة', selected.vehicle_type],
              ['🎨 اللون', selected.vehicle_color],
              ['🔢 اللوحة', selected.vehicle_plate],
              ['⭐ التقييم', selected.rating?.toFixed(1) ?? '-'],
              ['🪑 المقاعد', `${selected.available_seats ?? '-'} / ${selected.total_seats ?? '-'}`],
            ].map(([label, val]) => val ? (
              <div key={label} className="flex justify-between">
                <span className="text-gray-400">{label}</span>
                <span>{val}</span>
              </div>
            ) : null)}
            <div className="flex gap-2 pt-2">
              {selected.status === 'Pending' && (
                <Button fullWidth variant="success" onClick={() => { approveDriver(selected.id); setSelected(null); }}>✅ اعتماد</Button>
              )}
              <Button fullWidth variant="danger" onClick={() => { blockDriver(selected.id); setSelected(null); }}>🚫 حظر</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
