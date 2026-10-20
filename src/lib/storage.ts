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

    // مزامنة المفاتيح القياسية لضمان التوافق المطلق
    localStorage.setItem('token', session.token);
    localStorage.setItem('role', session.role);
    localStorage.setItem('user', JSON.stringify(session));
  },

  getToken(): string | null {
    return clean(localStorage.getItem(KEYS.token)) || clean(localStorage.getItem('token'));
  },
  getUserId(): string | null {
    return clean(localStorage.getItem(KEYS.userId)) || clean(localStorage.getItem('user_id')) || clean(localStorage.getItem('userId')) || clean(localStorage.getItem('id'));
  },
  getUserRole(): string | null {
    return clean(localStorage.getItem(KEYS.userRole)) || clean(localStorage.getItem('role')) || clean(localStorage.getItem('user_role'));
  },
  getFullName(): string | null {
    return clean(localStorage.getItem(KEYS.fullName)) || clean(localStorage.getItem('user_fullname')) || clean(localStorage.getItem('fullName')) || clean(localStorage.getItem('name'));
  },
  getPhone(): string | null {
    return clean(localStorage.getItem(KEYS.phone)) || clean(localStorage.getItem('user_phone')) || clean(localStorage.getItem('phone'));
  },

  getAvatar(): string | null {
    return localStorage.getItem(KEYS.avatar);
  },
  setAvatar(base64: string): void {
    localStorage.setItem(KEYS.avatar, base64);
  },

  getPoints(): number {
    const p = localStorage.getItem('user_points');
    return p ? parseInt(p, 10) || 0 : 0;
  },
  setPoints(points: number): void {
    localStorage.setItem('user_points', String(points));
  },

  clearSession(): void {
    localStorage.removeItem(KEYS.token);
    localStorage.removeItem(KEYS.userId);
    localStorage.removeItem(KEYS.userRole);
    localStorage.removeItem(KEYS.fullName);
    localStorage.removeItem(KEYS.phone);
    localStorage.removeItem('user_points');
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('user');
  },

  clearAll(): void {
    localStorage.removeItem(KEYS.token);
    localStorage.removeItem(KEYS.userId);
    localStorage.removeItem(KEYS.userRole);
    localStorage.removeItem(KEYS.fullName);
    localStorage.removeItem(KEYS.avatar);
    localStorage.removeItem(KEYS.phone);
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('user');
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
