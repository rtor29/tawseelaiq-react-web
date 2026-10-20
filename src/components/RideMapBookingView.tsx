import React, { useState } from 'react';

export interface RideMapBookingProps {
  mode: 'instant' | 'commute'; // تكسي فوري أو خط دائمي
  onBack: () => void;
  onConfirmPickup: (location: { lat: number; lng: number; address: string }) => void;
  onConfirmDropoff?: (location: { lat: number; lng: number; address: string }) => void;
  onRequestRide?: (tier: 'super' | 'saving' | 'plus', details: {
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

export const RideMapBookingView: React.FC<RideMapBookingProps> = ({
  mode,
  onBack,
  onConfirmPickup,
  onConfirmDropoff,
  onRequestRide,
  onRequestCommute,
  onOpenDrawer,
  initialPickupAddress = 'موقعك الحالي - شارع المدينة',
  initialDropoffAddress = 'جامعة الكوفة - مجمع الكليات',
  isSubscribed = false,
  subscriptionInfo,
  onManageSubscription,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [pickupStep, setPickupStep] = useState<'select_pickup' | 'select_dropoff' | 'confirm'>('select_pickup');
  const [selectedTier, setSelectedTier] = useState<'super' | 'saving' | 'plus'>('super');
  const [commuteShift, setCommuteShift] = useState<'morning_730' | 'morning_800' | 'afternoon_1400'>('morning_730');
  const [pickupLoc, setPickupLoc] = useState({ lat: 32.0298, lng: 44.3285, address: initialPickupAddress });
  const [dropoffLoc, setDropoffLoc] = useState({ lat: 32.0355, lng: 44.3345, address: initialDropoffAddress });
  const [showQuickPlaces, setShowQuickPlaces] = useState(false);
  const [showSosAlert, setShowSosAlert] = useState(false);
  const [showLayersSheet, setShowLayersSheet] = useState(false);
  const [isGpsActive, setIsGpsActive] = useState(false);

  // أماكن سريعة وشائعة في النجف الأشرف
  const QUICK_PLACES = [
    { name: 'جامعة الكوفة', sub: 'مجمع الكليات - الكوفة', lat: 32.0355, lng: 44.3345, icon: '🎓' },
    { name: 'مطار النجف الدولي', sub: 'طريق المطار الرئيسي', lat: 31.9897, lng: 44.4042, icon: '✈️' },
    { name: 'مرقد الإمام علي (ع)', sub: 'المدينة القديمة، النجف', lat: 31.9959, lng: 44.3142, icon: '🕌' },
    { name: 'كراج بغداد الموحد', sub: 'شمال النجف، طريق كربلاء', lat: 32.028, lng: 44.3465, icon: '🚌' },
    { name: 'ساحة الصدرين', sub: 'مركز مدينة النجف', lat: 32.021, lng: 44.338, icon: '📍' },
  ];

  // محرك تسعيرة بلي المعتمد (فتح العداد 1000 + 500/كم + 100/دقيقة - الحد الأدنى 3000، تقريب لـ 250)
  const calculateTierPrice = (tier: 'super' | 'saving' | 'plus') => {
    if (tier === 'saving') return 3000;
    if (tier === 'super') return 3250;
    return 3750; // plus
  };

  const handleSelectQuickPlace = (place: typeof QUICK_PLACES[0]) => {
    if (pickupStep === 'select_pickup') {
      setPickupLoc({ lat: place.lat, lng: place.lng, address: place.name });
    } else {
      setDropoffLoc({ lat: place.lat, lng: place.lng, address: place.name });
    }
    setSearchQuery(place.name);
    setShowQuickPlaces(false);
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
          setIsGpsActive(false);
        },
        () => setIsGpsActive(false),
        { enableHighAccuracy: true, timeout: 6000 }
      );
    } else {
      setTimeout(() => setIsGpsActive(false), 800);
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

  return (
    <div 
      className="relative w-full h-[100dvh] min-h-[100dvh] bg-[#080E1A] text-[#DDE2F4] overflow-hidden select-none font-cairo flex flex-col touch-pan-x touch-pan-y" 
      dir="rtl"
    >
      {/* 1. طبقة الخريطة الليلية الفاخرة (Midnight Executive Nocturnal Map) */}
      <div className="absolute inset-0 w-full h-full bg-[#0A101D] overflow-hidden">
        {/* شبكة وطرق الخريطة الليلية الفاخرة المطعمة بالتدرجات */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0D131F]/90 via-[#0D131F]/30 to-[#080E1A]/95 pointer-events-none z-10"></div>
        
        {/* خطوط شبكة الشوارع الفاخرة */}
        <svg className="absolute inset-0 w-full h-full opacity-20 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="night-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#334155" strokeWidth="0.8" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#night-grid)" />
        </svg>

        {/* SVG المسار المتوهج التفاعلي */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" fill="none" viewBox="0 0 390 844" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="glow-gold" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <path 
            d="M 125,520 C 160,450 180,390 205,330 C 235,270 270,230 285,155" 
            stroke="#F59E0B" 
            strokeWidth="5" 
            strokeLinecap="round" 
            strokeDasharray="8 6" 
            filter="url(#glow-gold)"
            className="animate-pulse"
          />
        </svg>

        {/* دبوس الوجهة: جامعة الكوفة */}
        <div 
          onClick={() => {
            setSearchQuery('جامعة الكوفة');
            setDropoffLoc({ lat: 32.0355, lng: 44.3345, address: 'جامعة الكوفة' });
          }}
          className="absolute top-[140px] left-[70%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20 cursor-pointer active:scale-95 transition-transform"
        >
          <div className="px-2.5 py-1 rounded-full bg-[#161C28]/95 border border-white/10 text-white text-[11px] font-bold mb-1 shadow-lg flex items-center gap-1.5 backdrop-blur-md">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping"></span>
            <span>{mode === 'commute' ? 'جامعة الكوفة (الوجهة اليومية)' : 'جامعة الكوفة'}</span>
          </div>
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center text-slate-950 shadow-xl border-2 border-white/20 font-bold text-base">
            🎓
          </div>
        </div>

        {/* دبوس المعلم: مطار النجف الدولي */}
        <div 
          onClick={() => {
            setSearchQuery('مطار النجف الدولي');
            setDropoffLoc({ lat: 31.9897, lng: 44.4042, address: 'مطار النجف الدولي' });
          }}
          className="absolute top-[260px] left-[22%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20 opacity-80 cursor-pointer hover:opacity-100 transition-opacity"
        >
          <div className="px-2 py-0.5 rounded-full bg-[#161C28]/90 border border-white/10 text-slate-300 text-[10px] mb-1 shadow flex items-center gap-1">
            <span>✈️</span>
            <span>مطار النجف الدولي</span>
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

        {/* أسطول سيارات محيطة لتعزيز الحيوية البصرية */}
        <div className="absolute top-[210px] left-[42%] -translate-x-1/2 -translate-y-1/2 z-15 opacity-60">
          <span className="text-sm select-none">🚕</span>
        </div>
        <div className="absolute top-[440px] left-[78%] -translate-x-1/2 -translate-y-1/2 z-15 opacity-60">
          <span className="text-sm select-none">🚕</span>
        </div>
        <div className="absolute top-[390px] left-[15%] -translate-x-1/2 -translate-y-1/2 z-15 opacity-60">
          <span className="text-sm select-none">🚖</span>
        </div>

        {/* موقع المستخدم الحالي */}
        <div className="absolute top-[525px] left-[32%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20">
          <div className="relative flex items-center justify-center">
            <span className="absolute w-10 h-10 rounded-full bg-emerald-500/25 animate-ping"></span>
            <div className="w-9 h-9 rounded-full bg-emerald-400 flex items-center justify-center text-slate-950 shadow-xl border-2 border-[#0D131F] font-bold text-base">
              📍
            </div>
          </div>
          <div className="px-2.5 py-0.5 rounded-full bg-[#080E1A]/95 border border-emerald-500/40 text-emerald-400 font-bold text-xs mt-1 shadow-lg backdrop-blur-md">
            موقعك الحالي
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
            className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-full bg-[#161C28]/90 backdrop-blur-xl border border-white/10 text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform cursor-pointer hover:border-amber-400/40"
          >
            <span className="text-lg">➔</span>
          </button>
          
          {/* كبسولة الشعار الرسمي المفرغ المحدث */}
          <div className="h-12 min-h-[48px] px-3.5 rounded-full bg-[#161C28]/90 backdrop-blur-xl border border-white/10 flex items-center gap-2 shadow-lg">
            <img 
              alt="توصيلة" 
              className="h-6 w-auto object-contain select-none pointer-events-none drop-shadow" 
              src="/logo.png?v=40" 
            />
            <span className="font-bold text-xs text-amber-400 font-alexandria">
              {mode === 'commute' ? 'حجز خط دائمي' : 'تكسي فوري'}
            </span>
          </div>
        </div>

        {/* شارة الكباتن المتوفرين النشطة وزر الحساب الموحد */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="flex items-center gap-1.5 bg-[#161C28]/90 backdrop-blur-xl border border-amber-500/30 px-3 py-2 rounded-full shadow-xl">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
            </span>
            <span className="text-white font-bold text-xs">٤ كباتن متوفرين</span>
            <span className="text-amber-400 text-xs">⚡</span>
          </div>

          {onOpenDrawer && (
            <button
              type="button"
              onClick={onOpenDrawer}
              aria-label="الحساب والإعدادات"
              className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-full bg-[#161C28]/90 backdrop-blur-xl border border-white/10 text-slate-300 hover:text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform cursor-pointer"
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
        {/* زر طبقات الخريطة - Touch Target >= 48px */}
        <button 
          type="button"
          onClick={() => setShowLayersSheet((prev) => !prev)}
          aria-label="طبقات الخريطة" 
          className="w-12 h-12 min-w-[48px] min-h-[48px] rounded-full bg-[#161C28]/90 backdrop-blur-xl border border-white/10 text-white flex items-center justify-center shadow-lg active:scale-90 transition-transform cursor-pointer hover:border-white/30"
        >
          <span className="text-lg">🗺️</span>
        </button>
        {/* زر إعادة التمركز والـ GPS - Touch Target >= 48px */}
        <button 
          type="button"
          onClick={handleRecenter}
          aria-label="إعادة التمركز وتحديد الـ GPS" 
          className={`w-12 h-12 min-w-[48px] min-h-[48px] rounded-full bg-[#161C28]/90 backdrop-blur-xl border border-amber-500/40 text-amber-400 flex items-center justify-center shadow-lg active:scale-90 transition-transform cursor-pointer ${
            isGpsActive ? 'animate-spin border-amber-400 ring-2 ring-amber-400/30' : ''
          }`}
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
        <div className="absolute inset-x-4 top-20 z-40 bg-[#161C28]/95 border border-red-500/40 rounded-2xl p-4 shadow-2xl backdrop-blur-2xl animate-fade-in flex flex-col gap-2.5">
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

      {/* نافذة طبقات الخريطة */}
      {showLayersSheet && (
        <div className="absolute right-4 bottom-[295px] z-40 w-48 bg-[#161C28]/95 border border-white/10 rounded-2xl p-3 shadow-2xl backdrop-blur-2xl animate-fade-in flex flex-col gap-2">
          <div className="text-xs font-bold text-amber-400 mb-1">طبقات العرض</div>
          <button 
            type="button"
            onClick={() => setShowLayersSheet(false)}
            className="w-full text-right p-2 rounded-xl bg-amber-500/20 text-amber-300 text-xs font-bold border border-amber-400/30 flex items-center justify-between cursor-pointer"
          >
            <span>خريطة ليلية (Midnight)</span>
            <span>🌙</span>
          </button>
          <button 
            type="button"
            onClick={() => setShowLayersSheet(false)}
            className="w-full text-right p-2 rounded-xl bg-white/5 text-slate-300 text-xs font-medium hover:bg-white/10 transition flex items-center justify-between cursor-pointer"
          >
            <span>حركة المرور والزحام</span>
            <span>🚦</span>
          </button>
        </div>
      )}

      {/* 4. لوحة الحجز السفلية المدمجة (Compact Bottom Floating Sheet) */}
      <section className="absolute bottom-0 inset-x-0 w-full z-40 rounded-t-[2.2rem] bg-gradient-to-b from-[#161C28]/95 to-[#080E1A]/98 backdrop-blur-2xl border-t border-white/10 shadow-[0_-12px_40px_rgba(0,0,0,0.8)] flex flex-col px-4 pt-3 pb-safe">
        {/* مقبض السحب العلوي الناعم */}
        <div className="w-12 h-1.5 rounded-full bg-slate-600 mx-auto mb-3.5"></div>
        
        <div className="w-full flex flex-col gap-3">
          {/* تنبيه الاشتراك النشط في وضع الخط الدائمي */}
          {mode === 'commute' && isSubscribed && (
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs">
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
          <div className="relative flex items-center w-full h-12 min-h-[48px] px-3.5 rounded-2xl bg-[#1A202C] border border-slate-700/60 shadow-inner backdrop-blur-md focus-within:border-amber-400 focus-within:ring-1 focus-within:ring-amber-400/50 transition-all">
            <span className="text-amber-400 text-lg ms-1 me-2 select-none">🔍</span>
            <input 
              type="text" 
              value={searchQuery}
              onFocus={() => setShowQuickPlaces(true)}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث عن مكان، معلم أو شارع في النجف..." 
              className="flex-1 bg-transparent border-0 outline-none p-0 text-white placeholder:text-slate-400 text-xs sm:text-sm font-cairo"
            />
            <button 
              type="button" 
              onClick={() => setShowQuickPlaces((prev) => !prev)}
              aria-label="تسجيل صوتي أو أماكن سريعة"
              className="w-10 h-10 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-400 hover:text-white transition cursor-pointer"
            >
              <span>🎤</span>
            </button>
          </div>

          {/* قائمة الأماكن السريعة والمقترحة */}
          {showQuickPlaces && (
            <div className="w-full bg-[#1A202C] border border-slate-700/70 rounded-2xl p-2 flex flex-col gap-1 max-h-44 overflow-y-auto shadow-xl animate-fade-in">
              <div className="flex items-center justify-between px-2 py-1 text-[11px] font-bold text-amber-400">
                <span>أبرز معالم النجف الأشرف:</span>
                <button type="button" onClick={() => setShowQuickPlaces(false)} className="text-slate-400 hover:text-white text-xs cursor-pointer">✕</button>
              </div>
              {QUICK_PLACES.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => handleSelectQuickPlace(p)}
                  className="w-full text-right px-3 py-2 rounded-xl hover:bg-white/5 active:bg-amber-500/10 flex items-center justify-between text-xs transition cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{p.icon}</span>
                    <div className="flex flex-col text-right">
                      <span className="font-bold text-white">{p.name}</span>
                      <span className="text-[10px] text-slate-400">{p.sub}</span>
                    </div>
                  </div>
                  <span className="text-slate-500 text-xs">←</span>
                </button>
              ))}
            </div>
          )}

          {/* في وضع التكسي الفوري: خيارات الفئات عند مرحلة التأكيد */}
          {mode === 'instant' && pickupStep === 'confirm' && (
            <div className="flex items-center justify-between gap-2 pt-1 animate-fade-in">
              {(['saving', 'super', 'plus'] as const).map((tierKey) => {
                const isSelected = selectedTier === tierKey;
                const price = calculateTierPrice(tierKey);
                const title = tierKey === 'saving' ? 'توفير' : tierKey === 'super' ? 'سوبر' : 'بلَس';
                const sub = tierKey === 'saving' ? 'الأوفر' : tierKey === 'super' ? 'الأفضل' : 'راحة أعلى';
                return (
                  <button
                    key={tierKey}
                    type="button"
                    onClick={() => setSelectedTier(tierKey)}
                    className={`flex-1 min-h-[58px] p-2 rounded-2xl border transition-all text-center flex flex-col justify-center items-center cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/20 border-amber-400 shadow-md shadow-amber-500/20'
                        : 'bg-[#1A202C]/80 border-slate-700 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <span className="text-xs font-black text-white">{title}</span>
                    <span className="text-[10px] text-amber-400 font-bold">{price.toLocaleString('ar-IQ')} د.ع</span>
                    <span className="text-[9px] text-slate-400">{sub}</span>
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
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold'
                        : 'bg-[#1A202C] border-slate-700 text-slate-300 hover:border-slate-600 text-xs'
                    }`}
                  >
                    <div className="text-[11px] font-bold">{shift.label}</div>
                    <div className="text-[9px] text-slate-400">{shift.sub}</div>
                  </button>
                ))}
              </div>

              {/* شارة الخصم الشهري (توفير حتى 35%) */}
              <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs">
                <span className="text-amber-400 font-bold flex items-center gap-1">
                  <span>🌟</span>
                  <span>اشتراك شهري مخفّض (توفير حتى ٣٥٪)</span>
                </span>
                <span className="text-white font-black text-[11px]">٩٢,٠٠٠ د.ع / شهرياً</span>
              </div>
            </div>
          )}

          {/* زر التأكيد والانطلاق الأساسي (Primary Golden CTA) */}
          <button 
            type="button"
            onClick={handleMainActionClick}
            className="w-full min-h-[52px] h-[52px] py-3 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600 text-slate-950 font-black text-base flex items-center justify-center gap-2 shadow-xl shadow-amber-500/25 active:scale-[0.98] transition-all hover:brightness-105 cursor-pointer font-cairo"
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
