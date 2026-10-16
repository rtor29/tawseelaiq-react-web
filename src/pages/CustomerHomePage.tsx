// شاشة تكسي الرئيسية — دورة حجز الرحلة المتكاملة
// 1. تحديد نقطة الانطلاق (دبوس برتقالي + زر الهوم)
// 2. تحديد نقطة الوصول (دبوس أزرق مربع + زر الرجوع)
// 3. خيارات فئات الرحلة (الصورة 1: سوبر / توفير / بلس + خيارات الرحلة + قسيمة + زر طلب الفئة)
// 4. نافذة خيارات الرحلة المتقدمة (الصورة 2: الوجهة الثانية، التوقف في الطريق، رحلة ذهاب وإياب)
// 5. نافذة اختيار المدينة ودرج الزبون الكامل (حول توصيلة)

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Map as MapGL, Marker, type MapMouseEvent, type MapRef } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { http } from '../lib/api';
import { authStore } from '../lib/auth';
import { config } from '../lib/config';
import { distanceKm } from '../lib/geo';
import { searchPlaces, reverseGeocode, getDirections, type PlaceResult } from '../lib/mapbox';
import { storage } from '../lib/storage';
import type { LngLat } from '../types';
import { VehicleMarker } from '../components/map/VehicleMarker';
import { RouteLines, type RouteLineData } from '../components/map/MapPins';
import { Spinner } from '../components/ui';
import { useToast } from '../components/Toast';
import ChatModal from '../components/ChatModal';

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

// الأماكن الأخيرة
const RECENT_PLACES = [
  {
    name: 'كراج العلاوي',
    address: 'بغداد، الصالحية، قرب شارع دمشق',
    lat: 33.3289,
    lng: 44.382,
  },
  {
    name: 'سوبر ماركت وفر',
    address: 'النجف، السلام، قرب شارع الحزام',
    lat: 32.015,
    lng: 44.325,
  },
  {
    name: 'جسر كراج بغداد',
    address: 'النجف، السلام، قرب شارع الخيمة',
    lat: 32.0255,
    lng: 44.341,
  },
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
    basePrice: 2000,
    badge: 'super',
  },
  {
    id: 'saving',
    name: 'توفير',
    subtitle: 'التكسي الأوفر',
    basePrice: 1750,
    badge: 'saving',
  },
  {
    id: 'plus',
    name: 'بلَس',
    subtitle: 'خدمة أكثر راحة',
    basePrice: 2250,
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

  const session = authStore.getSession();
  const customerName = session?.fullName || storage.getFullName() || 'موسى';
  const rawPhone = storage.getPhone() || '07706204066';
  const formattedPhone = rawPhone.startsWith('+')
    ? rawPhone
    : rawPhone.startsWith('0')
    ? `+964${rawPhone.slice(1)}`
    : `+964${rawPhone}`;

  // مرحلة الحجز
  const [stage, setStage] = useState<BookingStage>('pickup');

  // إحداثيات وأسماء النقطتين
  const [pickup, setPickup] = useState<LngLat>(DEFAULT_PICKUP);
  const [pickupName, setPickupName] = useState(DEFAULT_PICKUP_NAME);
  const [dropoff, setDropoff] = useState<LngLat>(DEFAULT_DROPOFF);
  const [dropoffName, setDropoffName] = useState(DEFAULT_DROPOFF_NAME);

  // مسار الشوارع بين النقطتين
  const [routeCoordinates, setRouteCoordinates] = useState<[number, number][]>([]);

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
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCitySelectorOpen, setIsCitySelectorOpen] = useState(false);
  const [isDriverSheetExpanded, setIsDriverSheetExpanded] = useState(false);
  const [isCancelTripOpen, setIsCancelTripOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);

  // المدينة المحددة
  const [selectedCity, setSelectedCity] = useState('المدينة الحالية');
  const [citySearchQuery, setCitySearchQuery] = useState('');

  // النوافذ الفرعية لدرج الزبون
  const [activeDrawerSubModal, setActiveDrawerSubModal] = useState<
    'none' | 'wallet' | 'trips' | 'favorites' | 'coupons' | 'referral' | 'settings' | 'about' | 'support'
  >('none');
  const [walletBalance] = useState('1,500');

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

  // حالة البحث النصي للأماكن
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [isListeningMic, setIsListeningMic] = useState(false);
  const searchTimer = useRef<number | null>(null);
  const hasNotifiedArrivalRef = useRef(false);

  // استعادة الطلب المحفوظ تلقائياً عند تحديث الصفحة أو الخروج منها والعودة
  useEffect(() => {
    const rawSaved = localStorage.getItem('TAWSEELA_ACTIVE_TAXI_RIDE');
    let savedReqId: string | null = null;
    if (rawSaved) {
      try {
        const saved = JSON.parse(rawSaved);
        if (saved?.rideRequestId && (saved.stage === 'searching' || saved.stage === 'driver_arriving')) {
          savedReqId = saved.rideRequestId;
          setRideRequestId(saved.rideRequestId);
          setStage(saved.stage);
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
                if (req.status === 'Accepted' || req.status === 'Arrived') {
                  setStage('driver_arriving');
                } else if (req.status === 'Pending') {
                  setStage('searching');
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

                if (req.assignedDriverName || req.assignedDriverPhone) {
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
              const curStage = (r.status === 'Accepted' || r.status === 'Arrived') ? 'driver_arriving' : 'searching';
              setStage(curStage);
              if (r.pickupLat && r.pickupLon) {
                setPickup({ lat: parseFloat(r.pickupLat), lng: parseFloat(r.pickupLon) });
              }
              if (r.pickupName) setPickupName(r.pickupName);
              if (r.dropoffLat && r.dropoffLon) {
                setDropoff({ lat: parseFloat(r.dropoffLat), lng: parseFloat(r.dropoffLon) });
              }
              if (r.dropoffName) setDropoffName(r.dropoffName);
              if (r.assignedDriverName || r.assignedDriverPhone) {
                setAssignedDriverInfo({
                  driverId: r.acceptedDriverId || r.assignedDriverId,
                  driverName: r.assignedDriverName,
                  driverPhone: r.assignedDriverPhone,
                  driverVehicle: r.assignedDriverVehicle,
                });
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
  }, [rideRequestId, stage, pickup, pickupName, dropoff, dropoffName, selectedTierId, assignedDriverInfo, routeCoordinates]);



  // تحديث العنوان عند تحريك الخريطة في مرحلتي الانطلاق والوصول
  const handleMapMoveEnd = useCallback(
    async (e: { viewState: { latitude: number; longitude: number } }) => {
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
    [stage]
  );

  // النقر المباشر على الخريطة
  function handleMapClick(e: MapMouseEvent) {
    if (stage === 'ride_options' || stage === 'searching' || stage === 'driver_arriving') return;

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

  // زر تحديد الموقع الحالي عبر GPS
  function handleUseCurrentLocation() {
    if (!navigator.geolocation) {
      show('خاصية تحديد الموقع غير مدعومة في هذا المتصفح', 'warning');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
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
        show('تم تحديد موقعك الحالي بنجاح 📍', 'success');
      },
      () => {
        show('تعذر تحديد موقع GPS، يمكنك سحب الخريطة لتحديد مكانك', 'warning');
      },
      { enableHighAccuracy: true, timeout: 9000 }
    );
  }

  // بحث الأماكن في نافذة البحث
  function handleSearchChange(query: string) {
    setSearchQuery(query);
    if (searchTimer.current) window.clearTimeout(searchTimer.current);

    const q = query.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }

    const proximity = stage === 'pickup' ? pickup : dropoff;
    searchTimer.current = window.setTimeout(async () => {
      setIsSearchingPlaces(true);
      try {
        const results = await searchPlaces(q, proximity);
        setSearchResults(results);
      } finally {
        setIsSearchingPlaces(false);
      }
    }, 250);
  }

  // اختيار مكان من نتائج البحث
  function handleSelectPlace(place: { name: string; lat: number; lng: number }) {
    if (stage === 'pickup') {
      setPickup({ lat: place.lat, lng: place.lng });
      setPickupName(place.name);
    } else {
      setDropoff({ lat: place.lat, lng: place.lng });
      setDropoffName(place.name);
    }
    mapRef.current?.flyTo({ center: [place.lng, place.lat], zoom: 15.5, duration: 700 });
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

  // فتح Waze أو Google Maps بوجهة نقطة الوصول
  function handleOpenNavigation() {
    const wazeUrl = `waze://ul?ll=${dropoff.lat},${dropoff.lng}&navigate=yes`;
    const googleUrl = `https://maps.google.com/?daddr=${dropoff.lat},${dropoff.lng}`;
    const a = document.createElement('a');
    a.href = wazeUrl;
    a.click();
    setTimeout(() => { window.open(googleUrl, '_blank'); }, 1200);
    show('السائق وصل! 🚗 جاري تشغيل الملاحة...', 'success', 5000);
  }

  // حساب سعر الرحلة الحالي حسب الفئة والخيارات الإضافية (ذهاب وإياب، وجهة ثانية، إلخ)
  const currentTier = RIDE_TIERS.find((t) => t.id === selectedTierId) || RIDE_TIERS[0];
  let calculatedPrice = currentTier.basePrice;
  if (isRoundTrip) calculatedPrice *= 2;
  if (secondDestination.trim()) calculatedPrice += 1000;
  if (stopDuration) calculatedPrice += 500;
  if (appliedPromo) calculatedPrice = Math.max(1000, Math.round(calculatedPrice * 0.8));

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
        distanceKm: Math.max(0.5, Math.round(dist * 10) / 10),
        durationMins: Math.max(5, Math.round(dist * 2.5)),
        vehicleType: selectedTierId === 'plus' ? 'vip' : 'eco',
        rangeKm: 25,
      });

      if (data.success && data.request) {
        hasNotifiedArrivalRef.current = false;
        setRideRequestId(data.request.id);
        let assignedDriverData = null;
        if (data.assignedDriver) {
          assignedDriverData = {
            driverId: data.assignedDriver.driverId,
            driverName: data.assignedDriver.fullName || data.assignedDriver.driverName,
            driverPhone: data.assignedDriver.phoneNumber || data.assignedDriver.phone,
            driverVehicle: data.assignedDriver.vehicleInfo || data.assignedDriver.carModel || 'تويوتا كورولا',
            driverPlate: data.assignedDriver.plateNumber || 'النجف',
            driverRating: data.assignedDriver.rating || 5.0,
            driverLat: data.assignedDriver.latitude,
            driverLon: data.assignedDriver.longitude,
          };
          setAssignedDriverInfo(assignedDriverData);
        }
        setStage('searching');
        try {
          localStorage.setItem('TAWSEELA_ACTIVE_TAXI_RIDE', JSON.stringify({
            rideRequestId: data.request.id,
            stage: 'searching',
            pickup,
            pickupName,
            dropoff,
            dropoffName,
            selectedTierId,
            assignedDriverInfo: assignedDriverData,
            routeCoordinates,
          }));
        } catch (_) {}
        show('تم إرسال طلبك للبحث عن أقرب كابتن 🚖', 'info');
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

  // تتبع حالة الرحلة لحظياً من الخادم
  useEffect(() => {
    if (!rideRequestId || (stage !== 'searching' && stage !== 'driver_arriving')) return;

    const interval = setInterval(async () => {
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
          if (req.status === 'Accepted') {
            if (stage !== 'driver_arriving') {
              setStage('driver_arriving');
              show('تم قبول رحلتك من قبل الكابتن! 🚖 الكابتن في طريقه إليك', 'success');
              mapRef.current?.flyTo({ center: [pickup.lng, pickup.lat], zoom: 15.5, duration: 700 });
            }
          } else if (req.status === 'Arrived') {
            if (!hasNotifiedArrivalRef.current) {
              hasNotifiedArrivalRef.current = true;
              show('الكابتن وصل إلى موقعك الآن! 🚗', 'success', 5000);
            }
          } else if (req.status === 'Completed') {
            hasNotifiedArrivalRef.current = false;
            localStorage.removeItem('TAWSEELA_ACTIVE_TAXI_RIDE');
            show('تم إكمال الرحلة بنجاح. شكراً لاستخدامك توصيلة! ✨', 'success');
            setStage('pickup');
            setRideRequestId(null);
            setAssignedDriverInfo(null);
            setLiveDriverPosition(null);
          } else if (req.status === 'Cancelled' || req.status === 'NoDriversAvailable') {
            hasNotifiedArrivalRef.current = false;
            localStorage.removeItem('TAWSEELA_ACTIVE_TAXI_RIDE');
            show(req.status === 'Cancelled' ? 'تم إلغاء الرحلة' : 'لم يتم العثور على سائق متوفر حالياً', 'warning');
            setStage('ride_options');
            setRideRequestId(null);
            setAssignedDriverInfo(null);
            setLiveDriverPosition(null);
          }

          if (req.assignedDriverName || req.assignedDriverPhone) {
            setAssignedDriverInfo((prev) => ({
              ...prev,
              driverId: req.acceptedDriverId || req.assignedDriverId || prev?.driverId,
              driverName: req.assignedDriverName || prev?.driverName,
              driverPhone: req.assignedDriverPhone || prev?.driverPhone,
              driverVehicle: req.assignedDriverVehicle || prev?.driverVehicle,
            }));
          }
        }
      } catch (_) {}
    }, 2500);

    return () => clearInterval(interval);
  }, [rideRequestId, stage, pickup]);

  // تتبع موقع السائق الحي على الخريطة
  useEffect(() => {
    if (stage !== 'driver_arriving' || !assignedDriverInfo?.driverId) return;

    const interval = setInterval(async () => {
      try {
        const { data } = await http.get<{
          latitude?: number;
          longitude?: number;
        }>(`/driver/${assignedDriverInfo.driverId}/live`);
        if (data && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
          setLiveDriverPosition({ lat: data.latitude, lng: data.longitude });
        }
      } catch (_) {}
    }, 3000);

    return () => clearInterval(interval);
  }, [stage, assignedDriverInfo?.driverId]);

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
    setIsDriverSheetExpanded(false);
    setRideRequestId(null);
    setAssignedDriverInfo(null);
    setLiveDriverPosition(null);
  }

  // تسجيل الخروج
  function handleLogout() {
    authStore.clear();
    setIsProfileOpen(false);
    navigate('/login', { replace: true });
  }

  // تصفية المدن
  const filteredCities = IRAQI_CITIES.filter(
    (c) => c.name.includes(citySearchQuery.trim()) || c.sub.includes(citySearchQuery.trim())
  );

  // إعداد طبقة خط المسار
  const routeLines: RouteLineData[] = routeCoordinates.length
    ? [{ id: 'route-line', coordinates: routeCoordinates, color: '#0026ff', width: 5.5 }]
    : [];

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-slate-100 select-none font-cairo" dir="rtl">
      {/* 1. زر التحكم أعلى اليمين */}
      {stage === 'pickup' ? (
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="absolute top-4 right-4 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-white text-gray-800 shadow-[0_4px_16px_rgba(0,0,0,0.15)] transition-transform active:scale-95 cursor-pointer hover:bg-gray-50"
          title="الرجوع لصفحة اختيار الخدمة"
          aria-label="الرئيسية"
        >
          <svg
            className="h-6 w-6 text-gray-700"
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
          className="absolute top-4 right-4 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-white text-gray-800 shadow-[0_4px_16px_rgba(0,0,0,0.15)] transition-transform active:scale-95 cursor-pointer hover:bg-gray-50"
          title={stage === 'searching' ? 'إلغاء البحث' : stage === 'ride_options' ? 'الرجوع لنقطة الوصول' : 'الرجوع لنقطة الانطلاق'}
          aria-label="رجوع"
        >
          <svg
            className="h-6 w-6 text-gray-700"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}

      {/* 2. زر معلومات الزبون (أعلى اليسار) */}
      <button
        type="button"
        onClick={() => setIsProfileOpen(true)}
        className="absolute top-4 left-4 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-white text-gray-800 shadow-[0_4px_16px_rgba(0,0,0,0.15)] transition-transform active:scale-95 cursor-pointer hover:bg-gray-50"
        title="معلومات الزبون"
        aria-label="الملف الشخصي للزبون"
      >
        <svg
          className="h-6 w-6 text-gray-700"
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

      {/* زر الأمان العائم — يظهر فقط في مرحلة السائق قادم */}
      {stage === 'driver_arriving' && (
        <button type="button" onClick={() => show('ميزة الأمان قريباً 🛡️','info')}
          className="absolute top-20 left-4 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-white text-blue-600 shadow-[0_4px_16px_rgba(0,0,0,0.15)] transition-transform active:scale-95 cursor-pointer hover:bg-blue-50">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </button>
      )}

      {/* 3. الخريطة الرئيسية Mapbox */}
      <div className="relative h-full w-full">
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
                <div className="flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.18)] border border-gray-100 transition-transform group-hover:scale-105">
                  <span className="text-[13px] font-black text-gray-900 font-cairo">الانطلاق</span>
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f97316]">
                    <div className="h-2 w-2 rounded-full bg-white" />
                  </div>
                </div>
                <div className="h-3 w-0.5 bg-gray-600/80 -mt-0.5" />
                <div className="h-1.5 w-4 rounded-full bg-black/20 blur-[1px]" />
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
                <div className="flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 shadow-[0_4px_16px_rgba(0,0,0,0.18)] border border-gray-100 transition-transform group-hover:scale-105">
                  <span className="text-[13px] font-black text-gray-900 font-cairo">الوصول</span>
                  <div className="flex h-5 w-5 items-center justify-center rounded-[6px] bg-[#0026ff]">
                    <div className="h-2 w-2 rounded-full bg-white" />
                  </div>
                </div>
                <div className="h-3 w-0.5 bg-gray-600/80 -mt-0.5" />
                <div className="h-1.5 w-4 rounded-full bg-black/20 blur-[1px]" />
              </div>
            </Marker>
          )}



          {/* موقع السائق الحقيقي عند القبول والوصول */}
          {liveDriverPosition ? (
            <VehicleMarker
              targetLat={liveDriverPosition.lat}
              targetLng={liveDriverPosition.lng}
              targetHeading={140}
              isAvailable={false}
            />
          ) : assignedDriverInfo?.driverLat && assignedDriverInfo?.driverLon ? (
            <VehicleMarker
              targetLat={assignedDriverInfo.driverLat}
              targetLng={assignedDriverInfo.driverLon}
              targetHeading={140}
              isAvailable={false}
            />
          ) : null}
          {/* نبضة دائرية حول نقطة الانطلاق في مرحلة البحث */}
          {stage === 'searching' && (
            <Marker longitude={pickup.lng} latitude={pickup.lat} anchor="center">
              <div className="relative flex items-center justify-center">
                <div className="animate-ping-expand absolute h-40 w-40 rounded-full bg-blue-400/20" />
                <div className="animate-ping-expand animation-delay-600 absolute h-28 w-28 rounded-full bg-blue-500/25" />
                <div className="h-5 w-5 rounded-full bg-[#f97316] border-2 border-white shadow-md" />
              </div>
            </Marker>
          )}
          {/* علامة الانطلاق مع وقت الوصول في مرحلة السائق قادم */}
          {stage === 'driver_arriving' && (
            <Marker longitude={pickup.lng} latitude={pickup.lat} anchor="bottom">
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 shadow-lg border border-gray-100">
                  <span className="text-[12px] font-black text-gray-900">الانطلاق</span>
                  <span className="text-[12px] font-bold text-gray-500">1 دقيقة</span>
                  <div className="h-4 w-4 rounded-full bg-[#f97316] flex items-center justify-center">
                    <div className="h-1.5 w-1.5 rounded-full bg-white" />
                  </div>
                </div>
                <div className="h-3 w-0.5 bg-gray-500" />
              </div>
            </Marker>
          )}
        </MapGL>

        {/* 4. دبوس المركز في منتصف الشاشة (يختفي في مرحلة خيارات الرحلة أو البحث) */}
        {stage !== 'ride_options' && stage !== 'searching' && stage !== 'driver_arriving' && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            {stage === 'pickup' ? (
              <div className="relative flex flex-col items-center -translate-y-full mb-1 animate-fade-in">
                <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-[#f97316] shadow-[0_4px_14px_rgba(249,115,22,0.5)]">
                  <div className="h-3.5 w-3.5 rounded-full bg-white shadow-inner" />
                </div>
                <div className="h-3.5 w-1 rounded-full bg-slate-700/80 -mt-0.5" />
                <div className="h-1.5 w-4 rounded-full bg-black/25 blur-[1px] mt-0.5" />
              </div>
            ) : (
              <div className="relative flex flex-col items-center -translate-y-full mb-1 animate-fade-in">
                <div className="relative flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#0026ff] shadow-[0_4px_16px_rgba(0,38,255,0.45)]">
                  <div className="h-3.5 w-3.5 rounded-full bg-white shadow-inner" />
                </div>
                <div className="h-3.5 w-1 rounded-full bg-slate-700/80 -mt-0.5" />
                <div className="h-1.5 w-4 rounded-full bg-black/25 blur-[1px] mt-0.5" />
              </div>
            )}
          </div>
        )}

        {/* 5. زر إعادة التمركز وتحديد الموقع عبر الـ GPS */}
        {stage !== 'ride_options' && stage !== 'searching' && stage !== 'driver_arriving' && (
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            className="absolute bottom-44 right-4 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-white text-gray-800 shadow-[0_4px_16px_rgba(0,0,0,0.18)] transition-transform active:scale-95 cursor-pointer hover:bg-gray-50"
            title="موقعي الحالي عبر الـ GPS"
            aria-label="تحديد موقعي"
          >
            <svg
              className="h-6 w-6 text-gray-700"
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

        {/* 6. البطاقة السفلية البيضاء في مرحلتي الانطلاق والوصول */}
        {stage !== 'ride_options' && stage !== 'searching' && stage !== 'driver_arriving' && (
          <div className="absolute inset-x-0 bottom-0 z-30 rounded-t-[28px] bg-white px-5 pt-3 pb-8 shadow-[0_-8px_30px_rgba(0,0,0,0.12)]">
            <div className="flex justify-center mb-3">
              <svg
                className="w-5 h-2.5 text-gray-300"
                viewBox="0 0 24 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 10 12 2 4 10" />
              </svg>
            </div>

            <div
              onClick={() => setIsSearchOpen(true)}
              className="mb-4 flex items-center justify-between rounded-2xl bg-[#f3f4f6] p-3.5 cursor-pointer transition active:scale-[0.99] hover:bg-gray-200/80"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <svg
                  className="h-5 w-5 text-gray-500 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <span className="truncate text-[15px] font-bold text-[#1f2937]">
                  {stage === 'pickup' ? pickupName || DEFAULT_PICKUP_NAME : dropoffName || DEFAULT_DROPOFF_NAME}
                </span>
              </div>

              {stage === 'pickup' ? (
                <div className="mr-1 h-3.5 w-3.5 shrink-0 rounded-full bg-[#f97316]" />
              ) : (
                <div className="mr-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] bg-[#0026ff]">
                  <div className="h-1.5 w-1.5 rounded-full bg-white" />
                </div>
              )}
            </div>

            {stage === 'pickup' ? (
              <button
                type="button"
                onClick={handleConfirmPickup}
                className="w-full rounded-xl bg-[#0026ff] py-3.5 text-center text-[16px] font-bold text-white shadow-[0_6px_20px_rgba(0,38,255,0.35)] transition active:scale-[0.98] hover:bg-[#0020d9] cursor-pointer"
              >
                تأكيد نقطة الانطلاق
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConfirmDropoff}
                className="w-full rounded-xl bg-[#0026ff] py-3.5 text-center text-[16px] font-bold text-white shadow-[0_6px_20px_rgba(0,38,255,0.35)] transition active:scale-[0.98] hover:bg-[#0020d9] cursor-pointer"
              >
                تأكيد نقطة الوصول
              </button>
            )}
          </div>
        )}

        {/* 7. بطاقة خيارات فئات الرحلة (الصورة الأولى بالكامل) */}
        {stage === 'ride_options' && (
          <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[28px] bg-white pt-2 pb-6 shadow-[0_-8px_30px_rgba(0,0,0,0.15)] animate-fade-in">
            {/* التبويبات العلوية: تكسي و بوكس */}
            <div className="flex border-b border-gray-100">
              <button
                type="button"
                onClick={() => setSelectedServiceTab('taxi')}
                className={`flex-1 py-3 text-center text-[16px] font-bold transition relative ${
                  selectedServiceTab === 'taxi'
                    ? 'text-gray-900 border-b-2 border-gray-900'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                تكسي
              </button>
              <button
                type="button"
                onClick={() => setSelectedServiceTab('box')}
                className={`flex-1 py-3 text-center text-[16px] font-bold transition relative ${
                  selectedServiceTab === 'box'
                    ? 'text-gray-900 border-b-2 border-gray-900'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                بوكس
              </button>
            </div>

            {/* قائمة فئات الرحلة (سوبر، توفير، بلس) */}
            <div className="divide-y divide-gray-100">
              {RIDE_TIERS.map((tier) => {
                const isSelected = selectedTierId === tier.id;
                return (
                  <div
                    key={tier.id}
                    onClick={() => setSelectedTierId(tier.id)}
                    className={`flex items-center justify-between px-6 py-3.5 cursor-pointer transition ${
                      isSelected ? 'bg-[#f0f4ff]' : 'hover:bg-gray-50'
                    }`}
                  >
                    {/* السعر على اليسار */}
                    <div className="text-left font-black text-[16px] text-gray-900">
                      {tier.basePrice.toLocaleString()} دينار
                    </div>

                    {/* الاسم والوصف والسيارة الزرقاء على اليمين */}
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-[16px] font-black text-gray-900">{tier.name}</p>
                        <p className="text-[12px] font-bold text-gray-400">{tier.subtitle}</p>
                      </div>

                      {/* رسمة السيارة الزرقاء مع الشارة */}
                      <CarBadgeIllustration badge={tier.badge} size="sm" />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* شريط الإجراءات: خيارات الرحلة وقسيمة */}
            <div className="my-2 flex items-center justify-around border-t border-b border-gray-100 py-3 px-6">
              {/* خيارات الرحلة (يفتح الصورة الثانية) */}
              <button
                type="button"
                onClick={() => setIsTripOptionsOpen(true)}
                className="flex flex-1 items-center justify-center gap-2 text-gray-700 hover:text-blue-600 transition cursor-pointer"
              >
                <span className="text-[14px] font-bold">خيارات الرحلة</span>
                <svg
                  className="h-5 w-5 text-gray-700"
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
              <div className="h-6 w-[1px] bg-gray-200" />

              {/* قسيمة الخصم */}
              <button
                type="button"
                onClick={() => setIsPromoModalOpen(true)}
                className="flex flex-1 items-center justify-center gap-2 text-gray-700 hover:text-blue-600 transition cursor-pointer"
              >
                <span className="text-[14px] font-bold">
                  {appliedPromo ? 'خصم 20% مفعّل' : 'قسيمة'}
                </span>
                <svg
                  className="h-5 w-5 text-gray-700"
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

            {/* الزر الأزرق: طلب الفئة المحددة (مثال: طلب سوبر) */}
            <div className="px-6 pt-2">
              <button
                type="button"
                onClick={handleOrderTrip}
                className="w-full rounded-xl bg-[#0026ff] py-3.5 text-center text-[16px] font-black text-white shadow-[0_6px_20px_rgba(0,38,255,0.35)] transition active:scale-[0.98] hover:bg-[#0020d9] cursor-pointer"
              >
                طلب {currentTier.name}
              </button>
            </div>
          </div>
        )}

        {/* 7. بطاقة البحث — قابلة للتوسيع */}
        {stage === 'searching' && (
          <div className={`absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[28px] bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.18)] animate-fade-in ${isDriverSheetExpanded ? 'top-0 rounded-none overflow-y-auto' : 'pb-8'}`}>
            {/* مقبض — الضغط يوسّع */}
            <div className="flex justify-center py-3 cursor-pointer" onClick={() => setIsDriverSheetExpanded(v => !v)}>
              {isDriverSheetExpanded
                ? <svg className="h-5 w-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15"/></svg>
                : <div className="h-1 w-10 rounded-full bg-gray-300" />}
            </div>
            {isDriverSheetExpanded ? (
              <div className="flex flex-col flex-1 px-5 pb-8">
                <p className="text-center text-[18px] font-black text-gray-900 mb-4">
                  {assignedDriverInfo?.driverVehicle || 'سيارة خصوصي'}
                </p>
                <div className="flex items-center justify-between mb-5">
                  <div className="rounded-xl border-2 border-gray-800 px-3 py-2 text-center min-w-[100px]">
                    <p className="text-[18px] font-black text-gray-900 tracking-widest">
                      {assignedDriverInfo?.driverPlate || '١١٣٤٠ ة'}
                    </p>
                    <div className="flex justify-between text-[10px] text-gray-500 font-bold mt-0.5"><span>النجف</span><span>خصوصي</span></div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[16px] font-bold text-gray-800">
                      {assignedDriverInfo?.driverName || 'كابتن توصيله'}
                    </span>
                    <div className="h-14 w-14 rounded-full bg-blue-600 flex items-center justify-center text-white text-[24px] border-2 border-blue-300">🧑‍✈️</div>
                  </div>
                </div>
                <div className="flex items-center gap-3 mb-5">
                  <button
                    type="button"
                    onClick={() => {
                      if (assignedDriverInfo?.driverPhone) window.open(`tel:${assignedDriverInfo.driverPhone}`);
                      else show('رقم الكابتن غير متوفر حالياً', 'info');
                    }}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-blue-500 text-blue-600 shrink-0 hover:bg-blue-50 cursor-pointer"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.95 12a19.79 19.79 0 0 1-3-8.59A2 2 0 0 1 4 1.37h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsChatOpen(true)}
                    className="flex flex-1 items-center justify-end gap-2 rounded-2xl bg-blue-50 border border-blue-200/60 px-4 py-3 text-[14px] font-bold text-blue-600 hover:bg-blue-100 transition active:scale-95 cursor-pointer"
                  >
                    <span>مراسلة السائق...</span>
                    <svg className="h-5 w-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  </button>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-gray-50 border border-gray-100 px-4 py-3 mb-3">
                  <button type="button" className="rounded-xl bg-blue-600 px-4 py-2 text-[13px] font-bold text-white cursor-pointer hover:bg-blue-700">الدفع</button>
                  <div className="text-right">
                    <p className="text-[13px] font-bold text-red-500">الرصيد غير كاف</p>
                    <p className="text-[12px] text-gray-500">مبلغ الرحلة: {calculatedPrice.toLocaleString()} دينار</p>
                  </div>
                  <svg className="h-6 w-6 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                </div>
                {['تغيير الوجهة','رمز الخصم','خيارات الرحلة'].map(lbl => (
                  <button key={lbl} type="button" onClick={() => show(lbl,'info')} className="flex items-center justify-between border-b border-gray-100 py-4 cursor-pointer hover:bg-gray-50 w-full">
                    <svg className="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
                    <span className="text-[15px] font-bold text-gray-800">{lbl}</span>
                  </button>
                ))}
                <div className="flex-1 min-h-[40px]" />
                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <button type="button" onClick={() => { setIsCancelTripOpen(true); setCancelReason(null); }} className="text-[15px] font-bold text-red-500 cursor-pointer hover:text-red-700">إلغاء الرحلة</button>
                  <button type="button" onClick={() => show('ميزة الأمان قريباً 🛡️','info')} className="flex items-center gap-2 text-[15px] font-bold text-blue-600 cursor-pointer">
                    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>أمان
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mx-5 mb-4 flex flex-row-reverse overflow-hidden rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.12)]" style={{ minHeight: '130px' }}>
                  <div className="flex flex-col items-center justify-center bg-[#16a34a] px-5 min-w-[110px]">
                    <span className="text-[13px] font-bold text-white/80 mb-0.5">اطلب</span>
                    <span className="text-[26px] font-black text-white leading-tight">{currentTier.name}</span>
                    <div className="mt-2"><CarBadgeIllustration badge={currentTier.badge} size="sm" /></div>
                  </div>
                  <div className="flex flex-1 flex-col items-center justify-center bg-gray-100 gap-1 p-4">
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-white text-[28px] shadow-md">
                      🧑‍✈️<div className="absolute bottom-0 right-0 h-4 w-4 rounded-full bg-green-500 border-2 border-white"/>
                    </div>
                    <div className="flex gap-1 mt-1">{[...Array(3)].map((_,i)=><div key={i} className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-bounce" style={{animationDelay:`${i*0.18}s`}}/>)}</div>
                    <span className="text-[11px] font-bold text-gray-500 mt-1">جاري الاتصال...</span>
                  </div>
                </div>
                <p className="mb-4 px-5 text-center text-[17px] font-black text-gray-900">البحث عن أقرب سائق {currentTier.name}</p>
                <div className="px-5 flex flex-col gap-2">
                  <button type="button" onClick={()=>show('تم إعطاء الأولوية لطلبك 🚖','success',4000)} className="w-full rounded-xl border border-gray-300 bg-white py-3.5 text-center text-[15px] font-bold text-gray-700 transition active:scale-[0.98] hover:bg-gray-50 cursor-pointer">أنا مستعجل كثيراً ⚡</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* 7b. شاشة إلغاء الرحلة */}
        {(stage === 'searching' || stage === 'driver_arriving') && isCancelTripOpen && (
          <div className="absolute inset-0 z-40 bg-white flex flex-col animate-fade-in" dir="rtl">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
              <h2 className="text-[19px] font-black text-gray-900">إلغاء الرحلة</h2>
              <button type="button" onClick={()=>setIsCancelTripOpen(false)} className="cursor-pointer text-gray-500 hover:text-gray-800">
                <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            </div>
            <p className="px-5 pt-5 pb-2 text-[16px] font-bold text-gray-800">اختر سبب لإلغاء الرحلة:</p>
            <div className="overflow-y-auto flex-1 divide-y divide-gray-100 px-5">
              {['أنا في عجلة من أمري والسائق بعيد','غيرت رأيي','السائق لا يتحرك باتجاه نقطة الانطلاق على الخريطة','طلب السائق أموالاً إضافية','السائق طلب إلغاء الرحلة','السائق لا يجيب أو غير متوفر','السائق طلب الدفع نقدي','اريد تعديل تفاصيل الرحلة','سوف أستخدم خدمة أخرى'].map(r=>(
                <button key={r} type="button" onClick={()=>setCancelReason(r)} className="flex w-full items-center justify-between py-4 cursor-pointer hover:bg-gray-50">
                  <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${cancelReason===r?'border-blue-600':'border-gray-300'}`}>{cancelReason===r&&<div className="h-2.5 w-2.5 rounded-full bg-blue-600"/>}</div>
                  <span className="text-[14px] font-bold text-gray-800 text-right flex-1 mr-3">{r}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-4 px-5 pt-4 pb-8 border-t border-gray-100">
              <button type="button"
                onClick={handleConfirmCancelTrip}
                className={`flex-1 rounded-xl border-2 py-3.5 text-[15px] font-bold transition ${cancelReason?'border-red-500 text-red-500 hover:bg-red-50 cursor-pointer':'border-gray-200 text-gray-300 cursor-not-allowed'}`}>
                إلغاء الطلب
              </button>
              <button type="button" onClick={()=>setIsCancelTripOpen(false)} className="text-[15px] font-bold text-gray-600 cursor-pointer hover:text-gray-900">إلغاء</button>
            </div>
          </div>
        )}

        {/* 8. بطاقة "السائق قادم" */}
        {stage === 'driver_arriving' && (
          <div className="absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[28px] bg-white pb-8 shadow-[0_-8px_30px_rgba(0,0,0,0.18)] animate-fade-in">
            <div className="flex justify-center py-3"><div className="h-1 w-10 rounded-full bg-gray-300" /></div>

            {/* اسم السيارة */}
            <p className="text-center text-[18px] font-black text-gray-900 mb-4">
              {assignedDriverInfo?.driverVehicle || 'سيارة خصوصي'}
            </p>

            {/* لوحة + اسم السائق + صورة */}
            <div className="flex items-center justify-between px-5 mb-4">
              <div className="rounded-xl border-2 border-gray-800 px-3 py-2 text-center min-w-[100px]">
                <p className="text-[18px] font-black text-gray-900 tracking-widest">
                  {assignedDriverInfo?.driverPlate || '١١٣٤٠ ة'}
                </p>
                <div className="flex justify-between text-[10px] text-gray-500 font-bold mt-0.5"><span>النجف</span><span>خصوصي</span></div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[16px] font-bold text-gray-800">
                  {assignedDriverInfo?.driverName || 'كابتن توصيله'}
                </span>
                <div className="h-14 w-14 rounded-full bg-blue-600 flex items-center justify-center text-white text-[26px] border-2 border-blue-300">🧑‍✈️</div>
              </div>
            </div>

            {/* مراسلة + اتصال */}
            <div className="flex items-center gap-3 px-5 mb-4">
              <button
                type="button"
                onClick={() => {
                  if (assignedDriverInfo?.driverPhone) window.open(`tel:${assignedDriverInfo.driverPhone}`);
                  else show('رقم الكابتن غير متوفر حالياً', 'info');
                }}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-blue-500 text-blue-600 shrink-0 hover:bg-blue-50 cursor-pointer"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.95 12a19.79 19.79 0 0 1-3-8.59A2 2 0 0 1 4 1.37h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              </button>
              <button
                type="button"
                onClick={() => setIsChatOpen(true)}
                className="flex flex-1 items-center justify-end gap-2 rounded-2xl bg-blue-50 border border-blue-200/60 px-4 py-3 text-[14px] font-bold text-blue-600 hover:bg-blue-100 transition active:scale-95 cursor-pointer"
              >
                <span>مراسلة السائق...</span>
                <svg className="h-5 w-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              </button>
            </div>

            {/* الدفع */}
            <div className="flex items-center justify-between rounded-2xl bg-gray-50 border border-gray-100 px-4 py-3 mx-5 mb-4">
              <button type="button" className="rounded-xl bg-blue-600 px-4 py-2 text-[13px] font-bold text-white cursor-pointer hover:bg-blue-700">الدفع</button>
              <div className="text-right">
                <p className="text-[13px] font-bold text-red-500">الرصيد غير كاف</p>
                <p className="text-[12px] text-gray-500">مبلغ الرحلة: {calculatedPrice.toLocaleString()} دينار</p>
              </div>
              <svg className="h-6 w-6 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
            </div>

            {/* زر "السائق وصل — انطلق!" يفتح Waze/Google Maps وزر إلغاء الرحلة */}
            <div className="px-5 flex flex-col gap-2">
              <button type="button" onClick={handleOpenNavigation}
                className="w-full rounded-xl bg-[#f97316] py-3.5 text-center text-[16px] font-black text-white shadow-[0_6px_20px_rgba(249,115,22,0.4)] transition active:scale-[0.98] hover:bg-orange-600 cursor-pointer">
                🚗 السائق وصل — انطلاق إلى الوجهة
              </button>
              <button
                type="button"
                onClick={() => { setIsCancelTripOpen(true); setCancelReason(null); }}
                className="w-full py-2 text-center text-[14px] font-bold text-red-500 hover:text-red-700 transition cursor-pointer"
              >
                إلغاء الرحلة
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 8. نافذة "خيارات الرحلة" (الصورة الثانية بالكامل) */}
      {isTripOptionsOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-y-auto animate-fade-in" dir="rtl">
          {/* الترويسة العلوية: سهم الرجوع وعنوان خيارات الرحلة */}
          <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-gray-100">
            <button
              type="button"
              onClick={() => setIsTripOptionsOpen(false)}
              className="p-1 text-gray-800 hover:text-black cursor-pointer transition active:scale-95"
              title="رجوع"
            >
              {/* سهم الرجوع باتجاه اليمين في نمط RTL كما في الصورة 2 */}
              <svg
                className="h-6 w-6 text-gray-800"
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
            <h2 className="text-[20px] font-bold text-gray-900">خيارات الرحلة</h2>
          </div>

          {/* صورة السيارة الزرقاء الكبيرة مع الشارة واسم الفئة */}
          <div className="flex flex-col items-center justify-center pt-8 pb-6">
            <CarBadgeIllustration badge={currentTier.badge} size="lg" />
            <h3 className="mt-4 text-[22px] font-black text-gray-900">{currentTier.name}</h3>
          </div>

          {/* تنبيه: لا يمكن تغيير الخيارات أثناء الرحلة مع أيقونة الهاتف الأحمر */}
          <div className="mx-6 mb-6 flex items-center justify-between rounded-2xl bg-gray-50 border border-gray-100 p-3.5">
            <div className="text-right">
              <p className="text-[13px] font-bold text-gray-500 leading-relaxed">
                ملحوظة: لا يمكن تغيير الخيارات التي اخترتها أثناء الرحلة.
              </p>
            </div>
            {/* أيقونة الهاتف الأحمر مع أمواج الرنين */}
            <div className="mr-2 shrink-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600 shadow-sm">
                <svg
                  className="h-6 w-6 text-red-500"
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
            <h4 className="text-[16px] font-bold text-gray-700 mb-2">خيارات الرحلة</h4>
            <div className="divide-y divide-gray-100">
              {/* 1. الوجهة الثانية */}
              <div
                onClick={() => setIsAddingSecondDest((v) => !v)}
                className="flex items-center justify-between py-4 cursor-pointer hover:bg-gray-50 transition"
              >
                <div className="text-gray-400">
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
                  <span className="text-[16px] font-bold text-gray-800">الوجهة الثانية</span>
                  {secondDestination && (
                    <p className="text-xs font-semibold text-blue-600 mt-0.5">{secondDestination}</p>
                  )}
                </div>
              </div>

              {/* حقل إدخال الوجهة الثانية إن تم فتحها */}
              {isAddingSecondDest && (
                <div className="py-2 animate-fade-in">
                  <input
                    type="text"
                    value={secondDestination}
                    onChange={(e) => setSecondDestination(e.target.value)}
                    placeholder="حدد اسم الوجهة الإضافية..."
                    className="w-full rounded-xl border border-blue-200 bg-blue-50/50 p-2.5 text-xs font-bold text-right outline-none"
                  />
                </div>
              )}

              {/* 2. التوقف في الطريق */}
              <div
                onClick={() => setIsAddingStop((v) => !v)}
                className="flex items-center justify-between py-4 cursor-pointer hover:bg-gray-50 transition"
              >
                <div className="text-gray-400">
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
                  <span className="text-[16px] font-bold text-gray-800">التوقف في الطريق</span>
                  {stopDuration && (
                    <p className="text-xs font-semibold text-blue-600 mt-0.5">
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
                      className={`flex-1 rounded-xl py-2 text-xs font-bold transition ${
                        stopDuration === mins
                          ? 'bg-[#0026ff] text-white shadow-sm'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {mins} دقائق
                    </button>
                  ))}
                </div>
              )}

              {/* 3. رحلة ذهاب وإياب (مع التوجل كما في الصورة) */}
              <div className="flex items-center justify-between py-4">
                {/* زر التبديل التوجل Toggle Switch */}
                <button
                  type="button"
                  onClick={() => setIsRoundTrip((v) => !v)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                    isRoundTrip ? 'bg-[#0026ff]' : 'bg-gray-300'
                  }`}
                  aria-label="تفعيل رحلة ذهاب وإياب"
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      isRoundTrip ? '-translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>

                <span className="text-[16px] font-bold text-gray-800">رحلة ذهاب وإياب</span>
              </div>
            </div>
          </div>

          {/* الشريط السفلي: مبلغ الرحلة وزر التأكيد وزر الإنهاء كالصورة 2 */}
          <div className="border-t border-gray-100 p-6 bg-white">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[16px] font-black text-gray-900">
                {calculatedPrice.toLocaleString()} دينار
              </span>
              <span className="text-[15px] font-bold text-gray-600">مبلغ الرحلة</span>
            </div>

            <div className="flex items-center gap-4">
              {/* زر إنهاء */}
              <button
                type="button"
                onClick={() => setIsTripOptionsOpen(false)}
                className="py-3 px-4 text-center text-sm font-bold text-gray-600 hover:text-black transition cursor-pointer"
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
                className="flex-1 rounded-xl bg-gray-200 py-3 text-center text-sm font-bold text-gray-700 hover:bg-gray-300 transition active:scale-[0.98] cursor-pointer"
              >
                تأكيد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* نافذة إدخال القسيمة */}
      {isPromoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl animate-fade-in text-right">
            <h3 className="text-lg font-black text-gray-900 mb-2">🏷️ قسيمة الخصم</h3>
            <p className="text-xs font-bold text-gray-500 mb-4">أدخل كود القسيمة للحصول على خصم مباشر:</p>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={promoCodeInput}
                onChange={(e) => setPromoCodeInput(e.target.value)}
                placeholder="أدخل الكود (مثال: TAWSEELA20)"
                className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-xs font-bold text-right outline-none"
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
                className="rounded-xl bg-[#0026ff] px-4 py-2 text-xs font-bold text-white hover:bg-blue-700"
              >
                تطبيق
              </button>
            </div>
            <button
              type="button"
              onClick={() => setIsPromoModalOpen(false)}
              className="w-full rounded-xl bg-gray-100 py-2 text-center text-xs font-bold text-gray-700"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      {/* 9. نافذة البحث عن الأماكن */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-gray-100">
            <h2 className="text-[22px] font-black text-gray-900">
              {stage === 'pickup' ? 'الانطلاق' : 'الوصول'}
            </h2>
            <button
              type="button"
              onClick={() => {
                setIsSearchOpen(false);
                setSearchQuery('');
                setSearchResults([]);
              }}
              className="p-1 text-gray-600 transition hover:text-black cursor-pointer"
              aria-label="إغلاق"
            >
              <svg
                className="h-6 w-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="px-4 py-3">
            <div className="flex items-center rounded-2xl bg-[#f1f3f5] px-3.5 py-2.5">
              <button
                type="button"
                onClick={() => setIsCitySelectorOpen(true)}
                className="flex items-center gap-1.5 shrink-0 text-[13px] font-bold text-gray-700 pl-2 cursor-pointer hover:text-blue-600 transition"
                title="تغيير المدينة"
              >
                <span>{selectedCity}</span>
                <span className="text-[10px] text-gray-500">▼</span>
              </button>

              <div className="mx-2 h-5 w-[1px] bg-gray-300" />

              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={
                  stage === 'pickup' ? 'البحث من نقطة الانطلاق...' : 'البحث عن نقطة الوصول...'
                }
                className="flex-1 bg-transparent text-[14px] font-bold text-gray-900 outline-none placeholder-gray-400"
              />

              <button
                type="button"
                onClick={handleMicClick}
                className={`p-1 transition cursor-pointer ${
                  isListeningMic ? 'text-red-500 animate-pulse' : 'text-gray-500 hover:text-blue-600'
                }`}
                title="البحث الصوتي"
              >
                <svg
                  className="h-5 w-5"
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
          <div className="flex items-center gap-3 px-4 pb-4 overflow-x-auto no-scrollbar border-b border-gray-100">
            {QUICK_CHIPS.map((chip) => (
              <div
                key={chip.name}
                onClick={() => handleSelectPlace(chip)}
                className="flex items-center gap-2 rounded-full border border-gray-200 bg-[#f4f6fa] px-4 py-2 cursor-pointer transition active:scale-95 hover:bg-gray-100"
              >
                <span className="text-[13px] font-bold text-gray-800">{chip.name}</span>
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1e40af] text-white">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </div>
              </div>
            ))}
          </div>

          {/* قائمة الأماكن */}
          <div className="flex-1 overflow-y-auto px-4 py-2">
            {isSearchingPlaces && (
              <div className="flex items-center justify-center py-6 text-gray-400">
                <Spinner className="h-5 w-5 ml-2" />
                <span className="text-xs font-bold">جاري البحث في الأماكن...</span>
              </div>
            )}

            {searchQuery.trim().length > 0 && searchResults.length > 0 ? (
              <div>
                <p className="mb-2 text-[13px] font-bold text-gray-400">نتائج البحث</p>
                {searchResults.map((place, idx) => (
                  <div
                    key={`${place.lat}-${place.lon}-${idx}`}
                    onClick={() => handleSelectPlace({ name: place.name, lat: place.lat, lng: place.lon })}
                    className="flex items-center justify-between border-b border-gray-100 py-3.5 cursor-pointer hover:bg-gray-50 transition"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">📍</span>
                      <div>
                        <p className="text-[14px] font-bold text-gray-900">{place.name}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div>
                <p className="mb-3 text-[14px] font-bold text-gray-500">الأماكن الأخيرة</p>
                <div className="space-y-1">
                  {RECENT_PLACES.map((item) => (
                    <div
                      key={item.name}
                      onClick={() => handleSelectPlace(item)}
                      className="flex items-center justify-between border-b border-gray-100 py-3.5 cursor-pointer hover:bg-gray-50 transition"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-1 text-gray-400">
                          <svg
                            className="h-5 w-5"
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
                        <div>
                          <p className="text-[15px] font-black text-gray-900">{item.name}</p>
                          <p className="text-[12px] font-semibold text-gray-400 mt-0.5">{item.address}</p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          show(`تمت إضافة ${item.name} إلى المفضلة ⭐`, 'success');
                        }}
                        className="p-2 text-gray-400 transition hover:text-amber-500"
                        title="إضافة للمفضلة"
                      >
                        <svg
                          className="h-5 w-5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
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
        <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/60 backdrop-blur-[2px]">
          <div className="relative flex h-[82%] w-full flex-col rounded-t-[28px] bg-white pt-4 pb-2 shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between px-5 pb-3">
              <h3 className="text-[19px] font-bold text-gray-900">
                {stage === 'pickup' ? 'إختيار مدينة نقطة الانطلاق' : 'إختيار مدينة نقطة الوصول'}
              </h3>
              <button
                type="button"
                onClick={() => setIsCitySelectorOpen(false)}
                className="p-1 text-gray-600 transition hover:text-black cursor-pointer"
                aria-label="إغلاق"
              >
                <svg
                  className="h-6 w-6"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div className="px-5 mb-2">
              <div className="flex items-center rounded-2xl bg-[#f4f5f7] px-4 py-3">
                <svg
                  className="h-5 w-5 text-gray-400 shrink-0 ml-2"
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
                <input
                  type="text"
                  value={citySearchQuery}
                  onChange={(e) => setCitySearchQuery(e.target.value)}
                  placeholder="البحث في المدن..."
                  className="w-full bg-transparent text-[15px] font-bold text-gray-800 outline-none placeholder-gray-400 text-right"
                />
              </div>
            </div>

            <div className="px-5 py-3 border-b border-gray-100">
              <button
                type="button"
                onClick={handleSelectCurrentCity}
                className="flex items-center gap-3 text-[#0026ff] hover:text-[#001ed0] cursor-pointer transition active:scale-[0.99]"
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
                <span className="text-[16px] font-bold">مدينتك الحالية</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 divide-y divide-gray-100">
              {filteredCities.map((city) => (
                <div
                  key={city.id}
                  onClick={() => handleSelectCity(city)}
                  className="flex items-center justify-between py-3.5 cursor-pointer hover:bg-gray-50 transition active:scale-[0.99]"
                >
                  <div className="text-right">
                    <p className="text-[16px] font-bold text-gray-900">{city.name}</p>
                    <p className="text-[13px] font-semibold text-gray-400 mt-0.5">{city.sub}</p>
                  </div>
                  <div className="text-gray-400">
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

      {/* 11. درج الزبون الكامل مع "حول توصيلة" */}
      {isProfileOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white overflow-hidden" role="dialog" aria-modal="true">
          <div className="flex items-center px-5 pt-4 pb-2">
            <button
              type="button"
              onClick={() => setIsProfileOpen(false)}
              className="p-1 text-gray-600 hover:text-black cursor-pointer transition active:scale-95"
              aria-label="إغلاق الدرج"
            >
              <svg
                className="h-6 w-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div
            onClick={() => setActiveDrawerSubModal('settings')}
            className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50 transition border-b border-gray-100"
          >
            <div className="text-gray-400">
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

            <div className="flex items-center gap-4">
              <div className="text-right">
                <h3 className="text-[22px] font-black text-gray-900 leading-tight">{customerName}</h3>
                <p dir="ltr" className="text-[14px] font-bold text-gray-500 mt-1 font-sans tracking-wide">
                  {formattedPhone}
                </p>
              </div>

              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-gray-100 to-gray-200 border-2 border-white shadow-[0_4px_12px_rgba(0,0,0,0.08)] overflow-hidden">
                <svg className="h-12 w-12 text-gray-400 mt-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
            <div
              onClick={() => setActiveDrawerSubModal('wallet')}
              className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50 transition"
            >
              <div className="text-gray-400">
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
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-[17px] font-black text-gray-900">وسائل الدفع</p>
                  <p className="text-[13px] font-bold text-gray-500 mt-0.5">الرصيد: {walletBalance} دينار</p>
                </div>
                <div className="text-gray-600">
                  <svg
                    className="h-6 w-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="2" y="5" width="20" height="14" rx="2" />
                    <line x1="2" y1="10" x2="22" y2="10" />
                  </svg>
                </div>
              </div>
            </div>

            <div
              onClick={() => setActiveDrawerSubModal('trips')}
              className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50 transition"
            >
              <div />
              <div className="flex items-center gap-4">
                <p className="text-[17px] font-black text-gray-900">الرحلات</p>
                <div className="text-gray-600">
                  <svg
                    className="h-6 w-6"
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
              </div>
            </div>

            <div
              onClick={() => setActiveDrawerSubModal('favorites')}
              className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50 transition"
            >
              <div />
              <div className="flex items-center gap-4">
                <p className="text-[17px] font-black text-gray-900">العناوين المفضلة</p>
                <div className="text-gray-600">
                  <svg
                    className="h-6 w-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </div>
              </div>
            </div>

            <div
              onClick={() => setActiveDrawerSubModal('coupons')}
              className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50 transition"
            >
              <div />
              <div className="flex items-center gap-4">
                <p className="text-[17px] font-black text-gray-900">قسائم الخصومات والجوائز</p>
                <div className="text-gray-600">
                  <svg
                    className="h-6 w-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                    <line x1="7" y1="7" x2="7.01" y2="7" />
                  </svg>
                </div>
              </div>
            </div>

            <div
              onClick={() => setActiveDrawerSubModal('referral')}
              className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50 transition"
            >
              <div />
              <div className="flex items-center gap-4">
                <p className="text-[17px] font-black text-gray-900">إرسال دعوة لأصدقائك</p>
                <div className="text-gray-600">
                  <svg
                    className="h-6 w-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 12 20 22 4 22 4 12" />
                    <rect x="2" y="7" width="20" height="5" />
                    <line x1="12" y1="22" x2="12" y2="7" />
                    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                  </svg>
                </div>
              </div>
            </div>

            <div
              onClick={() => setActiveDrawerSubModal('settings')}
              className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50 transition"
            >
              <div />
              <div className="flex items-center gap-4">
                <p className="text-[17px] font-black text-gray-900">الإعدادات</p>
                <div className="text-gray-600">
                  <svg
                    className="h-6 w-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </div>
              </div>
            </div>

            <div
              onClick={() => setActiveDrawerSubModal('about')}
              className="flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-gray-50 transition"
            >
              <div />
              <div className="flex items-center gap-4">
                <p className="text-[17px] font-black text-gray-900">حول توصيلة</p>
                <div className="text-gray-600">
                  <svg
                    className="h-6 w-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <div
            onClick={() => setActiveDrawerSubModal('support')}
            className="flex items-center justify-between bg-[#f0f4ff] px-6 py-4 cursor-pointer hover:bg-blue-100/70 transition border-t border-blue-50"
          >
            <div />
            <div className="flex items-center gap-3.5">
              <div className="text-right">
                <h4 className="text-[15px] font-black text-gray-900">التواصل مع الدعم</h4>
                <p className="text-[13px] font-semibold text-gray-500 mt-0.5">
                  لأي مشاكل، يرجى التواصل معنا.
                </p>
              </div>
              <div className="text-[#0026ff]">
                <svg
                  className="h-7 w-7"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                  <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* نوافذ فرعية لدرج الزبون */}
      {activeDrawerSubModal !== 'none' && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl animate-fade-in text-right">
            {activeDrawerSubModal === 'wallet' && (
              <div>
                <h3 className="text-lg font-black text-gray-900 mb-2">💳 وسائل الدفع والرصيد</h3>
                <div className="my-4 rounded-2xl bg-blue-50 p-4 text-center">
                  <p className="text-xs font-bold text-blue-600">الرصيد المتاح</p>
                  <p className="text-2xl font-black text-[#0026ff] mt-1">{walletBalance} د.ع</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    show('تم شحن الرصيد تجريبياً بنجاح ✅', 'success');
                    setActiveDrawerSubModal('none');
                  }}
                  className="w-full rounded-xl bg-[#0026ff] py-2.5 text-center text-sm font-bold text-white shadow-md hover:bg-blue-700 cursor-pointer"
                >
                  شحن الرصيد
                </button>
              </div>
            )}

            {activeDrawerSubModal === 'trips' && (
              <div>
                <h3 className="text-lg font-black text-gray-900 mb-3">🕒 سجل الرحلات السابقة</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto mb-4">
                  <div className="rounded-xl border border-gray-100 p-3 bg-gray-50">
                    <p className="text-xs font-bold text-gray-500">12 أكتوبر 2026</p>
                    <p className="text-sm font-black text-gray-800">حي السلام ➔ كراج بغداد</p>
                    <p className="text-xs font-bold text-emerald-600 mt-1">مكتملة • 2,000 د.ع</p>
                  </div>
                </div>
              </div>
            )}

            {activeDrawerSubModal === 'favorites' && (
              <div>
                <h3 className="text-lg font-black text-gray-900 mb-3">⭐ العناوين المفضلة</h3>
                <div className="space-y-2 mb-4">
                  <div className="rounded-xl border border-gray-100 p-3 bg-gray-50">
                    <p className="text-sm font-black text-gray-800">المنزل 🏠</p>
                    <p className="text-xs font-semibold text-gray-500">النجف، حي السلام</p>
                  </div>
                </div>
              </div>
            )}

            {activeDrawerSubModal === 'coupons' && (
              <div>
                <h3 className="text-lg font-black text-gray-900 mb-3">🏷️ قسائم الخصومات والجوائز</h3>
                <p className="text-xs font-bold text-gray-500 mb-3">أدخل كود الخصم لتطبيقه على رحلتك القادمة.</p>
              </div>
            )}

            {activeDrawerSubModal === 'referral' && (
              <div className="text-center">
                <h3 className="text-lg font-black text-gray-900 mb-2">🎁 دعوة الأصدقاء</h3>
                <p className="text-xs font-bold text-gray-500 mb-4">
                  شارك كود الدعوة مع أصدقائك واحصل على خصم 20%!
                </p>
                <div className="rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50 py-3 mb-4">
                  <span className="font-mono text-xl font-black text-[#0026ff] tracking-widest">
                    TAXI-IQ-2026
                  </span>
                </div>
              </div>
            )}

            {activeDrawerSubModal === 'settings' && (
              <div>
                <h3 className="text-lg font-black text-gray-900 mb-3">⚙️ إعدادات الحساب</h3>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full rounded-xl bg-red-50 py-2.5 text-center text-xs font-bold text-red-600 hover:bg-red-100 transition cursor-pointer"
                >
                  تسجيل الخروج 🚪
                </button>
              </div>
            )}

            {activeDrawerSubModal === 'about' && (
              <div className="text-center">
                <h3 className="text-lg font-black text-gray-900 mb-2">ℹ️ حول منصة توصيلة</h3>
                <p className="text-xs font-bold text-gray-500 leading-relaxed mb-4">
                  تطبيق النقل الذكي الأول المخصص لمحافظة النجف الأشرف وجمهورية العراق.
                  <br />
                  الإصدار 1.0.0 (Release)
                </p>
              </div>
            )}

            {activeDrawerSubModal === 'support' && (
              <div>
                <h3 className="text-lg font-black text-gray-900 mb-2">🎧 التواصل مع الدعم</h3>
                <div className="space-y-2 mb-4">
                  <a
                    href="https://wa.me/9647706204066"
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-700"
                  >
                    <span>💬</span>
                    <span>مراسلة الدعم عبر واتساب</span>
                  </a>
                  <a
                    href="tel:07706204066"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0026ff] py-2.5 text-xs font-bold text-white hover:bg-blue-700"
                  >
                    <span>📞</span>
                    <span>اتصال مباشر بفريق الدعم</span>
                  </a>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setActiveDrawerSubModal('none')}
              className="mt-2 w-full rounded-xl bg-gray-100 py-2 text-center text-xs font-bold text-gray-700 hover:bg-gray-200 transition cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}


      {/* نافذة المحادثة المباشرة بين الراكب والسائق */}
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

    </div>
  );
}
