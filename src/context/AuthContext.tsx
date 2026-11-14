import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase.ts';
import { apiFetch, setInMemoryToken } from '../services/api.ts';
import { AuthUser, NotificationItem } from '../types/hackforge.ts';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  notifications: NotificationItem[];
  unreadCount: number;
  toasts: ToastMessage[];
  pushToast: (type: ToastMessage['type'], text: string) => void;
  dismissToast: (id: string) => void;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (payload: {
    fullName: string;
    email: string;
    password: string;
    institution: string;
    location: string;
  }) => Promise<AuthUser>;
  signInWithGoogle: () => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);

  const pushToast = useCallback((type: ToastMessage['type'], text: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const refreshNotifications = useCallback(async () => {
    try {
      const res = await apiFetch<{ notifications: NotificationItem[]; unreadCount: number }>('/api/notifications');
      setNotifications(res.notifications);
      setUnreadCount(res.unreadCount);
    } catch {
      // ignore if logged out
    }
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const res = await apiFetch<{ user: AuthUser; accessToken: string }>('/api/auth/me');
      setInMemoryToken(res.accessToken);
      setUser(res.user);
      await refreshNotifications();
    } catch {
      try {
        const refreshed = await apiFetch<{ user: AuthUser; accessToken: string }>('/api/auth/refresh', {
          method: 'POST',
        });
        setInMemoryToken(refreshed.accessToken);
        setUser(refreshed.user);
        await refreshNotifications();
      } catch {
        setInMemoryToken(null);
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, [refreshNotifications]);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  // Socket.IO connection synced with authenticated user
  useEffect(() => {
    if (!user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    const token = localStorage.getItem('__never_used__') || undefined;
    void token;
    import('../services/api.ts').then(({ getInMemoryToken }) => {
      const accessToken = getInMemoryToken();
      if (!accessToken) return;
      const s = io({
        path: '/socket.io',
        auth: { token: accessToken },
        transports: ['websocket', 'polling'],
      });

      s.on('notification:new', (notif: NotificationItem) => {
        setNotifications((prev) => {
          if (prev.some((n) => n.id === notif.id)) return prev;
          return [notif, ...prev];
        });
        setUnreadCount((c) => c + 1);
        pushToast('info', notif.title);
      });

      s.on('leadership:changed', () => {
        refreshSession();
      });

      setSocket(s);
    });

    return () => {
      socket?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const login = async (email: string, password: string) => {
    const res = await apiFetch<{ accessToken: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setInMemoryToken(res.accessToken);
    setUser(res.user);
    await refreshNotifications();
    return res.user;
  };

  const register = async (payload: {
    fullName: string;
    email: string;
    password: string;
    institution: string;
    location: string;
  }) => {
    const res = await apiFetch<{ accessToken: string; user: AuthUser }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setInMemoryToken(res.accessToken);
    setUser(res.user);
    await refreshNotifications();
    return res.user;
  };

  const signInWithGoogle = async () => {
    const credential = await signInWithPopup(auth, googleAuthProvider);
    const idToken = await credential.user.getIdToken();
    const res = await apiFetch<{ accessToken: string; user: AuthUser }>('/api/auth/firebase', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    });
    setInMemoryToken(res.accessToken);
    setUser(res.user);
    await refreshNotifications();
    return res.user;
  };

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    try {
      await firebaseSignOut(auth);
    } catch {
      // ignore
    }
    socket?.disconnect();
    setSocket(null);
    setInMemoryToken(null);
    setUser(null);
    setNotifications([]);
    setUnreadCount(0);
  };

  const markNotificationRead = async (id: string) => {
    await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const markAllNotificationsRead = async () => {
    await apiFetch('/api/notifications/read-all', { method: 'POST' });
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        notifications,
        unreadCount,
        toasts,
        pushToast,
        dismissToast,
        login,
        register,
        signInWithGoogle,
        logout,
        refreshSession,
        refreshNotifications,
        markNotificationRead,
        markAllNotificationsRead,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
