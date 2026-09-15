import { createFoodSnapshot } from "@/src/features/menu/model";
import { entryRole, menuRestrictions } from "@/src/features/menu/mesa";
import { isFoodRestricted } from "@/src/features/menu/planner";
import type { DietMenu, FoodItem, FoodSnapshot, FoodUnitCode, MealOption, PatientFoodAlternative } from "@/src/types/domain";

export type PatientIngredient = {
  key: string;
  name: string;
  amount: number;
  unit: FoodUnitCode | "recipe_serving";
  role: "ingredient" | "fruit" | "drink";
  food?: FoodSnapshot;
  equivalents: number;
  alternatives: PatientFoodAlternative[];
};
export type PatientPreparation = {
  title: string;
  ingredients: PatientIngredient[];
  instructions: Array<{ title: string; text: string }>;
  substitutionsReviewed: boolean;
};

export const canSubstitute = (food?: FoodSnapshot) => Boolean(food && (
  food.group_code.startsWith("AOA_") || food.group_code.startsWith("CEREALS_") || food.group_code === "LEGUMES"
));
// JSONB may reorder object keys on persistence. Key order must not invalidate a version.
const sourceKey = (option: MealOption) => JSON.stringify(option.entries, (_key, value: unknown) =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, "en")))
    : value);

/** Read-only presentation: historical quantities and recipe definitions are never rewritten. */
export function patientPreparation(option: MealOption): PatientPreparation {
  const saved = option.patient_substitutions;
  const current = saved?.schema_version === 1 && saved.source_key === sourceKey(option);
  const ingredients: PatientIngredient[] = [];
  const instructions: PatientPreparation["instructions"] = [];
  for (const entry of option.entries) {
    const role = entryRole(entry);
    const displayRole = role === "fruit" || role === "drink" ? role : "ingredient";
    if (entry.recipe_snapshot) {
      const recipe = entry.recipe_snapshot;
      const factor = recipe.servings > 0 ? entry.quantity / recipe.servings : 0;
      recipe.items.forEach((item, index) => {
        const key = `${entry.id}:${index}`;
        ingredients.push({ key, name: item.food_snapshot.name, amount: item.amount * factor, unit: item.unit,
          role: displayRole, food: item.food_snapshot,
          equivalents: item.exchange_contribution.filter(c => c.group_code === item.food_snapshot.group_code).reduce((n, c) => n + c.portions * factor, 0),
          alternatives: current ? saved.ingredients[key] ?? [] : [],
        });
      });
      // Water has no ingredients, but must not disappear from the meal.
      if (!recipe.items.length) ingredients.push({ key: entry.id, name: entry.name_snapshot, amount: entry.quantity, unit: entry.unit, role: displayRole, equivalents: 0, alternatives: [] });
      if (recipe.instructions?.trim()) instructions.push({ title: entry.name_snapshot, text: recipe.instructions });
    } else {
      ingredients.push({ key: entry.id, name: entry.name_snapshot, amount: entry.quantity, unit: entry.unit, role: displayRole, food: entry.food_snapshot,
        equivalents: entry.exchange_contributions.filter(c => c.group_code === entry.food_snapshot?.group_code).reduce((n, c) => n + c.portions, 0),
        alternatives: current ? saved.ingredients[entry.id] ?? [] : [],
      });
    }
  }
  const recipeNames = option.entries.filter(entry => entry.type === "recipe" && entryRole(entry) !== "drink").map(entry => entry.name_snapshot);
  return { title: recipeNames.join(" + ") || option.name || "Preparación del tiempo", ingredients, instructions, substitutionsReviewed: Boolean(current) };
}

const normalizedName = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("es-MX");

/** Same SMAE subgroup and number of equivalents, not interchangeable macro estimates. */
export function withPatientSubstitutions(menu: DietMenu, foods: FoodItem[]): DietMenu {
  if (!menu.week_plan) return menu;
  const restrictions = menuRestrictions(menu);
  const candidates = foods.filter(food => food.active && food.portion_amount > 0 && Number.isFinite(food.portion_amount)
    && !isFoodRestricted(food, restrictions) && !restrictions.avoidedFoodIds?.includes(food.id))
    .sort((a, b) => Number(restrictions.likedFoodIds?.includes(b.id) ?? false) - Number(restrictions.likedFoodIds?.includes(a.id) ?? false) || a.name.localeCompare(b.name, "es") || a.id.localeCompare(b.id));
  return { ...menu, week_plan: { ...menu.week_plan, days: menu.week_plan.days.map(day => ({ ...day,
    assignments: day.assignments.map(applied => {
      const option = applied.option_snapshot;
      const substitutions: Record<string, PatientFoodAlternative[]> = {};
      for (const ingredient of patientPreparation(option).ingredients) {
        const source = ingredient.food;
        if (!source || !canSubstitute(source) || !Number.isFinite(ingredient.equivalents) || ingredient.equivalents <= 0) continue;
        const seen = new Set([normalizedName(source.name)]);
        const alternatives: PatientFoodAlternative[] = [];
        for (const food of candidates) {
          if (food.id === source.id || food.group_code !== source.group_code || food.exchange_system_code !== source.exchange_system_code
            || food.exchange_catalog_version !== source.exchange_catalog_version || seen.has(normalizedName(food.name))) continue;
          seen.add(normalizedName(food.name));
          alternatives.push({ food: createFoodSnapshot(food), amount: food.portion_amount * ingredient.equivalents,
            unit: food.portion_unit, equivalents: ingredient.equivalents, source_reference: food.source_reference });
          if (alternatives.length === 2) break;
        }
        substitutions[ingredient.key] = alternatives;
      }
      return { ...applied, option_snapshot: { ...option, patient_substitutions: { schema_version: 1 as const, source_key: sourceKey(option), ingredients: substitutions } } };
    }),
  })) } };
}
