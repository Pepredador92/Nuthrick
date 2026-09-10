import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DietWorkshopPage } from "./DietWorkshopPage";
import type { NutritionPlan } from "@/src/types/domain";

const api = vi.hoisted(() => ({
  getPatient: vi.fn(),
  listConsultations: vi.fn(),
  listPatients: vi.fn(),
  getPlan: vi.fn(),
  listPlans: vi.fn(),
  createPlan: vi.fn(),
  updatePlan: vi.fn(),
  loadReference: vi.fn(),
}));

const patient = {
  id: "patient",
  professional_id: "professional",
  full_name: "Paciente de prueba",
  birth_date: "1990-01-01",
} as never;

const consultation = {
  id: "consultation",
  professional_id: "professional",
  patient_id: "patient",
  consultation_type: "initial",
  sequence_number: 0,
  consultation_date: "2026-09-09T12:00:00Z",
  status: "completed",
  created_at: "2026-09-09T12:00:00Z",
  updated_at: "2026-09-09T12:00:00Z",
} as never;

const plan: NutritionPlan = {
  id: "plan",
  professional_id: "professional",
  patient_id: "patient",
  consultation_id: "consultation",
  title: "Plan nutricional",
  status: "draft",
  assigned_at: "2026-09-09",
  review_date: null,
  plan_type: null,
  category: null,
  target_calories: null,
  energy_calculation: null,
  created_at: "2026-09-09T12:00:00Z",
  updated_at: "2026-09-09T12:00:00Z",
};

vi.mock("@/src/services/patients", () => ({
  getPatient: api.getPatient,
  listConsultations: api.listConsultations,
  listPatients: api.listPatients,
}));

vi.mock("@/src/services/dietPlans", () => ({
  getDietPlan: api.getPlan,
  listDietPlans: api.listPlans,
  createDietPlan: api.createPlan,
  updateDietPlan: api.updatePlan,
  loadDietReferenceData: api.loadReference,
}));

function mount(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/app/diet-workshop" element={<DietWorkshopPage />} />
        <Route path="/app/diet-workshop/:dietPlanId" element={<DietWorkshopPage />} />
        <Route path="/app/patients/:patientId" element={<h1>Ficha del paciente</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getPatient.mockResolvedValue(patient);
  api.listConsultations.mockResolvedValue([consultation]);
  api.listPatients.mockResolvedValue({ rows: [patient], total: 1 });
  api.getPlan.mockResolvedValue(plan);
  api.listPlans.mockResolvedValue([]);
  api.createPlan.mockResolvedValue(plan);
  api.updatePlan.mockImplementation(async (_id, patch) => ({ ...plan, ...patch }));
  api.loadReference.mockResolvedValue({
    weight: { value: 72, unit: "kg", source: "consultation_measurements" },
    height: { value: 170, unit: "cm", source: "consultation_measurements" },
  });
});

describe("DietWorkshopPage", () => {
  it("lets a patient plan choose its source consultation and also supports no consultation", async () => {
    mount("/app/diet-workshop?patientId=patient");
    expect(await screen.findByRole("heading", { name: "Elige la fuente del plan" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Consulta de inicio/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Crear plan sin consulta" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abrir taller" }));
    await waitFor(() => expect(api.createPlan).toHaveBeenCalledWith({ patientId: "patient", consultationId: "consultation" }));
  });

  it("opens directly from a consultation without asking for context again", async () => {
    mount("/app/diet-workshop?patientId=patient&consultationId=consultation");
    await waitFor(() => expect(api.createPlan).toHaveBeenCalledWith({ patientId: "patient", consultationId: "consultation" }));
    expect(await screen.findByText("Consulta fuente")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Elige la fuente del plan" })).not.toBeInTheDocument();
  });

  it("recovers an existing draft and reads reference data without enabling later steps", async () => {
    mount("/app/diet-workshop/plan");
    expect(await screen.findByRole("heading", { name: "Objetivo energético" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Plan nutricional")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Peso")).toHaveValue(72));
    expect(screen.getByRole("button", { name: /Macronutrientes/ })).toBeDisabled();
    expect(api.loadReference).toHaveBeenCalledWith("consultation");
  });

  it("creates a free draft without patient or consultation", async () => {
    api.createPlan.mockResolvedValue({ ...plan, patient_id: null, consultation_id: null });
    api.getPlan.mockResolvedValue({ ...plan, patient_id: null, consultation_id: null });
    mount("/app/diet-workshop");
    fireEvent.click(await screen.findByRole("button", { name: "Nuevo plan libre" }));
    await waitFor(() => expect(api.createPlan).toHaveBeenCalledWith({ patientId: null, consultationId: null }));
    expect((await screen.findAllByText("Sin asignar")).length).toBeGreaterThanOrEqual(2);
  });
});
