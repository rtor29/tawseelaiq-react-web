import { endpoints, http } from './api';
import { storage } from './storage';
import type { RealtimeAdapter } from './realtime';
import type { DriverLocationEvent, RouteBroadcastEvent, TripStatusEvent } from '../types';

// خادم Node يستخدم REST؛ جلب تحديثات الرحلات كل ثلاث ثوانٍ.
export class PollingRealtimeAdapter implements RealtimeAdapter {
  private connected = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private polling = false;
  private trips = new Set<string>();
  private locations = new Set<(event: DriverLocationEvent) => void>();
  private statuses = new Set<(event: TripStatusEvent) => void>();
  private routes = new Set<(event: RouteBroadcastEvent) => void>();

  async connect(): Promise<void> {
    this.connected = true;
    if (!this.timer) this.timer = setInterval(() => { void this.poll(); }, 3000);
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.trips.clear();
  }

  isConnected(): boolean { return this.connected; }

  onDriverLocation(cb: (event: DriverLocationEvent) => void): () => void {
    this.locations.add(cb);
    return () => { this.locations.delete(cb); };
  }
  onTripStatus(cb: (event: TripStatusEvent) => void): () => void {
    this.statuses.add(cb);
    return () => { this.statuses.delete(cb); };
  }
  onRouteBroadcast(cb: (event: RouteBroadcastEvent) => void): () => void {
    this.routes.add(cb);
    return () => { this.routes.delete(cb); };
  }

  async broadcastLocation(latitude: number, longitude: number, heading: number): Promise<void> {
    const driverId = storage.getUserId();
    if (!this.connected || !driverId || storage.getUserRole() !== 'Driver') return;
    try { await http.post('/driver/location', { driverId, latitude, longitude, heading }); }
    catch { /* المحاولة التالية تحمل أحدث موقع */ }
  }

  // المسار يُحفظ عبر REST في شاشة إنشاء المسار.
  async broadcastRoute(): Promise<void> {}
  async joinTrip(tripId: string): Promise<void> {
    this.trips.add(tripId);
    await this.poll();
  }
  async leaveTrip(tripId: string): Promise<void> { this.trips.delete(tripId); }

  private async poll(): Promise<void> {
    if (!this.connected || this.polling || !this.trips.size) return;
    this.polling = true;
    try {
      const { data } = await http.get<Array<{ bookingId?: string; id?: string; driverId?: string; status?: string }>>(endpoints.bookings);
      if (!Array.isArray(data)) return;
      for (const booking of data) {
        const tripId = booking.bookingId ?? booking.id ?? '';
        if (!this.connected || !this.trips.has(tripId)) continue;
        if (booking.status) this.statuses.forEach(cb => cb({ tripId, status: booking.status! }));
        if (!booking.driverId) continue;
        const { data: location } = await http.get<DriverLocationEvent>(endpoints.driverLive(booking.driverId));
        if (!this.connected || !this.trips.has(tripId)) continue;
        if (Number.isFinite(location.latitude) && Number.isFinite(location.longitude)) {
          this.locations.forEach(cb => cb({ ...location, heading: location.heading ?? 0 }));
        }
      }
    } catch { /* إعادة المحاولة في الدورة التالية */ }
    finally { this.polling = false; }
  }
}
