import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, Layers3, LockKeyhole } from "lucide-react";
import type { DietMenu, MealDistribution, MealOption, MenuDayAssignment, MenuWeekPlan, WeekDayCode } from "@/src/types/domain";
import { assignment, automaticDays, dayMenu, dayName, eligibleOptions, WEEK_DAYS, weekAlternatives, weekProblems, weekSignature } from "@/src/features/menu/week";
import { optionIsEligible } from "@/src/features/menu/options";
import { activeMenu, calculateMenuUsage } from "@/src/features/menu/model";
import { exchangeNutrition } from "@/src/features/menu/mesa";
import { getExchangeGroup } from "@/src/features/exchanges/catalog";
import { ProposalNavigation, useProposalExplorer } from "./useProposalExplorer";
import { foodUnitLabels, formatFoodQuantity } from "@/src/features/menu/units";

type Props = { planId: string; menu: DietMenu; distribution: MealDistribution; onChange: (menu: DietMenu) => void; onEditMeal: (mealId: string) => void; onVariant: (option: MealOption, day: WeekDayCode) => void; onPendingPreviewChange?: (pending: boolean) => void };
const button = "nuth-button-secondary !px-3 !py-2 !text-xs";
const quantity = formatFoodQuantity;
const unitNames = foodUnitLabels;
function Contents({ option, onClose }: { option: MealOption; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; d?.showModal?.(); return () => d?.close?.(); }, []);
  return <dialog ref={ref} onCancel={onClose} aria-label={`Contenido de ${option.name}`} open={typeof HTMLDialogElement === "undefined" || !HTMLDialogElement.prototype.showModal} className="m-auto max-h-[85dvh] w-[min(600px,calc(100vw-24px))] overflow-auto rounded-3xl border border-[#dce6de] bg-white p-5 text-[#173d36] backdrop:bg-black/30"><div className="flex justify-between gap-4"><h3 className="font-semibold">{option.name}</h3><button className={button} onClick={onClose}>Cerrar</button></div>{option.entries.map(e => <article key={e.id} className="mt-4 border-t pt-3"><h4 className="font-semibold">{e.name_snapshot}</h4><p className="text-sm">{quantity(e.quantity)} {unitNames[e.unit] ?? e.unit}</p>{e.recipe_snapshot?.items.map((i, index) => <p key={index} className="mt-1 text-sm">{quantity(Number(i.amount) * e.quantity / e.recipe_snapshot!.servings)} {unitNames[i.unit] ?? i.unit} · {i.food_snapshot.name}</p>)}{e.recipe_snapshot?.instructions && <p className="mt-2 whitespace-pre-wrap text-sm">{e.recipe_snapshot.instructions}</p>}{e.recipe_snapshot?.substitution_notes && <p className="mt-2 text-sm">{e.recipe_snapshot.substitution_notes}</p>}</article>)}</dialog>;
}

export function MenuWeekPlanner({ planId, menu, distribution, onChange, onEditMeal, onVariant, onPendingPreviewChange }: Props) {
  const [mode, setMode] = useState<"auto" | "custom">("auto");
  const [chosenDays, setChosenDays] = useState<WeekDayCode[]>(menu.week_plan?.days.map(d => d.day) ?? WEEK_DAYS.map(d => d.id));
  const [participants, setParticipants] = useState<Record<string, string[]>>({});
  const [mobileDay, setMobileDay] = useState(0);
  const [detail, setDetail] = useState<MealOption | null>(null);
  const [error, setError] = useState("");
  const options = eligibleOptions(menu, distribution);
  const count = Math.max(1, automaticDays(menu, distribution));
  const days = mode === "auto" ? WEEK_DAYS.slice(0, count).map(d => d.id) : chosenDays;
  const context = JSON.stringify([menu.meal_options, menu.food_preferences, distribution, mode, days, participants]);
  const explorer = useProposalExplorer<MenuWeekPlan, { week: MenuWeekPlan | null }>(`mesa:${planId}:week`, context, weekSignature);
  const previewPending = Boolean(explorer.proposal);
  useEffect(() => { onPendingPreviewChange?.(previewPending); }, [onPendingPreviewChange, previewPending]);
  const displayed = explorer.proposal ?? menu.week_plan;
  const problems = displayed ? weekProblems(menu, distribution, displayed) : [];
  const save = (week: MenuWeekPlan | null) => {
    const ready = week !== null && weekProblems(menu, distribution, week).length === 0;
    onChange({ ...menu, week_plan: week, status: ready ? "ready" : "editing", confirmed_at: ready ? new Date().toISOString() : null, source_meal_distribution_snapshot: ready ? structuredClone(distribution) : menu.source_meal_distribution_snapshot, updated_at: new Date().toISOString() });
  };
  const generate = () => { setError(""); explorer.generate(() => weekAlternatives({ menu, distribution, days, participants: mode === "custom" ? participants : {}, previous: displayed })); };
  const edit = (day: WeekDayCode, mealId: string, value: MenuDayAssignment) => {
    if (!displayed) return;
    const next = { ...displayed, days: displayed.days.map(d => d.day !== day ? d : { ...d, assignments: [...d.assignments.filter(a => a.meal_time_id !== mealId), value].sort((a, b) => distribution.meal_times.findIndex(m => m.id === a.meal_time_id) - distribution.meal_times.findIndex(m => m.id === b.meal_time_id)) }) };
    // Manual changes start a preview too. Reset old alternatives because their locks differ.
    explorer.restart(next);
  };
  const cell = (day: WeekDayCode, mealId: string, a?: MenuDayAssignment) => {
    const mealOptions = options.filter(o => o.meal_time_id === mealId);
    const bank = menu.meal_options?.find(o => o.id === a?.option_id);
    const changed = a && bank && JSON.stringify(bank) !== JSON.stringify(a.option_snapshot);
    return <div className="min-w-0 space-y-2 p-3">
      <select className="nuth-input !py-2 !text-xs" aria-label={`Opción de ${distribution.meal_times.find(m => m.id === mealId)?.display_name} para ${dayName(day)}`} value={a?.option_id ?? ""} onChange={e => { const o = mealOptions.find(o => o.id === e.target.value); if (o) edit(day, mealId, assignment(o, a?.fixed)); }}>
        <option value="" disabled>Sin asignación</option>{a && !mealOptions.some(o => o.id === a.option_id) && <option value={a.option_id}>{a.option_snapshot.name} · conservada</option>}{mealOptions.map(o => <option value={o.id} key={o.id}>{o.name}</option>)}
      </select>
      {a && <><button className="block w-full text-left text-xs leading-5 text-[#637a6a] hover:underline" onClick={() => setDetail(a.option_snapshot)} aria-label={`Ver ${a.option_snapshot.name} del ${dayName(day)}`}>{a.option_snapshot.entries.map(e => e.name_snapshot).join(" · ")}<span className="mt-1 block font-semibold text-[#315f49]">Ver cantidades y preparación</span></button>
        {!optionIsEligible(menu, distribution, a.option_snapshot) && <p className="text-xs text-amber-800">Revisar prescripción</p>}
        {!bank && <p className="text-xs text-amber-800">Desvinculada del banco · contenido conservado</p>}
        {changed && <div className="text-xs text-amber-800"><p>Versión aplicada conservada</p>{optionIsEligible(menu, distribution, bank) && <button className="mt-1 underline" onClick={() => edit(day, mealId, assignment(bank, a.fixed))}>Actualizar este día desde el banco</button>}</div>}
        <div className="flex flex-wrap items-center justify-between gap-2"><label className="flex items-center gap-1 text-xs"><input type="checkbox" aria-label={`Fijar ${dayName(day)} ${distribution.meal_times.find(m => m.id === mealId)?.display_name}`} checked={a.fixed} onChange={e => edit(day, mealId, { ...a, fixed: e.target.checked })}/><LockKeyhole size={12}/>Fijar</label><button className="text-xs underline" disabled={Boolean(explorer.proposal)} title={explorer.proposal ? "Aplica o descarta antes de crear una variante" : undefined} onClick={() => onVariant(a.option_snapshot, day)}>Variante para este día</button></div>
      </>}
    </div>;
  };
  const times = distribution.meal_times.filter(m => distribution.distribution.some(r => r.meal_time_id === m.id && r.portions > 0) || options.some(o => o.meal_time_id === m.id) || displayed?.days.some(d => d.assignments.some(a => a.meal_time_id === m.id)));
  const visibleIndex = Math.min(mobileDay, (displayed?.days.length ?? 1) - 1);
  const visibleDay = displayed?.days[visibleIndex];
  const changedOptions = options.filter(o => displayed?.days.some(d => d.assignments.some(a => a.option_id === o.id && JSON.stringify(a.option_snapshot) !== JSON.stringify(o))));
  return <section aria-label="Plan por días" className="menu-week-layout">
    <div className="menu-week-grid">
      <section className="menu-card menu-week-setup" aria-labelledby="menu-week-days-heading">
        <div className="menu-card-title"><span className="menu-card-icon menu-card-icon-week"><CalendarDays size={18}/></span><div><p className="menu-card-step">01 · DEFINE</p><h2 id="menu-week-days-heading">¿Cuántos días tendrá el plan?</h2><p>Elige una duración sugerida o marca los días exactos.</p></div></div>
        <div className="menu-week-mode" role="group" aria-label="Modo de organización"><label><input type="radio" name={`week-mode-${planId}`} aria-label="Automático" checked={mode === "auto"} onChange={() => setMode("auto")}/><span><strong>Automático</strong><small>Usar los días necesarios para las opciones</small></span></label><label><input type="radio" name={`week-mode-${planId}`} aria-label="Elegir días" checked={mode === "custom"} onChange={() => setMode("custom")}/><span><strong>Elegir días</strong><small>Decidir cuáles incluir</small></span></label></div>
        {mode === "custom" && <><div className="menu-week-days">{WEEK_DAYS.map(d => <label key={d.id}><input type="checkbox" checked={chosenDays.includes(d.id)} onChange={() => setChosenDays(WEEK_DAYS.filter(x => x.id === d.id ? !chosenDays.includes(x.id) : chosenDays.includes(x.id)).map(x => x.id))}/>{d.name}</label>)}</div><label className="menu-week-duration">Duración<select aria-label="Duración del plan" className="nuth-input !w-auto !py-2" value={chosenDays.length} onChange={e => setChosenDays(WEEK_DAYS.slice(0, Number(e.target.value)).map(d => d.id))}><option value={0} disabled>Elige días</option>{WEEK_DAYS.map((_, i) => <option key={i} value={i + 1}>{i + 1} días</option>)}</select></label></>}
        <p className="menu-week-summary">Se organizarán <strong>{days.length} días</strong> a partir de tus opciones.</p>
      </section>
      <section className="menu-card menu-week-options" aria-labelledby="menu-week-options-heading">
        <div className="menu-card-title"><span className="menu-card-icon menu-card-icon-option"><Layers3 size={18}/></span><div><p className="menu-card-step">02 · COMPRUEBA</p><h2 id="menu-week-options-heading">Opciones disponibles</h2><p>Revisa qué tiempos tienen alternativas listas para distribuir.</p></div></div>
        <div className="menu-week-time-list">{times.map(m => { const n = options.filter(o => o.meal_time_id === m.id).length; return <button type="button" onClick={() => onEditMeal(m.id)} key={m.id}><span><strong>{m.display_name}</strong><small>{n === 0 ? "Completar opción" : n === 1 && days.length > 1 ? "Se repetirá; puedes agregar otra" : "Listo para distribuir"}</small></span><span className="menu-week-count">{n} {n===1?"confirmada":"confirmadas"}</span></button>; })}</div>
        {mode === "custom" && <details className="menu-week-participants"><summary>Elegir opciones participantes</summary>{distribution.meal_times.map(m => <fieldset key={m.id} className="mt-3"><legend className="text-sm font-semibold">{m.display_name}</legend>{(menu.meal_options ?? []).filter(o => o.meal_time_id === m.id).map(o => <label key={o.id} className="my-2 flex items-center gap-2 text-xs"><input type="checkbox" disabled={!options.some(x => x.id === o.id)} checked={options.some(x => x.id === o.id) && (participants[m.id] ?? options.filter(x => x.meal_time_id === m.id).map(x => x.id)).includes(o.id)} onChange={e => { const ids = participants[m.id] ?? options.filter(x => x.meal_time_id === m.id).map(x => x.id); setParticipants({ ...participants, [m.id]: e.target.checked ? [...ids, o.id] : ids.filter(id => id !== o.id) }); }}/>{o.name}{!options.some(x => x.id === o.id) && " · pendiente de confirmar o revisar"}</label>)}</fieldset>)}</details>}
        {mode === "custom" && times.some(m => (participants[m.id] ?? options.filter(o => o.meal_time_id === m.id).map(o => o.id)).length > days.length) && <p role="alert" className="mt-3 text-sm text-amber-800">No caben todas las opciones: amplía los días o elige cuáles participarán. Ninguna se elimina del banco.</p>}
      </section>
    </div>
    <section className="menu-card menu-week-calendar" aria-labelledby="menu-week-calendar-heading">
      <div className="menu-card-title"><span className="menu-card-icon menu-card-icon-review"><ClipboardCheck size={18}/></span><div><p className="menu-card-step">03 · ORGANIZA</p><h2 id="menu-week-calendar-heading">Calendario del paciente</h2><p>Organiza los días, revisa el resultado y aplica el calendario. Después continúa a Revisión.</p></div></div>
      <div className="menu-week-calendar-actions"><button className="nuth-button" onClick={generate}>{explorer.proposal ? "Volver a organizar" : "Organizar días"}</button>{!explorer.proposal && explorer.count > 0 && <button className={button} onClick={() => explorer.navigate(0)}>Recuperar organización</button>}{!explorer.proposal && explorer.canUndo && <button className={button} onClick={() => explorer.undo(previous => save(previous.week))}>Deshacer calendario</button>}</div>
    {explorer.message && <p role="status" className="my-3 text-sm text-amber-800">{explorer.message.startsWith("No encontramos") ? "No hay otra organización distinta entre las alternativas disponibles; se conserva la actual." : explorer.message}</p>}
    {error && <p role="alert" className="my-3 text-sm text-red-800">{error}</p>}
    {changedOptions.length > 0 && <details className="my-4 rounded-xl bg-amber-50 p-3"><summary className="cursor-pointer text-sm font-semibold">Opciones con una versión nueva en el banco</summary><p className="my-2 text-xs">El calendario conserva su contenido anterior. Revisa las actualizaciones antes de aplicar.</p>{changedOptions.map(o => <button key={o.id} className={`${button} mb-2 block`} onClick={() => explorer.restart({ ...displayed!, days: displayed!.days.map(d => ({ ...d, assignments: d.assignments.map(a => a.option_id === o.id ? assignment(o, a.fixed) : a) })) })}>Actualizar apariciones de {o.name} ({displayed!.days.filter(d => d.assignments.some(a => a.option_id === o.id)).map(d => dayName(d.day)).join(", ")})</button>)}</details>}
    {explorer.proposal && <div className="menu-week-preview" role="status"><p className="text-sm font-semibold">Vista previa · calendario sin guardar</p><p className="mt-1 text-xs">Revisa el calendario y aplícalo antes de continuar. Las casillas fijas se respetan al volver a organizar.</p><ProposalNavigation count={explorer.count} index={explorer.index} onNavigate={explorer.navigate}/><div className="flex flex-wrap gap-2"><button className="nuth-button" disabled={problems.length > 0} onClick={() => { const issues = weekProblems(menu, distribution, explorer.proposal!); if (issues.length) { setError(issues.join(" ")); return; } explorer.apply({ week: menu.week_plan ?? null }, save); }}>Aplicar calendario</button><button className={button} onClick={explorer.discard}>Descartar calendario</button></div></div>}
    {problems.length > 0 && <div role="alert" className="my-3 rounded-xl bg-amber-50 p-3 text-xs">{problems.map(p => <p key={p}>{p}</p>)}</div>}
    {!displayed && <div className="menu-week-empty"><CalendarDays size={24}/><div><strong>Aún no hay un calendario.</strong><p>Usa “Organizar días” para ver una propuesta, o continúa a Revisión si todavía vas a completar el menú.</p></div></div>}
    {displayed && <><p className="menu-week-calendar-status">{explorer.proposal ? "Organización en revisión" : "Calendario aplicado"} · {displayed.days.length} días</p><div className="menu-week-table hidden max-w-full overflow-x-auto rounded-xl border border-[#dce6de] md:block"><table className="w-full table-fixed text-left" style={{ minWidth: Math.max(600, 110 + times.length * 220) }}><thead className="bg-[#f1f5ec]"><tr><th className="w-28 p-3 text-xs">Día</th>{times.map(m => <th className="p-3 text-sm" key={m.id}>{m.display_name}</th>)}</tr></thead><tbody>{displayed.days.map(d => <tr className="border-t border-[#e2e9e2] align-top" key={d.day}><th className="bg-[#fafbf7] p-3 text-sm">{dayName(d.day)}</th>{times.map(m => <td className="border-l border-[#e2e9e2]" key={m.id}>{cell(d.day, m.id, d.assignments.find(a => a.meal_time_id === m.id))}</td>)}</tr>)}</tbody></table></div>
      {visibleDay && <div className="md:hidden"><div className="my-3 flex items-center justify-between"><button className={button} aria-label="Día anterior" disabled={visibleIndex === 0} onClick={() => setMobileDay(Math.max(0, visibleIndex - 1))}><ChevronLeft size={18}/></button><select aria-label="Día del calendario" className="nuth-input !w-auto" value={visibleDay.day} onChange={e => setMobileDay(displayed.days.findIndex(d => d.day === e.target.value))}>{displayed.days.map(d => <option key={d.day} value={d.day}>{dayName(d.day)}</option>)}</select><button className={button} aria-label="Día siguiente" disabled={visibleIndex >= displayed.days.length - 1} onClick={() => setMobileDay(Math.min(displayed.days.length - 1, visibleIndex + 1))}><ChevronRight size={18}/></button></div>{times.map(m => <article key={m.id} className="mb-3 rounded-xl border"><h3 className="px-3 pt-3 font-semibold">{m.display_name}</h3>{cell(visibleDay.day, m.id, visibleDay.assignments.find(a => a.meal_time_id === m.id))}</article>)}</div>}
      <details className="menu-week-totals"><summary>Totales por día</summary>{displayed.days.map(d => {
        const projected = dayMenu(menu, distribution, d);
        const nutrition = activeMenu(projected).meal_menus.flatMap(m => m.entries).map(exchangeNutrition).reduce((sum, n) => ({ kcal: sum.kcal+n.kcal, cho: sum.cho+n.cho, protein: sum.protein+n.protein, fat: sum.fat+n.fat }), { kcal:0, cho:0, protein:0, fat:0 });
        return <div key={d.day} className="mt-3 rounded-xl bg-[#f5f8f2] p-3"><strong>{dayName(d.day)}</strong><p className="mt-1">{quantity(nutrition.kcal)} kcal · CHO {quantity(nutrition.cho)} g · proteína {quantity(nutrition.protein)} g · grasa {quantity(nutrition.fat)} g</p><p className="mt-1">{Object.entries(calculateMenuUsage(projected).reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.group_code]: (acc[r.group_code] ?? 0) + r.portions }), {})).map(([code, n]) => `${getExchangeGroup(code as Parameters<typeof getExchangeGroup>[0]).shortName} ${quantity(n)} eq`).join(" · ")}</p></div>;
      })}<p className="mt-2">Aportes estimados por equivalentes. Cada día se compara con su distribución diaria; las alternativas del banco no se suman.</p></details>
    </>}
    </section>
    {detail && <Contents option={detail} onClose={() => setDetail(null)}/>}
  </section>;
}
