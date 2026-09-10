import type {
  DietMenu,
  DietMenuEntry,
  DietMenuVariant,
  ExchangeGroupCode,
  FoodItem,
  FoodSnapshot,
  MealDistribution,
  Recipe,
} from "@/src/types/domain";

export const DIET_MENU_SCHEMA_VERSION = 1 as const;
export const MENU_COMPARISON_TOLERANCE = 1e-6;

const now = () => new Date().toISOString();
const round = (value: number) => Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
const makeId = (prefix: string) => globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function createFoodSnapshot(food: FoodItem): FoodSnapshot {
  return {
    id: food.id,
    name: food.name,
    group_code: food.group_code,
    portion_amount: Number(food.portion_amount),
    portion_unit: food.portion_unit,
    portion_description: food.portion_description,
    exchange_system_code: food.exchange_system_code,
    exchange_catalog_version: food.exchange_catalog_version,
    source: food.source,
    source_version: food.source_version,
    is_custom: food.is_custom,
    attributes: { ...food.attributes },
  };
}

export function exchangeContributionForFood(food: FoodItem | FoodSnapshot, amount: number) {
  const portions = Number(food.portion_amount) > 0 ? round(amount / Number(food.portion_amount)) : 0;
  return portions > MENU_COMPARISON_TOLERANCE ? [{ group_code: food.group_code, portions }] : [];
}

function aggregateContributions(contributions: Array<{ group_code: ExchangeGroupCode; portions: number }>) {
  const totals = new Map<ExchangeGroupCode, number>();
  for (const item of contributions) totals.set(item.group_code, round((totals.get(item.group_code) ?? 0) + item.portions));
  return [...totals.entries()].map(([group_code, portions]) => ({ group_code, portions })).filter((item) => item.portions > MENU_COMPARISON_TOLERANCE);
}

export function recipeExchangeContributions(recipe: Recipe, servings = 1) {
  const factor = servings / Number(recipe.servings || 1);
  return aggregateContributions(recipe.items.flatMap((item) => item.exchange_contribution.map((value) => ({
    group_code: value.group_code,
    portions: round(value.portions * factor),
  }))));
}

export function createDietMenu(mealDistribution: MealDistribution, idFactory: (prefix: string) => string = makeId): DietMenu {
  const activeMenuId = idFactory("menu");
  return {
    schema_version: DIET_MENU_SCHEMA_VERSION,
    source_meal_distribution_snapshot: null,
    menus: [{
      id: activeMenuId,
      name: "Menú principal",
      display_order: 0,
      meal_menus: mealDistribution.meal_times.map((meal) => ({ meal_time_id: meal.id, entries: [] })),
    }],
    active_menu_id: activeMenuId,
    derived_exchange_usage: [],
    status: "not_started",
    confirmed_at: null,
    updated_at: now(),
  };
}

export function activeMenu(menu: DietMenu) {
  return menu.menus.find((variant) => variant.id === menu.active_menu_id) ?? menu.menus[0];
}

function withVariant(menu: DietMenu, variant: DietMenuVariant): DietMenu {
  const menus = menu.menus.map((item) => item.id === variant.id ? variant : item);
  const next = { ...menu, menus, confirmed_at: null, updated_at: now() };
  const usage = calculateMenuUsage(next);
  return {
    ...next,
    derived_exchange_usage: usage,
    status: usage.length ? "editing" : "not_started",
  };
}

function ensureMealMenus(variant: DietMenuVariant, mealDistribution: MealDistribution) {
  const validIds = new Set(mealDistribution.meal_times.map((meal) => meal.id));
  const existing = variant.meal_menus.filter((meal) => validIds.has(meal.meal_time_id));
  for (const meal of mealDistribution.meal_times) {
    if (!existing.some((item) => item.meal_time_id === meal.id)) existing.push({ meal_time_id: meal.id, entries: [] });
  }
  return { ...variant, meal_menus: existing };
}

export function addFoodToMenu(menu: DietMenu, mealDistribution: MealDistribution, mealTimeId: string, food: FoodItem, quantity: number, id = makeId("entry")) {
  if (!Number.isFinite(quantity) || quantity <= 0) return menu;
  const entry: DietMenuEntry = {
    id,
    type: "food",
    source_id: food.id,
    name_snapshot: food.name,
    quantity: round(quantity),
    unit: food.portion_unit,
    food_snapshot: createFoodSnapshot(food),
    exchange_contributions: exchangeContributionForFood(food, quantity),
  };
  const variant = ensureMealMenus(activeMenu(menu), mealDistribution);
  return withVariant(menu, { ...variant, meal_menus: variant.meal_menus.map((meal) => meal.meal_time_id === mealTimeId ? { ...meal, entries: [...meal.entries, entry] } : meal) });
}

export function addRecipeToMenu(menu: DietMenu, mealDistribution: MealDistribution, mealTimeId: string, recipe: Recipe, servings = 1, id = makeId("entry")) {
  if (!Number.isFinite(servings) || servings <= 0) return menu;
  const entry: DietMenuEntry = {
    id,
    type: "recipe",
    source_id: recipe.id,
    name_snapshot: recipe.name,
    quantity: round(servings),
    unit: "recipe_serving",
    recipe_snapshot: {
      recipe_id: recipe.id,
      name: recipe.name,
      servings: recipe.servings,
      instructions: recipe.instructions,
      items: recipe.items.map((item) => ({
        amount: Number(item.amount),
        unit: item.unit,
        food_snapshot: { ...item.food_snapshot },
        exchange_contribution: item.exchange_contribution.map((value) => ({ ...value })),
      })),
    },
    exchange_contributions: recipeExchangeContributions(recipe, servings),
  };
  const variant = ensureMealMenus(activeMenu(menu), mealDistribution);
  return withVariant(menu, { ...variant, meal_menus: variant.meal_menus.map((meal) => meal.meal_time_id === mealTimeId ? { ...meal, entries: [...meal.entries, entry] } : meal) });
}

export function updateMenuEntryQuantity(menu: DietMenu, mealDistribution: MealDistribution, entryId: string, quantity: number) {
  if (!Number.isFinite(quantity) || quantity <= 0) return menu;
  const variant = activeMenu(menu);
  const mealMenus = variant.meal_menus.map((meal) => ({ ...meal, entries: meal.entries.map((entry) => {
    if (entry.id !== entryId) return entry;
    const exchange_contributions = entry.type === "food" && entry.food_snapshot
      ? exchangeContributionForFood(entry.food_snapshot, quantity)
      : entry.recipe_snapshot
        ? aggregateContributions(entry.recipe_snapshot.items.flatMap((item) => item.exchange_contribution.map((value) => ({ ...value, portions: value.portions * quantity / entry.recipe_snapshot!.servings }))))
        : [];
    return { ...entry, quantity: round(quantity), exchange_contributions };
  }) }));
  return withVariant(menu, { ...variant, meal_menus: mealMenus });
}

export function removeMenuEntry(menu: DietMenu, mealDistribution: MealDistribution, entryId: string) {
  const variant = activeMenu(menu);
  return withVariant(menu, { ...variant, meal_menus: variant.meal_menus.map((meal) => ({ ...meal, entries: meal.entries.filter((entry) => entry.id !== entryId) })) });
}

export function calculateMenuUsage(menu: DietMenu) {
  const variant = activeMenu(menu);
  if (!variant) return [];
  const totals = new Map<string, { meal_time_id: string; group_code: ExchangeGroupCode; portions: number }>();
  for (const meal of variant.meal_menus) for (const entry of meal.entries) for (const contribution of entry.exchange_contributions) {
    const key = `${meal.meal_time_id}:${contribution.group_code}`;
    const previous = totals.get(key);
    totals.set(key, { meal_time_id: meal.meal_time_id, group_code: contribution.group_code, portions: round((previous?.portions ?? 0) + contribution.portions) });
  }
  return [...totals.values()];
}

export function calculateMenuStatus(menu: DietMenu, mealDistribution: MealDistribution) {
  const usage = calculateMenuUsage(menu);
  const rows = mealDistribution.distribution.filter((item) => item.portions > MENU_COMPARISON_TOLERANCE).map((required) => {
    const used = usage.find((item) => item.meal_time_id === required.meal_time_id && item.group_code === required.group_code)?.portions ?? 0;
    const remaining = round(required.portions - used);
    return {
      ...required,
      used,
      remaining,
      state: remaining > MENU_COMPARISON_TOLERANCE ? "pending" as const : remaining < -MENU_COMPARISON_TOLERANCE ? "excess" as const : "complete" as const,
    };
  });
  for (const used of usage) {
    if (!rows.some((row) => row.meal_time_id === used.meal_time_id && row.group_code === used.group_code) && used.portions > MENU_COMPARISON_TOLERANCE) {
      rows.push({ ...used, used: used.portions, remaining: -used.portions, state: "excess" as const });
    }
  }
  return {
    rows,
    complete: rows.filter((row) => row.state === "complete").length,
    pending: rows.filter((row) => row.state === "pending").length,
    excess: rows.filter((row) => row.state === "excess").length,
    canConfirm: rows.length > 0 && rows.every((row) => row.state === "complete"),
  };
}

function snapshotMealDistribution(distribution: MealDistribution): MealDistribution {
  return JSON.parse(JSON.stringify(distribution)) as MealDistribution;
}

export function sameMealDistribution(snapshot: MealDistribution | null, current: MealDistribution) {
  if (!snapshot) return false;
  const normalize = (value: MealDistribution) => value.distribution
    .map((item) => `${item.meal_time_id}:${item.group_code}:${round(item.portions)}`)
    .sort().join("|");
  return normalize(snapshot) === normalize(current)
    && snapshot.meal_times.map((meal) => meal.id).sort().join("|") === current.meal_times.map((meal) => meal.id).sort().join("|");
}

export function reconcileDietMenu(menu: DietMenu, mealDistribution: MealDistribution) {
  const variant = ensureMealMenus(activeMenu(menu), mealDistribution);
  const rebuilt = { ...menu, menus: menu.menus.map((item) => item.id === variant.id ? variant : item), updated_at: now() };
  if (menu.status === "ready" && !sameMealDistribution(menu.source_meal_distribution_snapshot, mealDistribution)) {
    return { ...rebuilt, derived_exchange_usage: calculateMenuUsage(rebuilt), status: "editing" as const, confirmed_at: null };
  }
  return { ...rebuilt, derived_exchange_usage: calculateMenuUsage(rebuilt) };
}

export function confirmDietMenu(menu: DietMenu, mealDistribution: MealDistribution) {
  if (!calculateMenuStatus(menu, mealDistribution).canConfirm) return menu;
  return {
    ...menu,
    derived_exchange_usage: calculateMenuUsage(menu),
    source_meal_distribution_snapshot: snapshotMealDistribution(mealDistribution),
    status: "ready" as const,
    confirmed_at: now(),
    updated_at: now(),
  };
}

export function recipeCompatibilityScore(required: Array<{ group_code: ExchangeGroupCode; portions: number }>, recipe: Recipe) {
  const contributions = recipeExchangeContributions(recipe);
  const codes = new Set([...required.map((item) => item.group_code), ...contributions.map((item) => item.group_code)]);
  let covered = 0;
  let missing = 0;
  let excess = 0;
  for (const code of codes) {
    const needed = required.find((item) => item.group_code === code)?.portions ?? 0;
    const supplied = contributions.find((item) => item.group_code === code)?.portions ?? 0;
    covered += Math.min(needed, supplied);
    missing += Math.max(0, needed - supplied);
    excess += Math.max(0, supplied - needed);
  }
  const score = round(Math.max(0, covered * 4 - excess * 5 - missing));
  const label = excess <= MENU_COMPARISON_TOLERANCE && missing <= MENU_COMPARISON_TOLERANCE
    ? "Cubre las porciones asignadas" : excess <= MENU_COMPARISON_TOLERANCE && covered > 0
      ? "Alta compatibilidad" : excess < covered ? "Compatible" : "Compatibilidad parcial";
  return { score, covered: round(covered), missing: round(missing), excess: round(excess), label, contributions };
}
