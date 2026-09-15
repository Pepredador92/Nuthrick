import type { DietMenu, MealDistribution, MealOption, MenuDayAssignment, MenuWeekPlan, WeekDayCode } from "@/src/types/domain";
import { optionIsEligible, projectOptions } from "./options";

export const WEEK_DAYS: { id: WeekDayCode; name: string }[] = [
  { id: "mon", name: "Lunes" }, { id: "tue", name: "Martes" }, { id: "wed", name: "Miércoles" },
  { id: "thu", name: "Jueves" }, { id: "fri", name: "Viernes" }, { id: "sat", name: "Sábado" }, { id: "sun", name: "Domingo" },
];
export const dayName = (id: WeekDayCode) => WEEK_DAYS.find(d => d.id === id)!.name;
export const eligibleOptions = (menu: DietMenu, distribution: MealDistribution) => (menu.meal_options ?? []).filter(o => optionIsEligible(menu, distribution, o));
export const automaticDays = (menu: DietMenu, distribution: MealDistribution) => Math.min(7, Math.max(0, ...distribution.meal_times.map(m => eligibleOptions(menu, distribution).filter(o => o.meal_time_id === m.id).length)));
export const weekSignature = (week: MenuWeekPlan) => JSON.stringify(week.days.map(d => [d.day, d.assignments.map(a => [a.meal_time_id, a.option_id, a.option_snapshot.revision, a.fixed])]));
export const usedDays = (menu: DietMenu, id: string) => menu.week_plan?.days.filter(d => d.assignments.some(a => a.option_id === id)).map(d => d.day) ?? [];
export function assignment(option: MealOption, fixed = false): MenuDayAssignment {
  return { meal_time_id: option.meal_time_id, option_id: option.id, option_snapshot: structuredClone(option), fixed };
}
export function dayMenu(menu: DietMenu, distribution: MealDistribution, day: MenuWeekPlan["days"][number]) {
  return projectOptions({ ...menu, meal_options: day.assignments.map(a => a.option_snapshot) }, distribution);
}
export function weekProblems(menu: DietMenu, distribution: MealDistribution, week: MenuWeekPlan): string[] {
  if (!week.days.length || week.days.length > 7 || new Set(week.days.map(d => d.day)).size !== week.days.length) return ["Elige entre uno y siete días distintos."];
  return week.days.flatMap(d => distribution.meal_times.flatMap(m => {
    const required = distribution.distribution.some(r => r.meal_time_id === m.id && r.portions > 0);
    const a = d.assignments.find(a => a.meal_time_id === m.id);
    return required && !a ? [`${dayName(d.day)} · falta ${m.display_name}.`] : a && !optionIsEligible(menu, distribution, a.option_snapshot) ? [`${dayName(d.day)} · revisa ${m.display_name} con la prescripción vigente.`] : [];
  })).concat(week.days.flatMap(d => d.assignments.filter(a => !distribution.meal_times.some(m => m.id === a.meal_time_id)).map(() => `${dayName(d.day)} · hay un tiempo retirado de la prescripción; organiza de nuevo.`)));
}

type ScheduleInput = { menu: DietMenu; distribution: MealDistribution; days: WeekDayCode[]; participants?: Record<string, string[]>; previous?: MenuWeekPlan | null };
function hash(text: string) { let n = 2166136261; for (const c of text) n = Math.imul(n ^ c.charCodeAt(0), 16777619); return n >>> 0; }

/** At most 7! assignments per meal. Quotas are balanced first, then adjacency/pairing are optimized. */
export function organizeWeek({ menu, distribution, days, participants = {}, previous }: ScheduleInput, seed = 0): MenuWeekPlan {
  if (!days.length || days.length > 7 || new Set(days).size !== days.length) throw new Error("Elige entre uno y siete días distintos.");
  if (previous?.days.some(d => !days.includes(d.day) && d.assignments.some(a => a.fixed))) throw new Error("Hay asignaciones fijas en días que retiraste. Incluye esos días o libera primero sus casillas.");
  const orderedDays = WEEK_DAYS.filter(d => days.includes(d.id)).map(d => d.id);
  const week: MenuWeekPlan = { schema_version: 1, days: orderedDays.map(day => ({ day, assignments: [] })) };
  const eligible = eligibleOptions(menu, distribution);
  for (const [mealIndex, meal] of distribution.meal_times.entries()) {
    const all = eligible.filter(o => o.meal_time_id === meal.id);
    const options = all.filter(o => !participants[meal.id] || participants[meal.id].includes(o.id));
    const required = distribution.distribution.some(r => r.meal_time_id === meal.id && r.portions > 0);
    if (required && !options.length) throw new Error(`${meal.display_name}: confirma y selecciona al menos una opción compatible.`);
    if (options.length > days.length) throw new Error(`${meal.display_name}: ${options.length} opciones no caben en ${days.length} días. Amplía los días o elige cuáles participarán.`);
    const fixed = orderedDays.map(day => previous?.days.find(d => d.day === day)?.assignments.find(a => a.meal_time_id === meal.id && a.fixed));
    if (fixed.some(a => a && !optionIsEligible(menu, distribution, a.option_snapshot))) throw new Error(`${meal.display_name}: revisa o libera las asignaciones fijas incompatibles.`);
    if (!options.length && !fixed.some(Boolean)) continue;
    // A fixed applied snapshot is authoritative, including a detached bank option.
    const counts = new Map<string, number>(options.map(o => [o.id, fixed.filter(a => a?.option_id === o.id).length]));
    const free = fixed.filter(a => !a).length;
    if (free && !options.length) throw new Error(`${meal.display_name}: faltan opciones para los espacios libres.`);
    const quotas = new Map<string, number>(options.map(o => [o.id, 0]));
    for (let i = 0; i < free; i++) {
      const sorted = [...options].sort((a, b) => counts.get(a.id)! - counts.get(b.id)! || hash(`${seed}:${mealIndex}:${a.id}`) - hash(`${seed}:${mealIndex}:${b.id}`));
      const id = sorted[0].id; counts.set(id, counts.get(id)! + 1); quotas.set(id, quotas.get(id)! + 1);
    }
    const candidates = new Map(options.map(o => [o.id, assignment(o)]));
    const fixedIds = fixed.filter(a => a !== undefined).map(a => a.option_id);
    if ([...counts.values()].every(n => n <= 1) && new Set(fixedIds).size === fixedIds.length) {
      // With no repeated option every ordering has zero adjacency/pair penalties.
      // Avoid enumerating 7! equivalent scores, especially for large recipe snapshots.
      const available = options.filter(o => quotas.get(o.id)! > 0).sort((a, b) => hash(`${seed}:order:${mealIndex}:${a.id}`) - hash(`${seed}:order:${mealIndex}:${b.id}`));
      orderedDays.forEach((_, i) => week.days[i].assignments.push(structuredClone(fixed[i] ?? candidates.get(available.shift()!.id)!)));
      continue;
    }
    let best: MenuDayAssignment[] | null = null;
    let bestScore = Infinity;
    let bestTie = Infinity;
    const current: MenuDayAssignment[] = [];
    function visit(index: number) {
      if (index === orderedDays.length) {
        const adjacency = current.slice(1).filter((a, i) => a.option_id === current[i].option_id).length;
        let pairs = 0;
        for (let other = 0; other < mealIndex; other++) {
          const seen = new Set<string>();
          current.forEach((a, i) => { const prev = week.days[i].assignments.find(x => x.meal_time_id === distribution.meal_times[other].id); if (!prev) return; const key = `${a.option_id}:${prev.option_id}`; if (seen.has(key)) pairs++; seen.add(key); });
        }
        const score = adjacency * 100 + pairs;
        const tie = hash(`${seed}:${mealIndex}:${current.map(a => a.option_id).join("|")}`);
        if (score < bestScore || score === bestScore && tie < bestTie) { best = [...current]; bestScore = score; bestTie = tie; }
        return;
      }
      if (fixed[index]) { current.push(fixed[index]!); visit(index + 1); current.pop(); return; }
      for (const option of options) {
        const remaining = quotas.get(option.id)!; if (!remaining) continue;
        quotas.set(option.id, remaining - 1); current.push(candidates.get(option.id)!); visit(index + 1); current.pop(); quotas.set(option.id, remaining);
      }
    }
    visit(0);
    if (best) (best as MenuDayAssignment[]).forEach((a, i) => week.days[i].assignments.push(structuredClone(a)));
  }
  return week;
}
export function weekAlternatives(input: ScheduleInput) {
  const seen = new Set<string>(); const results: MenuWeekPlan[] = [];
  for (let seed = 0; seed < 24; seed++) { const week = organizeWeek(input, seed); const signature = weekSignature(week); if (!seen.has(signature)) { seen.add(signature); results.push(week); } }
  return results;
}
