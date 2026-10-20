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
import { searchPlaces, reverseGeocode, getDirections, applyArabicAndEnhancedLabels, NAJAF_LOCAL_PLACES, type PlaceResult } from '../lib/mapbox';
import {
  calculateBearing,
  distanceMeters,
  distanceKm,
  getCurrentPositionWithFallback,
  isIosDevice,
  isStandalonePwa,
  najafCenterLngLat,
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
import { playCarHornBeep, initAudioUnlock } from '../lib/sound';
import type { LngLat } from '../types';
import { VehicleMarker } from '../components/map/VehicleMarker';
import { RouteLines, type RouteLineData } from '../components/map/MapPins';
import { Spinner } from '../components/ui';
import { useToast } from '../components/Toast';
import { AppDrawer } from '../components/AppDrawer';

// التحميل الكسول لنافذة الدردشة لتقليل الحزمة الأولية
const ChatModal = lazy(() => import('../components/ChatModal'));

// نقطة الانطلاق والوصول الافتراضية في النجف
const DEFAULT_PICKUP: LngLat = { lat: 32.0298, lng: 44.3285 };
const DEFAULT_PICKUP_NAME = 'السلام، طريق النجف - كربلاء';
const DEFAULT_DROPOFF: LngLat = { lat: 32.0355, lng: 44.3345 };
const DEFAULT_DROPOFF_NAME = 'حي ميسان، الكوفة';

// الأماكن السريعة أسفل شريط البحث
const QUICK_CHIPS = [
  { name: 'كراج بغداد', address: 'النجف، كراج بغداد الموحد', lat: 32.028, lng: 44.3465 },
  { name: 'ساحة مظفر', address: 'النجف، ساحة مظفر - مركز المدينة', lat: 32.021, lng: 44.338 },
];

// قائمة المدن العراقية
interface CityItem {
  id: string;
  name: string;
  sub: string;
  lat: number;
  lng: number;
}

const IRAQI_CITIES: CityItem[] = [
  { id: 'baghdad', name: 'بغداد', sub: 'بغداد', lat: 33.3152, lng: 44.3661 },
  { id: 'babil', name: 'بابل', sub: 'بابل', lat: 32.4833, lng: 44.4333 },
  { id: 'basra', name: 'البصرة', sub: 'البصرة', lat: 30.5081, lng: 47.7835 },
  { id: 'diyala', name: 'ديالى', sub: 'ديالى', lat: 33.7464, lng: 44.6433 },
  { id: 'kirkuk', name: 'كركوك', sub: 'كركوك', lat: 35.4681, lng: 44.3922 },
  { id: 'karbala', name: 'كربلاء', sub: 'كربلاء', lat: 32.616, lng: 44.0249 },
  { id: 'najaf', name: 'النجف', sub: 'النجف', lat: 32.0298, lng: 44.3285 },
  { id: 'erbil', name: 'أربيل', sub: 'أربيل', lat: 36.1911, lng: 44.0092 },
  { id: 'sulaymaniyah', name: 'السليمانية', sub: 'السليمانية', lat: 35.5669, lng: 45.4226 },
  { id: 'duhok', name: 'دهوك', sub: 'دهوك', lat: 36.8679, lng: 42.9984 },
  { id: 'anbar', name: 'الأنبار', sub: 'الأنبار', lat: 33.4244, lng: 43.3039 },
  { id: 'wasit', name: 'واسط', sub: 'واسط', lat: 32.5089, lng: 45.8197 },
  { id: 'maysan', name: 'ميسان', sub: 'ميسان', lat: 31.8447, lng: 47.1444 },
  { id: 'muthanna', name: 'المثنى', sub: 'المثنى', lat: 31.3167, lng: 45.2833 },
  { id: 'dhiqar', name: 'ذي قار', sub: 'ذي قار', lat: 31.0579, lng: 46.2573 },
  { id: 'qadisiyah', name: 'القادسية', sub: 'القادسية', lat: 31.9922, lng: 44.925 },
  { id: 'saladin', name: 'صلاح الدين', sub: 'صلاح الدين', lat: 34.6, lng: 43.6833 },
];

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

// رسمة السيارة الزرقاء مع الشارة العائمة كما في الصورتين
function CarBadgeIllustration({
  badge,
  size = 'md',
}: {
  badge: 'super' | 'saving' | 'plus';
  size?: 'sm' | 'md' | 'lg';
}) {
  const isLarge = size === 'lg';
  const width = isLarge ? 170 : 80;
  const height = isLarge ? 95 : 44;

  return (
    <div className="relative inline-flex items-center justify-center select-none">
      {/* الشارة العائمة فوق السيارة */}
      <div
        className={`absolute z-10 flex items-center justify-center rounded-full shadow-md font-bold ${
          isLarge ? '-top-3 right-5 h-12 w-12 text-2xl' : '-top-1.5 right-1.5 h-5 w-5 text-[11px]'
        } bg-[#facc15] text-[#854d0e]`}
      >
        {badge === 'super' && '⚡'}
        {badge === 'saving' && '$'}
        {badge === 'plus' && '★'}
      </div>

      {/* السيارة الزرقاء */}
      <svg
        width={width}
        height={height}
        viewBox="0 0 120 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="drop-shadow-sm"
      >
        {/* هيكل السيارة */}
        <path
          d="M12 37C12 37 17 27 31 21C45 15 75 15 85 21C97 27 110 29 113 35C116 41 114 45 110 46H10C6 46 6 40 12 37Z"
          fill="#1d4ed8"
        />
        <path
          d="M14 35C14 35 19 25 33 19C47 13 74 13 84 19C95 25 107 27 110 33C113 39 111 43 107 44H12C8 44 8 38 14 35Z"
          fill="#2563eb"
        />
        {/* السقف والزجاج */}
        <path d="M34 19L44 8H72L84 19H34Z" fill="#1e3a8a" />
        <path d="M36 18L44 10H57V18H36Z" fill="#bfdbfe" opacity="0.95" />
        <path d="M59 10H71L81 18H59V10Z" fill="#bfdbfe" opacity="0.95" />
        {/* العجلات والجنوط البيضاء والزرقاء */}
        <circle cx="28" cy="45" r="9.5" fill="#0f172a" />
        <circle cx="28" cy="45" r="5.5" fill="#ffffff" />
        <circle cx="28" cy="45" r="2.5" fill="#2563eb" />
        <circle cx="92" cy="45" r="9.5" fill="#0f172a" />
        <circle cx="92" cy="45" r="5.5" fill="#ffffff" />
        <circle cx="92" cy="45" r="2.5" fill="#2563eb" />
        {/* الإضاءة */}
        <path d="M112 35L115 37L112 39Z" fill="#fef08a" />
        <path d="M8 36L6 38L8 40Z" fill="#ef4444" />
      </svg>
    </div>
  );
}

export default function CustomerHomePage() {
  const navigate = useNavigate();
  const { show } = useToast();
  const mapRef = useRef<MapRef>(null);
  const hasAutoLocatedRef = useRef(false);

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

  // الفئة المحددة (الافتراضي: سوبر)
  const [selectedTierId, setSelectedTierId] = useState<'super' | 'saving' | 'plus'>('super');

  // نافذة خيارات الرحلة (الصورة الثانية)
  const [isTripOptionsOpen, setIsTripOptionsOpen] = useState(false);
  const [secondDestination, setSecondDestination] = useState('');
  const [isAddingSecondDest, setIsAddingSecondDest] = useState(false);
  const [stopDuration, setStopDuration] = useState<number | null>(null);
  const [isAddingStop, setIsAddingStop] = useState(false);
  const [isRoundTrip, setIsRoundTrip] = useState(false);

  // نافذة القسائم والخصم
  const [isPromoModalOpen, setIsPromoModalOpen] = useState(false);
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [promoCodeInput, setPromoCodeInput] = useState('');

  // حالة النوافذ والدرج
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isCitySelectorOpen, setIsCitySelectorOpen] = useState(false);
  const [isCancelTripOpen, setIsCancelTripOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

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
  } | null>(null);
  const [liveDriverPosition, setLiveDriverPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [driverHeading, setDriverHeading] = useState<number>(0);
  const prevDriverPositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastRouteUpdateTimeRef = useRef<number>(0);

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
    surgeBadge?: { text: string; type: string; percent?: number; reason?: string } | null;
    discountBadge?: { text: string; type: string; amountIqd?: number } | null;
  }>({});

  // حالة الورقة السفلية لتفاصيل الرحلة (Interactive Draggable / Collapsible Sheet)
  const [rideSheetState, setRideSheetState] = useState<'expanded' | 'collapsed'>('expanded');
  const sheetTouchStartYRef = useRef<number | null>(null);
  const sheetTouchCurrentYRef = useRef<number | null>(null);
  const isSheetDraggingRef = useRef<boolean>(false);

  const handleSheetTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    sheetTouchStartYRef.current = touch.clientY;
    sheetTouchCurrentYRef.current = touch.clientY;
    isSheetDraggingRef.current = true;
  }, []);

  const handleSheetTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isSheetDraggingRef.current || sheetTouchStartYRef.current === null) return;
    const touch = e.touches[0];
    sheetTouchCurrentYRef.current = touch.clientY;
  }, []);

  const handleSheetTouchEnd = useCallback(() => {
    if (!isSheetDraggingRef.current || sheetTouchStartYRef.current === null || sheetTouchCurrentYRef.current === null) {
      isSheetDraggingRef.current = false;
      sheetTouchStartYRef.current = null;
      sheetTouchCurrentYRef.current = null;
      return;
    }
    const deltaY = sheetTouchCurrentYRef.current - sheetTouchStartYRef.current;
    // سحب لأسفل مسافة > 40px -> التحول فوراً إلى 'collapsed'
    if (deltaY > 40) {
      setRideSheetState('collapsed');
    }
    // سحب لأعلى مسافة > 40px -> التحول فوراً إلى 'expanded'
    else if (deltaY < -40) {
      setRideSheetState('expanded');
    }
    isSheetDraggingRef.current = false;
    sheetTouchStartYRef.current = null;
    sheetTouchCurrentYRef.current = null;
  }, []);

  // دعم السحب بالفأرة على أجهزة الكمبيوتر (Mouse Drag Support)
  const handleSheetMouseDown = useCallback((e: React.MouseEvent) => {
    const startY = e.clientY;
    let currentY = e.clientY;

    const onMouseMove = (moveEvt: MouseEvent) => {
      currentY = moveEvt.clientY;
    };

    const onMouseUp = () => {
      const deltaY = currentY - startY;
      if (deltaY > 40) {
        setRideSheetState('collapsed');
      } else if (deltaY < -40) {
        setRideSheetState('expanded');
      }
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);

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
                  if (s === 'arrived' && !hasNotifiedArrivalRef.current) {
                    hasNotifiedArrivalRef.current = true;
                    show('الكابتن وصل إلى موقعك الآن! 🚖 بيب بيب', 'success', 7000);
                    playCarHornBeep();
                  }
                } else if (s === 'pending') {
                  setStage('searching');
                  setRideStatus('Pending');
                  setAssignedDriverInfo(null);
                } else if (
                  req.status === 'Completed' ||
                  req.status === 'Cancelled' ||
                  req.status === 'NoDriversAvailable'
                ) {
                  // إزالة الطلب فقط عند الانتهاء أو الإلغاء
                  localStorage.removeItem('TAWSEELA_ACTIVE_TAXI_RIDE');
                  setStage('pickup');
                  setRideRequestId(null);
                  setAssignedDriverInfo(null);
                }

                if (s !== 'pending' && (req.assignedDriverName || req.assignedDriverPhone)) {
                  setAssignedDriverInfo((prev) => ({
                    ...prev,
                    driverId: req.acceptedDriverId || req.assignedDriverId || prev?.driverId,
                    driverName: req.assignedDriverName || prev?.driverName,
                    driverPhone: req.assignedDriverPhone || prev?.driverPhone,
                    driverVehicle: req.assignedDriverVehicle || prev?.driverVehicle,
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
                });
              } else if (curStage === 'searching') {
                setAssignedDriverInfo(null);
              }
            }
          })
          .catch(() => {});
      }
    }
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
        const { latitude, longitude } = pos.coords;
        const userPoint: LngLat = { lat: latitude, lng: longitude };

        // تحريك كاميرا الخريطة بسلاسة وانسيابية عبر map.flyTo
        const targetMap = mapInstance || mapRef.current?.getMap?.() || mapRef.current;
        if (targetMap && typeof targetMap.flyTo === 'function') {
          targetMap.flyTo({
            center: [longitude, latitude],
            zoom: 16,
            essential: true,
            duration: 1200,
          });
        }

        // تحديث إحداثيات نقطة الانطلاق بموقع المستخدم الحقيقي
        setPickup(userPoint);

        // تشغيل العكس الجغرافي (Reverse Geocoding) تلقائياً لتحديث اسم الشارع/الحي
        try {
          const addr = await reverseGeocode(userPoint);
          if (addr) {
            setPickupName(addr);
          } else {
            setPickupName('موقعي الحالي عبر الـ GPS 📍');
          }
        } catch (_) {
          setPickupName('موقعي الحالي عبر الـ GPS 📍');
        }
      },
      (err) => {
        // عند الفشل أو الرفض: البقاء بسلامة وهدوء على المركز الافتراضي الحالي دون رسائل خطأ مزعجة
        console.warn('[AutoGeolocation] Location unavailable or denied, staying at default Najaf center:', err.message);
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

  // تحديث العنوان عند تحريك الخريطة في مرحلتي الانطلاق والوصول
  const handleMapMoveEnd = useCallback(
    async (e: { viewState: { latitude: number; longitude: number } }) => {
      if (showMapHint) setShowMapHint(false);
      if (stage === 'ride_options' || stage === 'searching' || stage === 'driver_arriving') return;

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
        setRideSheetState('collapsed');
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

        // 4. التراجع عن استخدام الموقع التقديري إذا تعذر تماماً:
        // تعيين الكاميرا افتراضياً على وسط محافظة النجف (مركز المدينة)
        const najafCenter = najafCenterLngLat();
        mapRef.current?.flyTo({ center: [najafCenter.lng, najafCenter.lat], zoom: 14.8, duration: 800 });

        // تفعيل التلميح البصري فوق الخريطة: "يمكنك تحريك الخريطة لوضع الدبوس على موقعك الحالي 📍"
        triggerMapHint();

        if (isPermissionDenied) {
          // 2. معالجة خطأ PERMISSION_DENIED لـ iOS Safari و PWA
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
          // 1 & 3. تعذر تحديد الموقع بعد المحاولات أو Timeout
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
      setSearchResults(NAJAF_LOCAL_PLACES);
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

  // اختيار مدينة من نافذة اختيار المدينة
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
    show(`تم اختيار مدينة: ${city.name} 🏙️`, 'success');
  }

  // زر "مدينتك الحالية"
  function handleSelectCurrentCity() {
    setSelectedCity('النجف');
    if (stage === 'pickup') {
      setPickup(DEFAULT_PICKUP);
      setPickupName(DEFAULT_PICKUP_NAME);
      mapRef.current?.flyTo({ center: [DEFAULT_PICKUP.lng, DEFAULT_PICKUP.lat], zoom: 15.2, duration: 800 });
    } else {
      setDropoff(DEFAULT_DROPOFF);
      setDropoffName(DEFAULT_DROPOFF_NAME);
      mapRef.current?.flyTo({ center: [DEFAULT_DROPOFF.lng, DEFAULT_DROPOFF.lat], zoom: 15.2, duration: 800 });
    }
    setIsCitySelectorOpen(false);
    setCitySearchQuery('');
    show('تم تحديد مدينتك الحالية (النجف الأشرف) 📍', 'success');
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
          isRoundTrip,
          hasSecondStop: Boolean(secondDestination.trim()),
          promoCode: appliedPromo ? 'PROMO20' : ''
        });

        if (isCancelled || !res.data || !res.data.success) return;

        const mainData = res.data;
        const mainFare = mainData.fare || 3000;

        // Calculate proportionate rates for other tiers (Strict upward ceil rounding to 250 IQD)
        let superFare = mainFare;
        if (selectedTierId === 'saving') {
          superFare = Math.max(3000, Math.ceil((mainFare / 0.90) / 250) * 250);
        } else if (selectedTierId === 'plus') {
          superFare = Math.max(3000, Math.ceil((mainFare / 1.20) / 250) * 250);
        }
        const savingFare = Math.max(3000, Math.ceil((superFare * 0.90) / 250) * 250);
        const plusFare = Math.max(3500, Math.ceil((superFare * 1.20) / 250) * 250);

        setDynamicPricingData({
          superFare,
          savingFare,
          plusFare,
          selectedFare: mainFare,
          surgeBadge: mainData.surgeBadge || null,
          discountBadge: mainData.discountBadge || null
        });
      } catch (e) {
        console.warn('[Pricing] Could not fetch dynamic fare:', e);
      }
    };

    fetchDynamicPricing();
    return () => { isCancelled = true; };
  }, [stage, pickup.lat, pickup.lng, dropoff.lat, dropoff.lng, selectedTierId, isRoundTrip, secondDestination, appliedPromo]);

  // حساب سعر الرحلة الحالي حسب الفئة والخيارات الإضافية (مع الأخذ بالاعتبار محرك التسعير الديناميكي)
  const currentTier = RIDE_TIERS.find((t) => t.id === selectedTierId) || RIDE_TIERS[0];
  let calculatedPrice = dynamicPricingData.selectedFare || currentTier.basePrice;
  if (!dynamicPricingData.selectedFare) {
    if (isRoundTrip) calculatedPrice *= 1.85;
    if (secondDestination.trim()) calculatedPrice += 1000;
    if (stopDuration) calculatedPrice += 500;
    if (appliedPromo) calculatedPrice = Math.max(1000, Math.round(calculatedPrice * 0.8));
    calculatedPrice = Math.max(3000, Math.ceil(calculatedPrice / 250) * 250);
  }

  // طلب التكسي النهائي — إرسال حقيقي للخادم
  async function handleOrderTrip() {
    if (isSubmittingOrder) return;
    setIsSubmittingOrder(true);
    try {
      const dist = distanceKm(pickup, dropoff);
      const userId = session?.userId || storage.getUserId() || 'cust-' + Date.now();
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
        vehicleType: selectedTierId === 'plus' ? 'vip' : 'eco',
        rangeKm: 25,
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
            assignedDriverInfo: null,
            routeCoordinates,
          }));
        } catch (_) {}
        show('تم إرسال طلبك! جاري البحث عن كابتن بانتظار الموافقة 🚖', 'info');
      } else {
        show(data.error || 'تعذر إرسال الطلب، يرجى المحاولة لاحقاً', 'error');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'حدث خطأ في الاتصال بالخادم';
      show(msg, 'error');
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

  // تتبع حالة الرحلة لحظياً من الخادم
  useEffect(() => {
    if (!rideRequestId || (stage !== 'searching' && stage !== 'driver_arriving')) return;

    const interval = setInterval(async () => {
      if (document.hidden) return;
      try {
        const { data } = await http.get<{
          success: boolean;
          request?: {
            status: string;
            assignedDriverId?: string;
            assignedDriverName?: string;
            assignedDriverPhone?: string;
            assignedDriverVehicle?: string;
            acceptedDriverId?: string;
          };
        }>(`/ride/status/${rideRequestId}`);

        if (data.success && data.request) {
          const req = data.request;
          const status = (req.status || '').toLowerCase();

          // الاستماع المباشر لتنبيهات الهورن (بيب بيب 📢) الصادرة من السائق
          const incomingHornSeq = Number((req as any).hornSequence || 0);
          if (incomingHornSeq > 0 && incomingHornSeq > lastHeardHornSeqRef.current) {
            lastHeardHornSeqRef.current = incomingHornSeq;
            playCarHornBeep();
            show('الكابتن ينبهك لوصوله بالهورن! 🚖', 'success', 6000);
          }
          if (status === 'accepted') {
            setRideStatus('Accepted');
            if (stage !== 'driver_arriving') {
              setStage('driver_arriving');
              setRideSheetState('expanded');
              show('تم قبول رحلتك من قبل الكابتن! 🚖 الكابتن في طريقه إليك', 'success');
              mapRef.current?.flyTo({ center: [pickup.lng, pickup.lat], zoom: 15.5, duration: 700 });
            }
          } else if (status === 'arrived') {
            setRideStatus('Arrived');
            if (stage !== 'driver_arriving') {
              setStage('driver_arriving');
              setRideSheetState('expanded');
            }
            if (!hasNotifiedArrivalRef.current) {
              hasNotifiedArrivalRef.current = true;
              show('الكابتن وصل إلى موقعك الآن! 🚖 بيب بيب', 'success', 7000);
              playCarHornBeep();
            }
          } else if (status === 'inprogress' || status === 'in_progress') {
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
          } else if (req.status === 'Completed' || req.status === 'completed' || req.status === 'RideCompleted') {
            triggerDriverRatingModal(req);
          } else if (req.status === 'Cancelled' || req.status === 'NoDriversAvailable') {
            hasNotifiedArrivalRef.current = false;
            localStorage.removeItem('TAWSEELA_ACTIVE_TAXI_RIDE');
            show(req.status === 'Cancelled' ? 'تم إلغاء الرحلة' : 'لم يتم العثور على سائق متوفر حالياً', 'warning');
            setStage('ride_options');
            setRideRequestId(null);
            setAssignedDriverInfo(null);
            setLiveDriverPosition(null);
            setRouteCoordinates(null);
          }

          if (status === 'accepted' || status === 'arrived' || status === 'inprogress' || status === 'in_progress') {
            if (req.assignedDriverName || req.assignedDriverPhone) {
              setAssignedDriverInfo((prev) => ({
                ...prev,
                driverId: req.acceptedDriverId || req.assignedDriverId || prev?.driverId,
                driverName: req.assignedDriverName || prev?.driverName,
                driverPhone: req.assignedDriverPhone || prev?.driverPhone,
                driverVehicle: req.assignedDriverVehicle || prev?.driverVehicle,
                driverPlate: (req as any).driverPlate || prev?.driverPlate || '١١٣٤٠ ة - النجف',
                driverRating: (req as any).driverRating || prev?.driverRating || 5.0,
              }));
            }
          } else if (status === 'pending') {
            if (stage !== 'searching') {
              setStage('searching');
            }
            setRideStatus('Pending');
            setAssignedDriverInfo(null);
          }
        }
      } catch (_) {}
    }, 1800);

    return () => clearInterval(interval);
  }, [rideRequestId, stage, pickup, dropoff, rideStatus, triggerDriverRatingModal]);

  // معالجة تحديث موقع السائق الحي مع حساب زاوية الاتجاه رياضياً ورسم خط المسار
  const handleDriverPositionUpdate = useCallback(
    (newPos: { lat: number; lng: number }, serverHeading?: number) => {
      if (!newPos || typeof newPos.lat !== 'number' || typeof newPos.lng !== 'number') return;

      const prev = prevDriverPositionRef.current;
      if (prev) {
        const movedMeters = distanceMeters(prev.lat, prev.lng, newPos.lat, newPos.lng);
        // إذا تحركت السيارة بمقدار مترين أو أكثر، نقوم بحساب زاوية الاتجاه رياضياً بالمعادلة الكروية
        if (movedMeters >= 2) {
          const computedBearing = calculateBearing(prev.lat, prev.lng, newPos.lat, newPos.lng);
          setDriverHeading(computedBearing);
        } else if (typeof serverHeading === 'number' && !isNaN(serverHeading) && serverHeading > 0) {
          setDriverHeading(serverHeading);
        }
      } else {
        // عند استلام أول موقع، توجيه السيارة نحو نقطة التقاط الراكب (أو الوجهة إذا كانت الرحلة جارية)
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

      prevDriverPositionRef.current = newPos;
      setLiveDriverPosition(newPos);

      // رسم وتحديث خط المسار من موقع السائق المباشر إلى موقع الراكب
      const now = Date.now();
      const targetPoint = (rideStatus === 'InProgress' || rideStatus === 'in_progress') ? dropoff : pickup;
      if (
        stage === 'driver_arriving' &&
        targetPoint &&
        targetPoint.lat &&
        targetPoint.lng &&
        now - lastRouteUpdateTimeRef.current > 6000
      ) {
        lastRouteUpdateTimeRef.current = now;
        void getDirections(newPos, targetPoint)
          .then((res) => {
            if (res.coordinates?.length) {
              setRouteCoordinates(res.coordinates.map((c) => [c.lng, c.lat]));
            }
          })
          .catch(() => {
            setRouteCoordinates([
              [newPos.lng, newPos.lat],
              [targetPoint.lng, targetPoint.lat],
            ]);
          });
      }
    },
    [stage, rideStatus, pickup, dropoff]
  );

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
        } else if (evStatus === 'arrived') {
          setRideStatus('Arrived');
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
        } else if (e.status === 'Completed' || e.status === 'completed' || e.status === 'RideCompleted') {
          triggerDriverRatingModal(assignedDriverInfo);
        } else if (e.status === 'Cancelled') {
          hasNotifiedArrivalRef.current = false;
          localStorage.removeItem('TAWSEELA_ACTIVE_TAXI_RIDE');
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
  }, [rideRequestId, dropoff, rideStatus, stage, assignedDriverInfo, triggerDriverRatingModal, handleDriverPositionUpdate]);

  // تتبع موقع السائق الحي على الخريطة
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
    }, 3000);

    return () => clearInterval(interval);
  }, [stage, assignedDriverInfo?.driverId, handleDriverPositionUpdate]);

  // إلغاء الرحلة حقيقياً
  async function handleConfirmCancelTrip() {
    if (!cancelReason) return;
    hasNotifiedArrivalRef.current = false;
    localStorage.removeItem('TAWSEELA_ACTIVE_TAXI_RIDE');
    if (rideRequestId) {
      try {
        await http.post('/ride/cancel', {
          requestId: rideRequestId,
          reason: cancelReason,
        });
        show('تم إلغاء الرحلة', 'info');
      } catch (_) {}
    }
    setStage('ride_options');
    setIsCancelTripOpen(false);
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

  // إعداد طبقة خط المسار بنمط ويز
  const routeLines: RouteLineData[] = routeCoordinates && routeCoordinates.length
    ? [{ id: 'route-line', coordinates: routeCoordinates, color: '#F59E0B', width: 5.5 }]
    : [];

  return (
    <div className="relative min-h-[100dvh] h-[100dvh] w-full overflow-hidden bg-[#080E1A] text-slate-100 select-none font-cairo flex flex-col" dir="rtl">
      {/* ====================================================================
          الترويسة العلوية الثابتة مع مساحة الأمان المخصصة (Top Safe-Area Header)
          ==================================================================== */}
      <header className="px-4 pt-[calc(0.75rem+env(safe-area-inset-top,1rem))] pb-3 bg-[#161C28]/95 backdrop-blur-md border-b border-amber-500/20 flex items-center justify-between sticky top-0 z-30 shadow-lg">
        {/* اليمين: زر الرئيسية / الرجوع وشعار توصيله */}
        <div className="flex items-center gap-2.5">
          {stage === 'pickup' ? (
            <button
              type="button"
              onClick={() => navigate('/hub')}
              className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-2xl bg-[#0F172A] border border-amber-500/30 shadow-sm flex items-center justify-center text-amber-400 hover:text-amber-300 hover:border-amber-400 hover:bg-[#1E293B] transition-all duration-150 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] cursor-pointer"
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
              className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-2xl bg-[#0F172A] border border-amber-500/30 shadow-sm flex items-center justify-center text-amber-400 hover:text-amber-300 hover:border-amber-400 hover:bg-[#1E293B] transition-all duration-150 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] cursor-pointer"
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
            className="h-8 w-auto max-h-8 object-contain drop-shadow select-none pointer-events-none"
          />
        </div>

        {/* اليسار: ترحيب المستخدم وزر الحساب الموحد الذي يفتح AppDrawer */}
        <div className="flex items-center gap-2.5">
          <div className="text-left hidden sm:block">
            <div className="text-[12px] font-bold text-slate-400">مرحباً بك 👋</div>
            <div className="text-[15px] font-black text-white truncate max-w-[140px] sm:max-w-[180px]">{customerFirstName}</div>
          </div>
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-2xl bg-[#0F172A] border border-amber-500/30 shadow-sm flex items-center justify-center text-amber-400 hover:text-amber-300 hover:border-amber-400 hover:bg-[#1E293B] transition-all duration-150 ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.98] cursor-pointer"
            aria-label="الحساب والإعدادات"
            title="الحساب والإعدادات"
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
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </button>
        </div>
      </header>

      {/* 3. الخريطة الرئيسية Mapbox */}
      <div
        className="relative flex-1 w-full h-full"
        onClick={() => {
          if (stage === 'driver_arriving' && rideSheetState === 'expanded') {
            setRideSheetState('collapsed');
          }
        }}
      >
        {/* زر الأمان العائم — يظهر فقط في مرحلة السائق قادم */}
        {stage === 'driver_arriving' && (
          <button
            type="button"
            onClick={() => show('ميزة الأمان قريباً 🛡️','info')}
            className="absolute top-4 left-4 z-20 flex h-11 w-11 items-center justify-center rounded-xl bg-white text-[#1B4965] border border-slate-200/80 shadow-subtle transition-all duration-200 ease-in-out active:scale-[0.96] cursor-pointer hover:bg-slate-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </button>
        )}

        {/* شريط تنبيه وصول الكابتن العائم في أعلى الشاشة */}
        {(rideStatus?.toLowerCase() === 'arrived') && (
          <div className="absolute top-4 inset-x-3 z-30 flex justify-center pointer-events-auto animate-fade-in" dir="rtl">
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
        <MapGL
          ref={mapRef}
          mapboxAccessToken={config.mapboxToken}
          mapStyle={config.mapStyle}
          initialViewState={{
            longitude: DEFAULT_PICKUP.lng,
            latitude: DEFAULT_PICKUP.lat,
            zoom: 15.2,
          }}
          style={{ width: '100%', height: '100%' }}
          onMoveEnd={handleMapMoveEnd}
          onClick={handleMapClick}
          onLoad={(e) => {
            applyArabicAndEnhancedLabels(e.target);
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
                <div className="flex items-center gap-2 rounded-full bg-[#161C28]/95 px-3.5 py-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.5)] border border-amber-500/40 transition-transform group-hover:scale-105">
                  <span className="text-[13px] font-black text-amber-300 font-cairo">الانطلاق</span>
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500">
                    <div className="h-2 w-2 rounded-full bg-[#090D16]" />
                  </div>
                </div>
                <div className="h-3 w-0.5 bg-amber-500/80 -mt-0.5" />
                <div className="h-1.5 w-4 rounded-full bg-black/40 blur-[1px]" />
              </div>
            </Marker>
          )}

          {/* علامة نقطة الوصول المثبتة على الخريطة (في شاشة خيارات الرحلة كالصورة 1) */}
          {stage === 'ride_options' && (
            <Marker longitude={dropoff.lng} latitude={dropoff.lat} anchor="bottom">
              <div
                onClick={() => {
                  setStage('dropoff');
                  mapRef.current?.flyTo({ center: [dropoff.lng, dropoff.lat], zoom: 15.2, duration: 600 });
                }}
                className="flex flex-col items-center select-none cursor-pointer group"
                title="تعديل نقطة الوصول"
              >
                <div className="flex items-center gap-2 rounded-full bg-[#161C28]/95 px-3.5 py-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.5)] border border-emerald-500/40 transition-transform group-hover:scale-105">
                  <span className="text-[13px] font-bold text-emerald-300 font-cairo">الوصول</span>
                  <div className="flex h-5 w-5 items-center justify-center rounded-md bg-emerald-500">
                    <div className="h-2 w-2 rounded-full bg-[#090D16]" />
                  </div>
                </div>
                <div className="h-3 w-0.5 bg-emerald-500/80 -mt-0.5" />
                <div className="h-1.5 w-4 rounded-full bg-black/40 blur-[1px]" />
              </div>
            </Marker>
          )}



          {/* موقع السائق الحقيقي عند القبول والوصول */}
          {liveDriverPosition ? (
            <VehicleMarker
              targetLat={liveDriverPosition.lat}
              targetLng={liveDriverPosition.lng}
              targetHeading={driverHeading}
              title={assignedDriverInfo?.driverName ? `كابتن ${assignedDriverInfo.driverName.split(' ')[0]}` : undefined}
              isAvailable={false}
            />
          ) : assignedDriverInfo?.driverLat && assignedDriverInfo?.driverLon ? (
            <VehicleMarker
              targetLat={assignedDriverInfo.driverLat}
              targetLng={assignedDriverInfo.driverLon}
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

        {/* 4. دبوس المركز في منتصف الشاشة (يختفي في مرحلة خيارات الرحلة أو البحث) */}
        {stage !== 'ride_options' && stage !== 'searching' && stage !== 'driver_arriving' && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            {stage === 'pickup' ? (
              <div className="relative flex flex-col items-center -translate-y-full mb-1 animate-fade-in">
                <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[#D97706] shadow-subtle">
                  <div className="h-3.5 w-3.5 rounded-full bg-white shadow-inner" />
                </div>
                <div className="h-3.5 w-1 rounded-full bg-slate-700/80 -mt-0.5" />
                <div className="h-1.5 w-4 rounded-full bg-black/25 blur-[1px] mt-0.5" />
              </div>
            ) : (
              <div className="relative flex flex-col items-center -translate-y-full mb-1 animate-fade-in">
                <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-[#1B4965] shadow-subtle">
                  <div className="h-3.5 w-3.5 rounded-full bg-white shadow-inner" />
                </div>
                <div className="h-3.5 w-1 rounded-full bg-slate-700/80 -mt-0.5" />
                <div className="h-1.5 w-4 rounded-full bg-black/25 blur-[1px] mt-0.5" />
              </div>
            )}
          </div>
        )}

        {/* تلميح بصري فوق الخريطة عند تعذر تحديد موقع GPS */}
        {showMapHint && stage !== 'ride_options' && stage !== 'searching' && stage !== 'driver_arriving' && (
          <div className="pointer-events-auto absolute top-3.5 inset-x-0 z-20 flex justify-center px-4 animate-fade-in">
            <div className="flex items-center gap-2 rounded-full bg-[#161C28]/95 backdrop-blur-md px-4 py-2 text-[12.5px] font-bold text-amber-400 shadow-xl border border-amber-500/30">
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
            } left-4 z-30 bg-[#161C28]/95 backdrop-blur-md p-3 rounded-full shadow-xl border border-amber-500/30 active:scale-95 transition-all text-amber-400 flex items-center justify-center cursor-pointer hover:bg-[#1E293B] hover:text-amber-300 hover:border-amber-400 ${
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

        {/* 6. البطاقة السفلية الفاخرة في مرحلتي الانطلاق والوصول */}
        {stage !== 'ride_options' && stage !== 'searching' && stage !== 'driver_arriving' && (
          <div className="absolute inset-x-0 bottom-0 z-30 rounded-t-2xl bg-[#161C28]/95 backdrop-blur-md px-5 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] mb-[env(safe-area-inset-bottom)] shadow-2xl border-t border-amber-500/20 text-white">
            <div className="flex justify-center mb-3">
              <div className="h-1 w-10 rounded-full bg-slate-700" />
            </div>

            <div
              onClick={() => { setIsSearchOpen(true); setSearchResults(NAJAF_LOCAL_PLACES); }}
              className="mb-4 flex items-center justify-between rounded-xl bg-[#0B101B] border border-amber-500/30 p-3.5 cursor-pointer transition active:scale-[0.99] hover:border-amber-500/60"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <svg
                  className="h-5 w-5 text-amber-400 shrink-0"
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
                <span className="truncate text-[15px] font-bold text-slate-100">
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
                className="w-full rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-amber-500 py-3.5 text-center text-[16px] font-black text-[#090D16] shadow-[0_4px_20px_rgba(245,158,11,0.3)] transition-all duration-200 ease-in-out active:scale-[0.98] hover:brightness-110 cursor-pointer"
              >
                تأكيد نقطة الانطلاق
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConfirmDropoff}
                className="w-full rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-amber-500 py-3.5 text-center text-[16px] font-black text-[#090D16] shadow-[0_4px_20px_rgba(245,158,11,0.3)] transition-all duration-200 ease-in-out active:scale-[0.98] hover:brightness-110 cursor-pointer"
              >
                تأكيد نقطة الوصول
              </button>
            )}
          </div>
        )}

        {/* 7. بطاقة خيارات فئات الرحلة الفاخرة */}
        {stage === 'ride_options' && (
          <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-2xl bg-[#161C28]/95 backdrop-blur-md pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))] mb-[env(safe-area-inset-bottom)] shadow-2xl border-t border-amber-500/20 text-white animate-fade-in">
            {/* التبويبات العلوية: تكسي و بوكس */}
            <div className="flex border-b border-slate-800 px-4" dir="rtl">
              <button
                type="button"
                onClick={() => setSelectedServiceTab('taxi')}
                className={`flex-1 py-3 text-center text-[15px] font-bold transition relative ${
                  selectedServiceTab === 'taxi'
                    ? 'text-amber-400 border-b-2 border-amber-500'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                تكسي
              </button>
              <button
                type="button"
                onClick={() => setSelectedServiceTab('box')}
                className={`flex-1 py-3 text-center text-[15px] font-bold transition relative ${
                  selectedServiceTab === 'box'
                    ? 'text-amber-400 border-b-2 border-amber-500'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                بوكس
              </button>
            </div>

            {/* شارة الذروة أو الخصم الذكي المفعّل */}
            {dynamicPricingData.surgeBadge && (
              <div className="mx-4 mt-2.5 mb-1 p-2.5 bg-amber-950/60 border border-amber-500/50 rounded-xl flex items-center justify-between text-amber-200 animate-fade-in shadow-xs">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center font-bold text-xs shadow-xs">⚡</span>
                  <span className="text-[12.5px] font-bold text-amber-200">{dynamicPricingData.surgeBadge.text}</span>
                </div>
                <span className="text-[10.5px] font-bold text-amber-300 bg-amber-900/60 px-2 py-0.5 rounded-md border border-amber-500/40">
                  تحديث حي
                </span>
              </div>
            )}
            {dynamicPricingData.discountBadge && !dynamicPricingData.surgeBadge && (
              <div className="mx-4 mt-2.5 mb-1 p-2.5 bg-emerald-950/60 border border-emerald-500/50 rounded-xl flex items-center justify-between text-emerald-200 animate-fade-in shadow-xs">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-emerald-500 text-slate-950 flex items-center justify-center font-bold text-xs shadow-xs">🏷️</span>
                  <span className="text-[12.5px] font-bold text-emerald-200">{dynamicPricingData.discountBadge.text}</span>
                </div>
                <span className="text-[10.5px] font-bold text-emerald-300 bg-emerald-900/60 px-2 py-0.5 rounded-md border border-emerald-500/40">
                  عرض خاص
                </span>
              </div>
            )}

            {/* قائمة فئات الرحلة (سوبر، توفير، بلس) */}
            <div className="px-4 py-2 space-y-1.5">
              {RIDE_TIERS.map((tier) => {
                const isSelected = selectedTierId === tier.id;
                const dynamicPrice = tier.id === 'saving'
                  ? (dynamicPricingData.savingFare || tier.basePrice)
                  : tier.id === 'plus'
                  ? (dynamicPricingData.plusFare || tier.basePrice)
                  : (dynamicPricingData.superFare || tier.basePrice);

                return (
                  <div
                    key={tier.id}
                    onClick={() => setSelectedTierId(tier.id)}
                    className={`flex items-center justify-between p-3.5 rounded-xl border transition cursor-pointer ${
                      isSelected
                        ? 'border-amber-500/80 bg-amber-500/10 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                        : 'border-slate-800 bg-[#0B101B]/80 hover:border-amber-500/30'
                    }`}
                  >
                    {/* السعر على اليسار */}
                    <div className="text-left font-black text-[16px] text-amber-400">
                      {dynamicPrice.toLocaleString()} دينار
                    </div>

                    {/* الاسم والوصف والسيارة الزرقاء على اليمين */}
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-[15px] font-bold text-white">{tier.name}</p>
                        <p className="text-[12px] font-medium text-slate-400">{tier.subtitle}</p>
                      </div>

                      {/* رسمة السيارة مع الشارة */}
                      <CarBadgeIllustration badge={tier.badge} size="sm" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* شريط الإجراءات: خيارات الرحلة وقسيمة */}
            <div className="my-1 flex items-center justify-around border-t border-b border-slate-800 py-3 px-6">
              {/* خيارات الرحلة */}
              <button
                type="button"
                onClick={() => setIsTripOptionsOpen(true)}
                className="flex flex-1 items-center justify-center gap-2 text-slate-300 hover:text-amber-400 transition cursor-pointer"
              >
                <span className="text-[14px] font-bold">خيارات الرحلة</span>
                <svg
                  className="h-5 w-5 text-amber-400/80"
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
              </button>

              {/* فاصل */}
              <div className="h-5 w-[1px] bg-slate-800" />

              {/* قسيمة الخصم */}
              <button
                type="button"
                onClick={() => setIsPromoModalOpen(true)}
                className="flex flex-1 items-center justify-center gap-2 text-slate-300 hover:text-amber-400 transition cursor-pointer"
              >
                <span className="text-[14px] font-bold">
                  {appliedPromo ? 'خصم 20% مفعّل' : 'قسيمة'}
                </span>
                <svg
                  className="h-5 w-5 text-amber-400/80"
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
              </button>
            </div>

            {/* الزر الرئيسي: طلب الفئة المحددة */}
            <div className="px-6 pt-2">
              <button
                type="button"
                onClick={handleOrderTrip}
                className="w-full rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-amber-500 py-3.5 text-center text-[16px] font-black text-[#090D16] shadow-[0_4px_20px_rgba(245,158,11,0.3)] transition-all duration-200 ease-in-out active:scale-[0.98] hover:brightness-110 cursor-pointer"
              >
                طلب {currentTier.name}
              </button>
            </div>
          </div>
        )}

        {/* 7. بطاقة البحث الفاخرة — جاري انتظار موافقة الكابتن */}
        {stage === 'searching' && (
          <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[28px] bg-[#161C28]/95 backdrop-blur-xl text-white border-t border-amber-500/30 shadow-[0_-12px_40px_rgba(0,0,0,0.85)] animate-fade-in pb-[calc(1.5rem+env(safe-area-inset-bottom))] mb-[env(safe-area-inset-bottom)]" dir="rtl">
            {/* مقبض علوي */}
            <div className="flex justify-center py-3">
              <div className="h-1.5 w-10 rounded-full bg-slate-700" />
            </div>

            <div className="px-5 space-y-4">
              {/* رادار البحث النابض */}
              <div className="flex flex-row-reverse overflow-hidden rounded-2xl shadow-xl border border-amber-500/30 bg-[#0B101B]" style={{ minHeight: '120px' }}>
                <div className="flex flex-col items-center justify-center bg-gradient-to-b from-amber-400 via-amber-500 to-amber-600 px-5 min-w-[110px] text-slate-950 font-black">
                  <span className="text-[12px] opacity-80 mb-0.5">طلب تكسي</span>
                  <span className="text-[22px] font-black leading-tight">{currentTier.name}</span>
                  <div className="mt-1"><CarBadgeIllustration badge={currentTier.badge} size="sm" /></div>
                </div>
                <div className="flex flex-1 flex-col items-center justify-center bg-[#0B101B] gap-1.5 p-4 text-center">
                  <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/20 text-amber-300 text-[26px] border border-amber-400/40 shadow-md">
                    <span className="animate-ping absolute h-12 w-12 rounded-full bg-amber-500/30" />
                    <span>🚖</span>
                  </div>
                  <div className="flex gap-1 mt-1">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="h-2 w-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: `${i * 0.18}s` }} />
                    ))}
                  </div>
                  <span className="text-xs font-bold text-amber-300">جاري البحث عن كابتن بانتظار الموافقة...</span>
                </div>
              </div>

              {/* تفاصيل المسار والأجرة */}
              <div className="rounded-2xl bg-[#0B101B] border border-white/10 p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-white/10">
                  <span className="text-slate-400">الأجرة التقديرية</span>
                  <span className="text-base font-black text-amber-400 font-mono">
                    {calculatedPrice.toLocaleString()} د.ع
                  </span>
                </div>
                <div className="space-y-1 text-slate-300 text-start">
                  <p className="truncate">🟢 من: <span className="text-white font-bold">{pickupName}</span></p>
                  <p className="truncate">🔴 إلى: <span className="text-white font-bold">{dropoffName}</span></p>
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

        {/* 7b. شاشة إلغاء الرحلة */}
        {(stage === 'searching' || stage === 'driver_arriving') && isCancelTripOpen && (
          <div className="absolute inset-0 z-40 bg-[#0D131F] text-white flex flex-col animate-fade-in" dir="rtl">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-800">
              <h2 className="text-[19px] font-black text-white">إلغاء الرحلة</h2>
              <button type="button" onClick={()=>setIsCancelTripOpen(false)} className="cursor-pointer text-slate-400 hover:text-white">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
            <p className="px-5 pt-5 pb-2 text-[16px] font-bold text-slate-200">اختر سبب لإلغاء الرحلة:</p>
            <div className="overflow-y-auto flex-1 divide-y divide-slate-800 px-5">
              {['أنا في عجلة من أمري والسائق بعيد','غيرت رأيي','السائق لا يتحرك باتجاه نقطة الانطلاق على الخريطة','طلب السائق أموالاً إضافية','السائق طلب إلغاء الرحلة','السائق لا يجيب أو غير متوفر','السائق طلب الدفع نقدي','اريد تعديل تفاصيل الرحلة','سوف أستخدم خدمة أخرى'].map(r=>(
                <button key={r} type="button" onClick={()=>setCancelReason(r)} className="flex w-full items-center justify-between py-4 cursor-pointer hover:bg-slate-800/40">
                  <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${cancelReason===r?'border-amber-400':'border-slate-600'}`}>{cancelReason===r&&<div className="h-2.5 w-2.5 rounded-full bg-amber-400"/>}</div>
                  <span className="text-[14px] font-bold text-slate-200 text-right flex-1 mr-3">{r}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-4 px-5 pt-4 pb-8 border-t border-slate-800">
              <button type="button"
                onClick={handleConfirmCancelTrip}
                className={`flex-1 rounded-xl border-2 py-3.5 text-[15px] font-bold transition ${cancelReason?'border-red-500 text-red-400 hover:bg-red-950/30 cursor-pointer':'border-slate-800 text-slate-600 cursor-not-allowed'}`}>
                إلغاء الطلب
              </button>
              <button type="button" onClick={()=>setIsCancelTripOpen(false)} className="text-[15px] font-bold text-slate-400 cursor-pointer hover:text-white">تراجع</button>
            </div>
          </div>
        )}

        {/* 8. بطاقة تفاصيل الرحلة التفاعلية متعددة الارتفاعات الفاخرة */}
        {(stage === 'driver_arriving' || Boolean(rideRequestId && ['accepted', 'arrived', 'inprogress', 'in_progress'].includes((rideStatus || '').toLowerCase()))) && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (rideSheetState === 'collapsed') {
                setRideSheetState('expanded');
              }
            }}
            style={{
              transform: rideSheetState === 'expanded' ? 'translateY(0)' : 'translateY(calc(100% - 130px))',
              transition: 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
            }}
            className="absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[28px] bg-[#161C28]/95 backdrop-blur-md text-white border-t border-amber-500/20 pb-[calc(1.5rem+env(safe-area-inset-bottom))] mb-[env(safe-area-inset-bottom)] shadow-2xl will-change-transform animate-fade-in"
          >
            {/* مقبض السحب وترويسة الورقة */}
            <div
              onTouchStart={handleSheetTouchStart}
              onTouchMove={handleSheetTouchMove}
              onTouchEnd={handleSheetTouchEnd}
              onMouseDown={handleSheetMouseDown}
              style={{ touchAction: 'none' }}
              onClick={(e) => {
                e.stopPropagation();
                setRideSheetState((prev) => (prev === 'expanded' ? 'collapsed' : 'expanded'));
              }}
              className="cursor-pointer select-none touch-none pt-2.5 pb-2 px-5 flex flex-col items-center border-b border-slate-100/60"
            >
              {/* الركزة الرمادية مع مساحة لمس موسعة ومريحة (Hitbox Padding) */}
              <div className="py-2 px-8 flex justify-center items-center">
                <div className="h-1.5 w-12 rounded-full bg-slate-300 transition-colors hover:bg-slate-400 active:bg-slate-500" />
              </div>

              {/* اسم ونوع السيارة مع سهم المؤشر */}
              <div className="w-full flex items-center justify-between mt-0.5 mb-2 px-1">
                <p className="text-[17px] font-black text-white truncate">
                  {assignedDriverInfo?.driverVehicle || 'سيارة خصوصي'}
                </p>
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

              {/* شريط الحالة الحالي الدائم */}
              <div className="w-full">
                {(() => {
                  const lowerSt = (rideStatus || '').toLowerCase();
                  const isArr = lowerSt === 'arrived';
                  const isInProg = lowerSt === 'inprogress' || lowerSt === 'in_progress';

                  return (
                    <div
                      className={`w-full rounded-xl py-2 px-3.5 text-center select-none border transition-colors ${
                        isInProg
                          ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                          : isArr
                          ? 'bg-amber-950/60 border-amber-500/50 text-amber-200 shadow-xs'
                          : 'bg-[#0B101B] border-amber-500/30 text-amber-300'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-2">
                        {isInProg ? (
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
            </div>

            {/* محتوى تفاصيل الكابتن والدفع (يختفي بتأثير fade ناعم عند تصغير الورقة) */}
            <div
              className={`flex flex-col transition-all duration-300 px-5 pt-3.5 space-y-3.5 ${
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
                  <span className="text-[16px] font-bold text-white">
                    {assignedDriverInfo?.driverName || 'كابتن توصيله'}
                  </span>
                  <div className="h-14 w-14 rounded-full bg-amber-500/20 flex items-center justify-center text-amber-300 text-[26px] border-2 border-amber-500/40">
                    🧑‍✈️
                  </div>
                </div>
              </div>

              {/* مراسلة + اتصال */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (assignedDriverInfo?.driverPhone) window.open(`tel:${assignedDriverInfo.driverPhone}`);
                    else show('رقم الكابتن غير متوفر حالياً', 'info');
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-amber-500/40 text-amber-400 shrink-0 hover:bg-amber-500/10 cursor-pointer"
                  title="اتصال بالكابتن"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.95 12a19.79 19.79 0 0 1-3-8.59A2 2 0 0 1 4 1.37h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsChatOpen(true);
                  }}
                  className="flex flex-1 items-center justify-end gap-2 rounded-2xl bg-[#0B101B] border border-amber-500/30 px-4 py-3 text-[14px] font-bold text-amber-300 hover:border-amber-500 transition active:scale-95 cursor-pointer"
                >
                  <span>مراسلة السائق...</span>
                  <svg className="h-5 w-5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                </button>
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
                    مبلغ الرحلة: {calculatedPrice.toLocaleString()} دينار
                  </p>
                </div>
                <svg className="h-6 w-6 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="1" y="4" width="22" height="16" rx="2"/>
                  <line x1="1" y1="10" x2="23" y2="10"/>
                </svg>
              </div>

              {/* تفاصيل حالة الرحلة الفرعية */}
              {Boolean(rideStatus && ['arrived', 'inprogress', 'in_progress'].includes(rideStatus.toLowerCase())) && (
                <div className="text-center">
                  {rideStatus?.toLowerCase() === 'arrived' && (
                    <p className="text-[12px] text-amber-700/90 font-medium">بانتظار تأكيد السائق لبدء الرحلة ⏳</p>
                  )}
                  {(rideStatus?.toLowerCase() === 'inprogress' || rideStatus?.toLowerCase() === 'in_progress') && (
                    <p className="text-[12px] text-emerald-700/90 font-medium">الرحلة جارية الآن نحو وجهتك المحددة ✨</p>
                  )}
                </div>
              )}

              {/* زر إلغاء الرحلة متاح للراكب لحين بدء الرحلة فعلياً */}
              {(!rideStatus || (rideStatus !== 'InProgress' && rideStatus !== 'in_progress' && rideStatus !== 'Completed')) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsCancelTripOpen(true);
                    setCancelReason(null);
                  }}
                  className="w-full py-2 text-center text-[14px] font-bold text-red-500 hover:text-red-700 transition cursor-pointer"
                >
                  إلغاء الرحلة
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 8. نافذة "خيارات الرحلة" الفاخرة */}
      {isTripOptionsOpen && (
        <div className="fixed inset-0 md:max-w-md md:mx-auto z-50 flex flex-col bg-[#0D131F] text-white overflow-y-auto animate-fade-in" dir="rtl">
          {/* الترويسة العلوية: سهم الرجوع وعنوان خيارات الرحلة */}
          <div className="flex items-center gap-3 px-5 pt-[calc(1rem+env(safe-area-inset-top))] pb-3 border-b border-slate-800">
            <button
              type="button"
              onClick={() => setIsTripOptionsOpen(false)}
              className="p-1 text-amber-400 hover:text-amber-300 cursor-pointer transition active:scale-95"
              title="رجوع"
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
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 19 12 12 5" />
              </svg>
            </button>
            <h2 className="text-[20px] font-bold text-white">خيارات الرحلة</h2>
          </div>

          {/* صورة السيارة مع الشارة واسم الفئة */}
          <div className="flex flex-col items-center justify-center pt-8 pb-6">
            <CarBadgeIllustration badge={currentTier.badge} size="lg" />
            <h3 className="mt-4 text-[22px] font-black text-white">{currentTier.name}</h3>
          </div>

          {/* تنبيه: لا يمكن تغيير الخيارات أثناء الرحلة */}
          <div className="mx-6 mb-6 flex items-center justify-between rounded-2xl bg-[#0B101B] border border-slate-800 p-3.5">
            <div className="text-right">
              <p className="text-[13px] font-bold text-slate-400 leading-relaxed">
                ملحوظة: لا يمكن تغيير الخيارات التي اخترتها أثناء الرحلة.
              </p>
            </div>
            {/* أيقونة الهاتف الأحمر */}
            <div className="mr-2 shrink-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-950/60 text-red-400 border border-red-500/30 shadow-sm">
                <svg
                  className="h-6 w-6 text-red-400"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                  <line x1="12" y1="18" x2="12.01" y2="18" />
                </svg>
              </div>
            </div>
          </div>

          {/* قائمة الخيارات */}
          <div className="px-6 flex-1">
            <h4 className="text-[16px] font-bold text-slate-300 mb-2">خيارات الرحلة</h4>
            <div className="divide-y divide-slate-800">
              {/* 1. الوجهة الثانية */}
              <div
                onClick={() => setIsAddingSecondDest((v) => !v)}
                className="flex items-center justify-between py-4 cursor-pointer hover:bg-slate-800/40 transition"
              >
                <div className="text-slate-500">
                  <svg
                    className="h-5 w-5"
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
                <div className="text-right">
                  <span className="text-[16px] font-bold text-slate-200">الوجهة الثانية</span>
                  {secondDestination && (
                    <p className="text-xs font-semibold text-amber-400 mt-0.5">{secondDestination}</p>
                  )}
                </div>
              </div>

              {/* حقل إدخال الوجهة الثانية إن تم فتحها */}
              {isAddingSecondDest && (
                <div className="py-2 animate-fade-in">
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
                    className="w-full rounded-xl border border-amber-500/30 bg-[#0B101B] p-2.5 text-xs font-bold text-amber-300 text-right outline-none focus:border-amber-500"
                  />
                </div>
              )}

              {/* 2. التوقف في الطريق */}
              <div
                onClick={() => setIsAddingStop((v) => !v)}
                className="flex items-center justify-between py-4 cursor-pointer hover:bg-slate-800/40 transition"
              >
                <div className="text-slate-500">
                  <svg
                    className="h-5 w-5"
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
                <div className="text-right">
                  <span className="text-[16px] font-bold text-slate-200">التوقف في الطريق</span>
                  {stopDuration && (
                    <p className="text-xs font-semibold text-amber-400 mt-0.5">
                      توقف لمدة {stopDuration} دقائق (+500 د.ع)
                    </p>
                  )}
                </div>
              </div>

              {/* خيارات مدة التوقف */}
              {isAddingStop && (
                <div className="flex gap-2 py-2 animate-fade-in">
                  {[5, 10, 15].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setStopDuration(mins)}
                      className={`flex-1 rounded-xl py-2 text-xs font-bold transition cursor-pointer ${
                        stopDuration === mins
                          ? 'bg-gradient-to-r from-amber-500 via-amber-600 to-amber-500 text-[#090D16] font-black shadow-md'
                          : 'bg-[#0B101B] text-slate-300 hover:bg-slate-800 border border-slate-700'
                      }`}
                    >
                      {mins} دقائق
                    </button>
                  ))}
                </div>
              )}

              {/* 3. رحلة ذهاب وإياب */}
              <div className="flex items-center justify-between py-4">
                {/* زر التبديل التوجل Toggle Switch */}
                <button
                  type="button"
                  onClick={() => setIsRoundTrip((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    isRoundTrip ? 'bg-amber-500' : 'bg-slate-700'
                  }`}
                  aria-label="تفعيل رحلة ذهاب وإياب"
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      isRoundTrip ? '-translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>

                <span className="text-[15px] font-bold text-slate-200">رحلة ذهاب وإياب</span>
              </div>
            </div>
          </div>

          {/* الشريط السفلي: مبلغ الرحلة وزر التأكيد وزر الإنهاء */}
          <div className="border-t border-slate-800 p-6 bg-[#0B101B]">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[16px] font-black text-amber-400">
                {calculatedPrice.toLocaleString()} دينار
              </span>
              <span className="text-[14px] font-medium text-slate-400">مبلغ الرحلة</span>
            </div>

            <div className="flex items-center gap-4">
              {/* زر إنهاء */}
              <button
                type="button"
                onClick={() => setIsTripOptionsOpen(false)}
                className="py-3 px-4 text-center text-sm font-bold text-slate-400 hover:text-white transition cursor-pointer"
              >
                انهاء
              </button>

              {/* زر تأكيد */}
              <button
                type="button"
                onClick={() => {
                  setIsTripOptionsOpen(false);
                  show('تم حفظ وتأكيد خيارات الرحلة بنجاح ✅', 'success');
                }}
                className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 via-amber-600 to-amber-500 py-3 text-center text-sm font-black text-[#090D16] hover:brightness-110 shadow-[0_4px_20px_rgba(245,158,11,0.3)] transition-all duration-200 active:scale-[0.98] cursor-pointer"
              >
                تأكيد
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
        <div className="fixed inset-0 md:max-w-md md:mx-auto z-50 flex flex-col bg-[#0D131F] text-white">
          <div className="flex items-center justify-between px-4 pt-[calc(1rem+env(safe-area-inset-top))] pb-3 border-b border-slate-800">
            <h2 className="text-[18px] font-bold text-white">
              {stage === 'pickup' ? 'حدد نقطة الانطلاق' : 'حدد وجهة الوصول'}
            </h2>
            <button
              type="button"
              onClick={() => {
                setIsSearchOpen(false);
                setSearchQuery('');
                setSearchResults([]);
              }}
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

          {/* مربع البحث العلوي المندمج */}
          <div className="px-4 py-3">
            <div className="flex items-center rounded-xl bg-[#0B101B] border border-amber-500/30 px-3 py-2.5 transition-all focus-within:border-amber-500 focus-within:ring-2 focus-within:ring-amber-500/20">
              <button
                type="button"
                onClick={() => setIsCitySelectorOpen(true)}
                className="flex items-center gap-1.5 shrink-0 px-2 py-1 rounded-lg bg-[#161C28] border border-amber-500/30 text-[12.5px] font-bold text-amber-300 hover:border-amber-400 transition cursor-pointer"
                title="تغيير المدينة"
              >
                <span>{selectedCity}</span>
                <svg className="h-3.5 w-3.5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              </button>

              <div className="mx-2.5 h-4 w-[1px] bg-slate-800" />

              <div className="mr-1 text-amber-400/80">
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
                className="flex-1 bg-transparent text-[14px] font-medium text-white outline-none placeholder-slate-500 font-map-search"
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
          <div className="flex items-center gap-2.5 px-4 pb-3 overflow-x-auto no-scrollbar border-b border-slate-800">
            {QUICK_CHIPS.map((chip) => (
              <div
                key={chip.name}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectPlace(chip);
                }}
                className="flex items-center gap-2 rounded-xl border border-slate-800 bg-[#161C28] hover:border-amber-500/40 px-3.5 py-2 cursor-pointer transition-all duration-200 active:scale-95 shadow-sm shrink-0"
              >
                <span className="text-[13px] font-bold text-slate-200">{chip.name}</span>
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-500/20 text-amber-400">
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
            className="flex-1 overflow-y-auto px-4 py-3 bg-[#080E1A]"
          >
            {isSearchingPlaces && (
              <div className="flex items-center justify-center py-8 text-slate-400">
                <Spinner className="h-5 w-5 ml-2 text-amber-400" />
                <span className="text-xs font-semibold">جاري البحث في الأماكن والمعالم...</span>
              </div>
            )}

            {!isSearchingPlaces && searchResults.length > 0 && (
              <div className="space-y-1.5">
                <p className="mb-2 text-[12px] font-bold text-slate-400 px-1">
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
                    className="group flex items-center justify-between p-3 rounded-xl border border-slate-800 bg-[#0B101B] hover:border-amber-500/50 hover:shadow-md transition-all duration-200 cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20 transition-colors">
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                      </div>
                      <div className="truncate font-map-search">
                        <p className="text-[14.5px] font-bold text-slate-200 group-hover:text-amber-300 transition-colors truncate">
                          {place.name}
                        </p>
                        <p className="text-[12px] font-medium text-slate-400 mt-0.5 truncate">
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
                  placeholder="البحث في المدن..."
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
                <span>مدينتك الحالية</span>
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

      {/* 11. القائمة الجانبية الموحدة للراكب (AppDrawer) */}
      <AppDrawer open={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />


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

    </div>
  );
}
