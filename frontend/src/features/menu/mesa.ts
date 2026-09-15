import { getExchangeGroup } from "@/src/features/exchanges/catalog";
import { activeMenu, calculateMenuStatus, calculateMenuUsage, createFoodSnapshot, exchangeContributionForFood, roundMenuNumber, type RecipeCompatibilityRestriction } from "./model";
import type { DietMenu, DietMenuEntry, FoodItem, MealDistribution, Recipe } from "@/src/types/domain";

export const MESA_COPY = { name: "Nuthrick a la Mesa", subtitle: "Menús para disfrutar, pensados para cada paciente.", needs: "Por completar", menu: "Tu menú", pantry: "Despensa" };
export const ROLE_LABELS = { main: "Preparación principal", side: "Acompañamientos", fruit: "Fruta", drink: "Bebida opcional", other: "Otros componentes" };
export const isDrink = (recipe: Pick<Recipe, "tags">) => recipe.tags?.includes("nuthrick:drink") ?? false;
export const isVerifiedWater = (recipe: Recipe) => recipe.id === "nuthrick-water-v1" && recipe.source === "CDC_PLAIN_WATER" && isDrink(recipe) && recipe.items.length === 0;
export const recipeHasKnownContributions = (recipe: Recipe) => isVerifiedWater(recipe) || (recipe.items.length > 0 && Number(recipe.servings) > 0 && recipe.items.every(item => Number(item.amount) > 0 && Number(item.food_snapshot.portion_amount) > 0 && item.exchange_contribution.length > 0 && item.exchange_contribution.every(c => Number.isFinite(c.portions) && c.portions > 0)));

/** No food equivalences are invented: preparations use current verified catalog quantities. */
export function starterDrinks(foods: FoodItem[]): Recipe[] {
  const base: Recipe = { id: "nuthrick-water-v1", owner_id: null, stable_code: "NUTHRICK_WATER_V1", name: "Agua natural · vaso de 240 ml", normalized_name: "agua natural", description: "Agua potable sin ingredientes añadidos. 1 porción = 240 ml.", meal_types: [], servings: 1, instructions: "Servir 240 ml de agua potable por porción, sin ingredientes añadidos.", image_path: null, tags: ["nuthrick:drink", "nuthrick:verified-water"], substitution_notes: null, source: "CDC_PLAIN_WATER", source_version: "2026-03-05", source_reference: "https://www.cdc.gov/healthy-weight-growth/water-healthy-drinks/index.html", is_custom: false, active: true, created_at: "", updated_at: "", items: [] };
  const milk = foods.find(food => food.stable_code === "MX_SKIM_MILK" && food.active);
  const papaya = foods.find(food => food.stable_code === "MX_PAPAYA" && food.active);
  const drinks = [base];
  if (milk) {
    const create = (id: string, name: string, ingredients: FoodItem[], instructions: string): Recipe => ({ ...base, id, stable_code: id, name, normalized_name: name.toLocaleLowerCase("es-MX"), description: "Ingredientes y cantidades para una porción. Aportes procedentes del catálogo de alimentos.", source: "NUTHRICK_CATALOG_PREPARATION", source_version: "1", source_reference: ingredients.map(food => `${food.stable_code}: ${food.source} ${food.source_version} ${food.source_reference ?? ""}`).join("; "), tags: ["nuthrick:drink"], instructions, items: ingredients.map((food, index) => ({ id: `${id}-${index}`, owner_id: null, recipe_id: id, food_item_id: food.id, amount: Number(food.portion_amount), unit: food.portion_unit, display_order: index, food_snapshot: createFoodSnapshot(food), exchange_contribution: exchangeContributionForFood(food, Number(food.portion_amount)), created_at: "" })) });
    drinks.push(create("nuthrick-milk-v1", "Leche descremada", [milk], "Servir la cantidad de leche indicada, sin azúcar añadida."));
    if (papaya) drinks.push(create("nuthrick-papaya-milk-v1", "Licuado de papaya con leche", [milk, papaya], "Licuar la leche con la papaya en las cantidades indicadas. No agregar azúcar."));
  }
  return drinks;
}

export function menuRestrictions(menu: DietMenu): RecipeCompatibilityRestriction {
  const rows = Object.entries(menu.food_preferences ?? {});
  return { excludedFoodIds: rows.filter(([, v]) => v === "exclude").map(([id]) => id), likedFoodIds: rows.filter(([, v]) => v === "like").map(([id]) => id), avoidedFoodIds: rows.filter(([, v]) => v === "avoid").map(([id]) => id) };
}
export function entryRole(entry: DietMenuEntry): keyof typeof ROLE_LABELS {
  if (entry.culinary_role) return entry.culinary_role;
  if (entry.recipe_snapshot?.tags?.includes("nuthrick:drink")) return "drink";
  if (entry.type === "recipe") return "main";
  if (entry.food_snapshot?.group_code === "FRUITS") return "fruit";
  return "other"; // Unknown culinary relationships are deliberately not inferred.
}
export function menuSignature(menu: DietMenu) {
  return JSON.stringify(activeMenu(menu).meal_menus.map(meal => [meal.meal_time_id, meal.entries.map(entry => [entry.type, entry.source_id, entry.quantity, entry.recipe_snapshot?.items.map(item => [item.food_snapshot.id, item.amount])]).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))]));
}

/** Preserve chosen proposal content without persisting the rest of the exploration. */
export function withPreservedContent(base: DietMenu, source: DietMenu | null, entryIds: string[], mealIds: string[]): DietMenu {
  if (!source) return base;
  const sourceMeals = activeMenu(source).meal_menus;
  return {...base,menus:base.menus.map(v=>v.id!==base.active_menu_id?v:{...v,meal_menus:v.meal_menus.map(meal=>{
    const previous=sourceMeals.find(m=>m.meal_time_id===meal.meal_time_id);
    if(!previous)return meal;
    if(mealIds.includes(meal.meal_time_id))return structuredClone(previous);
    const fixed=previous.entries.filter(e=>entryIds.includes(e.id));
    return {...meal,entries:[...meal.entries.filter(e=>!fixed.some(f=>f.id===e.id)),...structuredClone(fixed)]};
  })})};
}
export function recipeFromEntry(entry: DietMenuEntry): Recipe | null {
  const snapshot = entry.recipe_snapshot;
  if (!snapshot) return null;
  return { id: entry.source_id, name: entry.name_snapshot, normalized_name: entry.name_snapshot.toLocaleLowerCase("es-MX"), servings: snapshot.servings, instructions: snapshot.instructions, tags: snapshot.tags ?? [], substitution_notes: snapshot.substitution_notes ?? null, source_reference: snapshot.source_reference ?? null, owner_id: null, stable_code: null, description: null, meal_types: [], image_path: null, source: snapshot.source ?? "PLAN_SNAPSHOT", source_version: "1", is_custom: true, active: true, created_at: "", updated_at: "", items: snapshot.items.map((item,index) => ({ ...item, id: `${entry.id}-${index}`, owner_id: null, recipe_id: entry.source_id, food_item_id: item.food_snapshot.id, display_order: index, created_at: "" })) };
}

export function exchangeNutrition(entry: DietMenuEntry) {
  return entry.exchange_contributions.reduce((total,c)=>{const group=getExchangeGroup(c.group_code);return {kcal:total.kcal+c.portions*group.energyKcal,cho:total.cho+c.portions*group.carbohydrateG,protein:total.protein+c.portions*group.proteinG,fat:total.fat+c.portions*group.fatG};},{kcal:0,cho:0,protein:0,fat:0});
}
export function menuDifferences(menu: DietMenu, distribution: MealDistribution, mealId?: string) {
  const rows = calculateMenuStatus(menu, distribution).rows.filter(row => !mealId || row.meal_time_id === mealId);
  // The status UI omits insignificant unprescribed groups; accumulated deltas must not.
  for (const used of calculateMenuUsage(menu).filter(row => !mealId || row.meal_time_id === mealId)) {
    if (!rows.some(row => row.meal_time_id === used.meal_time_id && row.group_code === used.group_code)) {
      rows.push({ ...used, portions: 0, used: used.portions, remaining: -used.portions, state: "complete" });
    }
  }
  const byGroup = new Map<string, number>();
  for (const row of rows) byGroup.set(row.group_code, roundMenuNumber((byGroup.get(row.group_code) ?? 0) + row.used - row.portions));
  return { missing: roundMenuNumber(rows.reduce((n,r) => n + Math.max(0,r.remaining),0)), excess: roundMenuNumber(rows.reduce((n,r) => n + Math.max(0,-r.remaining),0)), groups: [...byGroup].filter(([,delta]) => delta !== 0).map(([code, delta]) => ({ name: getExchangeGroup(code as Parameters<typeof getExchangeGroup>[0]).shortName, delta })) };
}
export function dayObservations(menu: DietMenu) {
  const seen = new Map<string, string[]>();
  const messages: string[] = [];
  for (const meal of activeMenu(menu).meal_menus) for (const entry of meal.entries) {
    const ids = seen.get(entry.name_snapshot) ?? [];
    if (!ids.includes(meal.meal_time_id)) ids.push(meal.meal_time_id);
    seen.set(entry.name_snapshot, ids);
    const foods = entry.food_snapshot ? [entry.food_snapshot] : entry.recipe_snapshot?.items.map(item => item.food_snapshot) ?? [];
    for (const food of foods) if (menu.food_preferences?.[food.id] === "exclude" || menu.food_preferences?.[food.id] === "avoid") messages.push(`${food.name}: ${menu.food_preferences[food.id] === "exclude" ? "excluido" : "prefiere evitar"}; revisa ${entry.name_snapshot}.`);
  }
  for (const [name, meals] of seen) if (meals.length > 1) messages.push(`${name} aparece en ${meals.length} tiempos. Puedes conservar esta repetición.`);
  return [...new Set(messages)];
}
