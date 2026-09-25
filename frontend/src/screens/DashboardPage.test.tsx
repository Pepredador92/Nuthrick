import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";
import { loadAgenda } from "@/src/services/agenda";
import { listPatients } from "@/src/services/patients";

vi.mock("@/src/features/auth/AuthProvider", () => ({
  useAuth: () => ({ profile: { full_name: "Dra. Ana López", timezone: "America/Mexico_City", biography: "Bio", avatar_path: "avatar", public_slug: "ana", specialties: ["Nutrición"], is_public: true } }),
}));
vi.mock("@/src/features/notifications/useNotifications", () => ({
  useNotifications: () => ({
    items: [{ id: "message", professional_id: "pro", type: "portal_message", actor_name: "Paciente", resource_id: "p1", resource_type: "patient", title: "Nuevo mensaje de Paciente", metadata: {}, created_at: "2026-09-25T15:00:00Z", read_at: null }],
    loading: false,
    unreadCount: 1,
  }),
}));
vi.mock("@/src/services/agenda", () => ({ loadAgenda: vi.fn() }));
vi.mock("@/src/services/patients", () => ({ listPatients: vi.fn() }));

beforeEach(() => {
  vi.setSystemTime(new Date("2026-09-25T18:00:00Z"));
  vi.mocked(loadAgenda).mockResolvedValue({
    entries: [{
      id: "today",
      kind: "appointment",
      status: "confirmed",
      starts_at: "2026-09-25T17:00:00Z",
      ends_at: "2026-09-25T18:00:00Z",
      timezone: "America/Mexico_City",
      modality: "online",
      location_snapshot: null,
      contact_name: "Paciente Hoy",
      contact_email: "today@example.com",
      patient_id: "p1",
      calendar_status: "not_connected",
      notification_status: "not_required",
    }],
    requests: [{ id: "request", status: "pending_professional", contact_name: "Nueva Persona", contact_email: "new@example.com", starts_at: "2026-09-26T17:00:00Z", ends_at: "2026-09-26T18:00:00Z", timezone: "America/Mexico_City", modality: "online", expires_at: "2026-09-30T18:00:00Z", revision: 1 }],
  });
  vi.mocked(listPatients).mockResolvedValue({ rows: [{ id: "p1", full_name: "Paciente Reciente", last_activity_at: "2026-09-25T14:00:00Z" } as never], total: 1 });
});

describe("DashboardPage", () => {
  it("prioritizes today's work and links each item to a real action", async () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);

    expect(await screen.findByText("Paciente Hoy")).toBeVisible();
    expect(screen.getByText("1 cita")).toBeVisible();
    expect(screen.getByText("Mensajes sin leer")).toBeVisible();
    expect(screen.getByText("Solicitudes de cita")).toBeVisible();
    expect(screen.getByText("Paciente Reciente")).toBeVisible();
    expect(screen.getByRole("link", { name: /Nueva consulta/ })).toHaveAttribute("href", "/app/patients");
    expect(screen.getByRole("link", { name: /Nuevo mensaje de Paciente/ })).toHaveAttribute("href", "/app/patients/p1/portal?tab=chat");
  });
});
