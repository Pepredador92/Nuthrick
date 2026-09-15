import { useMemo, useState } from "react";
import { Calculator, Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, Clock3, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { exchangeCatalog } from "@/src/features/exchanges/catalog";
import {
  addMealTime,
  applyMealDistributionSuggestion,
  calculateDerivedMealTotals,
  calculateDistributionStatus,
  calculateRemainingExchanges,
  confirmMealDistribution,
  createMealDistribution,
  exchangeInventoryChangedSinceConfirmation,
  moveMealTime,
  portionsAssignedToMeal,
  reconcileMealDistribution,
  removeMealTime,
  setDistributedPortions,
  updateMealTime,
  type MealDistributionSuggestion,
} from "@/src/features/meal-distribution/model";
import type { ExchangeGroupCode, ExchangePrescription, MealDistribution, MealDistributionEntry, MealTime, NutritionPlan } from "@/src/types/domain";
import { WorkshopStepFooter } from "./WorkshopStepFooter";
import { AutosaveFeedback } from "./AutosaveFeedback";
import { useChangeAutosave } from "./useChangeAutosave";
import { mealAlternatives, mealKey, describeMeals, preparationLimitations, type PreparationCatalog } from "@/src/features/diet-workshop/proposals";
import { ProposalNavigation, useProposalExplorer, useProposalSetting } from "./useProposalExplorer";
import { usePreparationCatalog } from "./usePreparationCatalog";

type Props = {
  catalog?: PreparationCatalog;
  plan: NutritionPlan;
  onSave: (distribution: MealDistribution, immediate?: boolean) => Promise<void>;
  onDraftChange: (distribution: MealDistribution) => void;
  onGoToEquivalents: () => void;
  onContinue?: () => void;
};

const EPSILON = 1e-7;
const format = (value: number, maximumFractionDigits = 2) => value.toLocaleString("es-MX", { maximumFractionDigits });
const parsePortions = (value: string) => {
  if (!value.trim()) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
const cellValue = (entries: MealDistributionEntry[], groupCode: ExchangeGroupCode, mealTimeId: string) => entries.find((entry) => entry.group_code === groupCode && entry.meal_time_id === mealTimeId)?.portions ?? 0;

function DistributionState({ assigned, available, remaining }: { assigned: number; available: number; remaining: number }) {
  return <div className="min-w-[7rem] text-right">
    <p className="text-sm font-bold tabular-nums text-[#24463b]">{format(assigned)} / {format(available)}</p>
    <p className={`mt-0.5 text-[11px] font-semibold ${remaining < -EPSILON ? "text-[#a34d3d]" : "text-[#718078]"}`}>
      {remaining < -EPSILON ? `Excede ${format(Math.abs(remaining))}` : remaining > EPSILON ? `Pendiente ${format(remaining)}` : "Distribución completa"}
    </p>
  </div>;
}

function CompactPortionInput({ label, value, preview, onChange }: { label: string; value: number; preview: boolean; onChange: (value: number) => void }) {
  return <input
    aria-label={label}
    className={`h-10 w-[4.6rem] rounded-xl border px-2 text-center text-sm font-semibold tabular-nums outline-none transition focus:border-[#5f8978] focus:ring-2 focus:ring-[#dbe9e1] ${preview ? "border-[#b9d1c4] bg-[#edf5ef] text-[#315e4f]" : "border-[#d8e3dc] bg-white text-[#173d36]"}`}
    inputMode="decimal"
    min="0"
    step="0.5"
    type="number"
    value={value || ""}
    placeholder="—"
    readOnly={preview}
    onChange={(event) => { const parsed = parsePortions(event.target.value); if (parsed !== null) onChange(parsed); }}
  />;
}

function MealTimeEditor({ meal, index, count, assigned, onChange, onMove, onRemove }: {
  meal: MealTime;
  index: number;
  count: number;
  assigned: number;
  onChange: (values: Partial<Pick<MealTime, "display_name" | "time">>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return <article className="min-w-[148px] flex-1 rounded-xl border border-[#dfe6e1] bg-[#fbfcfa] p-2.5">
    <div className="flex items-center gap-2">
      <input aria-label={`Nombre de ${meal.display_name}`} className="min-w-0 flex-1 border-0 bg-transparent p-1 text-sm font-semibold text-[#24463b] outline-none focus:ring-0" maxLength={40} value={meal.display_name} onChange={(event) => onChange({ display_name: event.target.value })} />
      <button type="button" aria-label={`Mover ${meal.display_name} a la izquierda`} disabled={index === 0} className="grid h-8 w-8 place-items-center rounded-lg text-[#597068] hover:bg-[#eaf1ec] disabled:opacity-25" onClick={() => onMove(-1)}><ChevronLeft size={15} /></button>
      <button type="button" aria-label={`Mover ${meal.display_name} a la derecha`} disabled={index === count - 1} className="grid h-8 w-8 place-items-center rounded-lg text-[#597068] hover:bg-[#eaf1ec] disabled:opacity-25" onClick={() => onMove(1)}><ChevronRight size={15} /></button>
      <button type="button" aria-label={`Eliminar ${meal.display_name}`} disabled={count === 1} className="grid h-8 w-8 place-items-center rounded-lg text-[#8e5a4b] hover:bg-[#faece8] disabled:opacity-25" onClick={onRemove}><Trash2 size={14} /></button>
    </div>
    <label className="mt-2 flex items-center gap-2 text-xs text-[#718078]"><Clock3 size={13} /><span className="sr-only">Hora de {meal.display_name}</span><input aria-label={`Hora de ${meal.display_name}`} type="time" className="min-w-0 border-0 bg-transparent p-0 text-xs text-[#52675e] outline-none" value={meal.time ?? ""} onChange={(event) => onChange({ time: event.target.value || null })} /><span className="ml-auto tabular-nums">{format(assigned)} eq.</span></label>
  </article>;
}

function RemainingExchanges({ entries, prescription }: { entries: MealDistributionEntry[]; prescription: ExchangePrescription }) {
  const rows = exchangeCatalog.map((group) => ({ group, values: calculateRemainingExchanges(entries, prescription, group.groupCode) }))
    .filter(({ values }) => Math.abs(values.remaining) > EPSILON);
  if (!rows.length) return <p className="mt-4 rounded-xl bg-[#edf5ef] px-3 py-3 text-sm font-semibold text-[#315e4f]">Distribución completa</p>;
  return <ul className="mt-4 space-y-2 border-t border-[#dfe6e1] pt-4">
    {rows.slice(0, 6).map(({ group, values }) => <li key={group.groupCode} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 truncate text-[#52675e]">{group.shortName}</span><span className={`shrink-0 font-semibold tabular-nums ${values.remaining > 0 ? "text-[#8a642b]" : "text-[#a34d3d]"}`}>{values.remaining > 0 ? `Falta ${format(values.remaining)}` : `Excede ${format(Math.abs(values.remaining))}`}</span></li>)}
    {rows.length > 6 && <li className="pt-1 text-xs text-[#718078]">Y {rows.length - 6} grupos más.</li>}
  </ul>;
}

function MealNutritionSummary({ mealTimes, totals }: { mealTimes: MealTime[]; totals: ReturnType<typeof calculateDerivedMealTotals> }) {
  const byMeal = new Map(totals.map((total) => [total.meal_time_id, total]));
  return <details className="mt-5 rounded-2xl border border-[#dfe6e1] bg-[#fbfcfa] p-4">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-[#315e4f]">Ver resumen por tiempos <ChevronDown size={16} /></summary>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {mealTimes.map((meal) => {
        const total = byMeal.get(meal.id);
        return <article key={meal.id} className="rounded-xl bg-white p-3 text-xs text-[#65756d]">
          <div className="flex items-baseline justify-between gap-3"><p className="font-semibold text-[#24463b]">{meal.display_name}</p><p className="font-bold tabular-nums text-[#315e4f]">{format(total?.energy_kcal ?? 0, 0)} kcal</p></div>
          <p className="mt-2 leading-5">{format(total?.carbohydrate_g ?? 0, 1)} g CHO · {format(total?.protein_g ?? 0, 1)} g proteína · {format(total?.fat_g ?? 0, 1)} g grasas</p>
        </article>;
      })}
    </div>
  </details>;
}

function MealDistributionEditor({ plan, prescription, onSave, onDraftChange, onGoToEquivalents, onContinue, catalog: suppliedCatalog }: Props & { prescription: ExchangePrescription }) {
  const [emptyDistribution] = useProposalSetting(`${plan.id}:initial-times`, createMealDistribution());
  const initial = useMemo(() => plan.meal_distribution ? reconcileMealDistribution(plan.meal_distribution, prescription) : emptyDistribution, [plan.meal_distribution, prescription, emptyDistribution]);
  const [draft, setDraft] = useState(initial);
  const [startFromCurrent, setStartFromCurrent] = useProposalSetting(`${plan.id}:meal-start`, false);
  const [locked, setLocked] = useProposalSetting<string[]>(`${plan.id}:meal-locks`, []);
  const preparation = usePreparationCatalog(suppliedCatalog);
  const explorer = useProposalExplorer<MealDistributionSuggestion, MealDistribution>(`${plan.id}:meal-history`, JSON.stringify({ groups: prescription.groups, targets: prescription.target_snapshot, times: draft.meal_times, locked: draft.distribution.filter(e => locked.includes(e.meal_time_id)), lockedIds: locked, startFromCurrent, catalog: preparation.catalog }), mealKey);
  const proposal = explorer.proposal;
  const setProposal = (value: null) => { if (value === null) explorer.discard(); };
  const [showZeros, setShowZeros] = useState(false);
  const [selectedMealId, setSelectedMealId] = useState(initial.meal_times[0]?.id ?? "");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTime, setNewTime] = useState("");
  const [validationMessage, setValidationMessage] = useState("");
  const autosave = useChangeAutosave({ initialValue: initial, onSave: (value) => onSave(value, true), onDraftChange });
  const saveState = autosave.status;

  const update = (next: MealDistribution, immediate = false, exploring = false) => {
    setDraft(next);
    if (!exploring) explorer.invalidate();
    setValidationMessage("");
    autosave.change(next, { immediate });
  };

  const displayedEntries = proposal?.distribution ?? draft.distribution;
  const displayedTotals = proposal?.derived_meal_totals ?? draft.derived_meal_totals;
  const currentSummary = calculateDistributionStatus(draft.distribution, prescription);
  const displayedSummary = calculateDistributionStatus(displayedEntries, prescription);
  const mealTimes = [...draft.meal_times].sort((a, b) => a.display_order - b.display_order);
  const visibleGroups = exchangeCatalog.filter((group) => {
    const values = calculateRemainingExchanges(draft.distribution, prescription, group.groupCode);
    return showZeros || values.available > EPSILON || values.assigned > EPSILON;
  });
  const currentHasValues = draft.distribution.some((entry) => entry.portions > EPSILON);

  const changeCell = (groupCode: ExchangeGroupCode, mealTimeId: string, portions: number) => update(setDistributedPortions(draft, groupCode, mealTimeId, portions));
  const removeTime = (meal: MealTime) => {
    const assigned = portionsAssignedToMeal(draft, meal.id);
    if (assigned > EPSILON && !window.confirm("Este tiempo tiene equivalentes distribuidos. Si lo eliminas, esas porciones volverán a quedar pendientes.")) return;
    const next = removeMealTime(draft, meal.id);
    update(next, true);
    if (selectedMealId === meal.id) setSelectedMealId(next.meal_times[0]?.id ?? "");
  };
  const createTime = () => {
    if (!newName.trim()) return setValidationMessage("Escribe un nombre para el nuevo tiempo.");
    const next = addMealTime(draft, newName, newTime || null);
    update(next, true);
    setSelectedMealId(next.meal_times.at(-1)?.id ?? selectedMealId);
    setNewName(""); setNewTime(""); setAdding(false);
  };
  const propose = () => explorer.generate(() => mealAlternatives(draft, prescription, locked, currentHasValues && startFromCurrent, preparation.catalog));
  const applyProposal = () => explorer.apply(draft, p => update(applyMealDistributionSuggestion(draft, p), true, true));
  const confirm = async () => {
    if (!currentSummary.canConfirm) return setValidationMessage("Resuelve las porciones pendientes o con exceso antes de confirmar.");
    if (draft.meal_times.some((meal) => !meal.display_name.trim())) return setValidationMessage("Todos los tiempos necesitan un nombre.");
    const next = confirmMealDistribution(draft, prescription);
    setDraft(next);
    await autosave.saveNow(next);
  };

  return <section className="rounded-[24px] border border-[#dfe6e1] bg-white p-4 sm:p-7">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="nuth-eyebrow">Paso 4</p><h1 aria-label="Tiempos de comida" className="mt-2 text-2xl font-semibold text-[#173d36]">Tiempos</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#718078]">Distribuye las porciones entre tus tiempos.</p></div>
      <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${draft.status === "ready" ? "bg-[#eaf3ec] text-[#315e4f]" : draft.status === "editing" ? "bg-[#fff4df] text-[#7a5a28]" : "bg-[#f2f5f3] text-[#65756d]"}`}>{draft.status === "ready" ? <Check size={14} /> : <CircleAlert size={14} />}{draft.status === "ready" ? "Distribución lista" : draft.status === "editing" ? "En edición" : "Sin iniciar"}</span>
    </header>

    {prescription.status !== "ready" && <p className="mt-4 rounded-xl bg-[#f7f3e9] px-4 py-3 text-sm text-[#725f35]">El cuadro de equivalentes todavía está en edición.</p>}
    {exchangeInventoryChangedSinceConfirmation(draft, prescription) && <p role="status" className="mt-3 rounded-xl bg-[#fff0e8] px-4 py-3 text-sm text-[#8a513b]">El inventario diario cambió. Conservamos tu distribución; revisa los pendientes o excesos y confirma nuevamente.</p>}

    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-[#24463b]">Tu día</h2><p className="mt-1 text-xs text-[#718078]">Nombre y hora se editan aquí.</p></div><button type="button" aria-label="Agregar tiempo" className="nuth-button-secondary !px-3 !py-2 !text-xs" onClick={() => setAdding((value) => !value)}><Plus size={14} /> Agregar</button></div>
      {adding && <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-[#cfdcd4] bg-[#f8fbf9] p-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-xs font-semibold text-[#52675e]">Nombre<input autoFocus aria-label="Nombre del nuevo tiempo" className="nuth-input mt-1" maxLength={40} placeholder="Ej. Preentreno" value={newName} onChange={(event) => setNewName(event.target.value)} /></label>
        <label className="text-xs font-semibold text-[#52675e]">Hora opcional<input aria-label="Hora del nuevo tiempo" className="nuth-input mt-1" type="time" value={newTime} onChange={(event) => setNewTime(event.target.value)} /></label>
        <div className="flex gap-2"><button type="button" className="nuth-button-secondary justify-center" onClick={() => { setAdding(false); setNewName(""); setNewTime(""); }}>Cancelar</button><button type="button" className="nuth-button justify-center" onClick={createTime}>Agregar</button></div>
      </div>}
      <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
        {mealTimes.map((meal, index) => <MealTimeEditor key={meal.id} meal={meal} index={index} count={mealTimes.length} assigned={portionsAssignedToMeal(draft, meal.id)} onChange={(values) => update(updateMealTime(draft, meal.id, values))} onMove={(direction) => update(moveMealTime(draft, meal.id, direction))} onRemove={() => removeTime(meal)} />)}
      </div>
      <details className="mt-2 text-xs text-[#52675e]"><summary className="cursor-pointer font-semibold">Conservar tiempos</summary><p className="my-2">Fija todas las cantidades de un tiempo al generar alternativas.</p><div className="flex flex-wrap gap-3">{mealTimes.map(meal => <label key={meal.id} className="flex items-center gap-2"><input type="checkbox" checked={locked.includes(meal.id)} onChange={() => setLocked(locked.includes(meal.id) ? locked.filter(id => id !== meal.id) : [...locked, meal.id])} />{meal.display_name}</label>)}</div></details>
    </section>

    <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_290px] xl:items-start">
      <div className="order-2 min-w-0 xl:order-1">
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-[#24463b]">Distribución del día</h2><p className="mt-1 text-xs text-[#718078]">Asigna porciones, sin cambiar el total disponible.</p></div><label className="flex items-center gap-2 text-xs text-[#65756d]"><input type="checkbox" checked={showZeros} onChange={(event) => setShowZeros(event.target.checked)} /> Mostrar ceros</label></div>

        <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-[#dfe6e1] lg:block">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="bg-[#f5f8f5] text-left text-[11px] font-bold uppercase tracking-wide text-[#597068]"><tr><th className="sticky left-0 z-[1] min-w-[180px] bg-[#f5f8f5] px-4 py-3">Grupo</th>{mealTimes.map((meal, index) => <th key={meal.id} className="min-w-[96px] px-2 py-3 text-center"><span className="block max-w-[110px] truncate">{meal.display_name.replace("Colación", "Col.") || `Tiempo ${index + 1}`}</span>{meal.time && <span className="mt-0.5 block font-normal normal-case tracking-normal text-[#819089]">{meal.time}</span>}</th>)}<th className="min-w-[130px] px-4 py-3 text-right">Distribuido</th></tr></thead>
            <tbody>{visibleGroups.map((group) => {
              const values = calculateRemainingExchanges(displayedEntries, prescription, group.groupCode);
              return <tr key={group.groupCode} className="border-t border-[#e8ede9]"><th className="sticky left-0 z-[1] bg-white px-4 py-3 text-left font-semibold text-[#315e4f]">{group.shortName}</th>{mealTimes.map((meal) => <td key={meal.id} className="px-2 py-2.5 text-center"><CompactPortionInput label={`${group.groupName} en ${meal.display_name}`} value={cellValue(displayedEntries, group.groupCode, meal.id)} preview={Boolean(proposal)} onChange={(value) => changeCell(group.groupCode, meal.id, value)} /></td>)}<td className="px-4 py-3"><DistributionState {...values} /></td></tr>;
            })}</tbody>
          </table>
        </div>

        <div className="mt-4 lg:hidden">
          <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Tiempo visible">{mealTimes.map((meal) => <button key={meal.id} type="button" role="tab" aria-selected={selectedMealId === meal.id} onClick={() => setSelectedMealId(meal.id)} className={`min-w-28 rounded-xl px-3 py-2 text-left text-xs font-semibold ${selectedMealId === meal.id ? "bg-[#173d36] text-white" : "border border-[#dfe6e1] bg-white text-[#52675e]"}`}><span className="block truncate">{meal.display_name}</span><span className={`mt-1 block font-normal ${selectedMealId === meal.id ? "text-white/70" : "text-[#819089]"}`}>{meal.time || "Sin hora"}</span></button>)}</div>
          <div className="mt-3 divide-y divide-[#e8ede9] rounded-2xl border border-[#dfe6e1] px-3">
            {visibleGroups.map((group) => {
              const values = calculateRemainingExchanges(displayedEntries, prescription, group.groupCode);
              const meal = mealTimes.find((item) => item.id === selectedMealId) ?? mealTimes[0];
              return <article key={group.groupCode} className="py-3"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#315e4f]">{group.groupName}</p><div className="mt-1"><DistributionState {...values} /></div></div>{meal && <CompactPortionInput label={`${group.groupName} en ${meal.display_name}`} value={cellValue(displayedEntries, group.groupCode, meal.id)} preview={Boolean(proposal)} onChange={(value) => changeCell(group.groupCode, meal.id, value)} />}</div></article>;
            })}
          </div>
        </div>

        <MealNutritionSummary mealTimes={mealTimes} totals={displayedTotals} />
      </div>

      <aside className="order-1 h-fit rounded-2xl border border-[#d8e3dc] bg-[#f9fbf8] p-4 shadow-[0_12px_35px_rgba(23,61,54,.06)] xl:sticky xl:top-28 xl:order-2">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.12em] text-[#477363]">{proposal ? "Vista previa" : "Pendientes"}</p><p className="mt-1 text-xs text-[#718078]">{proposal ? "La propuesta aún no modifica tu distribución." : `${mealTimes.length} tiempos configurados`}</p></div>{proposal && <span className="rounded-full bg-[#e8f0f8] px-2 py-1 text-[10px] font-semibold text-[#3b627c]">Sin aplicar</span>}</div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-white p-2"><p className="text-lg font-bold text-[#24463b]">{displayedSummary.complete}</p><p className="text-[10px] text-[#718078]">Completos</p></div><div className="rounded-xl bg-white p-2"><p className="text-lg font-bold text-[#725f35]">{displayedSummary.pending}</p><p className="text-[10px] text-[#718078]">Pendientes</p></div><div className="rounded-xl bg-white p-2"><p className="text-lg font-bold text-[#8a513b]">{displayedSummary.excess}</p><p className="text-[10px] text-[#718078]">Con exceso</p></div></div>
        <dl className="mt-4 space-y-2 border-t border-[#dfe6e1] pt-4 text-sm"><div className="flex justify-between gap-3"><dt className="text-[#718078]">Distribuidos</dt><dd className="font-semibold tabular-nums text-[#24463b]">{format(displayedSummary.assignedPortions)} / {format(displayedSummary.availablePortions)} eq.</dd></div></dl>
        {!proposal && <RemainingExchanges entries={displayedEntries} prescription={prescription} />}

        <ProposalNavigation count={explorer.count} index={explorer.index} onNavigate={explorer.navigate} />
        {proposal && <details className="my-3 text-xs text-[#52675e]"><summary className="cursor-pointer font-semibold">Totales y diferencia frente al objetivo</summary><div className="mt-2 space-y-1">{([
          ["Energía", "energy_kcal", "kcal"], ["Carbohidratos", "carbohydrate_g", "g"], ["Proteína", "protein_g", "g"], ["Grasas", "fat_g", "g"],
        ] as const).map(([label, key, unit]) => { const total = displayedTotals.reduce((sum, m) => sum + m[key], 0); const delta = total - prescription.target_snapshot[key]; return <p key={key}>{label}: {format(total)} {unit} · {delta > 0 ? "+" : ""}{format(delta)} {unit}</p>; })}</div></details>}
        {proposal && <p className="my-3 text-xs leading-5 text-[#52675e]">{describeMeals(proposal, draft, locked)}</p>}
        {proposal && <p className="my-2 text-xs leading-5 text-[#8a642b]">{preparationLimitations(prescription.groups.filter(g => g.portions > 0).map(g => g.group_code), preparation.catalog)}</p>}
        {(explorer.message || preparation.error) && <p role="status" className="my-3 text-xs leading-5 text-[#8a642b]">{explorer.message || preparation.error}</p>}
        {explorer.canUndo && <button type="button" className="my-2 text-xs font-semibold text-[#315e4f]" onClick={() => explorer.undo(previous => update(reconcileMealDistribution(previous, prescription), true, true))}>Deshacer aplicación</button>}
        {proposal ? <div className="mt-4 border-t border-[#dfe6e1] pt-4"><button type="button" aria-label="Aplicar propuesta" className="nuth-button w-full justify-center" onClick={applyProposal}>Aplicar</button><button type="button" aria-label="Conservar mi distribución" className="nuth-button-secondary mt-2 w-full justify-center" onClick={() => setProposal(null)}>Descartar</button><button type="button" aria-label="Volver a proponer" className="mt-3 w-full text-center text-xs font-semibold text-[#477363]" onClick={propose}>Otra propuesta</button></div> : <div className="mt-4 border-t border-[#dfe6e1] pt-4"><button type="button" disabled={preparation.loading} aria-label="Proponer distribución" className="nuth-button w-full justify-center" onClick={propose}><Calculator size={16} /> {preparation.loading ? "Preparando…" : explorer.count ? "Otra propuesta" : "Proponer"}</button>{currentHasValues && <details className="mt-3 text-xs text-[#52675e]"><summary className="cursor-pointer text-center font-semibold">Preferencias</summary><label className="mt-2 flex items-center justify-center gap-2"><input type="checkbox" checked={startFromCurrent} onChange={(event) => setStartFromCurrent(event.target.checked)} /> Partir de mi distribución actual</label></details>}<button type="button" aria-label="Confirmar distribución" disabled={!currentSummary.canConfirm || saveState === "saving"} className="nuth-button-secondary mt-4 w-full justify-center disabled:cursor-not-allowed disabled:opacity-45" onClick={() => void confirm()}><Check size={16} /> Confirmar</button>{!currentSummary.canConfirm && <p className="mt-2 text-center text-[11px] leading-4 text-[#718078]">Completa pendientes y excesos para confirmar.</p>}</div>}
      </aside>
    </div>

    {validationMessage && <p role="alert" className="mt-4 rounded-xl bg-[#fff0e8] px-4 py-3 text-sm text-[#8a513b]">{validationMessage}</p>}
    <div className="mt-4 flex min-h-5 items-center gap-2">{saveState === "saving" && <LoaderCircle size={14} className="animate-spin text-[#3d705d]" />}<AutosaveFeedback status={saveState} savingLabel="Guardando distribución…" /></div>
    <WorkshopStepFooter onPrevious={onGoToEquivalents} onNext={onContinue} nextDisabled={!plan.meal_distribution?.distribution.some((entry) => entry.portions > EPSILON)} nextHint={!plan.meal_distribution?.distribution.some((entry) => entry.portions > EPSILON) ? "Distribuye una porción para continuar." : undefined} />
  </section>;
}

export function DietMealDistributionStep({ plan, onSave, onDraftChange, onGoToEquivalents, onContinue, catalog }: Props) {
  const prescription = plan.exchange_prescription;
  const hasExchanges = prescription?.groups.some((group) => group.portions > EPSILON);
  if (!prescription || !hasExchanges) return <section className="rounded-[24px] border border-[#dfe6e1] bg-white p-5 sm:p-7"><p className="nuth-eyebrow">Paso 4</p><h1 className="mt-2 text-2xl font-semibold text-[#173d36]">Tiempos de comida</h1><div className="mt-5 rounded-2xl bg-[#fff6e6] p-5 text-sm leading-6 text-[#765827]"><p className="font-semibold">Define primero los equivalentes del día.</p><p className="mt-1">Este paso distribuye el inventario existente; no crea porciones nuevas.</p><button type="button" className="nuth-button mt-4" onClick={onGoToEquivalents}>Ir a Equivalentes</button></div></section>;
  return <MealDistributionEditor key={plan.id} catalog={catalog} plan={plan} prescription={prescription} onSave={onSave} onDraftChange={onDraftChange} onGoToEquivalents={onGoToEquivalents} onContinue={onContinue} />;
}
