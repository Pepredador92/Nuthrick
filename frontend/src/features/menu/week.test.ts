import { describe, expect, it } from "vitest";
import { weeklyFixture } from "../../../tests/fixtures/weeklyMenu";
import { automaticDays, dayMenu, organizeWeek, weekAlternatives, weekProblems, WEEK_DAYS } from "./week";
import { commitOptionEdits, confirmOption, ensureOptionBank, newMealOption, optionIsEligible, projectOptions, restoreOptionEdits, saveOptionBank } from "./options";
import { activeMenu, calculateMenuUsage, confirmDietMenu, updateMenuEntryQuantity } from "./model";
const days = WEEK_DAYS.map(d => d.id);

describe("meal options and weekly scheduling", () => {
  it("counts complete options, not their foods and drinks", () => {
    const one = weeklyFixture([1, 1, 1]); expect(automaticDays(one.menu, one.distribution)).toBe(1);
    const f = weeklyFixture(); expect(automaticDays(f.menu, f.distribution)).toBe(5);
    expect(f.menu.meal_options!.every(o => o.entries.length === 2)).toBe(true);
  });
  it("uses all options in 3/5/1, balances frequencies and avoids consecutive repetition", () => {
    const f = weeklyFixture(); const week = organizeWeek({ ...f, days: days.slice(0, 5) });
    for (const meal of f.distribution.meal_times) {
      const ids = week.days.map(d => d.assignments.find(a => a.meal_time_id === meal.id)!.option_id);
      const options = f.menu.meal_options!.filter(o => o.meal_time_id === meal.id);
      const counts = options.map(o => ids.filter(id => id === o.id).length);
      expect(counts.every(c => c > 0)).toBe(true); expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
      if (options.length > 1) expect(ids.slice(1).every((id, i) => id !== ids[i])).toBe(true);
    }
    expect(weekProblems(f.menu, f.distribution, week)).toEqual([]);
  });
  it("balances two options across seven selected days and varies pairings", () => {
    const f = weeklyFixture([2, 2, 2]); const week = organizeWeek({ ...f, days });
    for (const meal of f.distribution.meal_times) { const a = week.days.filter(d => d.assignments.find(a => a.meal_time_id === meal.id)?.option_id === `${meal.id}-0`).length; expect([3, 4]).toContain(a); }
    const pairs = new Set(week.days.map(d => d.assignments.slice(0, 2).map(a => a.option_id).join("|")));
    // With two options and no consecutive repetitions only two alternating pairs are possible.
    expect(pairs.size).toBe(2);
    expect(weekAlternatives({ ...f, days }).length).toBeGreaterThan(1);
  });
  it("never sums alternatives or duplicates drinks; computes each day independently", () => {
    const f = weeklyFixture(); const week = organizeWeek({ ...f, days: days.slice(0, 5) });
    expect(calculateMenuUsage(projectOptions(f.menu, f.distribution)).map(r => r.portions)).toEqual([1, 1, 1]);
    for (const day of week.days) {
      const projected = dayMenu(f.menu, f.distribution, day);
      expect(calculateMenuUsage(projected).map(r => r.portions)).toEqual([1, 1, 1]);
      expect(activeMenu(projected).meal_menus.every(m => m.entries.filter(e => e.recipe_snapshot?.tags?.includes("nuthrick:verified-water")).length === 1)).toBe(true);
    }
  });
  it("rejects insufficient days unless an explicit participant subset is supplied", () => {
    const f = weeklyFixture(); expect(() => organizeWeek({ ...f, days: days.slice(0, 3) })).toThrow(/no caben/);
    const week = organizeWeek({ ...f, days: days.slice(0, 3), participants: { lunch: ["lunch-1", "lunch-3"] } });
    expect(new Set(week.days.map(d => d.assignments[1].option_id))).toEqual(new Set(["lunch-1", "lunch-3"]));
    expect(f.menu.meal_options).toHaveLength(9);
  });
  it("excludes drafts and blocks required meals without a confirmed option", () => {
    const f = weeklyFixture(); f.menu.meal_options!.find(o => o.meal_time_id === "dinner")!.status = "draft";
    expect(() => organizeWeek({ ...f, days })).toThrow(/Cena.*confirma/);
  });
  it("honors fixed snapshots even when detached from the bank", () => {
    const f = weeklyFixture(); const week = organizeWeek({ ...f, days: days.slice(0, 5) });
    week.days[2].assignments[0].fixed = true;
    const fixed = structuredClone(week.days[2].assignments[0]);
    f.menu.meal_options = f.menu.meal_options!.filter(o => o.id !== fixed.option_id);
    for (const next of weekAlternatives({ ...f, days: days.slice(0, 5), previous: week })) expect(next.days[2].assignments[0]).toEqual(fixed);
  });
  it("retains applied snapshots when editing/deleting options and flags changed prescriptions", () => {
    const f = weeklyFixture(); const week = organizeWeek({ ...f, days: days.slice(0, 5) });
    f.menu.week_plan = week; const before = JSON.stringify(week);
    const option = f.menu.meal_options![0]; const selection = { breakfast: option.id };
    const changed = updateMenuEntryQuantity(projectOptions(f.menu, f.distribution, selection), f.distribution, option.entries[0].id, 2);
    const next = commitOptionEdits(f.menu, changed, f.distribution, selection);
    expect(next.meal_options![0].status).toBe("draft"); expect(JSON.stringify(next.week_plan)).toBe(before);
    expect(next.meal_options![1]).toEqual(f.menu.meal_options![1]);
    const removed = saveOptionBank(next, f.distribution, next.meal_options!.filter(o => o.id !== option.id));
    expect(JSON.stringify(removed.week_plan)).toBe(before); expect(weekProblems(removed, f.distribution, week)).toEqual([]);
    const distribution = structuredClone(f.distribution); distribution.distribution[0].portions = 2;
    expect(weekProblems(removed, distribution, week).length).toBe(5);
    expect(optionIsEligible(f.menu, distribution, f.menu.meal_options!.find(o => o.meal_time_id === "lunch")!)).toBe(true);
  });
  it("keeps confirmations independent, copies deeply and enforces seven options", () => {
    const f = weeklyFixture([1, 1, 1]); const original = structuredClone(f.menu.meal_options![0]);
    const copy = newMealOption(f.menu, "breakfast", "Copia", original);
    expect(copy.entries).not.toBe(original.entries); expect(copy.entries[0].id).not.toBe(original.entries[0].id); expect(copy.status).toBe("draft");
    const bank = saveOptionBank(f.menu, f.distribution, [...f.menu.meal_options!, copy]);
    const confirmed = confirmOption(bank, f.distribution, copy.id);
    expect(confirmed.meal_options![0]).toEqual(original); expect(confirmed.meal_options!.find(o => o.id === copy.id)?.status).toBe("confirmed");
    const full = weeklyFixture([7, 1, 1]); expect(() => newMealOption(full.menu, "breakfast", "Octava")).toThrow(/siete/);
  });
  it("adapts old whole-day variants lazily without duplicating or losing their review", () => {
    const f = weeklyFixture([1, 1, 1]); const projected = projectOptions(f.menu, f.distribution);
    delete projected.meal_options;
    const legacy = confirmDietMenu(projected, f.distribution); legacy.menus.push({ ...structuredClone(legacy.menus[0]), id: "another-day" });
    const before = JSON.stringify(legacy); const adapted = ensureOptionBank(legacy, f.distribution);
    expect(adapted.meal_options).toHaveLength(3); expect(adapted.menus).toEqual(legacy.menus); expect(JSON.stringify(legacy)).toBe(before);
    expect(adapted.meal_options!.every(o => optionIsEligible(adapted, f.distribution, o))).toBe(true);
    expect(ensureOptionBank(adapted, f.distribution)).toBe(adapted);
  });
  it("reports a unique schedule when every meal has just one option", () => {
    const f = weeklyFixture([1, 1, 1]); expect(weekAlternatives({ ...f, days })).toHaveLength(1);
  });
  it("restores the prior confirmation when undoing a food proposal", () => {
    const f = weeklyFixture([1, 1, 1]); const selection = { breakfast: f.menu.meal_options![0].id };
    const before = projectOptions(f.menu, f.distribution, selection);
    const changed = updateMenuEntryQuantity(before, f.distribution, f.menu.meal_options![0].entries[0].id, 2);
    const root = commitOptionEdits(f.menu, changed, f.distribution, selection);
    root.week_plan = organizeWeek({ ...f, days: ["mon"] });
    const restored = restoreOptionEdits(root, before, f.distribution, selection);
    expect(restored.meal_options).toEqual(f.menu.meal_options); expect(restored.week_plan).toEqual(root.week_plan);
  });
  it("keeps fixed days from being silently removed and rejects changed exclusions", () => {
    const f = weeklyFixture([1, 1, 1]); const previous = organizeWeek({ ...f, days: ["mon", "tue"] });
    previous.days[1].assignments[0].fixed = true;
    expect(() => organizeWeek({ ...f, days: ["mon"], previous })).toThrow(/asignaciones fijas/);
    f.menu.food_preferences = { [f.foods[0].id]: "exclude" };
    expect(weekProblems(f.menu, f.distribution, previous)).toHaveLength(2);
  });
  it("handles the seven-option limit without enumerating equivalent permutations", () => {
    const f = weeklyFixture([7, 7, 7]);
    const choices = weekAlternatives({ ...f, days });
    expect(choices.length).toBeGreaterThan(1);
    for (const week of choices) for (const meal of f.distribution.meal_times) expect(new Set(week.days.map(d => d.assignments.find(a => a.meal_time_id === meal.id)!.option_id)).size).toBe(7);
  });
});
