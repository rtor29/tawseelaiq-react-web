import { useEffect, useState, useRef, useCallback, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { http } from '../lib/api';
import { authStore } from '../lib/auth';
import { realtime } from '../lib/realtime';
import { storage } from '../lib/storage';
import { useToast } from '../components/Toast';

const ChatModal = lazy(() => import('../components/ChatModal'));

interface Subscriber {
  id: string;
  name: string;
  from: string;
  to: string;
  phone: string;
}

interface PendingSeatBooking {
  id: string;
  bookingId?: string;
  driverId?: string;
  driverName?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  pickupLocation?: string;
  dropoffLocation?: string;
  pickupLat?: number;
  pickupLon?: number;
  seatsBooked?: number;
  status: string;
  totalFare?: number;
  createdAt?: string;
}

interface IncomingRideRequest {
  id: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  pickupName: string;
  dropoffName: string;
  fare: number;
  pickupLat: number;
  pickupLon: number;
  distanceKm?: number;
}

export default function DriverHomePage() {
  const { show } = useToast();
  const navigate = useNavigate();
  const session = authStore.getSession();
  const driverId = session?.userId || storage.getUserId() || '';

  const driverName = session?.fullName || storage.getFullName() || 'الكابتن';
  const rawPhone = storage.getPhone() || '';
  const formattedPhone = rawPhone
    ? rawPhone.startsWith('+')
      ? rawPhone
      : rawPhone.startsWith('0')
      ? `+964${rawPhone.slice(1)}`
      : `+964${rawPhone}`
    : '—';

  // الرصيد الفعلي للسائق
  const [driverBalance] = useState<string>('0');

  // حالة العمل الحالية: خمول | خط دائمي | تكسي (تبدأ بوضع الخمول افتراضياً)
  const [workStatus, setWorkStatus] = useState<'idle' | 'permanent' | 'taxi'>('idle');
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [pendingSeatRequests, setPendingSeatRequests] = useState<PendingSeatBooking[]>([]);
  const lastNotifiedSeatBookingIdRef = useRef<string | null>(null);
  const [incomingRequest, setIncomingRequest] = useState<IncomingRideRequest | null>(null);
  const [activeRide, setActiveRide] = useState<any | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestPassengerMsg, setLatestPassengerMsg] = useState<{
    id: string;
    text: string;
    timestamp: string;
    senderName: string;
  } | null>(null);
  const lastSeenMsgIdRef = useRef<string | null>(null);

  useEffect(() => {
    void realtime.connect(storage.getToken());
  }, []);

  // تحديث حالة السائق على الخادم عند تغيير حالة العمل
  useEffect(() => {
    if (!driverId) return;
    const isOnline = workStatus !== 'idle';
    const workMode = workStatus === 'idle' ? 'خمول' : workStatus === 'permanent' ? 'خط دائمي' : 'مشوار قصير';
    http
      .post('/driver/toggle-online', {
        driverId,
        isOnline,
        workStatus,
        workMode,
        driverName,
        driverPhone: rawPhone,
        latitude: 32.0298,
        longitude: 44.3285,
      })
      .catch(() => {});
  }, [workStatus, driverId, driverName, rawPhone]);

  // دالة تحديث قائمة المشتركين المؤكدين في الخط الدائمي
  const fetchSubscribers = useCallback(async () => {
    if (!driverId && !rawPhone) return;
    const targetId = driverId || rawPhone;
    try {
      const res = await http.get<{ success?: boolean; bookings?: any[] }>(
        `/driver/${encodeURIComponent(targetId)}/bookings`
      );
      const list = res.data?.bookings || (Array.isArray(res.data) ? res.data : []);
      // فقط الحجوزات المؤكدة تظهر في ركاب الخط الدائمي المشتركين
      const confirmed = list.filter(
        (b: any) => b.status === 'Confirmed' || (!b.status && b.bookingConfirmed !== false)
      );
      setSubscribers(
        confirmed.map((b: any, idx: number) => ({
          id: b.id || b.bookingId || String(idx),
          name: b.customerName || b.passengerName || 'مشترك خط دائمي',
          from: b.pickupLocation || b.pickupAddress || b.from || 'نقطة الانطلاق',
          to: b.dropoffLocation || b.dropoffAddress || b.to || 'الوجهة',
          phone: b.customerPhone || b.phone || '',
        }))
      );
    } catch (_) {}
  }, [driverId, rawPhone]);

  useEffect(() => {
    void fetchSubscribers();
  }, [fetchSubscribers]);

  // استطلاع طلبات حجز المقاعد الواردة في الخط الدائمي وتنبيه السائق فوراً
  useEffect(() => {
    if (!driverId && !rawPhone) return;
    const targetId = driverId || rawPhone;

    const fetchPendingSeatBookings = async () => {
      try {
        const { data } = await http.get<{
          success?: boolean;
          requests?: any[];
          bookings?: any[];
        }>(`/driver/${encodeURIComponent(targetId)}/requests`);

        const list = data?.requests || data?.bookings || [];
        const pending = list.filter((b: any) => b.status === 'Pending');
        setPendingSeatRequests(pending);

        // تنبيه السائق عند وصول طلب جديد لم يسبق تنبيهه عليه
        if (pending.length > 0) {
          const newest = pending[0];
          const reqId = newest.id || newest.bookingId;
          if (reqId && reqId !== lastNotifiedSeatBookingIdRef.current) {
            lastNotifiedSeatBookingIdRef.current = reqId;
            show(`🔔 طلب حجز مقعد جديد في الخط الدائمي من الراكب (${newest.customerName || 'راكب'})!`, 'info', 7000);
          }
        }
      } catch (_) {}
    };

    void fetchPendingSeatBookings();
    const interval = setInterval(fetchPendingSeatBookings, 2500);
    return () => clearInterval(interval);
  }, [driverId, rawPhone]);

  // 1. التحقق المستمر من وجود مشوار نشط للكابتن لاستقبال المحادثات والمشاوير فوراً
  useEffect(() => {
    if (!driverId) return;

    const checkActive = async () => {
      if (document.hidden) return;
      try {
        const targetId = driverId || rawPhone;
        const { data: activeData } = await http.get<{ success?: boolean; activeRide?: any }>(
          `/driver/${encodeURIComponent(targetId)}/active-ride`
        );
        if (activeData?.success && activeData.activeRide) {
          setActiveRide(activeData.activeRide);
          // إذا وجد مشوار نشط، تفعيل وضع التكسي تلقائياً لمتابعة المشوار والمحادثة
          setWorkStatus((prev) => (prev === 'idle' ? prev : 'taxi'));
        } else {
          setActiveRide(null);
        }
      } catch (_) {}
    };

    void checkActive();
    const interval = setInterval(checkActive, 2500);
    return () => clearInterval(interval);
  }, [driverId, rawPhone]);

  // 2. استطلاع رسائل المحادثة مع الراكب وتنبيه الكابتن فور وصول رسالة جديدة
  useEffect(() => {
    if (!activeRide?.id) {
      setUnreadCount(0);
      setLatestPassengerMsg(null);
      return;
    }

    let isMounted = true;
    const fetchChatMessages = async () => {
      if (document.hidden) return;
      try {
        const { data } = await http.get<{ success: boolean; messages: any[] }>(
          `/chat/messages?requestId=${encodeURIComponent(activeRide.id)}`
        );
        if (isMounted && data?.success && Array.isArray(data.messages)) {
          const customerMsgs = data.messages.filter((m) => m.senderRole === 'Customer');
          if (customerMsgs.length > 0) {
            const lastMsg = customerMsgs[customerMsgs.length - 1];
            setLatestPassengerMsg(lastMsg);

            // تنبيه الكابتن فور وصول رسالة جديدة أثناء إغلاق المحادثة
            if (!isChatOpen && lastMsg.id !== lastSeenMsgIdRef.current) {
              lastSeenMsgIdRef.current = lastMsg.id;
              setUnreadCount((prev) => prev + 1);
              show(`💬 رسالة جديدة من الراكب (${activeRide.customerName || 'الراكب'}): "${lastMsg.text}"`, 'info', 7000);
            }
          }
        }
      } catch (_) {}
    };

    void fetchChatMessages();
    const interval = setInterval(fetchChatMessages, 2000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [activeRide?.id, isChatOpen]);

  // تصفير عداد الرسائل غير المقروءة عند فتح المحادثة
  useEffect(() => {
    if (isChatOpen) {
      setUnreadCount(0);
      if (latestPassengerMsg) {
        lastSeenMsgIdRef.current = latestPassengerMsg.id;
      }
    }
  }, [isChatOpen, latestPassengerMsg]);

  // 3. استطلاع الطلبات الواردة في الانتظار وإرسال موقع السائق
  useEffect(() => {
    if (!driverId && !rawPhone) {
      setIncomingRequest(null);
      return;
    }

    const sendLocation = () => {
      http
        .post('/driver/location', {
          driverId: driverId || rawPhone,
          latitude: 32.0298,
          longitude: 44.3285,
          heading: 0,
          tripStatus: 'Online',
        })
        .catch(() => {});
    };
    if (workStatus === 'taxi') sendLocation();

    const interval = setInterval(async () => {
      if (document.hidden) return;
      try {
        const targetId = driverId || rawPhone;
        const { data: pendingData } = await http.get<{
          success?: boolean;
          requests?: IncomingRideRequest[];
        }>(`/driver/${encodeURIComponent(targetId)}/pending-requests`);

        if (pendingData?.success && pendingData.requests && pendingData.requests.length > 0) {
          setIncomingRequest(pendingData.requests[0]);
          // تحويل وضع العمل للتكسي تلقائياً لإظهار خيارات القبول والرفض فوراً
          setWorkStatus((prev) => (prev === 'idle' ? prev : 'taxi'));
        } else {
          setIncomingRequest(null);
        }
      } catch (_) {}
    }, 2000);

    return () => clearInterval(interval);
  }, [driverId, rawPhone, workStatus]);

  // قبول الطلب حقيقياً
  async function handleAcceptRide() {
    if (!incomingRequest || !driverId) return;
    try {
      const { data } = await http.post<{ success: boolean; request: any; message?: string }>('/ride/respond', {
        requestId: incomingRequest.id,
        driverId,
        action: 'accept',
      });
      if (data?.success) {
        show('تم قبول المشوار بنجاح! 🚖', 'success');
        setActiveRide(data.request);
        setIncomingRequest(null);
      } else {
        show('تعذر قبول الطلب', 'error');
      }
    } catch (err: any) {
      show(err?.response?.data?.error || 'حدث خطأ في قبول الطلب', 'error');
    }
  }

  // رفض الطلب حقيقياً
  async function handleRejectRide() {
    if (!incomingRequest || !driverId) return;
    try {
      await http.post('/ride/respond', {
        requestId: incomingRequest.id,
        driverId,
        action: 'reject',
      });
      setIncomingRequest(null);
      show('تم رفض الطلب', 'info');
    } catch (_) {
      setIncomingRequest(null);
    }
  }

  // قبول حجز مقعد في الخط الدائمي
  async function handleAcceptSeatBooking(bookingId: string) {
    if (!bookingId) return;
    try {
      const { data } = await http.post<{ success: boolean; message?: string }>(
        `/bookings/${bookingId}/accept`,
        { driverId: driverId || rawPhone }
      );
      if (data?.success) {
        show('تم قبول حجز المقعد بنجاح! ✅ أصبح الراكب ضمن ركاب خطك الدائمي', 'success');
        setPendingSeatRequests((prev) => prev.filter((b) => b.id !== bookingId && b.bookingId !== bookingId));
        void fetchSubscribers();
      } else {
        show('تعذر قبول الحجز', 'error');
      }
    } catch (err: any) {
      show(err?.response?.data?.error || 'حدث خطأ في قبول الحجز', 'error');
    }
  }

  // رفض حجز مقعد في الخط الدائمي
  async function handleRejectSeatBooking(bookingId: string) {
    if (!bookingId) return;
    try {
      const { data } = await http.post<{ success: boolean; message?: string }>(
        `/bookings/${bookingId}/decline`,
        { driverId: driverId || rawPhone, reason: 'اعتذار الكابتن عن قبول الحجز' }
      );
      if (data?.success) {
        show('تم رفض طلب الحجز', 'info');
        setPendingSeatRequests((prev) => prev.filter((b) => b.id !== bookingId && b.bookingId !== bookingId));
      } else {
        show('تعذر رفض الحجز', 'error');
      }
    } catch (err: any) {
      show(err?.response?.data?.error || 'حدث خطأ في رفض الحجز', 'error');
    }
  }

  // السائق وصل لنقطة انطلاق الراكب
  async function handleDriverArrived() {
    if (!activeRide || !driverId) return;
    try {
      const { data } = await http.post<{ success: boolean; message?: string }>('/ride/arrived', {
        requestId: activeRide.id,
        driverId,
      });
      if (data?.success) {
        show('تم إشعار الراكب بوصولك إلى الموقع 📍', 'success');
        setActiveRide((prev: any) => ({ ...prev, status: 'Arrived' }));
      }
    } catch (_) {}
  }

  // السائق أنهى المشوار
  async function handleDriverComplete() {
    if (!activeRide || !driverId) return;
    try {
      const { data } = await http.post<{ success: boolean; message?: string }>('/ride/complete', {
        requestId: activeRide.id,
        driverId,
      });
      if (data?.success) {
        show('تم إنهاء الرحلة بنجاح واستلام الأجرة 🏁 شكراً لك كابتن!', 'success');
        setActiveRide(null);
      }
    } catch (_) {}
  }

  function handleOpenWhatsApp(phone: string, name: string) {
    const text = encodeURIComponent(`مرحباً ${name}، أنا كابتن خطك الدائمي.`);
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
  }

  return (
    <div className="flex min-h-dvh flex-col bg-white font-cairo select-none" dir="rtl">
      {/* 1. الترويسة العلوية */}
      <header className="flex items-center justify-between border-b border-gray-100 px-6 pt-5 pb-4">
        {/* اليمين: معلومات السائق والصورة */}
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-300 text-slate-500 shadow-sm">
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
          </div>
          <div className="text-right">
            <p className="text-[17px] font-black text-gray-900 leading-tight">{driverName}</p>
            <p className="text-[13px] font-bold text-emerald-600 mt-0.5">سائق مفعل</p>
          </div>
        </div>

        {/* اليسار: رقم الهاتف والرصيد */}
        <div className="text-left font-sans">
          <p className="text-[14px] font-bold text-gray-900" dir="ltr">{formattedPhone}</p>
          <p className="text-[13px] font-medium text-gray-600 mt-0.5" dir="rtl">
            الرصيد: <span className="font-bold text-gray-800">{driverBalance}</span> دينار
          </p>
        </div>
      </header>

      {/* المحتوى الرئيسي */}
      <main className="flex-1 overflow-y-auto px-5 py-4">
        {/* تنبيه وصول رسالة من الراكب */}
        {latestPassengerMsg && activeRide && (
          <div
            onClick={() => setIsChatOpen(true)}
            className="mb-4 flex items-center justify-between rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 p-3.5 text-white shadow-lg cursor-pointer transition active:scale-[0.99] hover:shadow-xl animate-fade-in"
          >
            <div className="flex items-center gap-2">
              <span className="rounded-xl bg-white px-3 py-1.5 text-[12px] font-black text-blue-700 shadow-sm flex items-center gap-1">
                <span>فتح المحادثة</span>
                <span className="text-[14px]">💬</span>
              </span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-black text-white animate-pulse">
                  {unreadCount} جديدة
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-right">
              <div>
                <p className="text-[12px] font-bold text-blue-100">
                  محادثة مع الراكب ({activeRide.customerName || 'الراكب'}):
                </p>
                <p className="text-[14px] font-black text-white truncate max-w-[200px]">
                  {latestPassengerMsg.text}
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white text-[18px]">
                💬
              </div>
            </div>
          </div>
        )}

        {/* تنبيه وجود طلبات حجز مقاعد جديدة في الخط الدائمي */}
        {pendingSeatRequests.length > 0 && workStatus !== 'permanent' && (
          <div
            onClick={() => setWorkStatus('permanent')}
            className="mb-4 flex items-center justify-between rounded-2xl bg-gradient-to-r from-purple-700 to-indigo-700 p-3.5 text-white shadow-lg cursor-pointer transition active:scale-[0.99] hover:shadow-xl animate-fade-in"
          >
            <span className="rounded-xl bg-white px-3 py-1.5 text-[12px] font-black text-purple-800 shadow-sm flex items-center gap-1">
              <span>معاينة وقبول/رفض</span>
              <span className="text-[13px]">➔</span>
            </span>
            <div className="text-right">
              <p className="text-[14px] font-black text-white">
                لديك {pendingSeatRequests.length} طلب حجز مقعد جديد في الخط الدائمي!
              </p>
              <p className="text-[12px] text-purple-200 mt-0.5">
                اضغط هنا لمعاينة بيانات الراكب واتخاذ القرار فوراً
              </p>
            </div>
          </div>
        )}

        {/* 2. حالة العمل الحالية */}
        <section className="mb-6">
          <h2 className="text-[16px] font-black text-gray-900 mb-3 text-right">حالة العمل الحالية</h2>
          
          {/* أزرار التبديل الثلاثية */}
          <div className="grid grid-cols-3 gap-2">
            {/* خمول */}
            <button
              type="button"
              onClick={() => {
                setWorkStatus('idle');
                show('تم تحويل الحالة إلى خمول', 'info');
              }}
              className={`rounded-xl py-3 text-center text-[15px] font-black transition cursor-pointer active:scale-95 ${
                workStatus === 'idle'
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'bg-gray-200/90 text-gray-700 hover:bg-gray-300'
              }`}
            >
              خمول
            </button>

            {/* خط دائمي (المفعل في الصورة) */}
            <button
              type="button"
              onClick={() => {
                setWorkStatus('permanent');
                show('تم تفعيل الخط الدائمي', 'success');
              }}
              className={`relative flex items-center justify-center gap-1.5 rounded-xl py-3 text-center text-[15px] font-black transition cursor-pointer active:scale-95 ${
                workStatus === 'permanent'
                  ? 'bg-[#7c3aed] text-white shadow-md'
                  : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
              }`}
            >
              {workStatus === 'permanent' && <span>✓</span>}
              <span>خط دائمي</span>
              {pendingSeatRequests.length > 0 && (
                <span className="absolute -top-1.5 -left-1.5 flex h-5.5 w-5.5 items-center justify-center rounded-full bg-red-500 text-[11px] font-black text-white shadow-md animate-bounce">
                  {pendingSeatRequests.length}
                </span>
              )}
            </button>

            {/* تكسي */}
            <button
              type="button"
              onClick={() => {
                setWorkStatus('taxi');
                show('تم تفعيل وضع التكسي', 'success');
              }}
              className={`rounded-xl py-3 text-center text-[15px] font-black transition cursor-pointer active:scale-95 ${
                workStatus === 'taxi'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-[#bbf7d0] text-emerald-900 hover:bg-emerald-200'
              }`}
            >
              تكسي
            </button>
          </div>

          <p className="mt-3 text-center text-[13.5px] font-bold text-gray-800">
            {workStatus === 'permanent'
              ? 'أنت الآن متاح للخطوط الدائمة والمشاوير الفورية'
              : workStatus === 'taxi'
              ? 'أنت الآن متاح لطلبات التكسي الفورية'
              : 'أنت الآن في وضع الخمول وغير متاح لاستقبال الطلبات'}
          </p>
        </section>

        {/* 3. ركاب الخط الدائمي المشتركين وطلبات الحجز الواردة */}
        {workStatus === 'permanent' && (
          <section className="mb-6 space-y-5">
            {/* بطاقات طلبات حجز المقاعد الواردة (تنتظر موافقة الكابتن) */}
            {pendingSeatRequests.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-amber-500 text-white px-3 py-0.5 text-[12px] font-black animate-pulse">
                    {pendingSeatRequests.length} طلب ينتظر قرارك
                  </span>
                  <h3 className="text-[16px] font-black text-gray-900">
                    طلبات حجز المقاعد الواردة 💺
                  </h3>
                </div>

                {pendingSeatRequests.map((req) => (
                  <div
                    key={req.id || req.bookingId}
                    className="rounded-2xl border-2 border-amber-400 bg-amber-50/50 p-4 shadow-md transition hover:shadow-lg animate-fade-in text-right"
                  >
                    <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-amber-200/80">
                      <span className="rounded-md bg-amber-600 text-white px-2.5 py-0.5 text-[11.5px] font-black">
                        طلب حجز مقعد وارد 🚖
                      </span>
                      <span className="text-[13px] font-bold text-gray-700">
                        {req.seatsBooked || 1} مقعد مطلوب
                      </span>
                    </div>

                    {/* معاينة معلومات الراكب أمام السائق */}
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {req.customerPhone && (
                            <button
                              type="button"
                              onClick={() => window.open(`tel:${req.customerPhone}`)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition active:scale-95 cursor-pointer"
                              title="اتصال بالراكب"
                            >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.95 12a19.79 19.79 0 0 1-3-8.59A2 2 0 0 1 4 1.37h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                            </button>
                          )}
                          {req.customerPhone && (
                            <button
                              type="button"
                              onClick={() => handleOpenWhatsApp(req.customerPhone || '', req.customerName || '')}
                              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#22c55e]/20 text-[#16a34a] hover:bg-[#22c55e]/30 transition active:scale-95 cursor-pointer"
                              title="واتساب مع الراكب"
                            >
                              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                            </button>
                          )}
                        </div>
                        <p className="text-[16px] font-black text-gray-900">
                          الراكب: {req.customerName || 'راكب توصيلة'}
                        </p>
                      </div>

                      {req.customerPhone && (
                        <p className="text-[13px] font-bold text-gray-600" dir="ltr">
                          📞 {req.customerPhone}
                        </p>
                      )}

                      <div className="rounded-xl bg-white p-3 space-y-1.5 border border-amber-200/90 shadow-xs">
                        <p className="text-[13.5px] font-bold text-gray-800">
                          🟢 من (موقع الصعود): <span className="text-gray-900 font-black">{req.pickupLocation || 'النجف الأشرف'}</span>
                        </p>
                        <p className="text-[13.5px] font-bold text-gray-800">
                          🔴 إلى (الوجهة): <span className="text-gray-900 font-black">{req.dropoffLocation || 'جامعة الكوفة'}</span>
                        </p>
                      </div>
                    </div>

                    {/* خيارات القبول والرفض */}
                    <div className="flex gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleAcceptSeatBooking(req.id || req.bookingId || '')}
                        className="flex-1 rounded-xl bg-emerald-600 py-3 text-center text-[15px] font-black text-white shadow-sm transition active:scale-95 cursor-pointer hover:bg-emerald-700"
                      >
                        قبول الحجز ✅
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRejectSeatBooking(req.id || req.bookingId || '')}
                        className="flex-1 rounded-xl bg-red-500 py-3 text-center text-[15px] font-black text-white shadow-sm transition active:scale-95 cursor-pointer hover:bg-red-600"
                      >
                        رفض الحجز ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ركاب الخط الدائمي المشتركون */}
            <div>
              <h3 className="text-center text-[16px] font-black text-gray-900 mb-3">
                ركاب الخط الدائمي المشتركين - {subscribers.length} ركاب
              </h3>

              {subscribers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 p-5 text-center text-gray-500 bg-gray-50/50">
                  <p className="text-[14px] font-bold text-gray-700">لا يوجد ركاب مشتركين حالياً في خطك الدائمي</p>
                  <p className="text-[12px] text-gray-400 mt-1">ستظهر اشتراكات الركاب المؤكدة هنا تلقائياً بعد قبول الحجز</p>
                </div>
              ) : (
              <div className="space-y-2.5">
                {subscribers.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm transition hover:shadow-md"
                  >
                    {/* يسار: زر واتساب */}
                    <button
                      type="button"
                      onClick={() => handleOpenWhatsApp(sub.phone, sub.name)}
                      className="flex items-center gap-2 rounded-lg py-1 px-2 transition hover:bg-emerald-50 active:scale-95 cursor-pointer"
                    >
                      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#22c55e] text-white shadow-sm">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.95 12a19.79 19.79 0 0 1-3-8.59A2 2 0 0 1 4 1.37h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                      </div>
                      <span className="text-[13.5px] font-bold text-[#16a34a]">واتساب</span>
                    </button>

                    {/* يمين: اسم الراكب والمسار */}
                    <div className="text-right">
                      <p className="text-[16px] font-black text-gray-900 leading-tight">{sub.name}</p>
                      <p className="text-[13px] font-bold text-gray-700 mt-1">
                        {sub.from} <span className="text-gray-500 font-sans mx-0.5">➔</span> {sub.to}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>
          </section>
        )}

        {/* ===== وضع التكسي ===== */}
        {workStatus === 'taxi' && (
          <section className="mb-6 space-y-5">
            {/* عنوان القسم */}
            <h3 className="text-[16px] font-black text-gray-900 text-right">جديد - تفعيل الخريطة واستقبال الطلبات</h3>

            {/* كارت تفعيل الموقع */}
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 shadow-sm">
              <div className="flex items-start gap-3 mb-3" dir="rtl">
                {/* أيقونة الخريطة */}
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                  <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </div>
                <div className="text-right">
                  <p className="text-[16px] font-black text-gray-900">تفعيل الموقع على الخريطة</p>
                  <p className="text-[13px] font-bold text-gray-600 mt-0.5">الذهاب للخريطة لتلقي الطلبات</p>
                  <p className="text-[12.5px] text-gray-500 mt-1">شغّل تتبع الحركة لتصلك طلبات الركاب القريبين منك فوراً</p>
                </div>
              </div>

              {/* زر الذهاب للخريطة */}
              <button
                type="button"
                onClick={() => show('تم تفعيل تتبع الموقع على الخريطة', 'success')}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-white font-black text-[15px] shadow-md transition active:scale-95 cursor-pointer"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z" /></svg>
                <span>الذهاب للخريطة وتشغيل التتبع</span>
              </button>
            </div>

            {/* بطاقة المشوار النشط إن وُجد وكان مقبولاً */}
            {activeRide && (activeRide.status === 'Accepted' || activeRide.status === 'Arrived' || activeRide.status === 'InProgress') ? (
              <div className="rounded-2xl border-2 border-emerald-500 bg-white p-5 shadow-lg animate-fade-in">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100">
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-[13px] font-black text-emerald-800">
                    {activeRide.status === 'Arrived' ? 'وصلت إلى الراكب 📍' : 'مشوار نشط 🚖'}
                  </span>
                  <span className="text-[15px] font-black text-gray-900">
                    {activeRide.fare} دينار
                  </span>
                </div>

                <div className="text-right space-y-1.5 mb-4">
                  <p className="text-[16px] font-black text-gray-900">
                    الراكب: {activeRide.customerName || 'راكب توصيلة'}
                  </p>
                  {activeRide.customerPhone && (
                    <p className="text-[13px] font-bold text-gray-500" dir="ltr">
                      {activeRide.customerPhone}
                    </p>
                  )}
                  <p className="text-[13.5px] font-bold text-gray-700">
                    من: {activeRide.pickupName}
                  </p>
                  <p className="text-[13.5px] font-bold text-gray-700">
                    إلى: {activeRide.dropoffName}
                  </p>
                </div>

                <div className="space-y-2">
                  {activeRide.status !== 'Arrived' ? (
                    <button
                      type="button"
                      onClick={handleDriverArrived}
                      className="w-full rounded-xl bg-emerald-600 py-3 text-center text-[15px] font-black text-white shadow-md transition active:scale-95 cursor-pointer hover:bg-emerald-700"
                    >
                      وصلت إلى موقع الانطلاق 📍
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleDriverComplete}
                      className="w-full rounded-xl bg-[#f97316] py-3 text-center text-[15px] font-black text-white shadow-md transition active:scale-95 cursor-pointer hover:bg-orange-600"
                    >
                      إنهاء المشوار واستلام الأجرة 🏁
                    </button>
                  )}

                  {/* أزرار التواصل المباشر مع الراكب */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsChatOpen(true)}
                      className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-blue-50 border border-blue-200/80 py-2.5 text-center text-[14px] font-black text-blue-700 shadow-xs transition hover:bg-blue-100 active:scale-95 cursor-pointer"
                    >
                      <svg className="h-4.5 w-4.5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                      <span>مراسلة الراكب 💬</span>
                      {unreadCount > 0 && (
                        <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-black text-white animate-pulse">
                          {unreadCount}
                        </span>
                      )}
                    </button>
                    {activeRide.customerPhone && (
                      <button
                        type="button"
                        onClick={() => window.open(`tel:${activeRide.customerPhone}`)}
                        className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition active:scale-95 cursor-pointer shrink-0"
                        title="اتصال هاتفي"
                      >
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.95 12a19.79 19.79 0 0 1-3-8.59A2 2 0 0 1 4 1.37h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                      </button>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const destLat = activeRide.status === 'Arrived' ? activeRide.dropoffLat : activeRide.pickupLat;
                      const destLon = activeRide.status === 'Arrived' ? activeRide.dropoffLon : activeRide.pickupLon;
                      window.open(`https://maps.google.com/?daddr=${destLat},${destLon}`, '_blank');
                    }}
                    className="w-full rounded-xl border border-gray-300 bg-white py-2.5 text-center text-[14px] font-bold text-gray-700 transition hover:bg-gray-50 cursor-pointer"
                  >
                    فتح الملاحة (خرائط جوجل) 🗺️
                  </button>
                </div>
              </div>
            ) : incomingRequest ? (
              /* طلب وارد مع خيارات القبول والرفض بشكل واضح وبارز */
              <div className="rounded-2xl border-2 border-emerald-500 bg-white p-5 shadow-xl animate-fade-in">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100">
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-[13px] font-black text-emerald-800">
                    طلب مشوار جديد وارد! 🚖
                  </span>
                  <span className="text-[16px] font-black text-gray-900">
                    {incomingRequest.fare} دينار
                  </span>
                </div>

                <div className="text-right space-y-2 mb-4">
                  <p className="text-[16px] font-black text-gray-900">
                    الراكب: {incomingRequest.customerName || 'راكب توصيلة'}
                  </p>
                  {incomingRequest.customerPhone && (
                    <p className="text-[13px] font-bold text-gray-500" dir="ltr">
                      {incomingRequest.customerPhone}
                    </p>
                  )}
                  <p className="text-[13.5px] font-bold text-gray-700">
                    🟢 من: {incomingRequest.pickupName}
                  </p>
                  <p className="text-[13.5px] font-bold text-gray-700">
                    🔴 إلى: {incomingRequest.dropoffName}
                  </p>
                </div>

                {/* أزرار خيارات القبول والرفض */}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={handleAcceptRide}
                    className="flex-1 rounded-xl bg-emerald-600 py-3.5 text-center text-[15px] font-black text-white shadow-md transition active:scale-95 cursor-pointer hover:bg-emerald-700"
                  >
                    قبول الطلب ✅
                  </button>
                  <button
                    type="button"
                    onClick={handleRejectRide}
                    className="flex-1 rounded-xl bg-red-500 py-3.5 text-center text-[15px] font-black text-white shadow-md transition active:scale-95 cursor-pointer hover:bg-red-600"
                  >
                    رفض الطلب ✕
                  </button>
                </div>
              </div>
            ) : (
              /* بانتظار الركاب */
              <div className="relative rounded-2xl border border-gray-100 bg-white p-5 min-h-[170px] flex flex-col justify-center">
                <h4 className="text-center text-[16px] font-black text-gray-900 mb-4">بانتظار الركاب</h4>
                <div className="flex flex-col items-center gap-2">
                  {/* دوائر نبض متحركة */}
                  <div className="relative flex items-center justify-center h-20 w-20">
                    <span className="absolute h-20 w-20 rounded-full bg-emerald-100 animate-ping opacity-40" />
                    <span className="absolute h-14 w-14 rounded-full bg-emerald-200 animate-ping opacity-30" style={{ animationDelay: '0.4s' }} />
                    <span className="relative h-10 w-10 rounded-full bg-emerald-500 flex items-center justify-center">
                      <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 12l2 2 4-4" /></svg>
                    </span>
                  </div>
                  <p className="text-[14px] font-bold text-gray-600 mt-1">جاري البحث عن طلبات الركاب القريبين...</p>
                </div>
              </div>
            )}
          </section>
        )}

        {/* 4. القائمة السفلية */}
        <section className="pt-2 border-t border-gray-100">
          <div className="space-y-1">
            {/* تبويب محادثة مع الراكب */}
            <button
              type="button"
              onClick={() => {
                if (activeRide) {
                  setIsChatOpen(true);
                } else {
                  show('لا يوجد مشوار نشط حالياً مع راكب لمحادثته', 'info');
                }
              }}
              className="flex w-full items-center justify-between rounded-xl p-3 text-right transition hover:bg-blue-50/70 border border-transparent hover:border-blue-100 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                {unreadCount > 0 ? (
                  <span className="flex items-center gap-1 rounded-full bg-red-500 px-2.5 py-0.5 text-[11px] font-black text-white animate-pulse">
                    <span>{unreadCount}</span>
                    <span>رسالة جديدة</span>
                  </span>
                ) : activeRide ? (
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                    نشط 🚖
                  </span>
                ) : (
                  <span className="text-[12px] text-gray-400">غير متوفر</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-[16px] font-black text-gray-900 block">محادثة مع الراكب</span>
                  {activeRide?.customerName ? (
                    <span className="text-[12px] font-bold text-blue-600">
                      مع: {activeRide.customerName}
                    </span>
                  ) : (
                    <span className="text-[11.5px] text-gray-500">
                      مراسلة الركاب أثناء الرحلات
                    </span>
                  )}
                </div>
                <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-red-500 border-2 border-white" />
                  )}
                </div>
              </div>
            </button>

            {/* الرحلات */}
            <button
              type="button"
              onClick={() => show('سجل رحلات الخط الدائمي', 'info')}
              className="flex w-full items-center justify-end gap-3 rounded-xl p-3 text-right transition hover:bg-gray-50 cursor-pointer"
            >
              <span className="text-[16px] font-black text-gray-900">الرحلات</span>
              <svg className="h-6 w-6 text-gray-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
                <circle cx="7" cy="17" r="2" />
                <path d="M9 17h6" />
                <circle cx="17" cy="17" r="2" />
              </svg>
            </button>

            {/* العناوين المفضلة */}
            <button
              type="button"
              onClick={() => show('العناوين المفضلة للكابتن', 'info')}
              className="flex w-full items-center justify-end gap-3 rounded-xl p-3 text-right transition hover:bg-gray-50 cursor-pointer"
            >
              <span className="text-[16px] font-black text-gray-900">العناوين المفضلة</span>
              <svg className="h-6 w-6 text-gray-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 21s-6-5.33-6-10a6 6 0 0 1 12 0c0 4.67-6 10-6 10z" />
                <circle cx="12" cy="11" r="2.5" />
              </svg>
            </button>

            {/* قسائم الخصومات والجوائز */}
            <button
              type="button"
              onClick={() => show('قسائم الخصومات والجوائز للكابتن', 'info')}
              className="flex w-full items-center justify-end gap-3 rounded-xl p-3 text-right transition hover:bg-gray-50 cursor-pointer"
            >
              <span className="text-[16px] font-black text-gray-900">قسائم الخصومات والجوائز</span>
              <svg className="h-6 w-6 text-gray-900" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="9" y1="9" x2="15" y2="15" />
                <circle cx="9.5" cy="14.5" r="1.5" fill="currentColor" />
                <circle cx="14.5" cy="9.5" r="1.5" fill="currentColor" />
              </svg>
            </button>

            {/* تسجيل الخروج */}
            <button
              type="button"
              onClick={() => { authStore.clear(); navigate('/login', { replace: true }); }}
              className="flex w-full items-center justify-end gap-3 rounded-xl p-3 text-right transition hover:bg-red-50 cursor-pointer"
            >
              <span className="text-[16px] font-black text-red-600">تسجيل الخروج</span>
              <svg className="h-6 w-6 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        </section>
      </main>

      {/* نافذة المحادثة المباشرة مع الراكب */}
      {activeRide && (
        <Suspense fallback={null}>
          <ChatModal
            isOpen={isChatOpen}
            onClose={() => setIsChatOpen(false)}
            requestId={activeRide.id}
            currentUserId={driverId || 'driver'}
            currentUserRole="Driver"
            currentUserName={driverName || 'الكابتن'}
            peerName={activeRide.customerName || 'الراكب'}
            peerPhone={activeRide.customerPhone}
            peerRole="الراكب"
          />
        </Suspense>
      )}
    </div>
  );
}
