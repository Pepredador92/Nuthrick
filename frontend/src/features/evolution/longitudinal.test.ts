import { describe, expect, it } from "vitest";
import { buildLongitudinalHistory, type LongitudinalHistoryInput } from "@/src/features/evolution/longitudinal";
import type { Consultation } from "@/src/types/domain";

const consultations: Consultation[] = [
  { id: "c2", professional_id: "pro", patient_id: "patient", consultation_type: "follow_up", sequence_number: 2, consultation_date: "2026-09-02T10:00:00.000Z", status: "completed", summary: null, completed_at: null, created_at: "2026-09-01T10:00:00.000Z", updated_at: "2026-09-01T10:00:00.000Z" },
  { id: "c1", professional_id: "pro", patient_id: "patient", consultation_type: "initial", sequence_number: 1, consultation_date: "2026-09-01T09:00:00.000Z", status: "completed", summary: null, completed_at: null, created_at: "2026-09-01T08:00:00.000Z", updated_at: "2026-09-01T08:00:00.000Z" },
  { id: "c3", professional_id: "pro", patient_id: "patient", consultation_type: "follow_up", sequence_number: 3, consultation_date: "2026-09-02T15:00:00.000Z", status: "completed", summary: null, completed_at: null, created_at: "2026-09-01T11:00:00.000Z", updated_at: "2026-09-01T11:00:00.000Z" },
];

const input = (overrides: Partial<LongitudinalHistoryInput> = {}): LongitudinalHistoryInput => ({
  consultations,
  catalog: [
    { id: "weight", code: "weight", name: "Peso", display_name: "Peso", clinical_name: "Peso", category: "general", subcategory: "", unit: "kg", data_type: "number", min_value: 0, max_value: 500, decimal_places: 1, description: "", synonyms: [], display_order: 1, source_kind: "system", choice_options: [] },
    { id: "waist", code: "waist", name: "Cintura", display_name: "Cintura", clinical_name: "Cintura", category: "circumference", subcategory: "", unit: "cm", data_type: "number", min_value: 0, max_value: 500, decimal_places: 1, description: "", synonyms: [], display_order: 2, source_kind: "system", choice_options: [] },
    { id: "body_fat", code: "body_fat", name: "Grasa corporal", display_name: "Grasa corporal", clinical_name: "Grasa corporal", category: "bioimpedance", subcategory: "", unit: "%", data_type: "percentage", min_value: 0, max_value: 100, decimal_places: 1, description: "", synonyms: [], display_order: 3, source_kind: "system", choice_options: [] },
  ],
  measurements: [],
  legacyMeasurements: [],
  calculations: [],
  deviceSessions: [],
  laboratoryReports: [],
  laboratoryResults: [],
  ...overrides,
});

describe("buildLongitudinalHistory", () => {
  it("orders by clinical date and keeps an explicit gap instead of carrying a value forward", () => {
    const history = buildLongitudinalHistory(input({
      measurements: [
        { id: "weight-1", consultation_id: "c1", measurement_type_id: "weight", value: 80, unit: "kg", data_type: "number", measured_at: consultations[1].consultation_date },
        { id: "weight-2", consultation_id: "c2", measurement_type_id: "weight", value: 77.5, unit: "kg", data_type: "number", measured_at: consultations[0].consultation_date },
        { id: "waist-1", consultation_id: "c1", measurement_type_id: "waist", value: 92, unit: "cm", data_type: "number", measured_at: consultations[1].consultation_date },
        { id: "waist-3", consultation_id: "c3", measurement_type_id: "waist", value: 88, unit: "cm", data_type: "number", measured_at: consultations[2].consultation_date },
      ],
    }));

    expect(history.consultations.map((item) => item.id)).toEqual(["c1", "c2", "c3"]);
    const waist = history.series.find((item) => item.id.startsWith("measurement:waist"));
    expect(waist?.points.map((item) => [item.consultation_id, item.display_value])).toEqual([
      ["c1", "92"],
      ["c3", "88"],
    ]);
    expect(waist?.points.find((item) => item.consultation_id === "c2")).toBeUndefined();
  });

  it("uses saved calculation results without recalculating and separates methods", () => {
    const history = buildLongitudinalHistory(input({
      calculations: [
        { id: "jp3", consultation_id: "c1", calculation_code: "body_fat_jp3_siri", result_key: "body_fat_percentage", method_name: "JP3 + Siri", method_version: "1", raw_result: 18.4567, displayed_result: "18.46", unit: "%", definition_snapshot: {} },
        { id: "jp7", consultation_id: "c1", calculation_code: "body_fat_jp7_siri", result_key: "body_fat_percentage", method_name: "JP7 + Siri", method_version: "1", raw_result: 20.1, displayed_result: "20.10", unit: "%", definition_snapshot: {} },
      ],
    }));

    const calculated = history.series.filter((item) => item.category === "calculations");
    expect(calculated).toHaveLength(2);
    expect(calculated.map((item) => item.method)).toEqual(["JP3 + Siri", "JP7 + Siri"]);
    expect(calculated[0].points[0].display_value).toBe("18.46");
    expect(calculated[0].points[0].raw_value).toBe(18.4567);
  });

  it("uses the two persisted somatochart coordinates without deriving them again", () => {
    const history = buildLongitudinalHistory(input({
      calculations: [
        { id: "somato-1", consultation_id: "c1", calculation_code: "somatochart_coordinates", result_key: "somatochart_coordinates", method_name: "Heath-Carter", method_version: "2", raw_result: -1.2, displayed_result: "-1.2", unit: "coordenadas", definition_snapshot: { resultName: "Coordenadas de somatocarta" }, result_values: { x: -1.2, y: 3.4 } },
        { id: "somato-2", consultation_id: "c2", calculation_code: "somatochart_coordinates", result_key: "somatochart_coordinates", method_name: "Heath-Carter", method_version: "2", raw_result: -0.8, displayed_result: "-0.8", unit: "coordenadas", definition_snapshot: { resultName: "Coordenadas de somatocarta" }, result_values: { x: -0.8, y: 2.7 } },
      ],
    }));

    const somatochart = history.series.find((item) => item.visualization === "somatochart");
    expect(somatochart?.graphable).toBe(true);
    expect(somatochart?.points.map((point) => point.coordinates)).toEqual([
      { x: -1.2, y: 3.4 },
      { x: -0.8, y: 2.7 },
    ]);
  });

  it("includes linked legacy weight, height and IMC without inventing a consultation", () => {
    const history = buildLongitudinalHistory(input({
      legacyMeasurements: [
        { id: "legacy-linked", professional_id: "pro", patient_id: "patient", consultation_id: "c1", measured_at: consultations[1].consultation_date, weight_kg: 80, height_cm: 174, bmi: 26.42, ideal_weight_kg: null, ideal_weight_method: null, notes: null, created_at: consultations[1].created_at },
        { id: "legacy-unlinked", professional_id: "pro", patient_id: "patient", consultation_id: null, measured_at: consultations[0].consultation_date, weight_kg: 77, height_cm: 174, bmi: 25.44, ideal_weight_kg: null, ideal_weight_method: null, notes: null, created_at: consultations[0].created_at },
      ],
    }));

    expect(history.series.find((item) => item.id.startsWith("measurement:weight"))?.points).toHaveLength(1);
    expect(history.series.find((item) => item.id.startsWith("measurement:height"))?.points[0].display_value).toBe("174");
    expect(history.series.find((item) => item.id === "calculation:legacy:bmi:registered:")?.points[0].display_value).toBe("26.42");
  });

  it("keeps device values separate by physical device provenance", () => {
    const history = buildLongitudinalHistory(input({
      deviceSessions: [
        { id: "inbody-session", consultation_id: "c1", professional_device_id: "inbody", capture_source: "manual", device_snapshot: { alias: "InBody clínica", manufacturer: "InBody", model: "770" } },
        { id: "tanita-session", consultation_id: "c2", professional_device_id: "tanita", capture_source: "manual", device_snapshot: { alias: "Tanita consultorio", manufacturer: "Tanita", model: "MC-780" } },
      ],
      measurements: [
        { id: "inbody-fat", consultation_id: "c1", measurement_type_id: "body_fat", value: 24.1, unit: "%", data_type: "percentage", measured_at: consultations[1].consultation_date, device_session_id: "inbody-session" },
        { id: "tanita-fat", consultation_id: "c2", measurement_type_id: "body_fat", value: 22.6, unit: "%", data_type: "percentage", measured_at: consultations[0].consultation_date, device_session_id: "tanita-session" },
      ],
    }));

    const bioimpedance = history.series.filter((item) => item.category === "bioimpedance");
    expect(bioimpedance).toHaveLength(2);
    expect(bioimpedance.map((item) => item.label)).toEqual(expect.arrayContaining([
      "Grasa corporal · InBody clínica · 770",
      "Grasa corporal · Tanita consultorio · MC-780",
    ]));
  });

  it("preserves laboratory units, method provenance and comparators", () => {
    const report = (id: string, consultationId: string, method: string) => ({
      id, professional_id: "pro", patient_id: "patient", consultation_id: consultationId,
      report_name: null, laboratory_name: "Laboratorio Central", sample_date: "2026-09-01", sample_time: null, report_date: null,
      fasting_status: "unknown" as const, fasting_hours: null, sample_type: "Suero", analytical_method: method,
      notes: null, external_identifier: null, capture_origin: "manual" as const, created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z",
    });
    const result = (id: string, reportId: string, consultationId: string, unit: string, original: string, comparator: "<" | null = null) => ({
      id, professional_id: "pro", patient_id: "patient", consultation_id: consultationId, report_id: reportId,
      analyte_id: "glucose", custom_analyte_id: null, analyte_code_snapshot: "glucose", analyte_name_snapshot: "Glucosa", analyte_clinical_name_snapshot: null, analyte_synonyms_snapshot: [],
      result_kind: "numeric" as const, numeric_comparator: comparator, numeric_value: comparator ? 5 : 90, text_value: null, result_value_original: original, unit,
      reference_text: null, reference_lower: null, reference_upper: null, reference_lower_inclusive: true, reference_upper_inclusive: true, reference_unit: unit,
      laboratory_flag: null, range_comparison: "not_comparable" as const, notes: null, created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z",
    });
    const history = buildLongitudinalHistory(input({
      laboratoryReports: [report("r1", "c1", "Hexoquinasa"), report("r2", "c2", "Hexoquinasa")],
      laboratoryResults: [
        result("mg", "r1", "c1", "mg/dL", "90"),
        result("mmol", "r2", "c2", "mmol/L", "5.0"),
        result("less", "r2", "c2", "mg/dL", "<5", "<"),
      ],
    }));

    const labs = history.series.filter((item) => item.category === "laboratories");
    expect(labs).toHaveLength(2);
    expect(labs.find((item) => item.unit === "mg/dL")?.points.map((point) => point.display_value)).toEqual(["90", "<5"]);
    expect(labs.find((item) => item.unit === "mg/dL")?.graphable).toBe(false);
    expect(labs.find((item) => item.unit === "mmol/L")?.provenance).toContain("Hexoquinasa");
  });
});
