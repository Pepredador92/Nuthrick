import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DietWorkshopPage } from "./DietWorkshopPage";
import type { NutritionPlan } from "@/src/types/domain";
import { createMacroDistribution, patchMacroInput } from "@/src/features/macros/model";

const api = vi.hoisted(() => ({
  getPatient: vi.fn(),
  listConsultations: vi.fn(),
  listPatients: vi.fn(),
  getPlan: vi.fn(),
  listPlans: vi.fn(),
  createPlan: vi.fn(),
  deleteDraft: vi.fn(),
  updatePlan: vi.fn(),
  listVersions: vi.fn(),
  publishVersion: vi.fn(),
  loadReference: vi.fn(),
  listFoods: vi.fn(),
  listRecipes: vi.fn(),
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
  macro_distribution: null,
  exchange_prescription: null,
  meal_distribution: null,
  diet_menu: null,
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
  deleteDietDraft: api.deleteDraft,
  updateDietPlan: api.updatePlan,
  listDietPlanVersions: api.listVersions,
  publishDietPlanVersion: api.publishVersion,
  loadDietReferenceData: api.loadReference,
}));

vi.mock("@/src/services/foodCatalog", () => ({
  listFoodItems: api.listFoods,
  listRecipes: api.listRecipes,
  createCustomFood: vi.fn(),
  createCustomRecipe: vi.fn(),
}));

function mount(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Link to="/app/patients/patient">Ficha desde el menú</Link>
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
  api.deleteDraft.mockResolvedValue(undefined);
  api.updatePlan.mockImplementation(async (_id, patch) => ({ ...plan, ...patch }));
  api.listVersions.mockResolvedValue([]);
  api.publishVersion.mockResolvedValue({ version_id: "version", version_number: 1, published_at: "2026-09-15T00:00:00Z", reused: false, already_current: false });
  api.loadReference.mockResolvedValue({
    weight: { value: 72, unit: "kg", source: "consultation_measurements" },
    height: { value: 170, unit: "cm", source: "consultation_measurements" },
  });
  api.listFoods.mockResolvedValue([]);
  api.listRecipes.mockResolvedValue([]);
});

describe("DietWorkshopPage", () => {
  it("links a published plan to patient sharing from review", async () => {
    api.getPlan.mockResolvedValue({ ...plan, status: "active", current_version_id: "version" });
    mount("/app/diet-workshop/plan");
    fireEvent.click(await screen.findByRole("button", { name: /Revisión/ }));
    expect(await screen.findByRole("link", { name: "Compartir con paciente" })).toHaveAttribute(
      "href", "/app/patients/patient/portal?tab=share&planId=plan#portal-plan-sharing",
    );
  });
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

  it("resumes an unpublished draft for the same patient and consultation instead of creating another", async () => {
    api.listPlans.mockResolvedValue([{ ...plan, draft_revision: 3 }]);
    mount("/app/diet-workshop?patientId=patient&consultationId=consultation");
    expect(await screen.findByRole("heading", { name: "Objetivo energético" })).toBeInTheDocument();
    expect(api.createPlan).not.toHaveBeenCalled();
  });

  it("recovers an existing draft and reads reference data with manual navigation enabled", async () => {
    mount("/app/diet-workshop/plan");
    expect(await screen.findByRole("heading", { name: "Objetivo energético" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Plan nutricional")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText("Peso")).toHaveValue(72));
    expect(screen.getByRole("button", { name: /Macronutrientes/ })).toBeEnabled();
    expect(api.loadReference).toHaveBeenCalledWith("consultation");
  });

  it("creates a free draft without patient or consultation", async () => {
    api.createPlan.mockResolvedValue({ ...plan, patient_id: null, consultation_id: null });
    api.getPlan.mockResolvedValue({ ...plan, patient_id: null, consultation_id: null });
    mount("/app/diet-workshop");
    fireEvent.click(await screen.findByRole("button", { name: "Nuevo plan libre" }));
    await waitFor(() => expect(api.createPlan).toHaveBeenCalledWith({ patientId: null, consultationId: null }));
    expect(await screen.findByRole("heading", { name: "Sin asignar" })).toBeInTheDocument();
    expect(screen.getByText("Consulta fuente", { selector: "span" }).parentElement).toHaveTextContent("Sin asignar");
  });

  it("opens Tiempos de comida even when the exchange inventory is empty", async () => {
    api.getPlan.mockResolvedValue({
      ...plan,
      target_calories: 1800,
      macro_distribution: { complete: true } as never,
    });
    mount("/app/diet-workshop/plan");
    const meals = await screen.findByRole("button", { name: /Tiempos de comida/ });
    expect(meals).toBeEnabled();
    fireEvent.click(meals);
    expect(await screen.findByLabelText("Nombre de Desayuno")).toBeInTheDocument();
  });

  it("recovers Objective 6 and enables the menu builder without duplicating the distribution", async () => {
    api.getPlan.mockResolvedValue({
      ...plan,
      target_calories: 1800,
      macro_distribution: { complete: true } as never,
      meal_distribution: {
        schema_version: 1,
        source_exchange_snapshot: null,
        meal_times: [{ id: "breakfast", meal_type: "BREAKFAST", display_name: "Desayuno", time: "08:00", display_order: 0 }],
        distribution: [{ meal_time_id: "breakfast", group_code: "FRUITS", portions: 1 }],
        derived_meal_totals: [], status: "ready", confirmed_at: "2026-09-10T00:00:00Z", updated_at: "2026-09-10T00:00:00Z",
      },
    });
    mount("/app/diet-workshop/plan");
    const menu = await screen.findByRole("button", { name: /Menú/ });
    expect(menu).toBeEnabled();
    fireEvent.click(menu);
    expect(await screen.findByRole("heading", { name: "Nuthrick a la Mesa" })).toBeInTheDocument();
    expect(screen.getByText("Falta 1")).toBeInTheDocument();
  });

  it("saves the latest energy target before continuing, even before the autosave delay", async () => {
    let finishSave: ((value: NutritionPlan) => void) | undefined;
    api.updatePlan.mockImplementationOnce(() => new Promise<NutritionPlan>((resolve) => { finishSave = resolve; }));
    mount("/app/diet-workshop/plan");
    await waitFor(() => expect(screen.getByLabelText("Peso")).toHaveValue(72));
    fireEvent.change(screen.getByLabelText("Objetivo prescrito (kcal/día)"), { target: { value: "1800" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar a macronutrientes" }));
    await waitFor(() => expect(api.updatePlan).toHaveBeenCalledWith("plan", expect.objectContaining({
      target_calories: 1800,
      energy_calculation: expect.objectContaining({ prescribed_target_kcal: 1800 }),
    }), 1));
    expect(screen.getByRole("heading", { name: "Objetivo energético" })).toBeInTheDocument();
    finishSave?.({ ...plan, ...api.updatePlan.mock.calls[0][1] });
    expect(await screen.findByRole("heading", { name: "Kilocalorías y macronutrientes" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Objetivo energético" })).not.toBeInTheDocument();
  });

  it("keeps Guardar y salir stable while a real save is in flight", async () => {
    let finishSave: ((value: NutritionPlan) => void) | undefined;
    api.updatePlan.mockImplementationOnce(() => new Promise<NutritionPlan>((resolve) => { finishSave = resolve; }));
    mount("/app/diet-workshop/plan");
    fireEvent.click(await screen.findByText("Nombre del plan y biblioteca"));
    const title = await screen.findByLabelText("Nombre del borrador");
    const saveAndExit = screen.getByRole("button", { name: "Guardar y salir" });
    fireEvent.change(title, { target: { value: "Plan actualizado" } });
    fireEvent.blur(title);
    await waitFor(() => expect(api.updatePlan).toHaveBeenCalledTimes(1));
    expect(saveAndExit).toBeEnabled();
    expect(saveAndExit).toHaveTextContent("Guardar y salir");
    finishSave?.({ ...plan, title: "Plan actualizado" });
  });

  it("asks whether to keep or delete a new draft when leaving", async () => {
    mount("/app/diet-workshop/plan");
    fireEvent.click(await screen.findByRole("button", { name: "Guardar y salir" }));
    const dialog = await screen.findByRole("dialog", { name: "¿Qué hacemos con este plan?" });
    expect(dialog).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Seguir editando" }));
    expect(screen.queryByRole("dialog", { name: "¿Qué hacemos con este plan?" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar y salir" }));
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar borrador y salir" }));
    await waitFor(() => expect(api.deleteDraft).toHaveBeenCalledWith("plan", 1));
    expect(await screen.findByRole("heading", { name: "Ficha del paciente" })).toBeInTheDocument();
  });

  it("intercepts a navigation link so the draft cannot be abandoned silently", async () => {
    mount("/app/diet-workshop/plan");
    expect(await screen.findByRole("heading", { name: "Objetivo energético" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Ficha desde el menú" }));
    expect(screen.getByRole("dialog", { name: "¿Qué hacemos con este plan?" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Ficha del paciente" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Conservar cambios y salir" }));
    expect(await screen.findByRole("heading", { name: "Ficha del paciente" })).toBeInTheDocument();
    expect(api.deleteDraft).not.toHaveBeenCalled();
  });

  it.each([
    ["Continuar a equivalentes", "Equivalentes"],
    ["Energía", "Objetivo energético"],
    ["Guardar y salir", "Ficha del paciente"],
  ])("saves pending macros before %s", async (action, destination) => {
    const saved = { ...plan, target_calories: 2000 };
    api.getPlan.mockResolvedValue(saved);
    let finishSave: ((value: NutritionPlan) => void) | undefined;
    api.updatePlan.mockImplementationOnce(() => new Promise<NutritionPlan>(resolve => { finishSave = resolve; }));
    mount("/app/diet-workshop/plan");
    fireEvent.click(await screen.findByRole("button", { name: "Macronutrientes" }));
    fireEvent.change(await screen.findByLabelText("Valor de Proteína"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: action }));
    if (action === "Guardar y salir") fireEvent.click(screen.getByRole("button", { name: "Conservar cambios y salir" }));
    await waitFor(() => expect(api.updatePlan).toHaveBeenCalledWith("plan", expect.objectContaining({
      macro_distribution: expect.objectContaining({ macros: expect.objectContaining({ PROTEIN: expect.objectContaining({ input_value: 20, grams: 100 }) }) }),
    }), 1));
    expect(screen.getByRole("heading", { name: "Kilocalorías y macronutrientes" })).toBeInTheDocument();
    finishSave?.({ ...saved, ...api.updatePlan.mock.calls[0][1] });
    expect(await screen.findByRole("heading", { name: destination })).toBeInTheDocument();
  });
  it.each([
    ["Macros", "Kilocalorías y macronutrientes"],
    ["Continuar a Tiempos", "Tiempos de comida"],
    ["Guardar y salir", "Ficha del paciente"],
  ])("saves pending portions before %s", async (action, destination) => {
    let macros = createMacroDistribution(2000, 72);
    macros = patchMacroInput(macros, "CARBOHYDRATE", "percentage", 50);
    macros = patchMacroInput(macros, "PROTEIN", "percentage", 20);
    macros = patchMacroInput(macros, "FAT", "percentage", 30);
    const saved = { ...plan, target_calories: 2000, macro_distribution: macros };
    api.getPlan.mockResolvedValue(saved);
    let finishSave: ((value: NutritionPlan) => void) | undefined;
    api.updatePlan.mockImplementationOnce(() => new Promise<NutritionPlan>(resolve => { finishSave = resolve; }));
    mount("/app/diet-workshop/plan");
    fireEvent.click(await screen.findByRole("button", { name: "Equivalentes" }));
    fireEvent.click(await screen.findByText("Agregar grupo"));
    fireEvent.click(screen.getByRole("button", { name: /Verduras.*Agregar/ }));
    fireEvent.change(screen.getByLabelText("Porciones de Verduras"), { target: { value: "1.5" } });
    fireEvent.click(screen.getByRole("button", { name: action }));
    if (action === "Guardar y salir") fireEvent.click(screen.getByRole("button", { name: "Conservar cambios y salir" }));
    await waitFor(() => expect(api.updatePlan).toHaveBeenCalledWith("plan", expect.objectContaining({
      exchange_prescription: expect.objectContaining({ groups: expect.arrayContaining([expect.objectContaining({ group_code: "VEGETABLES", portions: 1.5 })]) }),
    }), 1));
    expect(screen.getByRole("heading", { name: "Equivalentes" })).toBeInTheDocument();
    finishSave?.({ ...saved, ...api.updatePlan.mock.calls[0][1] });
    expect(await screen.findByRole("heading", { name: destination })).toBeInTheDocument();
  });

});
