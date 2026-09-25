import { describe, expect, it } from "vitest";
import { dateKey, todayAppointments, unreadMessageCount, upcomingAppointments } from "./model";

const entry = (id: string, starts_at: string, status = "confirmed") => ({
  id,
  kind: "appointment" as const,
  status,
  starts_at,
  ends_at: starts_at,
  timezone: "America/Mexico_City",
  modality: "online",
  location_snapshot: null,
  contact_name: id,
  contact_email: `${id}@example.com`,
  patient_id: null,
  calendar_status: "not_connected",
  notification_status: "not_required",
});

describe("dashboard model", () => {
  it("classifies appointments by the professional timezone", () => {
    expect(dateKey("2026-09-25T05:30:00.000Z", "America/Mexico_City")).toBe("2026-09-24");
    expect(todayAppointments([
      entry("early", "2026-09-25T05:30:00.000Z"),
      entry("today", "2026-09-25T17:00:00.000Z"),
    ], new Date("2026-09-25T18:00:00.000Z"), "America/Mexico_City").map((item) => item.id)).toEqual(["today"]);
  });

  it("keeps upcoming appointments ordered and ignores cancelled entries", () => {
    expect(upcomingAppointments([
      entry("later", "2026-09-26T17:00:00.000Z"),
      entry("past", "2026-09-25T16:00:00.000Z"),
      entry("cancelled", "2026-09-27T16:00:00.000Z", "cancelled"),
    ], Date.parse("2026-09-25T17:00:00.000Z")).map((item) => item.id)).toEqual(["later"]);
  });

  it("counts only unread patient messages", () => {
    expect(unreadMessageCount([
      { id: "1", professional_id: "pro", type: "portal_message", actor_name: "Ana", resource_id: "p", resource_type: "patient", title: "Nuevo mensaje", metadata: {}, created_at: "2026-09-25T10:00:00Z", read_at: null },
      { id: "2", professional_id: "pro", type: "portal_message", actor_name: "Luis", resource_id: "p2", resource_type: "patient", title: "Nuevo mensaje", metadata: {}, created_at: "2026-09-25T09:00:00Z", read_at: "2026-09-25T09:05:00Z" },
      { id: "3", professional_id: "pro", type: "appointment_created", actor_name: "Marta", resource_id: "a", resource_type: "agenda_entry", title: "Nueva cita", metadata: {}, created_at: "2026-09-25T08:00:00Z", read_at: null },
    ])).toBe(1);
  });
});
