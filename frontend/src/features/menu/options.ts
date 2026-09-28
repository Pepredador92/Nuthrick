import type { DietMenu, ExchangeGroupCode, MealDistribution, MealOption } from "@/src/types/domain";
import { activeMenu, calculateMenuStatus, calculateMenuUsage, roundMenuNumber } from "./model";
import { menuRestrictions, recipeFromEntry, recipeHasKnownContributions } from "./mesa";
import { isFoodRestricted } from "./planner";

export const MAX_MEAL_OPTIONS = 7;
/** Clinical confirmation margin per group; distinct from the calculator's 0.1 eq display comparison. */
export const MEAL_CONFIRMATION_TOLERANCE = 0.5;
export type MealConfirmationStatus = "exact" | "within_tolerance" | "outside_tolerance" | "invalid";
export type MealConfirmationDeviation = {
  group_code: ExchangeGroupCode;
  required: number;
  covered: number;
  difference: number;
  within_tolerance: boolean;
};
export function prescriptionKey(distribution: MealDistribution, mealId: string) {
  return JSON.stringify([distribution.meal_times.find(m => m.id === mealId)?.meal_type,
    distribution.distribution.filter(r => r.meal_time_id === mealId && r.portions > 0).map(r => [r.group_code, Number(r.portions.toFixed(6))]).sort()]);
}

/** Adapter only: the existing calculator receives ONE option per meal, never the bank. */
export function projectOptions(menu: DietMenu, distribution: MealDistribution, selection: Record<string, string> = {}): DietMenu {
  const variant = activeMenu(menu);
  const next = { ...menu, menus: menu.menus.map(v => v.id !== variant.id ? v : { ...v, meal_menus: distribution.meal_times.map(m => ({
    meal_time_id: m.id,
    entries: (menu.meal_options?.find(o => o.meal_time_id === m.id && o.id === selection[m.id]) ?? menu.meal_options?.find(o => o.meal_time_id === m.id))?.entries ?? [],
  })) }) };
  return { ...next, derived_exchange_usage: calculateMenuUsage(next) };
}

export function optionPortionDifferences(menu: DietMenu, distribution: MealDistribution, option: MealOption) {
  const projected = projectOptions({ ...menu, meal_options: [option] }, distribution);
  return calculateMenuStatus(projected, distribution).rows.filter(r => r.meal_time_id === option.meal_time_id && r.state !== "complete");
}

export function optionCanConfirm(menu: DietMenu, distribution: MealDistribution, option: MealOption) {
  const restrictions = menuRestrictions(menu);
  return distribution.status === "ready" && distribution.meal_times.some(m => m.id === option.meal_time_id)
    && option.name.trim().length > 0 && option.entries.length > 0
    && option.entries.every(e => Number.isFinite(e.quantity) && e.quantity > 0
      && e.exchange_contributions.every(c => Number.isFinite(c.portions) && c.portions >= 0)
      && (e.recipe_snapshot ? recipeHasKnownContributions(recipeFromEntry(e)!) : Boolean(e.food_snapshot && e.exchange_contributions.length > 0))
      && (e.food_snapshot ? [e.food_snapshot] : e.recipe_snapshot?.items.map(i => i.food_snapshot) ?? []).every(f => !isFoodRestricted(f, restrictions)));
}
/** One decision shared by confirmation actions and feedback. Does not alter the prescription. */
export function evaluateMealConfirmationStatus(menu: DietMenu, distribution: MealDistribution, option: MealOption) {
  const invalid = { status: "invalid" as MealConfirmationStatus, deviations: [] as MealConfirmationDeviation[], canConfirm: false, requiresExplicitConfirmation: false };
  const prescribed = distribution.distribution.filter(row => row.meal_time_id === option.meal_time_id);
  if (!optionCanConfirm(menu, distribution, option) || prescribed.some(row => !Number.isFinite(row.portions) || row.portions < 0)
    || !prescribed.some(row => row.portions > 0)) return invalid;
  const projected = projectOptions({ ...menu, meal_options: [option] }, distribution);
  const rows = calculateMenuStatus(projected, distribution).rows.filter(row => row.meal_time_id === option.meal_time_id);
  if (!rows.length || rows.some(row => !Number.isFinite(row.used) || !Number.isFinite(row.portions))) return invalid;
  // The menu comparison intentionally omits an unprescribed group below 0.1 eq;
  // confirmation still needs to distinguish that small contribution from exact zero.
  const uncoveredUsage = calculateMenuUsage(projected).filter(usage => usage.meal_time_id === option.meal_time_id
    && usage.portions > 0 && !rows.some(row => row.group_code === usage.group_code));
  const deviations = [...rows, ...uncoveredUsage.map(usage => ({ ...usage, portions: 0, used: usage.portions }))].map(row => {
    const difference = roundMenuNumber(row.used - row.portions);
    return { group_code: row.group_code, required: row.portions, covered: row.used, difference,
      within_tolerance: Math.abs(difference) <= MEAL_CONFIRMATION_TOLERANCE };
  });
  const status: MealConfirmationStatus = deviations.every(row => row.difference === 0) ? "exact"
    : deviations.every(row => row.within_tolerance) ? "within_tolerance" : "outside_tolerance";
  return { status, deviations, canConfirm: true, requiresExplicitConfirmation: status === "outside_tolerance" };
}
export function optionIsEligible(menu: DietMenu, distribution: MealDistribution, option: MealOption) {
  return option.status === "confirmed" && option.prescription_key === prescriptionKey(distribution, option.meal_time_id) && optionCanConfirm(menu, distribution, option);
}

/** Lazy, deterministic legacy adaptation. Reading a plan does not write it. Other whole-day variants stay intact. */
export function ensureOptionBank(menu: DietMenu, distribution: MealDistribution): DietMenu {
  if (menu.meal_options) return menu;
  const variant = activeMenu(menu);
  const options: MealOption[] = distribution.meal_times.map(m => ({
    id: `${variant.id}:${m.id}:initial`, meal_time_id: m.id, name: `${m.display_name} · opción 1`,
    entries: structuredClone(variant.meal_menus.find(v => v.meal_time_id === m.id)?.entries ?? []),
    status: menu.status === "ready" ? "confirmed" : "draft", confirmed_at: menu.confirmed_at,
    prescription_key: menu.source_meal_distribution_snapshot ? prescriptionKey(menu.source_meal_distribution_snapshot, m.id) : null, revision: 1,
  }));
  return { ...menu, meal_options: options };
}

export function saveOptionBank(menu: DietMenu, distribution: MealDistribution, options: MealOption[]): DietMenu {
  return projectOptions({ ...menu, meal_options: options, status: "editing", confirmed_at: null, updated_at: new Date().toISOString() }, distribution);
}
export function commitOptionEdits(root: DietMenu, projection: DietMenu, distribution: MealDistribution, selection: Record<string, string>, onlyMealId?: string) {
  const options = (root.meal_options ?? []).map(option => {
    if (onlyMealId && option.meal_time_id !== onlyMealId) return option;
    const selected = selection[option.meal_time_id] ?? root.meal_options?.find(o => o.meal_time_id === option.meal_time_id)?.id;
    if (option.id !== selected) return option;
    const entries = activeMenu(projection).meal_menus.find(m => m.meal_time_id === option.meal_time_id)?.entries ?? [];
    return JSON.stringify(entries) === JSON.stringify(option.entries) ? option : {
      ...option, entries: structuredClone(entries), revision: option.revision + 1, status: "draft" as const, confirmed_at: null, confirmation_kind: undefined,
    };
  });
  return saveOptionBank(root, distribution, options);
}
export function newMealOption(menu: DietMenu, mealId: string, name: string, copy?: MealOption): MealOption {
  if ((menu.meal_options ?? []).filter(o => o.meal_time_id === mealId).length >= MAX_MEAL_OPTIONS) throw new Error("Puedes crear hasta siete opciones por tiempo.");
  return { id: crypto.randomUUID(), meal_time_id: mealId, name, entries: copy ? structuredClone(copy.entries).map(e => ({ ...e, id: crypto.randomUUID() })) : [], status: "draft", confirmed_at: null, prescription_key: null, revision: 1 };
}
export function confirmOption(menu: DietMenu, distribution: MealDistribution, id: string, acceptOutsideTolerance = false) {
  const selected = menu.meal_options?.find(option => option.id === id);
  if (!selected) return menu;
  const evaluation = evaluateMealConfirmationStatus(menu, distribution, selected);
  if (!evaluation.canConfirm || (evaluation.requiresExplicitConfirmation && !acceptOutsideTolerance)) return menu;
  return saveOptionBank(menu, distribution, (menu.meal_options ?? []).map(o => {
    if (o.id !== id) return o;
    return { ...o, status: "confirmed" as const, confirmed_at: new Date().toISOString(),
      prescription_key: prescriptionKey(distribution, o.meal_time_id),
      confirmation_kind: evaluation.status === "outside_tolerance" ? "with_deviation" as const
        : evaluation.status === "within_tolerance" ? "within_tolerance" as const : "exact" as const };
  }));
}

/** Undo the selected option only; retain a calendar or other bank edits made meanwhile. */
export function restoreOptionEdits(root: DietMenu, previous: DietMenu, distribution: MealDistribution, selection: Record<string, string>, onlyMealId?: string) {
  const restored = (root.meal_options ?? []).map(option => {
    if (onlyMealId && option.meal_time_id !== onlyMealId) return option;
    const selected = selection[option.meal_time_id] ?? root.meal_options?.find(o => o.meal_time_id === option.meal_time_id)?.id;
    return option.id === selected ? structuredClone(previous.meal_options?.find(o => o.id === option.id) ?? option) : option;
  });
  return saveOptionBank(root, distribution, restored);
}
