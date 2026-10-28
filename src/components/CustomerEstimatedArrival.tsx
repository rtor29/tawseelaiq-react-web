import React, { useEffect, useState, useRef } from 'react';
import { http } from '../lib/api';
import { calculateEtaMinutes, formatEtaRange } from '../lib/etaCalculator';

export interface CustomerEstimatedArrivalProps {
  isDark: boolean;
}

type EtaState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'granted_ready'; text: string; hasDrivers: boolean }
  | { status: 'hidden' };

export const CustomerEstimatedArrival: React.FC<CustomerEstimatedArrivalProps> = ({ isDark }) => {
  const [etaState, setEtaState] = useState<EtaState>({ status: 'loading' });
  const intervalRef = useRef<any>(null);
  const isFetchingRef = useRef<boolean>(false);

  const fetchEta = async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      // 1. فحص إذن الموقع بصمت تام
      if (typeof navigator === 'undefined' || !navigator.permissions || !navigator.permissions.query) {
        setEtaState({ status: 'hidden' });
        isFetchingRef.current = false;
        return;
      }

      let permStatus: PermissionStatus;
      try {
        permStatus = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
      } catch {
        setEtaState({ status: 'hidden' });
        isFetchingRef.current = false;
        return;
      }

      // إن كانت الحالة prompt أو denied: يُخفى السطر بالكامل دون طلب الإذن ودون أي نافذة
      if (permStatus.state !== 'granted') {
        setEtaState({ status: 'hidden' });
        isFetchingRef.current = false;
        return;
      }

      // 2. جلب الموقع بصمت
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const userLat = position.coords.latitude;
            const userLon = position.coords.longitude;

            // قراءة تفضيل الجنس المحفوظ محلياً
            const savedGender =
              localStorage.getItem('tawseela_gender_preference') ||
              localStorage.getItem('driver_gender_preference') ||
              'any';

            // 3. جلب أقرب سائقين متاحين للتاكسي فقط
            const res = await http.get<any>('/drivers/nearby', {
              params: {
                lat: userLat,
                lon: userLon,
                tripType: 'taxi',
                ...(savedGender && savedGender !== 'any' ? { genderPreference: savedGender } : {}),
              },
              timeout: 6000,
            });

            const driversList: any[] = Array.isArray(res.data)
              ? res.data
              : Array.isArray(res.data?.drivers)
              ? res.data.drivers
              : Array.isArray(res.data?.data)
              ? res.data.data
              : [];

            if (!driversList || driversList.length === 0) {
              setEtaState({
                status: 'granted_ready',
                text: 'لا يوجد سائقون متاحون حالياً',
                hasDrivers: false,
              });
              isFetchingRef.current = false;
              return;
            }

            // العثور على أقرب سائق يملك إحداثيات صالحة
            let minDistanceDriver: any = null;
            let minDistance = Infinity;

            for (const d of driversList) {
              const dLat = Number(d.latitude ?? d.lat);
              const dLon = Number(d.longitude ?? d.lon);
              if (!isNaN(dLat) && !isNaN(dLon)) {
                const dist =
                  typeof d.distanceKm === 'number'
                    ? d.distanceKm
                    : Math.hypot(dLat - userLat, dLon - userLon);
                if (dist < minDistance) {
                  minDistance = dist;
                  minDistanceDriver = d;
                }
              }
            }

            if (!minDistanceDriver) {
              setEtaState({
                status: 'granted_ready',
                text: 'لا يوجد سائقون متاحون حالياً',
                hasDrivers: false,
              });
              isFetchingRef.current = false;
              return;
            }

            const driverLat = Number(minDistanceDriver.latitude ?? minDistanceDriver.lat);
            const driverLon = Number(minDistanceDriver.longitude ?? minDistanceDriver.lon);
            const t = calculateEtaMinutes(userLat, userLon, driverLat, driverLon);

            setEtaState({
              status: 'granted_ready',
              text: formatEtaRange(t),
              hasDrivers: true,
            });
          } catch {
            setEtaState({ status: 'hidden' });
          } finally {
            isFetchingRef.current = false;
          }
        },
        () => {
          // في حال فشل أو انتهاء مهلة جلب الموقع
          setEtaState({ status: 'hidden' });
          isFetchingRef.current = false;
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
      );
    } catch {
      setEtaState({ status: 'hidden' });
      isFetchingRef.current = false;
    }
  };

  useEffect(() => {
    // التنفيذ الأولي عند فتح الصفحة
    fetchEta();

    // التحديث الدوري كل 30 ثانية
    const startPolling = () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(fetchEta, 30000);
    };

    const stopPolling = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    startPolling();

    // إيقاف التحديث عند إخفاء الصفحة واستئنافه فور العودة
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        fetchEta();
        startPolling();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  if (etaState.status === 'hidden') {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5" id="customer-eta-container">
      <span
        className={`flex items-center justify-center w-7 h-7 rounded-full ${
          etaState.status === 'granted_ready' && etaState.hasDrivers
            ? 'text-emerald-500'
            : isDark
            ? 'text-slate-400'
            : 'text-slate-500'
        } ${isDark ? 'bg-[#242A37]' : 'bg-slate-100'}`}
      >
        📍
      </span>
      <div className="flex flex-col text-right">
        <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
          الوصول التقديري
        </span>

        {etaState.status === 'loading' ? (
          <div
            id="eta-loading-skeleton"
            className={`h-3.5 w-24 rounded animate-pulse mt-0.5 ${
              isDark ? 'bg-slate-700/60' : 'bg-slate-200'
            }`}
          />
        ) : etaState.status === 'granted_ready' ? (
          <span
            id="eta-value-text"
            className={`text-xs font-bold ${
              etaState.hasDrivers
                ? 'text-emerald-500 dark:text-emerald-400'
                : isDark
                ? 'text-slate-400'
                : 'text-slate-500'
            }`}
          >
            {etaState.text}
          </span>
        ) : null}
      </div>
    </div>
  );
};

export default CustomerEstimatedArrival;
