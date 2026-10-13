import { useState, useEffect } from 'react';
import { adminApi } from '@/api';
import Button from '@/components/ui/Button';
import type { AdminStats } from '@/types';

type Tab = 'stats' | 'drivers' | 'customers' | 'bookings' | 'routes';

const STATUS_COLOR: Record<string, string> = {
  Online: 'bg-success/20 text-success',
  Offline: 'bg-gray-500/20 text-gray-400',
  Approved: 'bg-blue-500/20 text-blue-300',
  Pending: 'bg-yellow-500/20 text-yellow-300',
  Suspended: 'bg-red-500/20 text-red-300',
};

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('stats');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async (t: Tab) => {
    setLoading(true);
    try {
      if (t === 'stats') setStats(await adminApi.getStats());
      else if (t === 'drivers') setDrivers(await adminApi.getDrivers());
      else if (t === 'customers') setCustomers(await adminApi.getCustomers());
      else if (t === 'bookings') setBookings(await adminApi.getBookings());
      else if (t === 'routes') setRoutes(await adminApi.getRoutes());
    } catch (_) {} finally { setLoading(false); }
  };

  useEffect(() => { load(tab); }, [tab]);

  const approveDriver = async (id: string) => {
    await adminApi.updateDriverStatus(id, 'approve');
    load('drivers');
  };

  const blockDriver = async (id: string) => {
    await adminApi.updateDriverStatus(id, 'block');
    load('drivers');
  };

  const deleteDriver = async (id: string) => {
    if (!confirm('حذف السائق؟')) return;
    await adminApi.deleteDriver(id);
    load('drivers');
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'stats', label: '📊 إحصائيات' },
    { key: 'drivers', label: '🚗 سائقون' },
    { key: 'customers', label: '👥 ركاب' },
    { key: 'bookings', label: '📋 حجوزات' },
    { key: 'routes', label: '🛣️ خطوط' },
  ];

  return (
    <div className="pt-14 min-h-screen">
      <div className="border-b border-white/10 overflow-x-auto">
        <div className="flex min-w-max">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors ${tab === t.key ? 'text-primary border-b-2 border-primary' : 'text-gray-400'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 max-w-4xl mx-auto">
        {loading && <div className="text-center py-8 text-gray-400 animate-pulse">جاري التحميل...</div>}

        {/* Stats */}
        {tab === 'stats' && stats && !loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label: 'إجمالي السائقين', value: stats.totalDrivers, icon: '🚗' },
              { label: 'سائقون نشطون', value: stats.activeDrivers, icon: '🟢' },
              { label: 'الركاب', value: stats.totalCustomers, icon: '👥' },
              { label: 'الحجوزات', value: stats.totalBookings, icon: '📋' },
              { label: 'طلبات معلقة', value: stats.pendingDrivers, icon: '⏳' },
              { label: 'الخطوط', value: stats.totalRoutes, icon: '🛣️' },
            ].map((s) => (
              <div key={s.label} className="bg-white/5 border border-white/10 rounded-2xl p-4 text-center">
                <div className="text-3xl mb-2">{s.icon}</div>
                <div className="text-2xl font-bold text-primary">{s.value}</div>
                <div className="text-xs text-gray-400 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Drivers */}
        {tab === 'drivers' && !loading && (
          <div className="space-y-3">
            {drivers.map((d) => (
              <div key={d.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <p className="font-semibold">{d.fullName ?? d.full_name}</p>
                    <p className="text-sm text-gray-400" dir="ltr">{d.phone}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLOR[d.status] ?? 'bg-gray-500/20 text-gray-400'}`}>
                    {d.status}
                  </span>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {d.status === 'Pending' && (
                    <Button variant="success" onClick={() => approveDriver(d.id)} className="text-xs py-1.5 px-3">✅ اعتماد</Button>
                  )}
                  <Button variant="ghost" onClick={() => blockDriver(d.id)} className="text-xs py-1.5 px-3">🚫 حظر</Button>
                  <Button variant="danger" onClick={() => deleteDriver(d.id)} className="text-xs py-1.5 px-3">🗑️ حذف</Button>
                </div>
              </div>
            ))}
            {drivers.length === 0 && <p className="text-center text-gray-400 py-8">لا يوجد سائقون</p>}
          </div>
        )}

        {/* Customers */}
        {tab === 'customers' && !loading && (
          <div className="space-y-3">
            {customers.map((c) => (
              <div key={c.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold">{c.fullName ?? c.full_name}</p>
                  <p className="text-sm text-gray-400" dir="ltr">{c.phone}</p>
                </div>
                <Button variant="danger" className="text-xs py-1.5 px-3" onClick={() => { adminApi.deleteCustomer(c.id).then(() => load('customers')); }}>
                  🗑️
                </Button>
              </div>
            ))}
            {customers.length === 0 && <p className="text-center text-gray-400 py-8">لا يوجد ركاب</p>}
          </div>
        )}

        {/* Bookings */}
        {tab === 'bookings' && !loading && (
          <div className="space-y-3">
            {bookings.map((b) => (
              <div key={b.id} className="bg-white/5 border border-white/10 rounded-xl p-4 text-sm">
                <div className="flex justify-between mb-1">
                  <span>{b.passenger_name ?? 'راكب'} → {b.driver_name ?? 'سائق'}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLOR[b.status] ?? 'bg-gray-500/20 text-gray-400'}`}>{b.status}</span>
                </div>
                <p className="text-gray-400 text-xs">{new Date(b.created_at).toLocaleString('ar-IQ')} | {b.platform}</p>
              </div>
            ))}
            {bookings.length === 0 && <p className="text-center text-gray-400 py-8">لا توجد حجوزات</p>}
          </div>
        )}

        {/* Routes */}
        {tab === 'routes' && !loading && (
          <div className="space-y-3">
            {routes.map((r) => (
              <div key={r.id} className="bg-white/5 border border-white/10 rounded-xl p-4 text-sm">
                <div className="flex justify-between mb-1">
                  <span className="font-semibold">{r.from_name ?? '—'} → {r.to_name ?? '—'}</span>
                  <span className={r.is_active ? 'text-success text-xs' : 'text-gray-400 text-xs'}>{r.is_active ? 'نشط' : 'موقوف'}</span>
                </div>
                <p className="text-gray-400">{r.driver_name} | {r.available_seats}/{r.total_seats} مقاعد</p>
              </div>
            ))}
            {routes.length === 0 && <p className="text-center text-gray-400 py-8">لا توجد خطوط</p>}
          </div>
        )}
      </div>
    </div>
  );
}
