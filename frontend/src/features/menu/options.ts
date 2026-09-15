import type { DietMenu, MealDistribution, MealOption } from "@/src/types/domain";
import { activeMenu, calculateMenuStatus, calculateMenuUsage } from "./model";
import { menuRestrictions, recipeFromEntry, recipeHasKnownContributions } from "./mesa";
import { isFoodRestricted } from "./planner";

export const MAX_MEAL_OPTIONS = 7;
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

export function optionCanConfirm(menu: DietMenu, distribution: MealDistribution, option: MealOption) {
  const projected = projectOptions({ ...menu, meal_options: [option] }, distribution);
  const rows = calculateMenuStatus(projected, distribution).rows.filter(r => r.meal_time_id === option.meal_time_id);
  const restrictions = menuRestrictions(menu);
  return distribution.status === "ready" && distribution.meal_times.some(m => m.id === option.meal_time_id)
    && option.name.trim().length > 0 && option.entries.length > 0 && rows.every(r => r.state === "complete")
    && option.entries.every(e => Number.isFinite(e.quantity) && e.quantity > 0
      && e.exchange_contributions.every(c => Number.isFinite(c.portions) && c.portions >= 0)
      && (e.recipe_snapshot ? recipeHasKnownContributions(recipeFromEntry(e)!) : Boolean(e.food_snapshot && e.exchange_contributions.length > 0))
      && (e.food_snapshot ? [e.food_snapshot] : e.recipe_snapshot?.items.map(i => i.food_snapshot) ?? []).every(f => !isFoodRestricted(f, restrictions)));
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
export function commitOptionEdits(root: DietMenu, projection: DietMenu, distribution: MealDistribution, selection: Record<string, string>) {
  const options = (root.meal_options ?? []).map(option => {
    const selected = selection[option.meal_time_id] ?? root.meal_options?.find(o => o.meal_time_id === option.meal_time_id)?.id;
    if (option.id !== selected) return option;
    const entries = activeMenu(projection).meal_menus.find(m => m.meal_time_id === option.meal_time_id)?.entries ?? [];
    return JSON.stringify(entries) === JSON.stringify(option.entries) ? option : {
      ...option, entries: structuredClone(entries), revision: option.revision + 1, status: "draft" as const, confirmed_at: null,
    };
  });
  return saveOptionBank(root, distribution, options);
}
export function newMealOption(menu: DietMenu, mealId: string, name: string, copy?: MealOption): MealOption {
  if ((menu.meal_options ?? []).filter(o => o.meal_time_id === mealId).length >= MAX_MEAL_OPTIONS) throw new Error("Puedes crear hasta siete opciones por tiempo.");
  return { id: crypto.randomUUID(), meal_time_id: mealId, name, entries: copy ? structuredClone(copy.entries).map(e => ({ ...e, id: crypto.randomUUID() })) : [], status: "draft", confirmed_at: null, prescription_key: null, revision: 1 };
}
export function confirmOption(menu: DietMenu, distribution: MealDistribution, id: string) {
  return saveOptionBank(menu, distribution, (menu.meal_options ?? []).map(o => o.id === id && optionCanConfirm(menu, distribution, o)
    ? { ...o, status: "confirmed", confirmed_at: new Date().toISOString(), prescription_key: prescriptionKey(distribution, o.meal_time_id) } : o));
}

/** Undo the selected option only; retain a calendar or other bank edits made meanwhile. */
export function restoreOptionEdits(root: DietMenu, previous: DietMenu, distribution: MealDistribution, selection: Record<string, string>) {
  const restored = (root.meal_options ?? []).map(option => {
    const selected = selection[option.meal_time_id] ?? root.meal_options?.find(o => o.meal_time_id === option.meal_time_id)?.id;
    return option.id === selected ? structuredClone(previous.meal_options?.find(o => o.id === option.id) ?? option) : option;
  });
  return saveOptionBank(root, distribution, restored);
}
