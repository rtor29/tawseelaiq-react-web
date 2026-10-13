import { create } from 'zustand';
import type { Driver, Ride } from '@/types';

interface RideState {
  activeRide: Ride | null;
  nearbyDrivers: Driver[];
  setActiveRide: (ride: Ride | null) => void;
  setNearbyDrivers: (drivers: Driver[]) => void;
  updateDriverPosition: (id: string, lat: number, lng: number, heading?: number) => void;
}

export const useRideStore = create<RideState>((set) => ({
  activeRide: null,
  nearbyDrivers: [],
  setActiveRide: (ride) => set({ activeRide: ride }),
  setNearbyDrivers: (drivers) => set({ nearbyDrivers: drivers }),
  updateDriverPosition: (id, lat, lng, heading) =>
    set((state) => ({
      nearbyDrivers: state.nearbyDrivers.map((d) =>
        d.id === id ? { ...d, lat, lng, heading } : d
      ),
    })),
}));
