import { useEffect, useState, useRef, useCallback, lazy, Suspense } from 'react';
import { http } from '../lib/api';
import { authStore } from '../lib/auth';
import { storage } from '../lib/storage';
import { useToast } from '../components/Toast';
import { Map as MapGL, Marker, type MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { config } from '../lib/config';
import { RouteLines } from '../components/map/MapPins';
import { applyArabicAndEnhancedLabels, enhanceDarkMapRoads } from '../lib/mapbox';
import { playIncomingTripAlert } from '../lib/sound';

const ChatModal = lazy(() => import('../components/ChatModal'));

interface Subscriber {
  id: string;
  name: string;
  from: string;
  to: string;
  phone: string;
  status?: string;
  cancellationPending?: boolean;
  cancellationReason?: string;
  cancellationDetails?: string;
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
  surgeMultiplier?: number;
  surgeBadge?: { text: string; type: string; percent?: number };
}

export default function DriverHomePage() {
  const { show } = useToast();
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
  const [driverBalance] = useState<string>('42,500');

  // نقاط الكابتن ومكافأة المشاوير (Driver Points)
  const [driverPoints, setDriverPoints] = useState<number>(() => {
    return storage.getPoints() || 180;
  });

  // حالة العمل الحالية: خمول | خط دائمي | تكسي | كلاهما (تُقرأ من التخزين المحلي أولاً)
  const [workStatus, setWorkStatus] = useState<'idle' | 'permanent' | 'taxi' | 'both'>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('driver_work_status') : null;
    return (saved === 'taxi' || saved === 'permanent' || saved === 'idle' || saved === 'both') ? saved as 'idle' | 'permanent' | 'taxi' | 'both' : 'taxi';
  });

  // إرسال تحديث حالة ونمط عمل السائق إلى الخادم مع إحداثيات GPS الحية فوراً
  const sendDriverStatusUpdate = useCallback((statusToSync: 'idle' | 'permanent' | 'taxi' | 'both') => {
    if (!driverId) return;
    const isOnline = statusToSync !== 'idle';
    const workMode = statusToSync === 'idle' ? 'خمول'
      : statusToSync === 'permanent' ? 'خط دائمي'
      : statusToSync === 'both' ? 'كلاهما'
      : 'مشوار قصير';

    const sendPayload = (lat: number, lng: number) => {
      const modeKey = statusToSync === 'permanent' ? 'commute'
        : statusToSync === 'taxi' ? 'taxi'
        : statusToSync === 'both' ? 'both'
        : 'idle';
      const payload = {
        driverId: driverId || rawPhone,
        phoneNumber: rawPhone,
        isOnline,
        is_online: isOnline,
        workMode,
        mode: modeKey,
        current_mode: modeKey,
        latitude: lat,
        longitude: lng,
        lat,
        lng,
        heading: 0,
        tripStatus: isOnline ? 'Online' : 'Offline',
      };
      http.post('/driver/status', payload).catch(() => {});
      http.post('/driver/mode', payload).catch(() => {});
      http.post('/driver/location', payload).catch(() => {});
    };

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => sendPayload(pos.coords.latitude, pos.coords.longitude),
        () => sendPayload(32.0298, 44.3285),
        { enableHighAccuracy: true, timeout: 5000 }
      );
    } else {
      sendPayload(32.0298, 44.3285);
    }
  }, [driverId, rawPhone]);

  function handleSwitchWorkStatus(newStatus: 'idle' | 'permanent' | 'taxi' | 'both') {
    setWorkStatus(newStatus);
    try {
      localStorage.setItem('driver_work_status', newStatus);
    } catch (_) {}
    sendDriverStatusUpdate(newStatus);
    show(
      newStatus === 'idle'
        ? 'تم تحويل الحالة إلى خمول (غير متصل) ⏸️'
        : newStatus === 'permanent'
        ? 'أنت الآن متاح للخطوط الدائمة والاشتراكات الشهرية 🚌'
        : newStatus === 'both'
        ? 'أنت الآن متاح للتكسي الفوري والخطوط الدائمية معاً 🚖🚌'
        : 'أنت الآن متصل ومتاح لاستقبال طلبات التكسي الفورية 🚖',
      'info'
    );
  }

  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [pendingSeatRequests, setPendingSeatRequests] = useState<PendingSeatBooking[]>([]);
  const lastNotifiedSeatBookingIdRef = useRef<string | null>(null);
  const [incomingRequest, setIncomingRequest] = useState<IncomingRideRequest | null>(null);
  const [activeRide, setActiveRide] = useState<any | null>(null);
  const [isTriggeringHorn, setIsTriggeringHorn] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestPassengerMsg, setLatestPassengerMsg] = useState<{
    id: string;
    text: string;
    createdAt?: string;
  } | null>(null);
  const lastSeenMsgIdRef = useRef<string | null>(null);

  // مؤقت العد التنازلي للطلب الوارد (15 ثانية)
  const [countdownSeconds, setCountdownSeconds] = useState(15);
  const lastIncomingIdRef = useRef<string | null>(null);

  // نافذة ملخص الأجرة وتحصيل الكاش
  const [isFareModalOpen, setIsFareModalOpen] = useState(false);
  const [finalFareAmount, setFinalFareAmount] = useState<string>('3,500');

  // نافذة الملاحة الخارجية
  const [isNavModalOpen, setIsNavModalOpen] = useState(false);
  const [navCoordinates, setNavCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [navTargetName, setNavTargetName] = useState<string>('');
  const [navType, setNavType] = useState<'pickup' | 'dropoff'>('pickup');

  // نافذة الإلغاء
  const [cancellingSub, setCancellingSub] = useState<Subscriber | null>(null);
  const [driverApprovalReason, setDriverApprovalReason] = useState('تم التراضي مع الراكب');
  const [isSubmittingCancellation, setIsSubmittingCancellation] = useState(false);

  // نافذة الطوارئ SOS
  const [showSosAlert, setShowSosAlert] = useState(false);

  // الخريطة والموقع
  const mapRef = useRef<MapRef | null>(null);
  const [driverLoc, setDriverLoc] = useState<{ lat: number; lng: number }>({ lat: 32.0298, lng: 44.3285 });
  const [isLocating, setIsLocating] = useState(false);
  const [driverRouteCoordinates, setDriverRouteCoordinates] = useState<[number, number][] | null>(null);

  // تتبع موقع السائق وتوسيط الخريطة
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setDriverLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  function handleRecenterDriverMap() {
    setIsLocating(true);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setDriverLoc(loc);
          mapRef.current?.flyTo({ center: [loc.lng, loc.lat], zoom: 16, duration: 800 });
          setIsLocating(false);
          show('تم توسيط الخريطة على موقعك الفعلي 📍', 'success', 2000);
        },
        () => {
          setIsLocating(false);
          mapRef.current?.flyTo({ center: [driverLoc.lng, driverLoc.lat], zoom: 16, duration: 800 });
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    } else {
      setIsLocating(false);
    }
  }

  // العد التنازلي ونغمة التنبيه عند وصول طلب جديد
  useEffect(() => {
    if (incomingRequest) {
      if (incomingRequest.id !== lastIncomingIdRef.current) {
        lastIncomingIdRef.current = incomingRequest.id;
        setCountdownSeconds(15);
        playIncomingTripAlert();
      }
      const timer = setInterval(() => {
        setCountdownSeconds((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            void handleRejectRide();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    } else {
      lastIncomingIdRef.current = null;
    }
  }, [incomingRequest]);

  // جلب ركاب الخط الدائمي وطلبات المقاعد
  const prevCancelIdsRef = useRef<Set<string>>(new Set());
  const fetchSubscribers = useCallback(async () => {
    if (!driverId && !rawPhone) return;
    try {
      const targetId = driverId || rawPhone;
      const { data } = await http.get<any>(`/driver/${encodeURIComponent(targetId)}/subscribers`);

      const rawData = data;
      const isSuccess = rawData?.success === true || Array.isArray(rawData);
      if (isSuccess) {
        const rawSubs = Array.isArray(rawData?.subscribers)
          ? rawData.subscribers
          : (Array.isArray(rawData) ? rawData.filter((b: any) => b.status === 'Confirmed' || b.status === 'Active' || b.cancellationPending) : []);
        const rawPending = Array.isArray(rawData?.pendingBookings)
          ? rawData.pendingBookings
          : (Array.isArray(rawData) ? rawData.filter((b: any) => b.status === 'Pending' || b.status === 'pending_approval' || b.status === 'pending') : []);

        const mapped: Subscriber[] = rawSubs.map((s: any) => ({
          id: s.id || s.bookingId || s._id,
          name: s.customerName || s.fullName || 'راكب خط',
          from: s.pickupLocation || s.pickupName || 'النجف',
          to: s.dropoffLocation || s.dropoffName || 'الجامعة',
          phone: s.customerPhone || s.phone || '',
          status: s.status,
          cancellationPending: Boolean(s.cancellationPending || s.cancellation_requested || s.status === 'cancellation_pending'),
          cancellationReason: s.cancellationReason || s.cancellation_reason,
          cancellationDetails: s.cancellationDetails || s.cancellation_details,
        }));
        setSubscribers(mapped);

        const currentCancelIds = new Set<string>();
        mapped.forEach((sub) => {
          if (sub.cancellationPending) {
            currentCancelIds.add(sub.id);
            if (!prevCancelIdsRef.current.has(sub.id)) {
              show(`⚠️ طلب جديد لإلغاء الاشتراك من الراكب (${sub.name})`, 'warning', 8000);
            }
          }
        });
        prevCancelIdsRef.current = currentCancelIds;

        const pendingMapped: PendingSeatBooking[] = rawPending.map((b: any) => ({
          id: b.id || b.bookingId || b._id,
          bookingId: b.bookingId || b.id,
          driverId: b.driverId,
          driverName: b.driverName,
          customerId: b.customerId,
          customerName: b.customerName || 'راكب جديد',
          customerPhone: b.customerPhone || '',
          pickupLocation: b.pickupLocation || b.pickupName || 'النجف',
          dropoffLocation: b.dropoffLocation || b.dropoffName || 'جامعة الكوفة',
          pickupLat: b.pickupLat,
          pickupLon: b.pickupLon,
          seatsBooked: b.seatsBooked || b.seats || 1,
          status: b.status || 'pending',
          totalFare: b.totalFare || b.fare,
          createdAt: b.createdAt,
        }));
        setPendingSeatRequests(pendingMapped);

        if (pendingMapped.length > 0) {
          const newest = pendingMapped[0];
          const newestId = newest.id || newest.bookingId || '';
          if (newestId && newestId !== lastNotifiedSeatBookingIdRef.current) {
            lastNotifiedSeatBookingIdRef.current = newestId;
            playIncomingTripAlert();
            if ('vibrate' in navigator) {
              try {
                navigator.vibrate([200, 100, 200, 100, 350]);
              } catch (_) {}
            }
            show(`💺 طلب حجز مقعد جديد من: ${newest.customerName} (${newest.pickupLocation} ➔ ${newest.dropoffLocation})`, 'info', 9000);
          }
        }
      }
    } catch (_) {}
  }, [driverId, rawPhone, show]);

  useEffect(() => {
    void fetchSubscribers();
    const interval = setInterval(fetchSubscribers, 4000);
    return () => clearInterval(interval);
  }, [fetchSubscribers]);

  // التحقق المستمر من وجود مشوار نشط للكابتن
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
          // Don't override workStatus — driver may be in 'both' mode
        } else {
          setActiveRide(null);
        }
      } catch (_) {}
    };

    void checkActive();
    const interval = setInterval(checkActive, 2500);
    return () => clearInterval(interval);
  }, [driverId, rawPhone]);

  // استطلاع رسائل المحادثة مع الراكب
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

            if (!isChatOpen && lastMsg.id !== lastSeenMsgIdRef.current) {
              lastSeenMsgIdRef.current = lastMsg.id;
              setUnreadCount((prev) => prev + 1);
              show(`💬 رسالة من الراكب (${activeRide.customerName || 'الراكب'}): "${lastMsg.text}"`, 'info', 7000);
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
  }, [activeRide?.id, isChatOpen, show]);

  useEffect(() => {
    if (isChatOpen) {
      setUnreadCount(0);
      if (latestPassengerMsg) {
        lastSeenMsgIdRef.current = latestPassengerMsg.id;
      }
    }
  }, [isChatOpen, latestPassengerMsg]);

  // استطلاع الطلبات الواردة في الانتظار (taxi / both modes only)
  useEffect(() => {
    if (!driverId && !rawPhone) {
      setIncomingRequest(null);
      return;
    }
    // Only poll for pending ride requests when driver can accept taxi trips
    if (workStatus !== 'taxi' && workStatus !== 'both') {
      setIncomingRequest(null);
      return;
    }

    const sendLocation = () => {
      http
        .post('/driver/location', {
          driverId: driverId || rawPhone,
          latitude: driverLoc.lat,
          longitude: driverLoc.lng,
          heading: 0,
          tripStatus: 'Online',
          workStatus: workStatus,
        })
        .catch(() => {});
    };
    sendLocation();

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
        } else {
          setIncomingRequest(null);
        }
      } catch (_) {}
    }, 2000);

    return () => clearInterval(interval);
  }, [driverId, rawPhone, workStatus, driverLoc]);

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
        show('تم قبول المشوار بنجاح! 🚖 توجه إلى موقع الراكب', 'success');
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

  // رفض طلب إلغاء الاشتراك في الخط الدائمي
  async function handleRejectCancellation(bookingId: string) {
    if (!bookingId) return;
    try {
      const { data } = await http.post<{ success: boolean; message?: string }>('/driver/respond-route-cancellation', {
        bookingId,
        driverId: driverId || rawPhone,
        action: 'reject',
      });
      if (data?.success) {
        show(data.message || 'تم الإبقاء على اشتراك الراكب بنجاح', 'success');
        void fetchSubscribers();
      } else {
        show('تعذر رفض طلب الإلغاء', 'error');
      }
    } catch (err: any) {
      show(err?.response?.data?.error || 'حدث خطأ أثناء رفض الإلغاء', 'error');
    }
  }

  function handleOpenApproveModal(sub: Subscriber) {
    setCancellingSub(sub);
    setDriverApprovalReason('تم التراضي مع الراكب');
  }

  async function handleConfirmApproveCancellation() {
    if (!cancellingSub) return;
    setIsSubmittingCancellation(true);
    try {
      const { data } = await http.post<{ success: boolean; message?: string }>('/driver/respond-route-cancellation', {
        bookingId: cancellingSub.id,
        driverId: driverId || rawPhone,
        action: 'approve',
        driverApprovalReason: driverApprovalReason.trim() || 'تم التراضي مع الراكب',
      });
      if (data?.success) {
        show(data.message || 'تمت الموافقة على إلغاء الاشتراك بنجاح', 'success');
        setSubscribers((prev) => prev.filter((s) => s.id !== cancellingSub.id));
        setCancellingSub(null);
        void fetchSubscribers();
      } else {
        show('تعذر قبول طلب الإلغاء', 'error');
      }
    } catch (err: any) {
      show(err?.response?.data?.error || 'حدث خطأ أثناء اعتماد الإلغاء', 'error');
    } finally {
      setIsSubmittingCancellation(false);
    }
  }

  // إلغاء اشتراك راكب من طرف الكابتن (force cancel)
  async function handleDriverCancelSubscriber(bookingId: string, subName: string) {
    if (!bookingId) return;
    if (!window.confirm(`هل أنت متأكد من إلغاء اشتراك ${subName}؟ سيتم تحرير مقعده فوراً.`)) return;
    try {
      const { data } = await http.post<{ success: boolean; message?: string }>('/driver/cancel-subscriber', {
        bookingId,
        driverId: driverId || rawPhone,
        reason: 'إلغاء من الكابتن',
      });
      if (data?.success) {
        show(data.message || 'تم إلغاء اشتراك الراكب بنجاح وتحرير مقعده ✅', 'success');
        setSubscribers((prev) => prev.filter((s) => s.id !== bookingId));
        void fetchSubscribers();
      } else {
        show('تعذر إلغاء الاشتراك', 'error');
      }
    } catch (err: any) {
      show(err?.response?.data?.error || 'حدث خطأ أثناء إلغاء الاشتراك', 'error');
    }
  }

  // السائق وصل لنقطة انطلاق الراكب (يطلق نغمة الهورن لدى الراكب)
  async function handleDriverArrived() {
    const currentId = driverId || rawPhone;
    if (!activeRide || !currentId) return;
    try {
      const { data } = await http.post<{ success: boolean; message?: string }>('/ride/arrived', {
        requestId: activeRide.id,
        driverId: currentId,
        driverPhone: rawPhone,
      });
      if (data?.success) {
        show('تم إشعار الراكب بوصولك وإطلاق تنبيه الهورن بنجاح 📍🚖', 'success');
        setActiveRide((prev: any) => ({ ...prev, status: 'Arrived' }));
      } else {
        show(data?.message || 'تعذر تأكيد الوصول', 'error');
      }
    } catch (err: any) {
      show(err?.response?.data?.error || 'حدث خطأ أثناء تأكيد الوصول', 'error');
    }
  }

  // إرسال تنبيه الهورن للراكب (بيب بيب 📢) عبر الباك إند
  async function handleTriggerHorn() {
    if (!activeRide) return;
    setIsTriggeringHorn(true);
    const tripId = activeRide.id;
    const currentId = driverId || rawPhone;
    try {
      const { data } = await http.post<{ success: boolean; message?: string }>(`/trips/${tripId}/horn`, {
        requestId: tripId,
        tripId,
        driverId: currentId,
      });
      if (data?.success) {
        show('تم إرسال تنبيه الهورن للراكب بنجاح (بيب بيب 📢)', 'success');
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate([100, 50, 100]);
        }
      } else {
        show(data?.message || 'تعذر إرسال تنبيه الهورن', 'error');
      }
    } catch (err: any) {
      try {
        const { data } = await http.post<{ success: boolean; message?: string }>('/ride/horn', {
          requestId: tripId,
          tripId,
          driverId: currentId,
        });
        if (data?.success) {
          show('تم إرسال تنبيه الهورن للراكب بنجاح (بيب بيب 📢)', 'success');
          if (typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate([100, 50, 100]);
          }
        } else {
          show(data?.message || 'تعذر إرسال تنبيه الهورن', 'error');
        }
      } catch (err2: any) {
        console.error('فشل إرسال تنبيه الهورن:', err2);
        show(err2?.response?.data?.error || 'تعذر إرسال تنبيه الهورن', 'error');
      }
    } finally {
      setIsTriggeringHorn(false);
    }
  }

  function handleOpenGoogleMaps(lat: number, lng: number) {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    window.open(url, '_blank');
    setIsNavModalOpen(false);
  }

  function handleOpenWaze(lat: number, lng: number) {
    const url = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
    window.open(url, '_blank');
    setIsNavModalOpen(false);
  }

  function handleOpenNavModal(target?: 'pickup' | 'dropoff') {
    if (!activeRide) return;
    const mode = target || (activeRide.status === 'Accepted' || activeRide.status === 'OnTheWay' ? 'pickup' : 'dropoff');
    setNavType(mode);

    if (mode === 'pickup') {
      const pLat = activeRide.pickupLat ?? activeRide.pickup_lat ?? activeRide.pickup?.lat;
      const pLon = activeRide.pickupLon ?? activeRide.pickup_lon ?? activeRide.pickup?.lng ?? activeRide.pickup?.lon;
      const pName = activeRide.pickupName || 'موقع الراكب';
      if (pLat && pLon) {
        setNavCoordinates({ lat: Number(pLat), lng: Number(pLon) });
        setNavTargetName(pName);
        setIsNavModalOpen(true);
      } else {
        show('إحداثيات موقع الراكب غير متوفرة حالياً', 'warning');
      }
    } else {
      const dLat = activeRide.dropoffLat ?? activeRide.dropoff_lat ?? activeRide.dropoff?.lat;
      const dLon = activeRide.dropoffLon ?? activeRide.dropoff_lon ?? activeRide.dropoff?.lng ?? activeRide.dropoff?.lon;
      const dName = activeRide.dropoffName || 'وجهة الراكب';
      if (dLat && dLon) {
        setNavCoordinates({ lat: Number(dLat), lng: Number(dLon) });
        setNavTargetName(dName);
        setIsNavModalOpen(true);
      } else {
        show('إحداثيات وجهة الراكب غير متوفرة حالياً', 'warning');
      }
    }
  }

  // انطلاق الرحلة
  async function handleDriverStartRide() {
    const currentId = driverId || rawPhone;
    if (!activeRide || !currentId) return;
    try {
      const { data } = await http.post<{ success: boolean; message?: string; status?: string }>('/ride/start', {
        requestId: activeRide.id,
        driverId: currentId,
        driverPhone: rawPhone,
      });
      if (data?.success) {
        show('تم بدء الرحلة والانطلاق إلى الوجهة 🚗💨', 'success', 3000);
        setActiveRide((prev: any) => ({ ...prev, status: 'InProgress' }));

        const destLat = activeRide.dropoffLat ?? activeRide.dropoff_lat ?? activeRide.dropoff?.lat;
        const destLon = activeRide.dropoffLon ?? activeRide.dropoff_lon ?? activeRide.dropoff?.lng ?? activeRide.dropoff?.lon;
        if (destLat && destLon) {
          setNavCoordinates({ lat: Number(destLat), lng: Number(destLon) });
          setIsNavModalOpen(true);
        }
      } else {
        show(data?.message || 'تعذر بدء الرحلة', 'error');
      }
    } catch (err: any) {
      show(err?.response?.data?.error || 'حدث خطأ في بدء الرحلة', 'error');
    }
  }

  // فتح نافذة تحصيل الأجرة الشفافة
  function handleInitiateCompleteRide() {
    if (!activeRide) return;
    const rawFare = String(activeRide.fare || activeRide.price || '3500').replace(/[^0-9]/g, '');
    const num = Math.max(3000, Number(rawFare) || 3500);
    const rounded = Math.ceil(num / 250) * 250;
    setFinalFareAmount(rounded.toLocaleString('ar-IQ'));
    setIsFareModalOpen(true);
  }

  // إنهاء المشوار الفعلي بعد التحصيل
  async function handleDriverComplete() {
    const currentId = driverId || rawPhone;
    if (!activeRide || !currentId) return;
    try {
      const { data } = await http.post<{ success: boolean; message?: string }>('/ride/complete', {
        requestId: activeRide.id,
        driverId: currentId,
        driverPhone: rawPhone,
      });
      if (data?.success) {
        show(`تم إنهاء المشوار بنجاح وتحصيل: ${finalFareAmount} د.ع 💵`, 'success', 4000);
        setActiveRide(null);
        setIsFareModalOpen(false);

        http
          .get<{ success: boolean; points?: number }>(`/driver/${driverId}/points`)
          .then((res) => {
            if (res.data?.success && res.data.points != null) {
              setDriverPoints(res.data.points);
              storage.setPoints(res.data.points);
            }
          })
          .catch(() => {});
      } else {
        show(data?.message || 'تعذر إنهاء الرحلة', 'error');
      }
    } catch (err: any) {
      show(err?.response?.data?.error || 'حدث خطأ في إنهاء الرحلة', 'error');
    }
  }

  function handleOpenWhatsApp(phone: string, name: string) {
    const text = encodeURIComponent(`مرحباً ${name}، أنا كابتن خطك الدائمي من توصيلة.`);
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
  }

  const handleDriverLogout = () => {
    // 1. مسح أي مسار مرسوم على الخريطة
    setDriverRouteCoordinates(null);
    try {
      const map = mapRef.current?.getMap?.() || mapRef.current;
      if (map && typeof map.getSource === 'function') {
        const routeSrc = (map.getSource('driver-route-line') || map.getSource('route')) as any;
        if (routeSrc && typeof routeSrc.setData === 'function') {
          routeSrc.setData({ type: 'FeatureCollection', features: [] });
        }
      }
    } catch (_) {}

    // 2. تحديث حالة السائق إلى offline في الباك إند
    const token = storage.getToken() || localStorage.getItem('token') || '';
    const currentId = driverId || rawPhone;
    fetch('/api/driver/status', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        driverId: currentId,
        is_online: false,
        isOnline: false,
        status: 'offline',
        workMode: 'خمول',
        mode: 'idle',
        current_mode: 'idle',
        tripStatus: 'Offline',
      }),
    }).catch(() => {});

    // 3. مسح كامل بيانات التخزين
    try {
      authStore.clear();
      storage.clearAll();
      localStorage.removeItem('token');
      localStorage.removeItem('driver');
      localStorage.removeItem('user');
      localStorage.removeItem('role');
      localStorage.removeItem('driver_work_status');
      sessionStorage.clear();
    } catch (_) {}

    // 4. توجيه قطعي
    window.location.replace('/login');
  };

  const isOnline = workStatus !== 'idle';

  return (
    <div
      className="w-full min-h-screen bg-[#080E1A] text-[#DDE2F4] flex flex-col font-cairo selection:bg-amber-500 overflow-y-auto"
      style={{ touchAction: 'pan-y' }}
      dir="rtl"
    >
      {/* 1. شريط المؤشرات العلوي للكابتن (Captain Top HUD Bar) */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 px-4 pt-[calc(0.75rem+env(safe-area-inset-top,1rem))] pb-3 bg-[#161C28]/95 backdrop-blur-xl shadow-lg" dir="rtl">
        {/* اليمين: الشعار المفرغ ومعلومات الكابتن */}
        <div className="flex items-center gap-2.5">
          <img
            src="/logo.png?v=40"
            alt="توصيلة"
            className="h-8 max-w-[190px] w-auto object-contain select-none pointer-events-none drop-shadow"
          />
          <div className="text-right">
            <p className="text-[14.5px] font-black text-white leading-tight">{driverName}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[11px] font-bold text-amber-400">⭐ 4.9</span>
              <span className="text-slate-500 text-[10px]">•</span>
              <span className="text-[10.5px] font-bold text-emerald-400">كابتن معتمد</span>
              <span className="text-slate-500 text-[10px]">•</span>
              <span className="text-[10px] text-slate-400 font-mono" dir="ltr">{formattedPhone}</span>
            </div>
          </div>
        </div>

        {/* اليسار: مفتاح الاتصال السريع وبطاقة الأرباح */}
        <div className="flex items-center gap-2">
          {/* كبسولة الأرباح السريعة */}
          <div className="hidden sm:flex flex-col text-left font-mono bg-white/5 border border-white/10 px-2.5 py-1 rounded-xl">
            <span className="text-[10px] text-slate-400">أرباح اليوم</span>
            <span className="text-xs font-bold text-amber-400">{driverBalance} د.ع</span>
          </div>

          {/* مفتاح الاتصال السريع (Online/Offline Toggle Pill) - Target >= 48px */}
          <button
            type="button"
            onClick={() => handleSwitchWorkStatus(isOnline ? 'idle' : 'taxi')}
            className={`min-h-[48px] px-3.5 py-2 rounded-full flex items-center gap-2 transition-all cursor-pointer active:scale-95 border ${
              isOnline
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 shadow-lg shadow-emerald-500/20'
                : 'bg-slate-800 text-slate-400 border-slate-700/60'
            }`}
            title="تبديل حالة الاتصال"
            aria-label="تبديل الاتصال"
          >
            <span className="relative flex h-2.5 w-2.5">
              {isOnline && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>}
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isOnline ? 'bg-emerald-400' : 'bg-slate-500'}`}></span>
            </span>
            <span className="text-xs font-black">{isOnline ? 'متصل' : 'خمول'}</span>
          </button>
        </div>
      </header>

      {/* المحتوى الرئيسي */}
      <main 
        className="w-full max-w-md mx-auto px-4 pt-3 flex flex-col gap-4 flex-1"
        style={{ paddingBottom: 'calc(130px + env(safe-area-inset-bottom, 24px))', touchAction: 'pan-y' }}
        dir="rtl"
      >
        {/* شريط الإحصائيات المدمج للموبايل */}
        <div className="grid grid-cols-3 gap-2 mb-3 sm:hidden">
          <div className="bg-[#161C28]/90 border border-white/10 rounded-2xl p-2.5 text-center shadow-md">
            <span className="text-[10px] text-slate-400 block mb-0.5">أرباح اليوم</span>
            <span className="text-xs font-black text-amber-400 font-mono">{driverBalance}</span>
          </div>
          <div className="bg-[#161C28]/90 border border-white/10 rounded-2xl p-2.5 text-center shadow-md">
            <span className="text-[10px] text-slate-400 block mb-0.5">التقييم</span>
            <span className="text-xs font-black text-emerald-400">⭐ 4.9</span>
          </div>
          <div className="bg-[#161C28]/90 border border-white/10 rounded-2xl p-2.5 text-center shadow-md">
            <span className="text-[10px] text-slate-400 block mb-0.5">النقاط</span>
            <span className="text-xs font-black text-white">{driverPoints}</span>
          </div>
        </div>

        {/* تنبيه وصول رسالة من الراكب */}
        {latestPassengerMsg && activeRide && (
          <div
            onClick={() => setIsChatOpen(true)}
            className="mb-3 flex items-center justify-between rounded-2xl bg-[#161C28] border border-amber-500/40 p-3 text-white shadow-xl cursor-pointer transition active:scale-[0.99] hover:border-amber-400 animate-fade-in"
            dir="rtl"
          >
            <div className="flex items-center gap-2.5 text-right">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400 text-lg">
                💬
              </div>
              <div className="text-right">
                <p className="text-[11px] font-bold text-amber-400">
                  رسالة جديدة من الراكب ({activeRide.customerName || 'الراكب'}):
                </p>
                <p className="text-[13px] font-semibold text-white truncate max-w-[190px]">
                  {latestPassengerMsg.text}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {unreadCount > 0 && (
                <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white animate-pulse">
                  {unreadCount}
                </span>
              )}
              <span className="rounded-xl bg-amber-500/20 text-amber-300 px-3 py-1.5 text-xs font-bold flex items-center gap-1 border border-amber-500/30">
                <span>فتح المحادثة</span>
                <span>➔</span>
              </span>
            </div>
          </div>
        )}

        {/* تنبيه وجود طلبات حجز مقاعد جديدة في الخط الدائمي */}
        {pendingSeatRequests.length > 0 && workStatus !== 'permanent' && workStatus !== 'both' && (
          <div
            onClick={() => handleSwitchWorkStatus('permanent')}
            className="mb-3 flex items-center justify-between rounded-2xl bg-amber-500/15 border border-amber-400/50 p-3 text-amber-300 shadow-xl cursor-pointer transition active:scale-[0.99] hover:bg-amber-500/20 animate-fade-in"
            dir="rtl"
          >
            <div className="text-right">
              <p className="text-[13px] font-bold text-white flex items-center gap-1.5">
                <span>💺</span>
                <span>لديك {pendingSeatRequests.length} طلب حجز مقعد في الخط الدائمي!</span>
              </p>
              <p className="text-[11px] text-amber-300/80 mt-0.5">اضغط هنا لمعاينة بيانات الراكب واتخاذ القرار</p>
            </div>
            <span className="rounded-xl bg-amber-500 text-slate-950 font-black px-3 py-1.5 text-xs shadow-md shrink-0">
              معاينة ➔
            </span>
          </div>
        )}

        {/* أزرار التبديل الرباعية لنمط العمل (Segmented Luxury Control) */}
        <section className="mb-3 text-right" dir="rtl">
          <div className="grid grid-cols-4 gap-1 p-1.5 bg-[#161C28]/90 rounded-2xl border border-white/10 shadow-lg" dir="rtl">
            {/* خمول */}
            <button
              type="button"
              onClick={() => handleSwitchWorkStatus('idle')}
              className={`rounded-xl py-2 text-center text-[11px] sm:text-xs transition-all duration-200 cursor-pointer active:scale-95 min-h-[48px] flex items-center justify-center font-bold ${
                workStatus === 'idle'
                  ? 'bg-slate-700/80 text-white shadow-md border border-slate-600'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              خمول
            </button>

            {/* تكسي فوري */}
            <button
              type="button"
              onClick={() => handleSwitchWorkStatus('taxi')}
              className={`rounded-xl py-2 text-center text-[11px] sm:text-xs transition-all duration-200 cursor-pointer active:scale-95 min-h-[48px] flex items-center justify-center font-bold ${
                workStatus === 'taxi'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              تكسي
            </button>

            {/* خط دائمي */}
            <button
              type="button"
              onClick={() => handleSwitchWorkStatus('permanent')}
              className={`relative flex items-center justify-center gap-1 rounded-xl py-2 text-center text-[11px] sm:text-xs transition-all duration-200 cursor-pointer active:scale-95 min-h-[48px] font-bold ${
                workStatus === 'permanent'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-400/50 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {pendingSeatRequests.length > 0 && (
                <span className="absolute -top-1 -start-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-md animate-bounce">
                  {pendingSeatRequests.length}
                </span>
              )}
              <span>خط دائمي</span>
            </button>

            {/* كلاهما */}
            <button
              type="button"
              onClick={() => handleSwitchWorkStatus('both')}
              className={`relative rounded-xl py-2 text-center text-[11px] sm:text-xs transition-all duration-200 cursor-pointer active:scale-95 min-h-[48px] flex flex-col items-center justify-center font-bold leading-tight ${
                workStatus === 'both'
                  ? 'bg-gradient-to-b from-emerald-600/60 to-amber-500/40 text-white border border-emerald-400/40 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>كلاهما</span>
              {workStatus === 'both' && <span className="text-[9px] opacity-70">🚖🚌</span>}
            </button>
          </div>
        </section>

        {/* 2. الخريطة الليلية ورادار البحث عن المشاوير (Nocturnal Radar Map) */}
        {(workStatus === 'taxi' || workStatus === 'both') && (
          <section className="space-y-3">
            <div className="relative w-full h-[280px] sm:h-[320px] rounded-3xl overflow-hidden shadow-2xl border border-white/10 bg-[#0A101D] touch-pan-y">
              <MapGL
                ref={mapRef}
                mapboxAccessToken={config.mapboxToken}
                mapStyle="mapbox://styles/mapbox/dark-v11"
                initialViewState={{ longitude: driverLoc.lng, latitude: driverLoc.lat, zoom: 15 }}
                cooperativeGestures={true}
                onLoad={(e) => {
                  applyArabicAndEnhancedLabels(e.target);
                  enhanceDarkMapRoads(e.target);
                }}
                style={{ width: '100%', height: '100%' }}
              >
                {/* مسار الملاحة بنمط ويز المتوهج */}
                {driverRouteCoordinates && driverRouteCoordinates.length > 0 && (
                  <RouteLines
                    lines={[
                      {
                        id: 'driver-route-line',
                        coordinates: driverRouteCoordinates,
                        color: '#F59E0B',
                        width: 5,
                      },
                    ]}
                  />
                )}

                {/* سيارة الكابتن التفاعلية مع موجة الرادار النابضة */}
                <Marker longitude={driverLoc.lng} latitude={driverLoc.lat} anchor="center">
                  <div className="relative flex items-center justify-center">
                    <div className="animate-ping absolute h-12 w-12 rounded-full bg-amber-500/25" />
                    <div className="h-9 w-9 rounded-full bg-[#1A202C] border-2 border-amber-400 shadow-2xl flex items-center justify-center text-amber-400 text-base font-bold">
                      🚖
                    </div>
                  </div>
                </Marker>
              </MapGL>

              {/* شارة حالة الرادار العائمة */}
              <div className="absolute top-3 right-3 z-20 pointer-events-none">
                <div className="flex items-center gap-1.5 bg-[#161C28]/90 backdrop-blur-xl border border-emerald-500/30 px-3 py-1.5 rounded-full shadow-lg">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                  </span>
                  <span className="text-white font-bold text-[11px]">رادار المشاوير نشط</span>
                </div>
              </div>

              {/* أزرار التحكم الجانبية العائمة: GPS و SOS - Touch Targets >= 48px */}
              <div className="absolute left-3 bottom-3 z-30 flex flex-col gap-2">
                {/* زر SOS للطوارئ */}
                <button
                  type="button"
                  onClick={() => setShowSosAlert((prev) => !prev)}
                  className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-full bg-red-600/90 text-white shadow-xl shadow-red-600/30 border border-red-400/40 flex items-center justify-center active:scale-90 transition-transform cursor-pointer"
                  title="طوارئ وأمان الكابتن"
                  aria-label="طوارئ"
                >
                  <span className="text-base font-bold">🆘</span>
                </button>

                {/* زر إعادة التمركز */}
                <button
                  type="button"
                  onClick={handleRecenterDriverMap}
                  disabled={isLocating}
                  className={`w-12 h-12 min-w-[48px] min-h-[48px] rounded-full bg-[#161C28]/95 text-amber-400 border border-amber-500/40 shadow-xl backdrop-blur-xl flex items-center justify-center active:scale-90 transition-transform cursor-pointer ${
                    isLocating ? 'animate-spin border-amber-400 ring-2 ring-amber-400/30' : ''
                  }`}
                  title="تحديد موقعي الفعلي"
                  aria-label="تحديد موقعي"
                >
                  <span className="text-lg">🎯</span>
                </button>
              </div>

              {/* نافذة الطوارئ للكابتن */}
              {showSosAlert && (
                <div className="absolute inset-x-3 bottom-16 z-40 bg-[#161C28]/95 border border-red-500/40 rounded-2xl p-3.5 shadow-2xl backdrop-blur-2xl animate-fade-in flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-red-400 flex items-center gap-1.5">
                      <span>🚨</span>
                      <span>غرفة طوارئ وعمليات الكباتن - النجف</span>
                    </span>
                    <button onClick={() => setShowSosAlert(false)} className="text-slate-400 hover:text-white text-xs p-1">✕</button>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    عند إرسال النداء، سيتم إرسال إحداثيات سيارتك الحية مباشرة إلى غرفة العمليات المركزية لإرسال المساعدة.
                  </p>
                  <a
                    href="tel:911"
                    className="w-full min-h-[48px] py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-red-600/30"
                  >
                    <span>📞</span>
                    <span>اتصال فوري بغرفة العمليات</span>
                  </a>
                </div>
              )}
            </div>

            {/* 3. بطاقة المشوار النشط (Active Trip Captain Control Dock) */}
            {activeRide && (activeRide.status === 'Accepted' || activeRide.status === 'Arrived' || activeRide.status === 'InProgress' || activeRide.status === 'in_progress') ? (
              <div className="rounded-3xl border border-emerald-500/60 bg-[#161C28]/95 p-4 shadow-2xl backdrop-blur-2xl animate-fade-in">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-black text-emerald-300 border border-emerald-500/40">
                      {activeRide.status === 'Arrived'
                        ? 'وصلت إلى موقع الراكب 📍'
                        : (activeRide.status === 'InProgress' || activeRide.status === 'in_progress')
                        ? 'في الطريق إلى الوجهة 🚗'
                        : 'مشوار نشط • بالانتظار 🚖'}
                    </span>
                    <button
                      type="button"
                      title="فتح الملاحة الخارجية"
                      onClick={() => handleOpenNavModal(activeRide.status === 'Accepted' || activeRide.status === 'OnTheWay' ? 'pickup' : 'dropoff')}
                      className="w-10 h-10 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-sky-500/20 text-sky-400 border border-sky-500/30 active:scale-95 transition cursor-pointer"
                    >
                      🧭
                    </button>
                  </div>
                  <span className="text-base font-black text-amber-400 font-mono">
                    {Number(String(activeRide.fare || activeRide.price || '3500').replace(/[^0-9]/g, '')).toLocaleString()} د.ع
                  </span>
                </div>

                <div className="text-right space-y-1.5 mb-4 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-white font-bold text-sm">
                      الراكب: {activeRide.customerName || 'راكب توصيلة'}
                    </span>
                    <span className="text-amber-400 text-xs">⭐ 5.0</span>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                    <p className="text-slate-300">
                      🟢 من: <span className="text-white font-bold">{activeRide.pickupName}</span>
                    </p>
                    <p className="text-slate-300">
                      🔴 إلى: <span className="text-white font-bold">{activeRide.dropoffName}</span>
                    </p>
                  </div>
                </div>

                {/* أزرار مراحل الرحلة والتواصل - Touch Targets >= 48px */}
                <div className="space-y-2.5">
                  {/* أزرار الاتصال والمراسلة والملاحة السريعة */}
                  <div className="grid grid-cols-3 gap-2">
                    {activeRide.customerPhone && (
                      <button
                        type="button"
                        onClick={() => window.open(`tel:${activeRide.customerPhone}`)}
                        className="min-h-[48px] py-2 px-2 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center gap-1.5 font-bold text-xs hover:bg-emerald-600/30 transition cursor-pointer active:scale-95"
                      >
                        <span>📞</span>
                        <span>اتصال</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleOpenNavModal(activeRide.status === 'Accepted' || activeRide.status === 'OnTheWay' ? 'pickup' : 'dropoff')}
                      className="min-h-[48px] py-2 px-2 rounded-xl bg-sky-600/20 text-sky-400 border border-sky-500/30 flex items-center justify-center gap-1.5 font-bold text-xs hover:bg-sky-600/30 transition cursor-pointer active:scale-95"
                    >
                      <span>🧭</span>
                      <span>ملاحة</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsChatOpen(true)}
                      className="min-h-[48px] py-2 px-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center justify-center gap-1.5 font-bold text-xs hover:bg-amber-500/30 transition cursor-pointer active:scale-95 relative"
                    >
                      <span>💬</span>
                      <span>محادثة</span>
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -start-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white animate-pulse">
                          {unreadCount}
                        </span>
                      )}
                    </button>
                  </div>

                  {/* الزر الرئيسي العريض لمرحلة الرحلة (Slide / Large Action Button) - 56px */}
                  {activeRide.status === 'Accepted' || activeRide.status === 'OnTheWay' ? (
                    <button
                      type="button"
                      onClick={handleDriverArrived}
                      className="w-full min-h-[56px] h-14 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 text-slate-950 font-black text-base flex items-center justify-center gap-2 shadow-xl shadow-amber-500/25 active:scale-[0.98] transition hover:brightness-105 cursor-pointer"
                    >
                      <span>📍</span>
                      <span>أنا في موقع الراكب (وصلت)</span>
                    </button>
                  ) : activeRide.status === 'Arrived' ? (
                    <div className="flex flex-col gap-2.5 w-full">
                      <button
                        type="button"
                        onClick={handleTriggerHorn}
                        disabled={isTriggeringHorn}
                        className="w-full min-h-[52px] h-[52px] rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 text-slate-950 font-black text-base flex items-center justify-center gap-2.5 shadow-xl shadow-amber-500/25 active:scale-[0.98] transition hover:brightness-105 cursor-pointer border border-amber-300 disabled:opacity-60"
                      >
                        <span className="text-xl animate-bounce">📢</span>
                        <span>{isTriggeringHorn ? 'جاري التنبيه...' : 'تنبيه الراكب (بيب بيب 🚖)'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleDriverStartRide}
                        className="w-full min-h-[52px] h-[52px] rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 text-white font-black text-base flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/25 active:scale-[0.98] transition hover:brightness-105 cursor-pointer"
                      >
                        <span className="text-xl">🚗💨</span>
                        <span>بدء المشوار والانطلاق</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleInitiateCompleteRide}
                      className="w-full min-h-[56px] h-14 rounded-2xl bg-gradient-to-r from-emerald-500 via-emerald-600 to-emerald-700 text-white font-black text-base flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/30 active:scale-[0.98] transition hover:brightness-105 cursor-pointer"
                    >
                      <span>🏁</span>
                      <span>إنهاء الرحلة واحتساب الأجرة</span>
                    </button>
                  )}
                </div>
              </div>
            ) : incomingRequest ? (
              /* 4. بطاقة استقبال المشوار الواردة الفاخرة (Incoming Trip Dispatch Sheet) */
              <div className="rounded-3xl border-2 border-amber-500 bg-[#161C28]/95 p-5 shadow-[0_-12px_40px_rgba(0,0,0,0.85)] backdrop-blur-2xl animate-fade-in text-white space-y-3">
                {/* شريط العد التنازلي التفاعلي */}
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mb-1">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all duration-1000 ease-linear rounded-full"
                    style={{ width: `${(countdownSeconds / 15) * 100}%` }}
                  />
                </div>

                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 px-3 py-1 text-xs font-black animate-pulse">
                      طلب مشوار جديد ({countdownSeconds} ثانية) 🚖
                    </span>
                    {(incomingRequest.surgeBadge || (incomingRequest.surgeMultiplier && incomingRequest.surgeMultiplier > 1.05)) && (
                      <span className="rounded-full bg-amber-500 text-slate-950 font-black px-2 py-0.5 text-[11px] shadow-xs">
                        ⚡ ذروة
                      </span>
                    )}
                  </div>
                  <span className="text-xl font-black text-amber-400 font-mono">
                    {Number(incomingRequest.fare || 0).toLocaleString()} د.ع
                  </span>
                </div>

                <div className="text-right space-y-1.5 text-xs">
                  <p className="text-white font-bold text-sm">
                    الراكب: {incomingRequest.customerName || 'راكب توصيلة'}
                  </p>
                  <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                    <p className="text-slate-300">
                      🟢 من: <span className="text-white font-bold">{incomingRequest.pickupName}</span>
                    </p>
                    <p className="text-slate-300">
                      🔴 إلى: <span className="text-white font-bold">{incomingRequest.dropoffName}</span>
                    </p>
                  </div>
                </div>

                {/* أزرار القبول والرفض - مسافات أمان >= 12px */}
                <div className="flex flex-col gap-3 pt-1">
                  {/* زر القبول العريض الفاخر (56px) */}
                  <button
                    type="button"
                    onClick={handleAcceptRide}
                    className="w-full min-h-[56px] h-14 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-slate-950 font-black text-lg flex items-center justify-center gap-2 shadow-xl shadow-amber-500/30 active:scale-[0.98] transition hover:brightness-105 cursor-pointer font-cairo"
                  >
                    <span>🚖</span>
                    <span>{`قبول المشوار 🚖 (${Number(incomingRequest.fare || 0).toLocaleString()} د.ع)`}</span>
                  </button>

                  {/* زر الرفض والتجاهل (48px) */}
                  <button
                    type="button"
                    onClick={handleRejectRide}
                    className="w-full min-h-[48px] h-12 rounded-2xl bg-[#242A37] text-slate-400 hover:text-white border border-slate-700/60 font-bold text-sm flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer"
                  >
                    <span>رفض وتجاهل ✕</span>
                  </button>
                </div>
              </div>
            ) : (
              /* بانتظار المشاوير والرادار */
              <div className="rounded-3xl border border-white/10 bg-[#161C28]/90 p-5 text-center shadow-xl backdrop-blur-xl">
                <div className="relative flex items-center justify-center h-16 w-16 mx-auto mb-2">
                  <span className="absolute h-16 w-16 rounded-full bg-amber-500/20 animate-ping" />
                  <span className="relative h-11 w-11 rounded-full bg-[#1A202C] border border-amber-400 flex items-center justify-center text-amber-400 text-xl font-bold shadow-lg">
                    🚖
                  </span>
                </div>
                <h4 className="text-sm font-bold text-white mb-0.5">أنت في وضع الجاهزية</h4>
                <p className="text-xs text-slate-400">جاري مسح النجف وبانتظار أقرب مشوار لك...</p>
              </div>
            )}
          </section>
        )}

        {/* 5. وضع الخط الدائمي (Commute Tab) */}
        {(workStatus === 'permanent' || workStatus === 'both') && (
          <section className="mb-4 space-y-4">
            {/* طلبات حجز المقاعد الواردة */}
            {pendingSeatRequests.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-amber-500 text-slate-950 px-3 py-0.5 text-xs font-black animate-pulse">
                    {pendingSeatRequests.length} طلب جديد
                  </span>
                  <h3 className="text-sm font-bold text-white">طلبات حجز المقاعد الواردة 💺</h3>
                </div>

                {pendingSeatRequests.map((req) => (
                  <div
                    key={req.id || req.bookingId}
                    className="rounded-3xl border-2 border-emerald-500/60 bg-[#161C28]/95 p-5 shadow-2xl backdrop-blur-xl space-y-3 animate-fade-in"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-white/10">
                      <span className="rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-3 py-1 text-xs font-bold flex items-center gap-1.5 animate-pulse">
                        <span>📢</span>
                        <span>طلب اشتراك خط دائمي جديد</span>
                      </span>
                      <span className="text-xs font-bold text-slate-300">
                        {req.seatsBooked || 1} مقعد
                      </span>
                    </div>

                    <div className="text-xs space-y-1.5 text-right">
                      <p className="font-bold text-white text-sm">
                        الطالب / الموظف: <span className="text-amber-400">{req.customerName || 'راكب خط دائمي'}</span>
                      </p>
                      <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-1.5 text-slate-300">
                        <p>🟢 منطقة الانطلاق: <span className="text-white font-bold">{req.pickupLocation}</span></p>
                        <p>🔴 الكلية / الدائرة: <span className="text-white font-bold">{req.dropoffLocation}</span></p>
                        <div className="flex items-center justify-between pt-1 border-t border-white/10 text-xs">
                          <span className="text-slate-400">نوع الوردية: <span className="text-white font-bold">صباحي</span></span>
                          <span className="text-emerald-400 font-bold font-mono text-sm">{Number(req.totalFare || 30000).toLocaleString()} د.ع / شهرياً</span>
                        </div>
                      </div>
                    </div>

                    {/* أزرار الموافقة والاعتذار - مسافات أمان 12px */}
                    <div className="flex flex-col gap-3 pt-1">
                      {/* زر القبول الأخضر الزمردي 54px */}
                      <button
                        type="button"
                        onClick={() => handleAcceptSeatBooking(req.id || req.bookingId || '')}
                        className="w-full min-h-[54px] h-[54px] rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30 active:scale-[0.98] transition cursor-pointer"
                      >
                        <span>📅</span>
                        <span>موافقة على إضافة الراكب للخط</span>
                      </button>
                      {/* زر الاعتذار 48px */}
                      <button
                        type="button"
                        onClick={() => handleRejectSeatBooking(req.id || req.bookingId || '')}
                        className="w-full min-h-[48px] h-12 rounded-2xl bg-[#242A37] text-slate-400 hover:text-white border border-slate-700 font-bold text-sm flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer"
                      >
                        <span>اعتذار (المقاعد ممتلئة) ✕</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* ركاب الخط المشتركون */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-white text-center">
                ركاب الخط الدائمي ({subscribers.length})
              </h3>

              {subscribers.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-700 p-6 text-center bg-[#161C28]/60">
                  <p className="text-xs font-bold text-slate-300">لا يوجد ركاب مشتركين حالياً في خطك الدائمي</p>
                  <p className="text-[11px] text-slate-500 mt-1">ستظهر اشتراكات الركاب هنا تلقائياً بعد قبول الحجز</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {subscribers.map((sub) => (
                    <div
                      key={sub.id}
                      className={`rounded-2xl border bg-[#161C28] p-3.5 shadow-lg space-y-2 ${
                        sub.cancellationPending ? 'border-amber-400/80 bg-amber-500/10' : 'border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => handleOpenWhatsApp(sub.phone, sub.name)}
                            className="min-h-[48px] px-3 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 text-xs font-bold cursor-pointer active:scale-95 transition"
                          >
                            <span>واتساب</span>
                            <span>💬</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDriverCancelSubscriber(sub.id, sub.name)}
                            className="min-h-[48px] px-3 rounded-xl bg-red-600/20 text-red-400 border border-red-500/30 flex items-center gap-1.5 text-xs font-bold cursor-pointer active:scale-95 transition hover:bg-red-600/40"
                          >
                            <span>إلغاء</span>
                            <span>✕</span>
                          </button>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-white text-sm">{sub.name}</p>
                          <p className="text-xs text-slate-400">{sub.from} ➔ {sub.to}</p>
                        </div>
                      </div>

                      {/* معالجة طلب الإلغاء */}
                      {sub.cancellationPending && (
                        <div className="pt-2 border-t border-amber-400/30 space-y-2">
                          <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs">
                            <span className="font-bold">طلب الراكب إلغاء الاشتراك: </span>
                            <span>{sub.cancellationReason || 'ظروف شخصية'}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => handleRejectCancellation(sub.id)}
                              className="min-h-[44px] rounded-xl bg-white/10 text-slate-300 text-xs font-bold hover:bg-white/20 transition cursor-pointer"
                            >
                              رفض الإلغاء
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenApproveModal(sub)}
                              className="min-h-[44px] rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition cursor-pointer"
                            >
                              الموافقة على الإلغاء
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* 6. القائمة السفلية والخدمات للكابتن */}
        <section className="pt-3 border-t border-white/10 space-y-1.5" dir="rtl">
          {/* محادثة مع الراكب */}
          <button
            type="button"
            onClick={() => {
              if (activeRide) setIsChatOpen(true);
              else show('لا يوجد مشوار نشط حالياً مع راكب لمحادثته', 'info');
            }}
            className="flex w-full items-center justify-between rounded-2xl p-3 bg-[#161C28]/80 border border-white/10 hover:border-amber-400/40 transition cursor-pointer min-h-[52px]"
          >
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-amber-400">
                💬
                {unreadCount > 0 && <span className="absolute -top-1 -start-1 h-3 w-3 rounded-full bg-red-500" />}
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-white block">محادثة الراكب</span>
                <span className="text-xs text-slate-400">
                  {activeRide?.customerName ? `مع: ${activeRide.customerName}` : 'مراسلة الركاب أثناء الرحلات'}
                </span>
              </div>
            </div>
            <span className="text-slate-500 text-xs">➔</span>
          </button>

          {/* سجل الرحلات */}
          <button
            type="button"
            onClick={() => show('سجل الرحلات والمشاوير المكتملة', 'info')}
            className="flex w-full items-center justify-between rounded-2xl p-3 bg-[#161C28]/80 border border-white/10 hover:border-amber-400/40 transition cursor-pointer min-h-[52px]"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-slate-300">
                🚖
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-white block">سجل الرحلات</span>
                <span className="text-xs text-slate-400">المشاوير والأرباح المحققة</span>
              </div>
            </div>
            <span className="text-slate-500 text-xs">➔</span>
          </button>

          {/* تسجيل الخروج */}
          <button
            type="button"
            onClick={handleDriverLogout}
            className="flex w-full items-center justify-between rounded-2xl p-3 bg-red-600/10 border border-red-500/30 hover:bg-red-600/20 text-red-400 transition cursor-pointer min-h-[52px]"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-600/20 text-red-400">
                🚪
              </div>
              <span className="text-sm font-bold">تسجيل الخروج</span>
            </div>
            <span className="text-red-400 text-xs">➔</span>
          </button>
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

      {/* بطاقة ملخص الأجرة وتحصيل المبلغ (Fare Summary & Cash Collection) */}
      {isFareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in" dir="rtl">
          <div className="w-full max-w-sm rounded-3xl bg-[#161C28] border-2 border-amber-400/80 p-5 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-400 text-3xl mx-auto flex items-center justify-center">
              💵
            </div>

            <div>
              <h3 className="text-base font-black text-white">تفاصيل وملخص الأجرة</h3>
              <p className="text-xs text-slate-400 mt-0.5">محسوبة وفق تسعيرة بلي المعتمدة لمنظومة توصيلة</p>
            </div>

            {/* تفاصيل العداد الشفافة */}
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3.5 space-y-2 text-xs text-right">
              <div className="flex items-center justify-between text-slate-300">
                <span>فتح العداد القياسي:</span>
                <span className="font-bold text-white">١,٠٠٠ د.ع</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>المسافة والوقت:</span>
                <span className="font-bold text-white">٥٠٠ د.ع/كم • ١٠٠ د.ع/د</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>الحد الأدنى للأجرة:</span>
                <span className="font-bold text-white">٣,٠٠٠ د.ع</span>
              </div>
            </div>

            {/* المبلغ النهائي المطلوب تحصيله كاش */}
            <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-400/60 text-center">
              <span className="text-xs font-bold text-amber-400 block mb-1">المبلغ المطلوب تحصيله نقداً (كاش):</span>
              <span className="text-3xl font-black text-white font-mono tracking-tight text-amber-300">
                {finalFareAmount} د.ع
              </span>
            </div>

            <button
              type="button"
              onClick={handleDriverComplete}
              className="w-full min-h-[54px] h-14 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-slate-950 font-black text-base flex items-center justify-center gap-2 shadow-xl shadow-amber-500/30 active:scale-[0.98] transition hover:brightness-105 cursor-pointer font-cairo"
            >
              <span>✅</span>
              <span>تم التحصيل وجاهز لمشوار جديد</span>
            </button>
          </div>
        </div>
      )}

      {/* نافذة اختيار تطبيق الملاحة المنبثقة (Google Maps / Waze) */}
      {isNavModalOpen && navCoordinates && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-[#161C28] border border-white/10 p-5 shadow-2xl text-center space-y-3.5" dir="rtl">
            <div className="w-12 h-12 rounded-full bg-sky-500/20 border border-sky-400/30 text-sky-400 text-2xl mx-auto flex items-center justify-center">
              🧭
            </div>
            <div>
              <h3 className="text-base font-black text-white">
                {navType === 'pickup' ? 'التوجه إلى موقع الراكب' : 'التوجه إلى وجهة الراكب'}
              </h3>
              <p className="text-xs text-slate-400 mt-1 truncate">
                {navTargetName || 'الموقع المحدد'}
              </p>
            </div>

            <div className="space-y-2.5 pt-1">
              {/* خرائط جوجل */}
              <button
                type="button"
                onClick={() => handleOpenGoogleMaps(navCoordinates.lat, navCoordinates.lng)}
                className="w-full min-h-[48px] py-3 px-4 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-bold text-sm flex items-center justify-center gap-2.5 transition active:scale-[0.98] cursor-pointer"
              >
                <span className="text-lg">🗺️</span>
                <span>خرائط جوجل (Google Maps)</span>
              </button>

              {/* تطبيق ويز */}
              <button
                type="button"
                onClick={() => handleOpenWaze(navCoordinates.lat, navCoordinates.lng)}
                className="w-full min-h-[48px] py-3 px-4 rounded-2xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/30 text-sky-300 font-bold text-sm flex items-center justify-center gap-2.5 transition active:scale-[0.98] cursor-pointer"
              >
                <span className="text-lg">🚙</span>
                <span>تطبيق ويز (Waze)</span>
              </button>

              <button
                type="button"
                onClick={() => setIsNavModalOpen(false)}
                className="w-full min-h-[44px] rounded-xl text-xs font-bold text-slate-400 hover:text-white transition cursor-pointer"
              >
                إلغاء / المتابعة داخل التطبيق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة موافقة السائق على إلغاء اشتراك الراكب */}
      {cancellingSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in" dir="rtl">
          <div className="w-full max-w-sm rounded-3xl bg-[#161C28] border border-white/10 p-5 shadow-2xl text-right space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-black text-amber-400">تأكيد إلغاء اشتراك الراكب</h3>
              <button
                type="button"
                onClick={() => setCancellingSub(null)}
                className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="rounded-2xl bg-white/5 border border-white/10 p-3 text-xs text-slate-300 space-y-1">
              <p><strong>الراكب:</strong> {cancellingSub.name}</p>
              <p><strong>سبب الطلب:</strong> <span className="font-bold text-red-400">{cancellingSub.cancellationReason || 'ظروف شخصية'}</span></p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                سبب الموافقة على الإلغاء (يُسجل في الإدارة):
              </label>
              <input
                type="text"
                value={driverApprovalReason}
                onChange={(e) => setDriverApprovalReason(e.target.value)}
                placeholder="مثال: تم التراضي مع الراكب"
                className="w-full rounded-2xl bg-[#1A202C] border border-slate-700/60 p-3 text-xs text-white focus:outline-none focus:ring-1 focus:ring-amber-400 font-cairo"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCancellingSub(null)}
                className="flex-1 min-h-[48px] rounded-2xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition active:scale-95 cursor-pointer"
              >
                تراجع
              </button>
              <button
                type="button"
                disabled={isSubmittingCancellation}
                onClick={handleConfirmApproveCancellation}
                className="flex-1 min-h-[48px] rounded-2xl bg-red-600 hover:bg-red-700 text-xs font-black text-white shadow-md transition active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {isSubmittingCancellation ? 'جاري التأكيد...' : 'تأكيد الإلغاء ✅'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* بطاقة استقبال المشوار الواردة الفاخرة العائمة (Incoming Trip Dispatch Sheet - z-[999]) */}
      {incomingRequest && !activeRide && (
        <div className="fixed inset-x-0 bottom-0 z-[999] p-4 max-w-lg mx-auto pointer-events-auto animate-slide-up" dir="rtl">
          <div className="rounded-3xl border-2 border-amber-500 bg-[#161C28]/95 p-5 shadow-[0_-12px_40px_rgba(0,0,0,0.9)] backdrop-blur-2xl text-white space-y-3">
            {/* شريط العد التنازلي التفاعلي */}
            <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mb-1">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all duration-1000 ease-linear rounded-full"
                style={{ width: `${(countdownSeconds / 15) * 100}%` }}
              />
            </div>

            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 px-3 py-1 text-xs font-black animate-pulse">
                  طلب مشوار جديد ({countdownSeconds} ثانية) 🚖
                </span>
                {(incomingRequest.surgeBadge || (incomingRequest.surgeMultiplier && incomingRequest.surgeMultiplier > 1.05)) && (
                  <span className="rounded-full bg-amber-500 text-slate-950 font-black px-2 py-0.5 text-[11px] shadow-xs">
                    ⚡ ذروة
                  </span>
                )}
              </div>
              <span className="text-xl font-black text-amber-400 font-mono">
                {Number(incomingRequest.fare || 0).toLocaleString()} د.ع
              </span>
            </div>

            <div className="text-right space-y-1.5 text-xs">
              <p className="text-white font-bold text-sm">
                الراكب: {incomingRequest.customerName || 'راكب توصيلة'}
              </p>
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                <p className="text-slate-300">
                  🟢 من: <span className="text-white font-bold">{incomingRequest.pickupName}</span>
                </p>
                <p className="text-slate-300">
                  🔴 إلى: <span className="text-white font-bold">{incomingRequest.dropoffName}</span>
                </p>
              </div>
            </div>

            {/* أزرار القبول والرفض - مسافات أمان >= 12px */}
            <div className="flex flex-col gap-3 pt-1">
              {/* زر القبول العريض الفاخر (56px) */}
              <button
                type="button"
                onClick={handleAcceptRide}
                className="w-full min-h-[56px] h-14 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-slate-950 font-black text-lg flex items-center justify-center gap-2 shadow-xl shadow-amber-500/30 active:scale-[0.98] transition hover:brightness-105 cursor-pointer font-cairo"
              >
                <span>🚖</span>
                <span>{`قبول المشوار 🚖 (${Number(incomingRequest.fare || 0).toLocaleString()} د.ع)`}</span>
              </button>

              {/* زر الرفض والتجاهل (48px) */}
              <button
                type="button"
                onClick={handleRejectRide}
                className="w-full min-h-[48px] h-12 rounded-2xl bg-[#242A37] text-slate-400 hover:text-white border border-slate-700/60 font-bold text-sm flex items-center justify-center gap-1.5 active:scale-95 transition cursor-pointer"
              >
                <span>رفض وتجاهل ✕</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
