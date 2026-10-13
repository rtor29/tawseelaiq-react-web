const BASE = import.meta.env.VITE_API_BASE_URL ?? 'https://tawseelaiq.app';

function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? `HTTP ${res.status}`);
  return data as T;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  checkPhone: (phone: string) =>
    apiFetch<{ exists: boolean }>(`/api/auth/check-phone?phone=${encodeURIComponent(phone)}`),
  sendOtp: (phone: string) =>
    apiFetch<{ success: boolean }>('/api/auth/send-otp', { method: 'POST', body: JSON.stringify({ phone }) }),
  verifyOtp: (phone: string, otp: string) =>
    apiFetch<{ token: string; user: any }>('/api/auth/verify-otp', { method: 'POST', body: JSON.stringify({ phone, otp }) }),
  login: (body: object) =>
    apiFetch<{ token: string; user: any }>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: () => apiFetch<any>('/api/auth/me'),
  completePassengerReg: (body: object) =>
    apiFetch<any>('/api/auth/complete-passenger-registration', { method: 'POST', body: JSON.stringify(body) }),
  completeDriverReg: (body: object) =>
    apiFetch<any>('/api/auth/complete-driver-registration', { method: 'POST', body: JSON.stringify(body) }),
  selectRole: (role: string) =>
    apiFetch<any>('/api/auth/select-role', { method: 'POST', body: JSON.stringify({ role }) }),
};

// ─── Driver ───────────────────────────────────────────────────────────────────
export const driverApi = {
  toggleOnline: () => apiFetch<any>('/api/driver/toggle-online', { method: 'POST' }),
  updateLocation: (body: { driverId: string; lat: number; lon: number; heading?: number }) =>
    apiFetch<any>('/api/driver/location', { method: 'POST', body: JSON.stringify(body) }),
  getLive: (id: string) => apiFetch<any>(`/api/driver/${id}/live`),
  getActiveRide: (id: string) => apiFetch<any>(`/api/driver/${id}/active-ride`),
  getPendingRequests: (id: string) => apiFetch<any>(`/api/driver/${id}/pending-requests`),
  getBookings: (id: string) => apiFetch<any>(`/api/driver/${id}/bookings`),
  setServiceType: (mode: string) =>
    apiFetch<any>('/api/driver/service-type', { method: 'POST', body: JSON.stringify({ mode }) }),
  setRoute: (body: object) =>
    apiFetch<any>('/api/driver/set-route', { method: 'POST', body: JSON.stringify(body) }),
  getActiveRoutes: () => apiFetch<any>('/api/driver/active-routes'),
  approveJoin: (body: object) =>
    apiFetch<any>('/api/driver/approve-join', { method: 'POST', body: JSON.stringify(body) }),
  getMatchingPermanent: (id: string) => apiFetch<any>(`/api/driver/${id}/matching-permanent`),
};

// ─── Rides ────────────────────────────────────────────────────────────────────
export const rideApi = {
  request: (body: object) =>
    apiFetch<any>('/api/ride/request', { method: 'POST', body: JSON.stringify(body) }),
  getStatus: (id: string) => apiFetch<any>(`/api/ride/status/${id}`),
  respond: (body: object) =>
    apiFetch<any>('/api/ride/respond', { method: 'POST', body: JSON.stringify(body) }),
  arrived: (body: object) =>
    apiFetch<any>('/api/ride/arrived', { method: 'POST', body: JSON.stringify(body) }),
  cancel: (body: object) =>
    apiFetch<any>('/api/ride/cancel', { method: 'POST', body: JSON.stringify(body) }),
  complete: (body: object) =>
    apiFetch<any>('/api/ride/complete', { method: 'POST', body: JSON.stringify(body) }),
};

// ─── Permanent Lines / Bookings ───────────────────────────────────────────────
export const routeApi = {
  savePermanent: (body: object) =>
    apiFetch<any>('/api/routes/permanent', { method: 'POST', body: JSON.stringify(body) }),
  listPermanent: () => apiFetch<any[]>('/api/routes/permanent'),
  updatePermanent: (id: string, body: object) =>
    apiFetch<any>(`/api/routes/permanent/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deletePermanent: (id: string) =>
    apiFetch<any>(`/api/routes/permanent/${id}`, { method: 'DELETE' }),
  matchPassengerRoute: (waypoints: [number, number][]) =>
    apiFetch<any[]>('/api/passenger/match-route', { method: 'POST', body: JSON.stringify({ waypoints }) }),
  atomicBook: (routeId: string) =>
    apiFetch<any>('/api/bookings/atomic-book', { method: 'POST', body: JSON.stringify({ routeId }) }),
  joinRequest: (body: object) =>
    apiFetch<any>('/api/passenger/join-request', { method: 'POST', body: JSON.stringify(body) }),
  getBookings: () => apiFetch<any[]>('/api/bookings'),
};

// ─── Fleet / Map ──────────────────────────────────────────────────────────────
export const fleetApi = {
  getActiveDrivers: () => apiFetch<any[]>('/api/fleet/active-drivers'),
  getNearby: (params: { tripType?: string; lat: number; lon: number; rangeKm?: number }) => {
    const q = new URLSearchParams({
      lat: String(params.lat),
      lon: String(params.lon),
      ...(params.tripType && { tripType: params.tripType }),
      ...(params.rangeKm && { rangeKm: String(params.rangeKm) }),
    });
    return apiFetch<any[]>(`/api/drivers/nearby?${q}`);
  },
};

// ─── Routing / Geocoding ──────────────────────────────────────────────────────
export const mapApi = {
  getRoute: (from: string, to: string) =>
    apiFetch<any>(`/api/routing/route?from=${from}&to=${to}`),
  searchAddress: (q: string) =>
    apiFetch<any>(`/api/routing/search-address?q=${encodeURIComponent(q)}`),
  getPriceEstimate: (params: object) => {
    const q = new URLSearchParams(params as any);
    return apiFetch<any>(`/api/pricing/estimate?${q}`);
  },
};

// ─── Admin ────────────────────────────────────────────────────────────────────
export const adminApi = {
  getStats: () => apiFetch<any>('/api/admin/stats'),
  getDrivers: () => apiFetch<any[]>('/api/admin/drivers'),
  getDriver: (id: string) => apiFetch<any>(`/api/admin/drivers/${id}`),
  updateDriverStatus: (id: string, action: 'approve' | 'block' | 'status', body?: object) =>
    apiFetch<any>(`/api/admin/drivers/${id}/${action}`, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  deleteDriver: (id: string) => apiFetch<any>(`/api/admin/drivers/${id}`, { method: 'DELETE' }),
  getCustomers: () => apiFetch<any[]>('/api/admin/customers'),
  deleteCustomer: (id: string) => apiFetch<any>(`/api/admin/customers/${id}`, { method: 'DELETE' }),
  getBookings: () => apiFetch<any[]>('/api/admin/bookings'),
  getRoutes: () => apiFetch<any[]>('/api/admin/routes'),
  getComplaints: () => apiFetch<any[]>('/api/admin/complaints'),
  updateComplaintStatus: (id: string, status: string) =>
    apiFetch<any>(`/api/admin/complaints/${id}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
  getSettings: () => apiFetch<any>('/api/admin/settings'),
};
