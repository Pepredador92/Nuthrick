import { describe, expect, it } from "vitest";
import { evolutionTextExport, exportableSeries } from "./exportEvolution";
import type { LongitudinalHistory } from "./longitudinal";

const history: LongitudinalHistory = {
  consultations: [],
  series: [
    {
      id: "weight",
      label: "Peso",
      category: "measurements",
      concept: "Peso",
      unit: "kg",
      sourceType: "manual_measurement",
      method: null,
      provenance: null,
      graphable: true,
      points: [{ consultation_id: "one", consultation_date: "2026-09-01T12:00:00Z", raw_value: 64.5, display_value: "64.5", unit: "kg", source_reference: {} }],
    },
    {
      id: "note",
      label: "Nota cualitativa",
      category: "measurements",
      concept: "Nota",
      unit: null,
      sourceType: "manual_measurement",
      method: null,
      provenance: null,
      graphable: false,
      points: [{ consultation_id: "one", consultation_date: "2026-09-01T12:00:00Z", raw_value: "estable", display_value: "estable", unit: null, source_reference: {} }],
    },
  ],
};

const patient = {
  id: "patient",
  full_name: "Ana Pérez",
  birth_date: null,
  email: null,
  phone: null,
  country_code: null,
} as never;

const professional = { fullName: "Dra. Nutri", professionalTitle: "Nutrióloga", licenseNumber: "123", contactLines: [] };

describe("evolution export", () => {
  it("exports only selected numeric indicators and professional identity", () => {
    const text = evolutionTextExport(patient, history, { seriesIds: ["weight", "note"] }, professional);
    expect(text).toContain("Profesional: Dra. Nutri · Nutrióloga");
    expect(text).toContain("Peso");
    expect(text).toContain("64.5 kg");
    expect(text).not.toContain("Nota cualitativa");
  });

  it("does not expose unselected series to the PDF export input", () => {
    expect(exportableSeries(history, { seriesIds: ["note"] })).toEqual([]);
  });

  it("exports persisted somatochart coordinates as X and Y values", () => {
    const somatoHistory: LongitudinalHistory = {
      consultations: [],
      series: [{
        id: "somatochart", label: "Somatocarta", category: "calculations", concept: "Somatocarta", unit: "coordenadas",
        sourceType: "calculation", method: "Heath-Carter", provenance: "Heath-Carter · v2", visualization: "somatochart", graphable: true,
        points: [{ consultation_id: "one", consultation_date: "2026-09-01T12:00:00Z", raw_value: -1.2, display_value: "-1.2", unit: "coordenadas", source_reference: {}, coordinates: { x: -1.2, y: 3.4 } }],
      }],
    };
    const text = evolutionTextExport(patient, somatoHistory, { seriesIds: ["somatochart"] }, professional);
    expect(text).toContain("X -1.2 · Y 3.4");
  });
});
