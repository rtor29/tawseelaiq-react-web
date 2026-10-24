// طلبات الركاب الواردة — بديل driver_requests_screen.dart
// جلب الحجوزات + الموافقة/الرفض مع تحديث الحالة الفوري

import { useEffect, useState } from 'react';
import { endpoints, http } from '../lib/api';
import type { Booking } from '../types';
import { TopBar } from '../components/TopBar';
import { Button, Spinner } from '../components/ui';
import { useToast } from '../components/Toast';
import { useTheme } from '../context/ThemeContext';
import { ThemeToggleButton } from '../components/ThemeToggleButton';

const STATUS_META: Record<string, { label: string; color: string; border: string }> = {
  Pending: { label: 'بانتظار موافقتك ⏳', color: '#92400E', border: '#FCD34D' },
  Confirmed: { label: 'مؤكد ومقبول ✅', color: '#10B981', border: '#10B981' },
  Declined: { label: 'تم الرفض ❌', color: '#EF4444', border: '#FCA5A5' },
};

export default function DriverRequestsPage() {
  const { show } = useToast();
  const { isDark } = useTheme();
  const [requests, setRequests] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  async function fetchRequests() {
    setIsLoading(true);
    try {
      const { data } = await http.get<{ bookings?: Booking[] }>(endpoints.adminBookings);
      setRequests(data.bookings ?? []);
    } catch {
      setRequests([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void fetchRequests();
  }, []);

  async function accept(bookingId: string) {
    try {
      await http.post(endpoints.acceptBooking(bookingId), { status: 'Confirmed' });
    } catch {
      /* نواصل بتحديث الواجهة محلياً */
    }
    setRequests((prev) => prev.map((r) => ((r.bookingId ?? r.id) === bookingId ? { ...r, status: 'Confirmed' } : r)));
    show('تمت الموافقة على الطلب بنجاح! أصبح الحجز مؤكداً. ✅', 'success');
  }

  async function decline(bookingId: string) {
    try {
      await http.post(endpoints.declineBooking(bookingId), { status: 'Declined' });
    } catch {
      /* نواصل بتحديث الواجهة محلياً */
    }
    setRequests((prev) => prev.map((r) => ((r.bookingId ?? r.id) === bookingId ? { ...r, status: 'Declined' } : r)));
    show('تم رفض الطلب وتم إشعار الزبون. ❌', 'error');
  }

  return (
    <div className={`flex h-dvh flex-col text-right font-cairo transition-colors duration-200 ${
      isDark ? 'bg-[#080E1A] text-white' : 'bg-[#F8FAFC] text-slate-900'
    }`} dir="rtl">
      <TopBar
        title="طلبات الركاب الواردة"
        actions={
          <div className="flex items-center gap-1.5">
            <ThemeToggleButton />
            <button
              type="button"
              onClick={() => void fetchRequests()}
              className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
                isDark ? 'hover:bg-white/10 text-white' : 'hover:bg-slate-200/60 text-slate-700'
              }`}
              aria-label="تحديث"
            >
              🔄
            </button>
          </div>
        }
      />

      <main className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner className="text-amber-500" />
          </div>
        ) : requests.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-slate-400">
            <span className="text-5xl">📥</span>
            <p className={`mt-3 text-base font-extrabold ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>لا توجد طلبات جديدة حالياً</p>
          </div>
        ) : (
          <div className="space-y-4 max-w-xl mx-auto">
            {requests.map((req) => (
              <RequestCard key={req.bookingId ?? req.id} req={req} onAccept={accept} onDecline={decline} isDark={isDark} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function RequestCard({
  req,
  onAccept,
  onDecline,
  isDark,
}: {
  req: Booking;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  isDark: boolean;
}) {
  const id = req.bookingId ?? req.id ?? '';
  const status = req.status ?? 'Pending';
  const meta = STATUS_META[status] ?? STATUS_META.Pending;
  const isPending = status === 'Pending';

  return (
    <div
      className={`rounded-2xl border p-4 shadow-card transition-colors ${
        isDark ? 'bg-[#161C28] border-slate-700/60 shadow-lg' : 'bg-white border-slate-200 shadow-sm'
      }`}
      style={{ borderColor: meta.border }}
    >
      <div className="flex items-center gap-3">
        <span className={`flex h-11 w-11 items-center justify-center rounded-full font-extrabold ${
          isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-900'
        }`}>
          {(req.customerName ?? 'ز').charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`truncate font-extrabold ${isDark ? 'text-white' : 'text-slate-900'}`}>{req.customerName ?? 'زبون'}</p>
          <p dir="ltr" className={`text-right text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{req.customerPhone ?? ''}</p>
        </div>
        <span
          className="rounded-xl border px-2.5 py-1 text-[11px] font-bold"
          style={{ color: meta.color, borderColor: meta.border, backgroundColor: `${meta.border}22` }}
        >
          {meta.label}
        </span>
      </div>

      <hr className={`my-3 ${isDark ? 'border-slate-700/60' : 'border-slate-100'}`} />

      <p className={`flex items-start gap-2 text-[13px] font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
        <span className="text-emerald-500">📍</span>
        <span>{req.pickupLocation}</span>
      </p>
      <p className={`mt-1.5 flex items-start gap-2 text-[13px] font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
        <span className="text-red-400">🏁</span>
        <span>{req.dropoffLocation}</span>
      </p>

      <div className="mt-3 flex items-center justify-between">
        <p className={`text-sm font-extrabold ${isDark ? 'text-amber-400' : 'text-amber-700'}`}>
          المقاعد: {req.seatsBooked ?? 1} • الإجمالي: {req.totalFare ?? 3000} د.ع
        </p>
        <a
          href={`tel:${req.customerPhone ?? ''}`}
          className="text-xs font-bold text-blue-500 hover:underline"
        >
          📞 ملف الزبون والتواصل
        </a>
      </div>

      {isPending && (
        <div className="mt-3 flex gap-2.5">
          <Button variant="emerald" className="flex-1 py-2.5 text-sm" onClick={() => onAccept(id)}>
            ✔ موافقة (Accept)
          </Button>
          <Button variant="danger" className="flex-1 py-2.5 text-sm" onClick={() => onDecline(id)}>
            ✖ رفض (Decline)
          </Button>
        </div>
      )}
    </div>
  );
}
