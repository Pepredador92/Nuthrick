import type { DietMenu, FoodItem, MealDistribution } from "@/src/types/domain";
import { activeMenu, addFoodToMenu, addRecipeToMenu, createDietMenu } from "@/src/features/menu/model";
import { ensureOptionBank, prescriptionKey } from "@/src/features/menu/options";
import { starterDrinks } from "@/src/features/menu/mesa";

// Synthetic fixtures only: no patient data, credentials or database calls.
export function weeklyFixture(counts = [3, 5, 1]) {
  const distribution: MealDistribution = {
    schema_version: 1, source_exchange_snapshot: null,
    meal_times: [
      { id: "breakfast", meal_type: "BREAKFAST", display_name: "Desayuno", time: "08:00", display_order: 0 },
      { id: "lunch", meal_type: "MAIN_MEAL", display_name: "Comida", time: "14:00", display_order: 1 },
      { id: "dinner", meal_type: "DINNER", display_name: "Cena", time: "20:00", display_order: 2 },
    ],
    distribution: [
      { meal_time_id: "breakfast", group_code: "FRUITS", portions: 1 },
      { meal_time_id: "lunch", group_code: "VEGETABLES", portions: 1 },
      { meal_time_id: "dinner", group_code: "CEREALS_NO_FAT", portions: 1 },
    ], derived_meal_totals: [], status: "ready", confirmed_at: "2026-09-15", updated_at: "2026-09-15",
  };
  const names = [["Papaya fresca", "Manzana", "Pera"], ["Nopales cocidos", "Calabacitas", "Ensalada de hojas", "Zanahoria", "Ejotes"], ["Pan integral", "Tortilla de maíz"]];
  const foods: FoodItem[] = [];
  const menu: DietMenu = { ...ensureOptionBank(createDietMenu(distribution, () => "main"), distribution), meal_options: [] };
  distribution.meal_times.forEach((meal, index) => {
    for (let n = 0; n < counts[index]; n++) {
      const food: FoodItem = {
        id: `${meal.id}-food-${n}`, owner_id: "fixture", stable_code: null, catalog_code: null, name: names[index][n % names[index].length], normalized_name: "fixture", aliases: [], brand: null, category: null,
        exchange_system_code: "SMAE_NOM037_2012", exchange_catalog_version: "1.0.0", group_code: distribution.distribution[index].group_code,
        portion_amount: 1, portion_unit: "cup", portion_description: "1 taza", alternate_portions: [], edible_grams: null,
        energy_kcal: null, carbohydrate_g: null, protein_g: null, fat_g: null, fiber_g: null, sodium_mg: null,
        attributes: {}, source: "FICTITIOUS_TEST", source_version: "1", source_reference: null, is_custom: true, use_count: 0, active: true, created_at: "", updated_at: "",
      };
      foods.push(food);
      const projected = addRecipeToMenu(addFoodToMenu(createDietMenu(distribution), distribution, meal.id, food, 1), distribution, meal.id, starterDrinks([])[0]);
      menu.meal_options!.push({ id: `${meal.id}-${n}`, meal_time_id: meal.id, name: `${meal.display_name} ${n + 1} · ${food.name}`, entries: activeMenu(projected).meal_menus.find(m => m.meal_time_id === meal.id)!.entries, status: "confirmed", confirmed_at: "2026-09-15", prescription_key: prescriptionKey(distribution, meal.id), revision: 1 });
    }
  });
  return { menu, distribution, foods };
}
