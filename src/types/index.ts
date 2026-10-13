// ─── Auth ────────────────────────────────────────────────────────────────────
export interface User {
  id: string;
  fullName: string;
  phone: string;
  role: 'Customer' | 'Driver' | 'Admin';
  image?: string;
  token: string;
}

// ─── Driver ──────────────────────────────────────────────────────────────────
export interface Driver {
  id: string;
  fullName: string;
  phone: string;
  status: 'Online' | 'Offline' | 'Approved' | 'Pending' | 'Suspended';
  work_mode: 'مشوار قصير' | 'خط دائمي' | 'كلاهما';
  vehicleType?: string;
  vehicleColor?: string;
  vehiclePlate?: string;
  rating?: number;
  lat?: number;
  lng?: number;
  heading?: number;
  available_seats?: number;
  total_seats?: number;
}

// ─── Route / Permanent Line ───────────────────────────────────────────────────
export interface PermanentRoute {
  id: string;
  driver_id: string;
  driver_name: string;
  driver_phone: string;
  from_name: string;
  to_name: string;
  waypoints: [number, number][]; // [lng, lat]
  available_seats: number;
  total_seats: number;
  price?: number;
  is_active: boolean;
  proximity_tier?: 1 | 2 | 3; // 1=green ≤500m, 2=purple ≤1500m, 3=red >1500m
  distance_m?: number;
}

// ─── Booking ──────────────────────────────────────────────────────────────────
export interface Booking {
  id: string;
  driver_id: string;
  passenger_id: string;
  route_id: string;
  platform: 'web' | 'telegram';
  status: 'Pending' | 'Confirmed' | 'Completed' | 'Cancelled';
  created_at: string;
  driver?: Driver;
  passenger_name?: string;
}

// ─── Ride (Short Trip) ────────────────────────────────────────────────────────
export interface Ride {
  id: string;
  passenger_id: string;
  driver_id?: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
  pickup_address?: string;
  dropoff_address?: string;
  status: 'Pending' | 'Accepted' | 'Arrived' | 'InProgress' | 'Completed' | 'Cancelled';
  price_estimate?: number;
  created_at: string;
}

// ─── Admin Stats ──────────────────────────────────────────────────────────────
export interface AdminStats {
  totalDrivers: number;
  activeDrivers: number;
  totalCustomers: number;
  totalBookings: number;
  pendingDrivers: number;
  totalRoutes: number;
}

// ─── Map ──────────────────────────────────────────────────────────────────────
export interface LngLat {
  lng: number;
  lat: number;
}

export interface SearchResult {
  id: string;
  place_name: string;
  center: [number, number]; // [lng, lat]
}
