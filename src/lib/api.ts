// عميل HTTP مركزي — بديل ApiClient (Dio) مع حقن توكن Bearer تلقائياً
// كل المسارات تُبنى فوق VITE_API_BASE_URL (مثل /api في الإنتاج)

import axios, { type AxiosRequestConfig } from 'axios';
import { config } from './config';
import { storage } from './storage';

export const http = axios.create({
  baseURL: config.apiBaseUrl,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
});

http.interceptors.request.use((req) => {
  const token = storage.getToken();
  if (token) req.headers.Authorization = `Bearer ${token}`;
  return req;
});

// إرسال ملف (multipart) — بديل uploadFile
export async function uploadFile(path: string, formData: FormData): Promise<unknown> {
  return http.post(path, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
}

// استدعاء خارج نطاق الـ API (مثل Mapbox) دون التدخل في الـ interceptor
export async function externalGet<T = unknown>(url: string, cfg?: AxiosRequestConfig): Promise<T> {
  const res = await axios.get<T>(url, cfg);
  return res.data;
}

// نقاط النهاية — مقابلة لـ ApiEndpoints + كل ما ورد في الشاشات
export const endpoints = {
  // Auth
  login: '/auth/login',
  registerPassenger: '/auth/complete-passenger-registration',
  profile: '/auth/me',
  sendOtp: '/auth/send-otp',
  verifyOtp: '/auth/verify-otp',
  googleAuth: '/auth/google',

  // Drivers
  driverStatus: (id: string) => `/drivers/${id}/status`,
  createRoute: (driverId: string) => `/drivers/${driverId}/routes`,
  driverLive: (driverId: string) => `/driver/${driverId}/live`,
  driverPermanentLocation: (id: string) => `/driver/permanent-location/${id}`,
  driverSetPermanentLocation: '/admin/driver/set-permanent-location',

  // Matching & bookings
  findMatchingRoutes: '/matching/find-routes',
  bookings: '/bookings',
  adminBookings: '/admin/bookings',
  acceptBooking: (id: string) => `/bookings/${id}/accept`,
  declineBooking: (id: string) => `/bookings/${id}/decline`,

  // Passenger permanent route
  passengerPermanentLocation: (id: string) => `/passenger/permanent-location/${id}`,
  passengerSetPermanentLocation: '/passenger/set-permanent-location',

  // Documents / ads / support
  uploadDocument: '/documents/upload',
  vacancyAds: '/ads/vacancies',
  complaints: '/complaints',
} as const;
