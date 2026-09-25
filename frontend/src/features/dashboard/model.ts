import type { AgendaEntry } from "@/src/services/agenda";
import type { ProfessionalNotification } from "@/src/features/notifications/model";

const parts = {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
} as const;

export function dateKey(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, ...parts }).format(new Date(value));
}

export function todayAppointments(entries: AgendaEntry[], now: Date, timezone: string) {
  const today = dateKey(now.toISOString(), timezone);
  return entries
    .filter((entry) => entry.status === "confirmed" && dateKey(entry.starts_at, timezone) === today)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

export function upcomingAppointments(entries: AgendaEntry[], now = Date.now()) {
  return entries
    .filter((entry) => entry.status === "confirmed" && Date.parse(entry.starts_at) >= now)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}

export function unreadMessageCount(items: ProfessionalNotification[]) {
  return items.filter((item) => item.type === "portal_message" && !item.read_at).length;
}
