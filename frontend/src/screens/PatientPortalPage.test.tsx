import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PatientPortalPage } from "./PatientPortalPage";
import { portalAction, portalApi, subscribeProfessionalPresence } from "@/src/services/patientPortal";
vi.mock("@/src/services/patientPortal", () => ({
  portalApi: vi.fn(),
  portalAction: vi.fn(),
  subscribePortalNotifications: vi.fn().mockResolvedValue(() => {}),
  subscribeProfessionalPresence: vi.fn().mockReturnValue(() => {}),
  PortalError: class extends Error {
    code = "portal_unavailable";
  },
}));
const shared = {
  goal: "Objetivo acordado",
  instructions: "Indicaciones para mí",
  results: [
    {
      id: "weight",
      label: "Peso",
      unit: "kg",
      method: "Medición",
      points: [{ consultationId: "c1", date: "2026-09-10", value: "70" }],
    },
    { id: "calculation:somatochart_coordinates:somatochart_coordinates:Heath-Carter:2:coordenadas", label: "Coordenadas de somatocarta", unit: "coordenadas", method: "Heath-Carter", points: [{ consultationId: "c1", date: "2026-09-10", value: "X: -1.2 · Y: 3.4" }] },
  ],
  consultations: [
    {
      id: "c1",
      date: "2026-09-10",
      title: "Consulta de seguimiento",
      summary: "Mi resumen",
    },
  ],
};
const view = {
  patientName: "Paciente sintético",
  professional: { name: "Profesional de prueba", title: "Nutrióloga" },
  shared,
  revision: 1,
  publishedAt: null,
  unread: 1,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(portalApi).mockImplementation(async (op) =>
    op === "portal_code"
      ? { id: "challenge" }
      : {
          session: "session",
          expiresAt: new Date(Date.now() + 7200000).toISOString(),
        },
  );
  vi.mocked(portalAction).mockImplementation(async (_access, action) =>
    action === "view"
      ? view
      : action === "plan"
        ? { plan: null }
        : action === "notes"
          ? { notes: [] }
      : action === "messages"
            ? { messages: [], before: null }
            : action === "presence_topic"
              ? { topic: "professional-presence:professional" }
            : { ok: true },
  );
});
function open() {
  return render(
    <MemoryRouter initialEntries={[`/mi-espacio#${"x".repeat(43)}`]}>
      <PatientPortalPage />
    </MemoryRouter>,
  );
}
async function login() {
  fireEvent.change(
    screen.getByLabelText("Correo registrado con tu nutriólogo"),
    { target: { value: "patient@example.invalid" } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Recibir código de acceso" }),
  );
  fireEvent.change(await screen.findByLabelText("Código de 6 dígitos"), {
    target: { value: "123456" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Entrar a mi espacio" }));
  await screen.findByText("Hola, Paciente sintético");
  fireEvent.click(screen.getByRole("tab", { name: "Mi guía" }));
  await screen.findByText("Objetivo acordado");
}
describe("patient space", () => {
  it("shows when the professional is online", async () => {
    vi.mocked(subscribeProfessionalPresence).mockImplementation((_topic, onChange) => {
      onChange(true);
      return () => {};
    });
    open();
    await login();
    expect(screen.getByLabelText("Tu nutriólogo está en línea")).toBeVisible();
  });

  it("accepts a professional code without requesting an email", async () => {
    open();
    fireEvent.click(
      screen.getByRole("button", { name: "Tengo un código de mi nutriólogo" }),
    );
    expect(
      screen.queryByLabelText("Correo registrado con tu nutriólogo"),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Código de 8 dígitos"), {
      target: { value: "12345678" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Entrar a mi espacio" }),
    );
    await screen.findByText("Hola, Paciente sintético");
    expect(portalApi).toHaveBeenCalledWith(
      "portal_verify_professional",
      expect.objectContaining({ code: "12345678" }),
    );
    expect(portalApi).not.toHaveBeenCalledWith(
      "portal_code",
      expect.anything(),
    );
    await screen.findByText(
      "Tu nutriólogo aún no ha compartido un plan publicado en este espacio.",
    );
  });
  it("does not request clinical data before both link and email verification", async () => {
    open();
    expect(screen.queryByText("Objetivo acordado")).not.toBeInTheDocument();
    expect(portalAction).not.toHaveBeenCalled();
    await login();
    expect(portalApi).toHaveBeenCalledWith(
      "portal_verify",
      expect.objectContaining({ code: "123456", id: "challenge" }),
    );
    expect(screen.getByText("Indicaciones para mí")).toBeVisible();
    expect(localStorage.getItem("session")).toBeNull();
    expect(sessionStorage.getItem("session")).toBeNull();
  });
  it("shows results, history and private notes without professional controls", async () => {
    open();
    await login();
    fireEvent.click(screen.getByRole("tab", { name: "Resultados" }));
    expect(screen.getByText("Peso")).toBeVisible();
    expect(screen.getByRole("img", { name: /Gráfica de evolución de Peso/ })).toBeVisible();
    expect(screen.getByRole("img", { name: "Somatocarta de evolución Heath-Carter" })).toBeVisible();
    expect(screen.queryByText("Método: Medición")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Publicar para el paciente"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Consultas" }));
    expect(screen.getByText("Mi resumen")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Mis notas" }));
    await screen.findByText("Solo tú puedes ver estas notas.");
    fireEvent.change(screen.getByLabelText("Mi nota"), {
      target: { value: "Preguntar por mis horarios" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar nota" }));
    await waitFor(() =>
      expect(portalAction).toHaveBeenCalledWith(
        { session: "session" },
        "note",
        expect.objectContaining({ body: "Preguntar por mis horarios" }),
      ),
    );
  });
  it("allows patient-first conversations and explicit sign out", async () => {
    open();
    await login();
    fireEvent.click(screen.getByRole("tab", { name: /Chat/ }));
    await screen.findByText("La conversación empieza contigo.");
    fireEvent.change(screen.getByLabelText("Escribe un mensaje"), {
      target: { value: "Tengo una duda" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar mensaje" }));
    await waitFor(() =>
      expect(portalAction).toHaveBeenCalledWith(
        { session: "session" },
        "message",
        expect.objectContaining({ body: "Tengo una duda" }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Salir" }));
    await screen.findByRole("button", { name: "Recibir código de acceso" });
    expect(portalAction).toHaveBeenCalledWith({ session: "session" }, "logout");
    expect(
      screen.queryByText("Hola, Paciente sintético"),
    ).not.toBeInTheDocument();
  });
  it("does not offer login without the private link", () => {
    render(
      <MemoryRouter>
        <PatientPortalPage />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole("button", { name: "Recibir código de acceso" }),
    ).not.toBeInTheDocument();
    expect(portalApi).not.toHaveBeenCalled();
  });
});
