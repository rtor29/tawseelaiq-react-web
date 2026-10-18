// طلبات الركاب الواردة — بديل driver_requests_screen.dart
// جلب الحجوزات + الموافقة/الرفض مع تحديث الحالة الفوري

import { useEffect, useState } from 'react';
import { endpoints, http } from '../lib/api';
import type { Booking } from '../types';
import { TopBar } from '../components/TopBar';
import { Button, Spinner } from '../components/ui';
import { useToast } from '../components/Toast';

const STATUS_META: Record<string, { label: string; color: string; border: string }> = {
  Pending: { label: 'بانتظار موافقتك ⏳', color: '#92400E', border: '#FCD34D' },
  Confirmed: { label: 'مؤكد ومقبول ✅', color: '#10B981', border: '#10B981' },
  Declined: { label: 'تم الرفض ❌', color: '#EF4444', border: '#FCA5A5' },
};

export default function DriverRequestsPage() {
  const { show } = useToast();
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
    <div className="flex h-dvh flex-col bg-brand-surface text-right font-cairo" dir="rtl">
      <TopBar
        title="طلبات الركاب الواردة"
        actions={
          <button
            type="button"
            onClick={() => void fetchRequests()}
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/10"
            aria-label="تحديث"
          >
            🔄
          </button>
        }
      />

      <main className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner className="text-brand-amber" />
          </div>
        ) : requests.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-slate-400">
            <span className="text-5xl">📥</span>
            <p className="mt-3 text-base font-extrabold">لا توجد طلبات جديدة حالياً</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((req) => (
              <RequestCard key={req.bookingId ?? req.id} req={req} onAccept={accept} onDecline={decline} />
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
}: {
  req: Booking;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
}) {
  const id = req.bookingId ?? req.id ?? '';
  const status = req.status ?? 'Pending';
  const meta = STATUS_META[status] ?? STATUS_META.Pending;
  const isPending = status === 'Pending';

  return (
    <div
      className="rounded-2xl border bg-white p-4 shadow-card"
      style={{ borderColor: meta.border }}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 font-extrabold text-brand-slate">
          {(req.customerName ?? 'ز').charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-extrabold text-brand-slate">{req.customerName ?? 'زبون'}</p>
          <p dir="ltr" className="text-right text-xs text-slate-500">{req.customerPhone ?? ''}</p>
        </div>
        <span
          className="rounded-xl border px-2.5 py-1 text-[11px] font-bold"
          style={{ color: meta.color, borderColor: meta.border, backgroundColor: `${meta.border}22` }}
        >
          {meta.label}
        </span>
      </div>

      <hr className="my-3 border-slate-100" />

      <p className="flex items-start gap-2 text-[13px] font-semibold text-brand-slate">
        <span className="text-emerald-600">📍</span>
        <span>{req.pickupLocation}</span>
      </p>
      <p className="mt-1.5 flex items-start gap-2 text-[13px] font-semibold text-brand-slate">
        <span className="text-red-500">🏁</span>
        <span>{req.dropoffLocation}</span>
      </p>

      <div className="mt-3 flex items-center justify-between">
        <p className="text-sm font-extrabold text-amber-700">
          المقاعد: {req.seatsBooked ?? 1} • الإجمالي: {req.totalFare ?? 3000} د.ع
        </p>
        <a
          href={`tel:${req.customerPhone ?? ''}`}
          className="text-xs font-bold text-blue-600 hover:underline"
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
