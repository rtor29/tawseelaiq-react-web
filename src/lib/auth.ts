// متجر الجلسة — بديل StorageService + حالة الدخول العامة
// استخدام useSyncExternalStore لربط React بالتغييرات

import { useSyncExternalStore } from 'react';
import { storage } from './storage';
import type { AppRole, Session } from '../types';

type Listener = () => void;

let currentSession: Session | null = null;
const listeners = new Set<Listener>();

function readSession(): Session | null {
  const token = storage.getToken();
  if (!token) return null;
  return {
    token,
    userId: storage.getUserId() ?? '',
    role: (storage.getUserRole() ?? 'Customer') as AppRole,
    fullName: storage.getFullName() ?? 'مستخدم توصيله',
  };
}

currentSession = readSession();

export const authStore = {
  getSession(): Session | null {
    if (!storage.getToken()) {
      currentSession = null;
    }
    return currentSession;
  },

  save(session: Session, phone?: string): void {
    storage.saveSession({ ...session, phone });
    currentSession = readSession();
    listeners.forEach((l) => l());
  },

  clear(): void {
    storage.clearAll();
    currentSession = null;
    listeners.forEach((l) => l());
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useSession(): Session | null {
  return useSyncExternalStore(authStore.subscribe, authStore.getSession, authStore.getSession);
}
