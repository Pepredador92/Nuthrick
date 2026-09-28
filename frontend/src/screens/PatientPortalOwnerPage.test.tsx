import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { PatientPortalOwnerPage } from "./PatientPortalOwnerPage";
import { portalAction } from "@/src/services/patientPortal";
import { loadLongitudinalHistory } from "@/src/services/longitudinalHistory";
vi.mock("@/src/services/patientPortal", () => ({
  portalAction: vi.fn(),
  portalLink: (s: string) => `https://example.invalid/mi-espacio#${s}`,
}));
vi.mock("@/src/services/patients", () => ({
  getPatient: vi.fn(async () => ({ email: "patient@example.invalid" })),
}));
vi.mock("@/src/services/longitudinalHistory", () => ({
  loadLongitudinalHistory: vi.fn(async () => ({
    series: [],
    consultations: [
      {
        id: "c1",
        status: "completed",
        consultation_type: "initial",
        consultation_date: "2026-09-10",
        summary: "PRIVATE SUMMARY",
      },
      {
        id: "draft",
        status: "draft",
        consultation_type: "follow_up",
        consultation_date: "2026-09-15",
        summary: "PRIVATE DRAFT",
      },
    ],
  })),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(portalAction).mockImplementation(async (_access, action) =>
    action === "goal_candidates" ? {goals:[{consultationId:"complete",date:"2026-09-10",revision:1,questionKey:"objectives",content:"Objetivo autorizado"}]} : action === "plan_options"
      ? { plans: [], selectedPlanId: null }
      : {
          enabled: false,
          patientName: "Paciente sintético",
          professional: { name: "Profesional" },
          unread: 0,
          revision: 0,
          shared: {
            goal: "",
            instructions: "",
            results: [],
            consultations: [],
          },
        },
  );
});
it("requires deliberate preview/publication and never imports the private consultation summary", async () => {
  render(
    <MemoryRouter initialEntries={["/app/patients/p1/portal"]}>
      <Routes>
        <Route
          path="/app/patients/:patientId/portal"
          element={<PatientPortalOwnerPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByText("Su guía nutricional");
  expect(screen.queryByText("PRIVATE SUMMARY")).not.toBeInTheDocument();
  expect(screen.queryByText("PRIVATE DRAFT")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: /Consulta de inicio/ }));
  expect(
    screen.getByRole("textbox", { name: /Resumen para el paciente/ }),
  ).toHaveValue("");
  fireEvent.click(await screen.findByRole('checkbox',{name:'Compartir objetivo'}));
  expect(
    vi.mocked(portalAction).mock.calls.some((c) => c[1] === "publish"),
  ).toBe(false);
  fireEvent.click(
    screen.getByRole("button", { name: "Revisar antes de publicar" }),
  );
  expect(screen.getByText("Objetivo autorizado")).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "Publicar para el paciente" }),
  );
  await waitFor(() =>
    expect(portalAction).toHaveBeenCalledWith(
      { patientId: "p1" },
      "publish",
      expect.objectContaining({
        shared: expect.objectContaining({ goal: "Objetivo autorizado" }),
      }),
    ),
  );
});

it.each([0, 1, 2])("guides sharing with %s pending consultations and a direct history link", async (pending) => {
  vi.mocked(loadLongitudinalHistory).mockResolvedValueOnce({
    consultations: [
      { id: "closed", status: "completed", consultation_type: "initial", consultation_date: "2026-09-10" },
      ...Array.from({ length: pending }, (_, index) => ({ id: `draft-${index}`, status: "draft", consultation_date: "2026-09-15" })),
      { id: "deleted", status: "draft", deleted_at: "2026-09-16", consultation_date: "2026-09-15" },
      { id: "cancelled", status: "cancelled", consultation_date: "2026-09-15" },
    ],
    series: [{ id: "weight", label: "Peso", category: "measurements", unit: "kg", points: [
      { consultation_id: "closed", consultation_date: "2026-09-10", display_value: "70" },
      { consultation_id: "draft-0", consultation_date: "2026-09-15", display_value: "69" },
      { consultation_id: "deleted", consultation_date: "2026-09-15", display_value: "68" },
      { consultation_id: "cancelled", consultation_date: "2026-09-15", display_value: "67" },
    ] }],
  } as never);
  render(<MemoryRouter initialEntries={["/app/patients/p1/portal"]}><Routes><Route path="/app/patients/:patientId/portal" element={<PatientPortalOwnerPage />} /><Route path="/app/patients/:patientId" element={<p>Historial de consultas del paciente</p>} /></Routes></MemoryRouter>);
  const historyLink = await screen.findByRole("link", { name: "Ir al historial de consultas" });
  expect(historyLink).toHaveAttribute("href", "/app/patients/p1?view=history");
  expect(screen.getByText(/Para mostrar gráficas en el Superlink/)).toHaveTextContent("En la vista previa, confirma con Publicar para el paciente");
  if (pending) expect(screen.getByText(new RegExp(`Tienes ${pending} consulta`))).toHaveClass("bg-amber-50");
  else expect(screen.queryByText(/Tienes .* consulta/)).not.toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: /Peso.*1 consultas/ })).not.toBeChecked();
  expect(vi.mocked(portalAction).mock.calls.some((call) => call[1] === "publish")).toBe(false);
  fireEvent.click(historyLink);
  expect(await screen.findByText("Historial de consultas del paciente")).toBeVisible();
});

it("publishes the safe weight presentation used by the portal progress card", async () => {
  vi.mocked(loadLongitudinalHistory).mockResolvedValueOnce({
    consultations: [{ id: "c1", status: "completed", consultation_type: "initial", consultation_date: "2026-09-10" }],
    series: [
      { id: "weight", label: "Peso", conceptCode: "weight", category: "measurements", unit: "kg", points: [{ consultation_id: "c1", consultation_date: "2026-09-10", raw_value: 92.2, display_value: "92.2", interpretation: { context: { age: 30, pregnant: false } } }] },
      { id: "height", label: "Talla", conceptCode: "height", category: "measurements", unit: "cm", points: [{ consultation_id: "c1", consultation_date: "2026-09-10", raw_value: 165, display_value: "165" }] },
    ],
  } as never);
  render(<MemoryRouter initialEntries={["/app/patients/p1/portal"]}><Routes><Route path="/app/patients/:patientId/portal" element={<PatientPortalOwnerPage />} /></Routes></MemoryRouter>);
  await screen.findByText("Su guía nutricional");
  fireEvent.click(screen.getByRole("checkbox", { name: /Peso/ }));
  fireEvent.click(screen.getByRole("button", { name: "Vista del paciente" }));
  expect(await screen.findByText(/Intervalo por IMC adulto/)).toBeVisible();
  expect(screen.queryByText(/Edad|pregnant|context/)).not.toBeInTheDocument();
});

it("publishes both saved somatochart coordinates only after selecting the completed result", async () => {
  vi.mocked(loadLongitudinalHistory).mockResolvedValueOnce({
    consultations: [
      { id: "closed", status: "completed", consultation_type: "initial", consultation_date: "2026-09-10" },
      { id: "draft", status: "draft", consultation_date: "2026-09-15" },
      { id: "deleted", status: "completed", deleted_at: "2026-09-16", consultation_date: "2026-09-15" },
    ],
    series: [{ id: "calculation:somatochart_coordinates:somatochart_coordinates:Heath-Carter:2:coordenadas", label: "Coordenadas de somatocarta", category: "calculations", visualization: "somatochart", unit: "coordenadas", method: "Heath-Carter", points: [
      { consultation_id: "closed", consultation_date: "2026-09-10", display_value: "-1.2", coordinates: { x: -1.23456789, y: 3.456789 } },
      { consultation_id: "draft", consultation_date: "2026-09-15", display_value: "PRIVATE DRAFT", coordinates: { x: 99, y: 99 } },
      { consultation_id: "deleted", consultation_date: "2026-09-15", display_value: "DELETED", coordinates: { x: 98, y: 98 } },
    ] }],
  } as never);
  render(<MemoryRouter initialEntries={["/app/patients/p1/portal"]}><Routes><Route path="/app/patients/:patientId/portal" element={<PatientPortalOwnerPage />} /></Routes></MemoryRouter>);
  const checkbox = await screen.findByRole("checkbox", { name: /Coordenadas de somatocarta/ });
  expect(checkbox).not.toBeChecked();
  expect(screen.getByText("Muestra la somatocarta con los puntos de cada consulta.")).toBeVisible();
  fireEvent.click(checkbox);
  expect(vi.mocked(portalAction).mock.calls.some((call) => call[1] === "publish")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Revisar antes de publicar" }));
  expect(screen.getByRole("img", { name: "Somatocarta de evolución Heath-Carter" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Publicar para el paciente" }));
  await waitFor(() => expect(portalAction).toHaveBeenCalledWith({ patientId: "p1" }, "publish", expect.objectContaining({ shared: expect.objectContaining({ results: [expect.objectContaining({ points: [{ consultationId: "closed", date: "2026-09-10", value: "X: -1.23456789 · Y: 3.456789" }] })] }) })));
});
