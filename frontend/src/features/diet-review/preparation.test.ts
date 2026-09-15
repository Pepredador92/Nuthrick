import { describe, expect, it } from "vitest";
import { weeklyFixture } from "../../../tests/fixtures/weeklyMenu";
import { createFoodSnapshot } from "@/src/features/menu/model";
import { patientPreparation, withPatientSubstitutions } from "./preparation";
import type { DietMenu, FoodItem, MealOption } from "@/src/types/domain";

export function preparationFixture() {
  const fixture = weeklyFixture();
  const base = fixture.foods[0];
  const food = (id: string, group: FoodItem["group_code"], amount: number, unit: FoodItem["portion_unit"] = "g"): FoodItem => ({ ...base, id, name: id, normalized_name: id, group_code: group, portion_amount: amount, portion_unit: unit });
  const chicken = food("Pollo", "AOA_VERY_LOW_FAT", 30);
  const rice = food("Arroz", "CEREALS_NO_FAT", 0.25, "cup");
  const beans = food("Frijoles", "LEGUMES", 0.5, "cup");
  const option: MealOption = { ...fixture.menu.meal_options![0], name: "Comida completa", entries: [
    { id: "recipe", type: "recipe", source_id: "recipe", name_snapshot: "Pollo con arroz", quantity: 1, unit: "recipe_serving",
      recipe_snapshot: { recipe_id: "recipe", name: "Pollo con arroz", servings: 2, instructions: "Cocina el pollo y acompaña con arroz.", items: [
        { amount: 120, unit: "g", food_snapshot: createFoodSnapshot(chicken), exchange_contribution: [{ group_code: chicken.group_code, portions: 4 }] },
        { amount: 1, unit: "cup", food_snapshot: createFoodSnapshot(rice), exchange_contribution: [{ group_code: rice.group_code, portions: 4 }] },
      ] }, exchange_contributions: [{ group_code: chicken.group_code, portions: 2 }, { group_code: rice.group_code, portions: 2 }] },
    { id: "beans", type: "food", source_id: beans.id, name_snapshot: beans.name, quantity: 0.75, unit: "cup", food_snapshot: createFoodSnapshot(beans), exchange_contributions: [{ group_code: beans.group_code, portions: 1.5 }] },
    ...fixture.menu.meal_options![0].entries,
  ] };
  const foods = [chicken, rice, beans, food("Pavo", chicken.group_code, 30), food("Atún", chicken.group_code, 33), food("Tortilla", rice.group_code, 1, "piece"), food("Avena", rice.group_code, 20), food("Lentejas", beans.group_code, 0.5, "cup"), food("Garbanzos", beans.group_code, 0.5, "cup")];
  const menu: DietMenu = { ...fixture.menu, week_plan: { schema_version: 1, days: [{ day: "mon", assignments: [{ meal_time_id: option.meal_time_id, option_id: option.id, option_snapshot: option, fixed: false }] }] } };
  return { option, foods, menu, food };
}

describe("complete patient meal presentation", () => {
  it("combines recipe and loose foods without mutations, scaling by servings", () => {
    const { option } = preparationFixture();
    const before = structuredClone(option);
    const result = patientPreparation(option);
    expect(result.title).toBe("Pollo con arroz");
    expect(result.ingredients).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Pollo", amount: 60, equivalents: 2 }),
      expect.objectContaining({ name: "Arroz", amount: 0.5, equivalents: 2 }),
      expect.objectContaining({ name: "Frijoles", amount: 0.75, role: "ingredient" }),
      expect.objectContaining({ name: "Papaya fresca", role: "fruit" }),
      expect.objectContaining({ name: "Agua natural · vaso de 240 ml", role: "drink" }),
    ]));
    expect(option).toEqual(before);
    expect(result.instructions).toHaveLength(2);
  });
  it("creates a presentation even without a saved recipe", () => {
    const { option } = preparationFixture();
    option.entries = option.entries.filter(entry => entry.type === "food");
    const result = patientPreparation(option);
    expect(result.title).toBe("Comida completa");
    expect(result.ingredients).toHaveLength(2);
    expect(result.instructions).toEqual([]);
  });
  it("provides two alternatives for AOA and cereals without substituting legumes or accompaniments", () => {
    const { menu, foods } = preparationFixture();
    const original = structuredClone(menu);
    const enriched = withPatientSubstitutions(menu, foods);
    const result = patientPreparation(enriched.week_plan!.days[0].assignments[0].option_snapshot);
    const chicken = result.ingredients.find(item => item.name === "Pollo")!;
    expect(chicken.alternatives).toHaveLength(2);
    expect(chicken.alternatives).toEqual(expect.arrayContaining([
      expect.objectContaining({ food: expect.objectContaining({ name: "Pavo" }), amount: 60, equivalents: 2 }),
      expect.objectContaining({ food: expect.objectContaining({ name: "Atún" }), amount: 66, equivalents: 2 }),
    ]));
    expect(result.ingredients.find(item => item.name === "Arroz")!.alternatives).toHaveLength(2);
    expect(result.ingredients.find(item => item.name === "Frijoles")!.alternatives).toEqual([]);
    expect(result.ingredients.find(item => item.role === "fruit")!.alternatives).toEqual([]);
    expect(menu).toEqual(original);
    expect(enriched.meal_options).toEqual(menu.meal_options);
    expect(enriched.week_plan!.days[0].assignments[0].option_snapshot.entries).toEqual(original.week_plan!.days[0].assignments[0].option_snapshot.entries);
  });
  it("excludes avoided/inactive foods, duplicates, other subgroups and catalog versions", () => {
    const { menu, foods, food } = preparationFixture();
    menu.food_preferences = { "Pavo": "exclude", "Atún": "avoid" };
    foods.push({ ...food("Otro AOA", "AOA_HIGH_FAT", 30) },
      { ...food("Inactivo", "AOA_VERY_LOW_FAT", 30), active: false },
      { ...food("Otra edición", "AOA_VERY_LOW_FAT", 30), exchange_catalog_version: "different" },
      { ...food("Pollo", "AOA_VERY_LOW_FAT", 30), id: "duplicated" });
    const result = patientPreparation(withPatientSubstitutions(menu, foods).week_plan!.days[0].assignments[0].option_snapshot);
    expect(result.ingredients.find(item => item.name === "Pollo")!.alternatives).toEqual([]);
  });
  it("keeps historical alternatives stable and invalidates metadata after a quantity edit", () => {
    const { menu, foods } = preparationFixture();
    const enriched = withPatientSubstitutions(menu, foods);
    const saved = JSON.parse(JSON.stringify(enriched.week_plan!.days[0].assignments[0].option_snapshot)) as MealOption;
    const originalView = patientPreparation(saved);
    foods[3].name = "Catalog changed";
    foods[3].portion_amount = 900;
    expect(patientPreparation(saved)).toEqual(originalView);
    saved.entries[0].quantity = 2;
    expect(patientPreparation(saved).substitutionsReviewed).toBe(false);
    expect(patientPreparation(saved).ingredients[0].alternatives).toEqual([]);
  });
  it("preserves substitutions when database JSON objects return in another key order", () => {
    const { menu, foods } = preparationFixture();
    const option = withPatientSubstitutions(menu, foods).week_plan!.days[0].assignments[0].option_snapshot;
    const reordered = JSON.parse(JSON.stringify(option), (_key, value: unknown) =>
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value).reverse()) : value) as MealOption;
    expect(patientPreparation(reordered)).toEqual(patientPreparation(option));
    expect(patientPreparation(reordered).substitutionsReviewed).toBe(true);
  });
  it("is deterministic and does not invent alternatives when the catalog is insufficient", () => {
    const { menu, foods } = preparationFixture();
    expect(withPatientSubstitutions(menu, foods)).toEqual(withPatientSubstitutions(menu, [...foods].reverse()));
    const result = patientPreparation(withPatientSubstitutions(menu, []).week_plan!.days[0].assignments[0].option_snapshot);
    expect(result.substitutionsReviewed).toBe(true);
    expect(result.ingredients.every(item => item.alternatives.length === 0)).toBe(true);
  });
});
