import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConsultationMeasurements } from "./ConsultationMeasurements";

const api = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), saveWorkspace: vi.fn() }));
vi.mock("@/src/services/consultationMeasurements", async () => ({
  loadConsultationMeasurements: api.load,
  saveConsultationMeasurements: api.save,
  saveMeasurementWorkspace: api.saveWorkspace,
}));

const catalog = [
  { id: "weight", code: "weight", name: "Masa corporal", display_name: "Peso corporal", clinical_name: "Masa corporal", category: "general", subcategory: "general", unit: "kg", data_type: "number", min_value: 0.001, max_value: 1000, decimal_places: 2, description: "Masa corporal medida directamente.", synonyms: ["peso"], display_order: 10, source_kind: "direct", choice_options: [] },
  { id: "height", code: "height", name: "Estatura", display_name: "Estatura", clinical_name: "Estatura", category: "general", subcategory: "general", unit: "cm", data_type: "number", min_value: 0.001, max_value: 300, decimal_places: 1, description: "Estatura medida directamente.", synonyms: ["talla"], display_order: 20, source_kind: "direct", choice_options: [] },
  { id: "waist_circumference", code: "waist_circumference", name: "Circunferencia de cintura", display_name: "Cintura", clinical_name: "Circunferencia de cintura", category: "circumference", subcategory: "circumferences", unit: "cm", data_type: "number", min_value: 0.001, max_value: 400, decimal_places: 1, description: "Circunferencia de cintura.", synonyms: ["brazo"], display_order: 30, source_kind: "direct", choice_options: [] },
  { id: "hemoglobin", code: "hemoglobin", name: "Hemoglobina", display_name: "Hemoglobina", clinical_name: "Hemoglobina", category: "laboratory", subcategory: "complete_blood_count_red", unit: "g/dL", data_type: "number", min_value: 0, max_value: 100, decimal_places: 1, description: "Analito.", synonyms: [], display_order: 40, source_kind: "laboratory_reported", choice_options: [] },
];

describe("ConsultationMeasurements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.load.mockResolvedValue({ catalog, values: [], workspaceIds: ["weight", "height"] });
    api.save.mockResolvedValue([{ measurement_type_id: "weight", value: 82.4 }]);
    api.saveWorkspace.mockResolvedValue(["weight", "height", "waist_circumference"]);
  });
  it("shows immediate fields, excludes laboratories, and saves only captured values", async () => {
    render(<ConsultationMeasurements consultation={{ id: "consultation" } as never} />);
    expect(await screen.findByRole("heading", { name: "Mediciones" })).toBeInTheDocument();
    expect(screen.getByLabelText(/peso corporal/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/peso corporal/i), { target: { value: "82.4" } });
    fireEvent.click(screen.getByRole("button", { name: /guardar mediciones/i }));
    await waitFor(() => expect(api.save).toHaveBeenCalledWith(expect.anything(), { weight: 82.4 }));
    fireEvent.change(screen.getByLabelText(/buscar una medición/i), { target: { value: "hemoglobina" } });
    expect(await screen.findByText(/no encontramos una medición disponible/i)).toBeInTheDocument();
  });
  it("adds a searched measurement to the habitual workspace without saving a clinical value", async () => {
    render(<ConsultationMeasurements consultation={{ id: "consultation" } as never} />);
    await screen.findByRole("heading", { name: "Mediciones" });
    fireEvent.change(screen.getByLabelText(/buscar una medición/i), { target: { value: "brazo" } });
    fireEvent.click(await screen.findByRole("button", { name: /agregar al espacio/i }));
    await waitFor(() => expect(api.saveWorkspace).toHaveBeenCalledWith(["weight", "height", "waist_circumference"]));
    expect(api.save).not.toHaveBeenCalled();
  });
});
