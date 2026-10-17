// صفحة حجز الخط الدائمي
// - خريطة كاملة مع سائقين ملونين حسب المسافة
// - أخضر < 500م | بنفسجي 500م-2كم | أحمر > 2كم
// - عند الضغط على سائق تظهر ورقة تفاصيله

import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Map as MapGL, Marker, type MapRef, type MapMouseEvent } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { http } from '../lib/api';
import { config } from '../lib/config';
import { useToast } from '../components/Toast';
import { distanceKm } from '../lib/geo';
import { authStore } from '../lib/auth';
import { storage } from '../lib/storage';

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

  // جلب موقع المستخدم الحقيقي عبر GPS
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setUserLoc(loc);
          mapRef.current?.flyTo({ center: [loc.lng, loc.lat], zoom: 14.2, duration: 800 });
        },
        () => {},
        { timeout: 8000 }
      );
    }
  }, []);

  // جلب سائقي الخط الدائمي الحقيقيين من الخادم
  useEffect(() => {
    http
      .get<any[]>(`/drivers/nearby?lat=${userLoc.lat}&lon=${userLoc.lng}&tripType=daily&rangeKm=50`)
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : [];
        const mapped: DriverItem[] = data.map((d: any, idx: number) => {
          const dLat = Number(d.permanentLat ?? d.latitude ?? d.currentLat ?? (userLoc.lat + 0.003 * (idx + 1)));
          const dLng = Number(d.permanentLon ?? d.longitude ?? d.currentLon ?? (userLoc.lng + 0.002 * (idx + 1)));
          return {
            id: d.driverId || idx + 1,
            driverId: d.driverId || `d-${idx}`,
            name: d.driverName || d.fullName || 'كابتن توصيله',
            lat: dLat,
            lng: dLng,
            from: d.permanentLocationName || d.routeStartName || 'المركز',
            to: d.permanentDropoffName || d.routeEndName || 'جامعة الكوفة',
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

  // زر تحديد الموقع الحالي عبر الـ GPS
  function handleUseCurrentLocation() {
    if (!navigator.geolocation) {
      show('خاصية تحديد الموقع غير مدعومة في هذا المتصفح', 'warning');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLoc(loc);
        mapRef.current?.flyTo({ center: [loc.lng, loc.lat], zoom: 15, duration: 800 });
        show('تم تحديد موقعك الحالي 📍', 'success');
      },
      () => {
        show('تعذر تحديد الموقع الحالي، يرجى تفعيل الـ GPS', 'warning');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  // إرسال طلب حجز مقعد في الخط الدائمي للكابتن
  async function handleBookSeat() {
    if (!selectedDriver) return;
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
        setSelectedDriver(null);
      } else {
        show(data?.error || 'تعذر إرسال طلب الحجز', 'error');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'حدث خطأ في الاتصال أثناء إرسال طلب الحجز';
      show(msg, 'error');
    } finally {
      setIsBooking(false);
    }
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden font-cairo select-none" dir="rtl">

      {/* زر الرجوع */}
      <button type="button" onClick={() => navigate('/login')}
        className="absolute top-4 right-4 z-20 flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-[0_4px_16px_rgba(0,0,0,0.15)] text-gray-700 cursor-pointer hover:bg-gray-50 active:scale-95">
        <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>

      {/* الخريطة */}
      <MapGL
        ref={mapRef}
        mapboxAccessToken={config.mapboxToken}
        mapStyle={config.mapStyle}
        initialViewState={{ longitude: userLoc.lng, latitude: userLoc.lat, zoom: 14 }}
        onClick={handleMapClick}
        style={{ width: '100%', height: '100%' }}
      >
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
    </div>
  );
}
