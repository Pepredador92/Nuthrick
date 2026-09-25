import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/src/features/auth/AuthProvider";
import {
  listProfessionalNotifications,
  markProfessionalNotificationRead,
  subscribeProfessionalNotifications,
} from "@/src/services/notifications";
import {
  mergeNotifications,
  unreadNotificationCount,
  type ProfessionalNotification,
} from "./model";
import { playNotificationSound } from "./sound";

export function useNotifications() {
  const { user } = useAuth();
  const [items, setItems] = useState<ProfessionalNotification[]>([]);
  const [loading, setLoading] = useState(Boolean(user));
  const [error, setError] = useState("");
  const seen = useRef(new Set<string>());
  const userId = user?.id ?? "";

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const next = await listProfessionalNotifications();
      seen.current = new Set(next.map((item) => item.id));
      setItems(next);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos cargar tus notificaciones.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    let active = true;
    if (!userId) {
      seen.current.clear();
      queueMicrotask(() => {
        if (!active) return;
        setItems([]);
        setLoading(false);
      });
      return () => {
        active = false;
      };
    }
    queueMicrotask(() => {
      if (active) setLoading(true);
    });
    queueMicrotask(() => {
      if (active) void refresh();
    });
    const stop = subscribeProfessionalNotifications(userId, (notification) => {
      if (!active || seen.current.has(notification.id)) return;
      seen.current.add(notification.id);
      setItems((current) => mergeNotifications(current, [notification]));
      playNotificationSound();
    });
    const fallback = window.setInterval(() => void refresh(), 60000);
    return () => {
      active = false;
      stop();
      window.clearInterval(fallback);
    };
  }, [refresh, userId]);

  const markRead = useCallback(async (id: string) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString() } : item));
    try {
      await markProfessionalNotificationRead(id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos marcar la notificación.");
      void refresh();
    }
  }, [refresh]);

  return { items, unreadCount: unreadNotificationCount(items), loading, error, refresh, markRead };
}
