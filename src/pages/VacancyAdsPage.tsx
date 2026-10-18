// إعلانات الرحلات الشاغرة — بديل vacancy_ads_screen.dart + create_vacancy_ad_screen.dart

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { endpoints, http } from '../lib/api';
import { authStore } from '../lib/auth';
import type { VacancyAd } from '../types';
import { TopBar } from '../components/TopBar';
import { BottomSheet, Button, Spinner } from '../components/ui';
import { useToast } from '../components/Toast';

export default function VacancyAdsPage() {
  const navigate = useNavigate();
  const { show } = useToast();
  const session = authStore.getSession();
  const isDriver = session?.role === 'Driver';

  const [ads, setAds] = useState<VacancyAd[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [bookingAd, setBookingAd] = useState<VacancyAd | null>(null);
  const [seatsToBook, setSeatsToBook] = useState(1);
  const [isBooking, setIsBooking] = useState(false);

  async function fetchAds() {
    setIsLoading(true);
    try {
      const { data } = await http.get<unknown>(endpoints.vacancyAds);
      setAds(Array.isArray(data) ? (data as VacancyAd[]) : (data as { ads?: VacancyAd[] })?.ads ?? []);
    } catch {
      setAds([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void fetchAds();
  }, []);

  async function requestBooking() {
    if (!bookingAd) return;
    setIsBooking(true);
    try {
      await http.post(endpoints.bookings, {
        routeId: bookingAd.id,
        driverId: bookingAd.driverId,
        seatsBooked: seatsToBook,
        pickupLocation: bookingAd.fromLocation,
        dropoffLocation: bookingAd.toLocation,
        status: 'Pending',
      });
      show('تم إرسال طلب الحجز! بانتظار موافقة الكابتن 🚖', 'success');
      setBookingAd(null);
    } catch {
      show('تعذر إرسال طلب الحجز، حاول مجدداً', 'error');
    } finally {
      setIsBooking(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-brand-surface text-right font-cairo" dir="rtl">
      <TopBar
        title="إعلانات الرحلات الشاغرة"
        actions={
          <button
            type="button"
            onClick={() => void fetchAds()}
            className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-white/10"
            aria-label="تحديث"
          >
            🔄
          </button>
        }
      />

      <main className="mx-auto w-full max-w-2xl flex-1 space-y-4 overflow-y-auto p-4">
        {isDriver && (
          <Button variant="primary" className="w-full" onClick={() => navigate('/ads/new')}>
            ➕ نشر إعلان رحلة شاغرة
          </Button>
        )}

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner className="text-brand-amber" />
          </div>
        ) : ads.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <span className="text-5xl">📭</span>
            <p className="mt-3 font-extrabold">لا توجد إعلانات متاحة حالياً</p>
          </div>
        ) : (
          ads.map((ad) => (
            <article key={ad.id} className="rounded-2xl bg-white p-4 shadow-card">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-amber-100 text-lg">🚖</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-extrabold text-brand-slate">{ad.driverName}</p>
                  <p className="truncate text-xs text-slate-500">
                    {ad.vehicleModel} • {ad.plateNumber} • ⭐ {ad.rating}
                  </p>
                </div>
                <span className="rounded-xl bg-brand-amber px-2.5 py-1 text-sm font-extrabold text-brand-slate">
                  {ad.pricePerSeatIqd} د.ع
                </span>
              </div>

              <div className="mt-3 space-y-1 text-[13px] font-semibold text-brand-slate">
                <p className="flex items-center gap-2"><span className="text-emerald-600">🟢</span> {ad.fromLocation}</p>
                <p className="flex items-center gap-2"><span className="text-red-500">🔴</span> {ad.toLocation}</p>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>📅 {ad.departureDate} — {ad.departureTime}</span>
                <span>🪑 متاح {ad.availableSeats} من {ad.totalSeats}</span>
                <span className={`font-bold ${ad.status === 'Open' ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {ad.status === 'Open' ? 'مفتوح للحجز' : ad.status === 'Full' ? 'مكتمل' : 'منتهي'}
                </span>
              </div>

              {ad.notes && <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-500">{ad.notes}</p>}

              {!isDriver && ad.status === 'Open' && (
                <Button variant="primary" className="mt-3 w-full text-sm" onClick={() => setBookingAd(ad)}>
                  حجز مقعد في هذه الرحلة 🚖
                </Button>
              )}
            </article>
          ))
        )}
      </main>

      {/* نافذة تأكيد الحجز */}
      <BottomSheet open={!!bookingAd} onClose={() => setBookingAd(null)}>
        <h3 className="mb-3 text-lg font-extrabold text-white">حجز مقعد مع {bookingAd?.driverName}</h3>
        <p className="mb-4 text-sm text-white/70">
          من {bookingAd?.fromLocation} إلى {bookingAd?.toLocation} — انطلاق {bookingAd?.departureTime}
        </p>
        <label className="mb-4 block">
          <span className="mb-1.5 block text-sm font-bold text-white">عدد المقاعد المطلوبة</span>
          <select
            value={seatsToBook}
            onChange={(e) => setSeatsToBook(Number(e.target.value))}
            className="w-full rounded-xl bg-brand-slate2 px-4 py-3 text-white outline-none"
          >
            {Array.from({ length: bookingAd?.availableSeats ?? 1 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
        <p className="mb-4 text-center text-lg font-extrabold text-brand-amber">
          الإجمالي: {(bookingAd ? bookingAd.pricePerSeatIqd * seatsToBook : 0).toLocaleString('en-US')} د.ع
        </p>
        <Button variant="primary" className="w-full" onClick={() => void requestBooking()} disabled={isBooking}>
          {isBooking ? <Spinner /> : 'إرسال طلب الحجز 🚀'}
        </Button>
      </BottomSheet>
    </div>
  );
}
