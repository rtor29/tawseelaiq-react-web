// مصادقة جوجل — بديل GoogleAuthService.dart
// تدفق التفويض يتم على الخادم (code exchange) ويعيد login_token في رابط الرجوع

import { endpoints, http } from './api';
import { config } from './config';
import { authStore } from './auth';
import type { Session } from '../types';

// استخراج معاملات OAuth من الرابط الحالي (query أو fragment)
export function extractTokensFromCurrentUrl(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const url = new URL(window.location.href);

    // Flutter كان يفحص الـ fragment أولاً (#/...?login_token=...)
    if (url.hash.includes('login_token=') || url.hash.includes('id_token=') || url.hash.includes('access_token=')) {
      const fragQuery = url.hash.split('?')[1];
      if (fragQuery) Object.assign(out, Object.fromEntries(new URLSearchParams(fragQuery)));
    }
    url.searchParams.forEach((v, k) => {
      if (!out[k]) out[k] = v;
    });
  } catch {
    /* تجاهل */
  }
  return out;
}

// معالجة login_token القادم من جوجل/تليجرام (بديل main.dart)
export function consumeLoginTokenFromUrl(): Session | null {
  const params = extractTokensFromCurrentUrl();
  const loginToken = params.login_token;
  if (!loginToken) return null;

  const session: Session = {
    token: loginToken,
    userId: params.userId || 'usr-google',
    role: (params.role as Session['role']) || 'Customer',
    fullName: params.fullName || 'مستخدم Google',
  };
  authStore.save(session);

  // تنظيف الرابط بعد الحفظ
  try {
    window.history.replaceState(null, '', window.location.pathname);
  } catch {
    /* تجاهل */
  }
  return session;
}

// إرسال توكن جوجل إلى الخادم لتبديله بجلسة — بديل authenticateWithBackend
export async function authenticateWithBackend(opts: {
  idToken?: string;
  accessToken?: string;
  email?: string;
  fullName?: string;
  picture?: string;
}): Promise<{ success: boolean; errorMessage?: string }> {
  try {
    const { data } = await http.post<Record<string, string>>(endpoints.googleAuth, {
      ...(opts.idToken ? { idToken: opts.idToken } : {}),
      ...(opts.accessToken ? { accessToken: opts.accessToken } : {}),
      ...(opts.email ? { email: opts.email } : {}),
      ...(opts.fullName ? { fullName: opts.fullName } : {}),
      ...(opts.picture ? { picture: opts.picture } : {}),
    });

    authStore.save({
      token: data.token || `jwt_session_${data.userId}`,
      userId: data.userId || 'usr-g-local',
      role: (data.role as Session['role']) || 'Customer',
      fullName: data.fullName || 'مستخدم Google',
    });
    return { success: true };
  } catch (e) {
    return { success: false, errorMessage: `فشل إكمال تسجيل الدخول عبر Google: ${String(e)}` };
  }
}

// بدء تدفق OAuth 2.0 — نفس مسار النسخة الأصلية (خادمك يستقبل الـ code)
export function launchGoogleSignInFlow(): void {
  const redirectUri = `${window.location.origin}/api/auth/google/callback`;
  const authUrl =
    'https://accounts.google.com/o/oauth2/v2/auth' +
    `?client_id=${encodeURIComponent(config.googleClientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    '&response_type=code' +
    '&scope=openid%20email%20profile' +
    '&access_type=offline' +
    '&prompt=select_account';
  window.location.href = authUrl;
}
