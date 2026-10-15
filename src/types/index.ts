// أنواع البيانات المشتركة — مقابلة لنماذج Dart (UserModel, ProximityDriver, VacancyAd...)

export type AppRole = 'Customer' | 'Driver' | 'Admin';

export interface Session {
  token: string;
  userId: string;
  role: AppRole;
  fullName: string;
}

export interface LngLat {
  lng: number;
  lat: number;
}

export interface DriverProfile {
  isVerified?: boolean;
  isBlocked?: boolean;
  status?: string;
  vehicleInfo?: string;
  route?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface NearbyDriver {
  driverId: string;
  fullName: string;
  phoneNumber: string;
  latitude: number;
  longitude: number;
  heading: number;
  rating: number;
  carModel: string;
  plateNumber: string;
  distanceMeters: number;
  isWithinImmediateRadius: boolean;
}

export interface RouteMatch {
  id?: string;
  driverRouteId?: string;
  driverId?: string;
  driverName?: string;
  driverPhone?: string;
  routeName?: string;
  startName?: string;
  endName?: string;
  startLat: number;
  startLon: number;
  endLat: number;
  endLon: number;
  departureTime?: string;
  availableSeats?: number;
  totalSeats?: number;
  pricePerSeat?: number;
  fare?: number;
  [key: string]: unknown;
}

export interface Booking {
  bookingId?: string;
  id?: string;
  customerName?: string;
  customerPhone?: string;
  pickupLocation?: string;
  dropoffLocation?: string;
  seatsBooked?: number;
  totalFare?: number;
  status: 'Pending' | 'Confirmed' | 'Declined' | string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface VacancyAd {
  id: string;
  driverId: string;
  driverName: string;
  driverPhone: string;
  vehicleModel: string;
  plateNumber: string;
  rating: number;
  fromLocation: string;
  toLocation: string;
  departureDate: string;
  departureTime: string;
  availableSeats: number;
  totalSeats: number;
  pricePerSeatIqd: number;
  notes: string;
  status: 'Open' | 'Full' | 'Completed' | string;
}

export interface DriverLocationEvent {
  driverId: string;
  latitude: number;
  longitude: number;
  heading: number;
}

export interface TripStatusEvent {
  tripId: string;
  status: string;
}

export interface RouteBroadcastEvent {
  points?: Array<{ latitude: number; longitude: number }>;
  [key: string]: unknown;
}
