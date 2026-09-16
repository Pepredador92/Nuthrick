import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AgendaPage } from "./AgendaPage";
import { agendaApi, loadAgenda, type AgendaEntry } from "@/src/services/agenda";

vi.mock("@/src/features/auth/AuthProvider", () => ({
  useAuth: () => ({ profile: { public_slug: null } }),
}));
vi.mock("@/src/services/agenda", async (original) => ({
  ...(await original<typeof import("@/src/services/agenda")>()),
  agendaApi: vi.fn(),
  loadAgenda: vi.fn(),
}));
vi.mock("@/src/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        maybeSingle: async () => ({ data: null }),
        is: () => ({ order: async () => ({ data: [] }) }),
      }),
    }),
  },
}));
vi.mock("./PatientsPage", () => ({
  PatientModal: ({
    onSaved,
    initialContact,
  }: {
    onSaved: (p: { id: string; full_name: string }) => void;
    initialContact: { name: string; email: string };
  }) => (
    <section aria-label="Alta explícita">
      <p>{initialContact.email}</p>
      <button
        onClick={() =>
          onSaved({ id: "new-patient", full_name: initialContact.name })
        }
      >
        Guardar paciente de prueba
      </button>
    </section>
  ),
}));

const api = vi.mocked(agendaApi);
const entry: AgendaEntry = {
  id: "appointment",
  kind: "appointment",
  status: "confirmed",
  starts_at: "2026-09-20T16:00:00Z",
  ends_at: "2026-09-20T17:00:00Z",
  timezone: "America/Mexico_City",
  modality: "online",
  location_snapshot: null,
  contact_name: "Persona ficticia",
  contact_email: "synthetic@example.invalid",
  patient_id: null,
  calendar_status: "not_connected",
  notification_status: "sent",
};
const mount = () =>
  render(
    <MemoryRouter>
      <AgendaPage />
    </MemoryRouter>,
  );
beforeEach(() => {
  vi.mocked(loadAgenda).mockResolvedValue({ entries: [entry], requests: [] });
  api.mockImplementation(async (op) =>
    op === "connection"
      ? {
          calendarConnected: false,
          calendarActive: false,
          mailConnected: false,
          canConnectMail: false,
          busyCalendars: [],
          writeCalendar: "",
        }
      : op === "resolve_time_private"
        ? { instants: ["2026-09-20T16:00:00Z"] }
        : {},
  );
  // jsdom does not implement the native dialog methods; browser focus trapping
  // is native behavior, while these tests cover our cancel/restore callbacks.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute("open", "");
      },
    },
    close: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.removeAttribute("open");
      },
    },
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
describe("private agenda", () => {
  it("resolves internal blocks with verified private auth, not a public slug", async () => {
    mount();
    await screen.findByText("Persona ficticia");
    fireEvent.click(screen.getByRole("button", { name: "Configuración" }));
    fireEvent.change(screen.getByLabelText("Desde"), {
      target: { value: "2026-09-20T10:00" },
    });
    fireEvent.change(screen.getByLabelText("Hasta"), {
      target: { value: "2026-09-20T11:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Bloquear horario" }));
    await screen.findByText("Tiempo bloqueado.");
    expect(api).toHaveBeenCalledWith(
      "resolve_time_private",
      { localTime: "2026-09-20T10:00" },
      true,
    );
    expect(api.mock.calls.some(([op]) => op === "resolve_time")).toBe(false);
  });
  it("closes with native cancel without cancelling the appointment", async () => {
    mount();
    await screen.findByText("Persona ficticia");
    const trigger = screen.getByRole("button", { name: "Cancelar" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent(
      screen.getByRole("dialog"),
      new Event("cancel", { bubbles: false, cancelable: true }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(trigger).toHaveFocus();
    expect(api.mock.calls.some(([op]) => op === "manage")).toBe(false);
  });
  it("creates a patient only on request and requires a separate explicit link", async () => {
    mount();
    await screen.findByText("Persona ficticia");
    fireEvent.click(screen.getByRole("button", { name: "Vincular paciente" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Dar de alta un paciente nuevo",
      }),
    );
    expect(
      screen.getByRole("region", { name: "Alta explícita" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Guardar paciente de prueba" }),
    );
    await screen.findByText(
      "Paciente creado. Revisa y pulsa Vincular para asociarlo a esta cita.",
    );
    expect(api.mock.calls.some(([op]) => op === "manage")).toBe(false);
    fireEvent.click(
      screen.getByRole("button", { name: /^Vincular$/ }),
    );
    await waitFor(() =>
      expect(
        api.mock.calls.some(
          ([op, args]) =>
            op === "manage" &&
            (args?.payload as { patientId?: string })?.patientId ===
              "new-patient",
        ),
      ).toBe(true),
    );
  });
});
