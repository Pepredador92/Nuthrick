import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, CircleAlert, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import { macroCatalog } from "@/src/features/macros/catalog";
import {
  createMacroDistribution,
  patchMacroInput,
  restoreEnergyReferenceWeight,
  setMacroReferenceWeight,
} from "@/src/features/macros/model";
import type { MacroDistribution, MacroInputMode, NutritionPlan } from "@/src/types/domain";

type Props = {
  plan: NutritionPlan;
  targetEnergyKcal: number | null;
  energyReferenceWeightKg: number | null;
  onSave: (distribution: MacroDistribution) => Promise<void>;
  onDraftChange: (distribution: MacroDistribution) => void;
  onGoToEnergy: () => void;
  onContinue: () => void;
};

const numeric = (value: string) => {
  if (value.trim() === "") return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
};

const display = (value: number | null, maximumFractionDigits: number) =>
  value === null ? "—" : value.toLocaleString("es-MX", { maximumFractionDigits, minimumFractionDigits: 0 });

function MacroModeSelect({ value, disabled, onChange }: { value: MacroInputMode; disabled: boolean; onChange: (mode: MacroInputMode) => void }) {
  return (
    <select aria-label="Modo de captura" className="nuth-input !h-10 !px-2 !py-1 text-xs" value={value} onChange={(event) => onChange(event.target.value as MacroInputMode)}>
      <option value="percentage">%</option>
      <option value="grams">g</option>
      <option value="grams_per_kg" disabled={disabled}>g/kg</option>
    </select>
  );
}

export function DietMacrosStep({ plan, targetEnergyKcal, energyReferenceWeightKg, onSave, onDraftChange, onGoToEnergy, onContinue }: Props) {
  if (!targetEnergyKcal || targetEnergyKcal <= 0) {
    return (
      <section className="rounded-[24px] border border-[#dfe6e1] bg-white p-5 sm:p-7">
        <p className="nuth-eyebrow">Paso 2</p>
        <h1 className="mt-2 text-2xl font-semibold text-[#173d36]">Kilocalorías y macronutrientes</h1>
        <div className="mt-5 rounded-2xl bg-[#fff6e6] p-5 text-sm leading-6 text-[#765827]">
          <p className="font-semibold">Define primero un objetivo energético.</p>
          <p className="mt-1">La distribución se calcula a partir de la prescripción guardada en el paso anterior.</p>
          <button type="button" className="nuth-button mt-4" onClick={onGoToEnergy}>Ir al objetivo energético</button>
        </div>
      </section>
    );
  }

  return <MacroEditor key={`${plan.id}:${targetEnergyKcal}:${plan.macro_distribution?.updated_at ?? "new"}`} plan={plan} targetEnergyKcal={targetEnergyKcal} energyReferenceWeightKg={energyReferenceWeightKg} onSave={onSave} onDraftChange={onDraftChange} onContinue={onContinue} />;
}

function MacroEditor({ plan, targetEnergyKcal, energyReferenceWeightKg, onSave, onDraftChange, onContinue }: Omit<Props, "targetEnergyKcal" | "onGoToEnergy"> & { targetEnergyKcal: number }) {
  const initial = useMemo(
    () => plan.macro_distribution ?? createMacroDistribution(targetEnergyKcal, energyReferenceWeightKg),
    [energyReferenceWeightKg, plan.macro_distribution, targetEnergyKcal],
  );
  const [draft, setDraft] = useState(initial);
  const [saveState, setSaveState] = useState<"saved" | "pending" | "saving" | "error">(plan.macro_distribution ? "saved" : "pending");
  const planId = useRef(plan.id);

  useEffect(() => {
    if (planId.current !== plan.id) {
      planId.current = plan.id;
      setDraft(initial);
      setSaveState(plan.macro_distribution ? "saved" : "pending");
    }
  }, [initial, plan.id, plan.macro_distribution]);

  const update = (next: MacroDistribution) => {
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

  const hasReferenceWeight = draft.reference_weight_kg !== null && draft.reference_weight_kg > 0;
  const hasData = Object.values(draft.macros).some((macro) => macro.input_value !== null);
  const reset = () => {
    if (hasData && !window.confirm("¿Restablecer la distribución? Se eliminarán únicamente los valores de macronutrientes de este plan.")) return;
    update(createMacroDistribution(targetEnergyKcal, energyReferenceWeightKg));
  };

  return (
    <section className="rounded-[24px] border border-[#dfe6e1] bg-white p-5 sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="nuth-eyebrow">Paso 2</p>
          <h1 className="mt-2 text-2xl font-semibold text-[#173d36]">Kilocalorías y macronutrientes</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#718078]">Define la distribución del plan. Cada macro conserva el modo y valor con el que fue capturado.</p>
        </div>
        <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${draft.complete ? "bg-[#eaf3ec] text-[#315e4f]" : "bg-[#fff4df] text-[#7a5a28]"}`}>
          {draft.complete ? <Check size={14} /> : <CircleAlert size={14} />}
          {draft.complete ? "Distribución lista" : "Revisa la distribución"}
        </span>
      </div>

      <div className="mt-5 grid gap-4 rounded-2xl border border-[#dfe6e1] bg-[#f9fbf8] p-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.12em] text-[#718078]">Objetivo energético guardado</p>
          <p className="mt-1 text-2xl font-semibold text-[#173d36]">{display(targetEnergyKcal, 0)} <span className="text-sm font-normal">kcal/día</span></p>
          <p className="mt-2 text-xs text-[#718078]">Se usa como referencia; este paso no recalcula el gasto energético.</p>
        </div>
        <button type="button" className="nuth-button-secondary !px-3 !py-2 text-xs" onClick={reset}><RotateCcw size={14} /> Restablecer</button>
      </div>

      <div className="mt-4 rounded-2xl border border-[#e1e8e3] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-semibold text-[#24463b]">Peso de referencia para g/kg</p>
            <p className="mt-1 text-xs text-[#718078]">{draft.reference_weight_source === "manual" ? "Ajuste local de este plan" : draft.reference_weight_source === "energy_calculation" ? "Valor utilizado en el objetivo energético" : "Sin un peso disponible"}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs font-semibold text-[#52675e]">Peso (kg)
              <input aria-label="Peso de referencia" className="nuth-input mt-1 w-32 !py-2" inputMode="decimal" type="number" min="0" step="any" value={draft.reference_weight_source === "manual" ? draft.reference_weight_kg ?? "" : ""} placeholder={hasReferenceWeight ? display(draft.reference_weight_kg, 1) : "Registrar"} onChange={(event) => update(setMacroReferenceWeight(draft, numeric(event.target.value)))} />
            </label>
            {draft.reference_weight_source === "manual" && <button type="button" className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-[#3d705d]" onClick={() => update(restoreEnergyReferenceWeight(draft, energyReferenceWeightKg))}><RotateCcw size={13} /> Restaurar</button>}
          </div>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto rounded-2xl border border-[#dfe6e1]">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[1.25fr_.7fr_.85fr_.8fr_.8fr_.8fr] gap-3 border-b border-[#dfe6e1] bg-[#f7faf8] px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-[#718078]">
            <span>Macronutriente</span><span>Modo</span><span>Valor</span><span>kcal</span><span>g</span><span>g/kg</span>
          </div>
          {macroCatalog.map((entry) => {
            const macro = draft.macros[entry.code];
            const unit = macro.input_mode === "percentage" ? "%" : macro.input_mode === "grams" ? "g" : "g/kg";
            return (
              <div key={entry.code} className="grid grid-cols-[1.25fr_.7fr_.85fr_.8fr_.8fr_.8fr] items-center gap-3 border-b border-[#edf1ee] px-4 py-3 last:border-b-0">
                <div className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} /><span className="font-semibold text-[#24463b]">{entry.label}</span></div>
                <MacroModeSelect value={macro.input_mode} disabled={!hasReferenceWeight} onChange={(mode) => update(patchMacroInput(draft, entry.code, mode, macro.input_value))} />
                <label className="relative"><span className="sr-only">Valor de {entry.label}</span><input aria-label={`Valor de ${entry.label}`} className="nuth-input !h-10 !py-1 pr-9 text-sm" inputMode="decimal" type="number" min="0" step="any" value={macro.input_value ?? ""} onChange={(event) => update(patchMacroInput(draft, entry.code, macro.input_mode, numeric(event.target.value)))} /><span className="pointer-events-none absolute right-3 top-3 text-[11px] text-[#718078]">{unit}</span></label>
                <span className="text-sm font-semibold text-[#315e4f]">{display(macro.kcal, 1)}</span>
                <span className="text-sm text-[#52675e]">{display(macro.grams, 1)}</span>
                <span className="text-sm text-[#52675e]">{display(macro.grams_per_kg, 2)}</span>
              </div>
            );
          })}
        </div>
      </div>
      {!hasReferenceWeight && <p className="mt-3 text-xs leading-5 text-[#7a5a28]">Registra un peso de referencia para habilitar el modo g/kg. Esto no modifica los datos del paciente.</p>}

      <section className="mt-5 rounded-2xl bg-[#173d36] p-5 text-white">
        <div className="grid gap-4 sm:grid-cols-3">
          <div><p className="text-xs text-white/65">Energía asignada</p><p className="mt-1 text-xl font-semibold">{display(draft.totals.kcal, 1)} kcal</p></div>
          <div><p className="text-xs text-white/65">Distribución</p><p className="mt-1 text-xl font-semibold">{display(draft.totals.percentage, 1)}%</p></div>
          <div><p className="text-xs text-white/65">Diferencia</p><p className="mt-1 text-xl font-semibold">{draft.totals.difference_kcal > 0 ? "+" : ""}{display(draft.totals.difference_kcal, 1)} kcal</p></div>
        </div>
        <div className="mt-5 flex flex-col gap-3 border-t border-white/15 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-white/70">Tolerancia de cierre: ±1 kcal. No se redistribuyen macros de forma automática.</p>
          <button type="button" disabled={!draft.complete || saveState === "saving"} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#efbd6b] px-4 py-3 text-sm font-semibold text-[#173d36] disabled:cursor-not-allowed disabled:opacity-50" onClick={onContinue}><Sparkles size={16} /> Continuar a equivalentes</button>
        </div>
      </section>
      <div className="mt-4 flex items-center gap-2 text-xs text-[#74817d]">
        {saveState === "saving" ? <LoaderCircle size={14} className="animate-spin" /> : <ChevronDown size={14} className="rotate-[-90deg]" />}
        {saveState === "saving" ? "Guardando trazabilidad…" : saveState === "pending" ? "Cambios pendientes" : saveState === "error" ? "No se pudo guardar; intenta cambiar un campo nuevamente." : "Guardado automáticamente"}
      </div>
    </section>
  );
}
