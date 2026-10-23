import React, { useState, useEffect, useRef } from 'react';

export interface RideMapBookingProps {
  mode: 'instant' | 'commute'; // تكسي فوري أو خط دائمي
  onBack: () => void;
  onConfirmPickup: (location: { lat: number; lng: number; address: string }) => void;
  onConfirmDropoff?: (location: { lat: number; lng: number; address: string }) => void;
  onRequestRide?: (tier: 'saving' | 'vip' | 'super', details: {
    pickup: { lat: number; lng: number; address: string };
    dropoff: { lat: number; lng: number; address: string };
  }) => void;
  onRequestCommute?: (details: {
    pickup: { lat: number; lng: number; address: string };
    dropoff: { lat: number; lng: number; address: string };
    shift: string;
  }) => void;
  onOpenDrawer?: () => void;
  initialPickupAddress?: string;
  initialDropoffAddress?: string;
  isSubscribed?: boolean;
  subscriptionInfo?: string;
  onManageSubscription?: () => void;
}

// قائمة المعالم الرئيسية في العراق للعرض التوضيحي
const IRAQ_PLACES = [
  { name: 'مركز العاصمة بغداد', sub: 'بغداد، ساحة التحرير', lat: 33.3152, lng: 44.3661, icon: '📍' },
  { name: 'مرقد الإمام علي (ع)', sub: 'المدينة القديمة، النجف الأشرف', lat: 31.9959, lng: 44.3142, icon: '🕌' },
  { name: 'مطار بغداد الدولي', sub: 'طريق المطار، بغداد', lat: 33.2625, lng: 44.2344, icon: '✈️' },
  { name: 'جامعة بغداد', sub: 'الجادرية، بغداد', lat: 33.2711, lng: 44.3789, icon: '🎓' },
  { name: 'كورنيش شط العرب', sub: 'البصرة، العشار', lat: 30.5150, lng: 47.8420, icon: '🌊' },
  { name: 'قلعة أربيل', sub: 'مركز مدينة أربيل', lat: 36.1911, lng: 44.0092, icon: '🏰' },
];
const NAJAF_PLACES = IRAQ_PLACES;

export const RideMapBookingView: React.FC<RideMapBookingProps> = ({
  mode,
  onBack,
  onConfirmPickup,
  onConfirmDropoff,
  onRequestRide,
  onRequestCommute,
  onOpenDrawer,
  initialPickupAddress = 'حدد نقطة الانطلاق على الخريطة',
  initialDropoffAddress = 'حدد الوجهة على الخريطة',
  isSubscribed = false,
  subscriptionInfo,
  onManageSubscription,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [pickupStep, setPickupStep] = useState<'select_pickup' | 'select_dropoff' | 'confirm'>('select_pickup');
  const [selectedTier, setSelectedTier] = useState<'saving' | 'vip' | 'super'>('saving');
  const [commuteShift, setCommuteShift] = useState<'morning_730' | 'morning_800' | 'afternoon_1400'>('morning_730');
  const [pickupLoc, setPickupLoc] = useState({ lat: 33.3152, lng: 44.3661, address: initialPickupAddress });
  const [dropoffLoc, setDropoffLoc] = useState({ lat: 33.3250, lng: 44.3750, address: initialDropoffAddress });
  
  // الوضع النهاري والليلي
  const [isDayMode, setIsDayMode] = useState(false);

  // إزاحة وسحب الخريطة التفاعلية (Draggable Map Panning)
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const currentPanRef = useRef({ x: 0, y: 0 });

  // قائمة البحث المنسدلة العائمة
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showSosAlert, setShowSosAlert] = useState(false);
  const [isGpsActive, setIsGpsActive] = useState(false);

  // 1. التموضع والتحديد التلقائي للموقع عند فتح الخريطة (Auto-GPS on Mount)
  useEffect(() => {
    if ('geolocation' in navigator) {
      setIsGpsActive(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setPickupLoc({
            lat,
            lng,
            address: 'موقعك الحالي عبر الـ GPS 📍',
          });
          setMapPan({ x: 0, y: 0 });
          currentPanRef.current = { x: 0, y: 0 };
          setIsGpsActive(false);
        },
        () => setIsGpsActive(false),
        { enableHighAccuracy: true, timeout: 6000 }
      );
    }
  }, []);

  // محرك تسعيرة «بلي» القياسي بالنجف:
  // فتح العداد 1,000 د.ع + 500 د.ع/كم + 100 د.ع/دقيقة، الحد الأدنى 3,000 د.ع، وتقريب لأقرب 250 د.ع
  const calculateTierPrice = (tier: 'saving' | 'vip' | 'super') => {
    if (tier === 'saving') return 3000;
    if (tier === 'vip') return 4250;
    return 3750; // super
  };

  // تصفية نتائج البحث لحظياً عند كتابة أي حرف
  const filteredPlaces = NAJAF_PLACES.filter((p) => {
    if (!searchQuery.trim()) return true;
    return p.name.includes(searchQuery.trim()) || p.sub.includes(searchQuery.trim());
  });

  const handleSelectPlace = (place: typeof NAJAF_PLACES[0]) => {
    if (pickupStep === 'select_pickup') {
      setPickupLoc({ lat: place.lat, lng: place.lng, address: place.name });
    } else {
      setDropoffLoc({ lat: place.lat, lng: place.lng, address: place.name });
    }
    setSearchQuery(place.name);
    setIsSearchFocused(false);
    // إزاحة مركز الخريطة بنعومة نحو المعلم المحدد
    setMapPan({ x: (place.lng - 44.33) * 800, y: (32.03 - place.lat) * 800 });
  };

  const handleRecenter = () => {
    setIsGpsActive(true);
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setPickupLoc({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            address: 'موقعك الحالي عبر الـ GPS 📍',
          });
          setMapPan({ x: 0, y: 0 });
          currentPanRef.current = { x: 0, y: 0 };
          setIsGpsActive(false);
        },
        () => {
          setMapPan({ x: 0, y: 0 });
          setIsGpsActive(false);
        },
        { enableHighAccuracy: true, timeout: 6000 }
      );
    } else {
      setMapPan({ x: 0, y: 0 });
      setTimeout(() => setIsGpsActive(false), 500);
    }
  };

  const handleBackClick = () => {
    if (mode === 'instant') {
      if (pickupStep === 'confirm') {
        setPickupStep('select_dropoff');
        return;
      }
      if (pickupStep === 'select_dropoff') {
        setPickupStep('select_pickup');
        return;
      }
    }
    onBack();
  };

  const handleMainActionClick = () => {
    if (mode === 'instant') {
      if (pickupStep === 'select_pickup') {
        onConfirmPickup(pickupLoc);
        setPickupStep('select_dropoff');
        setSearchQuery('');
      } else if (pickupStep === 'select_dropoff') {
        if (onConfirmDropoff) onConfirmDropoff(dropoffLoc);
        setPickupStep('confirm');
      } else {
        if (onRequestRide) {
          onRequestRide(selectedTier, { pickup: pickupLoc, dropoff: dropoffLoc });
        } else {
          onConfirmPickup(pickupLoc);
        }
      }
    } else {
      // Commute mode
      if (onRequestCommute) {
        onRequestCommute({
          pickup: pickupLoc,
          dropoff: dropoffLoc,
          shift: commuteShift,
        });
      } else {
        onConfirmPickup(pickupLoc);
      }
    }
  };

  // معالجات سحب الخريطة الحرة التفاعلية (Touch & Mouse Dragging)
  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    currentPanRef.current = { ...mapPan };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setMapPan({
      x: currentPanRef.current.x + dx,
      y: currentPanRef.current.y + dy,
    });
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
  };

  return (
    <div 
      className={`relative w-full h-[100dvh] min-h-[100dvh] overflow-hidden select-none font-cairo flex flex-col touch-pan-x touch-pan-y transition-colors duration-300 ${
        isDayMode ? 'bg-[#E8EDF5] text-slate-900' : 'bg-[#080E1A] text-[#DDE2F4]'
      }`} 
      dir="rtl"
    >
      {/* 1. طبقة الخريطة التفاعلية الليلية والنهارية مع وضوح خطوط الشوارع الكامل */}
      <div 
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="absolute inset-0 w-full h-full overflow-hidden cursor-grab active:cursor-grabbing"
      >
        {/* الحاوية القابلة للسحب التي تحرك كامل شبكة الشوارع والدبابيس */}
        <div 
          className="absolute inset-0 w-full h-full transition-transform duration-75 ease-out"
          style={{ transform: `translate3d(${mapPan.x}px, ${mapPan.y}px, 0)` }}
        >
          {/* شبكة وطرق الخريطة عالية التباين (SVG Street Grid) */}
          <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" viewBox="0 0 390 844">
            <defs>
              <pattern id="street-grid-sub" width="60" height="60" patternUnits="userSpaceOnUse">
                <path 
                  d="M 60 0 L 0 0 0 60" 
                  fill="none" 
                  stroke={isDayMode ? '#CBD5E1' : '#1D2638'} 
                  strokeWidth="1.5" 
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#street-grid-sub)" />

            {/* الشوارع الرئيسية العريضة بالنجف (High-Contrast Arteries) */}
            {/* شارع الكوفة - النجف الرئيسي */}
            <path 
              d="M 50,-50 L 350,900" 
              stroke={isDayMode ? '#94A3B8' : '#2A354C'} 
              strokeWidth="6" 
              strokeLinecap="round" 
            />
            {/* شارع المدينة / ساحة الصدرين */}
            <path 
              d="M -50,480 L 450,420" 
              stroke={isDayMode ? '#94A3B8' : '#2A354C'} 
              strokeWidth="5" 
              strokeLinecap="round" 
            />
            {/* طريق مطار النجف الدولي */}
            <path 
              d="M 120,900 L 220,100" 
              stroke={isDayMode ? '#94A3B8' : '#2A354C'} 
              strokeWidth="5" 
              strokeLinecap="round" 
            />
            {/* شارع الروان والجامعة */}
            <path 
              d="M -30,220 L 420,290" 
              stroke={isDayMode ? '#94A3B8' : '#2A354C'} 
              strokeWidth="4" 
              strokeLinecap="round" 
            />

            {/* خط المسار المتوهج التفاعلي (Luminous Polyline) */}
            <path 
              d="M 125,520 C 160,450 180,390 205,330 C 235,270 270,230 285,155" 
              stroke={isDayMode ? '#D97706' : '#F59E0B'} 
              strokeWidth="5.5" 
              strokeLinecap="round" 
              strokeDasharray="8 6" 
              className="animate-pulse"
            />
          </svg>

          {/* نصوص وأسماء الشوارع بخط عريض مقروء */}
          <div className="absolute top-[490px] left-[15%] text-[10px] font-bold tracking-wide select-none opacity-80"
               style={{ color: isDayMode ? '#0F172A' : '#F1F5F9' }}>
            شارع المدينة • مركز النجف
          </div>
          <div className="absolute top-[340px] left-[65%] text-[10px] font-bold tracking-wide select-none opacity-80 rotate-45"
               style={{ color: isDayMode ? '#0F172A' : '#F1F5F9' }}>
            طريق النجف - الكوفة السريع
          </div>
          <div className="absolute top-[210px] left-[25%] text-[10px] font-bold tracking-wide select-none opacity-80"
               style={{ color: isDayMode ? '#0F172A' : '#F1F5F9' }}>
            ساحة التحرير • بغداد
          </div>

          {/* دبوس الوجهة المحددة */}
          <div 
            onClick={() => handleSelectPlace(NAJAF_PLACES[0])}
            className="absolute top-[140px] left-[70%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20 cursor-pointer active:scale-95 transition-transform"
          >
            <div className={`px-2.5 py-1 rounded-full border text-[11px] font-bold mb-1 shadow-lg flex items-center gap-1.5 backdrop-blur-md ${
              isDayMode ? 'bg-white/95 border-slate-300 text-slate-900' : 'bg-[#161C28]/95 border-white/10 text-white'
            }`}>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
              <span>{mode === 'commute' ? 'نقطة الوصول المحددة' : 'الوجهة المحددة'}</span>
            </div>
            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center text-slate-950 shadow-xl border-2 border-white/20 font-bold text-base">
              📍
            </div>
          </div>

          {/* دبوس المعلم: مطار بغداد الدولي */}
          <div 
            onClick={() => handleSelectPlace(NAJAF_PLACES[2])}
            className="absolute top-[260px] left-[22%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20 opacity-90 cursor-pointer hover:opacity-100 transition-opacity"
          >
            <div className={`px-2 py-0.5 rounded-full border text-[10px] mb-1 shadow flex items-center gap-1 ${
              isDayMode ? 'bg-white border-slate-300 text-slate-800' : 'bg-[#161C28]/90 border-white/10 text-slate-200'
            }`}>
              <span>✈️</span>
              <span>مطار بغداد الدولي</span>
            </div>
          </div>

          {/* كابتن متحرك أقرب: كابتن علي */}
          <div className="absolute top-[320px] left-[52%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20 cursor-pointer">
            <div className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-bold mb-1 shadow-md flex items-center gap-1 animate-bounce">
              <span className="w-1 h-1 rounded-full bg-slate-950"></span>
              <span>{mode === 'commute' ? 'كابتن خط معتمد (٣ دقائق)' : 'كابتن علي (٣ دقائق)'}</span>
            </div>
            <div className="relative flex items-center justify-center">
              <span className="absolute w-12 h-12 rounded-full bg-amber-500/20 animate-ping"></span>
              <div className="w-10 h-10 rounded-full bg-[#1A202C] border-2 border-amber-400 shadow-2xl flex items-center justify-center text-amber-400 z-10 text-xl font-bold">
                🚖
              </div>
            </div>
          </div>

          {/* موقع المستخدم الحالي (Pickup Pin) */}
          <div className="absolute top-[525px] left-[32%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20">
            <div className="relative flex items-center justify-center">
              <span className="absolute w-10 h-10 rounded-full bg-emerald-500/25 animate-ping"></span>
              <div className="w-9 h-9 rounded-full bg-emerald-400 flex items-center justify-center text-slate-950 shadow-xl border-2 border-[#0D131F] font-bold text-base">
                📍
              </div>
            </div>
            <div className={`px-2.5 py-0.5 rounded-full border border-emerald-500/40 text-emerald-500 font-bold text-xs mt-1 shadow-lg backdrop-blur-md ${
              isDayMode ? 'bg-white/95' : 'bg-[#080E1A]/95'
            }`}>
              موقعك الحالي
            </div>
          </div>
        </div>
      </div>

      {/* 2. الهيدر العلوي العائم (Floating Glass Header) */}
      <header className="relative z-30 pt-safe px-4 pt-3 w-full flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* زر الرجوع السريع - مساحة لمس >= 48px */}
          <button 
            type="button"
            onClick={handleBackClick}
            aria-label="الرجوع" 
            className={`w-12 h-12 min-w-[48px] min-h-[48px] rounded-full backdrop-blur-xl border flex items-center justify-center shadow-lg active:scale-95 transition-transform cursor-pointer ${
              isDayMode 
                ? 'bg-white/90 text-slate-800 border-slate-300' 
                : 'bg-[#161C28]/90 text-white border-white/10 hover:border-amber-400/40'
            }`}
          >
            <span className="text-lg">➔</span>
          </button>
          
          {/* كبسولة الشعار الرسمي المفرغ مع الحاوية المقيدة بدقة */}
          <div className={`h-12 min-h-[48px] px-3.5 rounded-full backdrop-blur-xl border flex items-center gap-2 shadow-lg ${
            isDayMode ? 'bg-white/90 border-slate-300' : 'bg-[#161C28]/90 border-white/10'
          }`}>
            <div className="h-6 w-auto max-w-[80px] overflow-hidden flex items-center justify-center">
              <img 
                alt="توصيلة" 
                className="h-6 w-auto object-contain select-none pointer-events-none drop-shadow" 
                src="/logo.png?v=40" 
              />
            </div>
            <span className="font-bold text-xs text-amber-500 font-alexandria">
              {mode === 'commute' ? 'حجز خط دائمي' : 'تكسي فوري'}
            </span>
          </div>
        </div>

        {/* شارة الكباتن المتوفرين وزر الحساب الموحد */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className={`flex items-center gap-1.5 backdrop-blur-xl border px-3 py-2 rounded-full shadow-xl ${
            isDayMode 
              ? 'bg-white/95 border-amber-500/30 text-slate-800' 
              : 'bg-[#161C28]/90 border-amber-500/30 text-white'
          }`}>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
            </span>
            <span className="font-bold text-xs">٤ كباتن قربك</span>
            <span className="text-amber-500 text-xs">⚡</span>
          </div>

          {onOpenDrawer && (
            <button
              type="button"
              onClick={onOpenDrawer}
              aria-label="الحساب والإعدادات"
              className={`w-12 h-12 min-w-[48px] min-h-[48px] rounded-full backdrop-blur-xl border flex items-center justify-center shadow-lg active:scale-95 transition-transform cursor-pointer ${
                isDayMode ? 'bg-white/90 text-slate-700 border-slate-300' : 'bg-[#161C28]/90 text-slate-300 border-white/10'
              }`}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* 3. أزرار التحكم الجانبية العائمة (Floating Controls Dock) */}
      <div className="absolute right-4 bottom-[235px] z-30 flex flex-col gap-3">
        {/* زر التبديل بين الوضع النهاري والليلي (Day / Night Switcher) - Touch Target >= 48px */}
        <button 
          type="button"
          onClick={() => setIsDayMode((prev) => !prev)}
          aria-label="التبديل بين الوضع النهاري والليلي" 
          title={isDayMode ? 'التحويل للوضع الليلي 🌙' : 'التحويل للوضع النهاري ☀️'}
          className={`w-12 h-12 min-w-[48px] min-h-[48px] rounded-full backdrop-blur-xl border flex items-center justify-center shadow-lg active:scale-90 transition-transform cursor-pointer ${
            isDayMode ? 'bg-white/90 text-amber-600 border-slate-300' : 'bg-[#161C28]/90 text-amber-400 border-white/10'
          }`}
        >
          <span className="text-xl">{isDayMode ? '🌙' : '☀️'}</span>
        </button>

        {/* زر إعادة التمركز والـ GPS - Touch Target >= 48px */}
        <button 
          type="button"
          onClick={handleRecenter}
          aria-label="إعادة التمركز وتحديد الـ GPS" 
          className={`w-12 h-12 min-w-[48px] min-h-[48px] rounded-full backdrop-blur-xl border border-amber-500/40 text-amber-500 flex items-center justify-center shadow-lg active:scale-90 transition-transform cursor-pointer ${
            isDayMode ? 'bg-white/90' : 'bg-[#161C28]/90'
          } ${isGpsActive ? 'animate-spin ring-2 ring-amber-400/30' : ''}`}
        >
          <span className="text-lg">🎯</span>
        </button>
      </div>

      {/* زر الطوارئ والأمان على الجانب الأيسر - Touch Target >= 48px */}
      <div className="absolute left-4 bottom-[235px] z-30">
        <button 
          type="button"
          onClick={() => setShowSosAlert((prev) => !prev)}
          aria-label="طوارئ وأمان المشوار" 
          className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-full bg-red-600/90 border border-red-400/40 text-white shadow-lg shadow-red-600/30 backdrop-blur-xl flex items-center justify-center active:scale-90 transition-transform cursor-pointer hover:bg-red-500"
        >
          <span className="text-lg font-bold">🆘</span>
        </button>
      </div>

      {/* نافذة الأمان والطوارئ العائمة */}
      {showSosAlert && (
        <div className="absolute inset-x-4 top-20 z-40 bg-[#161C28]/95 border border-red-500/40 rounded-2xl p-4 shadow-2xl backdrop-blur-2xl animate-fade-in flex flex-col gap-2.5 text-white">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-red-400 flex items-center gap-1.5">
              <span>🚨</span>
              <span>مركز الأمان ومشاركة المشوار</span>
            </span>
            <button 
              type="button"
              onClick={() => setShowSosAlert(false)} 
              className="text-slate-400 hover:text-white p-1 text-sm cursor-pointer"
            >
              ✕
            </button>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            موقعك محمي ومراقب لحظياً عبر منظومة توصيلة الذكية. يمكنك مشاركة رابط المشوار المباشر مع عائلتك أو الاتصال بفرق الدعم.
          </p>
          <div className="flex gap-2 pt-1">
            <a 
              href="tel:911" 
              className="flex-1 min-h-[48px] py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition"
            >
              <span>📞</span>
              <span>اتصال الطوارئ</span>
            </a>
            <button 
              type="button"
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: 'مشوار توصيلة', text: 'أنا في طريقي عبر تطبيق توصيلة النجف', url: window.location.href }).catch(() => {});
                }
              }}
              className="flex-1 min-h-[48px] py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <span>🔗</span>
              <span>مشاركة الموقع</span>
            </button>
          </div>
        </div>
      )}

      {/* 4. لوحة الحجز السفلية المدمجة (Compact Bottom Floating Sheet) */}
      <section className={`absolute bottom-0 inset-x-0 w-full z-40 rounded-t-[2.2rem] backdrop-blur-2xl border-t shadow-[0_-12px_40px_rgba(0,0,0,0.8)] flex flex-col px-4 pt-3 pb-safe transition-colors duration-300 ${
        isDayMode 
          ? 'bg-gradient-to-b from-white/98 to-slate-50/98 border-slate-200 text-slate-900' 
          : 'bg-gradient-to-b from-[#161C28]/95 to-[#080E1A]/98 border-white/10 text-white'
      }`}>
        {/* مقبض السحب العلوي الناعم */}
        <div className="w-12 h-1.5 rounded-full bg-slate-500/40 mx-auto mb-3.5"></div>
        
        <div className="w-full flex flex-col gap-3 relative">
          {/* تنبيه الاشتراك النشط في وضع الخط الدائمي */}
          {mode === 'commute' && isSubscribed && (
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs">
              <span className="flex items-center gap-1.5 font-bold">
                <span>✅</span>
                <span>{subscriptionInfo || 'لديك اشتراك خط دائمي نشط'}</span>
              </span>
              {onManageSubscription && (
                <button
                  type="button"
                  onClick={onManageSubscription}
                  className="px-2.5 py-1 rounded-lg bg-red-600/80 hover:bg-red-600 text-white text-[11px] font-bold cursor-pointer transition"
                >
                  إلغاء الاشتراك
                </button>
              )}
            </div>
          )}

          {/* حقل البحث الذكي الصوتي والنصي */}
          <div className="relative w-full">
            <div className={`relative flex items-center w-full h-12 min-h-[48px] px-3.5 rounded-2xl border shadow-inner backdrop-blur-md focus-within:border-amber-400 focus-within:ring-1 focus-within:ring-amber-400/50 transition-all ${
              isDayMode ? 'bg-slate-100/90 border-slate-300 text-slate-900' : 'bg-[#1A202C] border-slate-700/60 text-white'
            }`}>
              <span className="text-amber-500 text-lg ms-1 me-2 select-none">🔍</span>
              <input 
                type="text" 
                value={searchQuery}
                onFocus={() => setIsSearchFocused(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setIsSearchFocused(true);
                }}
                placeholder={
                  pickupStep === 'select_pickup' 
                    ? 'حدد نقطة الانطلاق في النجف...' 
                    : 'ابحث عن وجهة الوصول (جامعة، مطار، حي)...'
                } 
                className={`flex-1 bg-transparent border-0 outline-none p-0 text-xs sm:text-sm font-cairo ${
                  isDayMode ? 'text-slate-900 placeholder:text-slate-500' : 'text-white placeholder:text-slate-400'
                }`}
              />
              {searchQuery && (
                <button 
                  type="button" 
                  onClick={() => setSearchQuery('')}
                  className="p-1 text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              )}
            </div>

            {/* القائمة المنسدلة العائمة التفاعلية فوق كافة الطبقات (Places Autocomplete Dropdown z-[100]) */}
            {isSearchFocused && (
              <div className={`absolute bottom-full mb-2 inset-x-0 z-[100] border rounded-2xl p-2 flex flex-col gap-1 max-h-56 overflow-y-auto shadow-2xl backdrop-blur-2xl animate-fade-in ${
                isDayMode ? 'bg-white/98 border-slate-300' : 'bg-[#1A202C]/98 border-slate-700/80 text-white'
              }`}>
                <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold text-amber-500 border-b border-white/5 pb-1 mb-1">
                  <span>أبرز معالم النجف الأشرف والكوفة:</span>
                  <button type="button" onClick={() => setIsSearchFocused(false)} className="text-slate-400 hover:text-white text-xs cursor-pointer">✕</button>
                </div>
                {filteredPlaces.length === 0 ? (
                  <div className="p-3 text-center text-xs text-slate-400">لا توجد معالم مطابقة للبحث</div>
                ) : (
                  filteredPlaces.map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => handleSelectPlace(p)}
                      className="w-full text-right px-3 py-2 rounded-xl hover:bg-amber-500/10 active:bg-amber-500/20 flex items-center justify-between text-xs transition cursor-pointer min-h-[44px]"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-base">{p.icon}</span>
                        <div className="flex flex-col text-right">
                          <span className={`font-bold ${isDayMode ? 'text-slate-900' : 'text-white'}`}>{p.name}</span>
                          <span className="text-[10px] text-slate-400">{p.sub}</span>
                        </div>
                      </div>
                      <span className="text-amber-500 text-xs">←</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* في وضع التكسي الفوري: بطاقات فئات السيارات الثلاث مع تفاصيلها الدقيقة */}
          {mode === 'instant' && pickupStep === 'confirm' && (
            <div className="flex items-center justify-between gap-2 pt-1 animate-fade-in">
              {[
                { key: 'saving' as const, name: 'تكسي توفير', sub: 'صالون اقتصادي', desc: 'الخيار الأوفر', price: calculateTierPrice('saving') },
                { key: 'vip' as const, name: 'تكسي VIP', sub: 'حديثة ومكيفة', desc: 'راحة وفخامة', price: calculateTierPrice('vip') },
                { key: 'super' as const, name: 'تكسي سوبر', sub: 'عائلية واسعة', desc: '٤ إلى ٦ ركاب', price: calculateTierPrice('super') },
              ].map((tier) => {
                const isSelected = selectedTier === tier.key;
                return (
                  <button
                    key={tier.key}
                    type="button"
                    onClick={() => setSelectedTier(tier.key)}
                    className={`flex-1 min-h-[64px] p-2 rounded-2xl border transition-all text-center flex flex-col justify-center items-center cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/20 border-amber-400 shadow-md shadow-amber-500/20 ring-1 ring-amber-400'
                        : isDayMode 
                          ? 'bg-slate-100 border-slate-300 text-slate-700' 
                          : 'bg-[#1A202C]/80 border-slate-700 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <span className={`text-xs font-black ${isDayMode ? 'text-slate-950' : 'text-white'}`}>{tier.name}</span>
                    <span className="text-[11px] text-amber-500 font-bold font-mono">{tier.price.toLocaleString('ar-IQ')} د.ع</span>
                    <span className="text-[9px] text-slate-400 mt-0.5">{tier.sub}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* في وضع الخط الدائمي: تحديد فترة الدوام وحسبة التوفير الشهري */}
          {mode === 'commute' && (
            <div className="flex flex-col gap-2 pt-1 animate-fade-in">
              <div className="flex items-center justify-between gap-2">
                {[
                  { key: 'morning_730', label: 'صباحي ٧:٣٠ ص', sub: 'دوام الجامعات' },
                  { key: 'morning_800', label: 'صباحي ٨:٠٠ ص', sub: 'دوام الموظفين' },
                  { key: 'afternoon_1400', label: 'مسائي ٢:٠٠ م', sub: 'عودة الطلاب' },
                ].map((shift) => (
                  <button
                    key={shift.key}
                    type="button"
                    onClick={() => setCommuteShift(shift.key as any)}
                    className={`flex-1 min-h-[48px] py-1.5 px-2 rounded-xl border text-center transition cursor-pointer ${
                      commuteShift === shift.key
                        ? 'bg-amber-500/20 border-amber-400 text-amber-500 font-bold'
                        : isDayMode
                          ? 'bg-slate-100 border-slate-300 text-slate-700'
                          : 'bg-[#1A202C] border-slate-700 text-slate-300 text-xs'
                    }`}
                  >
                    <div className="text-[11px] font-bold">{shift.label}</div>
                    <div className="text-[9px] text-slate-400">{shift.sub}</div>
                  </button>
                ))}
              </div>

              {/* شارة الخصم الشهري (توفير حتى 35%) */}
              <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs">
                <span className="text-amber-500 font-bold flex items-center gap-1">
                  <span>🌟</span>
                  <span>اشتراك شهري مخفّض (توفير حتى ٣٥٪)</span>
                </span>
                <span className={`font-black text-[11px] ${isDayMode ? 'text-slate-900' : 'text-white'}`}>٩٢,٠٠٠ د.ع / شهرياً</span>
              </div>
            </div>
          )}

          {/* زر التأكيد والانطلاق الأساسي (Primary Golden CTA) - ارتفاع 56px ومساحة لمس قياسية */}
          <button 
            type="button"
            onClick={handleMainActionClick}
            className="w-full min-h-[56px] h-14 py-3 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 text-slate-950 font-black text-base flex items-center justify-center gap-2 shadow-xl shadow-amber-500/25 active:scale-[0.98] transition-all hover:brightness-105 cursor-pointer font-cairo"
          >
            <span className="text-xl">
              {mode === 'commute' ? '📅' : pickupStep === 'confirm' ? '🚖' : '📍'}
            </span>
            <span>
              {mode === 'commute' 
                ? 'تثبيت مسار الخط والاشتراك 📅' 
                : pickupStep === 'select_pickup'
                  ? 'تثبيت نقطة الانطلاق 📍'
                  : pickupStep === 'select_dropoff'
                    ? 'تثبيت نقطة الوصول 🏁'
                    : 'تأكيد طلب تكسي توصيلة 🚖'}
            </span>
          </button>
        </div>
      </section>
    </div>
  );
};

export default RideMapBookingView;
