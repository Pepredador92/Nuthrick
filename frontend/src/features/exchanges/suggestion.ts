import type { ExchangeDerivedTotals, ExchangeGroupCode, ExchangeTargetSnapshot } from "@/src/types/domain";
import { exchangeCatalog as defaultExchangeCatalog, type ExchangeCatalogGroup } from "./catalog";

export const EXCHANGE_SUGGESTION_ALGORITHM_VERSION = "EXCHANGE_SUGGESTION_V2";
export const EXCHANGE_SUGGESTION_INCREMENT = 0.5;

/**
 * Macronutrients lead the fit. Energy has half weight because the macro targets
 * already carry an energy contribution and should not be counted twice.
 */
export const EXCHANGE_SUGGESTION_WEIGHTS = {
  energyKcal: 0.5,
  carbohydrateG: 1,
  proteinG: 1,
  fatG: 1,
} as const;

export type ExchangeSuggestionGroupTier = "priority" | "complementary" | "secondary" | "discretionary";
export type ExchangeGroupPreference = "auto" | "include" | "avoid" | "exclude";

export const EXCHANGE_SUGGESTION_GROUP_TIERS: Record<ExchangeGroupCode, ExchangeSuggestionGroupTier> = {
  VEGETABLES: "priority",
  FRUITS: "priority",
  CEREALS_NO_FAT: "priority",
  CEREALS_WITH_FAT: "secondary",
  LEGUMES: "priority",
  AOA_VERY_LOW_FAT: "priority",
  AOA_LOW_FAT: "priority",
  AOA_MODERATE_FAT: "secondary",
  AOA_HIGH_FAT: "secondary",
  MILK_SKIM: "complementary",
  MILK_SEMI_SKIM: "complementary",
  MILK_WHOLE: "secondary",
  MILK_WITH_SUGAR: "discretionary",
  FATS_NO_PROTEIN: "complementary",
  FATS_WITH_PROTEIN: "secondary",
  SUGARS_NO_FAT: "discretionary",
  SUGARS_WITH_FAT: "discretionary",
};

/** Technical search ceilings, not clinical recommendations. */
export const EXCHANGE_SUGGESTION_LIMITS: Record<ExchangeGroupCode, number> = {
  VEGETABLES: 10,
  FRUITS: 10,
  CEREALS_NO_FAT: 16,
  CEREALS_WITH_FAT: 8,
  LEGUMES: 8,
  AOA_VERY_LOW_FAT: 14,
  AOA_LOW_FAT: 12,
  AOA_MODERATE_FAT: 10,
  AOA_HIGH_FAT: 8,
  MILK_SKIM: 8,
  MILK_SEMI_SKIM: 8,
  MILK_WHOLE: 6,
  MILK_WITH_SUGAR: 5,
  FATS_NO_PROTEIN: 12,
  FATS_WITH_PROTEIN: 8,
  SUGARS_NO_FAT: 8,
  SUGARS_WITH_FAT: 6,
};

/** Centralized technical ranking weights. They are not clinical recommendations. */
export const EXCHANGE_SUGGESTION_SCORE_WEIGHTS = {
  foodPriorityPerPortion: { priority: 0.0002, complementary: 0.003, secondary: 0.18, discretionary: 0.24 },
  avoidedGroupPerPortion: 0.18,
  missingIncludedGroup: 0.09,
  diversityShortfall: 0.08,
  legumeOpportunity: 0.018,
  activePriorityShortfall: 0.008,
  discretionaryUnlockNutritionError: 0.14,
  discretionaryMinimumImprovement: 0.04,
  concentrationStart: 0.4,
  concentrationWeight: 0.35,
  diversityWeight: 0.012,
  highPortionWeight: 0.004,
  improvementEpsilon: 1e-9,
} as const;

export type ExchangeSuggestionOptions = {
  startFromCurrent?: boolean;
  increment?: number;
  maxIterations?: number;
  weights?: Partial<typeof EXCHANGE_SUGGESTION_WEIGHTS>;
  limits?: Partial<Record<ExchangeGroupCode, number>>;
  /** Prepared for a future UI that fixes professional-selected groups. */
  lockedGroups?: Partial<Record<ExchangeGroupCode, number>>;
  groupPreferences?: Partial<Record<ExchangeGroupCode, ExchangeGroupPreference>>;
};

export type ExchangeSuggestion = {
  groups: Array<{ groupCode: ExchangeGroupCode; portions: number }>;
  totals: ExchangeDerivedTotals;
  differences: ExchangeDerivedTotals;
  score: number;
  metadata: {
    algorithmVersion: typeof EXCHANGE_SUGGESTION_ALGORITHM_VERSION;
    increment: number;
    iterations: number;
  };
};

type CurrentPortion = { groupCode?: ExchangeGroupCode; group_code?: ExchangeGroupCode; portions: number };

export type SuggestExchangePrescriptionInput = {
  targets: ExchangeTargetSnapshot;
  exchangeCatalog?: readonly ExchangeCatalogGroup[];
  currentPortions?: readonly CurrentPortion[];
  options?: ExchangeSuggestionOptions;
};

const round = (value: number) => Math.round(value * 1e8) / 1e8;
const normalizedError = (actual: number, target: number) => Math.abs(actual - target) / Math.max(Math.abs(target), 1);

function totalsFor(portions: readonly number[], catalog: readonly ExchangeCatalogGroup[]): ExchangeDerivedTotals {
  return portions.reduce<ExchangeDerivedTotals>((total, portion, index) => {
    const group = catalog[index];
    return {
      energy_kcal: total.energy_kcal + portion * group.energyKcal,
      carbohydrate_g: total.carbohydrate_g + portion * group.carbohydrateG,
      protein_g: total.protein_g + portion * group.proteinG,
      fat_g: total.fat_g + portion * group.fatG,
    };
  }, { energy_kcal: 0, carbohydrate_g: 0, protein_g: 0, fat_g: 0 });
}

function scoreFor(
  portions: readonly number[],
  catalog: readonly ExchangeCatalogGroup[],
  targets: ExchangeTargetSnapshot,
  weights: typeof EXCHANGE_SUGGESTION_WEIGHTS,
  limits: Record<ExchangeGroupCode, number>,
  preferences: Record<ExchangeGroupCode, ExchangeGroupPreference>,
) {
  const totals = totalsFor(portions, catalog);
  const fit =
    normalizedError(totals.energy_kcal, targets.energy_kcal) * weights.energyKcal +
    normalizedError(totals.carbohydrate_g, targets.carbohydrate_g) * weights.carbohydrateG +
    normalizedError(totals.protein_g, targets.protein_g) * weights.proteinG +
    normalizedError(totals.fat_g, targets.fat_g) * weights.fatG;

  const totalPortions = portions.reduce((sum, portion) => sum + portion, 0);
  let practicalityPenalty = 0;
  let foodPriorityPenalty = 0;
  let preferencePenalty = 0;
  let concentration = 0;
  portions.forEach((portion, index) => {
    const code = catalog[index].groupCode;
    const preference = preferences[code];
    if (preference === "include") {
      if (portion <= 0) preferencePenalty += EXCHANGE_SUGGESTION_SCORE_WEIGHTS.missingIncludedGroup;
    } else if (preference === "avoid") {
      preferencePenalty += portion * EXCHANGE_SUGGESTION_SCORE_WEIGHTS.avoidedGroupPerPortion;
    } else {
      foodPriorityPenalty += portion * EXCHANGE_SUGGESTION_SCORE_WEIGHTS.foodPriorityPerPortion[EXCHANGE_SUGGESTION_GROUP_TIERS[code]];
    }
    const softCeiling = limits[code] * 0.65;
    if (portion > softCeiling) practicalityPenalty += (portion - softCeiling) ** 2 * EXCHANGE_SUGGESTION_SCORE_WEIGHTS.highPortionWeight;
    if (totalPortions >= 4 && portion > 0) {
      const share = portion / totalPortions;
      concentration += share ** 2 * EXCHANGE_SUGGESTION_SCORE_WEIGHTS.diversityWeight;
      if (share > EXCHANGE_SUGGESTION_SCORE_WEIGHTS.concentrationStart)
        concentration += (share - EXCHANGE_SUGGESTION_SCORE_WEIGHTS.concentrationStart) ** 2 * EXCHANGE_SUGGESTION_SCORE_WEIGHTS.concentrationWeight;
    }
  });

  const portionFor = (code: ExchangeGroupCode) => {
    const index = catalog.findIndex((group) => group.groupCode === code);
    return index >= 0 ? portions[index] : 0;
  };
  const catalogCodes = new Set(catalog.map((group) => group.groupCode));
  const canUse = (codes: readonly ExchangeGroupCode[]) => codes.some((code) => catalogCodes.has(code) && preferences[code] !== "exclude");
  const shortfall = (actual: number, minimum: number) => Math.max(0, minimum - actual) ** 2 * EXCHANGE_SUGGESTION_SCORE_WEIGHTS.diversityShortfall;
  let diversityPenalty = 0;
  if (canUse(["VEGETABLES"])) diversityPenalty += shortfall(portionFor("VEGETABLES"), 1);
  if (canUse(["FRUITS"])) diversityPenalty += shortfall(portionFor("FRUITS"), 1);
  if (canUse(["CEREALS_NO_FAT", "CEREALS_WITH_FAT"])) diversityPenalty += shortfall(portionFor("CEREALS_NO_FAT") + portionFor("CEREALS_WITH_FAT"), 1);
  const proteinCodes: readonly ExchangeGroupCode[] = ["LEGUMES", "AOA_VERY_LOW_FAT", "AOA_LOW_FAT", "AOA_MODERATE_FAT", "AOA_HIGH_FAT"];
  if (canUse(proteinCodes)) diversityPenalty += shortfall(proteinCodes.reduce((sum, code) => sum + portionFor(code), 0), 1);
  if (preferences.LEGUMES === "auto" && targets.carbohydrate_g >= 80 && targets.protein_g >= 40 && portionFor("LEGUMES") === 0) {
    diversityPenalty += EXCHANGE_SUGGESTION_SCORE_WEIGHTS.legumeOpportunity;
  }
  const activePriorityGroups = catalog.filter((group, index) => EXCHANGE_SUGGESTION_GROUP_TIERS[group.groupCode] === "priority" && preferences[group.groupCode] !== "exclude" && portions[index] > 0).length;
  diversityPenalty += Math.max(0, 4 - activePriorityGroups) ** 2 * EXCHANGE_SUGGESTION_SCORE_WEIGHTS.activePriorityShortfall;

  return {
    score: fit + diversityPenalty + practicalityPenalty + foodPriorityPenalty + preferencePenalty + concentration,
    nutritionError: fit,
    totals,
  };
}

function snap(value: number, increment: number, maximum: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(maximum, round(Math.round(value / increment) * increment));
}

export function suggestExchangePrescription({
  targets,
  exchangeCatalog = defaultExchangeCatalog,
  currentPortions = [],
  options = {},
}: SuggestExchangePrescriptionInput): ExchangeSuggestion {
  const increment = options.increment && options.increment > 0 ? options.increment : EXCHANGE_SUGGESTION_INCREMENT;
  const maxIterations = options.maxIterations ?? 500;
  const weights = { ...EXCHANGE_SUGGESTION_WEIGHTS, ...options.weights };
  const configuredLimits = { ...EXCHANGE_SUGGESTION_LIMITS, ...options.limits };
  const preferences = Object.fromEntries(defaultExchangeCatalog.map((group) => [group.groupCode, options.groupPreferences?.[group.groupCode] ?? "auto"])) as Record<ExchangeGroupCode, ExchangeGroupPreference>;
  const current = new Map(currentPortions.map((item) => [item.groupCode ?? item.group_code, item.portions]));
  const locked = new Map(Object.entries(options.lockedGroups ?? {}) as Array<[ExchangeGroupCode, number]>);
  for (const group of exchangeCatalog) if (preferences[group.groupCode] === "exclude") locked.set(group.groupCode, 0);
  const conservativeLimits = { ...configuredLimits };
  for (const group of exchangeCatalog) {
    const currentValue = current.get(group.groupCode) ?? 0;
    if (EXCHANGE_SUGGESTION_GROUP_TIERS[group.groupCode] === "discretionary" && preferences[group.groupCode] === "auto" && !(options.startFromCurrent && currentValue > 0)) {
      conservativeLimits[group.groupCode] = 0;
    }
  }
  const initialPortions = exchangeCatalog.map((group) => {
    const lockedValue = locked.get(group.groupCode);
    if (lockedValue !== undefined) return snap(lockedValue, increment, conservativeLimits[group.groupCode]);
    return options.startFromCurrent ? snap(current.get(group.groupCode) ?? 0, increment, conservativeLimits[group.groupCode]) : 0;
  });

  const optimize = (startingPortions: number[], limits: Record<ExchangeGroupCode, number>, iterationLimit: number, searchPreferences = preferences) => {
    let portions = [...startingPortions];
    let evaluated = scoreFor(portions, exchangeCatalog, targets, weights, limits, searchPreferences);
    let iterations = 0;
    while (iterations < iterationLimit) {
      let bestScore = evaluated.score;
      let bestPortions: number[] | null = null;
      const consider = (candidate: number[]) => {
        const result = scoreFor(candidate, exchangeCatalog, targets, weights, limits, searchPreferences);
        if (result.score < bestScore - EXCHANGE_SUGGESTION_SCORE_WEIGHTS.improvementEpsilon) {
          bestScore = result.score;
          bestPortions = candidate;
        }
      };
      for (let index = 0; index < exchangeCatalog.length; index += 1) {
        const code = exchangeCatalog[index].groupCode;
        if (locked.has(code)) continue;
        if (portions[index] + increment <= limits[code]) {
          const candidate = [...portions];
          candidate[index] = round(candidate[index] + increment);
          consider(candidate);
        }
        if (portions[index] >= increment) {
          const candidate = [...portions];
          candidate[index] = round(candidate[index] - increment);
          consider(candidate);
        }
      }
      for (let from = 0; from < exchangeCatalog.length; from += 1) {
        if (locked.has(exchangeCatalog[from].groupCode) || portions[from] < increment) continue;
        for (let to = 0; to < exchangeCatalog.length; to += 1) {
          const toCode = exchangeCatalog[to].groupCode;
          if (from === to || locked.has(toCode) || portions[to] + increment > limits[toCode]) continue;
          const candidate = [...portions];
          candidate[from] = round(candidate[from] - increment);
          candidate[to] = round(candidate[to] + increment);
          consider(candidate);
        }
      }
      if (!bestPortions) break;
      portions = bestPortions;
      evaluated = scoreFor(portions, exchangeCatalog, targets, weights, limits, searchPreferences);
      iterations += 1;
    }
    return { portions, evaluated, iterations };
  };

  let optimized = optimize(initialPortions, conservativeLimits, maxIterations);
  const hasLockedAutoDiscretionary = exchangeCatalog.some((group) => conservativeLimits[group.groupCode] === 0 && configuredLimits[group.groupCode] > 0);
  if (hasLockedAutoDiscretionary && optimized.evaluated.nutritionError > EXCHANGE_SUGGESTION_SCORE_WEIGHTS.discretionaryUnlockNutritionError) {
    const unlockedPreferences = { ...preferences };
    for (const group of exchangeCatalog) if (EXCHANGE_SUGGESTION_GROUP_TIERS[group.groupCode] === "discretionary" && preferences[group.groupCode] === "auto") unlockedPreferences[group.groupCode] = "include";
    const unlocked = optimize(optimized.portions, configuredLimits, Math.max(1, maxIterations - optimized.iterations), unlockedPreferences);
    const relevantImprovement = optimized.evaluated.nutritionError - unlocked.evaluated.nutritionError >= EXCHANGE_SUGGESTION_SCORE_WEIGHTS.discretionaryMinimumImprovement;
    if (relevantImprovement) {
      optimized = { portions: unlocked.portions, evaluated: scoreFor(unlocked.portions, exchangeCatalog, targets, weights, configuredLimits, preferences), iterations: optimized.iterations + unlocked.iterations };
    }
  }
  const { portions, evaluated, iterations } = optimized;

  const totals = Object.fromEntries(Object.entries(evaluated.totals).map(([key, value]) => [key, round(value)])) as ExchangeDerivedTotals;
  const differences: ExchangeDerivedTotals = {
    energy_kcal: round(totals.energy_kcal - targets.energy_kcal),
    carbohydrate_g: round(totals.carbohydrate_g - targets.carbohydrate_g),
    protein_g: round(totals.protein_g - targets.protein_g),
    fat_g: round(totals.fat_g - targets.fat_g),
  };

  return {
    groups: exchangeCatalog.map((group, index) => ({ groupCode: group.groupCode, portions: portions[index] })),
    totals,
    differences,
    score: evaluated.score,
    metadata: { algorithmVersion: EXCHANGE_SUGGESTION_ALGORITHM_VERSION, increment, iterations },
  };
}
