import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsultationMeasurements } from "./ConsultationMeasurements";

const api = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), saveWorkspace: vi.fn(), saveFollowup: vi.fn() }));
const calculationApi = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("@/src/services/consultationMeasurements", async () => ({
  loadConsultationMeasurements: api.load,
  saveConsultationMeasurements: api.save,
  saveMeasurementWorkspace: api.saveWorkspace,
  savePatientMeasurementFollowup: api.saveFollowup,
}));
vi.mock("@/src/services/consultationCalculations", () => ({
  loadCalculationCatalog: calculationApi.load,
  saveConsultationCalculationResults: calculationApi.save,
}));

const catalog = [
  { id: "weight", code: "weight", name: "Masa corporal", display_name: "Peso corporal", clinical_name: "Masa corporal", category: "general", subcategory: "general", unit: "kg", data_type: "number", min_value: 0.001, max_value: 1000, decimal_places: 2, description: "Masa corporal medida directamente.", synonyms: ["peso"], display_order: 10, source_kind: "direct", choice_options: [] },
  { id: "height", code: "height", name: "Estatura", display_name: "Estatura", clinical_name: "Estatura", category: "general", subcategory: "general", unit: "cm", data_type: "number", min_value: 0.001, max_value: 300, decimal_places: 1, description: "Estatura medida directamente.", synonyms: ["talla"], display_order: 20, source_kind: "direct", choice_options: [] },
  { id: "waist_circumference", code: "waist_circumference", name: "Circunferencia de cintura", display_name: "Cintura", clinical_name: "Circunferencia de cintura", category: "circumference", subcategory: "circumferences", unit: "cm", data_type: "number", min_value: 0.001, max_value: 400, decimal_places: 1, description: "Circunferencia de cintura.", synonyms: ["brazo"], display_order: 30, source_kind: "direct", choice_options: [] },
  { id: "hip_circumference", code: "hip_circumference", name: "Circunferencia de cadera", display_name: "Cadera", clinical_name: "Circunferencia de cadera", category: "circumference", subcategory: "circumferences", unit: "cm", data_type: "number", min_value: 0.001, max_value: 400, decimal_places: 1, description: "Circunferencia de cadera.", synonyms: [], display_order: 35, source_kind: "direct", choice_options: [] },
  { id: "hemoglobin", code: "hemoglobin", name: "Hemoglobina", display_name: "Hemoglobina", clinical_name: "Hemoglobina", category: "laboratory", subcategory: "complete_blood_count_red", unit: "g/dL", data_type: "number", min_value: 0, max_value: 100, decimal_places: 1, description: "Analito.", synonyms: [], display_order: 40, source_kind: "laboratory_reported", choice_options: [] },
];

const calculations = [
  { code: "bmi", name: "Índice de masa corporal", category: "index", method_version: "1.0.0", status: "implemented", display_order: 10, definition: { catalogVersion: 1, resultKey: "bmi", resultName: "Índice de masa corporal", methodName: "IMC", summary: "Peso y estatura.", unit: "kg/m²", decimalPlaces: 1, inputs: [{ key: "weight", label: "Peso", source: "consultation_measurement", measurementCode: "weight" }, { key: "height", label: "Estatura", source: "patient_record", patientField: "height_cm" }], dependencies: [], references: [], limitations: "Sin clasificación." } },
  { code: "waist_hip_ratio", name: "Índice cintura/cadera", category: "index", method_version: "1.0.0", status: "implemented", display_order: 20, definition: { catalogVersion: 1, resultKey: "waist_hip_ratio", resultName: "Índice cintura/cadera", methodName: "Relación cintura/cadera", summary: "Cintura y cadera.", unit: "razón", decimalPlaces: 2, inputs: [{ key: "waist", label: "Cintura", source: "consultation_measurement", measurementCode: "waist_circumference" }, { key: "hip", label: "Cadera", source: "consultation_measurement", measurementCode: "hip_circumference" }], dependencies: [], references: [], limitations: "Sin clasificación." } },
  { code: "density_jackson_pollock_7", name: "Densidad corporal", category: "density", method_version: "pending", status: "not_implemented", display_order: 110, definition: { catalogVersion: 1, resultKey: "body_density", resultName: "Densidad corporal", methodName: "Jackson & Pollock 7", summary: "Pendiente.", unit: "g/cm³", decimalPlaces: 5, inputs: [{ key: "sex", label: "Sexo para ecuaciones", source: "patient_record", patientField: "equation_sex" }, { key: "age", label: "Edad en esta consulta", source: "patient_derived", derivation: "age_at_consultation" }], dependencies: [], references: [], limitations: "Pendiente." } },
];
const consultation = { id: "consultation", patient_id: "patient", consultation_date: "2026-09-04T12:00:00Z" } as never;
const patient = { id: "patient", full_name: "Paciente de prueba", weight_kg: 80, height_cm: 174, birth_date: "1992-06-10", equation_sex: "male" } as never;

describe("ConsultationMeasurements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.load.mockResolvedValue({ catalog, values: [], workspaceIds: ["weight", "height"], hasFollowup: false, followupIds: [], previousValues: {} });
    api.save.mockResolvedValue([{ id: "measurement-weight", measurement_type_id: "weight", value: 82.4 }]);
    api.saveWorkspace.mockImplementation(async (ids: string[]) => ids);
    api.saveFollowup.mockResolvedValue(["weight"]);
    calculationApi.load.mockResolvedValue(calculations);
    calculationApi.save.mockResolvedValue([]);
  });
  it("shows immediate fields, excludes laboratories, and saves only captured values", async () => {
    render(<ConsultationMeasurements consultation={consultation} patient={patient} />);
    expect(await screen.findByRole("heading", { name: "Mediciones" })).toBeInTheDocument();
    expect(screen.getByText("Peso inicial")).toBeInTheDocument();
    expect(screen.getByText("174 cm")).toBeInTheDocument();
    expect(screen.getByText("Masculino")).toBeInTheDocument();
    expect(screen.getByLabelText(/peso corporal/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/estatura/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/peso corporal/i), { target: { value: "82.4" } });
    expect(screen.getByText("27.2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /guardar mediciones/i }));
    await waitFor(() => expect(api.save).toHaveBeenCalledWith(expect.anything(), { weight: 82.4 }));
    await waitFor(() => expect(calculationApi.save).toHaveBeenCalledWith("consultation", expect.objectContaining({ bmi: expect.objectContaining({ displayedResult: "27.2" }) })));
    fireEvent.change(screen.getByLabelText(/buscar una medición/i), { target: { value: "hemoglobina" } });
    expect(await screen.findByText(/no encontramos una medición disponible/i)).toBeInTheDocument();
  });
  it("adds a searched measurement to the habitual workspace without saving a clinical value", async () => {
    render(<ConsultationMeasurements consultation={consultation} patient={patient} />);
    await screen.findByRole("heading", { name: "Mediciones" });
    fireEvent.change(screen.getByLabelText(/buscar una medición/i), { target: { value: "brazo" } });
    fireEvent.click(await screen.findByRole("button", { name: /agregar al espacio/i }));
    await waitFor(() => expect(api.saveWorkspace).toHaveBeenCalledWith(["weight", "height", "waist_circumference"]));
    expect(api.save).not.toHaveBeenCalled();
  });
  it("prioritizes the patient follow-up, shows the prior value, and lets it be updated", async () => {
    api.load.mockResolvedValue({
      catalog,
      values: [],
      workspaceIds: ["weight", "height", "waist_circumference"],
      hasFollowup: true,
      followupIds: ["weight"],
      previousValues: { weight: { measurement_type_id: "weight", value: 82.4, unit: "kg", measured_at: "2026-09-01T12:00:00Z" } },
    });
    api.saveFollowup.mockResolvedValue(["weight", "waist_circumference"]);
    render(<ConsultationMeasurements consultation={consultation} patient={patient} />);
    expect(await screen.findByRole("heading", { name: /seguimiento de este paciente/i })).toBeInTheDocument();
    expect(screen.getByText("Anterior: 82.4 kg")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^cintura$/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /editar seguimiento/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /cintura/i }));
    fireEvent.click(screen.getByRole("button", { name: /guardar seguimiento/i }));
    await waitFor(() => expect(api.saveFollowup).toHaveBeenCalledWith("patient", ["weight", "waist_circumference"]));
  });
  it("adds formula inputs to the global workspace without creating clinical values", async () => {
    render(<ConsultationMeasurements consultation={consultation} patient={patient} />);
    await screen.findByRole("heading", { name: "Cálculos" });
    fireEvent.click(screen.getByRole("button", { name: /agregar faltantes a mi espacio/i }));
    await waitFor(() => expect(api.saveWorkspace).toHaveBeenCalledWith(["weight", "height", "waist_circumference", "hip_circumference"]));
    expect(api.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /densidad corporal/i }));
    expect(screen.getByText("Pendiente de implementación")).toBeInTheDocument();
  });
});
