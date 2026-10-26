// شاشة تكسي الرئيسية — دورة حجز الرحلة المتكاملة
// 1. تحديد نقطة الانطلاق (دبوس برتقالي + زر الهوم)
// 2. تحديد نقطة الوصول (دبوس أزرق مربع + زر الرجوع)
// 3. خيارات فئات الرحلة (الصورة 1: سوبر / توفير / بلس + خيارات الرحلة + قسيمة + زر طلب الفئة)
// 4. نافذة خيارات الرحلة المتقدمة (الصورة 2: الوجهة الثانية، التوقف في الطريق، رحلة ذهاب وإياب)
// 5. نافذة اختيار المدينة ودرج الزبون الكامل (حول توصيلة)

import { useCallback, useEffect, useRef, useState, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { Map as MapGL, Marker, type MapMouseEvent, type MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { http } from '../lib/api';
import { authStore } from '../lib/auth';
import { config } from '../lib/config';
import { realtime } from '../lib/realtime';
import { searchPlaces, reverseGeocode, getDirections, applyMapEnhancements, type PlaceResult } from '../lib/mapbox';
import {
  calculateBearing,
  distanceMeters,
  distanceKm,
  minDistanceToPolylineMeters,
  formatEtaArabic,
  getCurrentPositionWithFallback,
  isIosDevice,
  isStandalonePwa,
  iraqCenterLngLat,
} from '../lib/geo';
import {
  getFavoritePlaces,
  addFavoritePlace,
  getRecentPlaces,
  addRecentPlace,
  type FavoritePlace,
  type RecentPlaceItem,
} from '../lib/cache';
import { sanitizeSearchQuery } from '../lib/sanitize';
import { storage } from '../lib/storage';
import { IRAQ_GOVERNORATES, detectGovernorate, type Governorate } from '../lib/governorates';
import { playCarHornBeep, initAudioUnlock } from '../lib/sound';
import { useTheme } from '../context/ThemeContext';
import { ThemeToggleButton } from '../components/ThemeToggleButton';
import type { LngLat } from '../types';
import { VehicleMarker } from '../components/map/VehicleMarker';
import { RouteLines, NearestDriverPin, SurroundingDriverPin, DestinationFlagPin, type RouteLineData } from '../components/map/MapPins';
import { Spinner } from '../components/ui';
import { useToast } from '../components/Toast';

// التحميل الكسول لنافذة الدردشة لتقليل الحزمة الأولية
const ChatModal = lazy(() => import('../components/ChatModal'));

// نقطة الانطلاق والوصول الافتراضية المحايدة (مركز العراق)
const DEFAULT_PICKUP: LngLat = { lat: 33.3152, lng: 44.3661 };
const DEFAULT_PICKUP_NAME = 'حدد نقطة الانطلاق على الخريطة';
const DEFAULT_DROPOFF: LngLat = { lat: 33.3250, lng: 44.3750 };
const DEFAULT_DROPOFF_NAME = 'حدد الوجهة على الخريطة';

// الأماكن السريعة أسفل شريط البحث (محايدة)
const QUICK_CHIPS = [
  { name: 'موقعي الحالي', address: 'موقعي الحالي عبر الـ GPS', lat: 33.3152, lng: 44.3661 },
  { name: 'وسط المدينة', address: 'مركز المحافظة', lat: 33.3152, lng: 44.3661 },
];

// قائمة محافظات ومدن العراق الـ 18
type CityItem = Governorate;
const IRAQI_CITIES: CityItem[] = IRAQ_GOVERNORATES;

// فئات رحلات التكسي (الصورة 1)
interface RideTier {
  id: 'super' | 'saving' | 'plus';
  name: string;
  subtitle: string;
  basePrice: number;
  badge: 'super' | 'saving' | 'plus';
}

const RIDE_TIERS: RideTier[] = [
  {
    id: 'super',
    name: 'سوبر',
    subtitle: 'الخيار الأفضل',
    basePrice: 3000,
    badge: 'super',
  },
  {
    id: 'saving',
    name: 'توفير',
    subtitle: 'التكسي الأوفر',
    basePrice: 3000,
    badge: 'saving',
  },
  {
    id: 'plus',
    name: 'بلَس',
    subtitle: 'خدمة أكثر راحة',
    basePrice: 3500,
    badge: 'plus',
  },
];

// مراحل حجز الرحلة
type BookingStage = 'pickup' | 'dropoff' | 'ride_options' | 'searching' | 'driver_arriving';

// شعار توصيلة الرسمي المعتمد مع الشارة العائمة لكل فئة (استبدال السيارة الكرتونية)
function TawseelaTierLogo({
  badge,
  size = 'md',
}: {
  badge: 'super' | 'saving' | 'plus';
  size?: 'sm' | 'md' | 'lg';
}) {
  const isLarge = size === 'lg';
  const isSmall = size === 'sm';

  const containerClass = isLarge
    ? 'relative h-16 w-36 max-w-[150px] flex items-center justify-center shrink-0 select-none'
    : isSmall
    ? 'relative w-14 h-10 flex items-center justify-center shrink-0 select-none'
    : 'relative w-20 h-12 flex items-center justify-center shrink-0 select-none';

  const badgeClass = isLarge
    ? 'absolute -top-1.5 -right-1.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-black shadow-md'
    : isSmall
    ? 'absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold shadow-md'
    : 'absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold shadow-md';

  const badgeBg =
    badge === 'saving'
      ? 'bg-emerald-500 text-slate-950 ring-2 ring-emerald-400/40'
      : 'bg-amber-400 text-slate-950 ring-2 ring-amber-400/40';

  const badgeIcon =
    badge === 'super' ? '⚡' : badge === 'saving' ? '🏷️' : '★';

  return (
    <div className={containerClass}>
      <img
        src="/logo.png?v=40"
        alt="توصيلة"
        className="w-full h-full object-contain filter drop-shadow-sm select-none"
        loading="eager"
      />
      <div className={`${badgeClass} ${badgeBg}`}>
        {badgeIcon}
      </div>
    </div>
  );
}

// الاسم المستعار للتوافق الكامل
const CarBadgeIllustration = TawseelaTierLogo;

export default function CustomerHomePage() {
  const navigate = useNavigate();
  const { show } = useToast();
  const { mapStyle, isDark } = useTheme();
  const mapRef = useRef<MapRef>(null);
  const hasAutoLocatedRef = useRef(false);

  // تحديث تباين الشوارع وألوان التسميات تلقائياً عند التبديل بين الوضع النهاري والليلي
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

  // حالة الرحلة اللحظية: Pending | Accepted | Arrived | InProgress | Completed | Cancelled
  const [rideStatus, setRideStatus] = useState<string | null>(null);

  const customerName = session?.fullName || storage.getFullName() || 'المستخدم';
  const customerFirstName = customerName.split(' ')[0] || 'المستخدم';
  const rawPhone = storage.getPhone() || '';
  const formattedPhone = rawPhone
    ? rawPhone.startsWith('+')
      ? rawPhone
      : rawPhone.startsWith('0')
      ? `+964${rawPhone.slice(1)}`
      : `+964${rawPhone}`
    : '—';

  // مرحلة الحجز
  const [stage, setStage] = useState<BookingStage>('pickup');

  // إحداثيات وأسماء النقطتين
  const [pickup, setPickup] = useState<LngLat>(DEFAULT_PICKUP);
  const [pickupName, setPickupName] = useState(DEFAULT_PICKUP_NAME);
  const [dropoff, setDropoff] = useState<LngLat>(DEFAULT_DROPOFF);
  const [dropoffName, setDropoffName] = useState(DEFAULT_DROPOFF_NAME);

  // مسار الشوارع بين النقطتين
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][] | null>(null);

  // تبويب الخدمات في البطاقة: تكسي أو بوكس
  const [selectedServiceTab, setSelectedServiceTab] = useState<'taxi' | 'box'>('taxi');

  // إظهار كباتن الخطوط الدائمية على الخريطة فوق كباتن التكسي
  const [showCommuteRoutes, setShowCommuteRoutes] = useState<boolean>(false);
  const [commuteDrivers, setCommuteDrivers] = useState<any[]>([]);
  const [selectedCommuteDriver, setSelectedCommuteDriver] = useState<any | null>(null);
  const [showCommuteRoute, setShowCommuteRoute] = useState<boolean>(false);
  const [commuteRouteCoordinates, setCommuteRouteCoordinates] = useState<[number, number][] | null>(null);
  const [isLoadingCommuteRoute, setIsLoadingCommuteRoute] = useState<boolean>(false);

  // الفئة المحددة (الافتراضي: سوبر)
  const [selectedTierId, setSelectedTierId] = useState<'super' | 'saving' | 'plus'>('super');

  // نافذة خيارات الرحلة (الصورة الثانية)
  const [isTripOptionsOpen, setIsTripOptionsOpen] = useState(false);
  const [secondDestination, setSecondDestination] = useState('');
  const [isAddingSecondDest, setIsAddingSecondDest] = useState(false);
  const [stopDuration, setStopDuration] = useState<number | null>(null);
  const [isAddingStop, setIsAddingStop] = useState(false);
  const [isRoundTrip, setIsRoundTrip] = useState(false);
  const [roundTripWaitMinutes, setRoundTripWaitMinutes] = useState<number>(15);
  const [returnDestinationAddress, setReturnDestinationAddress] = useState<string>('');
  const [isExternalNavActive, setIsExternalNavActive] = useState<boolean>(false);
  const [lastKnownDriverLocation, setLastKnownDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [customerWaitSeconds, setCustomerWaitSeconds] = useState<number>(0);
  const [maxWaitExceeded, setMaxWaitExceeded] = useState<boolean>(false);
  const [isFareConfirmedByCustomer, setIsFareConfirmedByCustomer] = useState<boolean>(false);
  const [isSubmittingConfirmFare, setIsSubmittingConfirmFare] = useState<boolean>(false);
  const [completedRideBreakdown, setCompletedRideBreakdown] = useState<any>(null);
  const lastCustomerEventIdRef = useRef<string>('');
  const processedCustomerEventIdsRef = useRef<Set<string>>(new Set());

  // نافذة القسائم والخصم
  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [promoCodeInput, setPromoCodeInput] = useState('');

  // حالة النوافذ والدرج
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isCitySelectorOpen, setIsCitySelectorOpen] = useState(false);
  const [isCancelTripOpen, setIsCancelTripOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  const [customCancelText, setCustomCancelText] = useState('');
  const [cancelReasonsList, setCancelReasonsList] = useState<string[]>([
    'تأخر الكابتن في الوصول',
    'تغيير خطة المشوار',
    'طلب بالخطأ',
    'الكابتن طلب مني الإلغاء',
    'الكابتن لا يتحرك باتجاهي',
    'سبب آخر'
  ]);
  const [cancelFeeAmount, setCancelFeeAmount] = useState(1500);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [noDriversModalOpen, setNoDriversModalOpen] = useState(false);

  // المدينة المحددة
  const [selectedCity, setSelectedCity] = useState('المدينة الحالية');
  const [citySearchQuery, setCitySearchQuery] = useState('');


  // بيانات المشوار الحقيقي والاتصال بالسائق
  const [rideRequestId, setRideRequestId] = useState<string | null>(null);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [assignedDriverInfo, setAssignedDriverInfo] = useState<{
    driverId?: string;
    driverName?: string;
    driverPhone?: string;
    driverVehicle?: string;
    driverPlate?: string;
    driverRating?: number;
    driverLat?: number;
    driverLon?: number;
    driverTier?: string;
  } | null>(null);
  const [liveDriverPosition, setLiveDriverPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [driverHeading, setDriverHeading] = useState<number>(0);
  const prevDriverPositionRef = useRef<{ lat: number; lng: number } | null>(null);

  // نظام تتبع الكابتن الذكي والاقتصادي (Smart Mapbox Directions & Accurate ETA)
  const [etaText, setEtaText] = useState<string | null>(null);
  const [isDriverStationary, setIsDriverStationary] = useState<boolean>(false);
  const trackingInitialDirectionsDoneRef = useRef<boolean>(false);
  const lastDirectionsCallTimeRef = useRef<number>(0);
  const directionsCallCountRef = useRef<number>(0);
  const expectedRoutePointsRef = useRef<Array<[number, number]>>([]);
  const remainingSecondsRef = useRef<number>(0);
  const initialDurationSecondsRef = useRef<number>(0);
  const initialDistanceMetersRef = useRef<number>(0);
  const lastKnownDriverPosRef = useRef<{ lat: number; lng: number } | null>(null);

  // حالة البحث النصي للأماكن
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [isListeningMic, setIsListeningMic] = useState(false);
  const searchTimer = useRef<number | null>(null);
  const hasNotifiedArrivalRef = useRef(false);
  const lastHeardHornSeqRef = useRef<number>(0);

  // نافذة تقييم الراكب للكابتن بنمط بلي (Customer Rating Captain Modal)
  const [isRatingModalOpen, setIsRatingModalOpen] = useState(false);
  const [completedDriverInfo, setCompletedDriverInfo] = useState<{
    rideId: string;
    driverId?: string;
    driverName?: string;
    driverPhone?: string;
    driverVehicle?: string;
    driverPlate?: string;
    driverRating?: number;
  } | null>(null);
  const [ratingStars, setRatingStars] = useState<number>(5);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [ratingComment, setRatingComment] = useState<string>('');
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const hasTriggeredRatingRef = useRef(false);

  // نظام تقديم الشكاوى والبلاغات المباشرة
  const [isComplaintModalOpen, setIsComplaintModalOpen] = useState(false);
  const [complaintCategory, setComplaintCategory] = useState<string>('سلوك غير لائق من الكابتن');
  const [complaintText, setComplaintText] = useState<string>('');
  const [complaintDriverPhone, setComplaintDriverPhone] = useState<string>('');
  const [complaintRideId, setComplaintRideId] = useState<string>('');
  const [isSubmittingComplaint, setIsSubmittingComplaint] = useState(false);

  // التسعير الديناميكي الذكي للرحلات الفورية (Baly-like Surge Pricing)
  const [dynamicPricingData, setDynamicPricingData] = useState<{
    superFare?: number;
    savingFare?: number;
    plusFare?: number;
    selectedFare?: number;
    breakdown?: any;
    surgeBadge?: { text: string; type: string; percent?: number; reason?: string } | null;
    discountBadge?: { text: string; type: string; amountIqd?: number } | null;
  }>({});

  // حالة الورقة السفلية لتفاصيل الرحلة التفاعلية ثلاثية الحالات (minimized, middle, expanded)
  const [rideSheetState, setRideSheetState] = useState<'minimized' | 'middle' | 'expanded'>('middle');
  const sheetPointerStartYRef = useRef<number | null>(null);
  const sheetPointerCurrentYRef = useRef<number | null>(null);
  const isSheetDraggingRef = useRef<boolean>(false);

  // حالة الورقة السفلية ثلاثية الحالات لفئات الرحلة (minimized, middle, expanded)
  const [tierSheetState, setTierSheetState] = useState<'minimized' | 'middle' | 'expanded'>('middle');
  const tierPointerStartYRef = useRef<number | null>(null);
  const tierPointerCurrentYRef = useRef<number | null>(null);
  const isTierDraggingRef = useRef<boolean>(false);

  const handleTierPointerDown = useCallback((e: React.PointerEvent) => {
    try {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch (_) {}
    tierPointerStartYRef.current = e.clientY;
    tierPointerCurrentYRef.current = e.clientY;
    isTierDraggingRef.current = true;
  }, []);

  const handleTierPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isTierDraggingRef.current || tierPointerStartYRef.current === null) return;
    tierPointerCurrentYRef.current = e.clientY;
  }, []);

  const handleTierPointerUp = useCallback((e: React.PointerEvent) => {
    if (!isTierDraggingRef.current || tierPointerStartYRef.current === null || tierPointerCurrentYRef.current === null) {
      isTierDraggingRef.current = false;
      tierPointerStartYRef.current = null;
      tierPointerCurrentYRef.current = null;
      return;
    }
    const deltaY = tierPointerCurrentYRef.current - tierPointerStartYRef.current;
    if (deltaY > 40) {
      // سحب لأسفل يصغّر الورقة
      setTierSheetState((prev) => (prev === 'expanded' ? 'middle' : 'minimized'));
    } else if (deltaY < -40) {
      // سحب لأعلى يرفع الورقة
      setTierSheetState((prev) => (prev === 'minimized' ? 'middle' : 'expanded'));
    }
    isTierDraggingRef.current = false;
    tierPointerStartYRef.current = null;
    tierPointerCurrentYRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch (_) {}
  }, []);

  const handleTierKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setTierSheetState((prev) => (prev === 'minimized' ? 'middle' : 'expanded'));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setTierSheetState((prev) => (prev === 'expanded' ? 'middle' : 'minimized'));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setTierSheetState((prev) => (prev === 'middle' ? 'expanded' : prev === 'expanded' ? 'minimized' : 'middle'));
    }
  }, []);

  // مرجع لتتبع مرحلة الرحلة بدقة ومنع ارتداد الوجهة
  const stageRef = useRef(stage);
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);
  const isProgrammaticMoveRef = useRef(false);

  // معالجة السحب الموحد عبر Pointer Events مع دعم الشاشات اللمسية والفأرة والقلم
  const handleSheetPointerDown = useCallback((e: React.PointerEvent) => {
    try {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    } catch (_) {}
    sheetPointerStartYRef.current = e.clientY;
    sheetPointerCurrentYRef.current = e.clientY;
    isSheetDraggingRef.current = true;
  }, []);

  const handleSheetPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isSheetDraggingRef.current || sheetPointerStartYRef.current === null) return;
    sheetPointerCurrentYRef.current = e.clientY;
  }, []);

  const handleSheetPointerUp = useCallback((e: React.PointerEvent) => {
    if (!isSheetDraggingRef.current || sheetPointerStartYRef.current === null || sheetPointerCurrentYRef.current === null) {
      isSheetDraggingRef.current = false;
      sheetPointerStartYRef.current = null;
      sheetPointerCurrentYRef.current = null;
      return;
    }
    const deltaY = sheetPointerCurrentYRef.current - sheetPointerStartYRef.current;
    if (deltaY > 50) {
      // سحب لأسفل
      setRideSheetState((prev) => (prev === 'expanded' ? 'middle' : 'minimized'));
    } else if (deltaY < -50) {
      // سحب لأعلى
      setRideSheetState((prev) => (prev === 'minimized' ? 'middle' : 'expanded'));
    }
    isSheetDraggingRef.current = false;
    sheetPointerStartYRef.current = null;
    sheetPointerCurrentYRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch (_) {}
  }, []);

  const handleSheetKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setRideSheetState((prev) => (prev === 'minimized' ? 'middle' : 'expanded'));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setRideSheetState((prev) => (prev === 'expanded' ? 'middle' : 'minimized'));
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setRideSheetState((prev) => (prev === 'middle' ? 'expanded' : prev === 'expanded' ? 'minimized' : 'middle'));
    }
  }, []);

  // فحص الكباتن الفعليين القريبين من الخادم لتوحيد المصدر ومنع تناقض الرسائل
  const [nearbyDriversCount, setNearbyDriversCount] = useState<number | null>(null);

  useEffect(() => {
    let isCancelled = false;
    async function checkNearbyDrivers() {
      try {
        const { data } = await http.get<any>('/drivers/nearby', {
          params: {
            lat: pickup.lat,
            lon: pickup.lng,
            tripType: 'taxi',
            vehicleType: selectedTierId,
            rangeKm: 25,
          },
        });
        if (!isCancelled) {
          const list = Array.isArray(data) ? data : (data?.drivers || data?.data || []);
          setNearbyDriversCount(list.length);
        }
      } catch (_) {
        if (!isCancelled) setNearbyDriversCount(0);
      }
    }
    checkNearbyDrivers();
    const interval = setInterval(checkNearbyDrivers, 15000);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [pickup.lat, pickup.lng, selectedTierId]);

  // جلب سائقي الخط الدائم من المعالج المتزامن (PostgreSQL + Redis) عند تفعيل زر الخطوط الدائمية
  useEffect(() => {
    if (!showCommuteRoutes) {
      setCommuteDrivers([]);
      return;
    }
    let isCancelled = false;
    async function fetchCommuteDrivers() {
      try {
        const { data } = await http.get<any>('/drivers/nearby', {
          params: {
            lat: pickup.lat,
            lon: pickup.lng,
            tripType: 'commute',
          },
        });
        if (!isCancelled) {
          const raw = data;
          const list: any[] = Array.isArray(raw)
            ? raw
            : (Array.isArray(raw?.drivers) ? raw.drivers : (Array.isArray(raw?.data) ? raw.data : []));
          setCommuteDrivers(list);
        }
      } catch (_) {
        if (!isCancelled) setCommuteDrivers([]);
      }
    }
    fetchCommuteDrivers();
    const interval = setInterval(fetchCommuteDrivers, 15000);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [pickup.lat, pickup.lng, showCommuteRoutes]);

  // إعادة ضبط مسار الخط الدائمي عند تغيير أو إغلاق الكابتن
  useEffect(() => {
    setShowCommuteRoute(false);
    setCommuteRouteCoordinates(null);
  }, [selectedCommuteDriver?.driverId, selectedCommuteDriver?.id]);

  // إظهار أو إخفاء مسار كابتن الخط الدائمي على الشوارع (Redis Cache)
  async function handleToggleCommuteRoute() {
    if (showCommuteRoute) {
      setShowCommuteRoute(false);
      setCommuteRouteCoordinates(null);
      return;
    }
    if (!selectedCommuteDriver) return;
    const drvId = selectedCommuteDriver.driverId || selectedCommuteDriver.id;
    if (!drvId) return;

    setIsLoadingCommuteRoute(true);
    try {
      const res = await http.get<{
        success?: boolean;
        coordinates?: [number, number][];
        source?: string;
      }>(`/drivers/${drvId}/route-geometry`);
      if (res.data?.success && Array.isArray(res.data.coordinates) && res.data.coordinates.length > 0) {
        setCommuteRouteCoordinates(res.data.coordinates);
        setShowCommuteRoute(true);
        try {
          const coords = res.data.coordinates;
          let minLng = coords[0][0], maxLng = coords[0][0];
          let minLat = coords[0][1], maxLat = coords[0][1];
          coords.forEach(([lng, lat]) => {
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
          });
          mapRef.current?.fitBounds(
            [[minLng, minLat], [maxLng, maxLat]],
            { padding: { top: 120, bottom: 280, left: 40, right: 40 }, duration: 800 }
          );
        } catch (_) {}
      } else {
        show('تعذر جلب مسار الكابتن حالياً', 'warning');
      }
    } catch (_) {
      show('تعذر جلب مسار الكابتن', 'error');
    } finally {
      setIsLoadingCommuteRoute(false);
    }
  }

  // حالة الـ GPS والتنبيهات المخصصة لـ iOS Safari
  const [isLocatingCurrent, setIsLocatingCurrent] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [showMapHint, setShowMapHint] = useState(false);
  const locationErrorTimerRef = useRef<number | null>(null);
  const mapHintTimerRef = useRef<number | null>(null);

  const triggerLocationError = useCallback((msg: string) => {
    if (locationErrorTimerRef.current) {
      window.clearTimeout(locationErrorTimerRef.current);
    }
    setLocationError(msg);
    // إخفاء رسالة الخطأ تلقائياً بعد مرور 5 ثوانٍ
    locationErrorTimerRef.current = window.setTimeout(() => {
      setLocationError(null);
    }, 5000);
  }, []);

  const triggerMapHint = useCallback(() => {
    if (mapHintTimerRef.current) {
      window.clearTimeout(mapHintTimerRef.current);
    }
    setShowMapHint(true);
    mapHintTimerRef.current = window.setTimeout(() => {
      setShowMapHint(false);
    }, 6000);
  }, []);

  // كاش المتصفح: الأماكن المفضلة والأماكن الأخيرة
  const [, setFavoritePlaces] = useState<FavoritePlace[]>(() => getFavoritePlaces());
  const [recentPlacesList, setRecentPlacesList] = useState<RecentPlaceItem[]>(() => getRecentPlaces());

  // استعادة الطلب المحفوظ تلقائياً عند تحديث الصفحة أو الخروج منها والعودة
  useEffect(() => {
    initAudioUnlock();
    const rawSaved = localStorage.getItem('TAWSEELA_ACTIVE_TAXI_RIDE');
    let savedReqId: string | null = null;
    if (rawSaved) {
      try {
        const saved = JSON.parse(rawSaved);
        if (saved?.rideRequestId && (saved.stage === 'searching' || saved.stage === 'driver_arriving')) {
          savedReqId = saved.rideRequestId;
          setRideRequestId(saved.rideRequestId);
          setStage(saved.stage);
          if (saved.rideStatus) setRideStatus(saved.rideStatus);
          if (saved.pickup) setPickup(saved.pickup);
          if (saved.pickupName) setPickupName(saved.pickupName);
          if (saved.dropoff) setDropoff(saved.dropoff);
          if (saved.dropoffName) setDropoffName(saved.dropoffName);
          if (saved.selectedTierId) setSelectedTierId(saved.selectedTierId);
          if (saved.assignedDriverInfo) setAssignedDriverInfo(saved.assignedDriverInfo);
          if (saved.routeCoordinates) setRouteCoordinates(saved.routeCoordinates);
          if (saved.pickup?.lng && saved.pickup?.lat) {
            setTimeout(() => {
              mapRef.current?.flyTo({ center: [saved.pickup.lng, saved.pickup.lat], zoom: 15, duration: 600 });
            }, 300);
          }

          // فحص حالة الطلب من الخادم
          http
            .get<{
              success: boolean;
              request?: {
                status: string;
                assignedDriverId?: string;
                assignedDriverName?: string;
                assignedDriverPhone?: string;
                assignedDriverVehicle?: string;
                acceptedDriverId?: string;
              };
            }>(`/ride/status/${saved.rideRequestId}`)
            .then((res) => {
              if (res.data?.success && res.data.request) {
                const req = res.data.request;
                const s = (req.status || '').toLowerCase();
                if (s === 'accepted' || s === 'arrived' || s === 'inprogress' || s === 'in_progress') {
                  setStage('driver_arriving');
                  setRideStatus(req.status);
                  if (s === 'arrived') {
                    setRouteCoordinates(null);
                    if (!hasNotifiedArrivalRef.current) {
                      hasNotifiedArrivalRef.current = true;
                      show('الكابتن وصل إلى موقعك الآن! 🚖 بيب بيب', 'success', 7000);
                      playCarHornBeep();
                    }
                  }
                } else if (s === 'pending') {
                  setStage('searching');
                  setRideStatus('Pending');
                  setAssignedDriverInfo(null);
                } else if (
                  [
                    'completed',
                    'ridecompleted',
                    'arrived_destination',
                    'cancelled',
                    'canceled',
                    'declined',
                    'driver_declined',
                    'driver_cancelled',
                    'rejected',
                    'expired',
                    'nodriversavailable',
                    'no_drivers'
                  ].includes(s)
                ) {
                  // إزالة الطلب ومسح الخط عند الانتهاء أو الإلغاء
                  hasNotifiedArrivalRef.current = false;
                  localStorage.removeItem('TAWSEELA_ACTIVE_TAXI_RIDE');
                  setStage('ride_options');
                  setRideRequestId(null);
                  setAssignedDriverInfo(null);
                  setLiveDriverPosition(null);
                  setRouteCoordinates(null);
                  if (['nodriversavailable', 'no_drivers', 'expired', 'driver_declined'].includes(s)) {
                    setNoDriversModalOpen(true);
                  }
                }

                if (s !== 'pending' && (req.assignedDriverName || req.assignedDriverPhone)) {
                  setAssignedDriverInfo((prev) => ({
                    ...prev,
                    driverId: req.acceptedDriverId || req.assignedDriverId || prev?.driverId,
                    driverName: req.assignedDriverName || prev?.driverName,
                    driverPhone: req.assignedDriverPhone || prev?.driverPhone,
                    driverVehicle: req.assignedDriverVehicle || prev?.driverVehicle,
                    driverTier: (req as any).assignedDriverTier || (req as any).driverTier || (req as any).vehicleType || prev?.driverTier,
                  }));
                }
              }
            })
            .catch(() => {});
        }
      } catch (_) {}
    }

    // شبكة أمان إضافية من الخادم
    if (!savedReqId) {
      const custId = session?.userId || storage.getUserId();
      const phoneId = rawPhone;
      const targetQuery = custId || phoneId;
      if (targetQuery) {
        http
          .get<{ success: boolean; activeRide?: any }>(`/customer/${encodeURIComponent(targetQuery)}/active-ride`)
          .then((res) => {
            if (res.data?.success && res.data.activeRide) {
              const r = res.data.activeRide;
              setRideRequestId(r.id);
              const curStage = (r.status === 'Accepted' || r.status === 'Arrived' || r.status === 'InProgress' || r.status === 'in_progress') ? 'driver_arriving' : 'searching';
              setStage(curStage);
              setRideStatus(r.status);
              if (r.pickupLat && r.pickupLon) {
                setPickup({ lat: parseFloat(r.pickupLat), lng: parseFloat(r.pickupLon) });
              }
              if (r.pickupName) setPickupName(r.pickupName);
              if (r.dropoffLat && r.dropoffLon) {
                setDropoff({ lat: parseFloat(r.dropoffLat), lng: parseFloat(r.dropoffLon) });
              }
              if (r.dropoffName) setDropoffName(r.dropoffName);
              if (curStage === 'driver_arriving' && (r.assignedDriverName || r.assignedDriverPhone)) {
                setAssignedDriverInfo({
                  driverId: r.acceptedDriverId || r.assignedDriverId,
                  driverName: r.assignedDriverName,
                  driverPhone: r.assignedDriverPhone,
                  driverVehicle: r.assignedDriverVehicle,
                  driverTier: (r as any).assignedDriverTier || (r as any).driverTier || r.vehicleType,
                });
              } else if (curStage === 'searching') {
                setAssignedDriverInfo(null);
              }
            }
          })
          .catch(() => {});
      }
    }

    // جلب أسباب الإلغاء ورسوم الإلغاء المعتمدة من الخادم
    http.get<{ success: boolean; riderReasons?: string[]; cancellationFeeIqd?: number }>('/ride/cancellation-reasons')
      .then(({ data }) => {
        if (data?.success && Array.isArray(data.riderReasons) && data.riderReasons.length > 0) {
          setCancelReasonsList(data.riderReasons);
        }
        if (data?.cancellationFeeIqd) {
          setCancelFeeAmount(data.cancellationFeeIqd);
        }
      })
      .catch(() => {});
  }, []);

  // مزامنة حالة الطلب في التخزين المحلي لحمايته من اختفاء الطلب عند التحديث أو الخروج
  useEffect(() => {
    if (rideRequestId && (stage === 'searching' || stage === 'driver_arriving')) {
      const dataToSave = {
        rideRequestId,
        stage,
        rideStatus,
        pickup,
        pickupName,
        dropoff,
        dropoffName,
        selectedTierId,
        assignedDriverInfo,
        routeCoordinates,
      };
      localStorage.setItem('TAWSEELA_ACTIVE_TAXI_RIDE', JSON.stringify(dataToSave));
    }
  }, [rideRequestId, stage, rideStatus, pickup, pickupName, dropoff, dropoffName, selectedTierId, assignedDriverInfo, routeCoordinates]);

  // دالة التوسيط التلقائي السلس عند فتح شاشة التكسي لأول مرة
  const autoLocateUserOnMapReady = useCallback((mapInstance?: any) => {
    // تشغيل التوسيط التلقائي لمرة واحدة فقط لمنع إزعاج المستخدم عند الاستكشاف
    if (hasAutoLocatedRef.current) return;
    hasAutoLocatedRef.current = true;

    // التحقق من دعم المتصفح لتحديد الموقع الجغرافي
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return;
    }

    // إذا كانت هناك رحلة نشطة جارية أو تم استعادتها من التخزين، لا نعيد كتابة نقطة الانطلاق
    const rawSaved = localStorage.getItem('TAWSEELA_ACTIVE_TAXI_RIDE');
    if (rawSaved) {
      try {
        const parsed = JSON.parse(rawSaved);
        if (parsed?.rideRequestId && (parsed.stage === 'searching' || parsed.stage === 'driver_arriving')) {
          return;
        }
      } catch (_) {}
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        // حماية حتمية: إذا انتقل المستخدم بالفعل لاختيار الوجهة، لا نغير نقطة الانطلاق ولا نحرك الكاميرا
        if (stageRef.current !== 'pickup') return;

        const { latitude, longitude } = pos.coords;
        const userPoint: LngLat = { lat: latitude, lng: longitude };

        // تحريك كاميرا الخريطة بسلاسة مع وسم الحركة بأنها برمجية لمنع ارتداد الوجهة
        const targetMap = mapInstance || mapRef.current?.getMap?.() || mapRef.current;
        if (targetMap && typeof targetMap.flyTo === 'function') {
          isProgrammaticMoveRef.current = true;
          targetMap.flyTo({
            center: [longitude, latitude],
            zoom: 16,
            essential: true,
            duration: 1200,
          });
        }

        // تحديث إحداثيات نقطة الانطلاق بموقع المستخدم الحقيقي
        setPickup(userPoint);

        // تشغيل العكس الجغرافي (Reverse Geocoding) تلقائياً لتحديث اسم الشارع/الحي وكشف المحافظة
        try {
          const addr = await reverseGeocode(userPoint);
          const detected = detectGovernorate(latitude, longitude, addr || undefined);
          setSelectedCity(detected.name);
          if (stageRef.current === 'pickup') {
            setPickupName(addr || 'موقعي الحالي عبر الـ GPS 📍');
          }
        } catch (_) {
          const detected = detectGovernorate(latitude, longitude);
          setSelectedCity(detected.name);
          if (stageRef.current === 'pickup') {
            setPickupName('موقعي الحالي عبر الـ GPS 📍');
          }
        }
      },
      (err) => {
        // عند الفشل أو الرفض: البقاء بسلامة وهدوء على المركز الافتراضي الحالي دون رسائل خطأ مزعجة
        console.warn('[AutoGeolocation] Location unavailable or denied, using default center:', err.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 10000,
      }
    );
  }, []);

  // محاولة التوسيط التلقائي لمرة واحدة عند جاهزية مرجع الخريطة
  useEffect(() => {
    if (!hasAutoLocatedRef.current && mapRef.current) {
      autoLocateUserOnMapReady(mapRef.current);
    }
  }, [autoLocateUserOnMapReady]);

  // تحديث العنوان عند تحريك الخريطة في مرحلتي الانطلاق والوصول مع منع الارتداد البرمجي
  const handleMapMoveEnd = useCallback(
    async (e: { viewState: { latitude: number; longitude: number } }) => {
      if (showMapHint) setShowMapHint(false);
      // إذا كانت الحركة ناجمة عن flyTo برمجي، نتجاهلها لمنع ارتداد الوجهة
      if (isProgrammaticMoveRef.current) {
        isProgrammaticMoveRef.current = false;
        return;
      }
      if (stage !== 'pickup' && stage !== 'dropoff') return;

      const newPt: LngLat = { lat: e.viewState.latitude, lng: e.viewState.longitude };
      if (stage === 'pickup') {
        setPickup(newPt);
        try {
          const address = await reverseGeocode(newPt);
          if (address) setPickupName(address);
        } catch (_) {}
      } else if (stage === 'dropoff') {
        setDropoff(newPt);
        try {
          const address = await reverseGeocode(newPt);
          if (address) setDropoffName(address);
        } catch (_) {}
      }
    },
    [stage, showMapHint]
  );

  // النقر المباشر على الخريطة
  function handleMapClick(e: MapMouseEvent) {
    if (stage === 'driver_arriving') {
      if (rideSheetState === 'expanded') {
        setRideSheetState('middle');
      } else if (rideSheetState === 'middle') {
        setRideSheetState('minimized');
      }
      return;
    }
    if (stage === 'ride_options' || stage === 'searching') return;

    const point: LngLat = { lat: e.lngLat.lat, lng: e.lngLat.lng };
    if (stage === 'pickup') {
      setPickup(point);
      mapRef.current?.flyTo({ center: [point.lng, point.lat], duration: 500 });
      void reverseGeocode(point).then((addr) => {
        if (addr) setPickupName(addr);
      });
    } else {
      setDropoff(point);
      mapRef.current?.flyTo({ center: [point.lng, point.lat], duration: 500 });
      void reverseGeocode(point).then((addr) => {
        if (addr) setDropoffName(addr);
      });
    }
  }

  // زر تحديد الموقع الحالي عبر GPS المتوافق مع معايير iOS Safari الصارمة
  function handleUseCurrentLocation() {
    setIsLocatingCurrent(true);
    setLocationError(null);

    getCurrentPositionWithFallback(
      async (pos) => {
        setIsLocatingCurrent(false);
        setLocationError(null);
        setShowMapHint(false);

        const point: LngLat = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        mapRef.current?.flyTo({ center: [point.lng, point.lat], zoom: 15.5, duration: 800 });
        const addr = await reverseGeocode(point);
        const detectedGov = detectGovernorate(pos.coords.latitude, pos.coords.longitude, addr || undefined);
        setSelectedCity(detectedGov.name);

        if (stage === 'pickup') {
          setPickup(point);
          if (addr) setPickupName(addr);
          else setPickupName('موقعي الحالي عبر الـ GPS 📍');
        } else if (stage === 'dropoff') {
          setDropoff(point);
          if (addr) setDropoffName(addr);
          else setDropoffName('موقعي الحالي عبر الـ GPS 📍');
        }
        show('تم تحديد موقعك الحالي بنجاح 📍', 'success', 3000);
      },
      (_err, isPermissionDenied) => {
        setIsLocatingCurrent(false);

        // التراجع عن استخدام الموقع إذا تعذر:
        // تعيين الكاميرا افتراضياً على مركز العراق
        const iraqCenter = iraqCenterLngLat();
        mapRef.current?.flyTo({ center: [iraqCenter.lng, iraqCenter.lat], zoom: 12, duration: 800 });

        // تفعيل التلميح البصري فوق الخريطة: "يمكنك تحريك الخريطة لوضع الدبوس على موقعك الحالي 📍"
        triggerMapHint();

        if (isPermissionDenied) {
          // معالجة خطأ PERMISSION_DENIED لـ iOS Safari و PWA
          const isIOS = isIosDevice();
          const isPWA = isStandalonePwa();
          const permissionMessage = isIOS
            ? isPWA
              ? 'يرجى السماح بالوصول للموقع من إعدادات الهاتف > الخصوصية > خدمات الموقع > تطبيق توصيلة'
              : 'يرجى السماح بالوصول للموقع من إعدادات الهاتف > الخصوصية > خدمات الموقع > Safari'
            : 'يرجى السماح بالوصول إلى موقعك الجغرافي من إعدادات المتصفح';

          triggerLocationError(permissionMessage);
          show(permissionMessage, 'warning', 5000);
        } else {
          // تعذر تحديد الموقع بعد المحاولات أو Timeout
          const generalErrMsg = 'تعذر تحديد موقع GPS، يمكنك سحب الخريطة لتحديد مكانك';
          triggerLocationError(generalErrMsg);
          show(generalErrMsg, 'warning', 5000);
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 600000 }
    );
  }

  // بحث الأماكن في نافذة البحث (مضبوط بـ 350ms Debounce وتنقية أمنية ضد الحقن)
  function handleSearchChange(query: string) {
    const cleaned = sanitizeSearchQuery(query);
    setSearchQuery(query);
    if (searchTimer.current) window.clearTimeout(searchTimer.current);

    if (!cleaned) {
      setSearchResults([]);
      setIsSearchingPlaces(false);
      return;
    }

    setIsSearchingPlaces(true);
    const proximity = stage === 'pickup' ? pickup : dropoff;
    searchTimer.current = window.setTimeout(async () => {
      try {
        const results = await searchPlaces(cleaned, proximity);
        setSearchResults(results);
      } catch (err) {
        console.error('[Search] Failed:', err);
        setSearchResults([]);
      } finally {
        setIsSearchingPlaces(false);
      }
    }, 350);
  }

  // اختيار مكان من نتائج البحث وتحديث كاش الأماكن الأخيرة
  function handleSelectPlace(rawItem: any) {
    if (!rawItem) return;

    let lng: number | undefined;
    let lat: number | undefined;

    // 1. استخراج الإحداثيات من هيكل Mapbox Geocoding (geometry.coordinates = [lng, lat] أو center = [lng, lat])
    if (Array.isArray(rawItem.geometry?.coordinates) && rawItem.geometry.coordinates.length >= 2) {
      lng = Number(rawItem.geometry.coordinates[0]);
      lat = Number(rawItem.geometry.coordinates[1]);
    } else if (Array.isArray(rawItem.center) && rawItem.center.length >= 2) {
      lng = Number(rawItem.center[0]);
      lat = Number(rawItem.center[1]);
    } else if (Array.isArray(rawItem.coordinates) && rawItem.coordinates.length >= 2) {
      lng = Number(rawItem.coordinates[0]);
      lat = Number(rawItem.coordinates[1]);
    } else if (rawItem.coordinates && typeof rawItem.coordinates === 'object') {
      lat = Number(rawItem.coordinates.lat ?? rawItem.coordinates.latitude);
      lng = Number(rawItem.coordinates.lng ?? rawItem.coordinates.lon ?? rawItem.coordinates.longitude);
    }

    // 2. استخراج مباشر إذا كانت الخصائص lat / lon أو lat / lng
    if (lat === undefined || isNaN(lat)) {
      lat = Number(rawItem.lat ?? rawItem.latitude);
    }
    if (lng === undefined || isNaN(lng)) {
      lng = Number(rawItem.lng ?? rawItem.lon ?? rawItem.longitude);
    }

    if (lat === undefined || isNaN(lat) || lng === undefined || isNaN(lng)) {
      console.error('[Search] Invalid coordinates extracted:', rawItem);
      return;
    }

    // استخراج اسم المكان والعنوان
    const placeName =
      rawItem.name ||
      rawItem.text_ar ||
      rawItem.text ||
      rawItem.place_name_ar ||
      rawItem.place_name ||
      'موقع محدد';

    const address =
      rawItem.address ||
      (rawItem.place_name && rawItem.place_name !== placeName ? rawItem.place_name : undefined);

    // تحديث الـ State حسب مرحلة الاختيار (نقطة الانطلاق Pickup أو الوجهة Dropoff)
    if (stage === 'pickup') {
      setPickup({ lat, lng });
      setPickupName(placeName);
    } else {
      setDropoff({ lat, lng });
      setDropoffName(placeName);
    }

    // تحريك كاميرا الخريطة بسلاسة وتحديث موقع الدبوس (Marker)
    mapRef.current?.flyTo({
      center: [lng, lat],
      zoom: 16,
      essential: true,
      duration: 700,
    });

    // حفظ الموقع في كاش الأماكن الأخيرة (LocalStorage Cache)
    addRecentPlace({ name: placeName, address, lat, lng });
    setRecentPlacesList(getRecentPlaces());

    // إغلاق نافذة البحث وتصفير حقولها
    setIsSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
  }

  // اختيار محافظة من نافذة اختيار المحافظة
  function handleSelectCity(city: CityItem) {
    setSelectedCity(city.name);
    if (stage === 'pickup') {
      setPickup({ lat: city.lat, lng: city.lng });
      setPickupName(city.name);
    } else {
      setDropoff({ lat: city.lat, lng: city.lng });
      setDropoffName(city.name);
    }
    mapRef.current?.flyTo({ center: [city.lng, city.lat], zoom: 13, duration: 800 });
    setIsCitySelectorOpen(false);
    setCitySearchQuery('');
    show(`تم التوسيط على محافظة: ${city.name} 📍`, 'success');
  }

  // زر "محافظتك الحالية" عبر الـ GPS
  function handleSelectCurrentCity() {
    setIsCitySelectorOpen(false);
    handleUseCurrentLocation();
  }

  // البحث الصوتي
  function handleMicClick() {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      show('الإملاء الصوتي غير مدعوم في متصفحك', 'warning');
      return;
    }
    try {
      const rec = new SpeechRec();
      rec.lang = 'ar-IQ';
      rec.continuous = false;
      rec.interimResults = false;
      rec.onstart = () => {
        setIsListeningMic(true);
        show('تحدث الآن للبحث... 🎙️', 'info');
      };
      rec.onresult = (event: any) => {
        const transcript = event.results[0]?.[0]?.transcript;
        if (transcript) {
          setSearchQuery(transcript);
          handleSearchChange(transcript);
        }
        setIsListeningMic(false);
      };
      rec.onerror = () => setIsListeningMic(false);
      rec.onend = () => setIsListeningMic(false);
      rec.start();
    } catch (_) {
      setIsListeningMic(false);
    }
  }

  // 1. الانتقال من نقطة الانطلاق إلى نقطة الوصول
  function handleConfirmPickup() {
    setStage('dropoff');
    const nextDropoff = { lat: pickup.lat + 0.0055, lng: pickup.lng + 0.004 };
    setDropoff(nextDropoff);
    setDropoffName(DEFAULT_DROPOFF_NAME);
    mapRef.current?.flyTo({ center: [nextDropoff.lng, nextDropoff.lat], zoom: 15.2, duration: 700 });
    show('تم تثبيت نقطة الانطلاق! حدد وجهة الوصول 📍', 'success');
  }

  // 2. الانتقال من نقطة الوصول إلى خيارات الرحلة (الصورة 1)
  async function handleConfirmDropoff() {
    setStage('ride_options');
    // جلب مسار الشوارع الحقيقي ورسمه
    try {
      const res = await getDirections(pickup, dropoff);
      if (res.coordinates?.length) {
        setRouteCoordinates(res.coordinates.map((c) => [c.lng, c.lat]));
      }
    } catch (_) {
      setRouteCoordinates([
        [pickup.lng, pickup.lat],
        [dropoff.lng, dropoff.lat],
      ]);
    }
    // تحريك الخريطة لتشمل نقطتي الانطلاق والوصول
    const midLat = (pickup.lat + dropoff.lat) / 2;
    const midLng = (pickup.lng + dropoff.lng) / 2;
    mapRef.current?.flyTo({ center: [midLng, midLat], zoom: 14.3, duration: 800 });
  }

  // 3. زر الرجوع العائم في أعلى اليمين
  function handleBackNav() {
    if (stage === 'driver_arriving' || stage === 'searching') {
      setIsCancelTripOpen(true);
      setCancelReason(null);
    } else if (stage === 'ride_options') {
      setStage('dropoff');
      setRouteCoordinates([]);
      mapRef.current?.flyTo({ center: [dropoff.lng, dropoff.lat], zoom: 15.2, duration: 600 });
    } else if (stage === 'dropoff') {
      setStage('pickup');
      mapRef.current?.flyTo({ center: [pickup.lng, pickup.lat], zoom: 15.2, duration: 600 });
    }
  }



  // جلب الأسعار الديناميكية الذكية وحساب الذروة (Baly-like Dynamic Surge Pricing)
  useEffect(() => {
    if (stage !== 'ride_options' && stage !== 'searching') return;
    let isCancelled = false;

    const fetchDynamicPricing = async () => {
      try {
        const dist = Math.max(0.5, Math.round(distanceKm(pickup, dropoff) * 10) / 10);
        const dur = Math.max(5, Math.round(dist * 2.5));

        const res = await http.post<any>('/rides/calculate-fare', {
          pickupLat: pickup.lat,
          pickupLon: pickup.lng,
          dropoffLat: dropoff.lat,
          dropoffLon: dropoff.lng,
          distanceKm: dist,
          durationMins: dur,
          vehicleType: selectedTierId,
          isRoundTrip: Boolean(isRoundTrip),
          hasSecondStop: Boolean(secondDestination.trim()),
          stopDuration: isRoundTrip ? roundTripWaitMinutes : (stopDuration || 0),
          promoCode: appliedPromo ? 'PROMO20' : ''
        });

        if (isCancelled || !res.data || !res.data.success) return;

        const mainData = res.data;
        // Authoritative tier fares computed exclusively by the backend (Strict 250 IQD multiples)
        const savingFare = mainData.tierFares?.saving || mainData.tierFares?.economy || 3000;
        const superFare = mainData.tierFares?.super || 3250;
        const plusFare = mainData.tierFares?.plus || 3500;
        const selectedFare = selectedTierId === 'saving' ? savingFare : (selectedTierId === 'plus' ? plusFare : (mainData.fare || superFare));

        setDynamicPricingData({
          superFare,
          savingFare,
          plusFare,
          selectedFare,
          breakdown: mainData.breakdown || null,
          surgeBadge: mainData.surgeBadge || null,
          discountBadge: mainData.discountBadge || null
        });
      } catch (e) {
        console.warn('[Pricing] Could not fetch dynamic fare:', e);
      }
    };

    fetchDynamicPricing();
    return () => { isCancelled = true; };
  }, [stage, pickup.lat, pickup.lng, dropoff.lat, dropoff.lng, selectedTierId, isRoundTrip, roundTripWaitMinutes, secondDestination, stopDuration, appliedPromo]);

  // استعراض سعر الفئة المحدد رسمياً من الخادم بدون أي حسابات رياضية على العميل
  const getTierPrice = (tier: RideTier) => {
    if (selectedTierId === tier.id && dynamicPricingData.selectedFare) {
      return dynamicPricingData.selectedFare;
    }
    return tier.id === 'saving'
      ? (dynamicPricingData.savingFare || tier.basePrice)
      : tier.id === 'plus'
      ? (dynamicPricingData.plusFare || tier.basePrice)
      : (dynamicPricingData.superFare || tier.basePrice);
  };

  const currentTier = RIDE_TIERS.find((t) => t.id === selectedTierId) || RIDE_TIERS[0];
  const calculatedPrice = getTierPrice(currentTier);

  // إنهاء بحث الراكب وتنظيف الحالة وإظهار نافذة عدم توفر كباتن
  const handleNoDriversAvailable = useCallback((_customMsg?: string) => {
    hasNotifiedArrivalRef.current = false;
    try {
      localStorage.removeItem('TAWSEELA_ACTIVE_TAXI_RIDE');
    } catch (_) {}
    setStage('ride_options');
    setRideRequestId(null);
    setRideStatus(null);
    setAssignedDriverInfo(null);
    setLiveDriverPosition(null);
    setRouteCoordinates(null);
    setNoDriversModalOpen(true);
  }, []);

  // طلب التكسي النهائي — إرسال حقيقي للخادم مع Idempotency-Key
  async function handleOrderTrip() {
    if (isSubmittingOrder) return;
    setIsSubmittingOrder(true);
    try {
      const dist = distanceKm(pickup, dropoff);
      const userId = session?.userId || storage.getUserId() || 'cust-' + Date.now();
      const idempotencyKey = `order-${userId}-${Date.now()}`;
      const { data } = await http.post<{
        success: boolean;
        request?: {
          id: string;
          assignedDriverId?: string;
          assignedDriverName?: string;
          assignedDriverPhone?: string;
          assignedDriverVehicle?: string;
        };
        assignedDriver?: any;
        error?: string;
      }>('/ride/request', {
        customerId: userId,
        customerName: customerName,
        customerPhone: rawPhone,
        pickupName: pickupName || DEFAULT_PICKUP_NAME,
        pickupLat: pickup.lat,
        pickupLon: pickup.lng,
        dropoffName: dropoffName || DEFAULT_DROPOFF_NAME,
        dropoffLat: dropoff.lat,
        dropoffLon: dropoff.lng,
        fare: calculatedPrice,
        promoCode: appliedPromo ? 'PROMO20' : '',
        distanceKm: Math.max(0.5, Math.round(dist * 10) / 10),
        durationMins: Math.max(5, Math.round(dist * 2.5)),
        vehicleType: selectedTierId,
        isRoundTrip: Boolean(isRoundTrip),
        tripType: isRoundTrip ? 'ROUND_TRIP' : 'ONE_WAY',
        secondDestination: secondDestination.trim(),
        hasSecondStop: Boolean(secondDestination.trim()),
        stopDuration: isRoundTrip ? roundTripWaitMinutes : (stopDuration || 0),
        expectedWaitMinutes: isRoundTrip ? roundTripWaitMinutes : 0,
        returnDestination: isRoundTrip ? (returnDestinationAddress.trim() || pickupName) : undefined,
        rangeKm: 25,
      }, {
        headers: { 'Idempotency-Key': idempotencyKey }
      });

      if (data.success && data.request) {
        hasNotifiedArrivalRef.current = false;
        hasTriggeredRatingRef.current = false;
        setRideRequestId(data.request.id);
        setRideStatus('Pending');
        setAssignedDriverInfo(null); // Strictly null until driver accepts!
        setStage('searching');
        try {
          localStorage.setItem('TAWSEELA_ACTIVE_TAXI_RIDE', JSON.stringify({
            rideRequestId: data.request.id,
            stage: 'searching',
            rideStatus: 'Pending',
            pickup,
            pickupName,
            dropoff,
            dropoffName,
            selectedTierId,
            isRoundTrip: Boolean(isRoundTrip),
            secondDestination: secondDestination.trim(),
            stopDuration: stopDuration || 0,
            assignedDriverInfo: null,
            routeCoordinates,
          }));
        } catch (_) {}
        show('تم إرسال طلبك! جاري البحث عن كابتن بانتظار الموافقة 🚖', 'info');
      } else {
        show(data.error || 'تعذر إرسال الطلب، يرجى المحاولة لاحقاً', 'error');
      }
    } catch (err: any) {
      const errData = err?.response?.data;
      if (errData?.noDriversInTier || errData?.noDriversInRadius) {
        handleNoDriversAvailable(errData.error);
      } else if (errData?.error) {
        show(errData.error, err?.response?.status === 400 && errData.activeRideExists ? 'warning' : 'error');
      } else {
        show('تعذر الاتصال بالخادم، يرجى التحقق من اتصال الإنترنت وإعادة المحاولة', 'error');
      }
    } finally {
      setIsSubmittingOrder(false);
    }
  }

  // مسح خط المسار من خريطة Mapbox وإزالة الدبابيس وتصفير الحالة عند انتهاء الرحلة
  const handleRideCompletedCleanup = useCallback(() => {
    hasNotifiedArrivalRef.current = false;
    localStorage.removeItem('TAWSEELA_ACTIVE_TAXI_RIDE');

    // 1. مسح طبقة ومصدر خط المسار من خريطة Mapbox
    const map = mapRef.current?.getMap?.();
    if (map) {
      try {
        if (map.getLayer('route-line')) map.removeLayer('route-line');
        if (map.getSource('route-source')) map.removeSource('route-source');
        if (map.getLayer('line-layer-route-line')) map.removeLayer('line-layer-route-line');
        if (map.getLayer('route-inner')) map.removeLayer('route-inner');
        if (map.getLayer('route-casing')) map.removeLayer('route-casing');
        if (map.getSource('line-route-line')) map.removeSource('line-route-line');
      } catch (_) {}
    }

    // 2. إزالة أي علامات أو دبابيس (Markers) متبقية خاصة بوجهة الرحلة السابقة
    setDropoff(DEFAULT_DROPOFF);
    setDropoffName(DEFAULT_DROPOFF_NAME);

    // 3. تصفير الـ state الخاصة بالمسار
    setRouteCoordinates(null);

    // 4. إعادة تركيز الكاميرا على الموقع الحالي للمستخدم أو وسط النجف
    const targetLng = pickup?.lng || DEFAULT_PICKUP.lng;
    const targetLat = pickup?.lat || DEFAULT_PICKUP.lat;
    mapRef.current?.flyTo({ center: [targetLng, targetLat], zoom: 15.2, duration: 800 });

    // 5. تصفير حالة الرحلة والرجوع لمرحلة الانطلاق
    setStage('pickup');
    setRideSheetState('expanded');
    setRideRequestId(null);
    setRideStatus(null);
    setAssignedDriverInfo(null);
    setLiveDriverPosition(null);
  }, [pickup]);

  // إظهار نافذة تقييم الكابتن للراكب فور اكتمال المشوار
  const triggerDriverRatingModal = useCallback((driverData?: any) => {
    if (hasTriggeredRatingRef.current) return;
    hasTriggeredRatingRef.current = true;

    const rideId = rideRequestId || '';
    const driverId = driverData?.driverId || driverData?.acceptedDriverId || driverData?.assignedDriverId || assignedDriverInfo?.driverId || 'driver_default';
    const driverName = driverData?.driverName || driverData?.assignedDriverName || assignedDriverInfo?.driverName || 'كابتن توصيله';
    const driverPhone = driverData?.driverPhone || driverData?.assignedDriverPhone || assignedDriverInfo?.driverPhone;
    const driverVehicle = driverData?.driverVehicle || driverData?.assignedDriverVehicle || assignedDriverInfo?.driverVehicle || 'كيا سيراتو 2022';
    const driverPlate = driverData?.driverPlate || assignedDriverInfo?.driverPlate || '١١٣٤٠ ة - النجف';
    const driverRating = driverData?.driverRating || assignedDriverInfo?.driverRating || 5.0;

    setCompletedDriverInfo({
      rideId,
      driverId,
      driverName,
      driverPhone,
      driverVehicle,
      driverPlate,
      driverRating,
    });
    setRatingStars(5);
    setSelectedTags([]);
    setRatingComment('');
    setIsRatingModalOpen(true);

    // مسح خط المسار وتصفير حالة الرحلة النشطة من الخريطة
    handleRideCompletedCleanup();
  }, [rideRequestId, assignedDriverInfo, handleRideCompletedCleanup]);

  // إرسال تقييم الراكب للكابتن إلى الباك إند
  async function handleRateDriverSubmit() {
    if (!completedDriverInfo) {
      setIsRatingModalOpen(false);
      return;
    }
    if (ratingStars <= 2 && !ratingComment.trim()) {
      show('يرجى توضيح سبب هذا التقييم لمساعدتنا على معالجة الأمر', 'error', 4000);
      return;
    }
    setIsSubmittingRating(true);
    try {
      const customerId = session?.userId || storage.getUserId() || formattedPhone || 'customer';
      const { data } = await http.post<{
        success: boolean;
        message?: string;
        pointsEarned?: number;
      }>('/customer/rate-driver', {
        rideId: completedDriverInfo.rideId,
        customerId,
        driverId: completedDriverInfo.driverId,
        rating: ratingStars,
        tags: selectedTags,
        comment: ratingComment,
      });

      if (data?.success) {
        if (ratingStars <= 2) {
          show('تم استلام تقييمك وتصعيده كبلاغ رسمي للتحقق والمعالجة الفورية 🛡️', 'success', 5000);
        } else {
          show('شكراً لك! تم إرسال تقييمك بنجاح ✨', 'success', 4000);
        }
      } else {
        show(data?.message || 'تم تسجيل تقييمك بنجاح ✨', 'success', 3000);
      }
    } catch (_) {
      show('شكراً لك! تم إرسال تقييمك بنجاح ✨', 'success', 3000);
    } finally {
      setIsSubmittingRating(false);
      setIsRatingModalOpen(false);
      setCompletedDriverInfo(null);
    }
  }

  // عداد وقت الانتظار اللحظي للعميل في محطة الذهاب
  useEffect(() => {
    const isWaiting = (rideStatus || '').toLowerCase() === 'waiting_at_destination';
    if (!isWaiting) {
      setCustomerWaitSeconds(0);
      return;
    }
    const waitStartedAt = completedRideBreakdown?.waitStartedAt || Date.now();
    const updateWait = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - new Date(waitStartedAt).getTime()) / 1000));
      setCustomerWaitSeconds(elapsed);
    };
    updateWait();
    const timer = setInterval(updateWait, 1000);
    return () => clearInterval(timer);
  }, [rideStatus, completedRideBreakdown?.waitStartedAt]);

  // تأكيد أو الاعتراض على الكروة نقداً من طرف الراكب
  const handleCustomerConfirmFare = async (confirmed: boolean = true) => {
    if (isSubmittingConfirmFare) return;
    const rideId = completedDriverInfo?.rideId || rideRequestId || (completedRideBreakdown?.id);
    if (!rideId) {
      show('معرّف المشوار غير متوفر', 'error');
      return;
    }

    setIsSubmittingConfirmFare(true);
    try {
      const idempotencyKey = `confirm-fare-${rideId}-${Date.now()}`;
      const { data } = await http.post<{ success: boolean; reconciliationStatus?: string; reviewFlag?: boolean; error?: string }>(
        '/ride/confirm-fare',
        {
          requestId: rideId,
          rideId,
          confirmed,
          note: confirmed ? undefined : 'اعتراض من الراكب على قيمة الكروة'
        },
        {
          headers: { 'Idempotency-Key': idempotencyKey }
        }
      );

      if (data?.success) {
        setIsFareConfirmedByCustomer(confirmed);
        setCompletedRideBreakdown((prev: any) => ({
          ...prev,
          riderConfirmed: confirmed,
          reconciliationStatus: data.reconciliationStatus || (confirmed ? 'settled' : 'pending_review'),
          reviewFlag: data.reviewFlag
        }));
        if (confirmed) {
          show('تم تأكيد دفع الكروة نقداً بنجاح! شكراً لك 💵✨', 'success');
        } else {
          show('تم تسجيل اعتراضك وسيقوم فريق المتابعة بمراجعة المشوار 🛡️', 'warning');
        }
      } else {
        show(data?.error || 'تعذر تأكيد الكروة، يرجى المحاولة ثانية', 'error');
      }
    } catch (err: any) {
      show('تعذر تأكيد الكروة حالياً', 'error');
    } finally {
      setIsSubmittingConfirmFare(false);
    }
  };

  // إرسال شكوى أو بلاغ مباشر
  async function handleSubmitComplaint() {
    if (!complaintText.trim()) {
      show('يرجى كتابة تفاصيل الشكوى بدقة', 'error', 3000);
      return;
    }
    setIsSubmittingComplaint(true);
    try {
      const customerId = session?.userId || storage.getUserId() || formattedPhone || 'customer';
      const { data } = await http.post<{ success: boolean; message?: string }>('/complaints/submit', {
        complainantId: customerId,
        complainantName: customerName || 'الراكب',
        complainantPhone: formattedPhone || '',
        accusedPhone: complaintDriverPhone.trim() || undefined,
        rideId: complaintRideId.trim() || (completedDriverInfo ? completedDriverInfo.rideId : (rideRequestId || undefined)),
        category: complaintCategory,
        complaintText: complaintText.trim()
      });
      if (data?.success) {
        show('تم استلام بلاغك وسيقوم فريق الدعم بالتحقق منه خلال وقت قصير ✅', 'success', 5000);
        setIsComplaintModalOpen(false);
        setComplaintText('');
        setComplaintDriverPhone('');
        setComplaintRideId('');
      } else {
        show(data?.message || 'تم استلام بلاغك وسيقوم فريق الدعم بالتحقق منه خلال وقت قصير ✅', 'success', 4000);
        setIsComplaintModalOpen(false);
      }
    } catch (_) {
      show('تم استلام بلاغك وسيقوم فريق الدعم بالتحقق منه خلال وقت قصير ✅', 'success', 4000);
      setIsComplaintModalOpen(false);
    } finally {
      setIsSubmittingComplaint(false);
    }
  }

  function handleSkipRating() {
    setIsRatingModalOpen(false);
    setCompletedDriverInfo(null);
    show('تم تخطي التقييم. شكراً لاستخدامك توصيلة! ✨', 'info', 2500);
  }

  function toggleRatingTag(tag: string) {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  // معالجة تحديث موقع السائق الحي مع تتبع سلس ووقت وصول ذكي واقتصادي في Mapbox
  const handleDriverPositionUpdate = useCallback(
    async (newPos: { lat: number; lng: number }, serverHeading?: number) => {
      if (!newPos || typeof newPos.lat !== 'number' || typeof newPos.lng !== 'number' || isNaN(newPos.lat) || isNaN(newPos.lng) || newPos.lat <= 0 || newPos.lng <= 0) return;

      const prev = prevDriverPositionRef.current;
      let movedMeters = 0;
      let stationary = false;

      if (prev) {
        movedMeters = distanceMeters(prev.lat, prev.lng, newPos.lat, newPos.lng);
        if (movedMeters < 3) {
          stationary = true;
          if (typeof serverHeading === 'number' && !isNaN(serverHeading) && serverHeading > 0) {
            setDriverHeading(serverHeading);
          }
        } else {
          stationary = false;
          const computedBearing = calculateBearing(prev.lat, prev.lng, newPos.lat, newPos.lng);
          setDriverHeading(computedBearing);
        }
      } else {
        if (typeof serverHeading === 'number' && !isNaN(serverHeading) && serverHeading > 0) {
          setDriverHeading(serverHeading);
        } else {
          const target = (rideStatus === 'InProgress' || rideStatus === 'in_progress') ? dropoff : pickup;
          if (target && target.lat && target.lng) {
            const initialBearing = calculateBearing(newPos.lat, newPos.lng, target.lat, target.lng);
            setDriverHeading(initialBearing);
          }
        }
      }

      setIsDriverStationary(stationary);
      prevDriverPositionRef.current = newPos;
      lastKnownDriverPosRef.current = newPos;
      setLiveDriverPosition(newPos);

      // في التتبع المباشر: لا نرسم خط مسار لتوفير استهلاك الخريطة
      if (routeCoordinates) setRouteCoordinates(null);

      // حساب وقت الوصول المتبقي (ETA) باقتصاد Mapbox
      const isTracking = stage === 'driver_arriving' || rideStatus === 'accepted' || rideStatus === 'arrived' || rideStatus === 'InProgress' || rideStatus === 'in_progress';
      const targetPoint = (rideStatus === 'InProgress' || rideStatus === 'in_progress') ? dropoff : pickup;

      if (isTracking && targetPoint && targetPoint.lat && targetPoint.lng) {
        const distToTarget = distanceMeters(newPos.lat, newPos.lng, targetPoint.lat, targetPoint.lng);

        if (distToTarget <= 50 || rideStatus === 'arrived') {
          setEtaText('الكابتن وصل 🚖');
          remainingSecondsRef.current = 0;
          return;
        }

        const now = Date.now();
        const timeSinceLastCall = now - lastDirectionsCallTimeRef.current;

        // الحالة أ: بدء التتبع (استدعاء أولي لمرة واحدة لحساب المسار والوقت الأولي)
        if (!trackingInitialDirectionsDoneRef.current) {
          trackingInitialDirectionsDoneRef.current = true;
          lastDirectionsCallTimeRef.current = now;
          directionsCallCountRef.current += 1;
          const count = directionsCallCountRef.current;
          (window as any).__DIRECTIONS_CALL_COUNT__ = count;
          console.log(`[Mapbox Directions Tracker] Call #${count}: Initial route & ETA calculated`);

          try {
            const origin: LngLat = { lat: newPos.lat, lng: newPos.lng };
            const dest: LngLat = { lat: targetPoint.lat, lng: targetPoint.lng };
            const res = await getDirections(origin, dest);
            if (res && res.durationMinutes) {
              const totalSec = Math.round(res.durationMinutes * 60);
              const totalDist = (res.distanceKm || 1) * 1000;
              initialDurationSecondsRef.current = totalSec;
              initialDistanceMetersRef.current = totalDist;
              remainingSecondsRef.current = totalSec;
              expectedRoutePointsRef.current = (res.rawGeoJson?.coordinates as Array<[number, number]>) || [];
              setEtaText(formatEtaArabic(totalSec, distToTarget));
            }
          } catch (_) {
            const fallbackSec = Math.round(distToTarget / 7);
            remainingSecondsRef.current = fallbackSec;
            setEtaText(formatEtaArabic(fallbackSec, distToTarget));
          }
          return;
        }

        // الحالة د: عند توقف الكابتن: جمّد العداد ولا تستدعِ Directions إطلاقاً
        if (stationary) {
          setEtaText((prev) => prev || formatEtaArabic(remainingSecondsRef.current, distToTarget));
          return;
        }

        // الحالة ب + ج: انحراف الكابتن > 500م عن المسار المتوقع + throttle كحد أدنى 60 ثانية
        let deviationMeters = 0;
        if (expectedRoutePointsRef.current.length > 0) {
          deviationMeters = minDistanceToPolylineMeters(newPos.lat, newPos.lng, expectedRoutePointsRef.current);
        }

        const shouldReroute = deviationMeters > 500 && timeSinceLastCall >= 60000;

        if (shouldReroute) {
          lastDirectionsCallTimeRef.current = now;
          directionsCallCountRef.current += 1;
          const count = directionsCallCountRef.current;
          (window as any).__DIRECTIONS_CALL_COUNT__ = count;
          console.log(`[Mapbox Directions Tracker] Call #${count}: Deviation detected (${Math.round(deviationMeters)}m > 500m), re-routing`);

          try {
            const origin: LngLat = { lat: newPos.lat, lng: newPos.lng };
            const dest: LngLat = { lat: targetPoint.lat, lng: targetPoint.lng };
            const res = await getDirections(origin, dest);
            if (res && res.durationMinutes) {
              const totalSec = Math.round(res.durationMinutes * 60);
              const totalDist = (res.distanceKm || 1) * 1000;
              initialDurationSecondsRef.current = totalSec;
              initialDistanceMetersRef.current = totalDist;
              remainingSecondsRef.current = totalSec;
              expectedRoutePointsRef.current = (res.rawGeoJson?.coordinates as Array<[number, number]>) || [];
              setEtaText(formatEtaArabic(totalSec, distToTarget));
            }
          } catch (_) {
            const fallbackSec = Math.round(distToTarget / 7);
            remainingSecondsRef.current = fallbackSec;
            setEtaText(formatEtaArabic(fallbackSec, distToTarget));
          }
          return;
        }

        // الحركة الطبيعية على المسار: إنقاص الوقت محلياً (Zero API Calls)
        if (initialDistanceMetersRef.current > 0 && initialDurationSecondsRef.current > 0) {
          const ratio = Math.min(1, Math.max(0, distToTarget / initialDistanceMetersRef.current));
          remainingSecondsRef.current = Math.round(initialDurationSecondsRef.current * ratio);
        } else {
          remainingSecondsRef.current = Math.round(distToTarget / 7);
        }

        setEtaText(formatEtaArabic(remainingSecondsRef.current, distToTarget));
      } else {
        setEtaText(null);
      }
    },
    [stage, rideStatus, pickup, dropoff, routeCoordinates]
  );

  // معالجة تغييرات حالة الرحلة مركزياً
  const handleRideStateChange = useCallback((req: any) => {
    if (!req) return;
    const status = (req.status || '').toLowerCase();

    // الاستماع المباشر لتنبيهات الهورن (بيب بيب 📢) الصادرة من السائق
    const incomingHornSeq = Number((req as any).hornSequence || 0);
    if (incomingHornSeq > 0 && incomingHornSeq > lastHeardHornSeqRef.current) {
      lastHeardHornSeqRef.current = incomingHornSeq;
      playCarHornBeep();
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        try {
          navigator.vibrate([250, 100, 250, 100, 400]);
        } catch (_) {}
      }
      show('الكابتن وصل وينبهك بالهورن! 🚖', 'success', 7000);
    }
    if (status === 'accepted') {
      setRideStatus('Accepted');
      if (stage !== 'driver_arriving') {
        setStage('driver_arriving');
        setRideSheetState('expanded');
        show('تم قبول رحلتك من قبل الكابتن! 🚖 الكابتن في طريقه إليك', 'success');
        mapRef.current?.flyTo({ center: [pickup.lng, pickup.lat], zoom: 15.5, duration: 700 });
      }
    } else if (status === 'arrived' || status === 'driver_arrived') {
      setRideStatus('Arrived');
      setRouteCoordinates(null);
      if (stage !== 'driver_arriving') {
        setStage('driver_arriving');
        setRideSheetState('expanded');
      }
      if (!hasNotifiedArrivalRef.current) {
        hasNotifiedArrivalRef.current = true;
        show('الكابتن وصل إلى موقعك الآن! 🚖 بيب بيب', 'success', 7000);
        playCarHornBeep();
      }
    } else if (status === 'inprogress' || status === 'in_progress' || status === 'in_trip') {
      if (rideStatus !== 'InProgress' && rideStatus !== 'in_progress') {
        setRideStatus('InProgress');
        if (stage !== 'driver_arriving') {
          setStage('driver_arriving');
        }
        show('انطلقت الرحلة الآن! الكابتن في الطريق إلى الوجهة 🚗💨', 'success', 5000);
        if (dropoff.lat && dropoff.lng) {
          mapRef.current?.flyTo({ center: [dropoff.lng, dropoff.lat], zoom: 14.8, duration: 800 });
        }
      }
    } else if (status === 'waiting_at_destination' || status === 'captain_waiting_at_destination') {
      setRideStatus('WAITING_AT_DESTINATION');
      if (req.waitStartedAt) {
        setCompletedRideBreakdown((prev: any) => ({ ...prev, waitStartedAt: req.waitStartedAt }));
      }
      show('وصلتم إلى المحطة الأولى! بدأ وقت الانتظار ⏳', 'info', 5000);
    } else if (status === 'in_trip_return') {
      setRideStatus('IN_TRIP_RETURN');
      show('انطلقت رحلة العودة الآن إلى نقطة الانطلاق 🔄', 'info', 5000);
    } else if (
      status === 'completed' ||
      status === 'ridecompleted' ||
      status === 'arrived_return' ||
      (status === 'arrived_destination' && !req.isRoundTrip && req.tripType !== 'ROUND_TRIP')
    ) {
      hasNotifiedArrivalRef.current = false;
      localStorage.removeItem('TAWSEELA_ACTIVE_TAXI_RIDE');
      setRouteCoordinates(null);
      setRideStatus(req.status || 'Completed');
      setCompletedRideBreakdown(req);
      triggerDriverRatingModal(req);
    } else if (
      [
        'cancelled',
        'canceled',
        'declined',
        'driver_declined',
        'driver_cancelled',
        'rejected',
        'expired',
        'nodriversavailable',
        'no_drivers',
        'no_driver_found'
      ].includes(status)
    ) {
      hasNotifiedArrivalRef.current = false;
      try {
        localStorage.removeItem('TAWSEELA_ACTIVE_TAXI_RIDE');
      } catch (_) {}
      if (['nodriversavailable', 'no_drivers', 'no_driver_found', 'expired', 'driver_declined', 'rejected', 'declined'].includes(status)) {
        handleNoDriversAvailable();
        return;
      }
      show('تم إلغاء الرحلة', 'warning', 6000);
      setStage('ride_options');
      setRideRequestId(null);
      setAssignedDriverInfo(null);
      setLiveDriverPosition(null);
      setRouteCoordinates(null);
    }

    if (status === 'accepted' || status === 'arrived' || status === 'driver_arrived' || status === 'inprogress' || status === 'in_progress' || status === 'in_trip' || status === 'waiting_at_destination' || status === 'in_trip_return') {
      if (req.assignedDriverName || req.assignedDriverPhone || req.driverName || req.driverPhone) {
        setAssignedDriverInfo((prev) => ({
          ...prev,
          driverId: req.acceptedDriverId || req.assignedDriverId || req.driverId || prev?.driverId,
          driverName: req.assignedDriverName || req.driverName || prev?.driverName,
          driverPhone: req.assignedDriverPhone || req.driverPhone || prev?.driverPhone,
          driverVehicle: req.assignedDriverVehicle || req.driverVehicle || prev?.driverVehicle,
          driverPlate: (req as any).driverPlate || (req as any).plateNumber || prev?.driverPlate || '١١٣٤٠ ة - النجف',
          driverRating: (req as any).driverRating || prev?.driverRating || 5.0,
          driverTier: (req as any).assignedDriverTier || (req as any).driverTier || req.vehicleType || prev?.driverTier,
        }));
      }
    } else if (status === 'pending') {
      if (stage !== 'searching') {
        setStage('searching');
      }
      setRideStatus('Pending');
      setAssignedDriverInfo(null);
    }
  }, [stage, rideStatus, pickup, dropoff, show, triggerDriverRatingModal, handleNoDriversAvailable]);

  // تتبع حالة الرحلة وبث الأحداث اللحظية عبر SSE مع احتياط نبض كل 20 ثانية (Tawseela IQ v72)
  useEffect(() => {
    if (!rideRequestId || (stage !== 'searching' && stage !== 'driver_arriving')) return;

    let isSseConnected = false;

    const checkStatus = async () => {
      if (document.hidden || isSseConnected) return;
      try {
        const { data } = await http.get<{
          success: boolean;
          request?: any;
        }>(`/ride/status/${rideRequestId}`);

        if (data.success && data.request) {
          handleRideStateChange(data.request);
        }
      } catch (_) {}
    };

    void checkStatus();
    // احتياط نبض كل 20 ثانية فقط في حال انقطاع SSE
    const interval = setInterval(checkStatus, 20000);

    // اتصال SSE اللحظي لتلقي تحديثات المشوار وموقع السائق فوراً
    let es: EventSource | null = null;
    try {
      const token = storage.getToken() || localStorage.getItem('token') || '';
      const lastIdQuery = lastCustomerEventIdRef.current ? `&lastEventId=${encodeURIComponent(lastCustomerEventIdRef.current)}` : '';
      const streamUrl = `${config.apiBaseUrl}/ride/${encodeURIComponent(rideRequestId)}/stream?token=${encodeURIComponent(token)}${lastIdQuery}`;
      es = new EventSource(streamUrl);

      es.onopen = () => {
        isSseConnected = true;
      };

      const handleCustomerEventId = (e: MessageEvent, data: any) => {
        const id = e.lastEventId || data?.eventId || data?.id;
        if (id) {
          const str = String(id);
          if (processedCustomerEventIdsRef.current.has(str)) return false;
          processedCustomerEventIdsRef.current.add(str);
          lastCustomerEventIdRef.current = str;
        }
        return true;
      };

      es.addEventListener('init', (e: MessageEvent) => {
        try {
          isSseConnected = true;
          const data = JSON.parse(e.data);
          if (!handleCustomerEventId(e, data)) return;
          if (data?.request) {
            handleRideStateChange(data.request);
          }
        } catch (_) {}
      });

      es.addEventListener('no_drivers_available', (e: MessageEvent) => {
        try {
          isSseConnected = true;
          const data = JSON.parse(e.data);
          if (!handleCustomerEventId(e, data)) return;
          handleNoDriversAvailable();
        } catch (_) {}
      });

      es.addEventListener('trip_update', (e: MessageEvent) => {
        try {
          isSseConnected = true;
          const data = JSON.parse(e.data);
          if (!handleCustomerEventId(e, data)) return;

          const evType = data?.event || data?.type;

          if (evType === 'no_drivers_available' || data?.status === 'NoDriversAvailable' || data?.status === 'NO_DRIVERS' || data?.status === 'no_drivers') {
            handleNoDriversAvailable();
            return;
          }

          if (evType === 'external_nav_active') {
            setIsExternalNavActive(true);
            if (data?.lastKnownLocation) {
              const rawLoc = data.lastKnownLocation;
              const latNum = Number(rawLoc.lat);
              const lngNum = Number(rawLoc.lng ?? rawLoc.lon);
              if (!isNaN(latNum) && !isNaN(lngNum)) {
                setLastKnownDriverLocation({ lat: latNum, lng: lngNum });
                handleDriverPositionUpdate({ lat: latNum, lng: lngNum });
              }
            }
          } else if (evType === 'external_nav_ended') {
            setIsExternalNavActive(false);
          }

          if (evType === 'max_wait_exceeded') {
            setMaxWaitExceeded(true);
            show('تم تجاوز الحد الأقصى لوقت الانتظار المسموح به ⚠️', 'warning', 7000);
          }

          if (data?.request) {
            handleRideStateChange(data.request);
          } else if (data?.status) {
            handleRideStateChange(data);
          }

          if (data?.event === 'driver_location' && data.location) {
            handleDriverPositionUpdate({ lat: data.location.lat, lng: data.location.lon }, data.location.heading);
          }
        } catch (_) {}
      });

      es.onerror = () => {
        isSseConnected = false;
      };
    } catch (sseErr) {
      console.warn('[SSE] Ride EventSource init error, falling back:', sseErr);
    }

    return () => {
      clearInterval(interval);
      if (es) {
        es.close();
      }
    };
  }, [rideRequestId, stage, handleRideStateChange, handleDriverPositionUpdate, show, handleNoDriversAvailable]);

  // اشتراك لحظي في أحداث الرحلة وموقع السائق عبر SignalR / Realtime
  useEffect(() => {
    if (!rideRequestId) return;
    void realtime.joinTrip(rideRequestId);
    const unsubStatus = realtime.onTripStatus((e) => {
      if (e.tripId === rideRequestId) {
        const evStatus = (e.status || '').toLowerCase();
        if (evStatus === 'accepted') {
          setRideStatus('Accepted');
          if (stage !== 'driver_arriving') {
            setStage('driver_arriving');
            setRideSheetState('expanded');
            show('تم قبول رحلتك من قبل الكابتن! 🚖', 'success');
          }
        } else if (evStatus === 'arrived' || evStatus === 'driver_arrived') {
          setRideStatus('Arrived');
          setRouteCoordinates(null);
          if (stage !== 'driver_arriving') {
            setStage('driver_arriving');
            setRideSheetState('expanded');
          }
          if (!hasNotifiedArrivalRef.current) {
            hasNotifiedArrivalRef.current = true;
            show('الكابتن وصل إلى موقعك الآن! 🚖 بيب بيب', 'success', 7000);
            playCarHornBeep();
          }
        } else if (evStatus === 'inprogress' || evStatus === 'in_progress') {
          if (rideStatus !== 'InProgress' && rideStatus !== 'in_progress') {
            setRideStatus('InProgress');
            if (stage !== 'driver_arriving') {
              setStage('driver_arriving');
            }
            show('انطلقت الرحلة الآن! الكابتن في الطريق إلى الوجهة 🚗💨', 'success', 5000);
            if (dropoff.lat && dropoff.lng) {
              mapRef.current?.flyTo({ center: [dropoff.lng, dropoff.lat], zoom: 14.8, duration: 800 });
            }
          }
        } else if (evStatus === 'completed' || evStatus === 'ridecompleted' || evStatus === 'arrived_destination') {
          hasNotifiedArrivalRef.current = false;
          localStorage.removeItem('TAWSEELA_ACTIVE_TAXI_RIDE');
          setRouteCoordinates(null);
          triggerDriverRatingModal(assignedDriverInfo);
        } else if (
          [
            'cancelled',
            'canceled',
            'declined',
            'driver_declined',
            'driver_cancelled',
            'rejected',
            'expired',
            'nodriversavailable',
            'no_drivers'
          ].includes(evStatus)
        ) {
          hasNotifiedArrivalRef.current = false;
          try {
            localStorage.removeItem('TAWSEELA_ACTIVE_TAXI_RIDE');
          } catch (_) {}
          if (['nodriversavailable', 'no_drivers', 'expired', 'driver_declined', 'rejected', 'declined'].includes(evStatus)) {
            handleNoDriversAvailable();
            return;
          }
          show('تم إلغاء الرحلة', 'warning');
          setStage('ride_options');
          setRideRequestId(null);
          setAssignedDriverInfo(null);
          setLiveDriverPosition(null);
          prevDriverPositionRef.current = null;
          setDriverHeading(0);
          setRouteCoordinates(null);
        }
      }
    });

    const unsubLocation = realtime.onDriverLocation((e) => {
      if (
        (e.driverId === assignedDriverInfo?.driverId || !assignedDriverInfo?.driverId) &&
        typeof e.latitude === 'number' &&
        typeof e.longitude === 'number'
      ) {
        handleDriverPositionUpdate({ lat: e.latitude, lng: e.longitude }, e.heading);
      }
    });

    return () => {
      unsubStatus();
      unsubLocation();
      void realtime.leaveTrip(rideRequestId);
    };
  }, [rideRequestId, dropoff, rideStatus, stage, assignedDriverInfo, triggerDriverRatingModal, handleDriverPositionUpdate, handleNoDriversAvailable]);

  // تتبع موقع السائق الحي على الخريطة (احتياط نبض 15 ثانية - SSE يتكفل بالبث الفوري)
  useEffect(() => {
    if (stage !== 'driver_arriving' || !assignedDriverInfo?.driverId) return;

    const interval = setInterval(async () => {
      if (document.hidden) return;
      try {
        const { data } = await http.get<{
          latitude?: number;
          longitude?: number;
          heading?: number;
        }>(`/driver/${assignedDriverInfo.driverId}/live`);
        if (data && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
          handleDriverPositionUpdate({ lat: data.latitude, lng: data.longitude }, data.heading);
        }
      } catch (_) {}
    }, 15000);

    return () => clearInterval(interval);
  }, [stage, assignedDriverInfo?.driverId, handleDriverPositionUpdate]);

  // إلغاء الرحلة حقيقياً
  async function handleConfirmCancelTrip() {
    if (!cancelReason) return;
    if (cancelReason === 'سبب آخر' && (!customCancelText.trim() || customCancelText.trim().length < 3)) {
      show('يرجى توضيح سبب الإلغاء الآخر (3 أحرف على الأقل)', 'warning');
      return;
    }
    hasNotifiedArrivalRef.current = false;
    localStorage.removeItem('TAWSEELA_ACTIVE_TAXI_RIDE');
    if (rideRequestId) {
      try {
        await http.post('/ride/cancel', {
          requestId: rideRequestId,
          rideId: rideRequestId,
          reason: cancelReason,
          customDetails: customCancelText.trim(),
        });
        show('تم إلغاء المشوار بنجاح', 'info');
      } catch (err: any) {
        show(err?.response?.data?.error || 'تعذر إلغاء الرحلة', 'error');
        return;
      }
    }
    setStage('ride_options');
    setIsCancelTripOpen(false);
    setCancelReason(null);
    setCustomCancelText('');
    setRideRequestId(null);
    setAssignedDriverInfo(null);
    setLiveDriverPosition(null);
    prevDriverPositionRef.current = null;
    setDriverHeading(0);
    setRouteCoordinates(null);
  }



  // تصفية المدن
  const filteredCities = IRAQI_CITIES.filter(
    (c) => c.name.includes(citySearchQuery.trim()) || c.sub.includes(citySearchQuery.trim())
  );

  // إعداد طبقة خط المسار الانسيابي النحيف (Sleek Slim Polyline - 2.8px / 3.0px)
  // إلغاء رسم خط المسار نهائياً أثناء التتبع الحي لتوفير استدعاءات Mapbox
  const isLiveTrackingDriver = stage === 'driver_arriving' || rideStatus === 'accepted' || rideStatus === 'arrived' || rideStatus === 'inprogress' || rideStatus === 'InProgress' || rideStatus === 'in_progress';
  const routeLines: RouteLineData[] = [];
  if (!isLiveTrackingDriver && routeCoordinates && routeCoordinates.length) {
    routeLines.push({ id: 'route-line', coordinates: routeCoordinates, color: '#F59E0B' });
  }
  if (commuteRouteCoordinates && commuteRouteCoordinates.length) {
    routeLines.push({ id: 'commute-route-line', coordinates: commuteRouteCoordinates, color: '#F59E0B' });
  }

  return (
    <div 
      className={`relative min-h-[100dvh] h-[100dvh] w-full overflow-hidden overscroll-none select-none font-cairo flex flex-col transition-colors duration-200 ${
        isDark ? 'bg-[#080E1A] text-slate-100' : 'bg-[#F8FAFC] text-slate-900'
      }`} 
      style={{ backgroundColor: 'var(--bg-app)', color: 'var(--text-app)' }} 
      dir="rtl"
    >
      {/* ====================================================================
          الترويسة العلوية العائمة الثابتة فوق الخريطة (Floating HUD Header)
          ثابتة وظاهرة دائماً فوق كل شيء بـ z-[100] ولا تُغطى بأي نافذة سفلية
          مع عزل أحداث اللمس pointer-events-none للحاوية و pointer-events-auto للأزرار
          ==================================================================== */}
      <header className="fixed top-0 inset-x-0 z-[100] pt-[calc(0.75rem+env(safe-area-inset-top,1rem))] pb-3 px-4 flex items-center justify-between pointer-events-none w-full" dir="rtl">
        <div className="flex justify-between items-center max-w-lg mx-auto w-full">
          {/* اليمين: زر الرئيسية / الرجوع وشعار توصيله */}
          <div className="pointer-events-auto flex items-center gap-2">
            {stage === 'pickup' ? (
              <button
                type="button"
                onClick={() => navigate('/hub')}
                className={`min-h-[48px] min-w-[48px] h-12 w-12 rounded-full backdrop-blur-xl border shadow-lg flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
                  isDark 
                    ? 'bg-[#161C28]/95 border-white/15 text-amber-400 hover:text-amber-300 hover:border-amber-400/50' 
                    : 'bg-white/95 border-slate-200 text-amber-600 hover:border-amber-400 shadow-sm'
                }`}
                title="الرجوع لصفحة اختيار الخدمة"
                aria-label="الرئيسية"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 9.5L12 3l9 6.5V20a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9.5z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleBackNav}
                className={`min-h-[48px] min-w-[48px] h-12 w-12 rounded-full backdrop-blur-xl border shadow-lg flex items-center justify-center transition-all active:scale-95 cursor-pointer ${
                  isDark 
                    ? 'bg-[#161C28]/95 border-white/15 text-amber-400 hover:text-amber-300 hover:border-amber-400/50' 
                    : 'bg-white/95 border-slate-200 text-amber-600 hover:border-amber-400 shadow-sm'
                }`}
                title={stage === 'searching' ? 'إلغاء البحث' : stage === 'ride_options' ? 'الرجوع لنقطة الوصول' : 'الرجوع لنقطة الانطلاق'}
                aria-label="رجوع"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            )}
            <img
              src="/logo.png?v=40"
              alt="شعار توصيلة"
              className="h-8 w-auto max-h-8 object-contain drop-shadow select-none pointer-events-none hidden xs:block"
            />
          </div>

          {/* الوسط: زر «الخطوط الدائمية» الأحادي الصغير والأنيق بين زر الهوم وزر الحساب */}
          <div className="pointer-events-auto flex items-center mx-1">
            <button
              type="button"
              onClick={() => {
                setShowCommuteRoutes(prev => {
                  const next = !prev;
                  if (!next) setSelectedCommuteDriver(null);
                  return next;
                });
              }}
              className={`min-h-[44px] h-11 px-3 sm:px-3.5 rounded-full backdrop-blur-xl border flex items-center gap-1.5 font-cairo font-bold text-xs transition-all active:scale-95 cursor-pointer shadow-lg select-none ${
                showCommuteRoutes
                  ? 'bg-emerald-600 text-white border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.45)] ring-2 ring-emerald-500/30'
                  : isDark
                  ? 'bg-[#161C28]/95 border-white/15 text-slate-300 hover:text-white hover:border-emerald-400/50'
                  : 'bg-white/95 border-slate-200 text-slate-700 hover:text-slate-900 hover:border-emerald-500 shadow-sm'
              }`}
              title={showCommuteRoutes ? 'إخفاء الخطوط الدائمية' : 'إظهار الخطوط الدائمية على الخريطة'}
              aria-label="الخطوط الدائمية"
              aria-pressed={showCommuteRoutes}
            >
              <span className="text-base leading-none">🚌</span>
              <span className="leading-tight">الخطوط الدائمية</span>
              {showCommuteRoutes && (
                <span className="flex h-2 w-2 relative mr-0.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-200 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
                </span>
              )}
            </button>
          </div>

          {/* اليسار: ترحيب المستخدم وزر تبديل الوضع النهاري والليلي */}
          <div className="pointer-events-auto flex items-center gap-2">
            <div className="text-left hidden sm:block">
              <div className={`text-[12px] font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>مرحباً بك 👋</div>
              <div className={`text-[15px] font-black truncate max-w-[140px] sm:max-w-[180px] ${isDark ? 'text-white' : 'text-slate-900'}`}>{customerFirstName}</div>
            </div>
            {/* زر تبديل الوضع النهاري والليلي الشامل */}
            <ThemeToggleButton className="!rounded-full" />
          </div>
        </div>
      </header>

      {/* 3. الخريطة الرئيسية Mapbox */}
      <div
        className="relative flex-1 min-h-0 w-full overflow-hidden touch-none"
        style={{ touchAction: 'none' }}
        onClick={() => {
          if (stage === 'driver_arriving' && rideSheetState === 'expanded') {
            setRideSheetState('middle');
          }
        }}
      >
        {/* زر الأمان العائم — يظهر فقط في مرحلة السائق قادم */}
        {stage === 'driver_arriving' && (
          <button
            type="button"
            onClick={() => show('ميزة الأمان قريباً 🛡️','info')}
            className="absolute top-[calc(4.75rem+env(safe-area-inset-top,1rem))] left-4 z-20 flex h-11 w-11 items-center justify-center rounded-xl bg-white text-[#1B4965] border border-slate-200/80 shadow-subtle transition-all duration-200 ease-in-out active:scale-[0.96] cursor-pointer hover:bg-slate-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </button>
        )}

        {/* شريط وقت الوصول المتبقي (ETA) الذكي باقتصاد Mapbox */}
        {isLiveTrackingDriver && etaText && rideStatus?.toLowerCase() !== 'arrived' && (
          <div className="absolute top-[calc(4.75rem+env(safe-area-inset-top,1rem))] inset-x-3 z-30 flex justify-center pointer-events-auto animate-fade-in" dir="rtl">
            <div className={`w-full max-w-sm px-4 py-2.5 rounded-2xl shadow-xl flex items-center justify-between gap-3 backdrop-blur-md border ${
              etaText.includes('وصل')
                ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 text-white border-emerald-400/50 shadow-emerald-500/20'
                : isDark
                  ? 'bg-slate-900/95 text-white border-amber-500/40 shadow-black/40'
                  : 'bg-white/95 text-slate-900 border-amber-500/30 shadow-slate-300/40'
            }`}>
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-xl shrink-0">🚖</span>
                <div className="flex flex-col text-right min-w-0">
                  <span className="text-[13.5px] font-black leading-tight">{etaText}</span>
                  {isDriverStationary && !etaText.includes('وصل') ? (
                    <span className="text-[10.5px] text-amber-500 font-bold flex items-center gap-1">
                      <span>⏸️</span>
                      <span>الكابتن متوقف في ازدحام/إشارة (العداد مجمّد)</span>
                    </span>
                  ) : (
                    <span className={`text-[10.5px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {assignedDriverInfo?.driverName ? `الكابتن ${assignedDriverInfo.driverName.split(' ')[0]}` : 'في الطريق إليك'}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 text-[11px] font-bold shrink-0">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>مباشر</span>
              </div>
            </div>
          </div>
        )}

        {/* شريط تنبيه وصول الكابتن العائم في أعلى الشاشة */}
        {(rideStatus?.toLowerCase() === 'arrived') && (
          <div className="absolute top-[calc(4.75rem+env(safe-area-inset-top,1rem))] inset-x-3 z-30 flex justify-center pointer-events-auto animate-fade-in" dir="rtl">
            <div className="w-full max-w-md bg-gradient-to-r from-amber-500 via-amber-600 to-amber-500 text-white px-4 py-3 rounded-2xl shadow-[0_8px_30px_rgba(217,119,6,0.45)] border-2 border-white/90 flex items-center justify-between gap-3 backdrop-blur-md">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-2xl animate-pulse shrink-0">🚖</span>
                <div className="flex flex-col text-right min-w-0">
                  <span className="text-[14px] font-black leading-tight text-white drop-shadow-xs">الكابتن وصل إلى موقعك الآن!</span>
                  <span className="text-[11.5px] font-bold text-amber-100">يرجى التوجه إلى السيارة</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/20 border border-white/30 text-white text-xs font-bold shrink-0">
                <span>📢</span>
                <span>في الانتظار</span>
              </div>
            </div>
          </div>
        )}

        {/* شريط تنبيه الملاحة الخارجية العائم */}
        {isExternalNavActive && (stage === 'driver_arriving' || Boolean(rideRequestId)) && (
          <div className="absolute top-[calc(4.75rem+env(safe-area-inset-top,1rem))] inset-x-3 z-30 flex justify-center pointer-events-auto animate-fade-in" dir="rtl">
            <div className="w-full max-w-md bg-blue-950/95 text-blue-200 px-4 py-2.5 rounded-2xl shadow-lg border border-blue-400/40 flex items-center justify-between gap-3 backdrop-blur-md">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-xl shrink-0 animate-pulse">🧭</span>
                <div className="flex flex-col text-right min-w-0">
                  <span className="text-[13px] font-bold text-white">الكابتن في الطريق (يستخدم تطبيق ملاحة خارجي)</span>
                  <span className="text-[11px] text-blue-300">
                    الموقع يُحدّث كل 10 ثوانٍ من آخر نقطة معروفة {(() => {
                      const lat = Number(lastKnownDriverLocation?.lat);
                      const lng = Number(lastKnownDriverLocation?.lng ?? (lastKnownDriverLocation as any)?.lon);
                      return (!isNaN(lat) && !isNaN(lng)) ? `(${lat.toFixed(4)}, ${lng.toFixed(4)})` : '';
                    })()}
                  </span>
                </div>
              </div>
              <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-blue-500/20 text-blue-200 border border-blue-400/30 shrink-0">
                ملاحة نشطة
              </span>
            </div>
          </div>
        )}

        {/* شريط عداد الانتظار في المحطة الأولى لرحلات الذهاب والإياب */}
        {((rideStatus || '').toLowerCase() === 'waiting_at_destination') && (
          <div className="absolute top-[calc(4.75rem+env(safe-area-inset-top,1rem))] inset-x-3 z-30 flex justify-center pointer-events-auto animate-fade-in" dir="rtl">
            <div className={`w-full max-w-md px-4 py-3 rounded-2xl shadow-xl border-2 backdrop-blur-md flex items-center justify-between gap-3 ${
              maxWaitExceeded 
                ? 'bg-red-950/95 border-red-500/80 text-white' 
                : 'bg-gradient-to-r from-amber-950/95 via-slate-900/95 to-amber-950/95 border-amber-500/50 text-amber-200'
            }`}>
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-2xl shrink-0">{maxWaitExceeded ? '⚠️' : '⏳'}</span>
                <div className="flex flex-col text-right min-w-0">
                  <span className="text-[13.5px] font-black text-white">
                    {maxWaitExceeded ? 'تم تجاوز الحد الأقصى للانتظار' : 'الكابتن بانتظارك في المحطة الأولى'}
                  </span>
                  <span className="text-[11.5px] font-medium text-slate-300">
                    {maxWaitExceeded 
                      ? 'يحق للكابتن إنهاء المشوار أو متابعة الانتظار' 
                      : (customerWaitSeconds <= 600 ? 'وقت الانتظار الحالي (ضمن الـ 10 دقائق المجانية)' : 'يتم احتساب رسوم انتظار إضافية')}
                  </span>
                </div>
              </div>
              <div className="text-left shrink-0">
                <div className="text-lg font-mono font-black text-amber-400">
                  {Math.floor(customerWaitSeconds / 60)}:{(customerWaitSeconds % 60).toString().padStart(2, '0')}
                </div>
              </div>
            </div>
          </div>
        )}
        <MapGL
          ref={mapRef}
          reuseMaps
          mapboxAccessToken={config.mapboxToken}
          mapStyle={mapStyle}
          initialViewState={{
            longitude: DEFAULT_PICKUP.lng,
            latitude: DEFAULT_PICKUP.lat,
            zoom: 15.2,
          }}
          dragPan={true}
          cooperativeGestures={false}
          style={{ width: '100%', height: '100%' }}
          onMoveEnd={handleMapMoveEnd}
          onClick={handleMapClick}
          onLoad={(e) => {
            applyMapEnhancements(e.target, isDark);
            autoLocateUserOnMapReady(e.target);
          }}
        >
          {/* خط المسار بين النقطتين */}
          <RouteLines lines={routeLines} />

          {/* علامة نقطة الانطلاق المثبتة على الخريطة */}
          {stage !== 'pickup' && (
            <Marker longitude={pickup.lng} latitude={pickup.lat} anchor="bottom">
              <div
                onClick={() => {
                  setStage('pickup');
                  mapRef.current?.flyTo({ center: [pickup.lng, pickup.lat], zoom: 15.2, duration: 600 });
                }}
                className="flex flex-col items-center select-none cursor-pointer group"
                title="تعديل نقطة الانطلاق"
              >
                <div className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 shadow-lg border border-amber-500/40 transition-transform group-hover:scale-105 ${
                  isDark ? 'bg-[#161C28]/95' : 'bg-white/95'
                }`}>
                  <span className={`text-[13px] font-black font-cairo ${isDark ? 'text-amber-300' : 'text-amber-600'}`}>الانطلاق</span>
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500">
                    <div className="h-2 w-2 rounded-full bg-[#090D16]" />
                  </div>
                </div>
                <div className="h-3 w-0.5 bg-amber-500/80 -mt-0.5" />
                <div className="h-1.5 w-4 rounded-full bg-black/40 blur-[1px]" />
              </div>
            </Marker>
          )}

          {/* راية الوجهة المثبتة على الخريطة */}
          {stage === 'ride_options' && (
            <DestinationFlagPin
              point={dropoff}
              name={dropoffName || 'حدد الوجهة على الخريطة'}
              onClick={() => {
                setStage('dropoff');
                mapRef.current?.flyTo({ center: [dropoff.lng, dropoff.lat], zoom: 15.2, duration: 600 });
              }}
            />
          )}

          {/* دبابيس كباتن التكسي — تظهر دائماً على الخريطة ولا يمكن إخفاؤها */}
          {!assignedDriverInfo && !liveDriverPosition && stage !== 'searching' && stage !== 'driver_arriving' && (
            <>
              {/* أقرب كابتن مع كبسولة «٣ دقيقة» النطاطة bg-[#FFC174] */}
              <NearestDriverPin
                point={{ lng: (pickup?.lng || DEFAULT_PICKUP.lng) + 0.0055, lat: (pickup?.lat || DEFAULT_PICKUP.lat) + 0.0042 }}
                duration="٣ دقيقة"
              />
              {/* دبابيس الكباتن المحيطة باللون الرمادي والذهبي #FFB77D */}
              <SurroundingDriverPin point={{ lng: (pickup?.lng || DEFAULT_PICKUP.lng) - 0.0062, lat: (pickup?.lat || DEFAULT_PICKUP.lat) + 0.0051 }} />
              <SurroundingDriverPin point={{ lng: (pickup?.lng || DEFAULT_PICKUP.lng) + 0.0078, lat: (pickup?.lat || DEFAULT_PICKUP.lat) - 0.0045 }} />
              <SurroundingDriverPin point={{ lng: (pickup?.lng || DEFAULT_PICKUP.lng) - 0.0049, lat: (pickup?.lat || DEFAULT_PICKUP.lat) - 0.0060 }} />
            </>
          )}

          {/* دبابيس كباتن الخط الدائم — تظهر فوق كباتن التكسي عند تفعيل زر الخطوط الدائمية */}
          {showCommuteRoutes && !assignedDriverInfo && !liveDriverPosition && stage !== 'searching' && stage !== 'driver_arriving' && commuteDrivers.map((drv: any, idx: number) => {
            const dLat = Number(drv.fixed_lat ?? drv.lat ?? drv.latitude);
            const dLng = Number(drv.fixed_lng ?? drv.lng ?? drv.longitude);
            if (isNaN(dLat) || isNaN(dLng)) return null;

            const isFull = Boolean(drv.isFull || drv.is_full);
            const band = isFull ? 'slate' : (drv.distanceBand || (drv.distanceM <= 500 ? 'green' : drv.distanceM <= 2000 ? 'purple' : 'red'));
            const bandColor = isFull ? '#64748B' : (band === 'green' ? '#16a34a' : band === 'purple' ? '#7c3aed' : '#dc2626');
            const isSelected = selectedCommuteDriver?.driverId === drv.driverId;

            return (
              <Marker
                key={`commute-${drv.driverId || idx}`}
                latitude={dLat}
                longitude={dLng}
                anchor="bottom"
              >
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedCommuteDriver(drv);
                    mapRef.current?.flyTo({ center: [dLng, dLat], zoom: 15.5, duration: 600 });
                  }}
                  className={`flex flex-col items-center select-none cursor-pointer transition-transform duration-200 ${
                    isSelected ? 'scale-110 z-30' : 'hover:scale-105 z-20'
                  }`}
                  title={`كابتن خط دائم: ${drv.firstName || drv.fullName || ''}`}
                >
                  {/* شارة المسافة العلوية */}
                  <div
                    className="mb-1 flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-black text-white shadow-lg border border-white/20"
                    style={{ backgroundColor: bandColor }}
                  >
                    <span>🚌</span>
                    {isFull && <span className="bg-slate-700/90 px-1 rounded text-[9.5px]">مكتمل</span>}
                    <span>{drv.firstName || 'كابتن'}</span>
                    <span className="text-[10px] opacity-90">({drv.distanceM != null ? (drv.distanceM < 1000 ? `${drv.distanceM}م` : `${(drv.distanceM / 1000).toFixed(1)}كم`) : 'خط'})</span>
                  </div>

                  {/* أيقونة الكابتن الموحدة = شعار توصيلة */}
                  <div
                    className="relative flex h-10 w-10 items-center justify-center rounded-2xl text-white shadow-xl border-2 border-white p-1"
                    style={{ backgroundColor: bandColor }}
                  >
                    <img src="/logo.png" alt="توصيلة" className="w-6 h-6 object-contain drop-shadow" />
                    {isFull && (
                      <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-slate-700 border border-white text-[8px] font-bold">
                        ✕
                      </span>
                    )}
                  </div>
                  <div className="h-2 w-1 rounded-full -mt-0.5" style={{ backgroundColor: bandColor }} />
                  <div className="h-1.5 w-4 rounded-full bg-black/40 blur-[1px]" />
                </div>
              </Marker>
            );
          })}



          {/* موقع السائق الحقيقي عند القبول والوصول مع الاحتفاظ بآخر موقع لمنع الاختفاء */}
          {(liveDriverPosition || assignedDriverInfo?.driverLat || lastKnownDriverPosRef.current) && (stage === 'driver_arriving' || isLiveTrackingDriver) ? (
            <VehicleMarker
              targetLat={liveDriverPosition?.lat ?? assignedDriverInfo?.driverLat ?? lastKnownDriverPosRef.current!.lat}
              targetLng={liveDriverPosition?.lng ?? assignedDriverInfo?.driverLon ?? lastKnownDriverPosRef.current!.lng}
              targetHeading={driverHeading}
              title={assignedDriverInfo?.driverName ? `كابتن ${assignedDriverInfo.driverName.split(' ')[0]}` : undefined}
              isAvailable={false}
            />
          ) : null}
          {/* نبضة دائرية حول نقطة الانطلاق في مرحلة البحث */}
          {stage === 'searching' && (
            <Marker longitude={pickup.lng} latitude={pickup.lat} anchor="center">
              <div className="relative flex items-center justify-center">
                <div className="animate-ping-expand absolute h-40 w-40 rounded-full bg-[#1B4965]/20" />
                <div className="animate-ping-expand animation-delay-600 absolute h-28 w-28 rounded-full bg-[#1B4965]/25" />
                <div className="h-5 w-5 rounded-full bg-[#D97706] border-2 border-white shadow-md" />
              </div>
            </Marker>
          )}
          {/* علامة الانطلاق مع وقت الوصول في مرحلة السائق قادم */}
          {stage === 'driver_arriving' && (
            <Marker longitude={pickup.lng} latitude={pickup.lat} anchor="bottom">
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 shadow-card border border-slate-200">
                  <span className="text-[12px] font-bold text-[#1A1A1A]">الانطلاق</span>
                  <span className="text-[12px] font-semibold text-[#6C757D]">1 دقيقة</span>
                  <div className="h-4 w-4 rounded-full bg-[#D97706] flex items-center justify-center">
                    <div className="h-1.5 w-1.5 rounded-full bg-white" />
                  </div>
                </div>
                <div className="h-3 w-0.5 bg-slate-500" />
              </div>
            </Marker>
          )}
        </MapGL>

        {/* 4. دبوس المركز في منتصف الشاشة (دبوس موقعك الحالي الزمردي #56E5A9 مع رادار نابض) */}
        {stage !== 'ride_options' && stage !== 'searching' && stage !== 'driver_arriving' && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            {stage === 'pickup' ? (
              <div className="relative flex flex-col items-center -translate-y-full mb-1 animate-fade-in select-none">
                <div className={`px-2.5 py-0.5 rounded-full border text-[11px] font-bold mb-1 shadow-lg backdrop-blur-md ${
                  isDark ? 'bg-[#161C28]/95 border-[#56E5A9]/50 text-[#56E5A9]' : 'bg-white/95 border-emerald-500 text-emerald-700 shadow-sm'
                }`}>
                  موقعك الحالي
                </div>
                <div className="relative flex items-center justify-center">
                  <span className="absolute w-12 h-12 rounded-full bg-[#56E5A9]/30 animate-ping"></span>
                  <div className="w-9 h-9 rounded-full bg-[#56E5A9] border-2 border-[#080E1A] shadow-[0_0_16px_#56E5A9] flex items-center justify-center text-slate-950 font-bold">
                    📍
                  </div>
                </div>
                <div className="h-3.5 w-1 rounded-full bg-slate-700/80 -mt-0.5" />
                <div className="h-1.5 w-4 rounded-full bg-black/40 blur-[1px] mt-0.5" />
              </div>
            ) : (
              <div className="relative flex flex-col items-center -translate-y-full mb-1 animate-fade-in select-none">
                <div className={`px-2.5 py-0.5 rounded-full border text-[11px] font-bold mb-1 shadow-lg backdrop-blur-md ${
                  isDark ? 'bg-[#161C28]/95 border-amber-500/50 text-amber-300' : 'bg-white/95 border-amber-500 text-amber-700 shadow-sm'
                }`}>
                  نقطة الوصول
                </div>
                <div className="relative flex items-center justify-center">
                  <span className="absolute w-10 h-10 rounded-full bg-amber-400/25 animate-ping"></span>
                  <div className="w-9 h-9 rounded-full bg-amber-500 border-2 border-[#080E1A] shadow-xl flex items-center justify-center text-slate-950 font-bold">
                    🎓
                  </div>
                </div>
                <div className="h-3.5 w-1 rounded-full bg-slate-700/80 -mt-0.5" />
                <div className="h-1.5 w-4 rounded-full bg-black/40 blur-[1px] mt-0.5" />
              </div>
            )}
          </div>
        )}

        {/* شارة الكباتن المتوفرين قربك الآن */}
        {stage !== 'searching' && stage !== 'driver_arriving' && (() => {
          const totalNearby = showCommuteRoutes
            ? (nearbyDriversCount || 0) + commuteDrivers.length
            : (nearbyDriversCount || 0);
          if (totalNearby <= 0) return null;
          return (
            <div className={`pointer-events-auto absolute top-[calc(4.75rem+env(safe-area-inset-top,1rem))] right-4 z-20 flex items-center gap-2 rounded-full backdrop-blur-md px-3.5 py-1.5 text-xs font-bold shadow-xl border animate-fade-in ${
              isDark ? 'bg-[#161C28]/95 border-amber-500/30 text-white' : 'bg-white/95 border-amber-400 text-slate-800 shadow-md'
            }`} dir="rtl">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
              </span>
              <span>
                {showCommuteRoutes && commuteDrivers.length > 0
                  ? `${nearbyDriversCount || 0} تكسي • ${commuteDrivers.length} خط دائم`
                  : `${totalNearby} ${totalNearby === 1 ? 'كابتن متوفر' : totalNearby === 2 ? 'كابتنان متوفران' : 'كباتن متوفرين'}`}
              </span>
              <span className="text-amber-400 text-sm">⚡</span>
            </div>
          );
        })()}

        {stage !== 'searching' && stage !== 'driver_arriving' && (
          <div className="pointer-events-auto absolute top-[calc(4.75rem+env(safe-area-inset-top,1rem))] left-4 z-20 flex items-center gap-2">
            <button
              type="button"
              onClick={() => show('خدمة الطوارئ والأمان 🛡️', 'info')}
              className={`w-9 h-9 min-w-[36px] min-h-[36px] rounded-full backdrop-blur-md border shadow-xl flex items-center justify-center cursor-pointer active:scale-95 transition-transform ${
                isDark ? 'bg-[#161C28]/95 border-white/10 text-amber-400' : 'bg-white/95 border-slate-200 text-amber-600 shadow-md'
              }`}
              title="طوارئ وأمان"
              aria-label="طوارئ"
            >
              <span className="text-base">🛡️</span>
            </button>
          </div>
        )}

        {/* تلميح بصري فوق الخريطة عند تعذر تحديد موقع GPS */}
        {showMapHint && stage !== 'ride_options' && stage !== 'searching' && stage !== 'driver_arriving' && (
          <div className="pointer-events-auto absolute top-[calc(7.85rem+env(safe-area-inset-top,1rem))] inset-x-0 z-20 flex justify-center px-4 animate-fade-in">
            <div className={`flex items-center gap-2 rounded-full backdrop-blur-md px-4 py-2 text-[12.5px] font-bold shadow-xl border ${
              isDark ? 'bg-[#161C28]/95 border-amber-500/30 text-amber-400' : 'bg-white/95 border-amber-400/50 text-amber-700 shadow-md'
            }`}>
              <span>يمكنك تحريك الخريطة لوضع الدبوس على موقعك الحالي 📍</span>
              <button
                type="button"
                onClick={() => setShowMapHint(false)}
                className="text-slate-400 hover:text-white mr-1 cursor-pointer"
                aria-label="إغلاق التلميح"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* 5. زر إعادة التمركز وتحديد الموقع عبر الـ GPS */}
        {stage !== 'searching' && stage !== 'driver_arriving' && (
          <button
            type="button"
            disabled={isLocatingCurrent}
            onClick={handleUseCurrentLocation}
            className={`absolute ${
              stage === 'ride_options'
                ? 'bottom-[calc(22rem+env(safe-area-inset-bottom))]'
                : 'bottom-[calc(14rem+env(safe-area-inset-bottom))]'
            } left-4 z-30 backdrop-blur-md p-3 rounded-full shadow-xl active:scale-95 transition-all flex items-center justify-center cursor-pointer ${
              isDark 
                ? 'bg-[#161C28]/95 border border-amber-500/30 text-amber-400 hover:bg-[#1E293B] hover:text-amber-300 hover:border-amber-400' 
                : 'bg-white/95 border border-slate-200 text-amber-600 hover:bg-slate-50 hover:text-amber-700 hover:border-amber-400 shadow-md'
            } ${
              isLocatingCurrent ? 'opacity-80' : ''
            }`}
            title="موقعي الحالي عبر الـ GPS"
            aria-label="تحديد موقعي"
          >
            <svg
              className={`h-6 w-6 ${isLocatingCurrent ? 'animate-spin' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="7" />
              <circle cx="12" cy="12" r="2.5" fill="currentColor" />
              <line x1="12" y1="2" x2="12" y2="5" />
              <line x1="12" y1="19" x2="12" y2="22" />
              <line x1="2" y1="12" x2="5" y2="12" />
              <line x1="19" y1="12" x2="22" y2="12" />
            </svg>
          </button>
        )}

        {/* بطاقة تفاصيل كابتن الخط الدائم المحدد من الخريطة */}
        {selectedCommuteDriver && (
          <div className="pointer-events-auto absolute bottom-[calc(14rem+env(safe-area-inset-bottom,1rem))] inset-x-4 sm:inset-x-auto sm:right-6 sm:w-96 z-40 animate-slide-up" dir="rtl">
            <div className={`p-4 rounded-3xl shadow-2xl border backdrop-blur-xl ${
              isDark ? 'bg-[#161C28]/95 border-amber-500/40 text-white' : 'bg-white/95 border-slate-300 text-slate-900 shadow-xl'
            }`}>
              {/* رأس البطاقة: اسم الكابتن والتقييم والإغلاق */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-2xl shrink-0">
                    🚌
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-black">{selectedCommuteDriver.firstName || selectedCommuteDriver.fullName || 'كابتن خط دائم'}</span>
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 text-xs font-bold border border-amber-500/30">
                        ★ {Number(selectedCommuteDriver.rating || 5.0).toFixed(1)}
                      </span>
                    </div>
                    <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {selectedCommuteDriver.vehicleModel || 'سيارة خط دائم'} {selectedCommuteDriver.vehicleColor ? `• ${selectedCommuteDriver.vehicleColor}` : ''}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCommuteDriver(null)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-colors ${
                    isDark ? 'bg-slate-800/60 hover:bg-slate-700 text-slate-400 hover:text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900'
                  }`}
                  aria-label="إغلاق"
                >
                  ✕
                </button>
              </div>

              {/* مسار الخط الحقيقي: الانطلاق ➔ الوجهة المحددة بدقة */}
              {(() => {
                const startLabel = selectedCommuteDriver.fixed_label 
                  || (selectedCommuteDriver.route && selectedCommuteDriver.route.includes('➔') ? selectedCommuteDriver.route.split('➔')[0].trim() : '')
                  || selectedCommuteDriver.from 
                  || 'نقطة الانطلاق';

                const destLabel = selectedCommuteDriver.fixed_dest_label
                  || selectedCommuteDriver.route_name
                  || (selectedCommuteDriver.route && selectedCommuteDriver.route.includes('➔') ? selectedCommuteDriver.route.split('➔')[1].trim() : selectedCommuteDriver.route)
                  || selectedCommuteDriver.to
                  || 'وجهة الخط الدائم';

                return (
                  <div className={`p-3 rounded-2xl mb-3 border ${
                    isDark ? 'bg-[#0B101B]/80 border-white/10' : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex items-center gap-2 text-xs font-bold mb-1.5">
                      <span className="text-emerald-500">🟢</span>
                      <span className={isDark ? "text-slate-400" : "text-slate-500"}>الانطلاق:</span>
                      <span className={`truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{startLabel}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-bold">
                      <span className="text-amber-500">🏁</span>
                      <span className={isDark ? "text-slate-400" : "text-slate-500"}>الوجهة:</span>
                      <span className={`truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{destLabel}</span>
                    </div>
                  </div>
                );
              })()}

              {/* مؤشرات المسافة وحالة المقاعد */}
              <div className="flex items-center justify-between text-xs font-bold mb-3 px-1">
                <span className="flex items-center gap-1.5">
                  <span className={isDark ? "text-slate-400" : "text-slate-500"}>المسافة منك:</span>
                  <span className={`px-2 py-0.5 rounded-full font-mono font-bold ${
                    selectedCommuteDriver.distanceBand === 'green'
                      ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30'
                      : selectedCommuteDriver.distanceBand === 'purple'
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                      : 'bg-rose-500/20 text-rose-500 border border-rose-500/30'
                  }`}>
                    {selectedCommuteDriver.distanceM != null ? `${selectedCommuteDriver.distanceM < 1000 ? `${selectedCommuteDriver.distanceM}م` : `${(selectedCommuteDriver.distanceM / 1000).toFixed(1)}كم`}` : 'قريب'}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className={isDark ? "text-slate-400" : "text-slate-500"}>المقاعد:</span>
                  <span className={`px-2 py-0.5 rounded-full ${
                    selectedCommuteDriver.isFull ? 'bg-slate-600/40 text-slate-300 border border-slate-500/30 font-bold' : 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30'
                  }`}>
                    {selectedCommuteDriver.isFull ? 'مكتمل - غير متاح' : 'مقاعد متوفرة'}
                  </span>
                </span>
              </div>

              {/* زر إظهار / إخفاء مسار الخط على الشوارع (أصفر 3px #F59E0B) */}
              <button
                type="button"
                onClick={handleToggleCommuteRoute}
                disabled={isLoadingCommuteRoute}
                className={`w-full min-h-[48px] rounded-2xl mb-2.5 font-bold text-xs border transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 ${
                  showCommuteRoute
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-500'
                    : isDark
                    ? 'bg-slate-800/80 border-white/10 text-white hover:bg-slate-800'
                    : 'bg-slate-100 border-slate-300 text-slate-800 hover:bg-slate-200'
                }`}
              >
                {isLoadingCommuteRoute ? (
                  <span className="animate-pulse">جاري جلب المسار...</span>
                ) : showCommuteRoute ? (
                  <>
                    <span>إخفاء مسار الخط</span>
                    <span>✕</span>
                  </>
                ) : (
                  <>
                    <span>إظهار مسار الخط على الخريطة</span>
                    <span>🛣️</span>
                  </>
                )}
              </button>

              {/* زر حجز مقعد في هذا الخط — ينقل مباشرة إلى صفحة /daily مع تحديد الكابتن */}
              {selectedCommuteDriver.isFull ? (
                <button
                  type="button"
                  disabled
                  className="w-full min-h-[48px] rounded-2xl bg-slate-600/80 text-white/80 font-black text-sm shadow-none cursor-not-allowed flex items-center justify-center gap-2 border border-white/10"
                >
                  <span>الكابتن مكتمل - غير متاح</span>
                  <span>🚫</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    navigate('/daily', {
                      state: {
                        selectedDriverId: selectedCommuteDriver.driverId || selectedCommuteDriver.id,
                      },
                    });
                  }}
                  className="w-full min-h-[48px] rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-black text-sm shadow-lg shadow-emerald-500/25 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>حجز مقعد في هذا الخط</span>
                  <span>🚌 ➔</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* 6. البطاقة السفلية الفاخرة في مرحلتي الانطلاق والوصول */}
        {stage !== 'ride_options' && stage !== 'searching' && stage !== 'driver_arriving' && (
          <div className={`absolute inset-x-0 bottom-0 z-30 rounded-t-2xl backdrop-blur-md px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] mb-[env(safe-area-inset-bottom)] shadow-2xl border-t ${
            isDark ? 'bg-[#161C28]/95 border-amber-500/20 text-white' : 'bg-white/95 border-slate-200 text-slate-900 shadow-[0_-8px_30px_rgba(0,0,0,0.08)]'
          }`}>
            <div className="flex justify-center mb-3">
              <div className={`h-1 w-10 rounded-full ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />
            </div>

            <div
              onClick={() => { setIsSearchOpen(true); setSearchResults([]); }}
              className={`mb-4 flex items-center justify-between rounded-xl p-3.5 cursor-pointer transition active:scale-[0.99] border ${
                isDark 
                  ? 'bg-[#0B101B] border-amber-500/30 hover:border-amber-500/60' 
                  : 'bg-slate-50 border-slate-200 hover:border-amber-500'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <svg
                  className="h-5 w-5 text-amber-500 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <span className={`truncate text-[15px] font-bold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
                  {stage === 'pickup' ? pickupName || DEFAULT_PICKUP_NAME : dropoffName || DEFAULT_DROPOFF_NAME}
                </span>
              </div>

              {stage === 'pickup' ? (
                <div className="mr-1 h-3.5 w-3.5 shrink-0 rounded-full bg-amber-500 shadow-xs" />
              ) : (
                <div className="mr-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-md bg-emerald-500 shadow-xs">
                  <div className="h-1.5 w-1.5 rounded-full bg-[#090D16]" />
                </div>
              )}
            </div>

            {/* رسالة الخطأ التوضيحية */}
            {locationError && (
              <div className="mb-3 overflow-hidden rounded-xl bg-amber-950/60 border border-amber-500/50 p-3 text-right shadow-xs animate-slide-down transition-all duration-300">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setLocationError(null)}
                    className="text-amber-400/80 hover:text-amber-200 text-[12px] p-1 cursor-pointer"
                    aria-label="إغلاق التنبيه"
                  >
                    ✕
                  </button>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[12.5px] font-bold text-amber-200 leading-snug break-words">
                      {locationError}
                    </span>
                    <span className="text-amber-400 text-[15px] shrink-0">⚠️</span>
                  </div>
                </div>
              </div>
            )}

            {stage === 'pickup' ? (
              <button
                type="button"
                onClick={handleConfirmPickup}
                className="w-full min-h-[56px] rounded-2xl bg-gradient-to-r from-[#F59E0B] via-[#D97707] to-[#F59E0B] py-3.5 text-center text-[16px] font-black text-[#090D16] shadow-[0_4px_24px_rgba(245,158,11,0.35)] transition-all duration-200 ease-in-out active:scale-[0.98] hover:brightness-110 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>تثبيت نقطة الانطلاق</span>
                <span className="text-lg">🚖</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConfirmDropoff}
                className="w-full min-h-[56px] rounded-2xl bg-gradient-to-r from-[#F59E0B] via-[#D97707] to-[#F59E0B] py-3.5 text-center text-[16px] font-black text-[#090D16] shadow-[0_4px_24px_rgba(245,158,11,0.35)] transition-all duration-200 ease-in-out active:scale-[0.98] hover:brightness-110 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>تثبيت نقطة الوصول</span>
                <span className="text-lg">🎓</span>
              </button>
            )}
          </div>
        )}

        {/* 7. بطاقة خيارات فئات الرحلة كنافذة سفلية قابلة للسحب ثلاثية الحالات (minimized, middle, expanded) */}
        {stage === 'ride_options' && (
          <div
            role="region"
            aria-label="قائمة فئات الرحلة والتسعير"
            tabIndex={0}
            onKeyDown={handleTierKeyDown}
            style={{
              maxHeight: 'calc(100dvh - 5.5rem - env(safe-area-inset-top, 1rem))',
              transform:
                tierSheetState === 'expanded'
                  ? 'translateY(0)'
                  : tierSheetState === 'middle'
                  ? 'translateY(calc(100% - 335px))'
                  : 'translateY(calc(100% - 108px))',
              transition: isTierDraggingRef.current ? 'none' : 'transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)',
            }}
            className={`absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[28px] backdrop-blur-md pt-1 pb-[calc(1rem+env(safe-area-inset-bottom))] mb-[env(safe-area-inset-bottom)] shadow-2xl border-t animate-fade-in will-change-transform motion-reduce:transition-none select-none max-h-[calc(100dvh-5.5rem-env(safe-area-inset-top,1rem))] overflow-hidden ${
              isDark
                ? 'bg-[#161C28]/95 border-amber-500/20 text-white'
                : 'bg-white/95 border-slate-200 text-slate-900 shadow-[0_-8px_30px_rgba(0,0,0,0.08)]'
            }`}
            dir="rtl"
          >
            {/* مقبض السحب القابل للمس مع مساحة 48px وتحريك ناعم */}
            <div
              onPointerDown={handleTierPointerDown}
              onPointerMove={handleTierPointerMove}
              onPointerUp={handleTierPointerUp}
              style={{ touchAction: 'none' }}
              onClick={(e) => {
                e.stopPropagation();
                setTierSheetState((prev) => (prev === 'middle' ? 'expanded' : prev === 'expanded' ? 'minimized' : 'middle'));
              }}
              className="cursor-pointer select-none touch-none pt-2 pb-1.5 px-4 flex flex-col items-center shrink-0"
              aria-label="مقبض سحب وتغيير حجم قائمة الفئات"
            >
              <div className="py-2 px-10 flex justify-center items-center min-h-[48px]">
                <div className={`h-1.5 w-12 rounded-full transition-colors ${
                  isDark ? 'bg-slate-500 hover:bg-slate-400 active:bg-amber-400' : 'bg-slate-300 hover:bg-slate-400 active:bg-amber-400'
                }`} />
              </div>

              {/* حالة مصغّرة (minimized): مقبض + الفئة المحددة + زر الطلب فتظهر الخريطة كاملة */}
              {tierSheetState === 'minimized' && (
                <div className="w-full flex items-center justify-between gap-3 pt-1 pb-1 px-1 animate-fade-in">
                  <div 
                    className="flex items-center gap-2.5 cursor-pointer hover:opacity-90 transition active:scale-98"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTierSheetState('middle');
                    }}
                    title="اضغط لعرض كافة الفئات"
                  >
                    <TawseelaTierLogo badge={currentTier.badge} size="sm" />
                    <div className="text-right">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[15px] font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{currentTier.name}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                          isDark ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-amber-100 text-amber-800 border-amber-300'
                        }`}>
                          محدد ↕️
                        </span>
                      </div>
                      <span className={`text-[14px] font-black ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>{calculatedPrice.toLocaleString()} د.ع</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOrderTrip();
                    }}
                    className="h-12 min-h-[48px] px-6 rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-amber-500 text-center text-[15px] font-black text-[#090D16] shadow-[0_4px_16px_rgba(245,158,11,0.3)] transition active:scale-98 hover:brightness-110 cursor-pointer flex items-center justify-center shrink-0"
                  >
                    طلب الآن 🚖
                  </button>
                </div>
              )}
            </div>

            {/* الحاوية القابلة للتمرير الداخلي عند ضيق الشاشة (Scrollable Body) */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-1.5 touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
              {/* التبويبات العلوية: تكسي و بوكس (RTL: تكسي يمين، بوكس يسار) */}
              <div className={`flex border-b px-4 ${isDark ? 'border-slate-800' : 'border-slate-200'}`} dir="rtl">
                <button
                  type="button"
                  onClick={() => setSelectedServiceTab('taxi')}
                  className={`flex-1 min-h-[44px] py-2 text-center text-[15px] font-bold transition relative cursor-pointer ${
                    selectedServiceTab === 'taxi'
                      ? isDark ? 'text-amber-400 border-b-2 border-amber-500' : 'text-amber-600 border-b-2 border-amber-500'
                      : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  تكسي
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedServiceTab('box')}
                  className={`flex-1 min-h-[44px] py-2 text-center text-[15px] font-bold transition relative cursor-pointer ${
                    selectedServiceTab === 'box'
                      ? isDark ? 'text-amber-400 border-b-2 border-amber-500' : 'text-amber-600 border-b-2 border-amber-500'
                      : isDark ? 'text-slate-400 hover:text-slate-200' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  بوكس
                </button>
              </div>

              {/* شارة الذروة أو الخصم الذكي المفعّل */}
              {dynamicPricingData.surgeBadge && (
                <div className={`mx-4 mt-2 mb-1 p-2 rounded-xl flex items-center justify-between animate-fade-in shadow-xs ${
                  isDark ? 'bg-amber-950/60 border border-amber-500/50 text-amber-200' : 'bg-amber-50 border border-amber-300 text-amber-900'
                }`} dir="rtl">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-bold text-xs shadow-xs">⚡</span>
                    <span className={`text-[12px] font-bold ${isDark ? 'text-amber-200' : 'text-amber-900'}`}>{dynamicPricingData.surgeBadge.text}</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                    isDark ? 'text-amber-300 bg-amber-900/60 border-amber-500/40' : 'text-amber-800 bg-amber-100 border-amber-300'
                  }`}>
                    تحديث حي
                  </span>
                </div>
              )}
              {dynamicPricingData.discountBadge && !dynamicPricingData.surgeBadge && (
                <div className={`mx-4 mt-2 mb-1 p-2 rounded-xl flex items-center justify-between animate-fade-in shadow-xs ${
                  isDark ? 'bg-emerald-950/60 border border-emerald-500/50 text-emerald-200' : 'bg-emerald-50 border border-emerald-300 text-emerald-900'
                }`} dir="rtl">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-lg bg-emerald-500 text-slate-950 flex items-center justify-center font-bold text-xs shadow-xs">🏷️</span>
                    <span className={`text-[12px] font-bold ${isDark ? 'text-emerald-200' : 'text-emerald-900'}`}>{dynamicPricingData.discountBadge.text}</span>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                    isDark ? 'text-emerald-300 bg-emerald-900/60 border-emerald-500/40' : 'text-emerald-800 bg-emerald-100 border-emerald-300'
                  }`}>
                    عرض خاص
                  </span>
                </div>
              )}

              {/* قائمة فئات الرحلة (سوبر، توفير، بلس) بأسلوب RTL صارم */}
              <div className="px-4 py-1.5 space-y-1.5" dir="rtl">
                {RIDE_TIERS.map((tier) => {
                  const isSelected = selectedTierId === tier.id;
                  const tierPrice = getTierPrice(tier);

                  return (
                    <div
                      key={tier.id}
                      onClick={() => setSelectedTierId(tier.id)}
                      className={`flex items-center justify-between p-3 rounded-xl border transition cursor-pointer min-h-[54px] ${
                        isSelected
                          ? isDark
                            ? 'border-amber-500/80 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.15)] ring-1 ring-amber-500/50'
                            : 'border-amber-500 bg-amber-50/90 shadow-sm ring-1 ring-amber-400'
                          : isDark
                            ? 'border-slate-800 bg-[#0B101B]/80 hover:border-amber-500/30'
                            : 'border-slate-200 bg-slate-50/90 hover:border-amber-400/60'
                      }`}
                      dir="rtl"
                    >
                      {/* الطرف الأيمن: شعار توصيلة المعتمد + الشارة، وبجانبه الاسم والوصف */}
                      <div className="flex items-center gap-2.5">
                        <TawseelaTierLogo badge={tier.badge} size="sm" />
                        <div className="text-right">
                          <div className="flex items-center gap-1.5">
                            <p className={`text-[14.5px] font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{tier.name}</p>
                            {isSelected && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${
                                isDark
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                  : 'bg-amber-100 text-amber-800 border-amber-300'
                              }`}>
                                محدد
                              </span>
                            )}
                          </div>
                          <p className={`text-[11.5px] font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{tier.subtitle}</p>
                        </div>
                      </div>

                      {/* الطرف الأيسر: السعر بالدينار العراقي */}
                      <div className={`text-left font-black text-[15px] whitespace-nowrap ${
                        isDark ? 'text-amber-400' : 'text-amber-600'
                      }`}>
                        {tierPrice.toLocaleString()} د.ع
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* محتوى الحالة المرتفعة (expanded): خيارات الرحلة وقسيمة الخصم */}
              <div
                className={`transition-all duration-300 overflow-hidden px-4 ${
                  tierSheetState === 'expanded'
                    ? 'opacity-100 max-h-[80px] pointer-events-auto my-1.5'
                    : 'opacity-0 max-h-0 pointer-events-none'
                }`}
              >
                <div className="flex items-center gap-2.5 pt-1 pb-1" dir="rtl">
                  {/* خيارات الرحلة */}
                  <button
                    type="button"
                    onClick={() => setIsTripOptionsOpen(true)}
                    className={`flex-1 h-11 min-h-[44px] px-3 rounded-xl border flex items-center justify-center gap-2 transition-all duration-150 active:scale-[0.98] cursor-pointer shadow-xs ${
                      isDark
                        ? 'border-slate-800 bg-[#0B101B]/80 text-slate-300 hover:border-amber-500/40 hover:text-amber-300'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-amber-400 hover:text-amber-600'
                    }`}
                  >
                    <svg
                      className={`h-4 w-4 shrink-0 ${isDark ? 'text-amber-400' : 'text-amber-600'}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                    >
                      <line x1="4" y1="6" x2="20" y2="6" />
                      <line x1="7" y1="12" x2="17" y2="12" />
                      <line x1="10" y1="18" x2="14" y2="18" />
                    </svg>
                    <span className="text-[13px] font-bold">خيارات الرحلة</span>
                  </button>

                  {/* قسيمة الخصم */}
                  <button
                    type="button"
                    onClick={() => setIsPromoModalOpen(true)}
                    className={`flex-1 h-11 min-h-[44px] px-3 rounded-xl border flex items-center justify-center gap-2 transition-all duration-150 active:scale-[0.98] cursor-pointer shadow-xs ${
                      appliedPromo 
                        ? isDark
                          ? 'border-emerald-500/60 bg-emerald-950/40 text-emerald-300'
                          : 'border-emerald-300 bg-emerald-50 text-emerald-800'
                        : isDark
                          ? 'border-slate-800 bg-[#0B101B]/80 hover:border-amber-500/40 text-slate-300 hover:text-amber-300'
                          : 'border-slate-200 bg-slate-50 hover:border-amber-400 text-slate-700 hover:text-amber-600'
                    }`}
                  >
                    <svg
                      className={`h-4 w-4 shrink-0 ${appliedPromo ? (isDark ? 'text-emerald-400' : 'text-emerald-600') : (isDark ? 'text-amber-400' : 'text-amber-600')}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                      <line x1="7" y1="7" x2="7.01" y2="7" />
                    </svg>
                    <span className="text-[13px] font-bold">
                      {appliedPromo ? 'خصم 20% مفعّل' : 'قسيمة خصم'}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* الزر الرئيسي: طلب الفئة المحددة (بارتفاع 56px = h-14) مثبت في أسفل الورقة (shrink-0) */}
            <div className="px-6 pt-2 pb-1 shrink-0">
              <button
                type="button"
                onClick={handleOrderTrip}
                className="w-full h-14 min-h-[56px] rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-amber-500 text-center text-[16px] font-black text-[#090D16] shadow-[0_4px_20px_rgba(245,158,11,0.3)] transition-all duration-200 ease-in-out active:scale-[0.98] hover:brightness-110 cursor-pointer flex items-center justify-center"
              >
                طلب {currentTier.name}
              </button>
            </div>
          </div>
        )}

        {/* 7. بطاقة البحث الفاخرة — جاري انتظار موافقة الكابتن */}
        {stage === 'searching' && (
          <div className={`absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[28px] backdrop-blur-xl border-t shadow-[0_-12px_40px_rgba(0,0,0,0.85)] animate-fade-in pb-[calc(1.5rem+env(safe-area-inset-bottom))] mb-[env(safe-area-inset-bottom)] ${
            isDark ? 'bg-[#161C28]/95 border-amber-500/30 text-white' : 'bg-white/95 border-slate-200 text-slate-900 shadow-xl'
          }`} dir="rtl">
            {/* مقبض علوي */}
            <div className="flex justify-center py-3">
              <div className={`h-1.5 w-10 rounded-full ${isDark ? 'bg-slate-700' : 'bg-slate-300'}`} />
            </div>

            <div className="px-5 space-y-4">
              {/* رادار البحث النابض */}
              <div className={`flex flex-row-reverse overflow-hidden rounded-2xl shadow-xl border ${
                isDark ? 'border-amber-500/30 bg-[#0B101B]' : 'border-slate-200 bg-slate-50'
              }`} style={{ minHeight: '120px' }}>
                <div className="flex flex-col items-center justify-center bg-gradient-to-b from-amber-400 via-amber-500 to-amber-600 px-5 min-w-[110px] text-slate-950 font-black">
                  <span className="text-[12px] opacity-80 mb-0.5">طلب تكسي</span>
                  <span className="text-[22px] font-black leading-tight">{currentTier.name}</span>
                  <div className="mt-1"><CarBadgeIllustration badge={currentTier.badge} size="sm" /></div>
                </div>
                <div className={`flex flex-1 flex-col items-center justify-center gap-1.5 p-4 text-center ${
                  isDark ? 'bg-[#0B101B]' : 'bg-slate-50'
                }`}>
                  <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/20 text-amber-500 text-[26px] border border-amber-400/40 shadow-md">
                    <span className="animate-ping absolute h-12 w-12 rounded-full bg-amber-500/30" />
                    <span>🚖</span>
                  </div>
                  <div className="flex gap-1 mt-1">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-2 w-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: `${i * 0.18}s` }} />
                    ))}
                  </div>
                  <span className="text-xs font-bold text-amber-500">جاري البحث عن كابتن بانتظار الموافقة...</span>
                </div>
              </div>

              {/* تفاصيل المسار والأجرة */}
              <div className={`rounded-2xl border p-3.5 space-y-2 text-xs ${
                isDark ? 'bg-[#0B101B] border-white/10 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}>
                <div className={`flex items-center justify-between pb-2 border-b ${
                  isDark ? 'border-white/10' : 'border-slate-200'
                }`}>
                  <span className={isDark ? "text-slate-400" : "text-slate-500"}>الأجرة التقديرية</span>
                  <span className="text-base font-black text-amber-500 font-mono">
                    {calculatedPrice.toLocaleString()} د.ع
                  </span>
                </div>
                <div className="space-y-1 text-start">
                  <p className="truncate">🟢 من: <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{pickupName}</span></p>
                  <p className="truncate">🔴 إلى: <span className={`font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{dropoffName}</span></p>
                  {isRoundTrip && (
                    <p className="text-amber-500 font-bold flex items-center gap-1 pt-0.5">
                      <span>🔄</span>
                      <span>رحلة ذهاب وإياب</span>
                    </p>
                  )}
                  {secondDestination && (
                    <p className="text-amber-500 flex items-center gap-1 pt-0.5">
                      <span>📍</span>
                      <span>محطة إضافية: <b className={isDark ? "text-white" : "text-slate-900"}>{secondDestination}</b></span>
                    </p>
                  )}
                  {stopDuration ? (
                    <p className="text-amber-500 flex items-center gap-1 pt-0.5">
                      <span>⏱️</span>
                      <span>توقف في الطريق: <b className={isDark ? "text-white" : "text-slate-900"}>{stopDuration} دقائق</b></span>
                    </p>
                  ) : null}
                </div>
              </div>

              {/* أزرار الإجراءات في مرحلة البحث */}
              <div className="flex flex-col gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => show('تم إعطاء الأولوية لطلبك في بث الرادار 🚖', 'success', 4000)}
                  className="w-full min-h-[48px] rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 py-3 text-center text-sm font-bold text-amber-300 transition active:scale-[0.98] cursor-pointer"
                >
                  أنا مستعجل كثيراً ⚡
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCancelTripOpen(true);
                    setCancelReason(null);
                  }}
                  className="w-full min-h-[48px] rounded-xl border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 py-2.5 text-center text-sm font-bold text-red-400 transition active:scale-[0.98] cursor-pointer"
                >
                  إلغاء الطلب ✕
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 7b. شاشة إلغاء الرحلة المعتمدة من الخادم مع عرض الرسوم */}
        {(stage === 'searching' || stage === 'driver_arriving' || Boolean(rideRequestId)) && isCancelTripOpen && (
          <div className="absolute inset-0 z-40 bg-[#0D131F] text-white flex flex-col animate-fade-in" dir="rtl">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-800">
              <h2 className="text-[19px] font-black text-white">إلغاء الرحلة</h2>
              <button
                type="button"
                onClick={() => setIsCancelTripOpen(false)}
                className="cursor-pointer text-slate-400 hover:text-white min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl"
                aria-label="إغلاق نافذة الإلغاء"
              >
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>

            {/* تنبيه رسوم الإلغاء */}
            {stage === 'driver_arriving' && (
              <div className="mx-5 mt-4 p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center gap-2">
                <span className="text-base">⚠️</span>
                <span>تنبيه: إذا مضت دقيقتان أو وصل الكابتن، تطبق رسوم إلغاء قدرها {cancelFeeAmount.toLocaleString()} د.ع لتعويض وقت الكابتن.</span>
              </div>
            )}

            <p className="px-5 pt-4 pb-2 text-[15px] font-bold text-slate-200">اختر سبب الإلغاء (إلزامي):</p>
            <div className="overflow-y-auto flex-1 divide-y divide-slate-800 px-5">
              {cancelReasonsList.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setCancelReason(r)}
                  className="flex w-full items-center justify-between py-4 min-h-[48px] cursor-pointer hover:bg-slate-800/40 text-right transition"
                >
                  <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${cancelReason === r ? 'border-amber-400' : 'border-slate-600'}`}>
                    {cancelReason === r && <div className="h-2.5 w-2.5 rounded-full bg-amber-400" />}
                  </div>
                  <span className="text-[14px] font-bold text-slate-200 text-right flex-1 mr-3">{r}</span>
                </button>
              ))}

              {cancelReason === 'سبب آخر' && (
                <div className="pt-3 pb-4">
                  <label className="block text-xs font-bold text-slate-400 mb-1.5">اكتب توضيحاً لسبب الإلغاء (إلزامي):</label>
                  <input
                    type="text"
                    maxLength={100}
                    value={customCancelText}
                    onChange={(e) => setCustomCancelText(e.target.value)}
                    placeholder="مثال: حصل ظرف عائلي مفاجئ..."
                    className="w-full rounded-xl bg-slate-900 border border-slate-700 p-3 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">{customCancelText.length}/100 حرف (3 كحد أدنى)</p>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 px-5 pt-4 pb-8 border-t border-slate-800">
              <button
                type="button"
                onClick={handleConfirmCancelTrip}
                disabled={!cancelReason || (cancelReason === 'سبب آخر' && customCancelText.trim().length < 3)}
                className={`flex-1 min-h-[56px] rounded-xl border-2 py-3.5 text-[15px] font-black transition ${
                  cancelReason && (cancelReason !== 'سبب آخر' || customCancelText.trim().length >= 3)
                    ? 'border-red-500 bg-red-600 text-white hover:bg-red-700 active:scale-98 cursor-pointer shadow-lg shadow-red-950/40'
                    : 'border-slate-800 bg-slate-900 text-slate-600 cursor-not-allowed'
                }`}
              >
                تأكيد إلغاء المشوار
              </button>
              <button
                type="button"
                onClick={() => setIsCancelTripOpen(false)}
                className="min-h-[56px] px-6 text-[15px] font-bold text-slate-400 cursor-pointer hover:text-white"
              >
                تراجع
              </button>
            </div>
          </div>
        )}

        {/* 8. بطاقة تفاصيل الرحلة التفاعلية ثلاثية الحالات (minimized, middle, expanded) */}
        {(stage === 'driver_arriving' || Boolean(rideRequestId && ['accepted', 'arrived', 'inprogress', 'in_progress', 'waiting_at_destination', 'in_trip_return'].includes((rideStatus || '').toLowerCase()))) && (
          <div
            role="region"
            aria-label="تفاصيل الرحلة الحالية"
            tabIndex={0}
            onKeyDown={handleSheetKeyDown}
            style={{
              maxHeight: 'calc(100dvh - 5.5rem - env(safe-area-inset-top, 1rem))',
              transform:
                rideSheetState === 'expanded'
                  ? 'translateY(0)'
                  : rideSheetState === 'middle'
                  ? 'translateY(calc(100% - 255px))'
                  : 'translateY(calc(100% - 78px))',
              transition: 'transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)',
            }}
            className={`absolute inset-x-0 bottom-0 z-30 flex flex-col max-h-[calc(100dvh-5.5rem-env(safe-area-inset-top,1rem))] overflow-hidden rounded-t-[28px] backdrop-blur-md border-t pb-[calc(1.5rem+env(safe-area-inset-bottom))] mb-[env(safe-area-inset-bottom)] shadow-2xl will-change-transform animate-fade-in ${
              isDark ? 'bg-[#161C28]/95 border-amber-500/20 text-white' : 'bg-white/95 border-slate-200 text-slate-900 shadow-xl'
            }`}
          >
            {/* مقبض السحب وترويسة الورقة مع دعم Pointer Events وإمكانية الوصول */}
            <div
              onPointerDown={handleSheetPointerDown}
              onPointerMove={handleSheetPointerMove}
              onPointerUp={handleSheetPointerUp}
              style={{ touchAction: 'none' }}
              onClick={(e) => {
                e.stopPropagation();
                setRideSheetState((prev) => (prev === 'middle' ? 'expanded' : prev === 'expanded' ? 'minimized' : 'middle'));
              }}
              className="cursor-pointer select-none touch-none pt-2.5 pb-2 px-5 flex flex-col items-center border-b border-slate-700/60"
            >
              {/* الركزة الرمادية مع مساحة لمس موسعة ومريحة (Hitbox Padding >= 48px) */}
              <div className="py-2.5 px-10 flex justify-center items-center min-h-[48px]">
                <div className="h-1.5 w-12 rounded-full bg-slate-400 hover:bg-slate-300 active:bg-amber-400 transition-colors" />
              </div>

              {/* شريط الحالة المصغّر (يظهر في حالة minimized) */}
              {rideSheetState === 'minimized' && (
                <div className="w-full flex items-center justify-between mt-0.5 pb-1 animate-fade-in">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🚗</span>
                    <span className="text-[13.5px] font-black text-amber-300">
                      {assignedDriverInfo?.driverVehicle || 'سيارة توصيلة'}
                    </span>
                    <span className="text-xs font-mono font-bold bg-[#0B101B] px-2 py-0.5 rounded border border-amber-500/30 text-amber-400">
                      {assignedDriverInfo?.driverPlate || '١١٣٤٠ ة'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (assignedDriverInfo?.driverPhone) window.open(`tel:${assignedDriverInfo.driverPhone}`);
                        else show('رقم الكابتن غير متوفر حالياً', 'info');
                      }}
                      className="min-h-[44px] min-w-[44px] rounded-full bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 flex items-center justify-center hover:bg-emerald-600/50 transition cursor-pointer"
                      title="اتصال سريع بالكابتن"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.95 12a19.79 19.79 0 0 1-3-8.59A2 2 0 0 1 4 1.37h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRideSheetState('middle');
                      }}
                      className="text-xs text-slate-400 font-bold flex items-center gap-1 hover:text-white"
                    >
                      <span>تفاصيل</span>
                      <svg className="h-4 w-4 rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="18 15 12 9 6 15" /></svg>
                    </button>
                  </div>
                </div>
              )}

              {/* اسم ونوع السيارة وسهم المؤشر (لحالتي middle و expanded) */}
              {rideSheetState !== 'minimized' && (
                <div className="w-full flex items-center justify-between mt-0.5 mb-2 px-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[16px] font-black text-white truncate">
                      {assignedDriverInfo?.driverVehicle || 'سيارة خصوصي'}
                    </p>
                    <span className="text-xs font-mono font-bold bg-[#0B101B] px-2 py-0.5 rounded border border-amber-500/30 text-amber-400">
                      {assignedDriverInfo?.driverPlate || '١١٣٤٠ ة'}
                    </span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded border border-amber-500/30 text-amber-300 bg-amber-500/10">
                      {assignedDriverInfo?.driverTier === 'super' || assignedDriverInfo?.driverTier === 'سوبر' ? '⚡ سوبر' : (assignedDriverInfo?.driverTier === 'plus' || assignedDriverInfo?.driverTier === 'بلس' || assignedDriverInfo?.driverTier === 'vip') ? '💎 بلس' : '🚕 توفير'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-400 text-xs font-bold">
                    <span>{rideSheetState === 'expanded' ? 'اسحب للأسفل' : 'اسحب للأعلى'}</span>
                    <svg
                      className={`h-4 w-4 transition-transform duration-300 ${rideSheetState === 'expanded' ? 'rotate-180' : 'rotate-0'}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="18 15 12 9 6 15" />
                    </svg>
                  </div>
                </div>
              )}

              {/* شريط الحالة الدائم (يظهر في middle و expanded) */}
              {rideSheetState !== 'minimized' && (
                <div className="w-full">
                  {(() => {
                    const lowerSt = (rideStatus || '').toLowerCase();
                    const isArr = lowerSt === 'arrived';
                    const isInProg = lowerSt === 'inprogress' || lowerSt === 'in_progress';
                    const isWait = lowerSt === 'waiting_at_destination';
                    const isReturn = lowerSt === 'in_trip_return';

                    return (
                      <div
                        className={`w-full rounded-xl py-2 px-3.5 text-center select-none border transition-colors ${
                          isWait
                            ? 'bg-amber-950/70 border-amber-500/60 text-amber-200'
                            : isReturn
                            ? 'bg-blue-950/70 border-blue-500/60 text-blue-200'
                            : isInProg
                            ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                            : isArr
                            ? 'bg-amber-950/60 border-amber-500/50 text-amber-200 shadow-xs'
                            : 'bg-[#0B101B] border-amber-500/30 text-amber-300'
                        }`}
                      >
                        <div className="flex items-center justify-center gap-2">
                          {isWait ? (
                            <div className="flex items-center justify-between w-full">
                              <span className="text-[13.5px] font-black text-amber-300">الكابتن بانتظارك في المحطة الأولى ⏳</span>
                              <span className="text-[13px] font-mono font-black text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-md border border-amber-500/40">
                                {Math.floor(customerWaitSeconds / 60)}:{(customerWaitSeconds % 60).toString().padStart(2, '0')}
                              </span>
                            </div>
                          ) : isReturn ? (
                            <span className="text-[14px] font-black">رحلة العودة جارية الآن إلى نقطة الانطلاق 🔄</span>
                          ) : isInProg ? (
                            <span className="text-[14px] font-black">في الطريق إلى الوجهة 🚗💨</span>
                          ) : isArr ? (
                            <div className="flex items-center justify-between w-full">
                              <div className="flex items-center gap-1.5 text-right min-w-0">
                                <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400 animate-ping mr-1 shrink-0" />
                                <span className="text-[13px] md:text-[13.5px] font-black text-amber-200 truncate">السائق بانتظارك، يرجى الصعود للسيارة 🚖</span>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  playCarHornBeep();
                                  show('بيب بيب! 🚖 تم إطلاق التنبيه الصوتي', 'info', 3000);
                                }}
                                className="text-xs bg-amber-500 hover:bg-amber-600 active:scale-95 text-[#090D16] font-black px-3 py-1.5 rounded-lg transition shadow-xs flex items-center gap-1.5 cursor-pointer shrink-0 border border-amber-600/30"
                                title="إعادة تشغيل صوت الهورن"
                              >
                                <span className="text-sm">📢</span>
                                <span>بيب بيب</span>
                              </button>
                            </div>
                          ) : (
                            <>
                              <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-pulse mr-1" />
                              <span className="text-[13.5px] font-bold text-amber-300">الكابتن في طريقه إليك 🚗</span>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* صف وسائل التواصل الثلاث: اتصال + واتساب + مراسلة (دائماً متاح في حالتي middle و expanded) */}
            {rideSheetState !== 'minimized' && (
              <div className="px-5 pt-3 pb-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (assignedDriverInfo?.driverPhone) window.open(`tel:${assignedDriverInfo.driverPhone}`);
                      else show('رقم الكابتن غير متوفر حالياً', 'info');
                    }}
                    className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/40 bg-emerald-950/40 text-emerald-400 shrink-0 hover:bg-emerald-500/20 active:scale-95 cursor-pointer"
                    title="اتصال هاتفي بالكابتن"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.95 12a19.79 19.79 0 0 1-3-8.59A2 2 0 0 1 4 1.37h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const raw = assignedDriverInfo?.driverPhone;
                      if (!raw) {
                        show('رقم الكابتن غير متوفر لمحادثة الواتساب', 'info');
                        return;
                      }
                      const clean = String(raw).replace(/[^0-9]/g, '').replace(/^0+/, '');
                      const intlPhone = clean.startsWith('964') ? clean : `964${clean}`;
                      window.open(`https://wa.me/${intlPhone}?text=${encodeURIComponent('السلام عليكم كابتن، أنا بخصوص رحلتنا في توصيلة')}`, '_blank', 'noopener,noreferrer');
                    }}
                    className="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/40 bg-emerald-950/40 text-emerald-400 shrink-0 hover:bg-emerald-500/20 active:scale-95 cursor-pointer"
                    title="محادثة واتساب"
                  >
                    <span className="text-xl">💬</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsChatOpen(true);
                    }}
                    className="flex flex-1 items-center justify-end gap-2 rounded-2xl bg-[#0B101B] border border-amber-500/30 px-4 py-3 text-[14px] font-bold text-amber-300 hover:border-amber-500 transition active:scale-95 cursor-pointer min-h-[48px]"
                  >
                    <span>مراسلة السائق...</span>
                    <svg className="h-5 w-5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* محتوى تفاصيل الكابتن الإضافية والدفع والإلغاء (يظهر في حالة expanded) */}
            <div
              className={`flex flex-col transition-all duration-300 px-5 pt-2 space-y-3.5 overflow-y-auto overscroll-contain touch-pan-y ${
                rideSheetState === 'expanded'
                  ? 'opacity-100 pointer-events-auto max-h-[500px]'
                  : 'opacity-0 pointer-events-none max-h-0 overflow-hidden'
              }`}
            >
              {/* لوحة + اسم السائق + صورة */}
              <div className="flex items-center justify-between">
                <div className="rounded-xl border-2 border-amber-500/40 bg-[#0B101B] px-3 py-2 text-center min-w-[100px]">
                  <p className="text-[18px] font-black text-amber-400 tracking-widest font-mono">
                    {assignedDriverInfo?.driverPlate || '١١٣٤٠ ة'}
                  </p>
                  <div className="flex justify-between text-[10px] text-amber-400/70 font-bold mt-0.5">
                    <span>النجف</span>
                    <span>خصوصي</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="text-[16px] font-bold text-white block">
                      {assignedDriverInfo?.driverName || 'كابتن توصيله'}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded border border-amber-500/30 text-amber-300 bg-amber-500/10 inline-block mt-0.5">
                      {assignedDriverInfo?.driverTier === 'super' || assignedDriverInfo?.driverTier === 'سوبر' ? '⚡ سوبر' : (assignedDriverInfo?.driverTier === 'plus' || assignedDriverInfo?.driverTier === 'بلس' || assignedDriverInfo?.driverTier === 'vip') ? '💎 بلس' : '🚕 توفير'}
                    </span>
                  </div>
                  <div className="h-14 w-14 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-300 text-[26px] border-2 border-amber-500/40">
                    🧑‍✈️
                  </div>
                </div>
              </div>

              {/* الدفع */}
              <div className="flex items-center justify-between rounded-2xl bg-[#0B101B] border border-slate-800 px-4 py-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    show('الدفع نقداً عند الوصول 💵', 'info');
                  }}
                  className="rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-amber-500 px-4 py-2 text-[13px] font-black text-[#090D16] cursor-pointer hover:brightness-110"
                >
                  الدفع
                </button>
                <div className="text-right">
                  <p className="text-[13px] font-bold text-amber-400">الدفع نقداً للكابتن</p>
                  <p className="text-[12px] text-slate-400">
                    مبلغ الرحلة: {calculatedPrice.toLocaleString()} دينار ({selectedTierId === 'super' ? '⚡ سوبر' : selectedTierId === 'plus' ? '💎 بلس' : '🚕 توفير'})
                  </p>
                </div>
                <svg className="h-6 w-6 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="1" y="4" width="22" height="16" rx="2"/>
                  <line x1="1" y1="10" x2="23" y2="10"/>
                </svg>
              </div>

              {/* زر إلغاء الرحلة متاح للراكب لحين بدء الرحلة فعلياً */}
              {(!rideStatus || (!['inprogress', 'in_progress', 'waiting_at_destination', 'in_trip_return', 'completed'].includes(rideStatus.toLowerCase()))) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsCancelTripOpen(true);
                    setCancelReason(null);
                  }}
                  className="w-full min-h-[48px] py-3 rounded-2xl border border-red-500/30 bg-red-950/20 text-red-400 text-xs font-bold hover:bg-red-950/40 transition active:scale-98 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>✕</span>
                  <span>إلغاء الرحلة</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 8. نافذة "خيارات الرحلة" الفاخرة */}
      {isTripOptionsOpen && (
        <div className="fixed inset-0 md:max-w-md md:mx-auto z-50 flex flex-col bg-[#0D131F] text-white overflow-y-auto animate-fade-in" dir="rtl">
          {/* الترويسة العلوية: سهم الرجوع وعنوان خيارات الرحلة في أقصى اليمين */}
          <div className="flex items-center gap-3 px-5 pt-[calc(1rem+env(safe-area-inset-top))] pb-3 border-b border-slate-800" dir="rtl">
            <button
              type="button"
              onClick={() => setIsTripOptionsOpen(false)}
              className="w-12 h-12 flex items-center justify-center rounded-xl text-amber-400 hover:text-amber-300 hover:bg-slate-800/50 cursor-pointer transition active:scale-95 shrink-0"
              title="رجوع"
              aria-label="رجوع"
            >
              {/* سهم الرجوع باتجاه اليمين في نمط RTL */}
              <svg
                className="h-6 w-6 text-amber-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
            <h2 className="text-[20px] font-bold text-white text-right">خيارات الرحلة</h2>
          </div>

          {/* شعار توصيلة المعتمد مع الشارة واسم الفئة */}
          <div className="flex flex-col items-center justify-center pt-8 pb-6">
            <TawseelaTierLogo badge={currentTier.badge} size="lg" />
            <h3 className="mt-4 text-[22px] font-black text-white">{currentTier.name}</h3>
            <p className="text-xs font-semibold text-slate-400 mt-1">{currentTier.subtitle}</p>
          </div>

          {/* تنبيه: لا يمكن تغيير الخيارات أثناء الرحلة */}
          <div className="mx-6 mb-6 flex items-center gap-3 rounded-2xl bg-[#0B101B] border border-slate-800 p-3.5" dir="rtl">
            <div className="shrink-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30 shadow-xs">
                <svg
                  className="h-5 w-5 text-amber-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
            </div>
            <div className="text-right flex-1">
              <p className="text-[13px] font-bold text-slate-300 leading-relaxed">
                ملحوظة: لا يمكن تغيير الخيارات التي اخترتها أثناء الرحلة.
              </p>
            </div>
          </div>

          {/* قائمة الخيارات بأسلوب RTL صارم */}
          <div className="px-6 flex-1" dir="rtl">
            <h4 className="text-[16px] font-bold text-slate-300 mb-2 text-right">خيارات الرحلة</h4>
            <div className="divide-y divide-slate-800">
              {/* 1. الوجهة الثانية */}
              <div
                onClick={() => setIsAddingSecondDest((v) => !v)}
                className="flex items-center justify-between py-4 cursor-pointer hover:bg-slate-800/40 transition min-h-[48px]"
                dir="rtl"
              >
                {/* النص على اليمين */}
                <div className="text-right">
                  <span className="text-[16px] font-bold text-slate-200">الوجهة الثانية</span>
                  {secondDestination && (
                    <p className="text-xs font-semibold text-amber-400 mt-0.5">{secondDestination}</p>
                  )}
                </div>

                {/* مؤشر التوسيع على اليسار */}
                <div className="text-slate-400">
                  <svg
                    className={`h-5 w-5 transition-transform duration-200 ${isAddingSecondDest ? 'rotate-90' : ''}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </div>
              </div>

              {/* حقل إدخال الوجهة الثانية إن تم فتحها */}
              {isAddingSecondDest && (
                <div className="py-2 animate-fade-in" dir="rtl">
                  <input
                    type="text"
                    name="fake_dest_rand_88"
                    id="fake_dest_rand_88"
                    inputMode="text"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    data-form-type="other"
                    value={secondDestination}
                    onChange={(e) => setSecondDestination(e.target.value)}
                    placeholder="حدد اسم الوجهة الإضافية..."
                    className="w-full rounded-xl border border-amber-500/30 bg-[#0B101B] p-3 text-xs font-bold text-amber-300 text-right outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/50"
                  />
                </div>
              )}

              {/* 2. التوقف في الطريق */}
              <div
                onClick={() => setIsAddingStop((v) => !v)}
                className="flex items-center justify-between py-4 cursor-pointer hover:bg-slate-800/40 transition min-h-[48px]"
                dir="rtl"
              >
                {/* النص على اليمين */}
                <div className="text-right">
                  <span className="text-[16px] font-bold text-slate-200">التوقف في الطريق</span>
                  {stopDuration ? (
                    <p className="text-xs font-semibold text-amber-400 mt-0.5">
                      توقف لمدة {stopDuration} دقائق (+500 د.ع)
                    </p>
                  ) : null}
                </div>

                {/* مؤشر التوسيع على اليسار */}
                <div className="text-slate-400">
                  <svg
                    className={`h-5 w-5 transition-transform duration-200 ${isAddingStop ? 'rotate-90' : ''}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </div>
              </div>

              {/* خيارات مدة التوقف */}
              {isAddingStop && (
                <div className="flex gap-2 py-2 animate-fade-in" dir="rtl">
                  {[5, 10, 15].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setStopDuration(mins)}
                      className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition cursor-pointer min-h-[48px] ${
                        stopDuration === mins
                          ? 'bg-gradient-to-r from-amber-500 via-amber-600 to-amber-500 text-[#090D16] font-black shadow-md'
                          : 'bg-[#0B101B] text-slate-300 hover:bg-slate-800 border border-slate-700'
                      }`}
                    >
                      {mins} دقائق
                    </button>
                  ))}
                  {stopDuration ? (
                    <button
                      type="button"
                      onClick={() => setStopDuration(null)}
                      className="px-3 rounded-xl py-2.5 text-xs font-bold text-red-400 hover:bg-red-950/40 border border-red-500/30 transition min-h-[48px]"
                    >
                      إلغاء
                    </button>
                  ) : null}
                </div>
              )}

              {/* 3. رحلة ذهاب وإياب */}
              <div className="flex items-center justify-between py-4 min-h-[48px]" dir="rtl">
                {/* النص على اليمين */}
                <div className="text-right">
                  <span className="text-[16px] font-bold text-slate-200">رحلة ذهاب وإياب</span>
                  <p className="text-xs font-semibold text-slate-400 mt-0.5">
                    {isRoundTrip ? 'مفعّلة (توفير 15% على العودة)' : 'توفير تكلفة العودة للموقع'}
                  </p>
                </div>

                {/* مفتاح التبديل Toggle Switch على اليسار */}
                <button
                  type="button"
                  onClick={() => setIsRoundTrip((v) => !v)}
                  className={`relative h-7 w-12 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
                    isRoundTrip ? 'bg-amber-500' : 'bg-slate-700'
                  }`}
                  aria-label="تفعيل رحلة ذهاب وإياب"
                >
                  <span
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-md transition-all duration-200 ease-in-out ${
                      isRoundTrip ? 'left-1' : 'right-1'
                    }`}
                  />
                </button>
              </div>

              {/* خيارات تفاصيل الذهاب والإياب */}
              {isRoundTrip && (
                <div className="p-4 rounded-2xl bg-[#0B101B] border border-amber-500/30 space-y-3.5 animate-fade-in mb-3" dir="rtl">
                  <div>
                    <label className="block text-xs font-bold text-amber-400 mb-2 text-right">
                      مدة الانتظار المتوقعة في المحطة:
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {[15, 30, 45, 60].map((mins) => (
                        <button
                          key={mins}
                          type="button"
                          onClick={() => setRoundTripWaitMinutes(mins)}
                          className={`min-h-[48px] py-2 px-1 text-center rounded-xl text-xs font-black transition cursor-pointer border ${
                            roundTripWaitMinutes === mins
                              ? 'bg-amber-500 text-[#090D16] border-amber-500 shadow-md scale-102'
                              : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:border-amber-500/40'
                          }`}
                        >
                          {mins} دقيقة
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2 text-right leading-relaxed">
                      💡 أول 10 دقائق انتظار مجانية، ثم يُحسب رسم الانتظار الفعلي ديناميكياً.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1.5 text-right">
                      وجهة العودة (افتراضياً: نفس موقع الانطلاق):
                    </label>
                    <input
                      type="text"
                      value={returnDestinationAddress}
                      onChange={(e) => setReturnDestinationAddress(e.target.value)}
                      placeholder={pickupName || 'نفس نقطة الانطلاق'}
                      className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 text-right"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* الشريط السفلي: مبلغ الرحلة وزر التأكيد وزر الإنهاء */}
          <div className="border-t border-slate-800 p-5 bg-[#0B101B]" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[14px] font-medium text-slate-400">مبلغ الرحلة التقديري</span>
              <span className="text-[18px] font-black text-amber-400 font-mono">
                {calculatedPrice.toLocaleString()} د.ع
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* زر إنهاء */}
              <button
                type="button"
                onClick={() => setIsTripOptionsOpen(false)}
                className="h-12 px-6 rounded-xl border border-slate-700 bg-slate-800/80 text-sm font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition active:scale-95 cursor-pointer min-w-[80px]"
              >
                إغلاق
              </button>

              {/* زر تأكيد */}
              <button
                type="button"
                onClick={() => {
                  setIsTripOptionsOpen(false);
                  show('تم حفظ وتأكيد خيارات الرحلة بنجاح ✅', 'success');
                }}
                className="flex-1 h-12 rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-amber-500 text-center text-[15px] font-black text-[#090D16] hover:brightness-110 shadow-[0_4px_20px_rgba(245,158,11,0.3)] transition-all duration-200 active:scale-[0.98] cursor-pointer flex items-center justify-center"
              >
                تأكيد الخيارات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة إدخال القسيمة */}
      {isPromoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sheet animate-fade-in text-right border border-slate-100">
            <h3 className="text-lg font-bold text-[#1A1A1A] mb-2">🏷️ قسيمة الخصم</h3>
            <p className="text-xs font-medium text-[#6C757D] mb-4">أدخل كود القسيمة للحصول على خصم مباشر:</p>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={promoCodeInput}
                onChange={(e) => setPromoCodeInput(e.target.value)}
                placeholder="أدخل الكود (مثال: TAWSEELA20)"
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-right outline-none focus:border-[#1B4965] focus:ring-2 focus:ring-[#1B4965]/10"
              />
              <button
                type="button"
                onClick={() => {
                  if (promoCodeInput.trim()) {
                    setAppliedPromo(promoCodeInput.trim());
                    show('تم تطبيق الخصم 20% بنجاح! 🎉', 'success');
                    setIsPromoModalOpen(false);
                  }
                }}
                className="rounded-xl bg-[#1B4965] px-4 py-2 text-xs font-bold text-white hover:bg-[#14364A] transition-colors"
              >
                تطبيق
              </button>
            </div>
            <button
              type="button"
              onClick={() => setIsPromoModalOpen(false)}
              className="w-full rounded-xl bg-slate-100 py-2.5 text-center text-xs font-bold text-[#1A1A1A] hover:bg-slate-200 transition-colors"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* 9. نافذة البحث الفاخرة عن الأماكن */}
      {isSearchOpen && (
        <div className={`fixed inset-0 md:max-w-md md:mx-auto z-50 flex flex-col ${
          isDark ? 'bg-[#0D131F] text-white' : 'bg-slate-50 text-slate-900'
        }`}>
          <div className={`flex items-center justify-between px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-3 border-b ${
            isDark ? 'border-slate-800' : 'border-slate-200 bg-white'
          }`}>
            <h2 className={`text-[18px] font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {stage === 'pickup' ? 'حدد نقطة الانطلاق' : 'حدد وجهة الوصول'}
            </h2>
            <button
              type="button"
              onClick={() => {
                setIsSearchOpen(false);
                setSearchQuery('');
                setSearchResults([]);
              }}
              className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors cursor-pointer ${
                isDark ? 'text-slate-400 hover:text-white hover:bg-slate-800' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
              aria-label="إغلاق"
            >
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* مربع البحث العلوي المندمج */}
          <div className="px-4 py-3">
            <div className={`flex items-center rounded-xl border px-3 py-2.5 transition-all focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500/20 ${
              isDark ? 'bg-[#0B101B] border-amber-500/30' : 'bg-white border-slate-300 shadow-sm'
            }`}>
              <button
                type="button"
                onClick={() => setIsCitySelectorOpen(true)}
                className={`flex items-center gap-1.5 shrink-0 px-2 py-1 rounded-lg border text-[12px] font-bold transition cursor-pointer ${
                  isDark ? 'bg-[#161C28] border-amber-500/30 text-amber-300 hover:border-amber-400' : 'bg-slate-100 border-slate-200 text-amber-700 hover:border-amber-400'
                }`}
                title="تغيير المحافظة"
              >
                <span>محافظتك: {selectedCity}</span>
                <svg className="h-3.5 w-3.5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              </button>

              <div className={`mx-2.5 h-4 w-[1px] ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`} />

              <div className="mr-1 text-amber-500">
                <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>

              <input
                type="text"
                name="fake_search_rand_99"
                id="fake_search_rand_99"
                inputMode="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
                data-form-type="other"
                autoFocus
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={
                  stage === 'pickup' ? 'ابحث عن موقع الانطلاق...' : 'ابحث عن وجهة الوصول...'
                }
                className={`flex-1 bg-transparent text-[14px] font-medium outline-none placeholder-slate-400 font-map-search ${
                  isDark ? 'text-white' : 'text-slate-900'
                }`}
              />

              <button
                type="button"
                onClick={handleMicClick}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isListeningMic ? 'text-red-400 bg-red-950/40 animate-pulse' : 'text-slate-400 hover:text-amber-400 hover:bg-slate-800'
                }`}
                title="البحث الصوتي"
              >
                <svg
                  className="h-4.5 w-4.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
              </button>
            </div>
          </div>

          {/* شريط الأماكن السريعة */}
          <div className={`flex items-center gap-2.5 px-4 pb-3 overflow-x-auto no-scrollbar border-b ${
            isDark ? 'border-slate-800' : 'border-slate-200'
          }`}>
            {QUICK_CHIPS.map((chip) => (
              <div
                key={chip.name}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectPlace(chip);
                }}
                className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 cursor-pointer transition-all duration-200 active:scale-95 shadow-sm shrink-0 ${
                  isDark ? 'border-slate-800 bg-[#161C28] text-slate-200 hover:border-amber-500/40' : 'border-slate-200 bg-white text-slate-800 hover:border-amber-500'
                }`}
              >
                <span className="text-[13px] font-bold">{chip.name}</span>
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-500/20 text-amber-500">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </div>
              </div>
            ))}
          </div>

          {/* قائمة الأماكن */}
          <div
            onMouseDown={(e) => e.preventDefault()}
            className={`flex-1 overflow-y-auto px-4 py-3 ${isDark ? 'bg-[#080E1A]' : 'bg-white'}`}
          >
            {isSearchingPlaces && (
              <div className="flex items-center justify-center py-8 text-slate-400">
                <Spinner className="h-5 w-5 ml-2 text-amber-500" />
                <span className="text-xs font-semibold">جاري البحث في الأماكن والمعالم...</span>
              </div>
            )}

            {!isSearchingPlaces && searchResults.length > 0 && (
              <div className="space-y-1.5">
                <p className={`mb-2 text-[12px] font-bold px-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {searchQuery.trim().length === 0 ? 'أماكن مقترحة' : `نتائج البحث (${searchResults.length})`}
                </p>
                {searchResults.map((place, idx) => (
                  <div
                    key={`${place.lat}-${(place as any).lon ?? (place as any).lng ?? idx}-${idx}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectPlace(place);
                    }}
                    className={`group flex items-center justify-between p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
                      isDark ? 'border-slate-800 bg-[#0B101B] hover:border-amber-500/50' : 'border-slate-200 bg-slate-50 hover:border-amber-500 hover:bg-amber-50/20'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 group-hover:bg-amber-500/20 transition-colors">
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                      </div>
                      <div className="truncate font-map-search">
                        <p className={`text-[14.5px] font-bold transition-colors truncate ${
                          isDark ? 'text-slate-200 group-hover:text-amber-300' : 'text-slate-900 group-hover:text-amber-700'
                        }`}>
                          {place.name}
                        </p>
                        <p className={`text-[12px] font-medium mt-0.5 truncate ${
                          isDark ? 'text-slate-400' : 'text-slate-500'
                        }`}>
                          {place.subName || 'النجف الأشرف'}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        e.stopPropagation();
                        addFavoritePlace({
                          name: place.name,
                          lat: place.lat,
                          lng: (place as any).lon ?? (place as any).lng ?? place.lat,
                        });
                        setFavoritePlaces(getFavoritePlaces());
                        show(`تمت إضافة ${place.name} إلى المفضلة ⭐`, 'success');
                      }}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors cursor-pointer"
                      title="إضافة للمفضلة"
                    >
                      <svg
                        className="h-4.5 w-4.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {!isSearchingPlaces && searchResults.length === 0 && searchQuery.trim().length > 0 && (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-500 mb-3 shadow-2xs">
                  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    <line x1="8" y1="11" x2="14" y2="11" />
                  </svg>
                </div>
                <p className="text-[15px] font-bold text-slate-800">لم يتم العثور على نتائج تطابق بحثك</p>
                <p className="text-[12.5px] text-slate-400 mt-1 max-w-xs">
                  تأكد من كتابة اسم المعلم أو الحي أو المحل بدقة (مثل: هايبر ماركت جوري، شارع الروان، حي العدالة)
                </p>
              </div>
            )}

            {!isSearchingPlaces && searchQuery.trim().length === 0 && searchResults.length === 0 && (
              <div className="space-y-1">
                <p className="mb-2 text-[12px] font-bold text-[#6C757D] px-1">الأماكن الأخيرة الشائعة</p>
                <div className="space-y-1.5">
                  {recentPlacesList.map((item) => (
                    <div
                      key={`${item.name}-${item.lat}-${item.lng}`}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectPlace(item);
                      }}
                      className="group flex items-center justify-between p-3 rounded-xl border border-transparent bg-white hover:border-slate-200/80 hover:shadow-card transition-all duration-200 cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[#1B4965] group-hover:bg-[#1B4965]/10 transition-colors">
                          <svg
                            className="h-5 w-5 text-[#6C757D] group-hover:text-[#1B4965] transition-colors"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <polyline points="12 6 12 12 16 14" />
                          </svg>
                        </div>
                        <div className="truncate">
                          <p className="text-[14.5px] font-bold text-[#1A1A1A] group-hover:text-[#1B4965] transition-colors truncate">
                            {item.name}
                          </p>
                          {item.address && (
                            <p className="text-[12px] font-medium text-[#6C757D] mt-0.5 truncate">
                              {item.address}
                            </p>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.stopPropagation();
                          addFavoritePlace({ name: item.name, address: item.address, lat: item.lat, lng: item.lng });
                          setFavoritePlaces(getFavoritePlaces());
                          show(`تمت إضافة ${item.name} إلى المفضلة ⭐`, 'success');
                        }}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:text-amber-500 hover:bg-amber-50 transition-colors cursor-pointer"
                        title="إضافة للمفضلة"
                      >
                        <svg
                          className="h-4.5 w-4.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 10. نافذة اختيار المدينة */}
      {isCitySelectorOpen && (
        <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/70 backdrop-blur-xs">
          <div className="relative flex h-[82%] w-full flex-col rounded-t-2xl bg-[#0D131F] text-white pt-4 pb-2 shadow-2xl animate-fade-in border-t border-slate-800">
            <div className="flex items-center justify-between px-5 pb-3 border-b border-slate-800">
              <h3 className="text-[17px] font-bold text-white">
                {stage === 'pickup' ? 'إختيار مدينة نقطة الانطلاق' : 'إختيار مدينة نقطة الوصول'}
              </h3>
              <button
                type="button"
                onClick={() => setIsCitySelectorOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                aria-label="إغلاق"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="px-5 my-3">
              <div className="flex items-center rounded-xl bg-[#0B101B] border border-amber-500/30 px-4 py-2.5 focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500/20 transition-all">
                <svg
                  className="h-5 w-5 text-amber-400/80 shrink-0 ml-2"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  name="fake_city_rand_77"
                  id="fake_city_rand_77"
                  inputMode="text"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck="false"
                  data-form-type="other"
                  value={citySearchQuery}
                  onChange={(e) => setCitySearchQuery(e.target.value)}
                  placeholder="البحث في محافظات العراق الـ 18..."
                  className="w-full bg-transparent text-[14px] font-medium text-white outline-none placeholder-slate-500 text-right"
                />
              </div>
            </div>

            <div className="px-5 py-3 border-b border-slate-800">
              <button
                type="button"
                onClick={handleSelectCurrentCity}
                className="flex items-center gap-3 text-amber-400 hover:text-amber-300 cursor-pointer transition active:scale-[0.99] font-bold text-[15px]"
              >
                <svg
                  className="h-5 w-5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="7" />
                  <circle cx="12" cy="12" r="2.5" fill="currentColor" />
                  <line x1="12" y1="2" x2="12" y2="5" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                  <line x1="2" y1="12" x2="5" y2="12" />
                  <line x1="19" y1="12" x2="22" y2="12" />
                </svg>
                <span>محافظتك الحالية (GPS)</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 divide-y divide-slate-800">
              {filteredCities.map((city) => (
                <div
                  key={city.id}
                  onClick={() => handleSelectCity(city)}
                  className="flex items-center justify-between py-3.5 cursor-pointer hover:bg-slate-800/40 transition active:scale-[0.99]"
                >
                  <div className="text-right">
                    <p className="text-[15px] font-bold text-slate-200">{city.name}</p>
                    <p className="text-[13px] font-semibold text-slate-400 mt-0.5">{city.sub}</p>
                  </div>
                  <div className="text-amber-400/70">
                    <svg
                      className="h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}



      {/* نافذة المحادثة المباشرة بين الراكب والسائق */}
      <Suspense fallback={null}>
        <ChatModal
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          requestId={rideRequestId || 'active-ride'}
          currentUserId={session?.userId || storage.getUserId() || 'customer'}
          currentUserRole="Customer"
          currentUserName={session?.fullName || 'الراكب'}
          peerName={assignedDriverInfo?.driverName || 'كابتن توصيله'}
          peerPhone={assignedDriverInfo?.driverPhone}
          peerRole={assignedDriverInfo?.driverVehicle || 'كابتن توصيله'}
        />
      </Suspense>

      {/* نافذة تقييم الراكب للكابتن بنمط بلي (Customer Rating Captain Modal) */}
      {isRatingModalOpen && completedDriverInfo && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-fade-in overflow-y-auto">
          <div
            className="w-full max-w-md rounded-3xl bg-[#0D131F] text-white p-6 shadow-2xl border border-amber-500/20 animate-slide-down my-auto"
            dir="rtl"
          >
            {/* رأس النافذة الاحتفالي */}
            <div className="text-center mb-4">
              <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-400 to-yellow-300 text-slate-950 text-2xl shadow-md shadow-amber-400/20 animate-bounce">
                🌟
              </div>
              <h3 className="text-[19px] font-black text-white">
                تقييم رحلتك مع الكابتن
              </h3>
              <p className="text-[12.5px] font-medium text-slate-500 mt-0.5">
                وصلت لوجهتك بسلام! رأيك يهمنا لمكافأة الكابتن وتحسين الخدمة ✨
              </p>
            </div>

            {/* بطاقة معلومات الكابتن والمركبة */}
            <div className="rounded-2xl bg-[#0B101B] border border-amber-500/20 p-3.5 mb-4 text-right">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-300 text-[22px] border-2 border-amber-500/40 shadow-xs">
                    🧑‍✈️
                  </div>
                  <div>
                    <span className="text-[14.5px] font-bold text-white block">
                      {completedDriverInfo.driverName || 'كابتن توصيله'}
                    </span>
                    <span className="text-[12px] font-medium text-slate-400 block">
                      {completedDriverInfo.driverVehicle || 'كيا سيراتو 2022'}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-500/30 bg-[#161C28] px-2.5 py-1 text-center shadow-2xs">
                  <span className="text-[13px] font-black text-amber-400 tracking-wider block font-mono">
                    {completedDriverInfo.driverPlate || '١١٣٤٠ ة'}
                  </span>
                  <span className="text-[9.5px] font-bold text-amber-400/70 block">النجف</span>
                </div>
              </div>
            </div>

            {/* ملخص الكروة وتأكيد الدفع نقداً للراكب */}
            <div className="rounded-2xl bg-[#0B101B] border border-amber-500/30 p-4 mb-4 text-right" dir="rtl">
              <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-800">
                <span className="text-xs font-bold text-slate-400">ملخص حساب المشوار الرسمي</span>
                {completedRideBreakdown?.needsReconciliationReview ? (
                  <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    ⏳ بانتظار التسوية
                  </span>
                ) : isFareConfirmedByCustomer ? (
                  <span className="text-[11px] font-black px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    ✅ تم تأكيد الكروة
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-amber-400">
                    الدفع نقداً للكابتن
                  </span>
                )}
              </div>

              {/* بنود الحساب التفصيلية */}
              <div className="space-y-1.5 text-xs text-slate-300">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">أجرة الذهاب:</span>
                  <span className="font-mono font-bold text-white">
                    {(completedRideBreakdown?.leg1Fare || completedRideBreakdown?.fare || calculatedPrice || 0).toLocaleString()} د.ع
                  </span>
                </div>

                {(completedRideBreakdown?.isRoundTrip || completedRideBreakdown?.tripType === 'ROUND_TRIP') && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">أجرة الإياب:</span>
                    <span className="font-mono font-bold text-white">
                      {(completedRideBreakdown?.leg2Fare || 0).toLocaleString()} د.ع
                    </span>
                  </div>
                )}

                {((completedRideBreakdown?.waitFee || 0) > 0 || (completedRideBreakdown?.actualWaitMinutes || 0) > 0) && (
                  <div className="flex justify-between items-center text-amber-400">
                    <span>رسوم الانتظار ({completedRideBreakdown?.actualWaitMinutes || 0} دقيقة):</span>
                    <span className="font-mono font-bold">
                      +{(completedRideBreakdown?.waitFee || 0).toLocaleString()} د.ع
                    </span>
                  </div>
                )}

                {(completedRideBreakdown?.discountAmount || 0) > 0 && (
                  <div className="flex justify-between items-center text-emerald-400">
                    <span>خصم القسيمة:</span>
                    <span className="font-mono font-bold">
                      -{(completedRideBreakdown?.discountAmount || 0).toLocaleString()} د.ع
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center pt-2 mt-2 border-t border-slate-800">
                  <span className="text-sm font-black text-white">المبلغ الإجمالي المستحق:</span>
                  <span className="text-base font-mono font-black text-amber-400">
                    {(completedRideBreakdown?.totalFare || completedRideBreakdown?.finalFare || calculatedPrice || 0).toLocaleString()} د.ع
                  </span>
                </div>
              </div>

              {/* خيار الاعتراض على الأجرة إن وُجد */}
              <div className="mt-3.5 pt-3 border-t border-slate-800/80 flex flex-col items-center gap-1.5">
                {!isFareConfirmedByCustomer ? (
                  <button
                    type="button"
                    disabled={isSubmittingConfirmFare}
                    onClick={() => handleCustomerConfirmFare(false)}
                    className="text-xs text-amber-400/90 hover:text-amber-300 underline cursor-pointer py-1 transition"
                  >
                    لدي اعتراض على المبلغ المطلوب ⚠️
                  </button>
                ) : (
                  <span className="text-[11.5px] font-semibold text-amber-300/80">
                    تم تسجيل ملاحظتك وجاري مراجعتها من فريق المتابعة 🛡️
                  </span>
                )}
              </div>
            </div>

            {/* تقييم النجوم التفاعلي */}
            <div className="text-center mb-4">
              <label className="text-[13.5px] font-bold text-slate-200 block mb-2">
                كيف كانت تجربتك مع الكابتن؟
              </label>
              <div className="flex items-center justify-center gap-2 py-1" dir="ltr">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRatingStars(star)}
                    className="p-1 transition-transform duration-150 active:scale-125 hover:scale-110 cursor-pointer"
                  >
                    <svg
                      className={`h-9 w-9 transition-colors ${
                        star <= ratingStars
                          ? 'text-amber-400 fill-amber-400 filter drop-shadow-sm'
                          : 'text-slate-700 fill-slate-700'
                      }`}
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                    </svg>
                  </button>
                ))}
              </div>
              <p className="text-[12px] font-bold text-amber-400 mt-1">
                {ratingStars === 5
                  ? 'ممتاز جداً 🌟 (موصى به)'
                  : ratingStars === 4
                  ? 'جيد جداً 👍'
                  : ratingStars === 3
                  ? 'جيد 👌'
                  : ratingStars === 2
                  ? 'أقل من المتوقع 😐'
                  : 'تجربة صعبة ⚠️'}
              </p>
            </div>

            {/* وسوم التقييم السريعة */}
            <div className="mb-4">
              <label className="text-[12px] font-bold text-slate-300 block mb-2 text-right">
                ما الذي أعجبك في المشوار؟ (اختياري):
              </label>
              <div className="flex flex-wrap gap-1.5 justify-start">
                {[
                  '🚗 سياقة هادئة',
                  '✨ سيارة نظيفة',
                  '🤝 كابتن محترم',
                  '📍 التزام بالمسار',
                  '❄️ تشغيل التكييف',
                ].map((tag) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleRatingTag(tag)}
                      className={`px-3 py-1.5 rounded-xl text-[12px] font-bold transition cursor-pointer border ${
                        isSelected
                          ? 'bg-amber-500 text-[#090D16] border-amber-500 font-black shadow-xs'
                          : 'bg-[#0B101B] text-slate-300 border-slate-700 hover:border-amber-500/40'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* إذا كان التقييم نجمة أو نجمتين: خانة إجبارية مع تنبيه صريح */}
            {ratingStars <= 2 ? (
              <div className="mb-4 text-right rounded-2xl bg-red-950/60 border border-red-500/40 p-3.5 shadow-xs">
                <div className="flex items-center gap-2 mb-1.5 text-red-400">
                  <span className="text-base">⚠️</span>
                  <label className="text-[12.5px] font-black">
                    نأسف لتجربتك، يرجى توضيح سبب هذا التقييم لمساعدتنا على معالجة الأمر <span className="text-red-400">*</span>
                  </label>
                </div>
                <p className="text-[11px] font-medium text-red-300 mb-2">
                  يتم تحويل هذا البلاغ فوراً وبشكل آلي إلى قسم المتابعة والشكاوى للتحقيق مع الكابتن.
                </p>
                <textarea
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  placeholder="اكتب بالتفصيل المشكلة أو سبب استيائك من المشوار..."
                  rows={3}
                  maxLength={400}
                  required
                  className="w-full rounded-xl border border-red-500/50 bg-[#0B101B] p-2.5 text-[12.5px] text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                />
              </div>
            ) : (
              /* حقل ملاحظات اختياري */
              <div className="mb-5 text-right">
                <label className="text-[12px] font-bold text-slate-300 block mb-1.5">
                  ملاحظات أو تعليق للكابتن (اختياري):
                </label>
                <textarea
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  placeholder="أضف أي تفاصيل أو ملاحظات حول الكابتن والرحلة..."
                  rows={2}
                  maxLength={300}
                  className="w-full rounded-xl border border-slate-700 bg-[#0B101B] p-2.5 text-[12.5px] text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            )}

            {/* أزرار الإجراءات */}
            <div className="space-y-2">
              <button
                type="button"
                disabled={isSubmittingRating || (ratingStars <= 2 && !ratingComment.trim())}
                onClick={handleRateDriverSubmit}
                className={`w-full flex items-center justify-center gap-2 rounded-xl py-3.5 text-center text-[15px] font-black shadow-card transition-all duration-200 active:scale-[0.98] cursor-pointer disabled:opacity-50 ${
                  ratingStars <= 2 ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gradient-to-r from-amber-500 via-amber-600 to-amber-500 text-[#090D16] hover:brightness-110 shadow-[0_4px_20px_rgba(245,158,11,0.3)]'
                }`}
              >
                {isSubmittingRating ? (
                  <span>جاري إرسال التقييم...</span>
                ) : ratingStars <= 2 ? (
                  <span>تصعيد الشكوى وإرسال التقييم 🛡️</span>
                ) : (
                  <span>إرسال التقييم ⭐</span>
                )}
              </button>

              <button
                type="button"
                onClick={handleSkipRating}
                className="w-full py-2.5 text-center text-[13px] font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer"
              >
                تخطي
              </button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة تقديم شكوى أو بلاغ مباشر 🛡️ */}
      {isComplaintModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in overflow-y-auto">
          <div
            className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-100 animate-slide-down my-auto text-right"
            dir="rtl"
          >
            {/* رأس النافذة */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-red-100 text-red-600 text-xl shadow-xs">
                  🛡️
                </div>
                <div>
                  <h3 className="text-[17px] font-black text-slate-900">تقديم شكوى أو بلاغ</h3>
                  <p className="text-[11.5px] font-medium text-slate-500">نحن نضمن سرية معلوماتك ونتابع كل بلاغ بجدية</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsComplaintModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition cursor-pointer text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* تصنيف الشكوى */}
              <div>
                <label className="text-[12.5px] font-bold text-slate-800 block mb-1.5">
                  نوع البلاغ / التصنيف <span className="text-red-500">*</span>
                </label>
                <select
                  value={complaintCategory}
                  onChange={(e) => setComplaintCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-[13px] font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1B4965] cursor-pointer"
                >
                  <option value="سلوك غير لائق من الكابتن">سلوك غير لائق من الكابتن</option>
                  <option value="عدم الالتزام بالأجرة المحددة أو طلب مبالغ إضافية">عدم الالتزام بالأجرة المحددة أو طلب مبالغ إضافية</option>
                  <option value="القيادة المتهورة أو عدم الالتزام بقواعد المرور">القيادة المتهورة أو عدم الالتزام بقواعد المرور</option>
                  <option value="التأخير الشديد أو إلغاء غير مبرر">التأخير الشديد أو إلغاء غير مبرر</option>
                  <option value="نظافة أو حالة المركبة">نظافة أو حالة المركبة</option>
                  <option value="مشكلة في خط السير اليومي">مشكلة في خط السير اليومي</option>
                  <option value="أخرى">أخرى</option>
                </select>
              </div>

              {/* رقم هاتف السائق (اختياري / تلقائي) */}
              <div>
                <label className="text-[12.5px] font-bold text-slate-800 block mb-1">
                  رقم هاتف الكابتن المعني (اختياري):
                </label>
                <input
                  type="tel"
                  dir="ltr"
                  value={complaintDriverPhone}
                  onChange={(e) => setComplaintDriverPhone(e.target.value)}
                  placeholder="077XXXXXXXX"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-[13px] font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1B4965]"
                />
              </div>

              {/* تفاصيل الشكوى */}
              <div>
                <label className="text-[12.5px] font-bold text-slate-800 block mb-1">
                  شرح تفاصيل الشكوى <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={complaintText}
                  onChange={(e) => setComplaintText(e.target.value)}
                  placeholder="يرجى كتابة ما حدث بكل دقة لنتمكن من متابعة الأمر ومحاسبة المقصر..."
                  rows={4}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white p-3 text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1B4965]"
                />
              </div>

              {/* أزرار الإجراء */}
              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={handleSubmitComplaint}
                  disabled={isSubmittingComplaint || !complaintText.trim()}
                  className="flex-1 py-3 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-[14px] shadow-sm transition active:scale-[0.98] cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingComplaint ? 'جاري الإرسال...' : 'إرسال البلاغ الآن 🛡️'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsComplaintModalOpen(false)}
                  className="py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[13px] transition cursor-pointer"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* نافذة انتهاء البحث لعدم توفر كباتن */}
      {noDriversModalOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in" dir="rtl">
          <div className={`w-full max-w-sm rounded-3xl p-6 shadow-2xl border text-center space-y-5 animate-scale-up ${
            isDark ? 'bg-[#161C28] border-amber-500/30 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-xl'
          }`}>
            <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/10 text-amber-500 text-4xl border border-amber-500/20 shadow-inner">
              <span>🚖</span>
              <span className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-rose-500 text-white text-xs font-bold border-2 border-[#161C28]">
                ✕
              </span>
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-black leading-snug">
                عذراً، لا يوجد سائقون متاحون في الوقت الحاضر
              </h3>
              <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                جميع الكباتن في منطقتك مشغولون حالياً. يمكنك إعادة المحاولة الآن أو الانتظار قليلاً.
              </p>
            </div>

            <div className="flex flex-col gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setNoDriversModalOpen(false);
                  void handleOrderTrip();
                }}
                disabled={isSubmittingOrder}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 text-sm font-black text-slate-950 shadow-lg shadow-amber-500/25 transition-transform active:scale-[0.98] hover:from-amber-400 hover:to-amber-500 cursor-pointer disabled:opacity-50"
                style={{ minHeight: '48px' }}
              >
                <span>🔄</span>
                <span>إعادة المحاولة</span>
              </button>

              <button
                type="button"
                onClick={() => setNoDriversModalOpen(false)}
                className={`flex h-12 w-full items-center justify-center rounded-2xl border px-4 text-sm font-bold transition-all active:scale-[0.98] cursor-pointer ${
                  isDark
                    ? 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                    : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
                style={{ minHeight: '48px' }}
              >
                حسناً
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
