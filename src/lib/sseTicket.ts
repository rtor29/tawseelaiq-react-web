// قنوات البث اللحظي (SSE) بتذكرة قصيرة العمر
//
// EventSource لا يستطيع إرسال ترويسة Authorization، فالتوكن كان يُمرَّر في الـquery
// ويستقر في سجل Nginx وصلاحيته 30 يوماً. الآن يُطلب من الخادم تذكرة عمرها 60 ثانية
// (POST /api/auth/sse-ticket) وتُمرَّر مكانه، فما يظهر في السجل يفقد قيمته بعد دقيقة.
//
// ولأن المتصفح يعيد الاتصال تلقائياً بنفس الرابط، والتذكرة تنتهي، نتولى إعادة الاتصال
// بأنفسنا: نغلق القناة عند أي خطأ، ونطلب تذكرة جديدة، ونفتح من جديد بتباطؤ تدريجي.

import { http } from './api';
import { config } from './config';
import { storage } from './storage';

const FIRST_RETRY_MS = 3000;
const MAX_RETRY_MS = 30000;

export interface TicketedStreamHandle {
  close(): void;
}

export interface TicketedStreamOptions {
  /** يبني الرابط الكامل من معامل المصادقة، مثل `ticket=...` */
  buildUrl: (authParam: string) => string;
  /** تُستدعى بعد إنشاء القناة لتسجيل المستمعين، وتُستدعى مرة عند كل إعادة اتصال */
  setup: (source: EventSource) => void;
  /** تُستدعى عند نجاح الاتصال */
  onOpen?: () => void;
}

/** يطلب تذكرة بث عمرها 60 ثانية */
export async function fetchSseTicket(): Promise<string | null> {
  const res = await http.post<{ success?: boolean; ticket?: string }>(
    '/auth/sse-ticket',
    {},
    { timeout: 8000 },
  );
  return res.data?.ticket ?? null;
}

export function openTicketedStream({ buildUrl, setup, onOpen }: TicketedStreamOptions): TicketedStreamHandle {
  let isClosed = false;
  let source: EventSource | null = null;
  let retryTimer: number | undefined;
  let attempt = 0;

  const scheduleRetry = () => {
    if (isClosed) return;
    attempt += 1;
    const delay = Math.min(FIRST_RETRY_MS * 2 ** (attempt - 1), MAX_RETRY_MS);
    retryTimer = window.setTimeout(() => {
      void connect();
    }, delay);
  };

  const resolveAuthParam = async (): Promise<string> => {
    try {
      const ticket = await fetchSseTicket();
      if (ticket) return `ticket=${encodeURIComponent(ticket)}`;
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      // خادم لا يعرف التذكرة بعد: رجوع مؤقت للتوكن الطويل حتى لا ينقطع التتبّع اللحظي
      if (status === 404) {
        const legacy = storage.getToken() || localStorage.getItem('token') || '';
        if (legacy) return `token=${encodeURIComponent(legacy)}`;
      }
    }
    return '';
  };

  const connect = async () => {
    if (isClosed) return;

    const authParam = await resolveAuthParam();
    if (isClosed) return;
    if (!authParam) {
      scheduleRetry();
      return;
    }

    try {
      const src = new EventSource(buildUrl(authParam));
      source = src;

      src.addEventListener('open', () => {
        attempt = 0;
        onOpen?.();
      });

      src.addEventListener('error', () => {
        if (isClosed) return;
        // نغلق بأنفسنا لنمنع إعادة اتصال المتصفح بتذكرة منتهية
        try {
          src.close();
        } catch (_) {}
        if (source === src) source = null;
        scheduleRetry();
      });

      setup(src);
    } catch (_) {
      scheduleRetry();
    }
  };

  void connect();

  return {
    close() {
      isClosed = true;
      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer);
        retryTimer = undefined;
      }
      if (source) {
        try {
          source.close();
        } catch (_) {}
        source = null;
      }
    },
  };
}

/** رابط قناة مشوار الراكب */
export function rideStreamUrl(rideId: string, authParam: string, lastEventId?: string): string {
  const lastIdQuery = lastEventId ? `&lastEventId=${encodeURIComponent(lastEventId)}` : '';
  return `${config.apiBaseUrl}/ride/${encodeURIComponent(rideId)}/stream?${authParam}${lastIdQuery}`;
}

/** رابط قناة الكابتن */
export function driverStreamUrl(driverId: string, authParam: string, lastEventId?: string): string {
  const lastIdQuery = lastEventId ? `&lastEventId=${encodeURIComponent(lastEventId)}` : '';
  return `${config.apiBaseUrl}/events/driver/${encodeURIComponent(driverId)}?${authParam}${lastIdQuery}`;
}
