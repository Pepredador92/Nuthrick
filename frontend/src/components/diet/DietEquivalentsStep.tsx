import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, CircleAlert, Info, LoaderCircle, Minus, Plus, RotateCcw } from "lucide-react";
import { exchangeCatalog, exchangeCatalogCategories, type ExchangeCatalogGroup } from "@/src/features/exchanges/catalog";
import {
  confirmExchangePrescription,
  createExchangePrescription,
  objectivesChangedSinceConfirmation,
  reconcileExchangePrescription,
  resetExchangePrescription,
  setExchangePortions,
  totalExchangePortions,
} from "@/src/features/exchanges/model";
import type { ExchangePrescription, ExchangeTargetSnapshot, NutritionPlan } from "@/src/types/domain";

type Props = {
  plan: NutritionPlan;
  targets: ExchangeTargetSnapshot | null;
  onSave: (prescription: ExchangePrescription, immediate?: boolean) => Promise<void>;
  onDraftChange: (prescription: ExchangePrescription) => void;
  onGoToMacros: () => void;
};

const number = (value: string) => {
  if (value.trim() === "") return 0;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
};
const format = (value: number, maximumFractionDigits = 1) => value.toLocaleString("es-MX", { maximumFractionDigits });
const signed = (value: number, maximumFractionDigits = 1) => `${value > 0 ? "+" : ""}${format(value, maximumFractionDigits)}`;
const portionsByCode = (prescription: ExchangePrescription) => new Map(prescription.groups.map((group) => [group.group_code, group.portions]));

function Contribution({ group }: { group: ExchangeCatalogGroup }) {
  return <span className="inline-flex items-center gap-1 text-[11px] text-[#718078]" title={`1 equivalente: ${group.energyKcal} kcal · ${group.carbohydrateG} g CHO · ${group.proteinG} g proteína · ${group.fatG} g grasas`}><Info size={13} /> 1 eq: {group.energyKcal} kcal · {group.carbohydrateG} CHO · {group.proteinG} Prot · {group.fatG} Grasas</span>;
}

function PortionInput({ group, portions, onChange }: { group: ExchangeCatalogGroup; portions: number; onChange: (value: number) => void }) {
  const adjust = (amount: number) => onChange(Math.max(0, portions + amount));
  return <div className="flex items-center justify-end gap-1.5">
    <button type="button" aria-label={`Restar media porción de ${group.groupName}`} className="grid h-8 w-8 place-items-center rounded-lg border border-[#d8e3dc] text-[#315e4f] hover:bg-[#edf5ef]" onClick={() => adjust(-0.5)}><Minus size={14} /></button>
    <label className="sr-only" htmlFor={`exchange-${group.groupCode}`}>Porciones de {group.groupName}</label>
    <input id={`exchange-${group.groupCode}`} aria-label={`Porciones de ${group.groupName}`} className="nuth-input h-9 w-16 !px-2 !py-1 text-center text-sm font-semibold" inputMode="decimal" type="number" min="0" step="0.5" value={portions || ""} placeholder="0" onChange={(event) => { const value = number(event.target.value); if (value !== null) onChange(value); }} />
    <button type="button" aria-label={`Sumar media porción de ${group.groupName}`} className="grid h-8 w-8 place-items-center rounded-lg border border-[#d8e3dc] text-[#315e4f] hover:bg-[#edf5ef]" onClick={() => adjust(0.5)}><Plus size={14} /></button>
  </div>;
}

function DifferenceRow({ label, target, actual, difference, unit, precision = 1 }: { label: string; target: number; actual: number; difference: number; unit: string; precision?: number }) {
  return <div className="grid grid-cols-[1fr_auto_auto_auto] gap-2 border-b border-white/10 py-3 text-xs last:border-b-0">
    <span className="font-semibold text-white">{label}</span><span className="text-white/60">{format(target, precision)} {unit}</span><span className="text-white/80">{format(actual, precision)} {unit}</span><span className={difference === 0 ? "text-[#b9dbbe]" : difference > 0 ? "text-[#efbd6b]" : "text-[#b9d7ff]"}>{signed(difference, precision)}</span>
  </div>;
}

function EquivalentEditor({ plan, targets, onSave, onDraftChange }: Omit<Props, "targets" | "onGoToMacros"> & { targets: ExchangeTargetSnapshot }) {
  const initial = useMemo(() => plan.exchange_prescription ? reconcileExchangePrescription(plan.exchange_prescription, targets) : createExchangePrescription(targets), [plan.exchange_prescription, targets]);
  const [draft, setDraft] = useState(initial);
  const [saveState, setSaveState] = useState<"saved" | "pending" | "saving" | "error">(plan.exchange_prescription && initial === plan.exchange_prescription ? "saved" : "pending");
  const planId = useRef(plan.id);

  useEffect(() => {
    if (planId.current !== plan.id) {
      planId.current = plan.id;
      setDraft(initial);
      setSaveState(plan.exchange_prescription && initial === plan.exchange_prescription ? "saved" : "pending");
    }
  }, [initial, plan.exchange_prescription, plan.id]);

  const update = (next: ExchangePrescription) => {
    setDraft(next);
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

  return <section className="rounded-[24px] border border-[#dfe6e1] bg-white p-5 sm:p-7">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div><p className="nuth-eyebrow">Paso 3</p><h1 className="mt-2 text-2xl font-semibold text-[#173d36]">Equivalentes y cuadro dietosintético</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#718078]">Define el inventario total del día. La distribución por tiempos de comida se realizará después.</p></div>
      <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${draft.status === "ready" ? "bg-[#eaf3ec] text-[#315e4f]" : draft.status === "editing" ? "bg-[#fff4df] text-[#7a5a28]" : "bg-[#f2f5f3] text-[#65756d]"}`}>{draft.status === "ready" ? <Check size={14} /> : <CircleAlert size={14} />}{draft.status === "ready" ? "Cuadro listo" : draft.status === "editing" ? "En edición" : "Sin iniciar"}</span>
    </div>
    {objectivesChangedSinceConfirmation(draft) && <p role="status" className="mt-4 rounded-xl bg-[#fff6e6] px-4 py-3 text-sm text-[#765827]">Los objetivos nutricionales cambiaron desde la última confirmación. Las porciones se conservaron; revisa el cuadro y confírmalo de nuevo cuando esté listo.</p>}
    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_315px]">
      <div>
        <div className="hidden overflow-hidden rounded-2xl border border-[#dfe6e1] md:block">
          <div className="grid grid-cols-[minmax(180px,1.6fr)_150px_.7fr_.65fr_.65fr_.65fr] gap-3 bg-[#f7faf8] px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-[#718078]"><span>Grupo</span><span className="text-right">Porciones</span><span>kcal</span><span>CHO</span><span>Proteína</span><span>Grasas</span></div>
          {exchangeCatalogCategories.map((category) => <div key={category.category}><p className="border-y border-[#e7ede9] bg-[#fbfcfa] px-4 py-2 text-xs font-bold text-[#477363]">{category.label}</p>{exchangeCatalog.filter((group) => group.category === category.category).map((group) => {
            const portions = byCode.get(group.groupCode) ?? 0;
            return <div key={group.groupCode} className="grid grid-cols-[minmax(180px,1.6fr)_150px_.7fr_.65fr_.65fr_.65fr] items-center gap-3 border-b border-[#edf1ee] px-4 py-3 last:border-b-0"><div className="min-w-0"><p className="font-semibold text-[#24463b]">{group.groupName}</p><Contribution group={group} /></div><PortionInput group={group} portions={portions} onChange={(value) => change(group.groupCode, value)} /><span>{format(portions * group.energyKcal)}</span><span>{format(portions * group.carbohydrateG)}</span><span>{format(portions * group.proteinG)}</span><span>{format(portions * group.fatG)}</span></div>;
          })}</div>)}
        </div>
        <div className="space-y-3 md:hidden">{exchangeCatalogCategories.map((category) => <div key={category.category}><p className="mb-2 text-xs font-bold text-[#477363]">{category.label}</p>{exchangeCatalog.filter((group) => group.category === category.category).map((group) => { const portions = byCode.get(group.groupCode) ?? 0; return <article key={group.groupCode} className="mb-2 rounded-2xl border border-[#e1e8e3] p-3"><div className="flex gap-3"><div className="min-w-0 flex-1"><p className="font-semibold text-[#24463b]">{group.groupName}</p><Contribution group={group} /></div><PortionInput group={group} portions={portions} onChange={(value) => change(group.groupCode, value)} /></div><p className="mt-3 border-t border-[#edf1ee] pt-2 text-xs text-[#52675e]">{format(portions * group.energyKcal)} kcal · {format(portions * group.carbohydrateG)} CHO · {format(portions * group.proteinG)} Prot · {format(portions * group.fatG)} Grasas</p></article>; })}</div>)}</div>
        <div className="mt-5 flex flex-wrap justify-between gap-3"><p className="text-sm text-[#65756d]">Total: <strong className="text-[#24463b]">{format(totalExchangePortions(draft), 2)} equivalentes</strong></p><button type="button" className="nuth-button-secondary !px-3 !py-2 text-xs" onClick={reset}><RotateCcw size={14} /> Restablecer equivalentes</button></div>
      </div>
      <aside className="h-fit rounded-2xl bg-[#173d36] p-5 text-white xl:sticky xl:top-56"><p className="text-xs font-bold uppercase tracking-[.14em] text-[#efbd6b]">Cuadro dietosintético</p><div className="mt-4 grid grid-cols-[1fr_auto_auto_auto] gap-2 text-[10px] uppercase tracking-wide text-white/55"><span>Indicador</span><span>Objetivo</span><span>Actual</span><span>Dif.</span></div><DifferenceRow label="Energía" target={targets.energy_kcal} actual={draft.derived_totals.energy_kcal} difference={draft.differences.energy_kcal} unit="kcal" precision={0} /><DifferenceRow label="Carbohidratos" target={targets.carbohydrate_g} actual={draft.derived_totals.carbohydrate_g} difference={draft.differences.carbohydrate_g} unit="g" /><DifferenceRow label="Proteína" target={targets.protein_g} actual={draft.derived_totals.protein_g} difference={draft.differences.protein_g} unit="g" /><DifferenceRow label="Grasas" target={targets.fat_g} actual={draft.derived_totals.fat_g} difference={draft.differences.fat_g} unit="g" /><p className="mt-4 text-xs leading-5 text-white/65">Los equivalentes son aproximaciones. La coincidencia exacta no es obligatoria.</p><button type="button" disabled={saveState === "saving"} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#efbd6b] px-4 py-3 text-sm font-semibold text-[#173d36] disabled:opacity-50" onClick={() => void confirm()}><Check size={16} /> {draft.status === "ready" ? "Confirmar nuevamente" : "Confirmar equivalentes"}</button></aside>
    </div>
    <div className="mt-4 flex items-center gap-2 text-xs text-[#74817d]">{saveState === "saving" ? <LoaderCircle size={14} className="animate-spin" /> : <ChevronDown size={14} className="rotate-[-90deg]" />}{saveState === "saving" ? "Guardando cuadro…" : saveState === "pending" ? "Cambios pendientes" : saveState === "error" ? "No se pudo guardar; intenta cambiar un campo nuevamente." : "Guardado automáticamente"}</div>
  </section>;
}

export function DietEquivalentsStep({ plan, targets, onSave, onDraftChange, onGoToMacros }: Props) {
  if (!targets) return <section className="rounded-[24px] border border-[#dfe6e1] bg-white p-5 sm:p-7"><p className="nuth-eyebrow">Paso 3</p><h1 className="mt-2 text-2xl font-semibold text-[#173d36]">Equivalentes</h1><div className="mt-5 rounded-2xl bg-[#fff6e6] p-5 text-sm leading-6 text-[#765827]"><p className="font-semibold">Completa primero la distribución de macronutrientes.</p><p className="mt-1">El cuadro dietosintético compara los equivalentes con el objetivo energético y los gramos derivados en el paso anterior.</p><button type="button" className="nuth-button mt-4" onClick={onGoToMacros}>Ir a macronutrientes</button></div></section>;
  return <EquivalentEditor key={`${plan.id}:${plan.exchange_prescription?.updated_at ?? "new"}:${targets.energy_kcal}:${targets.carbohydrate_g}:${targets.protein_g}:${targets.fat_g}`} plan={plan} targets={targets} onSave={onSave} onDraftChange={onDraftChange} />;
}
