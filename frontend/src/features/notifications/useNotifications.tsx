import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
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

function useNotificationState(userId: string) {
  const [items, setItems] = useState<ProfessionalNotification[]>([]);
  const [loading, setLoading] = useState(Boolean(userId));
  const [error, setError] = useState("");
  const seen = useRef(new Set<string>());
  const generation = useRef(0);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const requestGeneration = generation.current;
    try {
      const next = await listProfessionalNotifications();
      if (generation.current !== requestGeneration) return;
      seen.current = new Set(next.map((item) => item.id));
      setItems(next);
      setError("");
    } catch (cause) {
      if (generation.current !== requestGeneration) return;
      setError(cause instanceof Error ? cause.message : "No pudimos cargar tus notificaciones.");
    } finally {
      if (generation.current === requestGeneration) setLoading(false);
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
    let stop = () => {};
    try {
      stop = subscribeProfessionalNotifications(userId, (notification) => {
        if (!active || seen.current.has(notification.id)) return;
        seen.current.add(notification.id);
        setItems((current) => mergeNotifications(current, [notification]));
        playNotificationSound();
      });
    } catch {
      // Keep the periodic refresh available if realtime cannot start.
      queueMicrotask(() => {
        if (active) setError("La conexión en tiempo real no está disponible. Seguimos actualizando tus notificaciones periódicamente.");
      });
    }
    const fallback = window.setInterval(() => void refresh(), 60000);
    return () => {
      active = false;
      generation.current += 1;
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

const NotificationsContext = createContext<ReturnType<typeof useNotificationState> | null>(null);

function NotificationsSession({ userId, children }: { userId: string; children: ReactNode }) {
  const notifications = useNotificationState(userId);
  return <NotificationsContext.Provider value={notifications}>{children}</NotificationsContext.Provider>;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? "";
  // Changing accounts discards the previous inbox and its pending requests.
  return <NotificationsSession key={userId} userId={userId}>{children}</NotificationsSession>;
}

export function useNotifications() {
  const notifications = useContext(NotificationsContext);
  if (!notifications) throw new Error("useNotifications requires NotificationsProvider");
  return notifications;
}
