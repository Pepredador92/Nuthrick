import type {
  DietMenu,
  DietMenuEntry,
  DietMenuVariant,
  ExchangeGroupCode,
  FoodItem,
  FoodSnapshot,
  MealDistribution,
  MealType,
  Recipe,
  RecipeItem,
} from "@/src/types/domain";

export const DIET_MENU_SCHEMA_VERSION = 1 as const;
/** UI/solver comparison tolerance in exchanges, not a clinical quality threshold. Actual differences remain available. */
export const MENU_COMPARISON_TOLERANCE = 0.1;
const MENU_NUMERIC_EPSILON = 1e-6;

const practicalSteps: Record<FoodItem["portion_unit"], number> = {
  g: 10,
  ml: 10,
  piece: 0.5,
  half: 1,
  cup: 0.25,
  tablespoon: 0.5,
  teaspoon: 0.5,
  slice: 0.5,
  tortilla: 0.5,
  glass: 0.5,
  serving: 0.5,
  unit: 0.5,
};

const now = () => new Date().toISOString();
export const roundMenuNumber = (value: number) => Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
const round = roundMenuNumber;
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
  return portions > MENU_NUMERIC_EPSILON ? [{ group_code: food.group_code, portions }] : [];
}

/** Catalog portion_amount represents one exchange; only a matching pending group changes the initial amount. */
export function initialFoodAmount(food: FoodItem, pending?: { group_code: ExchangeGroupCode; portions: number }) {
  const portionAmount = Number(food.portion_amount);
  return pending?.group_code === food.group_code && Number.isFinite(pending.portions) && pending.portions > 0
    ? roundMenuNumber(pending.portions * portionAmount)
    : portionAmount;
}

export function practicalFoodQuantity(value: number, unit: FoodItem["portion_unit"], minimum = practicalSteps[unit]) {
  if (["piece","cup","slice","tortilla"].includes(unit) && value > 0 && Math.abs(value * 3 - Math.round(value * 3)) < 0.005 && Math.round(value * 3) > 0) return round(Math.round(value * 3) / 3);
  const step = practicalSteps[unit];
  const quantized = Math.round(value / step) * step;
  return round(Math.max(minimum, quantized));
}

function aggregateContributions(contributions: Array<{ group_code: ExchangeGroupCode; portions: number }>) {
  const totals = new Map<ExchangeGroupCode, number>();
  for (const item of contributions) totals.set(item.group_code, round((totals.get(item.group_code) ?? 0) + item.portions));
  return [...totals.entries()].map(([group_code, portions]) => ({ group_code, portions })).filter((item) => item.portions > MENU_NUMERIC_EPSILON);
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
  const verifiedWater = recipe.id === "nuthrick-water-v1" && recipe.source === "CDC_PLAIN_WATER" && recipe.tags?.includes("nuthrick:drink");
  if (!Number.isFinite(Number(recipe.servings)) || Number(recipe.servings) <= 0 || (!recipe.items.length && !verifiedWater) || recipe.items.some(item=>!Number.isFinite(Number(item.amount)) || Number(item.amount)<=0 || !item.exchange_contribution.length)) return menu;
  const entry: DietMenuEntry = {
    id,
    type: "recipe",
    source_id: recipe.id,
    name_snapshot: recipe.name,
    quantity: round(servings),
    unit: "recipe_serving",
    culinary_role: recipe.tags?.includes("nuthrick:drink") ? "drink" : undefined,
    recipe_snapshot: {
      recipe_id: recipe.id,
      name: recipe.name,
      servings: recipe.servings,
      instructions: recipe.instructions,
      tags: [...(recipe.tags ?? [])],
      substitution_notes: recipe.substitution_notes,
      source_reference: recipe.source_reference,
      source: recipe.source,
      items: recipe.items.map((item) => ({
        amount: Number(item.amount),
        unit: item.unit,
        food_snapshot: structuredClone(item.food_snapshot),
        exchange_contribution: item.exchange_contribution.map((value) => ({ ...value })),
      })),
    },
    exchange_contributions: recipeExchangeContributions(recipe, servings),
  };
  const variant = ensureMealMenus(activeMenu(menu), mealDistribution);
  return withVariant(menu, { ...variant, meal_menus: variant.meal_menus.map((meal) => meal.meal_time_id === mealTimeId ? { ...meal, entries: [...meal.entries, entry] } : meal) });
}

export function adjustRecipeIngredients(recipe: Recipe, amounts: Record<string, number>): Recipe {
  return {
    ...recipe,
    items: recipe.items.map((item) => {
      const amount = Number(amounts[item.id] ?? item.amount);
      if (!Number.isFinite(amount) || amount <= 0) return item;
      return {
        ...item,
        amount: round(amount),
        exchange_contribution: exchangeContributionForFood(item.food_snapshot, amount),
      };
    }),
  };
}

export function replaceRecipeIngredient(recipe: Recipe, itemId: string, replacement: FoodItem): Recipe {
  return {
    ...recipe,
    items: recipe.items.map((item) => {
      if (item.id !== itemId || item.food_snapshot.group_code !== replacement.group_code) return item;
      const portions = item.exchange_contribution
        .filter((value) => value.group_code === replacement.group_code)
        .reduce((sum, value) => sum + Number(value.portions), 0);
      const amount = practicalFoodQuantity(portions * Number(replacement.portion_amount), replacement.portion_unit);
      return {
        ...item,
        food_item_id: replacement.id,
        amount,
        unit: replacement.portion_unit,
        food_snapshot: createFoodSnapshot(replacement),
        exchange_contribution: exchangeContributionForFood(replacement, amount),
      };
    }),
  };
}

/** Replaces an individual menu food with an exact-group equivalent. */
export function replaceFoodMenuEntry(
  menu: DietMenu,
  mealDistribution: MealDistribution,
  entryId: string,
  replacement: FoodItem,
) {
  const variant = activeMenu(menu);
  let changed = false;
  const mealMenus = variant.meal_menus.map((meal) => ({
    ...meal,
    entries: meal.entries.map((entry) => {
      if (entry.id !== entryId || entry.type !== "food" || !entry.food_snapshot || entry.food_snapshot.group_code !== replacement.group_code) return entry;
      const portions = entry.exchange_contributions
        .filter((value) => value.group_code === replacement.group_code)
        .reduce((sum, value) => sum + Number(value.portions), 0);
      const quantity = practicalFoodQuantity(portions * Number(replacement.portion_amount), replacement.portion_unit);
      changed = true;
      return {
        ...entry,
        source_id: replacement.id,
        name_snapshot: replacement.name,
        quantity,
        unit: replacement.portion_unit,
        food_snapshot: createFoodSnapshot(replacement),
        exchange_contributions: exchangeContributionForFood(replacement, quantity),
      };
    }),
  }));
  return changed ? withVariant(menu, { ...variant, meal_menus: mealMenus }) : menu;
}

export function recipeIngredientsChanged(original: Recipe, adjusted: Recipe) {
  return original.items.length !== adjusted.items.length || original.name !== adjusted.name || original.instructions !== adjusted.instructions || original.substitution_notes !== adjusted.substitution_notes || original.items.some((item) => {
    const next = adjusted.items.find((candidate) => candidate.id === item.id);
    return !next
      || (next.food_item_id ?? next.food_snapshot.id) !== (item.food_item_id ?? item.food_snapshot.id)
      || next.unit !== item.unit
      || Math.abs(Number(next.amount) - Number(item.amount)) > MENU_NUMERIC_EPSILON;
  });
}

function foodFromSnapshot(snapshot: FoodSnapshot, catalog: FoodItem[]): FoodItem {
  const current = catalog.find((food) => food.id === snapshot.id);
  return {
    ...(current ?? {
      id: snapshot.id,
      owner_id: null,
      stable_code: null,
      catalog_code: null,
      name: snapshot.name,
      normalized_name: snapshot.name.toLocaleLowerCase("es-MX"),
      aliases: [],
      brand: null,
      category: null,
      exchange_system_code: snapshot.exchange_system_code,
      exchange_catalog_version: snapshot.exchange_catalog_version,
      group_code: snapshot.group_code,
      portion_amount: snapshot.portion_amount,
      portion_unit: snapshot.portion_unit,
      portion_description: snapshot.portion_description,
      alternate_portions: [],
      edible_grams: null,
      energy_kcal: null,
      carbohydrate_g: null,
      protein_g: null,
      fat_g: null,
      fiber_g: null,
      sodium_mg: null,
      attributes: snapshot.attributes,
      source: snapshot.source,
      source_version: snapshot.source_version,
      source_reference: null,
      is_custom: snapshot.is_custom,
      use_count: 0,
      active: true,
      created_at: "",
      updated_at: "",
    }),
    ...snapshot,
    attributes: { ...snapshot.attributes },
  };
}

/** Expands visible foods and recipe snapshots into flat food ingredients for a derived recipe. */
export function expandMenuEntriesToRecipeItems(entries: DietMenuEntry[], catalog: FoodItem[]) {
  const ingredients = new Map<string, { food: FoodItem; amount: number; order: number }>();
  const add = (snapshot: FoodSnapshot, amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    const food = foodFromSnapshot(snapshot, catalog);
    const key = `${food.id}:${snapshot.portion_unit}`;
    const existing = ingredients.get(key);
    ingredients.set(key, {
      food,
      amount: round((existing?.amount ?? 0) + amount),
      order: existing?.order ?? ingredients.size,
    });
  };

  for (const entry of entries) {
    if (entry.type === "food" && entry.food_snapshot) add(entry.food_snapshot, entry.quantity);
    if (entry.type === "recipe" && entry.recipe_snapshot) {
      const factor = entry.quantity / Number(entry.recipe_snapshot.servings || 1);
      for (const item of entry.recipe_snapshot.items) add(item.food_snapshot, Number(item.amount) * factor);
    }
  }

  return [...ingredients.values()]
    .sort((a, b) => a.order - b.order)
    .map(({ food, amount }) => ({ food, amount }));
}

export function replaceMenuEntriesWithRecipe(
  menu: DietMenu,
  mealDistribution: MealDistribution,
  mealTimeId: string,
  entryIds: string[],
  recipe: Recipe,
) {
  const selectedIds = new Set(entryIds);
  const selectedCount = activeMenu(menu).meal_menus
    .find((meal) => meal.meal_time_id === mealTimeId)?.entries
    .filter((entry) => selectedIds.has(entry.id)).length ?? 0;
  if (!selectedCount) return menu;
  const withoutEntries = entryIds.reduce((next, entryId) => removeMenuEntry(next, mealDistribution, entryId), menu);
  // Selected quantities constitute the entire batch, not one of its servings.
  return addRecipeToMenu(withoutEntries, mealDistribution, mealTimeId, recipe, Number(recipe.servings));
}

/** @deprecated Use replaceMenuEntriesWithRecipe for foods and expanded recipe snapshots. */
export function replaceFoodEntriesWithRecipe(
  menu: DietMenu,
  mealDistribution: MealDistribution,
  mealTimeId: string,
  entryIds: string[],
  recipe: Recipe,
) {
  return replaceMenuEntriesWithRecipe(menu, mealDistribution, mealTimeId, entryIds, recipe);
}

export function updateRecipeMenuEntryIngredients(
  menu: DietMenu,
  mealDistribution: MealDistribution,
  entryId: string,
  items: Array<Pick<RecipeItem, "amount" | "unit" | "food_snapshot" | "exchange_contribution">>,
) {
  const variant = activeMenu(menu);
  const mealMenus = variant.meal_menus.map((meal) => ({
    ...meal,
    entries: meal.entries.map((entry) => {
      if (entry.id !== entryId || entry.type !== "recipe" || !entry.recipe_snapshot) return entry;
      const factor = entry.quantity / Number(entry.recipe_snapshot.servings || 1);
      return {
        ...entry,
        recipe_snapshot: { ...entry.recipe_snapshot, items: items.map((item) => ({ ...item })) },
        exchange_contributions: aggregateContributions(items.flatMap((item) => item.exchange_contribution.map((value) => ({
          group_code: value.group_code,
          portions: round(value.portions * factor),
        })))),
      };
    }),
  }));
  return withVariant(menu, { ...variant, meal_menus: mealMenus });
}

export function replaceRecipeMenuEntry(
  menu: DietMenu,
  mealDistribution: MealDistribution,
  entryId: string,
  recipe: Recipe,
) {
  const variant = activeMenu(menu);
  const mealMenus = variant.meal_menus.map((meal) => ({
    ...meal,
    entries: meal.entries.map((entry) => {
      if (entry.id !== entryId || entry.type !== "recipe") return entry;
      const replacement = addRecipeToMenu(
        createDietMenu(mealDistribution, () => "replacement-menu"),
        mealDistribution,
        meal.meal_time_id,
        recipe,
        entry.quantity,
        entry.id,
      ).menus[0].meal_menus.find((candidate) => candidate.meal_time_id === meal.meal_time_id)?.entries[0];
      return replacement ?? entry;
    }),
  }));
  return withVariant(menu, { ...variant, meal_menus: mealMenus });
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
  const rows = mealDistribution.distribution.filter((item) => item.portions > 0).map((required) => {
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
      rows.push({ ...used, portions: 0, used: used.portions, remaining: -used.portions, state: "excess" as const });
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
  if (menu.status === "ready" && (mealDistribution.status !== "ready" || !sameMealDistribution(menu.source_meal_distribution_snapshot, mealDistribution))) {
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

export type RecipeCompatibilityRestriction = {
  excludedFoodIds?: string[];
  excludedGroupCodes?: ExchangeGroupCode[];
  excludedAttributes?: string[];
  likedFoodIds?: string[];
  avoidedFoodIds?: string[];
};

export type RecipeCompatibilityInput = {
  pendingExchanges: Array<{ group_code: ExchangeGroupCode; portions: number }>;
  recipe: Recipe;
  mealType?: MealType;
  restrictions?: RecipeCompatibilityRestriction;
};

export function scoreRecipeCompatibility({ pendingExchanges: required, recipe, mealType, restrictions }: RecipeCompatibilityInput) {
  const contributions = recipeExchangeContributions(recipe);
  const codes = new Set([...required.map((item) => item.group_code), ...contributions.map((item) => item.group_code)]);
  let covered = 0;
  let missing = 0;
  let excess = 0;
  let groupsCovered = 0;
  const coveredGroups: ExchangeGroupCode[] = [];
  const coverageGroups: Array<{ group_code: ExchangeGroupCode; portions: number; complete: boolean }> = [];
  const missingGroups: Array<{ group_code: ExchangeGroupCode; portions: number }> = [];
  const excessGroups: Array<{ group_code: ExchangeGroupCode; portions: number }> = [];
  for (const code of codes) {
    const needed = required.find((item) => item.group_code === code)?.portions ?? 0;
    const supplied = contributions.find((item) => item.group_code === code)?.portions ?? 0;
    covered += Math.min(needed, supplied);
    const groupMissing = Math.max(0, needed - supplied);
    const groupExcess = Math.max(0, supplied - needed);
    missing += groupMissing > MENU_COMPARISON_TOLERANCE ? groupMissing : 0;
    excess += groupExcess > MENU_COMPARISON_TOLERANCE ? groupExcess : 0;
    if (needed > MENU_COMPARISON_TOLERANCE && supplied > MENU_COMPARISON_TOLERANCE) {
      groupsCovered += 1;
      coveredGroups.push(code);
      coverageGroups.push({ group_code: code, portions: round(Math.min(needed, supplied)), complete: groupMissing <= MENU_COMPARISON_TOLERANCE });
    }
    if (groupMissing > MENU_COMPARISON_TOLERANCE) missingGroups.push({ group_code: code, portions: round(groupMissing) });
    if (groupExcess > MENU_COMPARISON_TOLERANCE) excessGroups.push({ group_code: code, portions: round(groupExcess) });
  }
  const excludedFoodIds = new Set(restrictions?.excludedFoodIds ?? []);
  const excludedGroupCodes = new Set(restrictions?.excludedGroupCodes ?? []);
  const excludedAttributes = new Set(restrictions?.excludedAttributes ?? []);
  const blocked = recipe.items.some((item) => excludedFoodIds.has(item.food_item_id ?? item.food_snapshot.id)
    || excludedGroupCodes.has(item.food_snapshot.group_code)
    || Object.entries(item.food_snapshot.attributes ?? {}).some(([attribute, value]) => value === "contains" && excludedAttributes.has(attribute)));
  const desiredTotal = required.reduce((sum, item) => sum + item.portions, 0);
  const coverageRatio = desiredTotal > MENU_COMPARISON_TOLERANCE ? covered / desiredTotal : 0;
  const mealAffinity = !mealType ? 0 : recipe.meal_types.includes(mealType) ? 1 : recipe.meal_types.length ? -0.5 : 0;
  const score = round(
    covered * 8
    + groupsCovered * 3
    + mealAffinity * 4
    - missing * 1.5
    - excess * 10
    - (blocked ? 1_000 : 0),
  );
  const label = blocked
    ? "No compatible con restricciones"
    : excess <= MENU_COMPARISON_TOLERANCE && missing <= MENU_COMPARISON_TOLERANCE
      ? "Dentro de tolerancia"
      : excess <= MENU_COMPARISON_TOLERANCE && coverageRatio >= 0.65
        ? "Buena coincidencia"
        : covered > MENU_COMPARISON_TOLERANCE && excess < covered
          ? "Coincidencia parcial"
          : "Poco compatible";
  return {
    score,
    covered: round(covered),
    missing: round(missing),
    excess: round(excess),
    coverageRatio: round(coverageRatio),
    groupsCovered,
    coveredGroups,
    coverageGroups,
    missingGroups,
    excessGroups,
    mealAffinity,
    blocked,
    label,
    contributions,
  };
}

/** @deprecated Use scoreRecipeCompatibility when meal type or restrictions are available. */
export function recipeCompatibilityScore(required: Array<{ group_code: ExchangeGroupCode; portions: number }>, recipe: Recipe) {
  return scoreRecipeCompatibility({ pendingExchanges: required, recipe });
}
