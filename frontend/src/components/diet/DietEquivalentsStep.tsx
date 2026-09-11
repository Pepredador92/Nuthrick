import { useEffect, useMemo, useRef, useState } from "react";
import { Calculator, Check, ChevronDown, CircleAlert, Info, LoaderCircle, Minus, Plus, RotateCcw } from "lucide-react";
import { exchangeCatalog, exchangeCatalogCategories, type ExchangeCatalogGroup } from "@/src/features/exchanges/catalog";
import {
  applyExchangeSuggestion,
  confirmExchangePrescription,
  createExchangePrescription,
  objectivesChangedSinceConfirmation,
  reconcileExchangePrescription,
  resetExchangePrescription,
  setExchangePortions,
  totalExchangePortions,
} from "@/src/features/exchanges/model";
import { suggestExchangePrescription, type ExchangeSuggestion } from "@/src/features/exchanges/suggestion";
import type { ExchangeDerivedTotals, ExchangePrescription, ExchangeTargetSnapshot, NutritionPlan } from "@/src/types/domain";
import { WorkshopStepFooter } from "./WorkshopStepFooter";

type Props = {
  plan: NutritionPlan;
  targets: ExchangeTargetSnapshot | null;
  onSave: (prescription: ExchangePrescription, immediate?: boolean) => Promise<void>;
  onDraftChange: (prescription: ExchangePrescription) => void;
  onGoToMacros: () => void;
  onContinue?: () => void;
};

const number = (value: string) => {
  if (value.trim() === "") return 0;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
};
const format = (value: number, maximumFractionDigits = 1) => value.toLocaleString("es-MX", { maximumFractionDigits });
const signed = (value: number, maximumFractionDigits = 1) => `${value > 0 ? "+" : ""}${format(value, maximumFractionDigits)}`;
const portionsByCode = (prescription: ExchangePrescription) => new Map(prescription.groups.map((group) => [group.group_code, group.portions]));

function Contribution({ group, portions }: { group: ExchangeCatalogGroup; portions: number }) {
  return <details className="group mt-1 text-xs text-[#718078]">
    <summary className="flex w-fit cursor-pointer list-none items-center gap-1 hover:text-[#315e4f]"><Info size={13} /> Ver aporte</summary>
    <div className="mt-2 space-y-1 rounded-lg bg-[#f7faf8] px-3 py-2 leading-5">
      {portions > 0 && <p><span className="font-semibold text-[#52675e]">Aporte actual:</span> {format(portions * group.energyKcal)} kcal · {format(portions * group.carbohydrateG)} g CHO · {format(portions * group.proteinG)} g proteína · {format(portions * group.fatG)} g grasas</p>}
      <p><span className="font-semibold text-[#52675e]">1 equivalente:</span> {group.energyKcal} kcal · {group.carbohydrateG} g CHO · {group.proteinG} g proteína · {group.fatG} g grasas</p>
    </div>
  </details>;
}

function PortionInput({ group, portions, onChange }: { group: ExchangeCatalogGroup; portions: number; onChange: (value: number) => void }) {
  const adjust = (amount: number) => onChange(Math.max(0, portions + amount));
  return <div className="flex shrink-0 items-center justify-end gap-2">
    <button type="button" aria-label={`Restar media porción de ${group.groupName}`} className="grid h-9 w-9 place-items-center rounded-xl border border-[#d8e3dc] text-[#315e4f] transition hover:bg-[#edf5ef]" onClick={() => adjust(-0.5)}><Minus size={15} /></button>
    <label className="sr-only" htmlFor={`exchange-${group.groupCode}`}>Porciones de {group.groupName}</label>
    <input id={`exchange-${group.groupCode}`} aria-label={`Porciones de ${group.groupName}`} className="nuth-input h-11 w-[5.5rem] !px-2 !py-1 text-center text-base font-bold tabular-nums text-[#173d36]" inputMode="decimal" type="number" min="0" step="0.5" value={portions || ""} placeholder="0" onChange={(event) => { const value = number(event.target.value); if (value !== null) onChange(value); }} />
    <button type="button" aria-label={`Sumar media porción de ${group.groupName}`} className="grid h-9 w-9 place-items-center rounded-xl border border-[#d8e3dc] text-[#315e4f] transition hover:bg-[#edf5ef]" onClick={() => adjust(0.5)}><Plus size={15} /></button>
  </div>;
}

function DifferenceMetric({ label, target, actual, difference, unit, precision = 1 }: { label: string; target: number; actual: number; difference: number; unit: string; precision?: number }) {
  const relativeDifference = Math.abs(difference) / Math.max(target, 1);
  const proximity = relativeDifference <= 0.03 ? "Cerca" : difference < 0 ? "Por debajo" : "Por encima";
  const progress = Math.min(100, Math.max(0, (actual / Math.max(target, 1)) * 100));
  return <div className="min-w-0 border-b border-[#e1e8e3] py-3.5 first:pt-0">
    <p className="text-xs font-bold uppercase tracking-[.08em] text-[#597068]">{label}</p>
    <p className="mt-1 text-lg font-semibold tabular-nums text-[#173d36]"><span>{format(actual, precision)}</span><span className="text-sm font-normal text-[#7b8983]"> / {format(target, precision)} {unit}</span></p>
    <p className="mt-1 text-xs font-semibold text-[#52675e]">{proximity} · {signed(difference, precision)} {unit}</p>
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e7ede9]" role="progressbar" aria-label={`Proximidad de ${label} al objetivo`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><div className="h-full rounded-full bg-[#6f9f8d] transition-[width]" style={{ width: `${progress}%` }} /></div>
  </div>;
}

function EquivalentEditor({ plan, targets, onSave, onDraftChange, onGoToMacros, onContinue }: Omit<Props, "targets"> & { targets: ExchangeTargetSnapshot }) {
  const initial = useMemo(() => plan.exchange_prescription ? reconcileExchangePrescription(plan.exchange_prescription, targets) : createExchangePrescription(targets), [plan.exchange_prescription, targets]);
  const [draft, setDraft] = useState(initial);
  const [proposal, setProposal] = useState<ExchangeSuggestion | null>(null);
  const [startFromCurrent, setStartFromCurrent] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "pending" | "saving" | "error">(plan.exchange_prescription && initial === plan.exchange_prescription ? "saved" : "pending");
  const planId = useRef(plan.id);

  useEffect(() => {
    if (planId.current !== plan.id) {
      planId.current = plan.id;
      setDraft(initial);
      setProposal(null);
      setSaveState(plan.exchange_prescription && initial === plan.exchange_prescription ? "saved" : "pending");
    }
  }, [initial, plan.exchange_prescription, plan.id]);

  const update = (next: ExchangePrescription) => {
    setDraft(next);
    setProposal(null);
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

  const byCode = portionsByCode(draft);
  const proposedByCode = proposal ? new Map(proposal.groups.map((group) => [group.groupCode, group.portions])) : null;
  const hasPortions = draft.groups.some((group) => group.portions > 0);
  const change = (code: ExchangeCatalogGroup["groupCode"], value: number) => update(setExchangePortions(draft, targets, code, value));
  const confirm = async () => {
    const next = confirmExchangePrescription(draft, targets);
    setDraft(next);
    onDraftChange(next);
    setSaveState("saving");
    try { await onSave(next, true); setSaveState("saved"); }
    catch { setSaveState("error"); }
  };
  const reset = () => {
    if (hasPortions && !window.confirm("¿Restablecer todos los equivalentes? Esta acción deja las porciones del día en cero.")) return;
    update(resetExchangePrescription(targets));
  };
  const propose = () => setProposal(suggestExchangePrescription({
    targets,
    currentPortions: draft.groups,
    options: { startFromCurrent: hasPortions && startFromCurrent },
  }));
  const applyProposal = () => {
    if (!proposal) return;
    update(applyExchangeSuggestion(draft, targets, proposal));
  };
  const displayedTotals: ExchangeDerivedTotals = proposal?.totals ?? draft.derived_totals;
  const displayedDifferences: ExchangeDerivedTotals = proposal?.differences ?? draft.differences;

  return <section className="rounded-[24px] border border-[#dfe6e1] bg-white p-4 sm:p-7">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="nuth-eyebrow">Paso 3</p><h1 className="mt-2 text-2xl font-semibold text-[#173d36]">Equivalentes</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#718078]">Define las porciones del día.</p></div>
      <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${draft.status === "ready" ? "bg-[#eaf3ec] text-[#315e4f]" : draft.status === "editing" ? "bg-[#fff4df] text-[#7a5a28]" : "bg-[#f2f5f3] text-[#65756d]"}`}>{draft.status === "ready" ? <Check size={14} /> : <CircleAlert size={14} />}{draft.status === "ready" ? "Cuadro listo" : draft.status === "editing" ? "En edición" : "Sin iniciar"}</span>
    </div>
    {objectivesChangedSinceConfirmation(draft) && <p role="status" className="mt-4 rounded-xl bg-[#fff6e6] px-4 py-3 text-sm text-[#765827]">Los objetivos nutricionales cambiaron desde la última confirmación. Las porciones se conservaron; revisa el cuadro y confírmalo de nuevo cuando esté listo.</p>}

    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)] xl:items-start">
      <div className="order-2 min-w-0 xl:order-1">
        {exchangeCatalogCategories.map((category) => <section key={category.category} className="border-t border-[#dfe6e1] first:border-t-0">
          <h2 className="py-3 text-xs font-bold uppercase tracking-[.1em] text-[#477363]">{category.label}</h2>
          {exchangeCatalog.filter((group) => group.category === category.category).map((group) => {
            const portions = byCode.get(group.groupCode) ?? 0;
            const proposed = proposedByCode?.get(group.groupCode);
            const proposalChanged = proposed !== undefined && proposed !== portions;
            return <div key={group.groupCode} className="border-t border-[#edf1ee] py-4 first:border-t-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-[#24463b]">{group.groupName}</p>{proposalChanged && <span className="rounded-full bg-[#edf5ef] px-2 py-1 text-[11px] font-semibold text-[#315e4f]">Propuesta: {format(proposed, 2)}</span>}</div>
                  <Contribution group={group} portions={portions} />
                </div>
                <PortionInput group={group} portions={portions} onChange={(value) => change(group.groupCode, value)} />
              </div>
            </div>;
          })}
        </section>)}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#dfe6e1] pt-4"><p className="text-sm text-[#65756d]">Total: <strong className="text-[#24463b]">{format(totalExchangePortions(draft), 2)} equivalentes</strong></p><button type="button" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#52675e] hover:text-[#24463b]" onClick={reset}><RotateCcw size={14} /> Restablecer</button></div>
      </div>

      <aside className="order-1 h-fit min-w-0 rounded-2xl border border-[#d8e3dc] bg-[#f9fbf8] p-4 shadow-[0_12px_35px_rgba(23,61,54,.06)] sm:p-5 xl:sticky xl:top-28 xl:order-2">
        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.12em] text-[#477363]">{proposal ? "Vista previa de propuesta" : "Cuadro dietosintético"}</p><p className="mt-1 text-xs leading-5 text-[#718078]">{proposal ? "Combinación calculada con incrementos de 0.5 equivalentes." : "Actual frente a objetivo."}</p></div>{proposal && <span className="rounded-full bg-[#e8f0f8] px-2.5 py-1 text-[11px] font-semibold text-[#3b627c]">Sin aplicar</span>}</div>
        <div className="mt-4 grid grid-cols-2 gap-x-5 xl:grid-cols-1">
          <DifferenceMetric label="Energía" target={targets.energy_kcal} actual={displayedTotals.energy_kcal} difference={displayedDifferences.energy_kcal} unit="kcal" precision={0} />
          <DifferenceMetric label="Carbohidratos" target={targets.carbohydrate_g} actual={displayedTotals.carbohydrate_g} difference={displayedDifferences.carbohydrate_g} unit="g" />
          <DifferenceMetric label="Proteína" target={targets.protein_g} actual={displayedTotals.protein_g} difference={displayedDifferences.protein_g} unit="g" />
          <DifferenceMetric label="Grasas" target={targets.fat_g} actual={displayedTotals.fat_g} difference={displayedDifferences.fat_g} unit="g" />
        </div>

        {proposal ? <div className="mt-4 border-t border-[#dfe6e1] pt-4">
          <p className="text-xs leading-5 text-[#65756d]">Esta es la combinación más cercana encontrada. Revísala antes de aplicarla.</p>
          <button type="button" aria-label="Aplicar propuesta" className="nuth-button mt-4 w-full justify-center" onClick={applyProposal}>Aplicar</button>
          <button type="button" aria-label="Conservar mis porciones" className="nuth-button-secondary mt-2 w-full justify-center" onClick={() => setProposal(null)}>Descartar</button>
          <button type="button" aria-label="Volver a proponer porciones" className="mt-3 w-full text-center text-xs font-semibold text-[#477363] hover:text-[#24463b]" onClick={propose}>Recalcular</button>
        </div> : <div className="mt-4 border-t border-[#dfe6e1] pt-4">
          <button type="button" aria-label="Proponer porciones" className="nuth-button w-full justify-center" onClick={propose}><Calculator size={16} /> Proponer</button>
          <p className="mt-2 text-center text-xs leading-5 text-[#718078]">Calcula una combinación cercana a tus objetivos.</p>
          {hasPortions && <details className="mt-3 text-xs text-[#52675e]"><summary className="cursor-pointer text-center font-semibold">Preferencias</summary><label className="mt-2 flex cursor-pointer items-center justify-center gap-2"><input type="checkbox" checked={startFromCurrent} onChange={(event) => setStartFromCurrent(event.target.checked)} /> Partir de mis porciones actuales</label></details>}
          <button type="button" aria-label="Confirmar equivalentes" disabled={saveState === "saving"} className="nuth-button-secondary mt-4 w-full justify-center disabled:opacity-50" onClick={() => void confirm()}><Check size={16} /> Confirmar</button>
        </div>}
      </aside>
    </div>
    <div className="mt-4 flex items-center gap-2 text-xs text-[#74817d]">{saveState === "saving" ? <LoaderCircle size={14} className="animate-spin" /> : <ChevronDown size={14} className="rotate-[-90deg]" />}{saveState === "saving" ? "Guardando cuadro…" : saveState === "pending" ? "Cambios pendientes" : saveState === "error" ? "No se pudo guardar; intenta cambiar un campo nuevamente." : "Guardado automáticamente"}</div>
    <WorkshopStepFooter onPrevious={onGoToMacros} onNext={onContinue} />
  </section>;
}

export function DietEquivalentsStep({ plan, targets, onSave, onDraftChange, onGoToMacros, onContinue }: Props) {
  if (!targets) return <section className="rounded-[24px] border border-[#dfe6e1] bg-white p-5 sm:p-7"><p className="nuth-eyebrow">Paso 3</p><h1 className="mt-2 text-2xl font-semibold text-[#173d36]">Equivalentes</h1><div className="mt-5 rounded-2xl bg-[#fff6e6] p-5 text-sm leading-6 text-[#765827]"><p className="font-semibold">Completa primero la distribución de macronutrientes.</p><p className="mt-1">El cuadro dietosintético compara los equivalentes con el objetivo energético y los gramos derivados en el paso anterior.</p><button type="button" className="nuth-button mt-4" onClick={onGoToMacros}>Ir a macronutrientes</button></div></section>;
  return <EquivalentEditor key={`${plan.id}:${plan.exchange_prescription?.updated_at ?? "new"}:${targets.energy_kcal}:${targets.carbohydrate_g}:${targets.protein_g}:${targets.fat_g}`} plan={plan} targets={targets} onSave={onSave} onDraftChange={onDraftChange} onGoToMacros={onGoToMacros} onContinue={onContinue} />;
}
