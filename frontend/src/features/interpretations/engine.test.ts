import { describe, it, expect } from "vitest";
import catalog from "./references.json";
import type { InterpretationContext, InterpretationReference } from "./types";
import {
  classifyHeathCarterSomatotype,
  extendInterpretationContext,
  interpretResult,
  interpretationContext,
  pregnancyFromLifeStage,
} from "./engine";
const references = catalog as InterpretationReference[];
const ctx: InterpretationContext = {
  age: 34,
  sex: "male",
  pregnant: false,
  bmi: 28,
};
const interpret = (code: string, n: number, context = ctx, refs = references) =>
  interpretResult(
    code,
    n,
    code === "bmi"
      ? "kg/m²"
      : code.startsWith("somatotype_")
        ? "componente"
        : code === "somatochart_coordinates"
          ? "coordenadas"
          : code.startsWith("body_fat_")
            ? "%"
            : "razón",
    context,
    refs,
    "consultation-1",
    "2026-09-05T12:00:00Z",
  );
describe("interpretation rules independent of formulas", () => {
  it.each([
    [18.49999, "underweight"],
    [18.5, "normal"],
    [24.96, "normal"],
    [24.99999, "normal"],
    [25, "overweight"],
    [29.99999, "overweight"],
    [30, "obesity-i"],
    [34.99999, "obesity-i"],
    [35, "obesity-ii"],
    [39.99999, "obesity-ii"],
    [40, "obesity-iii"],
  ])("classifies unrounded BMI %s at exact boundaries", (value, expected) =>
    expect(interpret("bmi", Number(value)).rule?.id).toBe(expected),
  );
  it("does not extend component descriptors below the manual's 0.5 lower bound", () => {
    expect(interpret("somatotype_ectomorphy", 0.1).state).toBe(
      "not_applicable",
    );
  });
  it.each([
    ["male", 0.89999, "male-below"],
    ["male", 0.9, "male-increased"],
    ["female", 0.84999, "female-below"],
    ["female", 0.85, "female-increased"],
  ])("uses WHR boundary by sex %s %s", (sex, n, id) =>
    expect(
      interpret("waist_hip_ratio", Number(n), { ...ctx, sex }).rule?.id,
    ).toBe(id),
  );
  it.each([
    [0.39, null],
    [0.4, "healthy"],
    [0.49, "healthy"],
    [0.49999, "healthy"],
    [0.5, "increased"],
    [0.59, "increased"],
    [0.59999, "increased"],
    [0.6, "high"],
  ])("uses NICE boundary %s without filling undefined ranges", (n, id) =>
    expect(interpret("waist_height_ratio", Number(n)).rule?.id ?? null).toBe(
      id,
    ),
  );
  it.each([
    [2.74, "low", 2.5],
    [2.75, "moderate", 3],
    [5.24, "moderate", 5],
    [5.25, "high", 5.5],
    [7.24, "high", 7],
    [7.25, "very-high", 7.5],
  ])(
    "classifies Heath-Carter component magnitude after half-unit rounding %s",
    (value, id, evaluatedValue) => {
      for (const code of [
        "somatotype_endomorphy",
        "somatotype_mesomorphy",
        "somatotype_ectomorphy",
      ]) {
        const result = interpret(code, Number(value));
        expect(result.rule?.id).toBe(id);
        expect(result.evaluatedValue).toBe(evaluatedValue);
        expect(result.value).toBe(value);
      }
    },
  );
  it.each([
    ["central", 3, 3, 4],
    ["balanced-endomorph", 4, 2, 2],
    ["mesomorphic-endomorph", 5, 3, 2],
    ["mesomorph-endomorph", 4, 4, 2],
    ["endomorphic-mesomorph", 3, 5, 1],
    ["balanced-mesomorph", 2, 5, 2],
    ["ectomorphic-mesomorph", 2, 5, 3],
    ["mesomorph-ectomorph", 2, 4, 4],
    ["mesomorphic-ectomorph", 2, 3, 4],
    ["balanced-ectomorph", 2, 2, 4],
    ["endomorphic-ectomorph", 3, 1, 5],
    ["endomorph-ectomorph", 4, 2, 4],
    ["ectomorphic-endomorph", 5, 2, 4],
  ])(
    "reproduces Heath-Carter category %s",
    (category, endomorphy, mesomorphy, ectomorphy) => {
      const dependencyResults = {
        somatotype_endomorphy: Number(endomorphy),
        somatotype_mesomorphy: Number(mesomorphy),
        somatotype_ectomorphy: Number(ectomorphy),
      };
      expect(
        classifyHeathCarterSomatotype(
          dependencyResults.somatotype_endomorphy,
          dependencyResults.somatotype_mesomorphy,
          dependencyResults.somatotype_ectomorphy,
        ),
      ).toBe(category);
      expect(
        interpret(
          "somatochart_coordinates",
          Number(ectomorphy) - Number(endomorphy),
          extendInterpretationContext(ctx, dependencyResults),
        ).rule?.id,
      ).toBe(category);
    },
  );
  it("honors the exact one-unit and half-unit Heath-Carter tolerances", () => {
    expect(classifyHeathCarterSomatotype(3, 3, 4)).toBe("central");
    expect(classifyHeathCarterSomatotype(3, 3, 4.01)).toBe(
      "balanced-ectomorph",
    );
    expect(classifyHeathCarterSomatotype(4, 3.5, 2)).toBe(
      "mesomorph-endomorph",
    );
    expect(classifyHeathCarterSomatotype(4, 3.49, 2)).toBe(
      "mesomorphic-endomorph",
    );
  });
  it("requires all three components before assigning a somatotype category", () => {
    const context = extendInterpretationContext(ctx, {
      somatotype_endomorphy: 3,
      somatotype_mesomorphy: 5,
    });
    expect(interpret("somatochart_coordinates", 0, context).state).toBe(
      "missing_context",
    );
  });
  it.each([
    ["bmi", { ...ctx, age: null }, "missing_context"],
    ["bmi", { ...ctx, age: 17 }, "not_applicable"],
    ["bmi", { ...ctx, pregnant: null }, "missing_context"],
    ["bmi", { ...ctx, pregnant: true }, "not_applicable"],
    ["waist_hip_ratio", { ...ctx, sex: null }, "missing_context"],
    ["waist_height_ratio", { ...ctx, bmi: null }, "missing_context"],
    ["waist_height_ratio", { ...ctx, bmi: 35 }, "not_applicable"],
  ])(
    "blocks inapplicable or incomplete context %s %j",
    (code, context, state) => {
      const r = interpret(String(code), 0.52, context as InterpretationContext);
      expect(r.state).toBe(state);
      expect(r.rule).toBeNull();
    },
  );
  it("supports defaults, ambiguity, sex/age/purpose-specific alternatives and overlapping rules", () => {
    const ref = structuredClone(references[0]);
    ref.id = "alternative";
    ref.isDefault = false;
    expect(interpret("bmi", 28, ctx, [...references, ref]).reference?.id).toBe(
      "who-adult-bmi",
    );
    ref.isDefault = true;
    expect(interpret("bmi", 28, ctx, [...references, ref]).state).toBe(
      "requires_decision",
    );
    ref.conditions.push({
      field: "population",
      label: "población",
      equals: "specific",
    });
    expect(interpret("bmi", 28, ctx, [ref]).state).toBe("missing_context");
    ref.conditions.pop();
    ref.rules.push({ ...ref.rules[2], id: "overlap" });
    expect(interpret("bmi", 28, ctx, [ref]).state).toBe("requires_decision");
  });
  it("keeps saved snapshots independent of future reference edits and other consultations", () => {
    const saved = interpret("bmi", 27.8);
    const newRefs = structuredClone(references);
    newRefs[0].version = "2.0.0";
    newRefs[0].rules[2].label = "Updated reference";
    expect(interpret("bmi", 27.8, ctx, newRefs).rule?.label).toBe(
      "Updated reference",
    );
    expect(saved.reference?.version).toBe("1.0.0");
    expect(saved.rule?.label).toBe("Sobrepeso / preobesidad");
    expect(
      interpretResult("bmi", 24.6, "kg/m²", ctx, references, "consultation-2")
        .rule?.id,
    ).toBe("normal");
    expect(saved.consultationId).toBe("consultation-1");
  });
  it.each([
    "body_fat_jp3_siri",
    "body_fat_jp7_siri",
    "body_fat_jp7_brozek",
    "body_fat_durnin_siri",
    "fat_mass_jp3_siri",
    "fat_mass_jp7_siri",
    "fat_mass_jp7_brozek",
    "fat_mass_durnin_siri",
    "fat_free_mass_jp3_siri",
    "fat_free_mass_jp7_siri",
    "fat_free_mass_jp7_brozek",
    "fat_free_mass_durnin_siri",
    "density_jackson_pollock_3",
    "density_jackson_pollock_7",
    "density_durnin_womersley",
  ])("never invents interpretation for %s", (code) =>
    expect(interpret(code, 20).state).toBe("no_reference"),
  );
  it("keeps simultaneous body-fat methods as separate interpretation records", () => {
    const codes = [
      "body_fat_jp3_siri",
      "body_fat_jp7_siri",
      "body_fat_durnin_siri",
      "body_fat_jp7_brozek",
    ];
    const results = Object.fromEntries(
      codes.map((code, index) => [code, interpret(code, 18 + index)]),
    );
    expect(Object.keys(results)).toEqual(codes);
    expect(Object.values(results).map((result) => result.value)).toEqual([
      18, 19, 20, 21,
    ]);
    expect(Object.values(results).every((result) => result.state === "no_reference")).toBe(true);
  });
  it("reuses birthdate at consultation date in the patient's timezone and never infers pregnancy", () => {
    const result = interpretationContext(
      {
        birth_date: "2008-09-05",
        equation_sex: null,
        timezone: "America/Mexico_City",
      } as never,
      { consultation_date: "2026-09-05T01:00:00Z" } as never,
      undefined,
      null,
    );
    expect(result.age).toBe(17);
    expect(result.sex).toBeNull();
    expect(result.bmi).toBeNull();
    expect(pregnancyFromLifeStage("Embarazo")).toBe(true);
    expect(pregnancyFromLifeStage("Ninguna particular")).toBe(false);
    expect(pregnancyFromLifeStage("Lactancia")).toBeNull();
    expect(pregnancyFromLifeStage(undefined)).toBeNull();
  });
});
