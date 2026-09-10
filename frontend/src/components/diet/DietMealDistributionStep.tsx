import { useEffect, useMemo, useRef, useState } from "react";
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
  suggestMealDistribution,
  updateMealTime,
  type MealDistributionSuggestion,
} from "@/src/features/meal-distribution/model";
import type { ExchangeGroupCode, ExchangePrescription, MealDistribution, MealDistributionEntry, MealTime, NutritionPlan } from "@/src/types/domain";

type Props = {
  plan: NutritionPlan;
  onSave: (distribution: MealDistribution, immediate?: boolean) => Promise<void>;
  onDraftChange: (distribution: MealDistribution) => void;
  onGoToEquivalents: () => void;
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
  return <article className="min-w-[220px] flex-1 rounded-2xl border border-[#dfe6e1] bg-[#fbfcfa] p-3">
    <div className="flex items-center gap-2">
      <input aria-label={`Nombre de ${meal.display_name}`} className="min-w-0 flex-1 border-0 bg-transparent p-1 text-sm font-semibold text-[#24463b] outline-none focus:ring-0" maxLength={40} value={meal.display_name} onChange={(event) => onChange({ display_name: event.target.value })} />
      <button type="button" aria-label={`Mover ${meal.display_name} a la izquierda`} disabled={index === 0} className="grid h-8 w-8 place-items-center rounded-lg text-[#597068] hover:bg-[#eaf1ec] disabled:opacity-25" onClick={() => onMove(-1)}><ChevronLeft size={15} /></button>
      <button type="button" aria-label={`Mover ${meal.display_name} a la derecha`} disabled={index === count - 1} className="grid h-8 w-8 place-items-center rounded-lg text-[#597068] hover:bg-[#eaf1ec] disabled:opacity-25" onClick={() => onMove(1)}><ChevronRight size={15} /></button>
      <button type="button" aria-label={`Eliminar ${meal.display_name}`} disabled={count === 1} className="grid h-8 w-8 place-items-center rounded-lg text-[#8e5a4b] hover:bg-[#faece8] disabled:opacity-25" onClick={onRemove}><Trash2 size={14} /></button>
    </div>
    <label className="mt-2 flex items-center gap-2 text-xs text-[#718078]"><Clock3 size={13} /><span className="sr-only">Hora de {meal.display_name}</span><input aria-label={`Hora de ${meal.display_name}`} type="time" className="min-w-0 border-0 bg-transparent p-0 text-xs text-[#52675e] outline-none" value={meal.time ?? ""} onChange={(event) => onChange({ time: event.target.value || null })} /><span className="ml-auto tabular-nums">{format(assigned)} eq.</span></label>
  </article>;
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

function MealDistributionEditor({ plan, prescription, onSave, onDraftChange }: Omit<Props, "onGoToEquivalents"> & { prescription: ExchangePrescription }) {
  const initial = useMemo(() => plan.meal_distribution ? reconcileMealDistribution(plan.meal_distribution, prescription) : createMealDistribution(), [plan.meal_distribution, prescription]);
  const [draft, setDraft] = useState(initial);
  const [proposal, setProposal] = useState<MealDistributionSuggestion | null>(null);
  const [startFromCurrent, setStartFromCurrent] = useState(false);
  const [showZeros, setShowZeros] = useState(false);
  const [selectedMealId, setSelectedMealId] = useState(initial.meal_times[0]?.id ?? "");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTime, setNewTime] = useState("");
  const [validationMessage, setValidationMessage] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "pending" | "saving" | "error">(plan.meal_distribution && initial === plan.meal_distribution ? "saved" : "pending");
  const planId = useRef(plan.id);

  useEffect(() => {
    if (planId.current !== plan.id) {
      planId.current = plan.id;
      setDraft(initial);
      setProposal(null);
      setSelectedMealId(initial.meal_times[0]?.id ?? "");
      setSaveState(plan.meal_distribution && initial === plan.meal_distribution ? "saved" : "pending");
    }
  }, [initial, plan.id, plan.meal_distribution]);

  const update = (next: MealDistribution) => {
    setDraft(next);
    setProposal(null);
    setValidationMessage("");
    onDraftChange(next);
    setSaveState("pending");
  };

  useEffect(() => {
    if (saveState !== "pending") return;
    const timer = window.setTimeout(() => {
      setSaveState("saving");
      void onSave(draft).then(() => setSaveState("saved")).catch(() => setSaveState("error"));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [draft, onSave, saveState]);

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
    update(next);
    if (selectedMealId === meal.id) setSelectedMealId(next.meal_times[0]?.id ?? "");
  };
  const createTime = () => {
    if (!newName.trim()) return setValidationMessage("Escribe un nombre para el nuevo tiempo.");
    const next = addMealTime(draft, newName, newTime || null);
    update(next);
    setSelectedMealId(next.meal_times.at(-1)?.id ?? selectedMealId);
    setNewName(""); setNewTime(""); setAdding(false);
  };
  const propose = () => setProposal(suggestMealDistribution(draft, prescription, currentHasValues && startFromCurrent));
  const applyProposal = () => { if (proposal) update(applyMealDistributionSuggestion(draft, proposal)); };
  const confirm = async () => {
    if (!currentSummary.canConfirm) return setValidationMessage("Resuelve las porciones pendientes o con exceso antes de confirmar.");
    if (draft.meal_times.some((meal) => !meal.display_name.trim())) return setValidationMessage("Todos los tiempos necesitan un nombre.");
    const next = confirmMealDistribution(draft, prescription);
    setDraft(next); onDraftChange(next); setSaveState("saving");
    try { await onSave(next, true); setSaveState("saved"); }
    catch { setSaveState("error"); }
  };

  return <section className="rounded-[24px] border border-[#dfe6e1] bg-white p-4 sm:p-7">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="nuth-eyebrow">Paso 4</p><h1 className="mt-2 text-2xl font-semibold text-[#173d36]">Tiempos de comida</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#718078]">Distribuye el inventario diario de equivalentes. Aquí todavía no se seleccionan alimentos ni recetas.</p></div>
      <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${draft.status === "ready" ? "bg-[#eaf3ec] text-[#315e4f]" : draft.status === "editing" ? "bg-[#fff4df] text-[#7a5a28]" : "bg-[#f2f5f3] text-[#65756d]"}`}>{draft.status === "ready" ? <Check size={14} /> : <CircleAlert size={14} />}{draft.status === "ready" ? "Distribución lista" : draft.status === "editing" ? "En edición" : "Sin iniciar"}</span>
    </header>

    {prescription.status !== "ready" && <p className="mt-4 rounded-xl bg-[#f7f3e9] px-4 py-3 text-sm text-[#725f35]">El cuadro de equivalentes todavía está en edición.</p>}
    {exchangeInventoryChangedSinceConfirmation(draft, prescription) && <p role="status" className="mt-3 rounded-xl bg-[#fff0e8] px-4 py-3 text-sm text-[#8a513b]">El inventario diario cambió. Conservamos tu distribución; revisa los pendientes o excesos y confirma nuevamente.</p>}

    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-[#24463b]">Estructura del día</h2><p className="mt-1 text-xs text-[#718078]">Edita nombres y horas directamente. El orden se guarda automáticamente.</p></div><button type="button" className="nuth-button-secondary !px-3 !py-2 !text-xs" onClick={() => setAdding((value) => !value)}><Plus size={14} /> Agregar tiempo</button></div>
      {adding && <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-[#cfdcd4] bg-[#f8fbf9] p-3 sm:flex-row sm:items-end">
        <label className="flex-1 text-xs font-semibold text-[#52675e]">Nombre<input autoFocus aria-label="Nombre del nuevo tiempo" className="nuth-input mt-1" maxLength={40} placeholder="Ej. Preentreno" value={newName} onChange={(event) => setNewName(event.target.value)} /></label>
        <label className="text-xs font-semibold text-[#52675e]">Hora opcional<input aria-label="Hora del nuevo tiempo" className="nuth-input mt-1" type="time" value={newTime} onChange={(event) => setNewTime(event.target.value)} /></label>
        <div className="flex gap-2"><button type="button" className="nuth-button-secondary justify-center" onClick={() => { setAdding(false); setNewName(""); setNewTime(""); }}>Cancelar</button><button type="button" className="nuth-button justify-center" onClick={createTime}>Agregar</button></div>
      </div>}
      <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
        {mealTimes.map((meal, index) => <MealTimeEditor key={meal.id} meal={meal} index={index} count={mealTimes.length} assigned={portionsAssignedToMeal(draft, meal.id)} onChange={(values) => update(updateMealTime(draft, meal.id, values))} onMove={(direction) => update(moveMealTime(draft, meal.id, direction))} onRemove={() => removeTime(meal)} />)}
      </div>
    </section>

    <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_290px] xl:items-start">
      <div className="order-2 min-w-0 xl:order-1">
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-semibold text-[#24463b]">Distribución por comida</h2><p className="mt-1 text-xs text-[#718078]">Cada fila conserva el total definido en Equivalentes.</p></div><label className="flex items-center gap-2 text-xs text-[#65756d]"><input type="checkbox" checked={showZeros} onChange={(event) => setShowZeros(event.target.checked)} /> Mostrar grupos sin porciones</label></div>

        <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-[#dfe6e1] lg:block">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead className="bg-[#f5f8f5] text-left text-[11px] font-bold uppercase tracking-wide text-[#597068]"><tr><th className="sticky left-0 z-[1] min-w-[180px] bg-[#f5f8f5] px-4 py-3">Grupo</th>{mealTimes.map((meal) => <th key={meal.id} className="min-w-[96px] px-2 py-3 text-center"><span className="block max-w-[110px] truncate">{meal.display_name}</span>{meal.time && <span className="mt-0.5 block font-normal normal-case tracking-normal text-[#819089]">{meal.time}</span>}</th>)}<th className="min-w-[130px] px-4 py-3 text-right">Distribuido / Disponible</th></tr></thead>
            <tbody>{visibleGroups.map((group) => {
              const values = calculateRemainingExchanges(displayedEntries, prescription, group.groupCode);
              return <tr key={group.groupCode} className="border-t border-[#e8ede9]"><th className="sticky left-0 z-[1] bg-white px-4 py-3 text-left font-semibold text-[#315e4f]">{group.shortName}</th>{mealTimes.map((meal) => <td key={meal.id} className="px-2 py-2.5 text-center"><CompactPortionInput label={`${group.groupName} en ${meal.display_name}`} value={cellValue(displayedEntries, group.groupCode, meal.id)} preview={Boolean(proposal)} onChange={(value) => changeCell(group.groupCode, meal.id, value)} /></td>)}<td className="px-4 py-3"><DistributionState {...values} /></td></tr>;
            })}</tbody>
          </table>
        </div>

        <div className="mt-4 lg:hidden">
          <label className="block text-xs font-semibold text-[#52675e]">Tiempo visible<select aria-label="Tiempo visible" className="nuth-input mt-1" value={selectedMealId} onChange={(event) => setSelectedMealId(event.target.value)}>{mealTimes.map((meal) => <option key={meal.id} value={meal.id}>{meal.display_name}{meal.time ? ` · ${meal.time}` : ""}</option>)}</select></label>
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
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.12em] text-[#477363]">{proposal ? "Vista previa" : "Resumen del día"}</p><p className="mt-1 text-xs text-[#718078]">{proposal ? "La propuesta aún no modifica tu distribución." : `${mealTimes.length} tiempos configurados`}</p></div>{proposal && <span className="rounded-full bg-[#e8f0f8] px-2 py-1 text-[10px] font-semibold text-[#3b627c]">Sin aplicar</span>}</div>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-white p-2"><p className="text-lg font-bold text-[#24463b]">{displayedSummary.complete}</p><p className="text-[10px] text-[#718078]">Completos</p></div><div className="rounded-xl bg-white p-2"><p className="text-lg font-bold text-[#725f35]">{displayedSummary.pending}</p><p className="text-[10px] text-[#718078]">Pendientes</p></div><div className="rounded-xl bg-white p-2"><p className="text-lg font-bold text-[#8a513b]">{displayedSummary.excess}</p><p className="text-[10px] text-[#718078]">Con exceso</p></div></div>
        <dl className="mt-4 space-y-2 border-t border-[#dfe6e1] pt-4 text-sm"><div className="flex justify-between gap-3"><dt className="text-[#718078]">Disponibles</dt><dd className="font-semibold tabular-nums text-[#24463b]">{format(displayedSummary.availablePortions)} eq.</dd></div><div className="flex justify-between gap-3"><dt className="text-[#718078]">Distribuidos</dt><dd className="font-semibold tabular-nums text-[#24463b]">{format(displayedSummary.assignedPortions)} eq.</dd></div><div className="flex justify-between gap-3"><dt className="text-[#718078]">Balance</dt><dd className="font-semibold tabular-nums text-[#24463b]">{format(displayedSummary.remainingPortions)} eq.</dd></div></dl>

        {proposal ? <div className="mt-4 border-t border-[#dfe6e1] pt-4"><button type="button" className="nuth-button w-full justify-center" onClick={applyProposal}>Aplicar propuesta</button><button type="button" className="nuth-button-secondary mt-2 w-full justify-center" onClick={() => setProposal(null)}>Conservar mi distribución</button><button type="button" className="mt-3 w-full text-center text-xs font-semibold text-[#477363]" onClick={propose}>Volver a proponer</button></div> : <div className="mt-4 border-t border-[#dfe6e1] pt-4"><button type="button" className="nuth-button w-full justify-center" onClick={propose}><Calculator size={16} /> Proponer distribución</button>{currentHasValues && <label className="mt-3 flex items-center justify-center gap-2 text-xs text-[#52675e]"><input type="checkbox" checked={startFromCurrent} onChange={(event) => setStartFromCurrent(event.target.checked)} /> Partir de mi distribución actual</label>}<button type="button" disabled={!currentSummary.canConfirm || saveState === "saving"} className="nuth-button-secondary mt-4 w-full justify-center disabled:cursor-not-allowed disabled:opacity-45" onClick={() => void confirm()}><Check size={16} /> {draft.status === "ready" ? "Confirmar nuevamente" : "Confirmar distribución"}</button>{!currentSummary.canConfirm && <p className="mt-2 text-center text-[11px] leading-4 text-[#718078]">Completa los pendientes y corrige los excesos para confirmar.</p>}</div>}
      </aside>
    </div>

    {validationMessage && <p role="alert" className="mt-4 rounded-xl bg-[#fff0e8] px-4 py-3 text-sm text-[#8a513b]">{validationMessage}</p>}
    <div className="mt-4 flex items-center gap-2 text-xs text-[#74817d]">{saveState === "saving" ? <LoaderCircle size={14} className="animate-spin" /> : <ChevronRight size={14} />}{saveState === "saving" ? "Guardando distribución…" : saveState === "pending" ? "Cambios pendientes" : saveState === "error" ? "No se pudo guardar; intenta cambiar un valor nuevamente." : "Guardado automáticamente"}</div>
  </section>;
}

export function DietMealDistributionStep({ plan, onSave, onDraftChange, onGoToEquivalents }: Props) {
  const prescription = plan.exchange_prescription;
  const hasExchanges = prescription?.groups.some((group) => group.portions > EPSILON);
  if (!prescription || !hasExchanges) return <section className="rounded-[24px] border border-[#dfe6e1] bg-white p-5 sm:p-7"><p className="nuth-eyebrow">Paso 4</p><h1 className="mt-2 text-2xl font-semibold text-[#173d36]">Tiempos de comida</h1><div className="mt-5 rounded-2xl bg-[#fff6e6] p-5 text-sm leading-6 text-[#765827]"><p className="font-semibold">Define primero los equivalentes del día.</p><p className="mt-1">Este paso distribuye el inventario existente; no crea porciones nuevas.</p><button type="button" className="nuth-button mt-4" onClick={onGoToEquivalents}>Ir a Equivalentes</button></div></section>;
  return <MealDistributionEditor plan={plan} prescription={prescription} onSave={onSave} onDraftChange={onDraftChange} />;
}
