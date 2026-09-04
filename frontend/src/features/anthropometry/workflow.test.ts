import { describe, expect, it } from "vitest";
import { measurementTypes } from "./catalog";
import {
  bmi,
  waistHipRatio,
  waistHeightRatio,
  siri,
  brozek,
  fatMass,
  fatFreeMass,
  leanBodyFat,
  heathCarterEndomorphy,
  heathCarterMesomorphy,
  heathCarterEctomorphy,
  requiredMeasurements,
  selectedMeasurements,
  evaluateWorkflow,
  calculationSignature,
  validateEntries,
} from "./calculations";
import {
  newWorkflow,
  createEntry,
  ageAt,
  preparePayload,
  previousHeight,
} from "./workflow";
import { newPayload, type AnthroRecord } from "./model";
import type { Consultation, Patient } from "@/src/types/domain";
import type {
  MeasurementDevice,
  PatientMeasurementTemplate,
} from "./workflowTypes";
export const patient = {
  id: "a3000000-0000-4000-8000-000000000003",
  professional_id: "a1000000-0000-4000-8000-000000000001",
  birth_date: "1990-05-10",
  equation_sex: "male",
} as Patient;
export const consultation = {
  id: "a5000000-0000-4000-8000-000000000005",
  patient_id: patient.id,
  professional_id: patient.professional_id,
  status: "draft",
  consultation_type: "initial",
  consultation_date: "2025-05-10T12:00:00Z",
} as Consultation;
function setup() {
  const w = newWorkflow(patient, consultation, null);
  w.configuration.indicators = ["bmi"];
  w.configuration.calculations = ["bmi"];
  w.configuration.protocol = "Protocolo A";
  w.configuration.scale = "Báscula A";
  for (const [code, value] of [
    ["weight", 80],
    ["height", 180],
  ] as const)
    w.entries[code] = createEntry(
      measurementTypes.find((t) => t.code === code)!,
      value,
      w,
      consultation,
      consultation.consultation_date,
      [],
    );
  const input = newPayload(consultation.consultation_date, 35).input;
  input.context = "adult";
  return { w, input };
}
describe("mediciones guiadas: catálogo, dependencias y precisión", () => {
  it("calculates only formulas selected by the professional", () => {
    const { w, input } = setup();
    w.configuration.indicators = [];
    w.configuration.methods = [];
    w.configuration.calculations = [];
    w.configuration.measurements = ["weight", "height"];
    expect(evaluateWorkflow(w, input, measurementTypes).calculated).toEqual([]);
    w.configuration.calculations = ["bmi"];
    const evaluation = evaluateWorkflow(w, input, measurementTypes);
    expect(evaluation.calculated.map((result) => result.calculation_code)).toEqual([
      "bmi",
    ]);
    expect(evaluation.statuses).toEqual([
      expect.objectContaining({ key: "bmi", state: "available" }),
    ]);
  });
  it("contains every requested measurement group with stable codes", () => {
    expect(
      measurementTypes.filter((t) => t.category === "circumference"),
    ).toHaveLength(8);
    expect(
      measurementTypes.filter((t) => t.category === "skinfold"),
    ).toHaveLength(10);
    expect(
      measurementTypes.filter((t) => t.category === "diameter"),
    ).toHaveLength(5);
    expect(
      measurementTypes.filter((t) => t.category === "bioimpedance"),
    ).toHaveLength(21);
    expect(new Set(measurementTypes.map((t) => t.code)).size).toBe(
      measurementTypes.length,
    );
  });
  it("implements reference numeric examples without intermediate rounding", () => {
    expect(bmi(80, 180)).toBeCloseTo(24.69135802469, 10);
    expect(waistHipRatio(80, 100)).toBe(0.8);
    expect(waistHeightRatio(85, 170)).toBe(0.5);
    expect(siri(1.05)).toBeCloseTo(21.42857142857, 10);
    expect(brozek(1.05)).toBeCloseTo(21.03809523809, 10);
    expect(fatMass(80, 20)).toBe(16);
    expect(fatFreeMass(80, 16)).toBe(64);
    expect(leanBodyFat(90, 15, 35, "male")).toBeCloseTo(24.935, 10);
    expect(heathCarterEndomorphy(10, 12, 8, 170.18)).toBeCloseTo(3.0606, 3);
    expect(heathCarterMesomorphy(7, 10, 32, 10, 38, 12, 175)).toBeCloseTo(5.3438, 3);
    expect(heathCarterEctomorphy(180, 80)).toBeCloseTo(1.99878723584, 10);
  });
  it("resolves shared inputs once and names exactly what is missing", () => {
    const { w, input } = setup();
    w.configuration.indicators = [
      "bmi",
      "waist_hip_ratio",
      "waist_height_ratio",
      "fat_mass",
      "fat_free_mass",
    ];
    w.configuration.calculations = [
      "bmi",
      "waist_hip_ratio",
      "waist_height_ratio",
      "jp7_siri",
    ];
    w.configuration.measurements = ["weight", "waist_circumference"];
    const fields = selectedMeasurements(w.configuration);
    expect(fields.filter((k) => k === "weight")).toHaveLength(1);
    expect(fields).toContain("waist_circumference");
    expect(fields).not.toContain("biceps_skinfold");
    expect(
      requiredMeasurements(w.configuration).get("waist_circumference")?.length,
    ).toBeGreaterThanOrEqual(2);
    const e = evaluateWorkflow(w, input, measurementTypes);
    expect(e.statuses.find((s) => s.key === "bmi")?.state).toBe("available");
    expect(
      e.statuses.find((s) => s.key === "jp7_siri")?.missing,
    ).toContain("Axilar medio");
    expect(
      e.statuses.find((s) => s.key === "jp7_siri")?.missing,
    ).toContain("Subescapular");
  });
  it("keeps original IDs, dependencies, age and raw/display in each calculation", () => {
    const { w, input } = setup();
    const e = evaluateWorkflow(
      w,
      input,
      measurementTypes,
      "2025-05-10T13:00:00Z",
    );
    const r = e.calculated[0];
    expect(r).toMatchObject({
      raw_value: bmi(80, 180),
      display_value: 24.7,
      calculated_at: "2025-05-10T13:00:00Z",
      source_type: "calculated",
      reference_id: "who-adult-bmi",
    });
    expect(r.inputs_json.weight.measurement_id).toBe(w.entries.weight.id);
    expect(r.dependency_ids).toContain(w.entries.height.id);
    w.calculations = e.calculated;
    w.calculation_signature = calculationSignature(w, input);
    expect(
      evaluateWorkflow(w, input, measurementTypes, "2030-01-01T00:00:00Z")
        .calculated[0],
    ).toEqual(r);
    w.entries.weight = {
      ...w.entries.weight,
      id: crypto.randomUUID(),
      value: 85,
    };
    const recalculated = evaluateWorkflow(
      w,
      input,
      measurementTypes,
      "2025-05-10T14:00:00Z",
    ).calculated[0];
    expect(recalculated.recalculated_at).toBe("2025-05-10T14:00:00Z");
    expect(recalculated.calculation_id).not.toBe(r.calculation_id);
    expect(r.raw_value).toBe(bmi(80, 180));
  });
  it("builds the complete density→fat→fat mass→FFM chain with explicit dependencies", () => {
    const { w, input } = setup();
    w.configuration.indicators = ["fat_free_mass"];
    w.configuration.methods = ["jp7_siri", "jp7_brozek"];
    w.configuration.calculations = ["jp7_siri", "jp7_brozek"];
    w.configuration.caliper = "Caliper";
    for (const t of measurementTypes.filter((t) => t.category === "skinfold"))
      w.entries[t.code] = createEntry(
        t,
        15,
        w,
        consultation,
        consultation.consultation_date,
        [],
      );
    const e = evaluateWorkflow(w, input, measurementTypes);
    const d = e.calculated.find(
      (r) => r.calculation_code === "jackson_pollock_7",
    )!;
    expect(
      e.calculated.filter((r) => r.calculation_code === "jackson_pollock_7"),
    ).toHaveLength(1);
    const sf = e.calculated.find(
      (r) => r.calculation_code === "body_fat_jp7_siri",
    )!;
    expect(sf.dependency_ids).toContain(d.calculation_id);
    const mass = e.calculated.find(
        (r) => r.calculation_code === "fat_mass_jp7_siri",
      )!,
      ffm = e.calculated.find(
        (r) => r.calculation_code === "fat_free_mass_jp7_siri",
      )!;
    expect(mass.dependency_ids).toContain(sf.calculation_id);
    expect(ffm.dependency_ids).toContain(mass.calculation_id);
    expect(ffm.raw_value + mass.raw_value).toBeCloseTo(80, 12);
    expect(ffm.inputs_json.triceps_skinfold.measurement_id).toBe(
      w.entries.triceps_skinfold.id,
    );
    expect(sf.compatibilityKey).not.toBe(
      e.calculated.find((r) => r.calculation_code === "body_fat_jp7_brozek")!
        .compatibilityKey,
    );
  });
  it("never relabels a device value as calculated; derives composition separately", () => {
    const { w, input } = setup();
    const device = {
      id: "a6000000-0000-4000-8000-000000000006",
      manufacturer: "InBody",
      model: "270",
      device_type: "bioimpedance",
      technology: "BIA",
      notes: "",
      is_system_device: true,
      created_by: null,
    } satisfies MeasurementDevice;
    w.configuration.deviceId = device.id;
    w.configuration.biaProtocol = "Standard";
    w.configuration.indicators = ["fat_free_mass"];
    w.configuration.methods = ["device"];
    w.configuration.calculations = ["device_composition"];
    w.entries.body_fat_percentage_device = createEntry(
      measurementTypes.find((t) => t.code === "body_fat_percentage_device")!,
      20,
      w,
      consultation,
      consultation.consultation_date,
      [device],
    );
    const e = evaluateWorkflow(w, input, measurementTypes);
    expect(
      e.registered.find((r) => r.code === "body_fat_percentage_device")
        ?.source_type,
    ).toBe("device");
    expect(
      e.calculated.find((r) => r.calculation_code === "fat_mass_device")
        ?.raw_value,
    ).toBe(16);
    expect(
      e.calculated.find((r) => r.calculation_code === "fat_free_mass_device")
        ?.raw_value,
    ).toBe(64);
    expect(
      e.calculated.some(
        (r) => r.calculation_code === "body_fat_percentage_device",
      ),
    ).toBe(false);
    w.entries.body_fat_percentage_device.device_id = null;
    expect(validateEntries(w, measurementTypes)).toContain(
      "Grasa corporal: selecciona un equipo.",
    );
  });
});
describe("plantilla por paciente y contexto histórico", () => {
  it("uses age on the date of consultation and explicit equation sex, never gender inference", () => {
    expect(ageAt("1990-05-10", "2025-05-10T12:00:00Z")).toBe(35);
    expect(ageAt("1990-05-10", "2025-05-09T12:00:00Z")).toBe(34);
    expect(
      newWorkflow(
        { ...patient, equation_sex: null, gender: "male" },
        consultation,
        null,
      ).context.sex,
    ).toBe("");
  });
  it("reuses only configuration in the next consultation; never previous weight or circumference", () => {
    const { w } = setup();
    w.configuration.measurements = ["waist_circumference"];
    const template = {
      patient_id: patient.id,
      professional_id: patient.professional_id,
      revision: 3,
      configuration: w.configuration,
    } as PatientMeasurementTemplate;
    const next = preparePayload(
      patient,
      {
        ...consultation,
        id: "next",
        consultation_date: "2026-06-10T12:00:00Z",
      },
      template,
    );
    expect(next.workflow!.configuration).toEqual(w.configuration);
    expect(next.workflow!.entries).toEqual({});
    expect(next.workflow!.context.age).toBe(36);
    next.workflow!.configuration.measurements.push("calf_circumference");
    expect(template.configuration.measurements).not.toContain(
      "calf_circumference",
    );
  });
  it("keeps an existing consultation's config independent of future templates", () => {
    const { w, input } = setup();
    const payload = {
      ...newPayload(consultation.consultation_date, 35),
      input,
      workflow: w,
    };
    const record = {
      id: "record",
      consultation_id: consultation.id,
      payload,
      measured_at: consultation.consultation_date,
    } as AnthroRecord;
    const template = {
      revision: 4,
      configuration: { ...w.configuration, indicators: [] },
    } as unknown as PatientMeasurementTemplate;
    const loaded = preparePayload(patient, consultation, template, record);
    expect(loaded.workflow!.configuration.indicators).toEqual(["bmi"]);
    expect(loaded.workflow!.templateRevision).toBe(4);
    expect(record.payload.workflow!.templateRevision).toBe(0);
  });
  it("offers prior height with original date and identity without copying automatically", () => {
    const { w, input } = setup();
    const record = {
      id: "r",
      patient_id: patient.id,
      professional_id: patient.professional_id,
      consultation_id: "prior",
      revision: 1,
      measured_at: "2024-05-10T12:00:00Z",
      payload: { ...newPayload(input.measuredAt, 35), workflow: w },
    } as AnthroRecord;
    const h = previousHeight([record], [], consultation)!;
    expect(h.value).toBe(180);
    expect(h.id).toBe(w.entries.height.id);
  });
});
