import { describe, expect, it } from "vitest";
import {
  mergeNotifications,
  notificationPath,
  relativeNotificationDate,
  unreadNotificationCount,
  type ProfessionalNotification,
} from "./model";

const item = (id: string, created_at: string, read_at: string | null = null): ProfessionalNotification => ({
  id,
  professional_id: "professional",
  type: "portal_message",
  actor_name: "Paciente de prueba",
  resource_id: "patient",
  resource_type: "patient",
  title: "Nuevo mensaje de Paciente de prueba",
  metadata: {},
  created_at,
  read_at,
});

describe("notification model", () => {
  it("merges realtime inserts idempotently and keeps newest first", () => {
    const current = [item("old", "2026-09-25T10:00:00Z"), item("same", "2026-09-25T11:00:00Z")];
    const next = mergeNotifications(current, [item("same", "2026-09-25T11:00:00Z"), item("new", "2026-09-25T12:00:00Z")]);
    expect(next.map((entry) => entry.id)).toEqual(["new", "same", "old"]);
  });

  it("counts unread records and maps resources to safe app routes", () => {
    expect(unreadNotificationCount([item("a", "2026-09-25T10:00:00Z"), item("b", "2026-09-25T11:00:00Z", "2026-09-25T11:01:00Z")])).toBe(1);
    expect(notificationPath(item("a", "2026-09-25T10:00:00Z"))).toBe("/app/patients/patient/portal?tab=chat");
    expect(notificationPath({ ...item("b", "2026-09-25T11:00:00Z"), resource_type: "agenda_entry" })).toBe("/app/agenda");
  });

  it("formats recent timestamps without leaking message contents", () => {
    const now = Date.parse("2026-09-25T12:00:00Z");
    expect(relativeNotificationDate("2026-09-25T11:59:40Z", now)).toBe("Ahora");
    expect(relativeNotificationDate("2026-09-25T11:45:00Z", now)).toBe("Hace 15 min");
  });
});
