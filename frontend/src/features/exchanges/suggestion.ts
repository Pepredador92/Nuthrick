import type { ExchangeDerivedTotals, ExchangeGroupCode, ExchangeTargetSnapshot } from "@/src/types/domain";
import { exchangeCatalog as defaultExchangeCatalog, type ExchangeCatalogGroup } from "./catalog";

export const EXCHANGE_SUGGESTION_ALGORITHM_VERSION = "EXCHANGE_SUGGESTION_V1";
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

export const EXCHANGE_SUGGESTION_GROUP_TIERS: Record<ExchangeGroupCode, "preferred" | "secondary" | "discretionary"> = {
  VEGETABLES: "preferred",
  FRUITS: "preferred",
  CEREALS_NO_FAT: "preferred",
  CEREALS_WITH_FAT: "secondary",
  LEGUMES: "preferred",
  AOA_VERY_LOW_FAT: "preferred",
  AOA_LOW_FAT: "preferred",
  AOA_MODERATE_FAT: "secondary",
  AOA_HIGH_FAT: "secondary",
  MILK_SKIM: "preferred",
  MILK_SEMI_SKIM: "preferred",
  MILK_WHOLE: "secondary",
  MILK_WITH_SUGAR: "discretionary",
  FATS_NO_PROTEIN: "preferred",
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

const PRACTICALITY = {
  tierPerPortion: { preferred: 0.0002, secondary: 0.0015, discretionary: 0.05 },
  concentrationStart: 0.4,
  concentrationWeight: 0.35,
  diversityWeight: 0.012,
  highPortionWeight: 0.0015,
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
) {
  const totals = totalsFor(portions, catalog);
  const fit =
    normalizedError(totals.energy_kcal, targets.energy_kcal) * weights.energyKcal +
    normalizedError(totals.carbohydrate_g, targets.carbohydrate_g) * weights.carbohydrateG +
    normalizedError(totals.protein_g, targets.protein_g) * weights.proteinG +
    normalizedError(totals.fat_g, targets.fat_g) * weights.fatG;

  const totalPortions = portions.reduce((sum, portion) => sum + portion, 0);
  let practicality = 0;
  let concentration = 0;
  portions.forEach((portion, index) => {
    const code = catalog[index].groupCode;
    practicality += portion * PRACTICALITY.tierPerPortion[EXCHANGE_SUGGESTION_GROUP_TIERS[code]];
    const softCeiling = limits[code] * 0.65;
    if (portion > softCeiling) practicality += (portion - softCeiling) ** 2 * PRACTICALITY.highPortionWeight;
    if (totalPortions >= 4 && portion > 0) {
      const share = portion / totalPortions;
      concentration += share ** 2 * PRACTICALITY.diversityWeight;
      if (share > PRACTICALITY.concentrationStart)
        concentration += (share - PRACTICALITY.concentrationStart) ** 2 * PRACTICALITY.concentrationWeight;
    }
  });
  return { score: fit + practicality + concentration, totals };
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
  const limits = { ...EXCHANGE_SUGGESTION_LIMITS, ...options.limits };
  const current = new Map(currentPortions.map((item) => [item.groupCode ?? item.group_code, item.portions]));
  const locked = new Map(Object.entries(options.lockedGroups ?? {}) as Array<[ExchangeGroupCode, number]>);
  let portions = exchangeCatalog.map((group) => {
    const lockedValue = locked.get(group.groupCode);
    if (lockedValue !== undefined) return snap(lockedValue, increment, limits[group.groupCode]);
    return options.startFromCurrent ? snap(current.get(group.groupCode) ?? 0, increment, limits[group.groupCode]) : 0;
  });

  let evaluated = scoreFor(portions, exchangeCatalog, targets, weights, limits);
  let iterations = 0;

  while (iterations < maxIterations) {
    let bestScore = evaluated.score;
    let bestPortions: number[] | null = null;

    const consider = (candidate: number[]) => {
      const result = scoreFor(candidate, exchangeCatalog, targets, weights, limits);
      if (result.score < bestScore - PRACTICALITY.improvementEpsilon) {
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
    evaluated = scoreFor(portions, exchangeCatalog, targets, weights, limits);
    iterations += 1;
  }

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
