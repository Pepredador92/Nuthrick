import { describe, expect, it } from "vitest";
import { weeklyFixture } from "../../../tests/fixtures/weeklyMenu";
import { createMacroDistribution, patchMacroInput } from "../macros/model";
import {
  compareLibrary,
  currentTargets,
  libraryDays,
  libraryKind,
  libraryNutrition,
  libraryReady,
  libraryRestrictions,
  makeLibraryContent,
  prepareLibraryBase,
  editLibraryTexts,
  referenceMacros,
  type DietLibraryItem,
} from "./model";
import type { NutritionPlan } from "@/src/types/domain";
import {
  patientPreparation,
  withPatientSubstitutions,
} from "../diet-review/preparation";

function fixture() {
  const { menu, distribution } = weeklyFixture();
  menu.week_plan = {
    schema_version: 1,
    days: [
      {
        day: "mon",
        assignments: distribution.meal_times.map((meal) => {
          const option = menu.meal_options!.find(
            (o) => o.meal_time_id === meal.id,
          )!;
          return {
            meal_time_id: meal.id,
            option_id: option.id,
            option_snapshot: option,
            fixed: false,
          };
        }),
      },
    ],
  };
  let macros = createMacroDistribution(2000, 75);
  macros = patchMacroInput(macros, "PROTEIN", "percentage", 20);
  macros = patchMacroInput(macros, "CARBOHYDRATE", "percentage", 50);
  macros = patchMacroInput(macros, "FAT", "percentage", 30);
  const plan = {
    id: "patient-plan",
    patient_id: "private-patient",
    consultation_id: "private-consultation",
    title: "Private name",
    target_calories: 2000,
    macro_distribution: macros,
    meal_distribution: distribution,
    diet_menu: menu,
  } as NutritionPlan;
  const content = makeLibraryContent(plan);
  const item = {
    id: "library",
    owner_id: "owner",
    name: "Base",
    content,
    revision: 1,
  } as DietLibraryItem;
  return { plan, content, item };
}
describe("reusable library boundaries", () => {
  it("accepts coherent reference targets without copying weight or changing portions", () => {
    const { plan, item } = fixture();
    const original = JSON.stringify(item.content);
    plan.target_calories = null; plan.macro_distribution = null;
    expect(() => prepareLibraryBase(item, plan)).toThrow();
    const copied = prepareLibraryBase(item, plan, undefined, "reference");
    expect(copied.exchange_prescription.target_snapshot).toEqual(item.content.reference_targets);
    expect(JSON.stringify(item.content)).toBe(original);
    expect(referenceMacros(item.content.reference_targets)?.reference_weight_kg).toBeNull();
    item.content.reference_targets!.protein_g = 10000;
    expect(referenceMacros(item.content.reference_targets)).toBeNull();
    expect(() => prepareLibraryBase(item, plan, undefined, "reference")).toThrow(/coherentes/);
  });
  it("excludes clinical metadata and preferences through an allowlist, including unexpected nested keys", () => {
    const { plan } = fixture();
    plan.diet_menu!.food_preferences = { secret: "exclude" };
    Object.assign(plan.diet_menu!.meal_options![0].entries[0].food_snapshot!, {
      patient_id: "secret-patient",
      owner_id: "secret-owner",
    });
    const serialized = JSON.stringify(makeLibraryContent(plan));
    for (const value of [
      "private-patient",
      "private-consultation",
      "Private name",
      "secret-patient",
      "secret-owner",
      "food_preferences",
      "reference_weight_kg",
      "weight_kg",
    ])
      expect(serialized).not.toContain(value);
  });
  it("counts applied days, not alternatives and does not sum option bank", () => {
    const { content } = fixture();
    expect(content.menu.meal_options!.length).toBeGreaterThan(3);
    expect(libraryDays(content)).toBe(1);
    expect(libraryKind(1)).toBe("Dieta");
    expect(libraryKind(2)).toBe("Plan de alimentación");
    expect(libraryReady(content)).toBe(true);
    expect(libraryNutrition(content)[0].totals?.energy_kcal).toBe(155);
    content.menu.meal_options!.push(
      ...structuredClone(content.menu.meal_options!),
    );
    expect(libraryNutrition(content)[0].totals?.energy_kcal).toBe(155);
  });
  it("never treats missing data as zero and excludes incomplete days", () => {
    const { content } = fixture();
    delete content.menu.week_plan!.days[0].assignments[0].option_snapshot
      .entries[0].food_snapshot;
    expect(libraryNutrition(content)[0].totals).toBeNull();
    expect(libraryReady(content)).toBe(false);
  });
  it("compares every day and exposes the worst difference", () => {
    const { content } = fixture();
    const second = structuredClone(content.menu.week_plan!.days[0]);
    second.day = "tue";
    second.assignments[0].option_snapshot.entries[0].exchange_contributions[0].portions = 20;
    second.assignments[0].option_snapshot.entries[0].quantity = 20;
    content.menu.week_plan!.days.push(second);
    const compared = compareLibrary(content, {
      energy_kcal: 155,
      protein_g: 4,
      carbohydrate_g: 34,
      fat_g: 0,
    });
    expect(compared.days).toHaveLength(2);
    expect(compared.days[1].differences!.energy_kcal).toBeGreaterThan(1000);
    expect(compared.worst).toBeGreaterThan(compared.mean);
  });
  it("creates independent identifiers, preserves new objectives and invalidates confirmations", () => {
    const { plan, item } = fixture();
    const before = JSON.stringify(item);
    let seq = 0;
    const patch = prepareLibraryBase(item, plan, () => `new-${++seq}`);
    expect(Object.keys(patch).sort()).toEqual([
      "diet_menu",
      "exchange_prescription",
      "meal_distribution",
    ]);
    expect(patch.exchange_prescription.target_snapshot).toEqual(
      currentTargets(plan),
    );
    expect(patch.exchange_prescription.derived_totals.energy_kcal).toBe(0);
    expect(
      patch.diet_menu.meal_options!.every(
        (o) => o.status === "draft" && !o.patient_substitutions,
      ),
    ).toBe(true);
    expect(
      patch.diet_menu.week_plan!.days[0].assignments[0].option_snapshot.status,
    ).toBe("draft");
    expect(patch.meal_distribution.meal_times[0].id).toMatch(/^new-/);
    patch.diet_menu.meal_options![0].name = "Changed";
    expect(JSON.stringify(item)).toBe(before);
  });
  it("blocks an excluded ingredient without inferring other restrictions", () => {
    const { plan, item } = fixture();
    const id = item.content.menu.meal_options![0].entries[0].food_snapshot!.id;
    plan.diet_menu!.food_preferences = { [id]: "exclude" };
    expect(
      libraryRestrictions(item.content, plan.diet_menu!.food_preferences)
        .excluded,
    ).toHaveLength(1);
    expect(() => prepareLibraryBase(item, plan)).toThrow("excluidos");
  });
  it("allows review of reusable text without editing the source", () => {
    const { content } = fixture();
    const original = JSON.stringify(content);
    const next = editLibraryTexts(content, { "Papaya fresca": "Papaya" });
    expect(JSON.stringify(next)).not.toContain('"name":"Papaya fresca"');
    expect(JSON.stringify(content)).toBe(original);
  });
  it("preserves reviewed substitutions in the library but requires new review after reuse", () => {
    const { plan } = fixture();
    plan.diet_menu = withPatientSubstitutions(plan.diet_menu!, []);
    const content = makeLibraryContent(plan);
    const option =
      content.menu.week_plan!.days[0].assignments[0].option_snapshot;
    expect(patientPreparation(option).substitutionsReviewed).toBe(true);
    const item = {
      id: "library",
      name: "Base",
      owner_id: "owner",
      revision: 1,
      content,
    } as DietLibraryItem;
    const copy = prepareLibraryBase(item, plan);
    expect(
      patientPreparation(
        copy.diet_menu.week_plan!.days[0].assignments[0].option_snapshot,
      ).substitutionsReviewed,
    ).toBe(false);
  });
  it("does not trust stale contribution totals or obsolete catalogue editions", () => {
    const { content } = fixture();
    const entry =
      content.menu.week_plan!.days[0].assignments[0].option_snapshot.entries[0];
    entry.exchange_contributions[0].portions = 99;
    expect(libraryReady(content)).toBe(false);
    entry.exchange_contributions[0].portions = 1;
    entry.food_snapshot!.exchange_catalog_version = "obsolete";
    expect(libraryReady(content)).toBe(false);
  });
});
