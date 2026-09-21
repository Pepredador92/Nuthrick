import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { PatientPortalOwnerPage } from "./PatientPortalOwnerPage";
import { portalAction } from "@/src/services/patientPortal";
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
