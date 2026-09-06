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
});
