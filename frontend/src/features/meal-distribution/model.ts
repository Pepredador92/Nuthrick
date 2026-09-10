import { exchangeCatalog, getExchangeGroup } from "@/src/features/exchanges/catalog";
import type {
  ExchangeDerivedTotals,
  ExchangeGroupCode,
  ExchangePrescription,
  MealDistribution,
  MealDistributionEntry,
  MealExchangeSnapshot,
  MealNutritionTotal,
  MealTime,
  MealType,
} from "@/src/types/domain";

export const MEAL_DISTRIBUTION_SCHEMA_VERSION = 1 as const;
export const MEAL_DISTRIBUTION_SUGGESTION_VERSION = "MEAL_DISTRIBUTION_V1";
export const DISTRIBUTION_INCREMENT = 0.5;
const EPSILON = 1e-7;

export const mealTypeWeights: Record<MealType, number> = {
  BREAKFAST: 1,
  SNACK: 0.5,
  MAIN_MEAL: 1.3,
  DINNER: 1,
  CUSTOM: 0.8,
};

const groupMealWeights: Partial<Record<ExchangeGroupCode, Partial<Record<MealType, number>>>> = {
  VEGETABLES: { BREAKFAST: 0.55, SNACK: 0.12, MAIN_MEAL: 1.35, DINNER: 1.2, CUSTOM: 0.75 },
  FRUITS: { BREAKFAST: 1.1, SNACK: 1.15, MAIN_MEAL: 0.65, DINNER: 0.55, CUSTOM: 0.85 },
  CEREALS_NO_FAT: { BREAKFAST: 1.1, SNACK: 0.55, MAIN_MEAL: 1.25, DINNER: 1, CUSTOM: 0.9 },
  CEREALS_WITH_FAT: { BREAKFAST: 0.9, SNACK: 0.5, MAIN_MEAL: 1.1, DINNER: 0.9, CUSTOM: 0.8 },
  LEGUMES: { BREAKFAST: 0.25, SNACK: 0.08, MAIN_MEAL: 1.4, DINNER: 1, CUSTOM: 0.65 },
  AOA_VERY_LOW_FAT: { BREAKFAST: 0.7, SNACK: 0.15, MAIN_MEAL: 1.35, DINNER: 1.25, CUSTOM: 0.75 },
  AOA_LOW_FAT: { BREAKFAST: 0.7, SNACK: 0.15, MAIN_MEAL: 1.35, DINNER: 1.25, CUSTOM: 0.75 },
  AOA_MODERATE_FAT: { BREAKFAST: 0.65, SNACK: 0.12, MAIN_MEAL: 1.35, DINNER: 1.2, CUSTOM: 0.7 },
  AOA_HIGH_FAT: { BREAKFAST: 0.55, SNACK: 0.08, MAIN_MEAL: 1.3, DINNER: 1.15, CUSTOM: 0.65 },
  MILK_SKIM: { BREAKFAST: 1.25, SNACK: 1.15, MAIN_MEAL: 0.35, DINNER: 0.65, CUSTOM: 0.85 },
  MILK_SEMI_SKIM: { BREAKFAST: 1.25, SNACK: 1.15, MAIN_MEAL: 0.35, DINNER: 0.65, CUSTOM: 0.85 },
  MILK_WHOLE: { BREAKFAST: 1.2, SNACK: 1.05, MAIN_MEAL: 0.35, DINNER: 0.65, CUSTOM: 0.8 },
  MILK_WITH_SUGAR: { BREAKFAST: 1.1, SNACK: 1, MAIN_MEAL: 0.3, DINNER: 0.55, CUSTOM: 0.75 },
  FATS_NO_PROTEIN: { BREAKFAST: 0.7, SNACK: 0.35, MAIN_MEAL: 1.25, DINNER: 1.05, CUSTOM: 0.75 },
  FATS_WITH_PROTEIN: { BREAKFAST: 0.75, SNACK: 0.55, MAIN_MEAL: 1.1, DINNER: 0.95, CUSTOM: 0.8 },
  SUGARS_NO_FAT: { BREAKFAST: 0.55, SNACK: 0.45, MAIN_MEAL: 0.35, DINNER: 0.3, CUSTOM: 0.4 },
  SUGARS_WITH_FAT: { BREAKFAST: 0.5, SNACK: 0.4, MAIN_MEAL: 0.3, DINNER: 0.28, CUSTOM: 0.38 },
};

const now = () => new Date().toISOString();
const round = (value: number) => Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
const validPortions = (value: number) => Number.isFinite(value) && value >= 0;
const zeroTotals = (): ExchangeDerivedTotals => ({ energy_kcal: 0, carbohydrate_g: 0, protein_g: 0, fat_g: 0 });
const makeId = () => globalThis.crypto?.randomUUID?.() ?? `meal-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function inferMealType(name: string): MealType {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized.includes("desay")) return "BREAKFAST";
  if (normalized.includes("colac") || normalized.includes("snack") || normalized.includes("preent") || normalized.includes("postent") || normalized.includes("merienda")) return "SNACK";
  if (normalized.includes("comida") || normalized.includes("almuerzo")) return "MAIN_MEAL";
  if (normalized.includes("cena")) return "DINNER";
  return "CUSTOM";
}

export function createMealTime(displayName: string, displayOrder: number, time: string | null = null, id = makeId()): MealTime {
  return { id, meal_type: inferMealType(displayName), display_name: displayName, time, display_order: displayOrder };
}

export function createDefaultMealTimes(idFactory: () => string = makeId): MealTime[] {
  return ["Desayuno", "Colación 1", "Comida", "Colación 2", "Cena"].map((name, index) => createMealTime(name, index, null, idFactory()));
}

export function snapshotExchangeInventory(prescription: ExchangePrescription): MealExchangeSnapshot {
  return {
    exchange_system_code: prescription.exchange_system_code,
    catalog_version: prescription.catalog_version,
    groups: prescription.groups.map((group) => ({ ...group })),
  };
}

export function sameExchangeInventory(snapshot: MealExchangeSnapshot | null, prescription: ExchangePrescription) {
  if (!snapshot || snapshot.exchange_system_code !== prescription.exchange_system_code || snapshot.catalog_version !== prescription.catalog_version) return false;
  const current = new Map(prescription.groups.map((group) => [group.group_code, group.portions]));
  return snapshot.groups.every((group) => Math.abs((current.get(group.group_code) ?? 0) - group.portions) <= EPSILON)
    && prescription.groups.every((group) => snapshot.groups.some((item) => item.group_code === group.group_code));
}

export function calculateGroupDistribution(distribution: MealDistributionEntry[], groupCode: ExchangeGroupCode) {
  return round(distribution.filter((entry) => entry.group_code === groupCode).reduce((sum, entry) => sum + entry.portions, 0));
}

export function calculateRemainingExchanges(distribution: MealDistributionEntry[], prescription: ExchangePrescription, groupCode: ExchangeGroupCode) {
  const available = prescription.groups.find((group) => group.group_code === groupCode)?.portions ?? 0;
  const assigned = calculateGroupDistribution(distribution, groupCode);
  return { available, assigned, remaining: round(available - assigned) };
}

export function calculateMealNutrition(distribution: MealDistributionEntry[], mealTimeId: string): MealNutritionTotal {
  const total = distribution.filter((entry) => entry.meal_time_id === mealTimeId).reduce((sum, entry) => {
    const group = getExchangeGroup(entry.group_code);
    return {
      energy_kcal: sum.energy_kcal + entry.portions * group.energyKcal,
      carbohydrate_g: sum.carbohydrate_g + entry.portions * group.carbohydrateG,
      protein_g: sum.protein_g + entry.portions * group.proteinG,
      fat_g: sum.fat_g + entry.portions * group.fatG,
    };
  }, zeroTotals());
  return { meal_time_id: mealTimeId, ...Object.fromEntries(Object.entries(total).map(([key, value]) => [key, round(value)])) } as MealNutritionTotal;
}

export function calculateDerivedMealTotals(distribution: MealDistributionEntry[], mealTimes: MealTime[]) {
  return [...mealTimes].sort((a, b) => a.display_order - b.display_order).map((meal) => calculateMealNutrition(distribution, meal.id));
}

export function calculateDistributionStatus(distribution: MealDistributionEntry[], prescription: ExchangePrescription) {
  const groups = exchangeCatalog.map((catalog) => {
    const values = calculateRemainingExchanges(distribution, prescription, catalog.groupCode);
    const state = values.remaining < -EPSILON ? "excess" : values.remaining > EPSILON ? "pending" : "complete";
    return { group_code: catalog.groupCode, ...values, state } as const;
  }).filter((group) => group.available > EPSILON || group.assigned > EPSILON);
  const complete = groups.filter((group) => group.state === "complete").length;
  const pending = groups.filter((group) => group.state === "pending").length;
  const excess = groups.filter((group) => group.state === "excess").length;
  return {
    groups,
    complete,
    pending,
    excess,
    canConfirm: groups.length > 0 && pending === 0 && excess === 0,
    availablePortions: round(groups.reduce((sum, group) => sum + group.available, 0)),
    assignedPortions: round(groups.reduce((sum, group) => sum + group.assigned, 0)),
    remainingPortions: round(groups.reduce((sum, group) => sum + group.remaining, 0)),
  };
}

function rebuild(base: MealDistribution, distribution = base.distribution, mealTimes = base.meal_times, status = base.status, confirmedAt = base.confirmed_at): MealDistribution {
  return {
    ...base,
    meal_times: [...mealTimes].sort((a, b) => a.display_order - b.display_order).map((meal, index) => ({ ...meal, display_order: index })),
    distribution: distribution.filter((entry) => entry.portions > EPSILON),
    derived_meal_totals: calculateDerivedMealTotals(distribution, mealTimes),
    status,
    confirmed_at: confirmedAt,
    updated_at: now(),
  };
}

export function createMealDistribution(idFactory: () => string = makeId): MealDistribution {
  const mealTimes = createDefaultMealTimes(idFactory);
  return {
    schema_version: MEAL_DISTRIBUTION_SCHEMA_VERSION,
    source_exchange_snapshot: null,
    meal_times: mealTimes,
    distribution: [],
    derived_meal_totals: calculateDerivedMealTotals([], mealTimes),
    status: "not_started",
    confirmed_at: null,
    updated_at: now(),
  };
}

export function reconcileMealDistribution(current: MealDistribution, prescription: ExchangePrescription) {
  if (current.status !== "ready" || sameExchangeInventory(current.source_exchange_snapshot, prescription)) return current;
  return rebuild(current, current.distribution, current.meal_times, "editing", null);
}

export function exchangeInventoryChangedSinceConfirmation(current: MealDistribution, prescription: ExchangePrescription) {
  return current.source_exchange_snapshot !== null && !sameExchangeInventory(current.source_exchange_snapshot, prescription);
}

export function setDistributedPortions(current: MealDistribution, groupCode: ExchangeGroupCode, mealTimeId: string, portions: number) {
  if (!validPortions(portions) || !current.meal_times.some((meal) => meal.id === mealTimeId)) return current;
  const withoutCell = current.distribution.filter((entry) => !(entry.group_code === groupCode && entry.meal_time_id === mealTimeId));
  const distribution = portions > EPSILON ? [...withoutCell, { group_code: groupCode, meal_time_id: mealTimeId, portions: round(portions) }] : withoutCell;
  return rebuild(current, distribution, current.meal_times, distribution.length ? "editing" : "not_started", null);
}

export function addMealTime(current: MealDistribution, displayName: string, time: string | null = null, id = makeId()) {
  if (!displayName.trim()) return current;
  return rebuild(current, current.distribution, [...current.meal_times, createMealTime(displayName.trim(), current.meal_times.length, time || null, id)], "editing", null);
}

export function updateMealTime(current: MealDistribution, mealTimeId: string, values: Partial<Pick<MealTime, "display_name" | "time" | "meal_type">>) {
  const mealTimes = current.meal_times.map((meal) => meal.id === mealTimeId ? { ...meal, ...values } : meal);
  return rebuild(current, current.distribution, mealTimes, "editing", null);
}

export function moveMealTime(current: MealDistribution, mealTimeId: string, direction: -1 | 1) {
  const mealTimes = [...current.meal_times].sort((a, b) => a.display_order - b.display_order);
  const index = mealTimes.findIndex((meal) => meal.id === mealTimeId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= mealTimes.length) return current;
  [mealTimes[index], mealTimes[target]] = [mealTimes[target], mealTimes[index]];
  return rebuild(current, current.distribution, mealTimes.map((meal, order) => ({ ...meal, display_order: order })), "editing", null);
}

export function removeMealTime(current: MealDistribution, mealTimeId: string) {
  if (current.meal_times.length <= 1) return current;
  const mealTimes = current.meal_times.filter((meal) => meal.id !== mealTimeId);
  const distribution = current.distribution.filter((entry) => entry.meal_time_id !== mealTimeId);
  return rebuild(current, distribution, mealTimes, distribution.length ? "editing" : "not_started", null);
}

export function portionsAssignedToMeal(current: MealDistribution, mealTimeId: string) {
  return round(current.distribution.filter((entry) => entry.meal_time_id === mealTimeId).reduce((sum, entry) => sum + entry.portions, 0));
}

export function confirmMealDistribution(current: MealDistribution, prescription: ExchangePrescription) {
  const summary = calculateDistributionStatus(current.distribution, prescription);
  if (!summary.canConfirm || current.meal_times.some((meal) => !meal.display_name.trim())) return current;
  return {
    ...rebuild(current, current.distribution, current.meal_times, "ready", now()),
    source_exchange_snapshot: snapshotExchangeInventory(prescription),
  };
}

export type MealDistributionSuggestion = {
  distribution: MealDistributionEntry[];
  derived_meal_totals: MealNutritionTotal[];
  metadata: { algorithm: typeof MEAL_DISTRIBUTION_SUGGESTION_VERSION; generated_at: string; base: "zero" | "current" };
};

function weightFor(groupCode: ExchangeGroupCode, meal: MealTime) {
  return mealTypeWeights[meal.meal_type] * (groupMealWeights[groupCode]?.[meal.meal_type] ?? 1);
}

function suggestedActiveMeals(groupCode: ExchangeGroupCode, total: number, meals: MealTime[]) {
  const desired = Math.max(1, Math.ceil(total / 1.5));
  return [...meals]
    .sort((a, b) => weightFor(groupCode, b) - weightFor(groupCode, a) || a.display_order - b.display_order)
    .slice(0, Math.min(meals.length, desired));
}

export function suggestMealDistribution(current: MealDistribution, prescription: ExchangePrescription, startFromCurrent = false): MealDistributionSuggestion {
  const meals = [...current.meal_times].sort((a, b) => a.display_order - b.display_order);
  const result: MealDistributionEntry[] = [];

  for (const group of prescription.groups) {
    if (group.portions <= EPSILON || !meals.length) continue;
    const currentByMeal = new Map(meals.map((meal) => [meal.id, startFromCurrent ? current.distribution.find((entry) => entry.group_code === group.group_code && entry.meal_time_id === meal.id)?.portions ?? 0 : 0]));
    let assigned = round([...currentByMeal.values()].reduce((sum, value) => sum + value, 0));

    while (assigned > group.portions + EPSILON) {
      const candidates = meals.filter((meal) => (currentByMeal.get(meal.id) ?? 0) > EPSILON)
        .sort((a, b) => weightFor(group.group_code, a) - weightFor(group.group_code, b) || b.display_order - a.display_order);
      const meal = candidates[0];
      if (!meal) break;
      const amount = Math.min(DISTRIBUTION_INCREMENT, assigned - group.portions, currentByMeal.get(meal.id) ?? 0);
      currentByMeal.set(meal.id, round((currentByMeal.get(meal.id) ?? 0) - amount));
      assigned = round(assigned - amount);
    }

    const active = suggestedActiveMeals(group.group_code, group.portions, meals);
    while (assigned < group.portions - EPSILON) {
      const amount = Math.min(DISTRIBUTION_INCREMENT, group.portions - assigned);
      const totalWeight = active.reduce((sum, meal) => sum + weightFor(group.group_code, meal), 0) || 1;
      const meal = [...active].sort((a, b) => {
        const aDeficit = weightFor(group.group_code, a) / totalWeight - (currentByMeal.get(a.id) ?? 0) / group.portions;
        const bDeficit = weightFor(group.group_code, b) / totalWeight - (currentByMeal.get(b.id) ?? 0) / group.portions;
        return bDeficit - aDeficit || a.display_order - b.display_order;
      })[0];
      currentByMeal.set(meal.id, round((currentByMeal.get(meal.id) ?? 0) + amount));
      assigned = round(assigned + amount);
    }

    for (const meal of meals) {
      const portions = currentByMeal.get(meal.id) ?? 0;
      if (portions > EPSILON) result.push({ group_code: group.group_code, meal_time_id: meal.id, portions });
    }
  }

  return {
    distribution: result,
    derived_meal_totals: calculateDerivedMealTotals(result, meals),
    metadata: { algorithm: MEAL_DISTRIBUTION_SUGGESTION_VERSION, generated_at: now(), base: startFromCurrent ? "current" : "zero" },
  };
}

export function applyMealDistributionSuggestion(current: MealDistribution, suggestion: MealDistributionSuggestion) {
  return {
    ...rebuild(current, suggestion.distribution, current.meal_times, suggestion.distribution.length ? "editing" : "not_started", null),
    suggestion_metadata: { source: "automatic" as const, ...suggestion.metadata },
  };
}

export function sumMealNutrition(totals: MealNutritionTotal[]): ExchangeDerivedTotals {
  return totals.reduce((sum, total) => ({
    energy_kcal: round(sum.energy_kcal + total.energy_kcal),
    carbohydrate_g: round(sum.carbohydrate_g + total.carbohydrate_g),
    protein_g: round(sum.protein_g + total.protein_g),
    fat_g: round(sum.fat_g + total.fat_g),
  }), zeroTotals());
}
