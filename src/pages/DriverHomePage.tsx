import { useEffect, useState, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { http } from '../lib/api';
import { authStore } from '../lib/auth';
import { storage } from '../lib/storage';
import { useToast } from '../components/Toast';
import { Map as MapGL, Marker, type MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import mapboxgl from 'mapbox-gl';
import { config } from '../lib/config';
import { RouteLines, PickupPin, NearestDriverPin, SurroundingDriverPin, DestinationFlagPin } from '../components/map/MapPins';
import { useNavigate } from 'react-router-dom';
import { applyMapEnhancements } from '../lib/mapbox';
import { playIncomingTripAlert } from '../lib/sound';
import { useTheme } from '../context/ThemeContext';
import { ThemeToggleButton } from '../components/ThemeToggleButton';
import { IncomingTripDispatchSheet, type IncomingRideRequest } from '../components/IncomingTripDispatchSheet';

const ChatModal = lazy(() => import('../components/ChatModal'));

interface Subscriber {
  id: string;
  customerId?: string;
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

export default function DriverHomePage() {
  const navigate = useNavigate();
  const { show: originalShow } = useToast();
  const show = useCallback((msg: string, type?: 'success' | 'error' | 'info' | 'warning', duration?: number) => {
    if (!msg || typeof msg !== 'string') return;
    const trimmed = msg.trim();
    if (trimmed.includes('الطلب غير موجود') || trimmed.includes('المشوار غير موجود') || trimmed.includes('الرحلة غير موجودة')) {
      console.warn('[DriverUI Filtered Toast]:', trimmed);
      return;
    }
    originalShow(msg, type, duration);
  }, [originalShow]);

  const { mapStyle, isDark } = useTheme();

  // تحديث تباين الشوارع والتسميات عند تبديل الثيم للكابتن
  useEffect(() => {
    if (mapRef.current) {
      try {
        const rawMap = mapRef.current.getMap();
        if (rawMap) {
          applyMapEnhancements(rawMap, isDark);
        }
      } catch {}
    }
  }, [isDark]);

  const session = authStore.getSession();
  const rawDriverId = session?.userId || storage.getUserId() || '';
  const driverId = rawDriverId;

  const [driverName, setDriverName] = useState<string>(() => session?.fullName || storage.getFullName() || 'الكابتن');
  const rawPhone = storage.getPhone() || '';

  // مزامنة الملف الشخصي للسائق فورياً عند فتح الشاشة لضمان ظهور تعديلات الداش بورد
  useEffect(() => {
    http.get<any>('/auth/me').then(({ data }) => {
      const freshName = data?.user?.fullName || data?.user?.name || data?.driver?.name;
      if (freshName && freshName !== driverName) {
        setDriverName(freshName);
        localStorage.setItem('user_fullname', freshName);
        const cur = authStore.getSession();
        if (cur) {
          authStore.save({ ...cur, fullName: freshName }, rawPhone);
        }
      }
    }).catch(() => {});
  }, [driverName, rawPhone]);
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
        workMode: modeKey,
        work_mode: modeKey,
        workStatus: modeKey === 'commute' ? 'permanent' : modeKey,
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
  const acceptedRideIdRef = useRef<string | null>(null);

  // حالة مسار الخط الدائم للكابتن (من ➔ إلى)
  const [fixedStartName, setFixedStartName] = useState<string>('');
  const [fixedStartPoint, setFixedStartPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [fixedDestName, setFixedDestName] = useState<string>('');
  const [fixedDestPoint, setFixedDestPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [fixedRouteName, setFixedRouteName] = useState<string>('');
  const [isRouteLocked, setIsRouteLocked] = useState<boolean>(false);

  // قائمة الطلبات المعلقة الفورية وحالة المشوار النشط الحقيقي
  const [pendingRequests, setPendingRequests] = useState<IncomingRideRequest[]>([]);
  const [activeRide, setActiveRide] = useState<any | null>(null);
  const activeTrip = activeRide;

  // دالة موحدة لفحص الحالات النشطة التي تمنع استقبال طلب جديد
  const isRideActiveStatus = useCallback((status?: string | null) => {
    if (!status) return false;
    const s = String(status).toLowerCase().trim();
    return [
      'accepted', 'driver_arrived', 'arrived', 'ontheway', 'on_the_way',
      'started', 'in_trip', 'inprogress', 'in_progress',
      'arrived_destination', 'waiting_at_destination', 'captain_waiting_at_destination',
      'in_trip_return', 'arrived_return'
    ].includes(s);
  }, []);

  // منع استقبال أي طلب جديد إذا كان هناك مشوار نشط أو في وضع الانتظار
  const hasRealActiveTrip = Boolean(
    activeTrip &&
    activeTrip.status &&
    isRideActiveStatus(activeTrip.status)
  );
  const shouldShowDispatchSheet = Boolean(pendingRequests && pendingRequests.length > 0 && !hasRealActiveTrip);
  const incomingRequest = shouldShowDispatchSheet ? pendingRequests[0] : null;

  // معرف السائق الحالي وحالة الاستعلام الحي
  const currentTargetId = driverId || session?.userId || storage.getUserId() || rawPhone || storage.getPhone() || '';
  const [pollStatus, setPollStatus] = useState<'connected' | 'polling' | 'idle' | 'error'>('idle');

  const [isTriggeringHorn, setIsTriggeringHorn] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [latestPassengerMsg, setLatestPassengerMsg] = useState<{
    id: string;
    text: string;
    createdAt?: string;
  } | null>(null);
  const lastSeenMsgIdRef = useRef<string | null>(null);
  const lastIncomingIdRef = useRef<string | null>(null);

  // حالات إجراءات دورة الرحلة والملاحة الخارجية ومعدل تحديث الموقع
  const [isActionInFlight, setIsActionInFlight] = useState(false);
  const [proximityError, setProximityError] = useState<string | null>(null);
  const [waitElapsedSeconds, setWaitElapsedSeconds] = useState(0);
  const isExternalNavActiveRef = useRef<boolean>(false);
  const lastEventIdRef = useRef<string>('');
  const processedEventIdsRef = useRef<Set<string>>(new Set());

  // محدد معدل تحديث موقع الكابتن (الحد الأقصى 30 طلب لكل 30 ثانية)
  const lastLocationSentTimeRef = useRef<number>(0);
  const isSendingLocationRef = useRef<boolean>(false);
  const backoffUntilRef = useRef<number>(0);

  // إرسال تحديث حالة ونمط العمل إلى الخادم فور تحميل الصفحة لأول مرة
  useEffect(() => {
    sendDriverStatusUpdate(workStatus);
  }, [sendDriverStatusUpdate, workStatus]);

  // نافذة ملخص الأجرة وتحصيل الكاش
  const [isFareModalOpen, setIsFareModalOpen] = useState(false);
  const [finalFareAmount, setFinalFareAmount] = useState<string>('3,500');
  const [receivedFareInput, setReceivedFareInput] = useState<string>('3500');

  // نافذة الملاحة الخارجية
  const [isNavModalOpen, setIsNavModalOpen] = useState(false);
  const [navCoordinates, setNavCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [navTargetName, setNavTargetName] = useState<string>('');
  const [navType, setNavType] = useState<'pickup' | 'dropoff'>('pickup');

  // نافذة الإلغاء لمشتركي الخط الدائمي والرحلات الفورية
  const [cancellingSub, setCancellingSub] = useState<Subscriber | null>(null);
  const [driverApprovalReason, setDriverApprovalReason] = useState('تم التراضي مع الراكب');
  const [isSubmittingCancellation, setIsSubmittingCancellation] = useState(false);
  const [isDriverCancelOpen, setIsDriverCancelOpen] = useState(false);
  const [driverCancelReason, setDriverCancelReason] = useState<string | null>(null);
  const [driverCustomCancelText, setDriverCustomCancelText] = useState('');
  const driverReasonsList = [
    'تعطل المركبة أو حادث مفاجئ',
    'ازدحام مروري خانق / الطريق مغلق',
    'تعذر التواصل مع الراكب / لم يحضر',
    'نقطة الانطلاق في موقع يتعذر الوصول إليه',
    'سبب آخر'
  ];

  // نافذة الطوارئ SOS
  const [showSosAlert, setShowSosAlert] = useState(false);

  // نافذة الحساب الشخصي وطبقات الخريطة والدرج السفلي (screen_3.png)
  const [showLayersModal, setShowLayersModal] = useState(false);
  const [selectedMapStyle, setSelectedMapStyle] = useState<string | null>(null);
  const [isBottomDockExpanded, setIsBottomDockExpanded] = useState(false);
  const driverAvatar = storage.getAvatar() || null;

  function handleRecenterOrHome() {
    handleRecenterDriverMap();
  }

  // الخريطة والموقع
  const mapRef = useRef<MapRef | null>(null);
  const [driverLoc, setDriverLoc] = useState<{ lat: number; lng: number }>({ lat: 32.0298, lng: 44.3285 });
  const [isLocating, setIsLocating] = useState(false);
  const [driverRouteCoordinates, setDriverRouteCoordinates] = useState<[number, number][] | null>(null);

  // 1. حصر دورة حياة الماركر داخل useRef الحتمي ومنع الحذف التلقائي
  const pendingMarkersMap = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const pendingMarkersRef = pendingMarkersMap;

  useEffect(() => {
    const rawMap = (mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current) as mapboxgl.Map | undefined;
    if (!rawMap) return;
    const markers = pendingMarkersMap.current;
    const incomingIds = new Set(pendingRequests.map((r) => String(r.id || (r as any).rideId)));

    // 1. إزالة الماركرات التي ألغيت صراحة فقط
    markers.forEach((marker, id) => {
      if (!incomingIds.has(id)) {
        marker.remove();
        markers.delete(id);
      }
    });

    // 2. إنشاء الماركر للطلب الجديد فقط إن لم يكن موجوداً مسبقاً
    pendingRequests.forEach((req) => {
      const id = String(req.id || (req as any).rideId);
      const pLat = Number(
        req.pickupLat ||
          (req.pickupLocation && typeof req.pickupLocation === 'object' ? req.pickupLocation.lat : 0)
      );
      const pLon = Number(
        req.pickupLon ||
          req.pickupLng ||
          (req.pickupLocation && typeof req.pickupLocation === 'object' ? req.pickupLocation.lon : 0)
      );

      if (!markers.has(id) && pLat && pLon) {
        const el = document.createElement('div');
        el.className = 'pending-ride-marker-wrapper cursor-pointer select-none';
        const tierBadge = req.tier === 'vip' ? '👑 VIP' : req.tier === 'women' ? '🌸 نسائي' : '🚖 تكسي';
        const fareFormatted = Number(req.fare || req.price || 3500).toLocaleString();

        el.innerHTML = `
          <div class="flex flex-col items-center">
            <div class="bg-[#161c28]/95 border-2 border-amber-400 text-amber-400 text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-xl whitespace-nowrap flex items-center gap-1 mb-1 animate-bounce">
              <span>${tierBadge}</span>
              <span>•</span>
              <span>${fareFormatted} د.ع</span>
            </div>
            <div class="relative flex items-center justify-center cursor-pointer">
              <span class="absolute w-12 h-12 rounded-full bg-red-500/30 animate-ping"></span>
              <div class="w-10 h-10 rounded-full bg-red-600 border-2 border-white shadow-xl flex items-center justify-center text-white">
                <span class="material-symbols-outlined text-xl">priority_high</span>
              </div>
            </div>
          </div>
        `;

        el.onclick = () => {
          if (req.routeCoordinates && req.routeCoordinates.length > 0) {
            setDriverRouteCoordinates(req.routeCoordinates);
          }
        };

        try {
          const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat([pLon, pLat])
            .addTo(rawMap);

          markers.set(id, marker);
        } catch (err) {
          console.warn('[Mapbox] Could not add pending marker:', err);
        }
      }
    });
  }, [pendingRequests]);

  // تنظيف كافة الدبابيس المعلقة عند الخروج
  useEffect(() => {
    return () => {
      pendingMarkersMap.current.forEach((marker) => marker.remove());
      pendingMarkersMap.current.clear();
    };
  }, []);

  // خطوط الإرشاد المنقطة بين الكابتن والركاب المعلقين (Memoized لمنع وميض الخريطة)
  const pendingGuideLines = useMemo(() => {
    return pendingRequests.map((req) => {
      const pLat = Number(
        req.pickupLat ||
          (req.pickupLocation && typeof req.pickupLocation === 'object' ? req.pickupLocation.lat : 0) ||
          driverLoc.lat + 0.004
      );
      const pLng = Number(
        req.pickupLon ||
          req.pickupLng ||
          (req.pickupLocation && typeof req.pickupLocation === 'object' ? req.pickupLocation.lon : 0) ||
          driverLoc.lng + 0.003
      );
      return {
        id: `guide-line-${req.id || req.rideId}`,
        coordinates: [
          [driverLoc.lng, driverLoc.lat],
          [pLng, pLat],
        ] as [number, number][],
        color: '#f59e0b',
        casingColor: '#f59e0b',
        width: 2.5,
        dashed: true,
      };
    });
  }, [pendingRequests, driverLoc.lat, driverLoc.lng]);

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
          customerId: s.customerId || s.customer_id || (s.id && String(s.id).startsWith('bk-assign-') ? String(s.id).replace('bk-assign-', '') : undefined),
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
          setIsBottomDockExpanded(true);
          const newest = pendingMapped[0];
          const newestId = newest.id || newest.bookingId || '';
          if (newestId && newestId !== lastNotifiedSeatBookingIdRef.current) {
            lastNotifiedSeatBookingIdRef.current = newestId;
            try {
              playIncomingTripAlert();
              if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate([200, 100, 200, 100, 300]);
              }
            } catch (err) {
              console.warn('تعذر تشغيل الصوت أو الاهتزاز تلقائياً:', err);
            }
            show(`💺 طلب حجز مقعد جديد من: ${newest.customerName} (${newest.pickupLocation} ➔ ${newest.dropoffLocation})`, 'info', 9000);
          }
        }
      }
    } catch (_) {}
  }, [driverId, rawPhone, show]);

  useEffect(() => {
    void fetchSubscribers();
    const interval = setInterval(fetchSubscribers, 25000);
    return () => clearInterval(interval);
  }, [fetchSubscribers]);

  // جلب مسار الخط الدائم المثبت للكابتن
  const fetchFixedRoute = useCallback(async () => {
    if (!currentTargetId) return;
    try {
      const { data } = await http.get<any>('/driver/fixed-location');
      if (data?.success && data?.fixed_lat && data?.fixed_lng) {
        setFixedStartPoint({ lat: data.fixed_lat, lng: data.fixed_lng });
        setFixedStartName(data.fixed_label || 'نقطة الانطلاق');
        if (data.fixed_dest_lat && data.fixed_dest_lng) {
          setFixedDestPoint({ lat: data.fixed_dest_lat, lng: data.fixed_dest_lng });
          setFixedDestName(data.fixed_dest_label || 'الوجهة');
        }
        setFixedRouteName(data.route_name || '');
        setIsRouteLocked(Boolean(data.route_locked));
      } else {
        setIsRouteLocked(false);
      }
    } catch (_) {}
  }, [currentTargetId]);

  useEffect(() => {
    if (workStatus === 'permanent' || workStatus === 'both') {
      void fetchFixedRoute();
    }
  }, [workStatus, fetchFixedRoute]);

  // التحقق المستمر من وجود مشوار نشط للكابتن
  useEffect(() => {
    if (!driverId) return;

    const checkActive = async () => {
      if (document.hidden) return;
      try {
        const targetId = driverId || rawPhone;
        if (!targetId || targetId === 'undefined' || targetId === 'null') return;
        const { data: activeData } = await http.get<{ success?: boolean; activeRide?: any }>(
          `/driver/${encodeURIComponent(targetId)}/active-ride`
        );
        if (activeData?.success && activeData.activeRide) {
          const r = activeData.activeRide;
          r.pickupName = r.pickupName || r.pickupAddress || r.pickup_title || 'موقعي الحالي عبر الـ GPS';
          r.pickupAddress = r.pickupAddress || r.pickupName || r.pickup_title || 'موقعي الحالي عبر الـ GPS';
          r.dropoffName = r.dropoffName || r.dropoffAddress || r.dropoff_title || r.destination || r.destinationAddress || 'الوجهة المحددة';
          r.dropoffAddress = r.dropoffAddress || r.dropoffName || r.dropoff_title || r.destination || r.destinationAddress || 'الوجهة المحددة';
          setActiveRide(r);
          // Don't override workStatus — driver may be in 'both' mode
        } else {
          // CRITICAL: Never nullify an ongoing trip due to a transient poll response!
          setActiveRide((prev: any) => {
            if (!prev) return null;
            const isOngoing = ['accepted', 'arrived', 'in_progress', 'started', 'ontheway', 'Accepted', 'Arrived', 'InProgress', 'Started', 'OnTheWay'].includes(prev.status);
            return isOngoing ? prev : null;
          });
        }
      } catch (_) {}
    };

    void checkActive();
    const interval = setInterval(checkActive, 20000);
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

  // تتبع موقع السائق المرجعي لمنع إعادة بناء قنوات SSE عند تحرك المركبة
  const driverLocRef = useRef(driverLoc);
  useEffect(() => {
    driverLocRef.current = driverLoc;
  }, [driverLoc]);

  // 2. منع تحديث الـ State إذا كانت البيانات مطابقة (Deep ID Reconciliation)
  const updatePendingRequestsSafely = useCallback((incomingRides: IncomingRideRequest[]) => {
    // تصفية أي طلب قديم انتهت مهلته فعلياً (remainingSeconds <= 0) بهدوء
    const validRides = (incomingRides || []).filter((r) => {
      if (typeof r.remainingSeconds === 'number' && r.remainingSeconds <= 0) {
        return false;
      }
      return true;
    });

    setPendingRequests((prev) => {
      // إذا كان عدد الرحلات متطابقاً والمعرفات والحالات متطابقة، لا نحدث المرجع
      if (prev.length === validRides.length) {
        const isSame = prev.every((p, idx) => {
          const inc = validRides[idx];
          return (
            inc &&
            String(p.id || (p as any).rideId) === String(inc.id || (inc as any).rideId) &&
            p.status === inc.status
          );
        });
        if (isSame) return prev; // إرجاع نفس المرجع القديم لمنع Re-render
      }
      return validRides;
    });
  }, []);

  // 5. الاستجابة اللحظية لإلغاء الراكب عبر الـ SSE
  const handleRideCancelled = useCallback(
    (cancelledRideId: string) => {
      if (!cancelledRideId) return;
      // 1. حذف الماركر من الخريطة فورياً
      if (pendingMarkersMap.current.has(cancelledRideId)) {
        pendingMarkersMap.current.get(cancelledRideId)?.remove();
        pendingMarkersMap.current.delete(cancelledRideId);
      }
      // 2. مسحه من مصفوفة الطلبات
      setPendingRequests((prev) => prev.filter((r) => String(r.id || (r as any).rideId) !== cancelledRideId));
      // 3. إشعار
      show('قام الراكب بإلغاء طلب المشوار ✕', 'info');
    },
    [show]
  );

  // معالجة الرابط العميق من إشعار تيليجرام (?ride=<id>)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const urlParams = new URLSearchParams(window.location.search);
    const deepRideId = urlParams.get('ride') || urlParams.get('rideId');
    if (!deepRideId || !currentTargetId) return;

    let isMounted = true;
    (async () => {
      try {
        const { data: res } = await http.get<any>(`/ride/${encodeURIComponent(deepRideId)}`);
        if (!isMounted) return;

        if (res?.notFound || !res?.ride) {
          show('الطلب لم يعد متاحاً أو تم قبوله من كابتن آخر ⚠️', 'info', 5000);
          window.history.replaceState({}, '', window.location.pathname);
          return;
        }

        const r = res.ride;
        const rStatus = String(r.status || '').toLowerCase();
        
        // إذا كان المشوار مقبولاً بالفعل للكابتن الحالي
        if (r.assignedDriverId === currentTargetId || r.acceptedDriverId === currentTargetId) {
          setActiveRide(r);
          window.history.replaceState({}, '', window.location.pathname);
          return;
        }

        // إذا كان المشوار ما زال قيد الانتظار والكابتن مرشح له
        if (rStatus === 'pending' || rStatus === 'requested' || rStatus === 'offered') {
          updatePendingRequestsSafely([r]);
          try {
            playIncomingTripAlert();
          } catch (_) {}
          show('تم فتح تفاصيل الطلب الوارد 🚖', 'success', 3000);
        } else {
          show('الطلب لم يعد متاحاً أو تم قبوله مسبقاً ⚠️', 'info', 5000);
          window.history.replaceState({}, '', window.location.pathname);
        }
      } catch (err: any) {
        if (!isMounted) return;
        if (err?.response?.status === 403) {
          show('غير مصرح: هذا الطلب غير موجه لك أو انتهت مهلته ⚠️', 'warning', 5000);
        } else {
          show('الطلب لم يعد متاحاً ⚠️', 'info', 4000);
        }
        window.history.replaceState({}, '', window.location.pathname);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [currentTargetId, updatePendingRequestsSafely, show]);

  // 1. كتم الاقتراع الاحتياطي طالما أن قناة الـ SSE متصلة (Mute Polling on Active SSE)
  useEffect(() => {
    if (!currentTargetId) {
      setPendingRequests([]);
      setPollStatus('idle');
      return;
    }
    // استطلاع الطلبات فقط عندما يكون الكابتن في وضع التكسي أو كلاهما
    if (workStatus !== 'taxi' && workStatus !== 'both') {
      setPendingRequests([]);
      setPollStatus('idle');
      return;
    }

    const sseConnectedRef = { current: false };
    const lastSseDisconnectTimeRef = { current: 0 };
    let es: EventSource | null = null;

    // إرسال موقع السائق بشكل مخنوق وصارم (محدد بمعدل أقصى طلب واحد كل 3 ثوانٍ لمنع تجاوز حد 30/30s)
    const sendLocation = () => {
      const curLoc = driverLocRef.current;
      if (!curLoc || !currentTargetId) return;
      const now = Date.now();
      if (now < backoffUntilRef.current) return;
      if (now - lastLocationSentTimeRef.current < 2500) return;
      if (isSendingLocationRef.current) return;

      isSendingLocationRef.current = true;
      lastLocationSentTimeRef.current = now;

      http
        .post('/driver/location', {
          driverId: currentTargetId,
          latitude: curLoc.lat,
          longitude: curLoc.lng,
          heading: 0,
          tripStatus: 'Online',
          workStatus: workStatus,
        })
        .then(() => {
          backoffUntilRef.current = 0;
        })
        .catch((err: any) => {
          if (err?.response?.status === 429) {
            backoffUntilRef.current = Date.now() + 5000;
            console.warn('[DriverLocation] Rate limited (429), backing off 5s');
          }
        })
        .finally(() => {
          isSendingLocationRef.current = false;
        });
    };

    const fetchPending = async () => {
      // كتم الاقتراع الاحتياطي تماماً إذا كانت قناة SSE في حالة اتصال نشط
      if (es && es.readyState === 1 && sseConnectedRef.current) {
        return;
      }
      // إذا انقطعت القناة لأقل من 5 ثوانٍ، لا نقترع لمنع تضارب الـ Round-Robin
      if (Date.now() - lastSseDisconnectTimeRef.current < 5000 && lastSseDisconnectTimeRef.current > 0) {
        return;
      }

      try {
        const { data: resData } = await http.get<any>(
          `/driver/${encodeURIComponent(currentTargetId)}/pending-requests`
        );
        const incoming = resData?.pendingRequests || resData?.requests || resData?.data || (Array.isArray(resData) ? resData : []);
        updatePendingRequestsSafely(Array.isArray(incoming) ? incoming : []);
      } catch (err) {
        console.warn('[Dispatch] Polling pending requests error:', err);
        setPollStatus('error');
      }
    };

    // اتصال SSE اللحظي الفوري عبر المسار الرسمي المعياري
    try {
      if (!currentTargetId || currentTargetId === 'undefined' || currentTargetId === 'null') {
        return;
      }
      const token = storage.getToken() || localStorage.getItem('token') || '';
      const lastIdQuery = lastEventIdRef.current ? `&lastEventId=${encodeURIComponent(lastEventIdRef.current)}` : '';
      const streamUrl = `${config.apiBaseUrl}/events/driver/${encodeURIComponent(currentTargetId)}?token=${encodeURIComponent(token)}${lastIdQuery}`;
      es = new EventSource(streamUrl);

      es.onopen = () => {
        sseConnectedRef.current = true;
        setPollStatus('connected');
      };

      const handleIncomingEventId = (e: MessageEvent, data: any) => {
        const evId = e.lastEventId || data?.eventId || data?.id;
        if (evId) {
          const idStr = String(evId);
          if (processedEventIdsRef.current.has(idStr)) {
            return false;
          }
          processedEventIdsRef.current.add(idStr);
          lastEventIdRef.current = idStr;
        }
        return true;
      };

      es.addEventListener('init', (e: MessageEvent) => {
        try {
          sseConnectedRef.current = true;
          setPollStatus('connected');
          const data = JSON.parse(e.data);
          if (!handleIncomingEventId(e, data)) return;

          if (data?.pendingRequests) {
            updatePendingRequestsSafely(data.pendingRequests);
          }
          if (data?.activeRide !== undefined) {
            if (data.activeRide) {
              setActiveRide(data.activeRide);
            } else {
              setActiveRide((prev: any) => {
                if (!prev) return null;
                return isRideActiveStatus(prev.status) ? prev : null;
              });
            }
          }
        } catch (_) {}
      });

      es.addEventListener('dispatch', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          if (!handleIncomingEventId(e, data)) return;

          const evType = data.event || data.type;
          if (evType === 'ride_cancelled' || evType === 'ride_taken' || evType === 'ride_expired' || evType === 'ride_offer_expired') {
            const cancelledId = String(data.rideId || data.requestId || data.id || '');
            if (acceptedRideIdRef.current === cancelledId || (activeRide && String(activeRide.id || activeRide.rideId) === cancelledId)) {
              return; // المشوار المقبول للكابتن الحالي لا يُلغى أو يومض
            }
            if (evType === 'ride_taken' || evType === 'ride_expired' || evType === 'ride_offer_expired') {
              // تم قبول المشوار أو انتهاء مهلته: إزالة هادئة من البطاقات المعلقة دون رسالة إلغاء مربكة
              setPendingRequests((prev) => prev.filter((r) => String(r.id || (r as any).rideId) !== cancelledId));
              if (pendingMarkersRef.current.has(cancelledId)) {
                pendingMarkersRef.current.get(cancelledId)?.remove();
                pendingMarkersRef.current.delete(cancelledId);
              }
              lastIncomingIdRef.current = null;
              return;
            }
            handleRideCancelled(cancelledId);
          } else if (data?.pendingRequests) {
            updatePendingRequestsSafely(data.pendingRequests);
          }
        } catch (err) {
          console.error('[SSE:dispatch] Error handling dispatch event:', err);
        }
      });

      es.addEventListener('driver_event', (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          if (!handleIncomingEventId(e, data)) return;

          // معالجة عرض وسحب المشوار المباشر الموجه للكابتن
          const innerEv = data?.event || data;
          const evType = innerEv?.event || innerEv?.type || data?.type;
          if (evType === 'ride_offer_expired' || evType === 'ride_taken' || evType === 'ride_cancelled') {
            const expId = String(innerEv?.rideId || innerEv?.requestId || data?.rideId || data?.requestId || '');
            if (expId) {
              setPendingRequests((prev) => prev.filter((r) => String(r.id || (r as any).rideId) !== expId));
              if (pendingMarkersRef.current.has(expId)) {
                pendingMarkersRef.current.get(expId)?.remove();
                pendingMarkersRef.current.delete(expId);
              }
              lastIncomingIdRef.current = null;
            }
            return;
          }

          // أحداث حجوزات الخط الدائمي اللحظية (تحديث لحظي ومنع ازدواجية)
          if (evType === 'booking_request') {
            const rawBk = innerEv?.booking || data?.booking;
            if (rawBk && (rawBk.id || rawBk.bookingId)) {
              const bId = rawBk.id || rawBk.bookingId;
              setPendingSeatRequests((prev) => {
                if (prev.some((x) => (x.id === bId || x.bookingId === bId))) return prev;
                return [rawBk, ...prev];
              });
              setIsBottomDockExpanded(true);
              show('📢 وصلك طلب حجز مقعد جديد في الخط الدائم!', 'info');
              try { playIncomingTripAlert(); } catch (_) {}
            }
            return;
          }

          if (evType === 'booking_accepted') {
            const bId = innerEv?.bookingId || data?.bookingId;
            if (bId) {
              setPendingSeatRequests((prev) => prev.filter((x) => x.id !== bId && x.bookingId !== bId));
              void fetchSubscribers();
            }
            return;
          }

          if (evType === 'booking_declined') {
            const bId = innerEv?.bookingId || data?.bookingId;
            if (bId) {
              setPendingSeatRequests((prev) => prev.filter((x) => x.id !== bId && x.bookingId !== bId));
              void fetchSubscribers();
            }
            return;
          }

          if (evType === 'new_ride') {
            const req = innerEv?.request || innerEv?.ride || data?.request || data?.ride;
            if (req) {
              updatePendingRequestsSafely([req]);
            }
          }

          if (data?.pendingRequests && Array.isArray(data.pendingRequests)) {
            updatePendingRequestsSafely(data.pendingRequests);
          }

          if (data?.activeRide !== undefined) {
            if (data.activeRide) {
              setActiveRide(data.activeRide);
            } else {
              setActiveRide((prev: any) => {
                if (!prev) return null;
                return isRideActiveStatus(prev.status) ? prev : null;
              });
            }
          }
        } catch (err) {
          console.error('[SSE:driver_event] Error:', err);
        }
      });

      es.onerror = () => {
        sseConnectedRef.current = false;
        lastSseDisconnectTimeRef.current = Date.now();
      };
    } catch (sseErr) {
      console.warn('[SSE] EventSource init error, fallback will handle polling:', sseErr);
      sseConnectedRef.current = false;
      lastSseDisconnectTimeRef.current = Date.now();
    }

    // استعلام احتياطي دوري كل 5 ثوانٍ (يكتم نفسه فورياً ولا يرسل أي طلب HTTP طالما أن SSE متصل)
    const pollInterval = setInterval(fetchPending, 5000);
    // إرسال موقع مخنوق بفاصل 3 ثوانٍ (مع مراعاة حد 30 طلب / 30 ثانية الصارم)
    const locInterval = setInterval(sendLocation, 3000);
    sendLocation();

    return () => {
      clearInterval(pollInterval);
      clearInterval(locInterval);
      if (es) {
        es.close();
      }
    };
  }, [currentTargetId, workStatus, updatePendingRequestsSafely, handleRideCancelled, isRideActiveStatus]);

  // قبول الطلب حقيقياً
  async function handleAcceptRide() {
    if (!incomingRequest) return;
    const currentId = currentTargetId;
    if (!currentId) return;
    const acceptedReq = incomingRequest;
    try {
      const { data } = await http.post<{ success: boolean; request?: any; message?: string; alreadyAccepted?: boolean; notFound?: boolean }>('/ride/respond', {
        requestId: acceptedReq.id,
        driverId: currentId,
        action: 'accept',
      });
      if (data?.success) {
        show('تم قبول المشوار بنجاح! 🚖 توجه إلى موقع الراكب', 'success');
        const reqObj = data.request || (data as any).ride || acceptedReq;
        reqObj.status = 'accepted';
        reqObj.pickupName = reqObj.pickupName || reqObj.pickupAddress || reqObj.pickup_title || 'موقع الراكب';
        reqObj.dropoffName = reqObj.dropoffName || reqObj.dropoffAddress || reqObj.dropoff_title || reqObj.destination || reqObj.destinationAddress || 'وجهة الراكب';
        const accId = String(acceptedReq.id || (acceptedReq as any).rideId || reqObj.id);
        acceptedRideIdRef.current = accId;
        setActiveRide(reqObj);
        setPendingRequests((prev) => prev.filter((r) => String(r.id || (r as any).rideId) !== accId));
        if (pendingMarkersRef.current.has(accId)) {
          pendingMarkersRef.current.get(accId)?.remove();
          pendingMarkersRef.current.delete(accId);
        }
        lastIncomingIdRef.current = null;
      } else if (data?.alreadyAccepted || data?.notFound) {
        show('المشوار تم قبوله من كابتن آخر أو تم إلغاؤه', 'info');
        const accId = String(acceptedReq.id || (acceptedReq as any).rideId);
        setPendingRequests((prev) => prev.filter((r) => String(r.id || (r as any).rideId) !== accId));
        if (pendingMarkersRef.current.has(accId)) {
          pendingMarkersRef.current.get(accId)?.remove();
          pendingMarkersRef.current.delete(accId);
        }
        lastIncomingIdRef.current = null;
      } else {
        show('تعذر قبول الطلب في الوقت الحالي', 'info');
      }
    } catch (err: any) {
      const errData = err?.response?.data;
      const errMsg = errData?.error || '';
      const isConflictOrExpired = err?.response?.status === 409 || errData?.conflict || errData?.alreadyAccepted || errData?.expired || errMsg.includes('تعارض حالات') || errMsg.includes('انتهت مهلة') || errMsg.includes('تم قبوله');

      if (isConflictOrExpired) {
        show('عذراً، انتهت مهلة هذا المشوار أو تم قبوله من كابتن آخر', 'info');
      } else if (errMsg && !errMsg.includes('غير موجود')) {
        show(errMsg, 'error');
      }

      const accId = String(acceptedReq.id || (acceptedReq as any).rideId);
      setPendingRequests((prev) => prev.filter((r) => String(r.id || (r as any).rideId) !== accId));
      if (pendingMarkersRef.current.has(accId)) {
        pendingMarkersRef.current.get(accId)?.remove();
        pendingMarkersRef.current.delete(accId);
      }
      lastIncomingIdRef.current = null;
    }
  }

  // رفض الطلب حقيقياً
  async function handleRejectRide() {
    if (!incomingRequest) return;
    const currentId = currentTargetId;
    const rejectedId = String(incomingRequest.id || (incomingRequest as any).rideId);
    try {
      await http.post('/ride/respond', {
        requestId: rejectedId,
        driverId: currentId,
        action: 'reject',
      });
    } catch (_) {}
    setPendingRequests((prev) => prev.filter((r) => String(r.id || (r as any).rideId) !== rejectedId));
    if (pendingMarkersRef.current.has(rejectedId)) {
      pendingMarkersRef.current.get(rejectedId)?.remove();
      pendingMarkersRef.current.delete(rejectedId);
    }
    lastIncomingIdRef.current = null;
    show('تم رفض الطلب', 'info');
  }

  // قبول حجز مقعد في الخط الدائمي (مسار الدفعة 3 مع معالجة 409 ودية)
  async function handleAcceptSeatBooking(bookingId: string) {
    if (!bookingId) return;
    try {
      const { data } = await http.post<{ success: boolean; message?: string }>(
        `/driver/bookings/${bookingId}/accept`,
        { driverId: currentTargetId }
      );
      if (data?.success) {
        show('تم قبول حجز المقعد بنجاح! ✅ أصبح الراكب ضمن ركاب خطك الدائمي', 'success');
        setPendingSeatRequests((prev) => prev.filter((b) => b.id !== bookingId && b.bookingId !== bookingId));
        void fetchSubscribers();
      } else {
        show('تعذر قبول الحجز', 'error');
      }
    } catch (err: any) {
      if (err?.response?.status === 409) {
        show(err?.response?.data?.error || 'طلب الحجز تم التعامل معه مسبقاً', 'info');
        setPendingSeatRequests((prev) => prev.filter((b) => b.id !== bookingId && b.bookingId !== bookingId));
        void fetchSubscribers();
      } else {
        show(err?.response?.data?.error || 'حدث خطأ في قبول الحجز', 'error');
      }
    }
  }

  // رفض حجز مقعد في الخط الدائمي (مسار الدفعة 3 مع معالجة 409 ودية)
  async function handleRejectSeatBooking(bookingId: string) {
    if (!bookingId) return;
    try {
      const { data } = await http.post<{ success: boolean; message?: string }>(
        `/driver/bookings/${bookingId}/reject`,
        { driverId: currentTargetId, reason: 'اعتذار الكابتن عن قبول الحجز' }
      );
      if (data?.success) {
        show('تم رفض طلب الحجز', 'info');
        setPendingSeatRequests((prev) => prev.filter((b) => b.id !== bookingId && b.bookingId !== bookingId));
      } else {
        show('تعذر رفض الحجز', 'error');
      }
    } catch (err: any) {
      if (err?.response?.status === 409) {
        show(err?.response?.data?.error || 'طلب الحجز تمت معالجته مسبقاً', 'info');
        setPendingSeatRequests((prev) => prev.filter((b) => b.id !== bookingId && b.bookingId !== bookingId));
        void fetchSubscribers();
      } else {
        show(err?.response?.data?.error || 'حدث خطأ في رفض الحجز', 'error');
      }
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

  // إلغاء رحلة التكسي الفورية المعتمدة من طرف الكابتن
  async function handleConfirmDriverCancel() {
    if (!driverCancelReason || !activeRide) return;
    if (driverCancelReason === 'سبب آخر' && (!driverCustomCancelText.trim() || driverCustomCancelText.trim().length < 3)) {
      show('يرجى توضيح سبب الإلغاء الآخر (3 أحرف على الأقل)', 'warning');
      return;
    }
    setIsSubmittingCancellation(true);
    try {
      const { data } = await http.post<{ success: boolean; message?: string }>('/ride/cancel', {
        requestId: activeRide.id,
        rideId: activeRide.id,
        driverId: currentTargetId,
        cancelledBy: 'driver',
        reason: driverCancelReason,
        customDetails: driverCustomCancelText.trim(),
      });
      if (data?.success) {
        show('تم إلغاء الرحلة بنجاح والبحث عن كابتن بديل للراكب', 'info');
        setActiveRide(null);
        setIsDriverCancelOpen(false);
        setDriverCancelReason(null);
        setDriverCustomCancelText('');
        localStorage.removeItem('TAWSEELA_ACTIVE_DRIVER_RIDE');
      } else {
        show(data?.message || 'تعذر إلغاء الرحلة', 'error');
      }
    } catch (err: any) {
      show(err?.response?.data?.error || 'حدث خطأ أثناء إلغاء الرحلة', 'error');
    } finally {
      setIsSubmittingCancellation(false);
    }
  }

  // إلغاء اشتراك راكب من طرف الكابتن (force cancel)
  async function handleDriverCancelSubscriber(sub: Subscriber) {
    if (!sub || !sub.id) return;
    if (!window.confirm(`هل أنت متأكد من إلغاء اشتراك ${sub.name}؟ سيتم تحرير مقعده فوراً.`)) return;
    setIsSubmittingCancellation(true);
    try {
      const { data } = await http.post<{ success: boolean; message?: string }>('/driver/cancel-subscriber', {
        bookingId: sub.id,
        customerId: sub.customerId,
        customerPhone: sub.phone,
        driverId: driverId || rawPhone,
        reason: 'إلغاء من الكابتن',
      });
      if (data?.success) {
        show(data.message || 'تم إلغاء اشتراك الراكب بنجاح وتحرير مقعده ✅', 'success');
        setSubscribers((prev) => prev.filter((s) => s.id !== sub.id && (!sub.customerId || s.customerId !== sub.customerId)));
        void fetchSubscribers();
      } else {
        show(data?.message || 'تعذر إلغاء الاشتراك', 'error');
        void fetchSubscribers();
      }
    } catch (err: any) {
      show(err?.response?.data?.error || 'حدث خطأ أثناء إلغاء الاشتراك', 'error');
      void fetchSubscribers();
    } finally {
      setIsSubmittingCancellation(false);
    }
  }

  // السائق وصل لنقطة انطلاق الراكب (مع فحص القرب ومعالجة 400 وزر تحديث موقعي)
  async function handleDriverArrived() {
    const currentId = driverId || rawPhone;
    if (!activeRide || !currentId || isActionInFlight) return;
    setIsActionInFlight(true);
    setProximityError(null);

    const curLoc = driverLocRef.current;
    try {
      const { data } = await http.post<{
        success: boolean;
        message?: string;
        error?: string;
        distanceMeters?: number;
        radiusMeters?: number;
      }>('/ride/arrived', {
        requestId: activeRide.id,
        driverId: currentId,
        driverPhone: rawPhone,
        latitude: curLoc?.lat,
        longitude: curLoc?.lng,
        currentLat: curLoc?.lat,
        currentLon: curLoc?.lng,
      }, {
        headers: { 'Idempotency-Key': `arrived-${activeRide.id}-${Date.now()}` }
      });

      if (data?.success) {
        show('تم إشعار الراكب بوصولك وإطلاق تنبيه الهورن بنجاح 📍🚖', 'success');
        setActiveRide((prev: any) => ({ ...prev, status: 'DRIVER_ARRIVED' }));
        setProximityError(null);
      } else {
        const errMsg = data?.error || data?.message || 'تعذر تأكيد الوصول';
        show(errMsg, 'error');
        if (errMsg.includes('نصف القطر') || errMsg.includes('بعيد') || (data?.distanceMeters && data.distanceMeters > 1000)) {
          setProximityError(`أنت بعيد عن نقطة الانطلاق (${data?.distanceMeters || 'مسافة بعيدة'}م). يرجى الاقتراب أو تحديث موقعك.`);
        }
      }
    } catch (err: any) {
      const status = err?.response?.status;
      const errData = err?.response?.data;
      const errMsg = errData?.error || errData?.message || 'تعذر تأكيد الوصول لنقطة الراكب';
      show(errMsg, 'error');
      if (status === 400 && (errMsg.includes('نصف القطر') || errMsg.includes('بعيد') || errData?.distanceMeters)) {
        setProximityError(
          `أنت بعيد عن نقطة الانطلاق (${errData?.distanceMeters ? `${Math.round(errData.distanceMeters)} متر` : 'خارج النطاق المسموح'}). يرجى الاقتراب أو تحديث موقعك.`
        );
      }
    } finally {
      setIsActionInFlight(false);
    }
  }

  // تحديث موقع الكابتن وإعادة المحاولة بعد رفض القرب
  const handleRefreshLocationAndRetryProximity = () => {
    setIsLocating(true);
    setProximityError(null);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setDriverLoc(loc);
          driverLocRef.current = loc;
          mapRef.current?.flyTo({ center: [loc.lng, loc.lat], zoom: 16, duration: 800 });
          setIsLocating(false);
          http.post('/driver/location', {
            driverId: currentTargetId,
            latitude: loc.lat,
            longitude: loc.lng,
            heading: 0,
            tripStatus: 'Online',
            workStatus: workStatus,
          }).catch(() => {});
          show('تم تحديث موقعك بنجاح 📍 يمكنك الضغط على "أنا في موقع الراكب" الآن', 'success', 3000);
        },
        () => {
          setIsLocating(false);
          show('تعذر تحديد الموقع بدقة، يرجى التأكد من تشغيل الـ GPS', 'error');
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    } else {
      setIsLocating(false);
    }
  };

  // إرسال تنبيه الهورن للراكب (بيب بيب 📢) عبر الباك إند مع تغذية حسية فورية للسائق
  async function handleTriggerHorn() {
    if (!activeRide) return;

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([120, 60, 120]);
      } catch (_) {}
    }

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
        } else {
          show(data?.message || 'تعذر إرسال تنبيه الهورن', 'error');
        }
      } catch (err2: any) {
        console.warn('فشل إرسال تنبيه الهورن:', err2);
        show(err2?.response?.data?.error || 'تعذر إرسال تنبيه الهورن', 'error');
      }
    } finally {
      setIsTriggeringHorn(false);
    }
  }

  // إرسال تنبيه تفعيل الملاحة الخارجية في الخلفية فوراً دون انتظار
  function notifyExternalNavStart(app: 'Google Maps' | 'Waze') {
    if (!activeRide) return;
    try {
      localStorage.setItem('tawseela_preferred_nav_app', app);
    } catch (_) {}

    const currentId = driverId || rawPhone;
    isExternalNavActiveRef.current = true;
    setIsNavModalOpen(false);

    http.post('/ride/external-nav/start', {
      requestId: activeRide.id,
      driverId: currentId,
      app: app === 'Waze' ? 'Waze' : 'Google Maps',
    }, {
      headers: { 'Idempotency-Key': `extnav-start-${activeRide.id}-${Date.now()}` }
    }).catch((err) => {
      console.warn('[ExternalNav] start background error:', err);
    });
  }

  function handleOpenNavModal(target?: 'pickup' | 'dropoff') {
    if (!activeRide) return;
    const mode = target || (activeRide.status === 'Accepted' || activeRide.status === 'OnTheWay' ? 'pickup' : 'dropoff');
    setNavType(mode);

    if (mode === 'pickup') {
      const pLat = activeRide.pickupLat ?? activeRide.pickup_lat ?? activeRide.pickup?.lat;
      const pLon = activeRide.pickupLon ?? activeRide.pickup_lon ?? activeRide.pickup?.lng ?? activeRide.pickup?.lon;
      const pName = activeRide.pickupName || activeRide.pickupAddress || activeRide.pickup_title || activeRide.originAddress || 'موقع الراكب';
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
      const dName = activeRide.dropoffName || activeRide.dropoffAddress || activeRide.dropoff_title || activeRide.destination || activeRide.destinationAddress || 'وجهة الراكب';
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
    if (!activeRide || !currentId || isActionInFlight) return;
    setIsActionInFlight(true);
    try {
      const { data } = await http.post<{ success: boolean; message?: string; status?: string }>('/ride/start', {
        requestId: activeRide.id,
        driverId: currentId,
        driverPhone: rawPhone,
      }, {
        headers: { 'Idempotency-Key': `start-${activeRide.id}-${Date.now()}` }
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
    } finally {
      setIsActionInFlight(false);
    }
  }

  // الوصول إلى الوجهة (المحطة الأولى أو الوجهة النهائية)
  async function handleDriverArrivedDestination() {
    const currentId = driverId || rawPhone;
    if (!activeRide || !currentId || isActionInFlight) return;
    setIsActionInFlight(true);
    try {
      const { data } = await http.post<{ success: boolean; message?: string; status?: string; waitStartedAt?: string; finalFare?: number }>('/ride/destination-arrived', {
        requestId: activeRide.id,
        driverId: currentId,
        driverPhone: rawPhone,
      }, {
        headers: { 'Idempotency-Key': `arrive-dest-${activeRide.id}-${Date.now()}` }
      });

      if (data?.success) {
        if (data.status === 'WAITING_AT_DESTINATION' || activeRide.isRoundTrip) {
          show('وصلتم إلى المحطة الأولى وبدأ وقت الانتظار ⏳', 'success', 4000);
          setActiveRide((prev: any) => ({
            ...prev,
            status: 'WAITING_AT_DESTINATION',
            waitStartedAt: data.waitStartedAt || new Date().toISOString()
          }));
        } else {
          show('وصلتم إلى الوجهة بنجاح 🏁', 'success', 3000);
          setActiveRide((prev: any) => ({ ...prev, status: 'ARRIVED_DESTINATION', finalFare: data.finalFare || prev?.fare }));
          handleInitiateCompleteRide();
        }
      } else {
        show(data?.message || 'تعذر تأكيد الوصول للوجهة', 'error');
      }
    } catch (err: any) {
      show(err?.response?.data?.error || 'حدث خطأ في تأكيد الوصول للوجهة', 'error');
    } finally {
      setIsActionInFlight(false);
    }
  }

  // بدء رحلة العودة في الرحلات الذهاب والإياب
  async function handleStartReturnTrip() {
    const currentId = driverId || rawPhone;
    if (!activeRide || !currentId || isActionInFlight) return;
    setIsActionInFlight(true);
    try {
      const { data } = await http.post<{ success: boolean; message?: string; status?: string; actualWaitMinutes?: number; waitFee?: number }>('/ride/return/start', {
        requestId: activeRide.id,
        driverId: currentId,
      }, {
        headers: { 'Idempotency-Key': `return-start-${activeRide.id}-${Date.now()}` }
      });

      if (data?.success) {
        show('تم بدء رحلة العودة بنجاح 🔄 والانطلاق إلى نقطة الانطلاق', 'success', 3000);
        setActiveRide((prev: any) => ({
          ...prev,
          status: 'IN_TRIP_RETURN',
          actualWaitMinutes: data.actualWaitMinutes || prev?.actualWaitMinutes,
          waitFee: data.waitFee || prev?.waitFee
        }));

        // توجيه الملاحة إلى نقطة العودة (موقع الانطلاق الأصلي)
        const retLat = activeRide.pickupLat ?? activeRide.pickup_lat ?? activeRide.pickup?.lat;
        const retLon = activeRide.pickupLon ?? activeRide.pickup_lon ?? activeRide.pickup?.lng;
        if (retLat && retLon) {
          setNavCoordinates({ lat: Number(retLat), lng: Number(retLon) });
          setNavTargetName(activeRide.pickupName || 'نقطة العودة');
          setIsNavModalOpen(true);
        }
      } else {
        show(data?.message || 'تعذر بدء رحلة العودة', 'error');
      }
    } catch (err: any) {
      show(err?.response?.data?.error || 'حدث خطأ أثناء بدء رحلة العودة', 'error');
    } finally {
      setIsActionInFlight(false);
    }
  }

  // الوصول إلى نقطة العودة
  async function handleArrivedReturn() {
    const currentId = driverId || rawPhone;
    if (!activeRide || !currentId || isActionInFlight) return;
    setIsActionInFlight(true);
    try {
      const { data } = await http.post<{ success: boolean; message?: string; status?: string; finalFare?: number; breakdown?: any }>('/ride/return/arrived', {
        requestId: activeRide.id,
        driverId: currentId,
      }, {
        headers: { 'Idempotency-Key': `return-arrived-${activeRide.id}-${Date.now()}` }
      });

      if (data?.success) {
        show('تم الوصول إلى نقطة العودة بسلام 🏁', 'success', 3000);
        setActiveRide((prev: any) => ({
          ...prev,
          status: 'ARRIVED_RETURN',
          finalFare: data.finalFare || prev?.finalFare,
          pricingBreakdown: data.breakdown || prev?.pricingBreakdown
        }));
        handleInitiateCompleteRide();
      } else {
        show(data?.message || 'تعذر تأكيد الوصول لنقطة العودة', 'error');
      }
    } catch (err: any) {
      show(err?.response?.data?.error || 'حدث خطأ في تأكيد الوصول لنقطة العودة', 'error');
    } finally {
      setIsActionInFlight(false);
    }
  }

  // حساب عداد الانتظار اللحظي عند التوقف في المحطة الأولى
  useEffect(() => {
    if (!activeRide?.waitStartedAt) return;
    const updateWaitCounter = () => {
      const start = new Date(activeRide.waitStartedAt).getTime();
      const diffSec = Math.max(0, Math.floor((Date.now() - start) / 1000));
      setWaitElapsedSeconds(diffSec);
    };
    updateWaitCounter();
    const interval = setInterval(updateWaitCounter, 1000);
    return () => clearInterval(interval);
  }, [activeRide?.waitStartedAt]);

  // العودة من تطبيق الملاحة الخارجي (visibilitychange & pageshow)
  useEffect(() => {
    const handleReturnFromExternalNav = async () => {
      if (document.visibilityState === 'visible' && isExternalNavActiveRef.current) {
        isExternalNavActiveRef.current = false;
        const currentId = currentTargetId;
        const activeRideId = activeRide?.id;

        // 1. إعادة جلب المشوار النشط من الخادم
        try {
          const { data: actData } = await http.get<{ success?: boolean; activeRide?: any }>(
            `/driver/${encodeURIComponent(currentId)}/active-ride`
          );
          if (actData?.success && actData.activeRide) {
            setActiveRide(actData.activeRide);
          }
        } catch (_) {}

        // 2. التقاط موقع GPS جديد وإرساله فورياً قبل أي إجراء
        if ('geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const freshLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
              setDriverLoc(freshLoc);
              driverLocRef.current = freshLoc;
              http.post('/driver/location', {
                driverId: currentId,
                latitude: freshLoc.lat,
                longitude: freshLoc.lng,
                heading: 0,
                tripStatus: 'Online',
                workStatus: workStatus,
              }).catch(() => {});
            },
            () => {},
            { enableHighAccuracy: true, timeout: 5000 }
          );
        }

        // 3. إشعار الخادم بانتهاء وضع الملاحة الخارجية
        if (activeRideId) {
          try {
            await http.post('/ride/external-nav/end', {
              requestId: activeRideId,
              driverId: currentId,
            }, {
              headers: { 'Idempotency-Key': `extnav-end-${activeRideId}-${Date.now()}` }
            });
          } catch (_) {}
        }
      }
    };

    document.addEventListener('visibilitychange', handleReturnFromExternalNav);
    window.addEventListener('pageshow', handleReturnFromExternalNav);

    return () => {
      document.removeEventListener('visibilitychange', handleReturnFromExternalNav);
      window.removeEventListener('pageshow', handleReturnFromExternalNav);
    };
  }, [currentTargetId, activeRide?.id, workStatus]);

  // فتح نافذة تحصيل الأجرة الشفافة
  function handleInitiateCompleteRide() {
    if (!activeRide) return;
    const rawFare = Number(activeRide.finalFare ?? activeRide.fare ?? activeRide.pricingBreakdown?.totalFare ?? 3500);
    const num = Math.max(3000, rawFare);
    const rounded = Math.ceil(num / 250) * 250;
    setFinalFareAmount(rounded.toLocaleString('ar-IQ'));
    setReceivedFareInput(String(rounded));
    setIsFareModalOpen(true);
  }

  // إنهاء المشوار الفعلي بعد التحصيل (استلمت الكروة)
  async function handleDriverComplete() {
    const currentId = driverId || rawPhone;
    if (!activeRide || !currentId || isActionInFlight) return;
    setIsActionInFlight(true);
    const numReceived = Number(receivedFareInput) || Number(String(finalFareAmount).replace(/[^0-9]/g, '')) || 3500;
    try {
      const { data } = await http.post<{ success: boolean; message?: string }>('/ride/complete', {
        requestId: activeRide.id,
        driverId: currentId,
        driverPhone: rawPhone,
        receivedAmount: numReceived,
      }, {
        headers: { 'Idempotency-Key': `complete-${activeRide.id}-${Date.now()}` }
      });

      if (data?.success) {
        show(`تم إنهاء المشوار بنجاح وتحصيل: ${numReceived.toLocaleString()} د.ع 💵`, 'success', 4000);
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
    } finally {
      setIsActionInFlight(false);
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
      className={`relative w-full h-[100dvh] overflow-hidden font-cairo select-none ${
        isDark ? 'bg-[#080E1A] text-[#DDE2F4]' : 'bg-[#F8FAFC] text-[#0F172A]'
      }`} 
      style={{ minHeight: '100dvh' }}
      dir="rtl"
    >
      {/* 1. خريطة تفاعلية تغطي كامل الشاشة (Midnight Executive Mapbox Canvas) */}
      <div className="absolute inset-0 w-full h-full z-0 touch-none" style={{ touchAction: 'none' }}>
        <MapGL
          ref={mapRef}
          reuseMaps
          mapboxAccessToken={config.mapboxToken}
          mapStyle={selectedMapStyle || mapStyle || 'mapbox://styles/almusawy/cmvdwkv6q003801s82f9t02om'}
          initialViewState={{ longitude: driverLoc.lng, latitude: driverLoc.lat, zoom: 15 }}
          dragPan={true}
          cooperativeGestures={false}
          onLoad={(e) => {
            applyMapEnhancements(e.target, isDark);
          }}
          style={{ width: '100%', height: '100%' }}
        >
          {/* مسار الملاحة الانسيابي الذهبي مع الهالة النيونية */}
          {driverRouteCoordinates && driverRouteCoordinates.length > 0 && (
            <RouteLines
              lines={[
                {
                  id: 'driver-route-line',
                  coordinates: driverRouteCoordinates,
                  color: '#F59E0B',
                  casingColor: '#F59E0B',
                  width: 3.0,
                },
              ]}
            />
          )}

          {/* موقع الكابتن الحالي مع الرادار الزمردي النابض */}
          <PickupPin point={driverLoc} />

          {/* دبوس أقرب كابتن مع كبسولة «٣ دقيقة» النطاطة */}
          <NearestDriverPin
            point={{ lat: driverLoc.lat + 0.0022, lng: driverLoc.lng + 0.0028 }}
            duration="٣ دقيقة"
          />

          {/* دبابيس الكباتن المحيطة باللون الذهبي الهادئ */}
          <SurroundingDriverPin point={{ lat: driverLoc.lat - 0.0025, lng: driverLoc.lng - 0.0032 }} />
          <SurroundingDriverPin point={{ lat: driverLoc.lat + 0.0031, lng: driverLoc.lng - 0.0038 }} />
          <SurroundingDriverPin point={{ lat: driverLoc.lat - 0.0018, lng: driverLoc.lng + 0.0039 }} />

          {/* راية الوجهة المعتمدة: جامعة الكوفة */}
          <DestinationFlagPin
            point={{ lat: 32.0298, lng: 44.3725 }}
            name="جامعة الكوفة"
          />

          {/* وجهة المشوار النشط إذا كان موجوداً */}
          {activeRide && (activeRide.dropoffLat || activeRide.destinationLat) && (
            <DestinationFlagPin
              point={{
                lat: Number(activeRide.dropoffLat || activeRide.destinationLat || 32.0298),
                lng: Number(activeRide.dropoffLng || activeRide.dropoffLon || activeRide.destinationLon || 44.3725),
              }}
              name={activeRide.dropoffName || activeRide.destination || 'وجهة الراكب'}
            />
          )}

          {/* خطوط مرشدة منقطة بين الكابتن والركاب المعلقين (Memoized & Diffed) */}
          {pendingGuideLines.length > 0 && (
            <RouteLines lines={pendingGuideLines} />
          )}

          {/* خط معاينة مسار الكابتن الدائم بين نقطة الانطلاق والوجهة */}
          {fixedStartPoint && fixedDestPoint && (
            <RouteLines
              lines={[
                {
                  id: 'driver-fixed-route-preview',
                  coordinates: [
                    [fixedStartPoint.lng, fixedStartPoint.lat],
                    [fixedDestPoint.lng, fixedDestPoint.lat],
                  ],
                  color: '#F59E0B',
                  casingColor: '#F59E0B',
                  width: 3.0,
                },
              ]}
            />
          )}

          {/* دبوس نقطة الانطلاق للخط الدائم */}
          {fixedStartPoint && (
            <Marker
              longitude={fixedStartPoint.lng}
              latitude={fixedStartPoint.lat}
              anchor="bottom"
            >
              <div className="flex flex-col items-center select-none">
                <div className="bg-emerald-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg border border-white/40 mb-1 flex items-center gap-1">
                  <span>📍</span>
                  <span className="truncate max-w-[120px]">{fixedStartName || 'الانطلاق'}</span>
                </div>
                <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/40 border-2 border-white">
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/>
                  </svg>
                </div>
                <div className="w-3 h-1.5 bg-black/40 rounded-full blur-[1px] mx-auto mt-0.5" />
              </div>
            </Marker>
          )}

          {/* دبوس وجهة الخط الدائم */}
          {fixedDestPoint && (
            <Marker
              longitude={fixedDestPoint.lng}
              latitude={fixedDestPoint.lat}
              anchor="bottom"
            >
              <div className="flex flex-col items-center select-none">
                <div className="bg-amber-600 text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-lg border border-white/40 mb-1 flex items-center gap-1">
                  <span>🎯</span>
                  <span className="truncate max-w-[120px]">{fixedDestName || 'الوجهة'}</span>
                </div>
                <div className="w-8 h-8 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-500/40 border-2 border-white">
                  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 0 1 0-5 2.5 2.5 0 0 1 0 5z"/>
                  </svg>
                </div>
                <div className="w-3 h-1.5 bg-black/40 rounded-full blur-[1px] mx-auto mt-0.5" />
              </div>
            </Marker>
          )}
        </MapGL>
      </div>

      {/* 2. الترويسة العلوية العائمة (Top Floating HUD Header) - مطابقة لـ code_4.html و screen_3.png */}
      <header className="fixed top-0 inset-x-0 z-40 pt-safe px-4 h-16 flex items-center justify-between pointer-events-none" dir="rtl">
        <div className="flex justify-between items-center max-w-lg mx-auto w-full">
          {/* زر الرئيسية - إعادة التمركز لموقع الكابتن */}
          <div className="pointer-events-auto">
            <button
              type="button"
              onClick={handleRecenterOrHome}
              className={`min-h-[48px] min-w-[48px] h-12 w-12 rounded-full backdrop-blur-xl flex items-center justify-center active:scale-95 transition-all shadow-lg border cursor-pointer ${
                isDark ? 'bg-[#161c28]/90 border-[#f59e0b]/40 text-[#ffc174]' : 'bg-white/95 border-amber-400 text-amber-700 shadow-md'
              }`}
              aria-label="الرئيسية"
              title="الرئيسية"
            >
              <svg className="w-6 h-6 shrink-0 fill-current" viewBox="0 0 24 24">
                <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
              </svg>
            </button>
          </div>

          {/* تبديل الثيم وزر حساب الكابتن الموحد */}
          <div className="pointer-events-auto flex items-center gap-2">
            <div className="hidden sm:block">
              <ThemeToggleButton />
            </div>

            {/* زر حساب الكابتن والقائمة الموحدة - ينقل لصفحة /driver-hub الخاصة بالسائق */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                navigate('/driver-hub');
              }}
              className={`min-h-[48px] min-w-[48px] h-12 w-12 rounded-full backdrop-blur-xl shadow-lg flex items-center justify-center active:scale-95 transition-all relative border cursor-pointer ${
                isDark ? 'bg-[#161c28]/90 border-[#534434]/40 text-[#56e5a9]' : 'bg-white/95 border-emerald-400 text-emerald-700 shadow-md'
              }`}
              aria-label="حساب الكابتن"
              title="حساب الكابتن"
            >
              {driverAvatar ? (
                <img src={driverAvatar} alt="الملف" className="w-full h-full rounded-full object-cover" />
              ) : (
                <svg className="w-6 h-6 shrink-0 fill-current" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              )}
              <span className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 ${
                isDark ? 'border-[#161c28]' : 'border-white'
              } ${isOnline ? 'bg-[#56e5a9] animate-pulse' : 'bg-slate-400'}`} />
            </button>
          </div>
        </div>
      </header>

      {/* 3. المؤشرات الجانبية العائمة على الخريطة (Floating HUD Overlays) - مفصولة رأسياً لمنع أي تداخل */}
      <div className="fixed top-[calc(68px+env(safe-area-inset-top,12px))] inset-x-0 pointer-events-none z-30 px-4 max-w-lg mx-auto w-full flex justify-between items-start" dir="rtl">
        {/* اليمين: كبسولة عدد الكباتن والوجهة */}
        <div className="flex flex-col gap-2 pointer-events-auto">
          <div className={`backdrop-blur-md border rounded-full px-3 py-1.5 shadow-md flex items-center gap-1.5 text-xs font-bold ${
            isDark ? 'bg-[#161c28]/90 border-[#56e5a9]/40 text-[#56e5a9]' : 'bg-white/95 border-emerald-400 text-emerald-700'
          }`}>
            <span className={`w-2 h-2 rounded-full ${pollStatus === 'error' ? 'bg-red-500' : 'bg-[#56e5a9]'} animate-pulse`} />
            <span>٤ كباتن متوفرين قربك الآن ⚡</span>
          </div>
          <div className={`backdrop-blur-md border rounded-full px-3 py-1 shadow-md flex items-center gap-1.5 text-[11px] font-medium ${
            isDark ? 'bg-[#242a37]/90 border-[#534434]/40 text-[#ffc174]' : 'bg-white/95 border-amber-300 text-amber-700'
          }`}>
            <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" />
            <span>جامعة الكوفة</span>
          </div>
        </div>

        {/* اليسار: أدوات التحكم بالخريطة والطوارئ */}
        <div className="flex flex-col gap-2.5 pointer-events-auto">
          <button
            type="button"
            onClick={handleRecenterOrHome}
            className={`min-h-[48px] min-w-[48px] h-12 w-12 rounded-full backdrop-blur-md shadow-lg flex items-center justify-center active:scale-90 transition-transform cursor-pointer ${
              isDark ? 'bg-[#161c28]/85 border border-white/10 text-white hover:bg-[#242a37]' : 'bg-white border border-slate-300 text-slate-800 hover:bg-slate-100 shadow-md'
            } ${isLocating ? 'animate-spin text-amber-400' : ''}`}
            title="موقعي الحالي"
            aria-label="موقعي الحالي"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setShowLayersModal(true)}
            className={`min-h-[48px] min-w-[48px] h-12 w-12 rounded-full backdrop-blur-md shadow-lg flex items-center justify-center active:scale-90 transition-transform cursor-pointer ${
              isDark ? 'bg-[#161c28]/85 border border-white/10 text-white hover:bg-[#242a37]' : 'bg-white border border-slate-300 text-slate-800 hover:bg-slate-100 shadow-md'
            }`}
            title="طبقات الخريطة"
            aria-label="طبقات الخريطة"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="m11.99 18.54-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27zM12 16l7.36-5.73L21 9.07l-9-7-9 7 1.63 1.27zm0-11.47L17.74 9 12 13.47 6.26 9z"/>
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setShowSosAlert(true)}
            className="min-h-[48px] min-w-[48px] h-12 w-12 rounded-full bg-[#93000a] border border-[#ffb4ab]/40 shadow-lg flex items-center justify-center text-[#ffdad6] active:scale-90 transition-transform animate-pulse cursor-pointer hover:bg-red-800"
            title="طوارئ SOS"
            aria-label="طوارئ SOS"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 17.9c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l1.9-1.9C9.22 18.39 10.56 19 12 19s2.78-.61 4.34-1.59l1.9 1.9c.39.39 1.02.39 1.41 0 .39-.39.39-1.02 0-1.41l-.62-1.29C20.26 15.07 21 13.12 21 11c0-4.97-4.03-9-9-9zm-1 5h2v6h-2V7zm1 10c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/>
            </svg>
          </button>
        </div>
      </div>

      {/* 4. بطاقة المشوار النشط العائمة (Floating Active Trip Control Card) */}
      {hasRealActiveTrip && activeRide && (
        <div className="fixed bottom-[108px] inset-x-0 z-35 px-4 max-w-lg mx-auto w-full pointer-events-auto" dir="rtl">
          <div className={`rounded-3xl border p-4 shadow-2xl backdrop-blur-2xl animate-fade-in space-y-3 ${isDark ? 'border-emerald-500/60 bg-[#161C28]/95 text-white' : 'border-emerald-500 bg-white text-slate-900 shadow-xl'}`}>
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
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

            <div className="text-right space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-white">
                  الراكب: {activeRide.customerName || 'راكب توصيلة'}
                </span>
                <span className="text-amber-400 text-xs font-bold">⭐ 5.0</span>
              </div>
              <div className="p-2.5 rounded-2xl bg-white/5 border border-white/10 space-y-1">
                <p className="text-slate-300">
                  🟢 من: <span className="font-bold text-white">{activeRide.pickupName || activeRide.pickupAddress || activeRide.pickup_title || activeRide.originAddress || 'موقعي الحالي عبر الـ GPS'}</span>
                </p>
                <p className="text-slate-300">
                  🔴 إلى: <span className="font-bold text-white">{activeRide.dropoffName || activeRide.dropoffAddress || activeRide.dropoff_title || activeRide.destination || activeRide.destinationAddress || 'الوجهة المحددة'}</span>
                </p>
              </div>
            </div>

            {/* أزرار الاتصال والواتساب والمراسلة والملاحة السريعة (4 أزرار متوازنة بحد أدنى 48px) */}
            <div className="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const phone = activeRide.customerPhone || activeRide.phone;
                  if (phone) window.open(`tel:${phone}`);
                  else show('رقم هاتف الراكب غير متوفر', 'info');
                }}
                className="min-h-[48px] py-2 px-1 rounded-xl bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex flex-col items-center justify-center gap-0.5 font-bold text-[11px] hover:bg-emerald-600/30 transition cursor-pointer active:scale-95"
                title="اتصال هاتفي"
              >
                <span className="text-sm">📞</span>
                <span>اتصال</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const raw = activeRide.customerPhone || activeRide.phone;
                  if (!raw) {
                    show('رقم الراكب غير متوفر لمحادثة الواتساب', 'info');
                    return;
                  }
                  const clean = String(raw).replace(/[^0-9]/g, '').replace(/^0+/, '');
                  const intlPhone = clean.startsWith('964') ? clean : `964${clean}`;
                  window.open(`https://wa.me/${intlPhone}?text=${encodeURIComponent('السلام عليكم، أنا كابتن توصيلة بخصوص رحلتك')}`, '_blank', 'noopener,noreferrer');
                }}
                className="min-h-[48px] py-2 px-1 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex flex-col items-center justify-center gap-0.5 font-bold text-[11px] hover:bg-emerald-500/25 transition cursor-pointer active:scale-95"
                title="واتساب"
              >
                <span className="text-sm">💬</span>
                <span>واتساب</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenNavModal(activeRide.status === 'Accepted' || activeRide.status === 'OnTheWay' ? 'pickup' : 'dropoff')}
                className="min-h-[48px] py-2 px-1 rounded-xl bg-sky-600/20 text-sky-400 border border-sky-500/30 flex flex-col items-center justify-center gap-0.5 font-bold text-[11px] hover:bg-sky-600/30 transition cursor-pointer active:scale-95"
                title="الملاحة الخارجية والداخلية"
              >
                <span className="text-sm">🧭</span>
                <span>ملاحة</span>
              </button>
              <button
                type="button"
                onClick={() => setIsChatOpen(true)}
                className="min-h-[48px] py-2 px-1 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 flex flex-col items-center justify-center gap-0.5 font-bold text-[11px] hover:bg-amber-500/30 transition cursor-pointer active:scale-95 relative"
                title="دردشة فورية داخل التطبيق"
              >
                <span className="text-sm">✉️</span>
                <span>محادثة</span>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -start-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>

            {/* الزر الرئيسي العريض لمرحلة الرحلة (56px) */}
            {/* عرض خطأ القرب مع زر تحديث موقعي */}
            {proximityError && (
              <div className="p-3 rounded-2xl bg-red-500/15 border border-red-500/40 text-red-300 text-xs space-y-2">
                <p className="font-bold">{proximityError}</p>
                <button
                  type="button"
                  onClick={handleRefreshLocationAndRetryProximity}
                  disabled={isLocating}
                  className="w-full min-h-[44px] rounded-xl bg-red-600/30 hover:bg-red-600/40 text-white font-bold flex items-center justify-center gap-2 border border-red-500/40 cursor-pointer"
                >
                  <span>🔄</span>
                  <span>{isLocating ? 'جاري تحديد موقعك بدقة...' : 'تحديث موقعي وإعادة المحاولة'}</span>
                </button>
              </div>
            )}

            {/* الأزرار الرئيسية لمراحل الرحلة بحجم 56px أو 52px مع منع الضغط المزدوج */}
            {(() => {
              const st = (activeRide.status || '').toLowerCase();
              const isAccepted = st === 'accepted' || st === 'ontheway' || st === 'on_the_way';
              const isArrived = st === 'arrived' || st === 'driver_arrived';
              const isInTrip = st === 'inprogress' || st === 'in_progress' || st === 'in_trip' || st === 'started';
              const isWaitingAtDest = st === 'waiting_at_destination' || st === 'captain_waiting_at_destination';
              const isInTripReturn = st === 'in_trip_return';

              if (isAccepted) {
                return (
                  <div className="flex flex-col gap-2 w-full">
                    <button
                      type="button"
                      disabled={isActionInFlight}
                      onClick={handleDriverArrived}
                      aria-label="أنا في موقع الراكب (وصلت)"
                      className="w-full min-h-[56px] h-14 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 text-slate-950 font-black text-base flex items-center justify-center gap-2 shadow-xl shadow-amber-500/25 active:scale-[0.98] transition hover:brightness-105 cursor-pointer disabled:opacity-60"
                    >
                      <span>📍</span>
                      <span>{isActionInFlight ? 'جاري تأكيد الوصول...' : 'أنا في موقع الراكب (وصلت)'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsDriverCancelOpen(true);
                        setDriverCancelReason(null);
                      }}
                      className="w-full py-2 text-center text-xs font-bold text-red-400/80 hover:text-red-300 transition cursor-pointer min-h-[44px] flex items-center justify-center gap-1.5"
                    >
                      <span>⚠️</span>
                      <span>إلغاء المشوار والاعتذار</span>
                    </button>
                  </div>
                );
              }

              if (isArrived) {
                return (
                  <div className="flex flex-col gap-2.5 w-full">
                    <button
                      type="button"
                      onClick={handleTriggerHorn}
                      disabled={isTriggeringHorn}
                      aria-label="تنبيه الراكب بيب بيب"
                      className="w-full min-h-[52px] h-[52px] rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 text-slate-950 font-black text-base flex items-center justify-center gap-2.5 shadow-xl shadow-amber-500/25 active:scale-[0.98] transition hover:brightness-105 cursor-pointer border border-amber-300 disabled:opacity-60"
                    >
                      <span className="text-xl animate-bounce">📢</span>
                      <span>{isTriggeringHorn ? 'جاري التنبيه...' : 'تنبيه الراكب (بيب بيب 🚖)'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={isActionInFlight}
                      onClick={handleDriverStartRide}
                      aria-label="بدء المشوار والانطلاق إلى الوجهة"
                      className="w-full min-h-[56px] h-14 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 text-white font-black text-base flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/25 active:scale-[0.98] transition hover:brightness-105 cursor-pointer disabled:opacity-60"
                    >
                      <span className="text-xl">🚗💨</span>
                      <span>{isActionInFlight ? 'جاري بدء المشوار...' : 'بدء المشوار والانطلاق'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsDriverCancelOpen(true);
                        setDriverCancelReason(null);
                      }}
                      className="w-full py-1.5 text-center text-xs font-bold text-red-400/80 hover:text-red-300 transition cursor-pointer min-h-[40px] flex items-center justify-center gap-1.5"
                    >
                      <span>⚠️</span>
                      <span>إلغاء المشوار والاعتذار للراكب</span>
                    </button>
                  </div>
                );
              }

              if (isInTrip) {
                return (
                  <button
                    type="button"
                    disabled={isActionInFlight}
                    onClick={handleDriverArrivedDestination}
                    aria-label="وصلنا إلى الوجهة"
                    className="w-full min-h-[56px] h-14 rounded-2xl bg-gradient-to-r from-emerald-500 via-emerald-600 to-emerald-700 text-white font-black text-base flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/30 active:scale-[0.98] transition hover:brightness-105 cursor-pointer disabled:opacity-60"
                  >
                    <span>🏁</span>
                    <span>{isActionInFlight ? 'جاري تأكيد الوصول...' : (activeRide.isRoundTrip ? 'وصلنا إلى المحطة الأولى (بدء الانتظار ⏳)' : 'وصلنا إلى الوجهة 🏁')}</span>
                  </button>
                );
              }

              if (isWaitingAtDest) {
                const waitMins = Math.floor(waitElapsedSeconds / 60);
                const waitSecs = waitElapsedSeconds % 60;
                return (
                  <div className="flex flex-col gap-2.5 w-full">
                    <div className="p-3 rounded-2xl bg-amber-500/20 border border-amber-400/50 text-center space-y-1">
                      <span className="text-xs text-amber-300 font-bold block">
                        الكابتن في انتظار الراكب في المحطة الأولى ⏳
                      </span>
                      <span className="text-2xl font-black text-white font-mono tracking-wider">
                        {String(waitMins).padStart(2, '0')}:{String(waitSecs).padStart(2, '0')}
                      </span>
                      <span className="text-[11px] text-slate-300 block">
                        (أول 5 دقائق مجانية، ثم 100 د.ع لكل دقيقة)
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={isActionInFlight}
                      onClick={handleStartReturnTrip}
                      aria-label="بدء رحلة العودة"
                      className="w-full min-h-[56px] h-14 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 text-slate-950 font-black text-base flex items-center justify-center gap-2 shadow-xl shadow-amber-500/30 active:scale-[0.98] transition hover:brightness-105 cursor-pointer disabled:opacity-60"
                    >
                      <span className="text-xl">🔄</span>
                      <span>{isActionInFlight ? 'جاري البدء...' : 'بدء رحلة العودة 🔄'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleInitiateCompleteRide}
                      aria-label="إنهاء الرحلة هنا واحتساب الأجرة"
                      className="w-full min-h-[48px] h-12 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs flex items-center justify-center gap-2 border border-white/15 cursor-pointer"
                    >
                      <span>🏁</span>
                      <span>إنهاء الرحلة هنا واحتساب الأجرة المستحقة</span>
                    </button>
                  </div>
                );
              }

              if (isInTripReturn) {
                return (
                  <button
                    type="button"
                    disabled={isActionInFlight}
                    onClick={handleArrivedReturn}
                    aria-label="وصلنا للعودة"
                    className="w-full min-h-[56px] h-14 rounded-2xl bg-gradient-to-r from-emerald-500 via-emerald-600 to-emerald-700 text-white font-black text-base flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/30 active:scale-[0.98] transition hover:brightness-105 cursor-pointer disabled:opacity-60"
                  >
                    <span>🏁</span>
                    <span>{isActionInFlight ? 'جاري التأكيد...' : 'وصلنا للعودة 🏁'}</span>
                  </button>
                );
              }

              return (
                <button
                  type="button"
                  onClick={handleInitiateCompleteRide}
                  aria-label="استلمت الكروة"
                  className="w-full min-h-[56px] h-14 rounded-2xl bg-gradient-to-r from-emerald-500 via-emerald-600 to-emerald-700 text-white font-black text-base flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/30 active:scale-[0.98] transition hover:brightness-105 cursor-pointer font-cairo"
                >
                  <span className="text-xl">💵</span>
                  <span>استلمت الكروة</span>
                </button>
              );
            })()}
          </div>
        </div>
      )}

      {/* 5. الدرج السفلي العائم للأنماط الـ 4 (Floating Bottom Dock) - مطابقة لـ screen_3.png */}
      <div className="fixed bottom-0 inset-x-0 z-30 flex flex-col items-center pointer-events-none" dir="rtl">
        <div className={`pointer-events-auto w-full max-w-lg rounded-t-3xl backdrop-blur-2xl shadow-[0_-8px_32px_rgba(0,0,0,0.5)] flex flex-col px-4 pt-2.5 pb-[calc(0.75rem+env(safe-area-inset-bottom,0.75rem))] border-t ${isDark ? 'bg-[#161c28]/95 border-[#534434]/30 text-white' : 'bg-white/98 border-slate-200 text-slate-900 shadow-xl'}`}>
          {/* مقبض السحب لفتح/إغلاق المحتوى الإضافي */}
          <button
            type="button"
            onClick={() => setIsBottomDockExpanded(!isBottomDockExpanded)}
            className="w-full py-1 flex items-center justify-center focus:outline-none cursor-pointer"
            aria-label="توسيع أو تصغير اللوحة"
          >
            <div className="w-10 h-1.5 rounded-full bg-[#534434]/70 hover:bg-[#ffc174]/80 transition-colors" />
          </button>

          {/* تنبيه بالطلبات الواردة عند إغلاق اللوحة السفلية */}
          {pendingSeatRequests.length > 0 && !isBottomDockExpanded && (
            <div
              onClick={() => setIsBottomDockExpanded(true)}
              className="mt-1 mb-1 mx-auto py-1 px-3.5 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-black text-xs shadow-md animate-pulse cursor-pointer flex items-center gap-1.5"
            >
              <span>📢</span>
              <span>وصلك {pendingSeatRequests.length} طلب حجز خط دائم وارد! (اضغط للعرض)</span>
            </div>
          )}

          {/* شبكة الأنماط الـ 4 المعتمدة */}
          <div className="grid grid-cols-4 gap-2 py-2">
            {/* نمط 1: تكسي */}
            <button
              type="button"
              onClick={() => handleSwitchWorkStatus('taxi')}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all cursor-pointer min-h-[56px] ${
                workStatus === 'taxi'
                  ? 'bg-gradient-to-b from-[#f59e0b] to-[#d97707] text-[#161c28] font-black shadow-lg shadow-amber-500/30 scale-[1.02]'
                  : isDark 
                    ? 'bg-[#242a37]/80 text-[#ffc174] hover:bg-[#242a37] font-semibold border border-[#534434]/30' 
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold border border-slate-200 shadow-xs'
              }`}
            >
              <svg className="w-6 h-6 shrink-0 mb-0.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
              </svg>
              <span className="text-xs">تكسي</span>
            </button>

            {/* نمط 2: خط دائمي */}
            <button
              type="button"
              onClick={() => handleSwitchWorkStatus('permanent')}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all cursor-pointer min-h-[56px] ${
                workStatus === 'permanent'
                  ? 'bg-gradient-to-b from-[#56e5a9] to-[#00a86b] text-[#161c28] font-black shadow-lg shadow-emerald-500/30 scale-[1.02]'
                  : isDark 
                    ? 'bg-[#242a37]/80 text-[#56e5a9] hover:bg-[#242a37] font-semibold border border-[#534434]/30' 
                    : 'bg-slate-100 text-emerald-800 hover:bg-slate-200 font-semibold border border-slate-200 shadow-xs'
              }`}
            >
              <svg className="w-6 h-6 shrink-0 mb-0.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm-7-8h2v2h-2v-2zm-4 0h2v2H8v-2zm8 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm-4 0h2v2H8v-2zm8 0h2v2h-2v-2z"/>
              </svg>
              <span className="text-xs">خط دائمي</span>
            </button>

            {/* نمط 3: كلاهما */}
            <button
              type="button"
              onClick={() => handleSwitchWorkStatus('both')}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all cursor-pointer min-h-[56px] ${
                workStatus === 'both'
                  ? 'bg-gradient-to-b from-[#a855f7] to-[#7e22ce] text-white font-black shadow-lg shadow-purple-500/30 scale-[1.02]'
                  : isDark 
                    ? 'bg-[#242a37]/80 text-[#d8b4fe] hover:bg-[#242a37] font-semibold border border-[#534434]/30' 
                    : 'bg-slate-100 text-purple-800 hover:bg-slate-200 font-semibold border border-slate-200 shadow-xs'
              }`}
            >
              <svg className="w-6 h-6 shrink-0 mb-0.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="m19 9 1.25-2.75L23 5l-2.75-1.25L19 1l-1.25 2.75L15 5l2.75 1.25zm-7.5.5L9 4 6.5 9.5 1 12l5.5 2.5L9 20l2.5-5.5L17 12zM19 15l-1.25 2.75L15 19l2.75 1.25L19 23l1.25-2.75L23 19l-2.75-1.25z"/>
              </svg>
              <span className="text-xs">كلاهما</span>
            </button>

            {/* نمط 4: خمول */}
            <button
              type="button"
              onClick={() => handleSwitchWorkStatus('idle')}
              className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl transition-all cursor-pointer min-h-[56px] ${
                workStatus === 'idle'
                  ? 'bg-gradient-to-b from-[#64748b] to-[#475569] text-white font-black shadow-lg scale-[1.02]'
                  : isDark 
                    ? 'bg-[#242a37]/80 text-slate-400 hover:bg-[#242a37] font-semibold border border-white/5' 
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 font-semibold border border-slate-200 shadow-xs'
              }`}
            >
              <svg className="w-6 h-6 shrink-0 mb-0.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
              </svg>
              <span className="text-xs">خمول</span>
            </button>
          </div>

          {/* المحتوى القابل للتوسيع (Expandable Drawer Content) */}
          {isBottomDockExpanded && (
            <div className="mt-2.5 pt-3 border-t border-[#534434]/30 max-h-[50vh] overflow-y-auto space-y-3 pb-2 animate-fade-in">
              {/* إحصائيات سريعة للكابتن */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-[#242a37]/60 rounded-xl p-2.5 text-center border border-white/5">
                  <span className="text-[10px] text-slate-400 block">مشاوير اليوم</span>
                  <span className="text-base font-black text-[#56e5a9]">٥ مشاوير</span>
                </div>
                <div className="bg-[#242a37]/60 rounded-xl p-2.5 text-center border border-white/5">
                  <span className="text-[10px] text-slate-400 block">أرباح اليوم</span>
                  <span className="text-base font-black text-[#ffc174]">{driverBalance} د.ع</span>
                </div>
                <div className="bg-[#242a37]/60 rounded-xl p-2.5 text-center border border-white/5">
                  <span className="text-[10px] text-slate-400 block">نقاط الولاء</span>
                  <span className="text-base font-black text-amber-400">{driverPoints} ⭐</span>
                  <span className="text-[9px] text-slate-400 block font-mono mt-0.5">{formattedPhone}</span>
                </div>
              </div>

              {/* تثبيت ومسار الخط الدائم للكابتن (من ➔ إلى) - الشاشة الموحدة على الخريطة */}
              {(workStatus === 'permanent' || workStatus === 'both') && (
                <div className={`rounded-2xl p-3 border space-y-2.5 text-right ${
                  isDark ? 'bg-[#242a37]/60 border-emerald-500/30' : 'bg-emerald-50/50 border-emerald-500/30'
                }`} dir="rtl">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {isRouteLocked ? 'مسار مثبت ومقفل 🔒' : 'إعداد المسار 📍'}
                    </span>
                    <h4 className={`text-xs font-black flex items-center gap-1.5 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      <span>🛣️</span>
                      <span>مسار الخط الدائم (من ← إلى)</span>
                    </h4>
                  </div>

                  {isRouteLocked ? (
                    <div className={`p-3.5 rounded-xl border space-y-2.5 ${
                      isDark ? 'bg-[#161c28] border-white/10' : 'bg-white border-slate-200 shadow-sm'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-amber-500">
                          {fixedRouteName || `${fixedStartName} ➔ ${fixedDestName}`}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <span>🔒</span>
                          <span>خط دائمي مثبت</span>
                        </span>
                      </div>
                      <div className={`text-xs space-y-1.5 p-2.5 rounded-lg border ${
                        isDark ? 'bg-[#242a37]/60 border-white/5' : 'bg-slate-50 border-slate-200'
                      }`}>
                        <div className="flex items-center gap-1.5">
                          <span className="text-emerald-500 font-bold shrink-0">من:</span>
                          <span className={`truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{fixedStartName || 'نقطة الانطلاق'}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sky-500 font-bold shrink-0">إلى:</span>
                          <span className={`truncate ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{fixedDestName || 'الوجهة'}</span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => navigate('/driver/routes/new')}
                          className="w-full py-2.5 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/40 text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <span>🗺️ عرض المسار على الخريطة</span>
                        </button>
                        <div className={`text-center py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 ${
                          isDark ? 'bg-amber-500/10 border-amber-500/30 text-amber-300' : 'bg-amber-50 border-amber-300 text-amber-900'
                        }`}>
                          <span>🔒</span>
                          <span>مسارك مثبّت. للتعديل راجع الإدارة.</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className={`p-4 rounded-xl border space-y-3 ${
                      isDark ? 'bg-[#161c28] border-white/10' : 'bg-white border-slate-200 shadow-sm'
                    }`}>
                      <div className="space-y-1">
                        <p className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                          تحديد وتثبيت خط سيرك عبر الخريطة التفاعلية 🗺️
                        </p>
                        <p className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                          حدد نقطة الانطلاق والوصول والمسار على الشوارع بدقة بالدبابيس والـ GPS.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => navigate('/driver/routes/new')}
                        className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 text-slate-950 font-black text-xs hover:brightness-110 active:scale-[0.98] transition cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20"
                      >
                        <span>🗺️ فتح خريطة تحديد المسار وتثبيته</span>
                        <span>←</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* مشتركو الخط الدائمي */}
              {(workStatus === 'permanent' || workStatus === 'both') && (
                <div className="bg-[#242a37]/50 rounded-2xl p-3 border border-[#56e5a9]/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-[#56e5a9] flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-base">groups</span>
                      <span>ركاب الخط الدائمي المشتركون ({subscribers.length})</span>
                    </h4>
                  </div>
                  {subscribers.length === 0 ? (
                    <p className="text-[11px] text-slate-400 text-center py-2">لا يوجد مشتركون حالياً في هذا الخط</p>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {subscribers.map((sub) => (
                        <div key={sub.id} className="space-y-1.5">
                          <div className="flex items-center justify-between bg-[#161c28]/80 p-2.5 rounded-xl text-xs border border-white/5">
                          <div className="text-right">
                            <span className="font-bold text-white block">{sub.name}</span>
                            <span className="text-slate-400 text-[10px]">{sub.from} ➔ {sub.to}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenWhatsApp(sub.phone, sub.name)}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold cursor-pointer"
                              title="محادثة واتساب"
                            >
                              واتساب 💬
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDriverCancelSubscriber(sub)}
                              className="px-2.5 py-1.5 rounded-lg bg-red-600/20 text-red-400 border border-red-500/30 text-xs font-bold cursor-pointer hover:bg-red-600/40"
                              title="إلغاء الاشتراك"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                        {sub.cancellationPending && (
                          <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs space-y-1.5">
                            <span className="font-bold">طلب الراكب إلغاء الاشتراك: {sub.cancellationReason || 'ظروف شخصية'}</span>
                            <div className="grid grid-cols-2 gap-1.5 pt-1">
                              <button
                                type="button"
                                onClick={() => handleRejectCancellation(sub.id)}
                                className="py-1 rounded bg-white/10 text-slate-300 text-[11px] font-bold"
                              >
                                رفض
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenApproveModal(sub)}
                                className="py-1 rounded bg-red-600 text-white text-[11px] font-bold"
                              >
                                موافقة
                              </button>
                            </div>
                          </div>
                        )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* أزرار الخدمات الإضافية وتسجيل الخروج */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => navigate('/driver-hub')}
                  className="flex-1 py-2.5 bg-[#242a37] hover:bg-[#2c3343] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-white/10 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-base text-[#56e5a9]">account_circle</span>
                  <span>الملف الشخصي</span>
                </button>
                <button
                  type="button"
                  onClick={handleDriverLogout}
                  className="flex-1 py-2.5 bg-red-950/40 hover:bg-red-900/50 text-red-400 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 border border-red-500/30 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-base">logout</span>
                  <span>تسجيل الخروج</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 6. نافذة تغيير نمط وطبقات الخريطة (Layer Switcher Modal) */}
      {showLayersModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in" dir="rtl">
          <div className="w-full max-w-xs rounded-3xl bg-[#161c28] border border-white/10 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <h3 className="text-sm font-black text-white">نمط وطبقات الخريطة</h3>
              <button
                type="button"
                onClick={() => setShowLayersModal(false)}
                className="text-slate-400 hover:text-white p-1 text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="space-y-2 text-xs">
              <button
                type="button"
                onClick={() => { setSelectedMapStyle(null); setShowLayersModal(false); }}
                className="w-full py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-right flex items-center justify-between cursor-pointer"
              >
                <span>✨ النمط التلقائي (يتبع الوضع الليلي والنهاري)</span>
                {!selectedMapStyle && <span className="text-[#56e5a9] font-black">✓</span>}
              </button>
              <button
                type="button"
                onClick={() => { setSelectedMapStyle('mapbox://styles/almusawy/cmvhp33yb00f001s8gbjad8db'); setShowLayersModal(false); }}
                className="w-full py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-right flex items-center justify-between cursor-pointer"
              >
                <span>🌙 نمط توصيلة الليلي المعتمد (Night Obsidian)</span>
                {selectedMapStyle === 'mapbox://styles/almusawy/cmvhp33yb00f001s8gbjad8db' && <span className="text-[#56e5a9] font-black">✓</span>}
              </button>
              <button
                type="button"
                onClick={() => { setSelectedMapStyle('mapbox://styles/almusawy/cmvdwkv6q003801s82f9t02om'); setShowLayersModal(false); }}
                className="w-full py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-right flex items-center justify-between cursor-pointer"
              >
                <span>☀️ نمط توصيلة النهاري المعتمد (Daylight Tawseela)</span>
                {selectedMapStyle === 'mapbox://styles/almusawy/cmvdwkv6q003801s82f9t02om' && <span className="text-[#56e5a9] font-black">✓</span>}
              </button>
              <button
                type="button"
                onClick={() => { setSelectedMapStyle('mapbox://styles/mapbox/satellite-streets-v12'); setShowLayersModal(false); }}
                className="w-full py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-white font-bold text-right flex items-center justify-between cursor-pointer"
              >
                <span>🛰️ الأقمار الصناعية (Satellite Streets)</span>
                {selectedMapStyle?.includes('satellite') && <span className="text-[#56e5a9] font-black">✓</span>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. نافذة الطوارئ والدعم السريع (SOS Emergency Modal) */}
      {showSosAlert && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-fade-in" dir="rtl">
          <div className="w-full max-w-sm rounded-3xl bg-[#161c28] border-2 border-red-500/80 p-5 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-red-500/20 text-red-500 text-3xl mx-auto flex items-center justify-center animate-pulse border border-red-500/40">
              🚨
            </div>
            <div>
              <h3 className="text-base font-black text-white">طوارئ الكابتن والدعم المباشر</h3>
              <p className="text-xs text-slate-300 mt-1">هل أنت بحاجة إلى مساعدة أمنية أو طارئة عاجلة؟</p>
            </div>
            <div className="flex flex-col gap-2.5 pt-2">
              <a
                href="tel:104"
                className="w-full py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer"
              >
                <span>📞</span>
                <span>الاتصال بشرطة النجدة (104)</span>
              </a>
              <a
                href="tel:07800000000"
                className="w-full py-3 rounded-xl bg-[#242a37] hover:bg-[#2c3343] text-[#ffc174] font-bold text-sm flex items-center justify-center gap-2 border border-white/10 cursor-pointer"
              >
                <span>🎧</span>
                <span>غرفة عمليات منصة توصيلة</span>
              </a>
              <button
                type="button"
                onClick={() => setShowSosAlert(false)}
                className="w-full py-2 text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                إلغاء وإغلاق
              </button>
            </div>
          </div>
        </div>
      )}



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
      {isFareModalOpen && activeRide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in" dir="rtl">
          <div className="w-full max-w-sm rounded-3xl bg-[#161C28] border-2 border-amber-400/80 p-5 shadow-2xl text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-400 text-3xl mx-auto flex items-center justify-center">
              💵
            </div>

            <div>
              <h3 className="text-base font-black text-white">تفاصيل وملخص الأجرة</h3>
              <p className="text-xs text-slate-400 mt-0.5">محسوبة وفق تسعيرة بلي المعتمدة لمنظومة توصيلة</p>
            </div>

            {/* تفاصيل العداد والرحلة الشفافة */}
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3.5 space-y-2 text-xs text-right">
              {activeRide.isRoundTrip ? (
                <>
                  <div className="flex items-center justify-between text-slate-300">
                    <span>أجرة الذهاب (المحطة الأولى):</span>
                    <span className="font-bold text-white">
                      {Number(activeRide.leg1Fare || activeRide.pricingBreakdown?.leg1Fare || 0).toLocaleString()} د.ع
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span>رسوم الانتظار ({activeRide.actualWaitMinutes || 0} دقيقة):</span>
                    <span className="font-bold text-amber-300">
                      {Number(activeRide.waitFee || activeRide.pricingBreakdown?.waitFee || 0).toLocaleString()} د.ع
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span>أجرة العودة (خصم 15%):</span>
                    <span className="font-bold text-white">
                      {Number(activeRide.leg2Fare || activeRide.pricingBreakdown?.leg2Fare || 0).toLocaleString()} د.ع
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between text-slate-300">
                    <span>فتح العداد القياسي:</span>
                    <span className="font-bold text-white">١,٠٠٠ د.ع</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span>المسافة والوقت:</span>
                    <span className="font-bold text-white">٥٠٠ د.ع/كم • ١٠٠ د.ع/د</span>
                  </div>
                </>
              )}
            </div>

            {/* المبلغ النهائي المطلوب تحصيله كاش */}
            {(() => {
              const reqFare = Number(activeRide.finalFare ?? activeRide.fare ?? activeRide.pricingBreakdown?.totalFare ?? 3500);
              const recNum = Number(receivedFareInput) || reqFare;
              const diff = recNum - reqFare;

              return (
                <div className="space-y-3">
                  <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-400/60 text-center">
                    <span className="text-xs font-bold text-amber-400 block mb-1">المبلغ المطلوب تحصيله نقداً:</span>
                    <span className="text-3xl font-black text-amber-300 font-mono tracking-tight">
                      {reqFare.toLocaleString()} د.ع
                    </span>
                  </div>

                  {/* إدخال المبلغ المستلم الفعلي مع مؤشر الفرق */}
                  <div className="space-y-1.5 text-right">
                    <label className="text-xs font-bold text-slate-300 block" htmlFor="driver-received-cash">
                      المبلغ المستلم فعلياً من الراكب (د.ع):
                    </label>
                    <input
                      id="driver-received-cash"
                      type="number"
                      inputMode="numeric"
                      value={receivedFareInput}
                      onChange={(e) => setReceivedFareInput(e.target.value)}
                      className="w-full rounded-2xl bg-[#1A202C] border border-slate-700 p-3 text-center text-lg font-black text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                    {diff === 0 ? (
                      <p className="text-[11px] font-bold text-emerald-400 text-center">المبلغ مطابق تماماً للأجرة المطلوبة ✅</p>
                    ) : diff > 0 ? (
                      <p className="text-[11px] font-bold text-sky-400 text-center">إكرامية إضافية للكابتن: +{diff.toLocaleString()} د.ع ⭐</p>
                    ) : (
                      <p className="text-[11px] font-bold text-amber-400 text-center">نقص في المبلغ: {diff.toLocaleString()} د.ع ⚠️</p>
                    )}
                  </div>
                </div>
              );
            })()}

            <button
              type="button"
              disabled={isActionInFlight}
              onClick={handleDriverComplete}
              className="w-full min-h-[56px] h-14 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 text-slate-950 font-black text-base flex items-center justify-center gap-2 shadow-xl shadow-amber-500/30 active:scale-[0.98] transition hover:brightness-105 cursor-pointer font-cairo disabled:opacity-60"
            >
              <span>✅</span>
              <span>{isActionInFlight ? 'جاري التأكيد...' : 'تأكيد الاستلام وإنهاء المشوار'}</span>
            </button>
          </div>
        </div>
      )}

      {/* نافذة اختيار تطبيق الملاحة المنبثقة (Google Maps / Waze / نسخ الإحداثيات) */}
      {isNavModalOpen && navCoordinates && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-3xl bg-[#161C28] border border-white/10 p-5 shadow-2xl text-center space-y-3.5" dir="rtl" role="dialog" aria-modal="true" aria-label="اختيار تطبيق الملاحة">
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
              {/* خرائط جوجل (Google Maps) كرابط أصلي مباشر <a> يفتح فوراً دون اعتراض المتصفح */}
              <a
                href={(!isNaN(navCoordinates.lat) && !isNaN(navCoordinates.lng) && navCoordinates.lat !== 0)
                  ? `https://www.google.com/maps/dir/?api=1&destination=${navCoordinates.lat},${navCoordinates.lng}&travelmode=driving`
                  : '#'}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => notifyExternalNavStart('Google Maps')}
                aria-label="افتح في خرائط جوجل"
                className="w-full min-h-[48px] py-3 px-4 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-bold text-sm flex items-center justify-center gap-2.5 transition active:scale-[0.98] cursor-pointer text-center"
              >
                <span className="text-lg">🗺️</span>
                <span>افتح في Google Maps</span>
              </a>

              {/* تطبيق ويز (Waze) كرابط أصلي مباشر <a> يفتح فوراً دون اعتراض المتصفح */}
              <a
                href={(!isNaN(navCoordinates.lat) && !isNaN(navCoordinates.lng) && navCoordinates.lat !== 0)
                  ? `https://waze.com/ul?ll=${navCoordinates.lat},${navCoordinates.lng}&navigate=yes`
                  : '#'}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => notifyExternalNavStart('Waze')}
                aria-label="افتح في تطبيق ويز"
                className="w-full min-h-[48px] py-3 px-4 rounded-2xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/30 text-sky-300 font-bold text-sm flex items-center justify-center gap-2.5 transition active:scale-[0.98] cursor-pointer text-center"
              >
                <span className="text-lg">🚙</span>
                <span>افتح في Waze</span>
              </a>

              <button
                type="button"
                onClick={() => setIsNavModalOpen(false)}
                className="w-full min-h-[44px] rounded-xl text-xs font-bold text-slate-400 hover:text-white transition cursor-pointer"
              >
                المتابعة داخل التطبيق (Mapbox الافتراضي) ✕
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

      {/* نافذة إلغاء رحلة التكسي الفورية المعتمدة من الكابتن */}
      {isDriverCancelOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fade-in"
          dir="rtl"
        >
          <div
            className="w-full max-w-sm rounded-3xl bg-[#161C28] border border-red-500/30 p-5 shadow-2xl text-white space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚠️</span>
                <h3 className="text-base font-black text-red-400">إلغاء المشوار والاعتذار للراكب</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDriverCancelOpen(false)}
                className="text-slate-400 hover:text-white min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 font-bold">
              يرجى تحديد سبب الإلغاء (سيتم إشعار الراكب بالسبب وتحويل المشوار لكابتن بديل فوراً):
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              {driverReasonsList.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setDriverCancelReason(reason)}
                  className={`w-full min-h-[48px] p-3 rounded-xl border text-right text-xs font-bold transition flex items-center justify-between ${
                    driverCancelReason === reason
                      ? 'border-amber-400 bg-amber-500/15 text-amber-300'
                      : 'border-slate-800 bg-[#0B101B] text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <span>{reason}</span>
                  <div
                    className={`h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                      driverCancelReason === reason ? 'border-amber-400' : 'border-slate-600'
                    }`}
                  >
                    {driverCancelReason === reason && <div className="h-2 w-2 rounded-full bg-amber-400" />}
                  </div>
                </button>
              ))}

              {driverCancelReason === 'سبب آخر' && (
                <div className="pt-2">
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    توضيح السبب الآخر (3 أحرف على الأقل):
                  </label>
                  <input
                    type="text"
                    maxLength={100}
                    value={driverCustomCancelText}
                    onChange={(e) => setDriverCustomCancelText(e.target.value)}
                    placeholder="اكتب سبب الاعتذار..."
                    className="w-full rounded-xl bg-[#0B101B] border border-slate-700 p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">{driverCustomCancelText.length}/100 حرف</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsDriverCancelOpen(false)}
                className="flex-1 min-h-[48px] rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white transition active:scale-95 cursor-pointer"
              >
                تراجع
              </button>
              <button
                type="button"
                disabled={
                  isSubmittingCancellation ||
                  !driverCancelReason ||
                  (driverCancelReason === 'سبب آخر' && driverCustomCancelText.trim().length < 3)
                }
                onClick={handleConfirmDriverCancel}
                className="flex-1 min-h-[48px] rounded-xl bg-red-600 hover:bg-red-700 text-xs font-black text-white shadow-md transition active:scale-95 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmittingCancellation ? 'جاري الإلغاء...' : 'تأكيد الإلغاء والاعتذار ✕'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* بطاقة استقبال طلب حجز الخط الدائم العائمة الفورية مع أزرار القبول والرفض */}
      {pendingSeatRequests.length > 0 && !incomingRequest && !hasRealActiveTrip && (
        <div className="fixed bottom-24 sm:bottom-28 inset-x-3 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[420px] z-40 animate-slide-up">
          <div className="bg-[#161c28]/95 backdrop-blur-xl border-2 border-emerald-500/60 shadow-2xl shadow-emerald-500/20 rounded-2xl p-4 text-white space-y-3" dir="rtl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping"></span>
                <span className="text-xs font-black text-emerald-400">
                  طلب حجز جديد (الخط الدائم) 📢 {pendingSeatRequests.length > 1 ? `(1 من ${pendingSeatRequests.length})` : ''}
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
                {Number(pendingSeatRequests[0].totalFare || 30000).toLocaleString()} د.ع
              </span>
            </div>

            <div className="bg-[#242a37]/80 rounded-xl p-3 space-y-1.5 text-xs border border-white/5">
              <div className="flex items-center justify-between font-bold">
                <span className="text-white text-sm">{pendingSeatRequests[0].customerName || 'راكب خط'}</span>
                <span className="text-slate-300 text-[11px]">💺 {pendingSeatRequests[0].seatsBooked || 1} مقعد</span>
              </div>
              <div className="text-[11px] text-slate-300 space-y-1 pt-1 border-t border-white/5">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="text-emerald-400 font-bold">الانطلاق:</span>
                  <span className="truncate">{pendingSeatRequests[0].pickupLocation}</span>
                </div>
                <div className="flex items-center gap-1.5 truncate">
                  <span className="text-sky-400 font-bold">الوجهة:</span>
                  <span className="truncate">{pendingSeatRequests[0].dropoffLocation}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-0.5">
              <button
                type="button"
                onClick={() => handleAcceptSeatBooking(pendingSeatRequests[0].id || pendingSeatRequests[0].bookingId || '')}
                className="min-h-[48px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 font-black text-sm shadow-lg shadow-emerald-500/25 active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>قبول الحجز</span>
                <span>✅</span>
              </button>
              <button
                type="button"
                onClick={() => handleRejectSeatBooking(pendingSeatRequests[0].id || pendingSeatRequests[0].bookingId || '')}
                className="min-h-[48px] py-2.5 px-4 rounded-xl bg-[#242a37] hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 border border-white/10 hover:border-rose-500/40 font-bold text-sm active:scale-95 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>رفض</span>
                <span>❌</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* بطاقة استقبال المشوار الواردة الفاخرة العائمة معزولة العداد التنازلي لمنع الوميض */}
      {shouldShowDispatchSheet && incomingRequest && (
        <IncomingTripDispatchSheet
          incomingRequest={incomingRequest}
          isDark={isDark}
          onAccept={handleAcceptRide}
          onReject={handleRejectRide}
        />
      )}
    </div>
  );
}
