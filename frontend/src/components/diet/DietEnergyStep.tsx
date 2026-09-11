import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, CircleAlert, LoaderCircle, RotateCcw } from "lucide-react";
import { WorkshopStepFooter } from "./WorkshopStepFooter";
import {
  activityLevelCatalog,
  energyMethodCatalog,
  etaMethodCatalog,
  getEnergyMethod,
} from "@/src/features/energy";
import type { EnergySex } from "@/src/features/energy";
import {
  calculatePlanEnergy,
  createPlanEnergyCalculation,
  isPlanEnergyTargetValid,
  patchEnergyInput,
  restoreEnergyInput,
  type EnergyReferenceContext,
} from "@/src/features/diet-energy/model";
import type { NutritionPlan, PlanEnergyCalculation } from "@/src/types/domain";

type Props = {
  plan: NutritionPlan;
  reference: EnergyReferenceContext;
  referenceLoading: boolean;
  onSave: (calculation: PlanEnergyCalculation) => Promise<void>;
  onDraftChange: (calculation: PlanEnergyCalculation) => void;
  onContinue: () => void;
};

const number = (value: string) => {
  if (value.trim() === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};

const format = (value: number | null) => value === null ? "—" : value.toLocaleString("es-MX", { maximumFractionDigits: 1 });

function MethodDetails({ methodCode }: { methodCode: string }) {
  const method = getEnergyMethod(methodCode);
  if (!method) return null;
  return (
    <details className="mt-3 rounded-xl bg-[#f7faf8] px-4 py-3 text-sm text-[#52675e]">
      <summary className="cursor-pointer font-semibold text-[#315e4f]">Ver método y aplicabilidad</summary>
      <p className="mt-2 leading-6">{method.applicability.population}</p>
      {method.notes.map((note) => <p key={note} className="mt-1 leading-6">{note}</p>)}
      {method.relatedMethodCode === "FAO_WHO_UNU_FRAMEWORK" && <p className="mt-2 text-xs font-medium">Marco de referencia: FAO/WHO/UNU.</p>}
    </details>
  );
}

function DataInput({
  label,
  value,
  unit,
  type = "number",
  source,
  onChange,
  onRestore,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  type?: "number" | "select";
  source: { source: string; source_label: string };
  onChange: (value: string) => void;
  onRestore: () => void;
}) {
  const adjusted = source.source === "plan_override";
  return (
    <label className="block rounded-2xl border border-[#e1e8e3] bg-[#fbfcfa] p-3">
      <span className="flex items-center justify-between gap-2 text-xs font-semibold text-[#52675e]">
        {label}
        {adjusted && <button type="button" className="inline-flex items-center gap-1 text-[#3d705d]" onClick={onRestore}><RotateCcw size={12} /> Restaurar</button>}
      </span>
      {type === "select" ? (
        <select aria-label={label} className="mt-2 w-full bg-transparent text-lg font-semibold text-[#1f483a] outline-none" value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
          <option value="">Sin registrar</option>
          <option value="male">Hombre</option>
          <option value="female">Mujer</option>
        </select>
      ) : (
        <div className="mt-2 flex items-baseline gap-2">
          <input aria-label={label} inputMode="decimal" type="number" min="0" step="any" className="min-w-0 flex-1 bg-transparent text-lg font-semibold text-[#1f483a] outline-none" value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
          {unit && <span className="text-xs text-[#74817d]">{unit}</span>}
        </div>
      )}
      <span className="mt-1 block text-[11px] text-[#7a8b82]">{adjusted ? "Ajuste de este plan" : source.source_label}</span>
    </label>
  );
}

export function DietEnergyStep({ plan, reference, referenceLoading, onSave, onDraftChange, onContinue }: Props) {
  const initial = useMemo(() => plan.energy_calculation ?? createPlanEnergyCalculation(reference), [plan.energy_calculation, reference]);
  const [draft, setDraft] = useState(initial);
  const [saveState, setSaveState] = useState<"saved" | "pending" | "saving" | "error">(plan.energy_calculation ? "saved" : "pending");
  const lastPlanId = useRef(plan.id);

  useEffect(() => {
    if (lastPlanId.current !== plan.id) {
      lastPlanId.current = plan.id;
      setDraft(initial);
      setSaveState(plan.energy_calculation ? "saved" : "pending");
    }
  }, [initial, plan.energy_calculation, plan.id]);

  const update = (next: PlanEnergyCalculation) => {
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

  const method = getEnergyMethod(draft.method_code);
  const pal = draft.activity.method_code === "PAL_FAO_WHO_UNU";
  const levels = activityLevelCatalog.filter((level) => level.methodCode === draft.activity.method_code);
  const errors = draft.results.errors;
  const warnings = draft.results.warnings;
  const validTarget = isPlanEnergyTargetValid(draft.prescribed_target_kcal);
  const canContinue = validTarget && saveState !== "saving";
  const targetDifference = draft.results.total_kcal === null || draft.prescribed_target_kcal === null ? null : draft.prescribed_target_kcal - draft.results.total_kcal;

  const changeMode = (value: string) => {
    const nextMode = value === "MANUAL_ENERGY_TARGET" ? "manual" : value === "MEASURED_INDIRECT_CALORIMETRY" ? "measured" : "predictive";
    update(calculatePlanEnergy({ ...draft, mode: nextMode, method_code: value }));
  };

  return (
    <section className="rounded-[24px] border border-[#dfe6e1] bg-white p-5 sm:p-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="nuth-eyebrow">Paso 1</p>
          <h1 aria-label="Objetivo energético" className="mt-2 text-2xl font-semibold text-[#173d36]">Energía</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#718078]">Define el objetivo energético del día.</p>
        </div>
        <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${validTarget ? "bg-[#eaf3ec] text-[#315e4f]" : "bg-[#fff4df] text-[#7a5a28]"}`}>
          {validTarget ? <Check size={14} /> : <CircleAlert size={14} />}
          {validTarget ? "Objetivo listo" : "Falta objetivo"}
        </span>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-[#e1e8e3] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="font-semibold text-[#24463b]">Datos utilizados</h2><p className="mt-1 text-xs text-[#74817d]">Modificar aquí no cambia el expediente.</p></div>
            {referenceLoading && <LoaderCircle size={16} className="animate-spin text-[#3d705d]" />}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <DataInput label="Peso" value={draft.inputs.weight_kg.value} unit="kg" source={draft.inputs.weight_kg} onChange={(value) => update(patchEnergyInput(draft, "weight_kg", number(value)))} onRestore={() => update(restoreEnergyInput(draft, "weight_kg"))} />
            <DataInput label="Talla" value={draft.inputs.height_cm.value} unit="cm" source={draft.inputs.height_cm} onChange={(value) => update(patchEnergyInput(draft, "height_cm", number(value)))} onRestore={() => update(restoreEnergyInput(draft, "height_cm"))} />
            <DataInput label="Edad" value={draft.inputs.age_years.value} unit="años" source={draft.inputs.age_years} onChange={(value) => update(patchEnergyInput(draft, "age_years", number(value)))} onRestore={() => update(restoreEnergyInput(draft, "age_years"))} />
            <DataInput label="Sexo utilizado por la ecuación" value={draft.inputs.equation_sex.value} type="select" source={draft.inputs.equation_sex} onChange={(value) => update(patchEnergyInput(draft, "equation_sex", value === "male" || value === "female" ? value as EnergySex : null))} onRestore={() => update(restoreEnergyInput(draft, "equation_sex"))} />
          </div>
        </div>

        <div className="rounded-2xl border border-[#e1e8e3] p-4 sm:p-5">
          <h2 className="font-semibold text-[#24463b]">Método de energía</h2>
          <label className="mt-3 block text-xs font-semibold text-[#52675e]">Método
            <select className="nuth-input mt-2" value={draft.method_code} onChange={(event) => changeMode(event.target.value)}>
              <optgroup label="Ecuaciones predictivas">
                {energyMethodCatalog.filter((item) => item.kind === "predictive_equation" && item.active).map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
              </optgroup>
              <optgroup label="Otros criterios">
                {energyMethodCatalog.filter((item) => item.kind === "measured" || item.kind === "manual_target").map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
              </optgroup>
            </select>
          </label>
          {method && <MethodDetails methodCode={method.code} />}
          {draft.mode === "measured" && <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-[#52675e]">Gasto medido (kcal/día)<input className="nuth-input mt-2" type="number" min="0" value={draft.measured.kcal_per_day ?? ""} onChange={(event) => update(calculatePlanEnergy({ ...draft, measured: { ...draft.measured, kcal_per_day: number(event.target.value) } }))} /></label>
            <label className="text-xs font-semibold text-[#52675e]">Fecha de la medición<input className="nuth-input mt-2" type="date" value={draft.measured.measured_at ?? ""} onChange={(event) => update(calculatePlanEnergy({ ...draft, measured: { ...draft.measured, measured_at: event.target.value || null } }))} /></label>
            <label className="text-xs font-semibold text-[#52675e] sm:col-span-2">Equipo (opcional)<input className="nuth-input mt-2" maxLength={120} value={draft.measured.equipment ?? ""} onChange={(event) => update(calculatePlanEnergy({ ...draft, measured: { ...draft.measured, equipment: event.target.value || null } }))} /></label>
          </div>}
          {draft.mode === "manual" && <p className="mt-4 rounded-xl bg-[#f7faf8] p-3 text-sm leading-6 text-[#5e7168]">El objetivo manual no calcula gasto basal ni GET. Puedes registrar directamente la prescripción al final.</p>}
        </div>
      </div>

      {draft.mode !== "manual" && <section className="mt-5 rounded-2xl border border-[#e1e8e3] p-4 sm:p-5">
        <h2 className="font-semibold text-[#24463b]">Actividad y efecto térmico de los alimentos</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="text-xs font-semibold text-[#52675e]">Método de actividad
            <select className="nuth-input mt-2" value={draft.activity.method_code} onChange={(event) => {
              const methodCode = event.target.value as PlanEnergyCalculation["activity"]["method_code"];
              update(calculatePlanEnergy({ ...draft, activity: { method_code: methodCode, level_code: null, factor: null, pal: null }, eta: methodCode === "PAL_FAO_WHO_UNU" ? { ...draft.eta, enabled: false } : draft.eta }));
            }}>
              <option value="CLINICAL_ACTIVITY_FACTOR">Factor clínico</option><option value="PAL_FAO_WHO_UNU">PAL · FAO/WHO/UNU</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-[#52675e]">Nivel
            <select className="nuth-input mt-2" value={draft.activity.level_code ?? ""} onChange={(event) => update(calculatePlanEnergy({ ...draft, activity: { ...draft.activity, level_code: event.target.value || null } }))}>
              <option value="">Seleccionar</option>{levels.map((level) => <option key={level.code} value={level.code}>{level.label}{pal && level.minFactor !== undefined ? ` · ${level.minFactor.toFixed(2)}–${level.maxFactor?.toFixed(2)}` : ""}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-[#52675e]">{pal ? "PAL utilizado" : "Factor utilizado"}
            <input className="nuth-input mt-2" type="number" min="1" step="0.01" placeholder={pal ? "Ej. 1.70" : "Sugerido por nivel"} value={pal ? draft.activity.pal ?? "" : draft.activity.factor ?? ""} onChange={(event) => update(calculatePlanEnergy({ ...draft, activity: { ...draft.activity, ...(pal ? { pal: number(event.target.value) } : { factor: number(event.target.value) }) } }))} />
          </label>
        </div>
        {pal ? <p className="mt-3 rounded-xl bg-[#edf5ef] px-3 py-2 text-xs leading-5 text-[#315e4f]">El PAL ya integra el ETA; Nuthrick no lo sumará de nuevo.</p> : <label className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-[#f7faf8] px-3 py-3 text-sm text-[#435c52]"><input type="checkbox" checked={draft.eta.enabled} onChange={(event) => update(calculatePlanEnergy({ ...draft, eta: { ...draft.eta, enabled: event.target.checked } }))} /> Incluir ETA <input aria-label="Porcentaje de ETA" className="w-20 rounded-lg border border-[#cfdcd4] bg-white px-2 py-1 text-sm" type="number" min="0" max="100" step="1" value={draft.eta.rate === null ? etaMethodCatalog[0].defaultRate * 100 : draft.eta.rate * 100} onChange={(event) => update(calculatePlanEnergy({ ...draft, eta: { ...draft.eta, rate: number(event.target.value) === null ? null : Number(event.target.value) / 100 } }))} /> % del basal</label>}
      </section>}

      {(errors.length > 0 || warnings.length > 0) && <div className="mt-5 space-y-2">
        {errors.map((message) => <p key={`${message.code}-${message.message}`} role="alert" className="rounded-xl bg-[#fbe9e5] px-4 py-3 text-sm text-[#963f32]">{message.message}</p>)}
        {warnings.map((message) => <p key={`${message.code}-${message.message}`} className="rounded-xl bg-[#fff6e6] px-4 py-3 text-sm text-[#7a5a28]">{message.message}</p>)}
      </div>}

      <section className="mt-5 rounded-2xl bg-[#173d36] p-5 text-white sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[.14em] text-[#efbd6b]">Resultado y prescripción</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <div><p className="text-xs text-white/60">Gasto basal</p><p className="mt-1 text-xl font-semibold">{format(draft.results.basal_kcal)} <span className="text-sm font-normal">kcal</span></p></div>
          <div><p className="text-xs text-white/60">Actividad</p><p className="mt-1 text-xl font-semibold">{format(draft.results.activity_kcal)} <span className="text-sm font-normal">kcal</span></p></div>
          <div><p className="text-xs text-white/60">ETA</p><p className="mt-1 text-xl font-semibold">{draft.results.eta_integrated ? "Incluida" : `${format(draft.results.eta_kcal)} kcal`}</p></div>
          <div><p className="text-xs text-white/60">GET estimado</p><p className="mt-1 text-xl font-semibold">{format(draft.results.total_kcal)} <span className="text-sm font-normal">kcal</span></p></div>
        </div>
        <div className="mt-5 flex flex-col gap-3 border-t border-white/15 pt-5 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-sm font-semibold">Objetivo prescrito (kcal/día)
            <input aria-label="Objetivo prescrito (kcal/día)" className="mt-2 w-full rounded-xl border border-white/20 bg-white px-3 py-2.5 text-lg font-semibold text-[#173d36]" type="number" min="1" max="10000" value={draft.prescribed_target_kcal ?? ""} onChange={(event) => update(calculatePlanEnergy({ ...draft, prescribed_target_kcal: number(event.target.value) }))} />
          </label>
          {draft.results.total_kcal !== null && <button type="button" className="rounded-xl border border-white/30 px-4 py-3 text-sm font-semibold" onClick={() => update(calculatePlanEnergy({ ...draft, prescribed_target_kcal: Math.round(draft.results.total_kcal!) }))}>Usar GET</button>}
        </div>
        {targetDifference !== null && <p className="mt-3 text-xs text-white/70">Diferencia frente al GET: {targetDifference > 0 ? "+" : ""}{format(targetDifference)} kcal/día. Es una comparación matemática; el criterio clínico es del profesional.</p>}
        {!validTarget && <p className="mt-3 text-xs text-white/70">Para continuar, registra un objetivo entre 1 y 10,000 kcal/día.</p>}
      </section>

      <div className="mt-4 flex items-center gap-2 text-xs text-[#74817d]">
        {saveState === "saving" ? <LoaderCircle size={14} className="animate-spin" /> : <ChevronDown size={14} className="rotate-[-90deg]" />}
        {saveState === "saving" ? "Guardando trazabilidad…" : saveState === "pending" ? "Cambios pendientes" : saveState === "error" ? "No se pudo guardar; intenta cambiar un campo nuevamente." : "Guardado automáticamente"}
      </div>
      <WorkshopStepFooter onNext={onContinue} nextDisabled={!canContinue} nextAriaLabel="Continuar a macronutrientes" nextHint={!validTarget ? "Registra un objetivo para continuar." : undefined} />
    </section>
  );
}
