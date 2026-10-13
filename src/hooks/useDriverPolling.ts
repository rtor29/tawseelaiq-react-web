import { useEffect, useRef } from 'react';
import { fleetApi } from '@/api';
import { useRideStore } from '@/store/rideStore';

/** Polls active drivers every 5s and updates the ride store */
export function useDriverPolling(enabled = true) {
  const setNearbyDrivers = useRideStore((s) => s.setNearbyDrivers);
  const timer = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!enabled) return;
    const fetch = async () => {
      try {
        const drivers = await fleetApi.getActiveDrivers();
        setNearbyDrivers(drivers ?? []);
      } catch (_) {}
    };
    fetch();
    timer.current = setInterval(fetch, 5000);
    return () => clearInterval(timer.current);
  }, [enabled, setNearbyDrivers]);
}
