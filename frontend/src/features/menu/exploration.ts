import type { DietMenu, DietMenuEntry } from "@/src/types/domain";
import { activeMenu } from "./model";
import { preparationKey } from "./composition";

export type ExplorationIntent = { preservedIds: string[]; rejectedFoodIds: string[]; rejectedPreparations: string[] };
export const emptyIntent = (): ExplorationIntent => ({ preservedIds: [], rejectedFoodIds: [], rejectedPreparations: [] });
const entries = (menu: DietMenu, mealId: string) => activeMenu(menu).meal_menus.find(m => m.meal_time_id === mealId)?.entries ?? [];

/** Called only for explicit edits to a preview; applied-menu edits are independent. */
export function recordPreviewEdit(before: DietMenu, after: DietMenu, mealId: string, intent: ExplorationIntent): ExplorationIntent {
  const nextEntries = entries(after, mealId);
  const rejectedFoodIds = new Set(intent.rejectedFoodIds);
  const rejectedPreparations = new Set(intent.rejectedPreparations);
  for (const entry of entries(before, mealId)) {
    const next = nextEntries.find(e => e.id === entry.id);
    if (!next) {
      if (entry.food_snapshot) rejectedFoodIds.add(entry.food_snapshot.id);
      else if (entry.recipe_snapshot) rejectedPreparations.add(preparationKey(entry.recipe_snapshot));
    } else if (entry.recipe_snapshot && next.recipe_snapshot) {
      for (const item of entry.recipe_snapshot.items) {
        if (!next.recipe_snapshot.items.some(i => i.food_snapshot.id === item.food_snapshot.id)) rejectedFoodIds.add(item.food_snapshot.id);
      }
    }
  }
  return { preservedIds: [...new Set([...intent.preservedIds, ...nextEntries.map(e => e.id)])].filter(id => nextEntries.some(e => e.id === id)), rejectedFoodIds: [...rejectedFoodIds], rejectedPreparations: [...rejectedPreparations] };
}

export function keepIntentEntries(menu: DietMenu, mealId: string, preservedIds: string[]): DietMenu {
  return { ...menu, menus: menu.menus.map(v => v.id !== menu.active_menu_id ? v : { ...v, meal_menus: v.meal_menus.map(m => m.meal_time_id !== mealId ? m : { ...m, entries: m.entries.filter(e => preservedIds.includes(e.id)) }) }) };
}
export function rejectedEntry(entry: DietMenuEntry, intent: ExplorationIntent) {
  return entry.food_snapshot ? intent.rejectedFoodIds.includes(entry.food_snapshot.id) : Boolean(entry.recipe_snapshot && (intent.rejectedPreparations.includes(preparationKey(entry.recipe_snapshot)) || entry.recipe_snapshot.items.some(i => intent.rejectedFoodIds.includes(i.food_snapshot.id))));
}
