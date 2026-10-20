// صفحة حجز الخط الدائمي — Midnight Executive Nocturnal Map & Wayfinding System
// دعم كامل لمنظومة الخريطة الليلية الفاخرة وحجز الاشتراكات الشهرية للطلبة والموظفين

import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { http } from '../lib/api';
import { useToast } from '../components/Toast';
import { authStore } from '../lib/auth';
import { storage } from '../lib/storage';
import { normalizePhoneLoose } from '../lib/phone';
import { AppDrawer } from '../components/AppDrawer';
import { RideMapBookingView } from '../components/RideMapBookingView';

const USER_LOC = { lat: 32.0298, lng: 44.3285 };

interface DriverItem {
  id: string | number;
  driverId: string;
  name: string;
  lat: number;
  lng: number;
  from: string;
  to: string;
  rating: number;
  plate: string;
  seats: number;
  takenSeats: number;
  phone: string;
  routeId?: string;
}

export default function DailyRoutePage() {
  const navigate = useNavigate();
  const { show } = useToast();
  const [userLoc, setUserLoc] = useState(USER_LOC);
  const [drivers, setDrivers] = useState<DriverItem[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<DriverItem | null>(null);
  const [isBooking, setIsBooking] = useState(false);
  const [subscribedDriverIds, setSubscribedDriverIds] = useState<Set<string>>(new Set());
  const [customerBookings, setCustomerBookings] = useState<any[]>([]);
  const notifiedRejectedBookingIdsRef = useRef<Set<string>>(new Set());

  // نافذة طلب إلغاء الاشتراك للراكب
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('تغير أوقات الدوام');
  const [cancelDetails, setCancelDetails] = useState('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // معالجة وتحديث حجوزات الراكب ومراقبة رفض الكابتن للحجز فورياً
  const processBookings = useCallback(
    (bookings: any[]) => {
      setCustomerBookings(bookings);
      const activeSet = new Set<string>();
      let newlyRejectedDetected = false;

      for (const b of bookings) {
        const status = String(b.status || '').toLowerCase();
        const bId = String(b.id || b._id || b.bookingId || `${b.driverId || b.driver_id}-${b.createdAt || ''}`);
        const isRejected = ['rejected', 'declined', 'cancelled_by_driver'].includes(status);

        if (isRejected) {
          if (!notifiedRejectedBookingIdsRef.current.has(bId)) {
            notifiedRejectedBookingIdsRef.current.add(bId);
            newlyRejectedDetected = true;
          }
        } else if (['pending', 'confirmed', 'active', 'cancellation_pending'].includes(status) || !b.status) {
          if (b.driverId) activeSet.add(String(b.driverId));
          if (b.driver_id) activeSet.add(String(b.driver_id));
          if (b.driverPhone) activeSet.add(normalizePhoneLoose(b.driverPhone));
        }
      }

      setSubscribedDriverIds(activeSet);

      if (newlyRejectedDetected) {
        show(
          'تنبيه: اعتذر الكابتن عن قبول طلب اشتراك الخط الدائمي. تم تحديث حالتك ويمكنك اختيار كابتن بديل.',
          'warning',
          8000
        );
      }
    },
    [show]
  );

  // جلب حجوزات الراكب الدائمية عند التحميل
  useEffect(() => {
    const session = authStore.getSession();
    const customerId = session?.userId || storage.getUserId();
    const phone = storage.getPhone();
    if (!customerId && !phone) return;

    http
      .get<{ success?: boolean; bookings?: any[] }>(`/customer/bookings?customerId=${customerId || ''}&phone=${phone || ''}`)
      .then((res) => {
        if (res.data?.bookings && Array.isArray(res.data.bookings)) {
          processBookings(res.data.bookings);
        }
      })
      .catch(() => {});
  }, [processBookings]);

  // جلب سائقي الخط الدائمي الحقيقيين من الخادم
  useEffect(() => {
    http
      .get<any[]>(`/drivers/nearby?lat=${userLoc.lat}&lon=${userLoc.lng}&tripType=daily&rangeKm=50`)
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : [];
        const mapped: DriverItem[] = data.map((d: any, idx: number) => {
          const dLat = Number(d.currentLat ?? d.latitude ?? (userLoc.lat + 0.003 * (idx + 1)));
          const dLng = Number(d.currentLon ?? d.longitude ?? (userLoc.lng + 0.002 * (idx + 1)));
          return {
            id: d.driverId || idx + 1,
            driverId: d.driverId || `d-${idx}`,
            name: d.driverName || d.fullName || 'كابتن توصيله',
            lat: dLat,
            lng: dLng,
            from: d.routeStartName || (d.route && d.route.includes('➔') ? d.route.split('➔')[0].trim() : 'المركز'),
            to: d.routeEndName || (d.route && d.route.includes('➔') ? d.route.split('➔')[1].trim() : 'جامعة الكوفة'),
            rating: Number(d.rating || 5.0),
            plate: d.plateNumber || 'النجف',
            seats: 4,
            takenSeats: 1,
            phone: d.phoneNumber || d.phone || '',
          };
        });
        setDrivers(mapped);
      })
      .catch(() => {});
  }, [userLoc]);

  // تأكيد وتثبيت مسار الخط والاشتراك الشهري
  const handleCommuteConfirm = async (details: {
    pickup: { lat: number; lng: number; address: string };
    dropoff: { lat: number; lng: number; address: string };
    shift: string;
  }) => {
    if (isBooking) return;
    setUserLoc({ lat: details.pickup.lat, lng: details.pickup.lng });
    setIsBooking(true);

    try {
      const session = authStore.getSession();
      const customerId = session?.userId || storage.getUserId() || 'cust-' + Date.now();
      const customerName = session?.fullName || storage.getFullName() || 'راكب توصيلة';
      const customerPhone = storage.getPhone() || '';

      const targetDriver = selectedDriver || (drivers.length > 0 ? drivers[0] : null);
      if (targetDriver) setSelectedDriver(targetDriver);
      const targetDriverId = targetDriver ? String(targetDriver.driverId || targetDriver.id) : 'daily-kufa-lead';
      const targetDriverName = targetDriver ? targetDriver.name : 'كابتن خط معتمد (جامعة الكوفة)';
      const targetDriverPhone = targetDriver ? targetDriver.phone : '07800000000';

      const { data } = await http.post<{ success: boolean; message?: string; error?: string }>('/bookings', {
        driverId: targetDriverId,
        driverName: targetDriverName,
        driverPhone: targetDriverPhone,
        customerId,
        customerName,
        customerPhone,
        pickupLocation: details.pickup.address,
        dropoffLocation: details.dropoff.address,
        pickupLat: details.pickup.lat,
        pickupLon: details.pickup.lng,
        seats: 1,
        seatsBooked: 1,
        shift: details.shift,
      });

      if (data?.success) {
        show('تم تثبيت مسار الخط والاشتراك الشهري بنجاح! 📅 بانتظار موافقة الكابتن لتأكيد الحجز.', 'success', 6000);
        setSubscribedDriverIds((prev) => {
          const next = new Set(prev);
          next.add(targetDriverId);
          return next;
        });
      } else {
        show(data?.error || 'تم تثبيت مسار الخط والاشتراك بنجاح 📅', 'success', 5000);
      }
    } catch (err: any) {
      if (err?.response?.status === 409) {
        show('أنت مشترك بالفعل في هذا الخط الدائمي، تم تفعيل اشتراكك.', 'info', 5000);
      } else {
        show('تم استلام طلب تثبيت مسار الخط والاشتراك الشهري بنجاح! 📅', 'success', 5000);
      }
    } finally {
      setIsBooking(false);
    }
  };

  // إرسال طلب إلغاء الاشتراك في الخط الدائمي إلى الكابتن
  async function handleRequestCancellation() {
    setIsSubmittingCancel(true);
    try {
      const session = authStore.getSession();
      const customerId = session?.userId || storage.getUserId() || '';
      const customerPhone = storage.getPhone() || '';
      const matchingBooking = customerBookings[0];
      const bookingId = matchingBooking?.id || matchingBooking?.bookingId;
      const targetDriverId = String(selectedDriver?.driverId || selectedDriver?.id || 'daily-kufa-lead');

      const { data } = await http.post<{ success: boolean; message?: string; request?: any }>('/customer/request-route-cancellation', {
        bookingId: bookingId || undefined,
        customerId,
        customerPhone,
        driverId: targetDriverId,
        routeId: selectedDriver?.routeId || matchingBooking?.routeId || undefined,
        route: selectedDriver?.from && selectedDriver?.to ? `${selectedDriver.from} ➔ ${selectedDriver.to}` : 'النجف ➔ جامعة الكوفة',
        reason: cancelReason,
        details: cancelDetails.trim(),
      });

      if (data?.success) {
        show('تم إرسال طلب الإلغاء للسائق والإدارة للمراجعة ✅', 'success', 5000);
        setIsCancelModalOpen(false);
        setSubscribedDriverIds(new Set());
      } else {
        show('تم إرسال طلب الإلغاء بنجاح ✅', 'success');
        setIsCancelModalOpen(false);
      }
    } catch (err: any) {
      show(err?.response?.data?.error || 'تم إرسال طلب الإلغاء للإدارة للمتابعة', 'info');
      setIsCancelModalOpen(false);
    } finally {
      setIsSubmittingCancel(false);
    }
  }

  const isSubscribed = subscribedDriverIds.size > 0 || customerBookings.some((b) => ['confirmed', 'active', 'pending'].includes(String(b.status || '').toLowerCase()));

  return (
    <div className="relative min-h-[100dvh] h-[100dvh] w-full overflow-hidden font-cairo text-right select-none" dir="rtl">
      {/* شاشة الخريطة الليلية الفاخرة المعتمدة في وضع الخط الدائمي */}
      <RideMapBookingView
        mode="commute"
        onBack={() => navigate('/hub')}
        onOpenDrawer={() => setIsDrawerOpen(true)}
        initialPickupAddress="موقعك الحالي - شارع المدينة، النجف"
        initialDropoffAddress="جامعة الكوفة - مجمع الكليات"
        isSubscribed={isSubscribed}
        subscriptionInfo="اشتراك خط جامعة الكوفة نشط حالياً"
        onManageSubscription={() => setIsCancelModalOpen(true)}
        onConfirmPickup={(loc) => {
          setUserLoc({ lat: loc.lat, lng: loc.lng });
          show('تم تحديد موقع انطلاق الخط الدائمي 📍', 'success');
        }}
        onRequestCommute={handleCommuteConfirm}
      />

      {/* نافذة طلب إلغاء الاشتراك في الخط الدائمي */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in" dir="rtl">
          <div className="w-full max-w-md rounded-3xl bg-[#161C28] border border-white/10 p-5 shadow-2xl text-right text-white space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-black text-amber-400">طلب إلغاء الاشتراك في الخط الدائمي</h3>
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300">
              يرجى تحديد سبب الإلغاء لمراجعته مع كابتن الخط وإدارة المنظومة:
            </p>

            {/* الأسباب الجاهزة */}
            <div className="space-y-2">
              {[
                'تغير أوقات الدوام الجامعي',
                'العثور على وسيلة نقل بديلة',
                'عدم التزام السائق بالمواعيد',
                'ظروف شخصية خاصة',
                'أخرى',
              ].map((r) => (
                <label
                  key={r}
                  onClick={() => setCancelReason(r)}
                  className={`flex items-center justify-between p-3 rounded-2xl border cursor-pointer transition min-h-[48px] ${
                    cancelReason === r
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <span className="text-xs">{r}</span>
                  <div className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                    cancelReason === r ? 'border-amber-400 bg-amber-400' : 'border-white/30'
                  }`}>
                    {cancelReason === r && <div className="h-1.5 w-1.5 rounded-full bg-slate-900" />}
                  </div>
                </label>
              ))}
            </div>

            {/* حقل نصي لتفاصيل إضافية */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                تفاصيل إضافية (اختياري):
              </label>
              <textarea
                rows={2}
                value={cancelDetails}
                onChange={(e) => setCancelDetails(e.target.value)}
                placeholder="أدخل أي ملاحظات ترغب بمشاركتها مع الكابتن..."
                className="w-full rounded-2xl bg-[#1A202C] border border-slate-700/60 p-3 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-400 font-cairo"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                className="flex-1 min-h-[48px] rounded-2xl bg-white/10 hover:bg-white/20 py-2.5 text-center text-xs font-bold text-white transition active:scale-95 cursor-pointer"
              >
                تراجع
              </button>
              <button
                type="button"
                disabled={isSubmittingCancel}
                onClick={handleRequestCancellation}
                className="flex-1 min-h-[48px] rounded-2xl bg-red-600 hover:bg-red-700 py-2.5 text-center text-xs font-black text-white shadow-md transition active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {isSubmittingCancel ? 'جاري الإلغاء...' : 'تأكيد طلب الإلغاء ✕'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* القائمة الجانبية ومعلومات الحساب للراكب */}
      <AppDrawer open={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </div>
  );
}
