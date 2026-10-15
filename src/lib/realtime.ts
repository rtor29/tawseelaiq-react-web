// طبقة الاتصال اللحظي الموحّدة — بديل SignalRService.dart
//
// الافتراضي REST polling لخادم Node؛ اختر signalr لخادم .NET أو socketio
// لخادم يدعم Socket.io عبر VITE_REALTIME_MODE.
//
// الأحداث (أسماء متطابقة بين المحوّلين):
//   استقبال: DriverLocationUpdated | TripStatusUpdated | RouteBroadcasted
//   إرسال:   UpdateDriverLocation | JoinTripGroup  | LeaveTripGroup | BroadcastRoute

import * as signalR from '@microsoft/signalr';
import { io, type Socket } from 'socket.io-client';
import { config } from './config';
import { PollingRealtimeAdapter } from './pollingRealtime';
import type { DriverLocationEvent, RouteBroadcastEvent, TripStatusEvent } from '../types';

type Unsubscribe = () => void;

export interface RealtimeAdapter {
  connect(token: string | null): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  onDriverLocation(cb: (e: DriverLocationEvent) => void): Unsubscribe;
  onTripStatus(cb: (e: TripStatusEvent) => void): Unsubscribe;
  onRouteBroadcast(cb: (e: RouteBroadcastEvent) => void): Unsubscribe;
  broadcastLocation(lat: number, lon: number, heading: number): Promise<void>;
  broadcastRoute(routeData: Record<string, unknown>): Promise<void>;
  joinTrip(tripId: string): Promise<void>;
  leaveTrip(tripId: string): Promise<void>;
}

// ============ محوّل SignalR (افتراضي — متوافق مع خادمك الحالي) ============
class SignalRAdapter implements RealtimeAdapter {
  private connection: signalR.HubConnection | null = null;
  private connecting: Promise<void> | null = null;

  async connect(token: string | null): Promise<void> {
    if (this.connecting) return this.connecting;
    if (this.connection?.state === signalR.HubConnectionState.Reconnecting) return;
    if (this.connection && this.connection.state === signalR.HubConnectionState.Connected) return;

    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(config.hubUrl, {
        accessTokenFactory: () => token ?? '',
      })
      .withAutomaticReconnect([2000, 5000, 10000, 20000])
      .build();

    this.connection.on('DriverLocationUpdated', (...args: unknown[]) => {
      if (args.length >= 4) {
        this.driverLocationCbs.forEach((cb) =>
          cb({
            driverId: String(args[0]),
            latitude: Number(args[1]),
            longitude: Number(args[2]),
            heading: Number(args[3]),
          }),
        );
      }
    });

    this.connection.on('RouteBroadcasted', (...args: unknown[]) => {
      if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
        this.routeCbs.forEach((cb) => cb(args[0] as RouteBroadcastEvent));
      }
    });

    this.connection.on('TripStatusUpdated', (...args: unknown[]) => {
      if (args.length >= 2) {
        this.tripCbs.forEach((cb) => cb({ tripId: String(args[0]), status: String(args[1]) }));
      }
    });

    const pending = this.connection.start().catch(() => undefined);
    this.connecting = pending;
    try { await pending; }
    finally { if (this.connecting === pending) this.connecting = null; }
  }

  async disconnect(): Promise<void> {
    const connection = this.connection;
    this.connection = null;
    this.connecting = null;
    await connection?.stop();
  }

  isConnected(): boolean {
    return this.connection?.state === signalR.HubConnectionState.Connected;
  }

  private driverLocationCbs = new Set<(e: DriverLocationEvent) => void>();
  private tripCbs = new Set<(e: TripStatusEvent) => void>();
  private routeCbs = new Set<(e: RouteBroadcastEvent) => void>();

  onDriverLocation(cb: (e: DriverLocationEvent) => void): Unsubscribe {
    this.driverLocationCbs.add(cb);
    return () => this.driverLocationCbs.delete(cb);
  }
  onTripStatus(cb: (e: TripStatusEvent) => void): Unsubscribe {
    this.tripCbs.add(cb);
    return () => this.tripCbs.delete(cb);
  }
  onRouteBroadcast(cb: (e: RouteBroadcastEvent) => void): Unsubscribe {
    this.routeCbs.add(cb);
    return () => this.routeCbs.delete(cb);
  }

  private async invoke(method: string, ...args: unknown[]): Promise<void> {
    if (this.isConnected()) await this.connection?.invoke(method, ...args).catch(() => undefined);
  }

  broadcastLocation(lat: number, lon: number, heading: number): Promise<void> {
    return this.invoke('UpdateDriverLocation', lat, lon, heading);
  }
  broadcastRoute(routeData: Record<string, unknown>): Promise<void> {
    return this.invoke('BroadcastRoute', routeData);
  }
  joinTrip(tripId: string): Promise<void> {
    return this.invoke('JoinTripGroup', tripId);
  }
  leaveTrip(tripId: string): Promise<void> {
    return this.invoke('LeaveTripGroup', tripId);
  }
}

// ============ محوّل Socket.io (اختياري عبر VITE_REALTIME_MODE=socketio) ============
class SocketIOAdapter implements RealtimeAdapter {
  private socket: Socket | null = null;

  async connect(token: string | null): Promise<void> {
    if (this.socket) return;
    this.socket = io(config.hubUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 20000,
    });

    this.socket.on('DriverLocationUpdated', (data: Record<string, unknown>) => {
      this.driverLocationCbs.forEach((cb) =>
        cb({
          driverId: String(data.driverId ?? ''),
          latitude: Number(data.latitude ?? 0),
          longitude: Number(data.longitude ?? 0),
          heading: Number(data.heading ?? 0),
        }),
      );
    });
    this.socket.on('TripStatusUpdated', (data: Record<string, unknown>) => {
      this.tripCbs.forEach((cb) =>
        cb({ tripId: String(data.tripId ?? ''), status: String(data.status ?? '') }),
      );
    });
    this.socket.on('RouteBroadcasted', (data: Record<string, unknown>) => {
      this.routeCbs.forEach((cb) => cb(data as RouteBroadcastEvent));
    });
  }

  async disconnect(): Promise<void> {
    this.socket?.disconnect();
    this.socket = null;
  }

  isConnected(): boolean {
    return !!this.socket?.connected;
  }

  private driverLocationCbs = new Set<(e: DriverLocationEvent) => void>();
  private tripCbs = new Set<(e: TripStatusEvent) => void>();
  private routeCbs = new Set<(e: RouteBroadcastEvent) => void>();

  onDriverLocation(cb: (e: DriverLocationEvent) => void): Unsubscribe {
    this.driverLocationCbs.add(cb);
    return () => this.driverLocationCbs.delete(cb);
  }
  onTripStatus(cb: (e: TripStatusEvent) => void): Unsubscribe {
    this.tripCbs.add(cb);
    return () => this.tripCbs.delete(cb);
  }
  onRouteBroadcast(cb: (e: RouteBroadcastEvent) => void): Unsubscribe {
    this.routeCbs.add(cb);
    return () => this.routeCbs.delete(cb);
  }

  private emit(event: string, ...args: unknown[]): Promise<void> {
    return new Promise((resolve) => {
      if (this.socket?.connected) this.socket.emit(event, ...args);
      resolve();
    });
  }

  broadcastLocation(lat: number, lon: number, heading: number): Promise<void> {
    return this.emit('UpdateDriverLocation', lat, lon, heading);
  }
  broadcastRoute(routeData: Record<string, unknown>): Promise<void> {
    return this.emit('BroadcastRoute', routeData);
  }
  joinTrip(tripId: string): Promise<void> {
    return this.emit('JoinTripGroup', tripId);
  }
  leaveTrip(tripId: string): Promise<void> {
    return this.emit('LeaveTripGroup', tripId);
  }
}

// ============ نسخة أحادية عامة ============
export const realtime: RealtimeAdapter =
  config.realtimeMode === 'polling' ? new PollingRealtimeAdapter() :
  config.realtimeMode === 'socketio' ? new SocketIOAdapter() : new SignalRAdapter();
