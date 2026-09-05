import { describe, expect, it } from "vitest";
import { calculationResultPayload, evaluateCalculationCatalog } from "./engine";
import type { CalculationCatalogItem } from "./catalog";

const measurementCatalog = [
  { id: "weight", code: "weight", unit: "kg" },
  { id: "waist_circumference", code: "waist_circumference", unit: "cm" },
  { id: "hip_circumference", code: "hip_circumference", unit: "cm" },
  { id: "chest_skinfold", code: "chest_skinfold", unit: "mm" },
  { id: "abdominal_skinfold", code: "abdominal_skinfold", unit: "mm" },
  { id: "thigh_skinfold", code: "thigh_skinfold", unit: "mm" },
  { id: "triceps_skinfold", code: "triceps_skinfold", unit: "mm" },
  { id: "suprailiac_skinfold", code: "suprailiac_skinfold", unit: "mm" },
] as never;
const catalog: CalculationCatalogItem[] = [
  { code: "bmi", name: "IMC", category: "index", method_version: "1.0.0", status: "implemented", display_order: 10, definition: { catalogVersion: 1, resultKey: "bmi", resultName: "Índice de masa corporal", methodName: "IMC", summary: "", unit: "kg/m²", decimalPlaces: 1, inputs: [{ key: "weight", label: "Peso", source: "consultation_measurement", measurementCode: "weight" }, { key: "height", label: "Estatura", source: "patient_record", patientField: "height_cm" }], dependencies: [], references: [], limitations: "" } },
  { code: "waist_hip_ratio", name: "ICC", category: "index", method_version: "1.0.0", status: "implemented", display_order: 20, definition: { catalogVersion: 1, resultKey: "waist_hip_ratio", resultName: "Índice cintura/cadera", methodName: "Relación cintura/cadera", summary: "", unit: "razón", decimalPlaces: 2, inputs: [{ key: "waist", label: "Cintura", source: "consultation_measurement", measurementCode: "waist_circumference" }, { key: "hip", label: "Cadera", source: "consultation_measurement", measurementCode: "hip_circumference" }], dependencies: [], references: [], limitations: "" } },
  { code: "waist_height_ratio", name: "ICT", category: "index", method_version: "1.0.0", status: "implemented", display_order: 30, definition: { catalogVersion: 1, resultKey: "waist_height_ratio", resultName: "Índice cintura/talla", methodName: "Relación cintura/talla", summary: "", unit: "razón", decimalPlaces: 2, inputs: [{ key: "waist", label: "Cintura", source: "consultation_measurement", measurementCode: "waist_circumference" }, { key: "height", label: "Estatura", source: "patient_record", patientField: "height_cm" }], dependencies: [], references: [], limitations: "" } },
  { code: "density_jackson_pollock_7", name: "Densidad", category: "density", method_version: "pending", status: "not_implemented", display_order: 110, definition: { catalogVersion: 1, resultKey: "density", resultName: "Densidad", methodName: "Jackson & Pollock 7", summary: "", unit: "g/cm³", decimalPlaces: 5, inputs: [{ key: "sex", label: "Sexo", source: "patient_record", patientField: "equation_sex" }, { key: "age", label: "Edad", source: "patient_derived", derivation: "age_at_consultation" }], dependencies: [], references: [], limitations: "" } },
];
const consultation = { id: "consultation", patient_id: "patient", consultation_date: "2026-09-04T12:00:00Z" } as never;
const patient = { id: "patient", height_cm: 174, birth_date: "1992-06-10", equation_sex: "male" } as never;

describe("interactive calculation engine", () => {
  it("distinguishes empty, partial, calculated, and pending states reactively", () => {
    const empty = evaluateCalculationCatalog({ catalog, measurementCatalog, values: {}, workspaceIds: ["weight"], consultation, patient });
    expect(empty.find((item) => item.item.code === "bmi")).toMatchObject({ state: "partial", availableCount: 1, requiredCount: 2 });
    expect(empty.find((item) => item.item.code === "waist_hip_ratio")).toMatchObject({ state: "insufficient", availableCount: 0 });
    expect(empty.find((item) => item.item.code === "density_jackson_pollock_7")).toMatchObject({ state: "not_implemented", availableCount: 2 });

    const complete = evaluateCalculationCatalog({ catalog, measurementCatalog, values: { weight: "82", waist_circumference: "88", hip_circumference: "101" }, workspaceIds: ["weight", "waist_circumference", "hip_circumference"], consultation, patient });
    expect(complete.find((item) => item.item.code === "bmi")?.rawResult).toBeCloseTo(27.084, 3);
    expect(complete.find((item) => item.item.code === "waist_hip_ratio")?.displayedResult).toBe("0.87");
    expect(complete.find((item) => item.item.code === "waist_height_ratio")?.displayedResult).toBe("0.51");
  });

  it("uses age at the consultation date and never calculates a pending method", () => {
    const evaluated = evaluateCalculationCatalog({ catalog, measurementCatalog, values: {}, workspaceIds: [], consultation, patient });
    const pending = evaluated.find((item) => item.item.code === "density_jackson_pollock_7")!;
    expect(pending.inputs.find((input) => input.key === "age")?.value).toBe(34);
    expect(pending.inputs.find((input) => input.key === "sex")?.value).toBe("male");
    expect(pending.rawResult).toBeUndefined();
  });

  it("does not count empty values and identifies missing measurements outside the workspace", () => {
    const evaluated = evaluateCalculationCatalog({ catalog, measurementCatalog, values: { waist_circumference: "" }, workspaceIds: ["weight"], consultation, patient });
    const ratio = evaluated.find((item) => item.item.code === "waist_hip_ratio")!;
    expect(ratio.state).toBe("insufficient");
    expect(ratio.missingMeasurementIdsOutsideWorkspace).toEqual(["waist_circumference", "hip_circumference"]);
  });

  it("builds a traceable payload only for calculated methods", () => {
    const savedMeasurements = [
      { id: "measurement-weight", measurement_type_id: "weight", value: 82 },
      { id: "measurement-waist", measurement_type_id: "waist_circumference", value: 88 },
      { id: "measurement-hip", measurement_type_id: "hip_circumference", value: 101 },
    ] as never;
    const evaluated = evaluateCalculationCatalog({ catalog, measurementCatalog, values: { weight: "82", waist_circumference: "88", hip_circumference: "101" }, workspaceIds: ["weight", "waist_circumference", "hip_circumference"], consultation, patient, savedMeasurements });
    const payload = calculationResultPayload(evaluated, patient, consultation) as Record<string, { inputs: Record<string, { measurementId?: string }>; patientContext: { age: number } }>;
    expect(Object.keys(payload)).toEqual(["bmi", "waist_hip_ratio", "waist_height_ratio"]);
    expect(payload.bmi.inputs.weight.measurementId).toBe("measurement-weight");
    expect(payload.bmi.patientContext.age).toBe(34);
    expect(payload.density_jackson_pollock_7).toBeUndefined();
  });

  it("resolves sex-specific input sites without conflating mathematical and input status", () => {
    const jp3 = {
      code: "density_jackson_pollock_3",
      name: "Densidad",
      category: "density",
      method_version: "2.0.0-spec",
      status: "not_implemented",
      display_order: 100,
      definition: {
        catalogVersion: 2,
        resultKey: "body_density",
        resultName: "Densidad corporal",
        methodName: "Jackson & Pollock 3",
        summary: "",
        unit: "g/cm³",
        decimalPlaces: 5,
        inputs: [
          { key: "sex", label: "Sexo", source: "patient_record", patientField: "equation_sex" },
          { key: "age", label: "Edad", source: "patient_derived", derivation: "age_at_consultation" },
        ],
        dependencies: [], references: [], limitations: "",
        variants: [
          { code: "male", name: "Masculina", appliesWhen: { equationSex: "male" }, inputs: [
            { key: "chest", label: "Pectoral", source: "consultation_measurement", measurementCode: "chest_skinfold" },
            { key: "abdominal", label: "Abdominal", source: "consultation_measurement", measurementCode: "abdominal_skinfold" },
            { key: "thigh", label: "Muslo", source: "consultation_measurement", measurementCode: "thigh_skinfold" },
          ] },
          { code: "female", name: "Femenina", appliesWhen: { equationSex: "female" }, inputs: [
            { key: "triceps", label: "Tríceps", source: "consultation_measurement", measurementCode: "triceps_skinfold" },
            { key: "suprailiac", label: "Suprailíaco", source: "consultation_measurement", measurementCode: "suprailiac_skinfold" },
            { key: "thigh", label: "Muslo", source: "consultation_measurement", measurementCode: "thigh_skinfold" },
          ] },
        ],
      },
    } as CalculationCatalogItem;
    const evaluated = evaluateCalculationCatalog({ catalog: [jp3], measurementCatalog, values: { chest_skinfold: "10" }, workspaceIds: ["chest_skinfold"], consultation, patient })[0];
    expect(evaluated).toMatchObject({
      implementationState: "pending",
      inputState: "partial",
      state: "not_implemented",
      activeVariant: "Masculina",
      availableMeasurementCount: 1,
      requiredMeasurementCount: 3,
    });
    expect(evaluated.measurementInputs.map((input) => input.measurementCode)).toEqual(["chest_skinfold", "abdominal_skinfold", "thigh_skinfold"]);
    expect(evaluated.measurementInputs.some((input) => input.measurementCode === "triceps_skinfold")).toBe(false);
  });

  it("keeps simultaneous body-composition derivations separate by method code", () => {
    const derived = [
      { item: { code: "fat_mass_jp7_siri", definition: { decimalPlaces: 1 } }, state: "calculated", rawResult: 18.2, displayedResult: "18.2", inputs: [], dependencyResults: { body_fat_jp7_siri: 22.1 } },
      { item: { code: "fat_mass_jp7_brozek", definition: { decimalPlaces: 1 } }, state: "calculated", rawResult: 17.8, displayedResult: "17.8", inputs: [], dependencyResults: { body_fat_jp7_brozek: 21.7 } },
      { item: { code: "fat_free_mass_jp7_siri", definition: { decimalPlaces: 1 } }, state: "calculated", rawResult: 64.1, displayedResult: "64.1", inputs: [], dependencyResults: { fat_mass_jp7_siri: 18.2 } },
      { item: { code: "fat_free_mass_jp7_brozek", definition: { decimalPlaces: 1 } }, state: "calculated", rawResult: 64.5, displayedResult: "64.5", inputs: [], dependencyResults: { fat_mass_jp7_brozek: 17.8 } },
    ] as never;
    const payload = calculationResultPayload(derived, patient, consultation) as Record<string, { dependencies: Record<string, number> }>;
    expect(Object.keys(payload)).toEqual([
      "fat_mass_jp7_siri",
      "fat_mass_jp7_brozek",
      "fat_free_mass_jp7_siri",
      "fat_free_mass_jp7_brozek",
    ]);
    expect(payload.fat_mass_jp7_siri.dependencies).toEqual({ body_fat_jp7_siri: 22.1 });
    expect(payload.fat_mass_jp7_brozek.dependencies).toEqual({ body_fat_jp7_brozek: 21.7 });
  });
});
