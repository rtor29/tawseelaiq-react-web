// طبقة التخزين المحلي — بديل StorageService (SharedPreferences في الويب)

const KEYS = {
  token: 'auth_token',
  userId: 'user_id',
  userRole: 'user_role',
  fullName: 'user_fullname',
  phone: 'user_phone',
  avatar: 'user_avatar_base64',
} as const;

function clean(value: string | null): string | null {
  const v = value?.replaceAll('"', '').trim();
  return v ? v : null;
}

export const storage = {
  saveSession(session: {
    token: string;
    userId: string;
    role: string;
    fullName: string;
    phone?: string;
  }): void {
    localStorage.setItem(KEYS.token, session.token);
    localStorage.setItem(KEYS.userId, session.userId);
    localStorage.setItem(KEYS.userRole, session.role);
    localStorage.setItem(KEYS.fullName, session.fullName);
    if (session.phone) localStorage.setItem(KEYS.phone, session.phone);
  },

  getToken(): string | null {
    return clean(localStorage.getItem(KEYS.token));
  },
  getUserId(): string | null {
    return clean(localStorage.getItem(KEYS.userId));
  },
  getUserRole(): string | null {
    return clean(localStorage.getItem(KEYS.userRole));
  },
  getFullName(): string | null {
    return clean(localStorage.getItem(KEYS.fullName));
  },
  getPhone(): string | null {
    return clean(localStorage.getItem(KEYS.phone));
  },

  getAvatar(): string | null {
    return localStorage.getItem(KEYS.avatar);
  },
  setAvatar(base64: string): void {
    localStorage.setItem(KEYS.avatar, base64);
  },

  clearSession(): void {
    localStorage.removeItem(KEYS.token);
    localStorage.removeItem(KEYS.userId);
    localStorage.removeItem(KEYS.userRole);
    localStorage.removeItem(KEYS.fullName);
    localStorage.removeItem(KEYS.phone);
  },

  clearAll(): void {
    localStorage.removeItem(KEYS.token);
    localStorage.removeItem(KEYS.userId);
    localStorage.removeItem(KEYS.userRole);
    localStorage.removeItem(KEYS.fullName);
    localStorage.removeItem(KEYS.avatar);
    localStorage.removeItem(KEYS.phone);
  },

  resetAllStorageAndTestArtifacts(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {
      // ignore
    }
  },

  cleanLegacyTestArtifacts(): void {
    if (typeof window === 'undefined') return;
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (
          k.startsWith('bench_') ||
          k.startsWith('test_') ||
          k.startsWith('mock_') ||
          k.startsWith('sample_') ||
          k === 'tawseela_test_state'
        ) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch {
      // ignore
    }
  },
};

// تشغيل تنظيف المخلفات التجريبية فوراً عند بدء التطبيق
storage.cleanLegacyTestArtifacts();
