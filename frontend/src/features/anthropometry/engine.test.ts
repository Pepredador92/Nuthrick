import { describe, expect, it } from "vitest";
import {
  calculate,
  compare,
  createNote,
  latestRecords,
  validateInput,
  formulas,
} from "./engine";
import { newPayload, type AnthroRecord, type AssessmentInput } from "./model";

function input(): AssessmentInput {
  const i = newPayload("2026-09-03T12:00:00Z", 30).input;
  return {
    ...i,
    context: "adult",
    sex: "male",
    protocol: "ISAK 2019",
    scale: "Báscula A",
    caliper: "Plicómetro A",
    measurements: {
      weight: 80,
      height: 175,
      waist: 92,
      hip: 105,
      chest: 10,
      axillary: 12,
      triceps: 14,
      subscapular: 16,
      suprailiac: 18,
      abdomen: 20,
      thigh: 22,
    },
    selected: ["bmi", "whr", "jp7", "siri", "brozek"],
  };
}
function record(
  i: AssessmentInput,
  id = "previous",
  revision = 1,
): AnthroRecord {
  const payload = newPayload(i.measuredAt, i.age);
  payload.input = i;
  payload.results = calculate(i).results;
  return {
    id: id + revision,
    consultation_id: id,
    patient_id: "p",
    professional_id: "owner",
    revision,
    measured_at: i.measuredAt,
    created_at: i.measuredAt,
    payload,
  };
}
const result = (i: AssessmentInput, id: string) =>
  calculate(i).results.find((r) => r.id === id)!;

describe("antropometría: cálculos y referencias", () => {
  it("uses kg and cm without rounding the persisted results", () => {
    const i = input();
    expect(result(i, "bmi").value).toBeCloseTo(26.12244897959, 10);
    expect(result(i, "whr").value).toBeCloseTo(92 / 105, 12);
    expect(result(i, "bmi")).toMatchObject({
      unit: "kg/m²",
      classification: "Sobrepeso",
      reference_id: expect.any(String),
      reference_version: expect.any(String),
      calculation: expect.stringContaining("IMC ="),
    });
    expect(result(i, "whr").classification).toBeNull();
  });
  it.each([18.49, 18.5, 24.99, 25, 29.99, 30, 34.99, 35, 39.99, 40])(
    "classifies boundaries using a versioned reference: %s",
    (value) => {
      const i = input();
      i.measurements = { height: 100, weight: value };
      const r = result(i, "bmi");
      expect(r.classification).toBe(
        value < 18.5
          ? "Bajo peso"
          : value < 25
            ? "Intervalo de peso normal"
            : value < 30
              ? "Sobrepeso"
              : value < 35
                ? "Obesidad, clase I"
                : value < 40
                  ? "Obesidad, clase II"
                  : "Obesidad, clase III",
      );
    },
  );
  it("does not classify without a confirmed applicable adult reference", () => {
    for (const patch of [
      { age: 17 },
      { age: null },
      { context: "pregnancy" as const },
      { context: "" as const },
      { bmiReference: false },
    ]) {
      const r = result({ ...input(), ...patch }, "bmi");
      expect(r.value).toBeGreaterThan(0);
      expect(r.classification).toBeNull();
      expect(r.reference_id).toBeNull();
      expect(r.reference_version).toBeNull();
    }
  });
  it.each(["male", "female"] as const)(
    "implements published JP7 coefficients and separate Siri/Brozek: %s",
    (sex) => {
      const i = { ...input(), sex },
        sum = 112;
      const d =
        sex === "male"
          ? 1.112 - 0.00043499 * sum + 0.00000055 * sum * sum - 0.00028826 * 30
          : 1.097 - 0.00046971 * sum + 0.00000056 * sum * sum - 0.00012828 * 30;
      expect(result(i, "jp7").value).toBeCloseTo(d, 12);
      expect(result(i, "siri").value).toBeCloseTo(495 / d - 450, 12);
      expect(result(i, "brozek").value).toBeCloseTo(457 / d - 414.2, 12);
      expect(result(i, "siri").inputs["Suma de pliegues (mm)"]).toBe(112);
      expect(result(i, "siri").calculation).toContain("0.00043499");
      expect(result(i, "siri").classification).toBeNull();
      expect(result(i, "siri-fat_mass").value).toBeCloseTo(
        (80 * (495 / d - 450)) / 100,
        10,
      );
      expect(
        result(i, "siri-ffm").value + result(i, "siri-fat_mass").value,
      ).toBeCloseTo(80, 10);
    },
  );
  it("requires every skinfold and explicitly supplied equation sex and applicability", () => {
    for (const patch of [
      { sex: "" as const },
      { age: null },
      { age: 17 },
      { age: 62 },
      { context: "pregnancy" as const },
      { sex: "female" as const, age: 56 },
      { measurements: { ...input().measurements, thigh: undefined } },
    ]) {
      const c = calculate({ ...input(), ...patch });
      expect(
        c.results.some((r) => ["jp7", "siri", "brozek"].includes(r.id)),
      ).toBe(false);
      expect(c.notices.length).toBeGreaterThan(0);
    }
  });
  it("rejects nonfinite, impossible, and wrong-unit inputs; retains explicit zero fasting", () => {
    for (const measurements of [
      { weight: -1 },
      { height: 0 },
      { chest: 121 },
      { weight: NaN },
      { weight: Infinity },
    ])
      expect(
        validateInput({ ...input(), measurements }).length,
      ).toBeGreaterThan(0);
    const i = input();
    i.bia = { ...i.bia, device: "Tanita A", fat: 24.1, fastingHours: 0 };
    expect(validateInput(i)).toEqual([]);
    expect(result(i, "bia")).toMatchObject({
      provenance: "device",
      value: 24.1,
      classification: null,
    });
    i.bia.device = "";
    expect(validateInput(i)).toContain(
      "Identifica fabricante, modelo y equipo de bioimpedancia.",
    );
    expect(
      formulas.every(
        (f) =>
          f.sources.length &&
          f.limitations &&
          f.applicability &&
          f.requires &&
          f.calculation &&
          f.version,
      ),
    ).toBe(true);
  });
});
describe("antropometría: evolución e historia", () => {
  it("matches method, unit, protocol, device and uses percentage points", () => {
    const prior = input();
    prior.measuredAt = "2026-08-01T12:00:00Z";
    prior.measurements.weight = 83;
    prior.bia = {
      ...prior.bia,
      device: "Tanita A",
      protocol: "modo estándar v1",
      fat: 25.4,
      fastingHours: 8,
      recentExercise: "no",
    };
    const current = structuredClone(prior);
    current.measuredAt = "2026-09-01T12:00:00Z";
    current.measurements.weight = 80;
    current.bia.fat = 24.1;
    current.bia.fastingHours = 3;
    current.bia.recentExercise = "yes";
    const rows = [record(prior)];
    const results = compare(
      calculate(current).results,
      current,
      rows,
      "current",
    );
    expect(results.find((r) => r.id === "weight")?.previous?.delta).toBe(-3);
    expect(results.find((r) => r.id === "bia")?.previous?.delta).toBeCloseTo(
      -1.3,
      12,
    );
    expect(results.find((r) => r.id === "bia")?.previous).toMatchObject({
      value: 25.4,
      conditionsDiffer: true,
      conditions: { fastingHours: 8 },
    });
    const note = createNote(results, current);
    expect(note).toContain("-1.3 puntos porcentuales");
    expect(note).toContain("ejercicio reciente: sí");
    expect(note).toContain("ayuno 8 h");
    expect(note).toContain("ayuno 3 h");
    expect(note).not.toContain("padece");
    expect(note).not.toContain("Debe");
    expect(createNote(results, current)).toBe(note);
    expect(rows[0].payload.results.every((r) => !r.previous)).toBe(true);
    const onlySiri = structuredClone(rows);
    onlySiri[0].payload.results = onlySiri[0].payload.results.filter(
      (r) => r.id === "siri",
    );
    expect(
      compare(calculate(current).results, current, onlySiri, "current").find(
        (r) => r.id === "bia",
      )?.previous,
    ).toBeUndefined();
    current.bia.device = "Tanita B";
    expect(
      compare(calculate(current).results, current, rows, "current").find(
        (r) => r.id === "bia",
      )?.previous,
    ).toBeUndefined();
    current.protocol = "Other protocol";
    expect(
      compare(calculate(current).results, current, rows, "current").find(
        (r) => r.id === "weight",
      )?.previous,
    ).toBeUndefined();
    const wrongUnit = structuredClone(rows);
    wrongUnit[0].payload.results.find((r) => r.id === "weight")!.unit = "lb";
    expect(
      compare(
        calculate(prior).results,
        { ...prior, measuredAt: current.measuredAt },
        wrongUnit,
        "current",
      ).find((r) => r.id === "weight")?.previous,
    ).toBeUndefined();
  });
  it("uses the latest revision only, excludes future/same consultation, and never recalculates history", () => {
    const old = input();
    old.measuredAt = "2026-08-01T12:00:00Z";
    const a = record(old, "old", 1),
      b = record(old, "old", 2),
      future = record({ ...old, measuredAt: "2027-01-01T12:00:00Z" }, "future"),
      same = record(old, "current");
    b.payload.results.find((r) => r.id === "bmi")!.value = 99; // Historical exact value, not today's recomputation.
    const rows = [a, future, same, b];
    const before = JSON.stringify(rows);
    expect(
      latestRecords(rows).filter((r) => r.consultation_id === "old"),
    ).toEqual([b]);
    expect(
      compare(calculate(input()).results, input(), rows, "current").find(
        (r) => r.id === "bmi",
      )?.previous?.value,
    ).toBe(99);
    expect(JSON.stringify(rows)).toBe(before);
    const unknown = { ...input(), protocol: "" };
    expect(
      compare(calculate(unknown).results, unknown, rows, "current").every(
        (r) => !r.previous,
      ),
    ).toBe(true);
  });
  it("generates only recorded content and no diagnostic interpretation", () => {
    const i = newPayload("2026-09-03T12:00:00Z", null).input;
    i.measurements.weight = 80;
    const note = createNote(calculate(i).results, i);
    expect(note).toContain("Peso: 80 kg");
    expect(note).not.toContain("IMC:");
    expect(note).not.toContain("Sin registrar");
    expect(note).not.toContain("No registrado");
    expect(note).toContain("INTERPRETACIÓN PROFESIONAL\n\nPLAN DE MONITOREO");
    expect(newPayload(i.measuredAt, null).diagnosis).toMatchObject({
      enabled: false,
      problem: "",
      etiology: "",
      evidence: [],
    });
  });
});
