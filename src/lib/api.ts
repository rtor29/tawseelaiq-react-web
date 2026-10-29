// عميل HTTP مركزي — بديل ApiClient (Dio) مع حقن توكن Bearer تلقائياً
// كل المسارات تُبنى فوق VITE_API_BASE_URL (مثل /api في الإنتاج)

import axios, { type AxiosRequestConfig } from 'axios';
import { config } from './config';
import { storage } from './storage';
import { authStore } from './auth';

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

// جلسة منتهية أو مرفوضة: التطبيق كان يحتفظ بتوكن رفضه الخادم (انتهاء الصلاحية أو تدوير السر) ويبتلع كل فشل،
// فتبقى الشاشات فارغة أو تفشل عمليات الحفظ برسالة «غير مصرح» دون أي مخرج. الآن نتحقق من أن التوكن نفسه
// مرفوض بطلب /auth/me قبل مسح الجلسة، فلا يُخرَج المستخدم بسبب رفض لا علاقة له بالتوكن (كدور غير مناسب).
const AUTH_CALL_PATTERN = /\/auth\/(login|send-otp|verify-otp|google|complete-passenger-registration|sse-ticket)/;
let sessionCheckInFlight = false;

http.interceptors.response.use(
  (res) => res,
  async (error) => {
    const status = error?.response?.status;
    const reqUrl: string = String(error?.config?.url ?? '');
    const headers = error?.config?.headers;
    const authHeader: string | undefined = headers?.Authorization ?? headers?.get?.('Authorization');

    if ((status === 401 || status === 403) && authHeader && !AUTH_CALL_PATTERN.test(reqUrl) && !sessionCheckInFlight) {
      sessionCheckInFlight = true;
      try {
        await axios.get(`${config.apiBaseUrl}/auth/me`, {
          headers: { Authorization: authHeader },
          timeout: 8000,
        });
      } catch (checkErr: unknown) {
        if ((checkErr as { response?: { status?: number } })?.response?.status === 401) {
          try {
            sessionStorage.setItem('tawseela_session_expired', '1');
          } catch (_) {}
          authStore.clear();
        }
      } finally {
        sessionCheckInFlight = false;
      }
    }
    return Promise.reject(error);
  },
);

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
  driverStats: (driverId: string) => `/driver/${driverId}/stats`,

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
