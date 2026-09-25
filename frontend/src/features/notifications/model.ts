export type NotificationType =
  | "portal_message"
  | "appointment_request"
  | "appointment_created"
  | "appointment_changed";

export type ProfessionalNotification = {
  id: string;
  professional_id: string;
  type: NotificationType;
  actor_name: string;
  resource_id: string;
  resource_type: "patient" | "agenda_request" | "agenda_entry";
  title: string;
  metadata: Record<string, unknown>;
  created_at: string;
  read_at: string | null;
};

export function mergeNotifications(
  current: ProfessionalNotification[],
  incoming: ProfessionalNotification[],
) {
  return [...new Map([...current, ...incoming].map((item) => [item.id, item])).values()]
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id))
    .slice(0, 50);
}

export function unreadNotificationCount(items: ProfessionalNotification[]) {
  return items.reduce((count, item) => count + (item.read_at ? 0 : 1), 0);
}

export function notificationPath(item: ProfessionalNotification) {
  if (item.resource_type === "patient") {
    return `/app/patients/${item.resource_id}/portal?tab=chat`;
  }
  return "/app/agenda";
}

export function relativeNotificationDate(value: string, now = Date.now()) {
  const stamp = Date.parse(value);
  if (!Number.isFinite(stamp)) return "Ahora";
  const seconds = Math.max(0, Math.round((now - stamp) / 1000));
  if (seconds < 60) return "Ahora";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.round(hours / 24);
  return `Hace ${days} d`;
}
