// صفحة حجز الخط الدائمي
// - خريطة كاملة مع سائقين ملونين حسب المسافة
// - أخضر < 500م | بنفسجي 500م-2كم | أحمر > 2كم
// - عند الضغط على سائق تظهر ورقة تفاصيله

import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Map as MapGL, Marker, type MapRef, type MapMouseEvent } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { http } from '../lib/api';
import { config } from '../lib/config';
import { useToast } from '../components/Toast';
import { distanceKm, getCurrentPositionWithFallback, isIosDevice, isStandalonePwa } from '../lib/geo';
import { authStore } from '../lib/auth';
import { storage } from '../lib/storage';
import { normalizePhoneLoose } from '../lib/phone';
import { AppDrawer } from '../components/AppDrawer';
import { RouteLines } from '../components/map/MapPins';
import { applyArabicAndEnhancedLabels, getDirections, searchPlaces, NAJAF_LOCAL_PLACES, type PlaceResult } from '../lib/mapbox';
import { sanitizeSearchQuery } from '../lib/sanitize';
import { realtime } from '../lib/realtime';

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

function getDriverColor(distKm: number): { bg: string; text: string; label: string } {
  if (distKm <= 0.5)  return { bg: '#16a34a', text: '#fff', label: 'أخضر (قريب جداً < 500م)' };
  if (distKm <= 2.0)  return { bg: '#7c3aed', text: '#fff', label: 'بنفسجي (بعيد)' };
  return               { bg: '#dc2626', text: '#fff', label: 'أحمر (بعيد جداً)' };
}

// سيارة صغيرة SVG ملوّنة
function CarSVG({ color }: { color: string }) {
  return (
    <svg width="36" height="20" viewBox="0 0 120 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 37C12 37 17 27 31 21C45 15 75 15 85 21C97 27 110 29 113 35C116 41 114 45 110 46H10C6 46 6 40 12 37Z" fill={color} />
      <path d="M34 19L44 8H72L84 19H34Z" fill="rgba(0,0,0,0.3)" />
      <path d="M36 18L44 10H57V18H36Z" fill="#bfdbfe" opacity="0.9" />
      <path d="M59 10H71L81 18H59V10Z" fill="#bfdbfe" opacity="0.9" />
      <circle cx="28" cy="45" r="9" fill="#111" /><circle cx="28" cy="45" r="5" fill="#fff" />
      <circle cx="92" cy="45" r="9" fill="#111" /><circle cx="92" cy="45" r="5" fill="#fff" />
    </svg>
  );
}

export default function DailyRoutePage() {
  const navigate = useNavigate();
  const { show } = useToast();
  const mapRef = useRef<MapRef | null>(null);
  const [userLoc, setUserLoc] = useState(USER_LOC);
  const [drivers, setDrivers] = useState<DriverItem[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<DriverItem | null>(null);
  const [isBooking, setIsBooking] = useState(false);
  const [subscribedDriverIds, setSubscribedDriverIds] = useState<Set<string>>(new Set());
  const [customerBookings, setCustomerBookings] = useState<any[]>([]);
  const [selectedDriverRoute, setSelectedDriverRoute] = useState<[number, number][] | null>(null);
  const notifiedRejectedBookingIdsRef = useRef<Set<string>>(new Set());

  // نافذة طلب إلغاء الاشتراك للراكب
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('تغير أوقات الدوام');
  const [cancelDetails, setCancelDetails] = useState('');
  const [isSubmittingCancel, setIsSubmittingCancel] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // حالة البحث الجغرافي الذكي للأحياء والمعالم في النجف
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimer = useRef<number | null>(null);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);

    const cleaned = sanitizeSearchQuery(val);
    if (!cleaned) {
      setSearchResults(NAJAF_LOCAL_PLACES);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchTimer.current = window.setTimeout(async () => {
      try {
        const results = await searchPlaces(cleaned, userLoc);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 350);
  };

  const handleSelectPlace = (place: PlaceResult) => {
    const newLoc = { lat: place.lat, lng: place.lon };
    setUserLoc(newLoc);
    mapRef.current?.flyTo({ center: [place.lon, place.lat], zoom: 14.5, duration: 800 });
    setIsSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    show(`تم تحديد موقعك في: ${place.name} 📍`, 'success');
  };

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
          'عذراً، تم الاعتذار عن قبول حجز الخط من قبل الكابتن. بإمكانك اختيار خط بديل أو إعادة المحاولة.',
          'warning',
          8000
        );
        setIsBooking(false);
      }
    },
    [show]
  );

  // جلب ومراقبة حجوزات الراكب عبر Polling والاتصال اللحظي Realtime
  useEffect(() => {
    const session = authStore.getSession();
    const customerId = session?.userId || storage.getUserId();
    const phone = storage.getPhone();
    const target = customerId || phone;
    if (!target) return;

    let mounted = true;

    const fetchBookings = () => {
      http
        .get<{ success?: boolean; bookings?: any[] }>(`/customer/${encodeURIComponent(target)}/bookings`)
        .then((res) => {
          if (!mounted) return;
          const bookings = res.data?.bookings || (Array.isArray(res.data) ? res.data : []);
          processBookings(bookings);
        })
        .catch(() => {});
    };

    fetchBookings();
    const pollInterval = setInterval(fetchBookings, 4000);

    // الاستماع الفوري لأي تحديث لحالة الحجز عبر Realtime
    const unsubStatus = realtime.onTripStatus((e) => {
      const status = String(e.status || '').toLowerCase();
      if (['rejected', 'declined', 'cancelled_by_driver'].includes(status)) {
        fetchBookings();
      }
    });

    return () => {
      mounted = false;
      clearInterval(pollInterval);
      unsubStatus();
    };
  }, [processBookings]);

  // رسم مسار الملاحة بنمط ويز عند اختيار كابتن خط دائمي
  useEffect(() => {
    if (!selectedDriver) {
      setSelectedDriverRoute(null);
      return;
    }
    let cancelled = false;
    getDirections(userLoc, { lat: selectedDriver.lat, lng: selectedDriver.lng })
      .then((res) => {
        if (!cancelled && res?.coordinates) {
          setSelectedDriverRoute(res.coordinates.map((c) => [c.lng, c.lat]));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedDriverRoute([
            [userLoc.lng, userLoc.lat],
            [selectedDriver.lng, selectedDriver.lat],
          ]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDriver, userLoc]);

  const isAlreadySubscribed = Boolean(
    selectedDriver &&
      (subscribedDriverIds.has(String(selectedDriver.driverId)) ||
        subscribedDriverIds.has(String(selectedDriver.id)) ||
        (selectedDriver.phone && subscribedDriverIds.has(normalizePhoneLoose(selectedDriver.phone))))
  );

  const matchingBooking = selectedDriver
    ? customerBookings.find((b: any) => {
        const sDriverId = String(selectedDriver.driverId || selectedDriver.id);
        const sPhone = normalizePhoneLoose(selectedDriver.phone || '');
        const bDriverId = String(b.driverId || b.driver_id || '');
        const bPhone = normalizePhoneLoose(b.driverPhone || '');
        const matches = (bDriverId && bDriverId === sDriverId) || (sPhone && bPhone && sPhone === bPhone);
        if (!matches) return false;
        const status = String(b.status || '').toLowerCase();
        return !['rejected', 'declined', 'cancelled_by_driver'].includes(status);
      })
    : null;

  const isCancellationPending = Boolean(
    matchingBooking &&
      (matchingBooking.status === 'cancellation_pending' ||
        Boolean(matchingBooking.cancellationPending) ||
        Boolean(matchingBooking.cancellation_requested) ||
        matchingBooking.cancellation_status === 'pending' ||
        Boolean(matchingBooking.cancellationReason || matchingBooking.cancellation_reason))
  );

  // جلب موقع المستخدم الحقيقي عبر GPS المتوافق مع iOS Safari
  useEffect(() => {
    getCurrentPositionWithFallback(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLoc(loc);
        mapRef.current?.flyTo({ center: [loc.lng, loc.lat], zoom: 14.2, duration: 800 });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 600000 }
    );
  }, []);

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

  function handleMapClick(e: MapMouseEvent) {
    const newLoc = { lat: e.lngLat.lat, lng: e.lngLat.lng };
    setUserLoc(newLoc);
    show('تم تحديد موقعك على الخريطة لحساب القرب من السائقين 📍', 'info');
  }

  // زر تحديد الموقع الحالي عبر الـ GPS المتوافق مع iOS Safari
  function handleUseCurrentLocation() {
    getCurrentPositionWithFallback(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLoc(loc);
        mapRef.current?.flyTo({ center: [loc.lng, loc.lat], zoom: 15, duration: 800 });
        show('تم تحديد موقعك الحالي 📍', 'success', 3000);
      },
      (_err, isPermissionDenied) => {
        if (isPermissionDenied) {
          const isIOS = isIosDevice();
          const isPWA = isStandalonePwa();
          show(
            isIOS
              ? isPWA
                ? 'يرجى السماح بالوصول للموقع من إعدادات الهاتف > الخصوصية > خدمات الموقع > تطبيق توصيلة'
                : 'يرجى السماح بالوصول للموقع من إعدادات الهاتف > الخصوصية > خدمات الموقع > Safari'
              : 'يرجى السماح للتطبيق بالوصول إلى موقعك من إعدادات المتصفح',
            'warning',
            5000
          );
        } else {
          show('تعذر تحديد الموقع الحالي عبر GPS، يمكنك سحب الخريطة لتحديده 📍', 'warning', 5000);
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 600000 }
    );
  }

  // إرسال طلب حجز مقعد في الخط الدائمي للكابتن
  async function handleBookSeat() {
    if (!selectedDriver || isBooking || isAlreadySubscribed) return;
    setIsBooking(true);
    try {
      const session = authStore.getSession();
      const customerId = session?.userId || storage.getUserId() || 'cust-' + Date.now();
      const customerName = session?.fullName || storage.getFullName() || 'راكب توصيلة';
      const customerPhone = storage.getPhone() || '';

      const { data } = await http.post<{ success: boolean; message?: string; error?: string }>('/bookings', {
        driverId: String(selectedDriver.driverId || selectedDriver.id),
        driverName: selectedDriver.name,
        driverPhone: selectedDriver.phone,
        customerId,
        customerName,
        customerPhone,
        pickupLocation: selectedDriver.from || 'موقع الراكب',
        dropoffLocation: selectedDriver.to || 'الوجهة',
        pickupLat: userLoc.lat,
        pickupLon: userLoc.lng,
        seats: 1,
        seatsBooked: 1,
      });

      if (data?.success) {
        show('تم إرسال طلب حجز المقعد للكابتن بنجاح! 🚖 بانتظار موافقة الكابتن لتأكيد الحجز.', 'success', 6000);
        const dId = String(selectedDriver.driverId || selectedDriver.id);
        setSubscribedDriverIds((prev) => {
          const next = new Set(prev);
          next.add(dId);
          if (selectedDriver.phone) next.add(normalizePhoneLoose(selectedDriver.phone));
          return next;
        });
        setSelectedDriver(null);
      } else {
        show(data?.error || 'تعذر إرسال طلب الحجز', 'error');
      }
    } catch (err: any) {
      if (err?.response?.status === 409) {
        show(
          err?.response?.data?.error || 'أنت مشترك بالفعل في هذا الخط، لا يمكنك تكرار الحجز.',
          'warning',
          6000
        );
        if (selectedDriver) {
          const dId = String(selectedDriver.driverId || selectedDriver.id);
          setSubscribedDriverIds((prev) => {
            const next = new Set(prev);
            next.add(dId);
            if (selectedDriver.phone) next.add(normalizePhoneLoose(selectedDriver.phone));
            return next;
          });
        }
      } else {
        const msg = err?.response?.data?.error || 'حدث خطأ في الاتصال أثناء إرسال طلب الحجز';
        show(msg, 'error');
      }
    } finally {
      setIsBooking(false);
    }
  }

  // إرسال طلب إلغاء الاشتراك في الخط الدائمي إلى الكابتن
  async function handleRequestCancellation() {
    if (!selectedDriver) return;
    setIsSubmittingCancel(true);
    try {
      const session = authStore.getSession();
      const customerId = session?.userId || storage.getUserId() || '';
      const customerPhone = storage.getPhone() || '';
      const bookingId = matchingBooking?.id || matchingBooking?.bookingId;
      const targetDriverId = String(selectedDriver.driverId || selectedDriver.id || selectedDriver.phone || '');

      const { data } = await http.post<{ success: boolean; message?: string; request?: any }>('/customer/request-route-cancellation', {
        bookingId: bookingId || undefined,
        customerId,
        customerPhone,
        driverId: targetDriverId,
        routeId: selectedDriver.routeId || matchingBooking?.routeId || undefined,
        route: selectedDriver.from && selectedDriver.to ? `${selectedDriver.from} ➔ ${selectedDriver.to}` : undefined,
        reason: cancelReason,
        details: cancelDetails.trim(),
      });

      if (data?.success) {
        show('تم إرسال طلب الإلغاء للسائق للمراجعة ✅', 'success', 5000);
        setIsCancelModalOpen(false);
        const resolvedBookingId = bookingId || data?.request?.bookingId || 'bk-cancel-pending';
        setCustomerBookings((prev) => [
          ...prev.filter((b) => b.id !== resolvedBookingId && b.bookingId !== resolvedBookingId),
          {
            ...(matchingBooking || {}),
            id: resolvedBookingId,
            bookingId: resolvedBookingId,
            driverId: targetDriverId,
            status: 'cancellation_pending',
            cancellationPending: true,
            cancellation_requested: true,
            cancellation_status: 'pending',
            cancellationReason: cancelReason,
            cancellation_reason: cancelReason,
            cancellationDetails: cancelDetails.trim(),
            cancellation_details: cancelDetails.trim(),
          },
        ]);
      } else {
        show('تعذر إرسال طلب الإلغاء', 'error');
      }
    } catch (err: any) {
      show(err?.response?.data?.error || 'حدث خطأ أثناء إرسال طلب الإلغاء', 'error');
    } finally {
      setIsSubmittingCancel(false);
    }
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden font-cairo text-right select-none" dir="rtl">

      {/* الترويسة العلوية العائمة مع حماية كاملة لهوامش الأمان على iOS */}
      <div className="fixed top-0 inset-x-0 max-w-md mx-auto z-40 px-4 pt-[calc(0.75rem+env(safe-area-inset-top,1rem))] pb-3 flex items-center justify-between pointer-events-none">
        {/* زر الرئيسية / الرجوع */}
        <div className="pointer-events-auto">
          <button
            type="button"
            onClick={() => navigate('/login')}
            className="w-10 h-10 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center justify-center text-[#1B4965] hover:text-[#14364A] hover:border-slate-300 transition-all active:scale-95 cursor-pointer"
            title="الرئيسية"
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
        </div>

        {/* عنوان التبويب */}
        <div className="pointer-events-auto">
          <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/95 backdrop-blur-md border border-slate-200/80 shadow-sm text-slate-800 text-[13px] font-bold">
            <span>حجز خط دائمي</span>
            <span>🚌</span>
          </div>
        </div>

        {/* زر الحساب والقائمة */}
        <div className="pointer-events-auto">
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="w-10 h-10 rounded-2xl bg-white border border-slate-200/80 shadow-sm flex items-center justify-center text-slate-700 hover:text-slate-900 hover:border-slate-300 transition-all active:scale-95 cursor-pointer"
            title="الحساب والإعدادات"
            aria-label="الحساب"
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
      </div>

      {/* شريط البحث الجغرافي السريع عن الأحياء والمعالم بالنجف */}
      <div className="absolute top-[calc(4.5rem+env(safe-area-inset-top,0.75rem))] inset-x-4 z-20 pointer-events-auto max-w-md mx-auto font-map-search">
        <div
          onClick={() => {
            setIsSearchOpen(true);
            if (!searchQuery) setSearchResults(NAJAF_LOCAL_PLACES);
          }}
          className="flex items-center gap-2.5 bg-white/95 backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-md border border-slate-200/80 cursor-pointer active:scale-[0.99] transition hover:border-amber-400"
        >
          <span className="text-amber-500">🔍</span>
          <span className="text-[13px] text-slate-500 font-medium truncate flex-1 font-map-search">
            {searchQuery ? searchQuery : 'ابحث عن حي، معلم، فندق أو شارع بالنجف...'}
          </span>
          {isSearchOpen && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsSearchOpen(false);
              }}
              className="text-slate-400 hover:text-slate-600 text-sm font-bold"
            >
              ✕
            </button>
          )}
        </div>

        {/* نافذة وقائمة نتائج البحث المنبثقة */}
        {isSearchOpen && (
          <div className="mt-2 bg-white rounded-2xl shadow-xl border border-slate-200 p-3 max-h-72 overflow-y-auto space-y-1 font-map-search">
            <input
              autoFocus
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="اكتب اسم الحي أو المعلم (مثل: حي الأنصار، قصر الدر)..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-amber-500 mb-2 font-map-search"
            />
            {isSearching && (
              <div className="text-center py-3 text-xs text-slate-500 font-semibold font-map-search flex items-center justify-center gap-2">
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
                <span>جاري البحث في معالم وأحياء النجف...</span>
              </div>
            )}
            {!isSearching && searchResults.length > 0 && (
              <div className="space-y-1">
                {searchQuery.trim().length > 0 && (
                  <p className="text-[11px] font-bold text-slate-400 px-1 mb-1">
                    نتائج البحث ({searchResults.length})
                  </p>
                )}
                {searchResults.map((p, idx) => (
                  <div
                    key={`${p.lat}-${p.lon}-${idx}`}
                    onClick={() => handleSelectPlace(p)}
                    className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-amber-50/70 cursor-pointer transition border-b border-slate-50 last:border-none font-map-search"
                  >
                    <span className="text-amber-500 shrink-0">📍</span>
                    <div className="flex flex-col text-right truncate">
                      <span className="text-[13.5px] font-bold text-slate-800 truncate">{p.name}</span>
                      <span className="text-[11px] text-slate-500 truncate">{p.subName || 'النجف الأشرف'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!isSearching && searchResults.length === 0 && searchQuery.trim().length > 0 && (
              <div className="text-center py-6 px-3">
                <p className="text-[13px] font-bold text-slate-700">لم يتم العثور على نتائج تطابق بحثك</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  تأكد من كتابة اسم المعلم أو الحي بدقة
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* الخريطة */}
      <MapGL
        ref={mapRef}
        mapboxAccessToken={config.mapboxToken}
        mapStyle={config.mapStyle}
        initialViewState={{ longitude: userLoc.lng, latitude: userLoc.lat, zoom: 14 }}
        onClick={handleMapClick}
        onLoad={(e) => applyArabicAndEnhancedLabels(e.target)}
        style={{ width: '100%', height: '100%' }}
      >
        {/* مسار الملاحة بنمط ويز بين الراكب وسائق الخط الدائمي */}
        {selectedDriverRoute && selectedDriverRoute.length > 0 && (
          <RouteLines
            lines={[
              {
                id: 'daily-route-line',
                coordinates: selectedDriverRoute,
                color: '#3b82f6',
              },
            ]}
          />
        )}

        {/* موقع الراكب */}
        <Marker longitude={userLoc.lng} latitude={userLoc.lat} anchor="center">
          <div className="flex flex-col items-center">
            <div className="h-5 w-5 rounded-full bg-[#f97316] border-3 border-white shadow-lg animate-pulse" />
            <div className="mt-1 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-black text-white">موقعك</div>
          </div>
        </Marker>

        {/* السائقون مع الألوان والمسافات الدقيقة */}
        {drivers.map(driver => {
          const dist = distanceKm({ lat: userLoc.lat, lng: userLoc.lng }, { lat: driver.lat, lng: driver.lng });
          const { bg } = getDriverColor(dist);
          const isSelected = selectedDriver?.id === driver.id;
          const distLabel = dist < 1 ? `${Math.round(dist * 1000)}م` : `${dist.toFixed(1)}كم`;
          return (
            <Marker key={driver.id} longitude={driver.lng} latitude={driver.lat} anchor="bottom">
              <div className="flex flex-col items-center cursor-pointer transition-transform hover:scale-110 active:scale-95" onClick={(e) => { e.stopPropagation(); setSelectedDriver(driver); }}>
                {/* اسم السائق + المسافة */}
                <div className="mb-0.5 flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-black text-white shadow-md"
                  style={{ backgroundColor: bg, outline: isSelected ? '2px solid white' : 'none' }}>
                  <span>{isSelected && '✓ '}{driver.name}</span>
                  <span className="text-[10px] font-sans opacity-95">({distLabel})</span>
                </div>
                <CarSVG color={bg} />
              </div>
            </Marker>
          );
        })}
      </MapGL>

      {/* زر تحديد الموقع الحالي عبر الـ GPS */}
      <button
        type="button"
        onClick={handleUseCurrentLocation}
        className={`absolute ${selectedDriver ? 'bottom-28' : 'bottom-60'} right-4 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-white text-gray-800 shadow-[0_4px_16px_rgba(0,0,0,0.18)] transition-all active:scale-95 cursor-pointer hover:bg-gray-50`}
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

      {/* مفتاح الألوان */}
      {!selectedDriver && (
        <div className="absolute bottom-28 right-4 z-20 rounded-2xl bg-white px-4 py-3 shadow-[0_4px_20px_rgba(0,0,0,0.15)]">
          <p className="text-[13px] font-black text-gray-900 mb-2">الخريطة</p>
          {[
            { color: '#16a34a', label: 'أخضر (قريب جداً < 500م)' },
            { color: '#7c3aed', label: 'بنفسجي (بعيد)' },
            { color: '#dc2626', label: 'أحمر (بعيد جداً)' },
          ].map(item => (
            <div key={item.color} className="flex items-center gap-2 mb-1">
              <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-[11px] font-bold text-gray-700">{item.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* الزر السفلي الافتراضي */}
      {!selectedDriver && (
        <div className="absolute inset-x-0 bottom-0 z-20 bg-white px-5 pt-3 pb-8 shadow-sheet rounded-t-2xl border-t border-slate-100">
          <div className="flex justify-center mb-3"><div className="h-1 w-10 rounded-full bg-slate-200" /></div>
          <button type="button" onClick={() => show('اختر سائقاً من الخريطة أولاً', 'info')}
            className="w-full rounded-xl bg-[#1B4965] py-3.5 text-center text-[16px] font-bold text-white shadow-subtle cursor-pointer hover:bg-[#14364A] transition-all duration-200 ease-in-out active:scale-[0.98]">
            تأكيد نقطة الانطلاق
          </button>
        </div>
      )}

      {/* ورقة تفاصيل السائق */}
      {selectedDriver && (() => {
        const dist = distanceKm({ lat: userLoc.lat, lng: userLoc.lng }, { lat: selectedDriver.lat, lng: selectedDriver.lng });
        const { bg, label } = getDriverColor(dist);
        const remaining = selectedDriver.seats - selectedDriver.takenSeats;
        const distLabel = dist < 1 ? `${Math.round(dist * 1000)} متر` : `${dist.toFixed(1)} كم`;
        return (
          <div className="absolute inset-x-0 bottom-0 z-30 rounded-t-[24px] bg-[#1e1e2e] text-white pb-8 shadow-[0_-8px_30px_rgba(0,0,0,0.3)] animate-fade-in">
            <div className="flex justify-center pt-3 mb-1 cursor-pointer" onClick={() => setSelectedDriver(null)}>
              <div className="h-1 w-10 rounded-full bg-white/30" />
            </div>

            {/* صف السائق */}
            <div className="flex items-center justify-between px-5 pt-2 pb-3 border-b border-white/10">
              <div>
                <p className="text-[19px] font-black">{selectedDriver.name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: bg }} />
                  <span className="text-[12px] font-bold" style={{ color: bg }}>
                    يبعد عنك {distLabel} — {label}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* أفاتار */}
                <div className="h-14 w-14 rounded-full bg-blue-500 flex items-center justify-center text-[24px]">🧑‍✈️</div>
              </div>
            </div>

            {/* تقييم + لوحة + سيارة */}
            <div className="flex items-center gap-4 px-5 py-3 border-b border-white/10">
              <div className="flex flex-col items-center gap-1">
                <span className="text-[13px] font-bold text-yellow-400">⭐ {selectedDriver.rating}</span>
                <div className="rounded-lg border border-white/40 px-2 py-1 text-center">
                  <p className="text-[11px] font-black tracking-wide">{selectedDriver.plate}</p>
                </div>
              </div>
              <CarSVG color={bg} />
              <div className="flex-1 text-right">
                <div className="flex items-center justify-end gap-1 mb-1">
                  <span className="text-[13px] font-bold">{selectedDriver.from}</span>
                  <div className="h-2.5 w-2.5 rounded-full bg-blue-400" />
                  <span className="text-[11px] text-white/50">من:</span>
                </div>
                <div className="flex items-center justify-end gap-1">
                  <span className="text-[13px] font-bold">{selectedDriver.to}</span>
                  <div className="h-2.5 w-2.5 rounded-full bg-white/60" />
                  <span className="text-[11px] text-white/50">إلى:</span>
                </div>
              </div>
            </div>

            {/* مقاعد */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
              <div className="flex gap-1">
                {Array.from({ length: selectedDriver.seats }).map((_, i) => (
                  <svg key={i} className={`h-6 w-6 ${i < selectedDriver.takenSeats ? 'text-white/30' : 'text-white'}`} viewBox="0 0 24 24" fill="currentColor"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <div className="rounded-full px-3 py-1 text-[12px] font-bold" style={{ backgroundColor: remaining > 0 ? '#16a34a' : '#dc2626' }}>
                  {remaining > 0 ? `متبقي ${remaining === 1 ? 'مقعد' : remaining === 2 ? 'مقعدين' : `${remaining} مقاعد`}` : 'مكتمل'}
                </div>
                <p className="text-[12px] text-white/50">الراكب المطلوبة: {selectedDriver.takenSeats} / {selectedDriver.seats}</p>
              </div>
            </div>

            {/* أزرار حجز المقعد والتواصل */}
            <div className="flex flex-col gap-2.5 px-5 pt-4">
              {isCancellationPending ? (
                <div className="space-y-2">
                  <div className="w-full rounded-xl bg-amber-500/25 border border-amber-400/50 py-3.5 text-center text-[14.5px] font-black text-amber-300 flex items-center justify-center gap-2 shadow-xs">
                    <span>طلب الإلغاء قيد مراجعة الكابتن</span>
                    <span className="text-[17px] animate-pulse">⏳</span>
                  </div>
                  <p className="rounded-lg bg-amber-500/15 border border-amber-500/30 px-3 py-1.5 text-center text-[12px] font-semibold text-amber-200">
                    تم إرسال طلبك ({matchingBooking?.cancellationReason || cancelReason}) وبانتظار مراجعة الكابتن.
                  </p>
                </div>
              ) : isAlreadySubscribed ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    disabled
                    className="w-full rounded-xl bg-gray-600/90 py-3.5 text-center text-[15px] font-black text-white/90 shadow-none cursor-not-allowed flex items-center justify-center gap-2 border border-white/10"
                  >
                    <span>مشترك بالفعل في هذا الخط</span>
                    <span className="text-[17px]">✅</span>
                  </button>
                  <p className="rounded-lg bg-amber-500/15 border border-amber-500/30 px-3 py-1.5 text-center text-[12px] font-bold text-amber-300">
                    أنت مسجل بالفعل في هذا الخط. يمكنك التواصل المباشر مع الكابتن أدناه.
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsCancelModalOpen(true)}
                    className="w-full rounded-xl border border-red-500/40 bg-red-500/15 hover:bg-red-500/25 py-2.5 text-center text-[13px] font-bold text-red-300 transition active:scale-95 cursor-pointer"
                  >
                    طلب إلغاء الاشتراك في الخط ✕
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isBooking}
                  onClick={handleBookSeat}
                  className="w-full rounded-xl bg-emerald-600 py-3.5 text-center text-[16px] font-black text-white shadow-[0_6px_20px_rgba(16,185,129,0.35)] cursor-pointer hover:bg-emerald-700 active:scale-[0.98] transition flex items-center justify-center gap-2 disabled:opacity-70"
                >
                  {isBooking ? (
                    <span className="animate-pulse">جاري إرسال طلب الحجز للكابتن...</span>
                  ) : (
                    <>
                      <span>حجز مقعد</span>
                      <span className="text-[18px]">💺</span>
                    </>
                  )}
                </button>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedDriver.phone) window.open(`tel:${selectedDriver.phone}`);
                    else show('رقم هاتف السائق غير متوفر', 'info');
                  }}
                  className="flex-1 flex h-11 items-center justify-center gap-1.5 rounded-xl border border-white/30 text-white text-[13px] font-bold cursor-pointer hover:bg-white/10 active:scale-95 transition"
                >
                  <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.95 12a19.79 19.79 0 0 1-3-8.59A2 2 0 0 1 4 1.37h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  <span>اتصال</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedDriver.phone) {
                      const text = encodeURIComponent(`مرحباً كابتن ${selectedDriver.name}، أود الاستفسار عن الخط الدائمي.`);
                      window.open(`https://wa.me/${selectedDriver.phone}?text=${text}`, '_blank');
                    } else {
                      show('رقم هاتف السائق غير متوفر', 'info');
                    }
                  }}
                  className="flex-1 flex h-11 items-center justify-center gap-1.5 rounded-xl border border-white/30 text-white text-[13px] font-bold cursor-pointer hover:bg-white/10 active:scale-95 transition"
                >
                  <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <span>واتساب</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* نافذة طلب إلغاء الاشتراك في الخط الدائمي */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-fade-in" dir="rtl">
          <div className="w-full max-w-md rounded-2xl bg-[#1e293b] border border-white/10 p-5 shadow-2xl text-right text-white space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-[16px] font-black">طلب إلغاء الاشتراك في الخط</h3>
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                className="rounded-full p-1 text-white/50 hover:bg-white/10 transition cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-[13px] text-white/70">
              يرجى تحديد سبب الإلغاء لمراجعته مع الكابتن ({selectedDriver?.name}):
            </p>

            {/* الأسباب الجاهزة */}
            <div className="space-y-2">
              {[
                'تغير أوقات الدوام',
                'العثور على بديل',
                'عدم التزام السائق',
                'ظروف شخصية',
                'أخرى',
              ].map((r) => (
                <label
                  key={r}
                  onClick={() => setCancelReason(r)}
                  className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                    cancelReason === r
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold'
                      : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'
                  }`}
                >
                  <span className="text-[13.5px]">{r}</span>
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
              <label className="block text-[12.5px] font-bold text-white/80 mb-1">
                تفاصيل إضافية (اختياري):
              </label>
              <textarea
                rows={2}
                value={cancelDetails}
                onChange={(e) => setCancelDetails(e.target.value)}
                placeholder="أدخل أي تفاصيل إضافية لمشاركتها مع الكابتن والإدارة..."
                className="w-full rounded-xl bg-white/5 border border-white/15 p-2.5 text-[13px] text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                className="flex-1 rounded-xl bg-white/10 hover:bg-white/20 py-3 text-center text-[13.5px] font-bold text-white transition active:scale-95 cursor-pointer"
              >
                تراجع
              </button>
              <button
                type="button"
                disabled={isSubmittingCancel}
                onClick={handleRequestCancellation}
                className="flex-1 rounded-xl bg-red-600 hover:bg-red-700 py-3 text-center text-[14px] font-black text-white shadow-md transition active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {isSubmittingCancel ? 'جاري الإرسال...' : 'تأكيد طلب الإلغاء ✕'}
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
