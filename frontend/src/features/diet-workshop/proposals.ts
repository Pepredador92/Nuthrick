import { exchangeCatalog, getExchangeGroup } from "@/src/features/exchanges/catalog";
import { suggestExchangePrescription, type ExchangeSuggestion, type SuggestExchangePrescriptionInput } from "@/src/features/exchanges/suggestion";
import { calculateDerivedMealTotals, createMealDistribution, type MealDistributionSuggestion } from "@/src/features/meal-distribution/model";
import { applyExchangeSuggestion, createExchangePrescription } from "@/src/features/exchanges/model";
import { recipeExchangeContributions } from "@/src/features/menu/model";
import { practicalQuantity } from "@/src/features/menu/planner";
import type { ExchangeGroupCode, ExchangePrescription, FoodItem, MealDistribution, Recipe } from "@/src/types/domain";

export type PreparationCatalog = { foods: FoodItem[]; recipes: Recipe[] };
/** Technical search bounds, never changes the professional's targets. */
export const PROPOSAL_POLICY = { comparableError: 0.035, maximumError: 0.15, inventoryEpsilon: 1e-7, candidates: 18 };
export const family = (code: string) => code.startsWith("AOA_") ? "AOA" : code.startsWith("MILK_") ? "MILK" : code.startsWith("CEREALS_") ? "CEREALS" : code;
const priority = (code: string) => family(code) === "AOA" ? 0 : family(code) === "CEREALS" ? 1 : code === "LEGUMES" ? 2 : code === "FRUITS" ? 3 : 4;
const round = (n: number) => Math.round(n * 1e8) / 1e8;
export const exchangeKey = (p: ExchangeSuggestion) => JSON.stringify(p.groups.map(g => [g.groupCode, g.portions]).sort());
export const mealKey = (p: MealDistributionSuggestion) => JSON.stringify(p.distribution.filter(e => e.portions > 0).map(e => [e.meal_time_id, e.group_code, e.portions]).sort());
const maxError = (p: ExchangeSuggestion, targets: SuggestExchangePrescriptionInput["targets"]) => Math.max(...Object.entries(p.differences).map(([key, value]) => Math.abs(value) / Math.max(1, targets[key as keyof typeof targets])));

function everydayRecipePriority(recipe: Recipe, meal: MealDistribution["meal_times"][number]) {
  const groups = new Set(recipeExchangeContributions(recipe).map(item => item.group_code));
  const has = (code: ExchangeGroupCode) => groups.has(code);
  const hasAoa = [...groups].some(code => code.startsWith("AOA_"));
  const hasMilk = [...groups].some(code => code.startsWith("MILK_"));
  let score = recipe.source === "NUTHRICK_EDITORIAL_PREPARATIONS" ? 8 : recipe.source === "NUTHRICK_STARTER_RECIPES" ? 5 : 0;
  score += recipe.meal_types.includes(meal.meal_type) ? 6 : -20;
  if (meal.meal_type === "BREAKFAST") score += (has("CEREALS_NO_FAT") ? 3 : 0) + (hasAoa ? 3 : 0) + (has("FRUITS") ? 2 : 0) + (hasMilk ? 1 : 0);
  if (meal.meal_type === "MAIN_MEAL") score += (hasAoa ? 3 : 0) + (has("VEGETABLES") ? 3 : 0) + (has("CEREALS_NO_FAT") || has("LEGUMES") ? 2 : 0);
  if (meal.meal_type === "DINNER") score += (hasAoa ? 3 : 0) + (has("CEREALS_NO_FAT") || has("LEGUMES") ? 2 : 0) + (has("VEGETABLES") ? 2 : 0);
  return score;
}

export function preparationQuality(groups: Array<{ groupCode: ExchangeGroupCode; portions: number }>, catalog?: PreparationCatalog) {
  const active = groups.filter(g => g.portions > 0);
  const milk = active.filter(g => family(g.groupCode) === "MILK").length;
  const families = new Set(active.map(g => family(g.groupCode)));
  let penalty = active.length * 0.1 + Math.max(0, milk - 1) * 3;
  for (const g of active) {
    const comfortable = family(g.groupCode) === "CEREALS" || family(g.groupCode) === "AOA" ? 8 : 4;
    penalty += Math.max(0, g.portions - comfortable) ** 2 * 0.15;
  }
  penalty += active.filter(g => g.portions < 0.5).length;
  penalty += Math.max(0, active.filter(g => family(g.groupCode) === "AOA").length - 2) * 0.8;
  if (catalog?.foods.length) penalty += active.filter(g => !catalog.foods.some(f => f.active && f.group_code === g.groupCode)).length * 4;
  if (catalog?.foods.length) for (const g of active) {
    const foods = catalog.foods.filter(f => f.active && f.group_code === g.groupCode && f.portion_amount > 0);
    if (foods.length && !foods.some(f => Math.abs(practicalQuantity(g.portions * f.portion_amount, f.portion_unit) / f.portion_amount - g.portions) <= 0.1)) penalty += 0.5;
  }
  if (families.has("AOA") && families.has("CEREALS")) penalty -= 0.2;
  if (families.has("LEGUMES") && families.has("CEREALS")) penalty -= 0.2;
  if (catalog?.recipes.some(recipe => recipe.active && recipeExchangeContributions(recipe).every(c => (active.find(g => g.groupCode === c.group_code)?.portions ?? 0) >= c.portions))) penalty -= 0.5;
  return penalty;
}

export function exchangeAlternatives(input: SuggestExchangePrescriptionInput, catalog?: PreparationCatalog, configuredMeals?: MealDistribution | null) {
  const options = input.options ?? {};
  for (const [code, value] of Object.entries(options.lockedGroups ?? {})) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`Revisa la cantidad fijada de ${getExchangeGroup(code as ExchangeGroupCode).shortName}.`);
    if (value > 0 && options.groupPreferences?.[code as ExchangeGroupCode] === "exclude") throw new Error(`${getExchangeGroup(code as ExchangeGroupCode).shortName} está fijado y excluido. Libera su cantidad o cambia la exclusión.`);
  }
  const found = new Map<string, ExchangeSuggestion>();
  const codes = [...exchangeCatalog].sort((a, b) => priority(a.groupCode) - priority(b.groupCode));
  const base = suggestExchangePrescription(input);
  found.set(exchangeKey(base), base);
  // Different deterministic starting points and exact subgroup omissions explore
  // different basins; explicit inclusion, exclusion and locks always take precedence.
  for (let i = 0; i < PROPOSAL_POLICY.candidates; i++) {
    const seed = codes[i % codes.length].groupCode;
    const preferences = { ...options.groupPreferences };
    if (i < 4) for (const g of codes.filter(g => family(g.groupCode) === "MILK")) {
      if (!preferences[g.groupCode] && options.lockedGroups?.[g.groupCode] === undefined && (i === 0 || g.groupCode !== ["MILK_SKIM", "MILK_SEMI_SKIM", "MILK_WHOLE"][i - 1])) preferences[g.groupCode] = "exclude";
    }
    const limits = { ...options.limits };
    if (i >= 4 && i < 10 && options.lockedGroups?.LEGUMES === undefined && preferences.LEGUMES !== "include") limits.LEGUMES = Math.min(limits.LEGUMES ?? Infinity, i % 2 ? 4 : 3);
    if (i >= 4 && i < 10) for (const g of codes.filter(g => family(g.groupCode) === "MILK")) {
      if (options.lockedGroups?.[g.groupCode] === undefined && preferences[g.groupCode] !== "include") limits[g.groupCode] = Math.min(limits[g.groupCode] ?? Infinity, i % 3);
    }
    if (i >= 10) {
      for (const [code, cap] of [["FRUITS", 3 + i % 3], ["LEGUMES", 2 + i % 3], ["MILK_SKIM", i % 3], ["MILK_SEMI_SKIM", i % 3], ["MILK_WHOLE", i % 3]] as const) {
        if (options.lockedGroups?.[code] === undefined && preferences[code] !== "include") limits[code] = Math.min(limits[code] ?? Infinity, cap);
      }
    }
    const p = suggestExchangePrescription({ ...input, currentPortions: options.startFromCurrent ? input.currentPortions : [{ groupCode: seed, portions: 2 }], options: { ...options, limits, startFromCurrent: true, groupPreferences: preferences } });
    found.set(exchangeKey(p), p);
  }
  const all = [...found.values()];
  const best = Math.min(...all.map(p => maxError(p, input.targets)));
  if (best > PROPOSAL_POLICY.maximumError) throw new Error("No encontramos una propuesta cercana a los objetivos con estas condiciones. Revisa las cantidades fijadas, las exclusiones o ajusta manualmente el cuadro.");
  const meals = configuredMeals ?? createMealDistribution();
  const candidates = all.filter(p => maxError(p, input.targets) <= Math.min(PROPOSAL_POLICY.maximumError, best + PROPOSAL_POLICY.comparableError));
  const quality = new Map(candidates.map(p => {
    const prescription = applyExchangeSuggestion(createExchangePrescription(input.targets), input.targets, p);
    const distribution = mealAlternatives(meals, prescription, [], false, catalog)[0];
    return [p, preparationQuality(p.groups, catalog) + (distribution ? distributionQuality(distribution, meals, catalog) * 0.2 : 10)];
  }));
  return candidates.sort((a, b) => quality.get(a)! - quality.get(b)! || maxError(a, input.targets) - maxError(b, input.targets));
}

export function describeExchanges(p: ExchangeSuggestion) {
  const active = p.groups.filter(g => g.portions > 0);
  const milk = active.filter(g => family(g.groupCode) === "MILK").length;
  return `${milk === 0 ? "Sin leche" : milk === 1 ? "Utiliza un solo subtipo de leche" : `Utiliza ${milk} subtipos de leche durante el día`}. ${active.length} grupos con porciones de captura práctica.`;
}

export function preparationLimitations(codes: ExchangeGroupCode[], catalog?: PreparationCatalog) {
  if (!catalog) return "Propuesta general editable; comprueba los alimentos al construir el Menú.";
  const missing = [...new Set(codes)].filter(code => !catalog.foods.some(f => f.active && f.group_code === code));
  return missing.length ? `No hay alimentos disponibles para ${missing.map(code => getExchangeGroup(code).shortName).join(", ")}. Revisa esos grupos en Equivalentes o incorpora alimentos al catálogo.` : "";
}

export function mealAlternatives(current: MealDistribution, prescription: ExchangePrescription, lockedIds: string[], startFromCurrent: boolean, catalog?: PreparationCatalog): MealDistributionSuggestion[] {
  const meals = [...current.meal_times].sort((a, b) => a.display_order - b.display_order);
  const fixed = current.distribution.filter(e => lockedIds.includes(e.meal_time_id));
  const free = meals.filter(m => !lockedIds.includes(m.id));
  for (const entry of fixed) {
    if (!Number.isFinite(entry.portions) || entry.portions < 0) throw new Error("Revisa las cantidades del tiempo conservado.");
    const available = prescription.groups.find(g => g.group_code === entry.group_code)?.portions ?? 0;
    const used = fixed.filter(e => e.group_code === entry.group_code).reduce((s, e) => s + e.portions, 0);
    if (used > available + PROPOSAL_POLICY.inventoryEpsilon) throw new Error(`${getExchangeGroup(entry.group_code).shortName} excede el inventario en los tiempos conservados. Libera uno de esos tiempos o revisa Equivalentes.`);
  }
  const found = new Map<string, MealDistributionSuggestion>();
  for (let variant = 0; variant < PROPOSAL_POLICY.candidates; variant++) {
    const entries = fixed.map(e => ({ ...e }));
    const put = (code: ExchangeGroupCode, id: string, n: number) => {
      if (n <= 0) return;
      const e = entries.find(e => e.group_code === code && e.meal_time_id === id);
      if (e) e.portions = round(e.portions + n); else entries.push({ group_code: code, meal_time_id: id, portions: n });
    };
    const inventory = new Map(prescription.groups.map(g => [g.group_code, round(g.portions - fixed.filter(e => e.group_code === g.group_code).reduce((s, e) => s + e.portions, 0))]));
    if (!free.length && [...inventory.values()].some(n => n > PROPOSAL_POLICY.inventoryEpsilon)) throw new Error("Todos los tiempos están conservados y quedan porciones pendientes. Libera un tiempo para distribuirlas.");
    // Seed every proposal with a familiar, feasible preparation when the catalog
    // allows it. The three default times then resolve as breakfast, main meal and
    // dinner rather than as a generic group-only split.
    const recipeCandidates = (catalog?.recipes ?? [])
      .filter(recipe => recipe.active && !recipe.tags.includes("nuthrick:drink") && recipeExchangeContributions(recipe).length > 1 && recipeExchangeContributions(recipe).every(c => (inventory.get(c.group_code) ?? 0) >= c.portions))
      .flatMap(recipe => free.filter(meal => recipe.meal_types.includes(meal.meal_type)).map(meal => ({ recipe, meal, score: everydayRecipePriority(recipe, meal) })))
      .sort((a, b) => b.score - a.score || a.recipe.name.localeCompare(b.recipe.name, "es-MX") || a.meal.display_order - b.meal.display_order);
    if (recipeCandidates.length) {
      const selected = recipeCandidates[variant % recipeCandidates.length];
      for (const contribution of recipeExchangeContributions(selected.recipe)) {
        put(contribution.group_code, selected.meal.id, contribution.portions);
        inventory.set(contribution.group_code, round((inventory.get(contribution.group_code) ?? 0) - contribution.portions));
      }
    }
    for (const [code, total] of [...inventory].sort(([a], [b]) => priority(a) - priority(b))) {
      if (total <= PROPOSAL_POLICY.inventoryEpsilon || !free.length) continue;
      const ranked = [...free].sort((a, b) => {
        const score = (m: typeof a) => {
          const present = entries.filter(e => e.meal_time_id === m.id && e.portions > 0);
          const has = (f: string) => present.some(e => family(e.group_code) === f);
          let s = m.meal_type === "SNACK" ? -3 : 0;
          if (code === "FRUITS" || family(code) === "MILK") s += m.meal_type === "SNACK" || m.meal_type === "BREAKFAST" ? 3 : 0;
          if (code === "AOA_MODERATE_FAT" && m.meal_type === "BREAKFAST") s += 3;
          if ((code === "LEGUMES" || family(code) === "CEREALS") && has("AOA")) s += 3;
          if (code === "LEGUMES" && has("CEREALS")) s += 2;
          if (family(code) === "MILK" && present.some(e => family(e.group_code) === "MILK" && e.group_code !== code)) s -= 10;
          if (startFromCurrent && current.distribution.some(e => e.meal_time_id === m.id && e.group_code === code && e.portions > 0)) s += 1;
          s += ((m.display_order + variant) % Math.max(free.length, 1)) * 1.2;
          s -= present.reduce((sum, e) => sum + e.portions, 0) * 0.4;
          return s;
        };
        return score(b) - score(a) || a.display_order - b.display_order;
      });
      const count = Math.min(ranked.length, Math.max(1, Math.ceil(total / (variant % 2 ? 4 : 3))));
      let remaining = total;
      for (let i = 0; i < count; i++) {
        const n = i === count - 1 ? remaining : Math.floor(remaining / (count - i) * 2) / 2;
        put(code, ranked[i].id, n); remaining = round(remaining - n);
      }
    }
    const p: MealDistributionSuggestion = { distribution: entries, derived_meal_totals: calculateDerivedMealTotals(entries, meals), metadata: { algorithm: "MEAL_PREPARATION_V2", generated_at: new Date().toISOString(), base: startFromCurrent ? "current" : "zero" } };
    found.set(mealKey(p), p);
  }
  return [...found.values()].sort((a, b) => distributionQuality(a, current, catalog) - distributionQuality(b, current, catalog));
}

function distributionQuality(p: MealDistributionSuggestion, current: MealDistribution, catalog?: PreparationCatalog) {
  const total = p.distribution.reduce((s, e) => s + e.portions, 0);
  return current.meal_times.reduce((sum, m) => {
    const entries = p.distribution.filter(e => e.meal_time_id === m.id);
    const amount = entries.reduce((s, e) => s + e.portions, 0);
    const emptyMeal = m.meal_type !== "SNACK" && !entries.length && total >= current.meal_times.length ? 5 : 0;
    const concentration = Math.max(0, amount / Math.max(total, 1) - 0.5) * 15;
    return sum + preparationQuality(entries.map(e => ({ groupCode: e.group_code, portions: e.portions })), catalog) + emptyMeal + concentration;
  }, 0);
}

export function describeMeals(p: MealDistributionSuggestion, current: MealDistribution, locked: string[]) {
  const legumes = current.meal_times.filter(m => p.distribution.some(e => e.meal_time_id === m.id && e.group_code === "LEGUMES" && e.portions > 0)).map(m => m.display_name);
  return [locked.length ? `Conserva ${current.meal_times.filter(m => locked.includes(m.id)).map(m => m.display_name).join(", ")}.` : "Distribución general editable.", legumes.length ? `Leguminosas en ${legumes.join(" y ")}.` : "", "Conserva todos los equivalentes del día."].filter(Boolean).join(" ");
}
