import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Activity, ArrowRight, Calculator, Check, CircleAlert, LoaderCircle, RotateCcw, Save, Target, UserRound } from "lucide-react";
import "./DietEnergyStep.css";
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
import { useChangeAutosave } from "./useChangeAutosave";

type Props = {
  plan: NutritionPlan;
  reference: EnergyReferenceContext;
  referenceLoading: boolean;
  onSave: (calculation: PlanEnergyCalculation) => Promise<void>;
  onDraftChange: (calculation: PlanEnergyCalculation) => void;
  onContinue: () => void;
  onSaveAndExit?: () => void;
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
    <details className="energy-method-details">
      <summary className="cursor-pointer font-semibold">Ver método y aplicabilidad</summary>
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
  const id = useId();
  return (
    <div className="energy-data-field">
      <div className="energy-data-label">
        <label htmlFor={id}>{label}</label>
        {adjusted && <button type="button" aria-label={`Restaurar ${label.toLocaleLowerCase()}`} title="Restaurar dato de referencia" onClick={onRestore}><RotateCcw size={13} /></button>}
      </div>
      {type === "select" ? (
        <select id={id} value={value ?? ""} onChange={(event) => onChange(event.target.value)}>
          <option value="">Sin registrar</option>
          <option value="male">Hombre</option>
          <option value="female">Mujer</option>
        </select>
      ) : (
        <div className="energy-data-value">
          <input id={id} inputMode="decimal" type="number" min="0" step="any" value={value ?? ""} onChange={(event) => onChange(event.target.value)} />
          {unit && <span>{unit}</span>}
        </div>
      )}
      <small>{adjusted ? "Ajuste de este plan" : source.source_label}</small>
    </div>
  );
}

export function DietEnergyStep({ plan, reference, referenceLoading, onSave, onDraftChange, onContinue, onSaveAndExit }: Props) {
  const initial = useMemo(() => plan.energy_calculation ?? calculatePlanEnergy({ ...createPlanEnergyCalculation(reference), ...(plan.target_calories ? { mode: "manual" as const, method_code: "MANUAL_ENERGY_TARGET", prescribed_target_kcal: plan.target_calories } : {}) }), [plan.energy_calculation, plan.target_calories, reference]);
  const [draft, setDraft] = useState(initial);
  const lastPlanId = useRef(plan.id);
  const autosave = useChangeAutosave({ initialValue: initial, onSave, onDraftChange });
  const saveState = autosave.status;

  useEffect(() => {
    if (lastPlanId.current !== plan.id) {
      lastPlanId.current = plan.id;
      setDraft(initial);
    }
  }, [initial, plan.energy_calculation, plan.id]);

  const update = (next: PlanEnergyCalculation) => {
    setDraft(next);
    autosave.change(next);
  };

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
    <section className="diet-energy-step" aria-labelledby="energy-heading">
      <header className="energy-intro">
        <div>
          <p className="energy-eyebrow">PASO 01 / 06</p>
          <h1 id="energy-heading" aria-label="Objetivo energético">Energía</h1>
          <p>El punto de partida de tu plan. Revisa, calcula y define el objetivo del día.</p>
        </div>
        <span className={`energy-status ${validTarget ? "is-ready" : "is-pending"}`}>
          {validTarget ? <Check size={14} /> : <CircleAlert size={14} />}
          {validTarget ? "Objetivo listo" : "Por definir"}
        </span>
      </header>

      <div className={`energy-grid ${draft.mode === "manual" ? "energy-grid-manual" : ""}`}>
        <section className="energy-card energy-reference" aria-labelledby="energy-reference-heading">
          <header className="energy-card-heading">
            <span className="energy-icon energy-icon-reference"><UserRound size={20} /></span>
            <div><h2 id="energy-reference-heading">Datos de referencia</h2><p>01 · Revisa la información del paciente</p></div>
            {referenceLoading && <LoaderCircle aria-label="Cargando datos" size={16} className="animate-spin" />}
          </header>
          <div className="energy-card-body">
            <div className="energy-data-grid">
              <DataInput label="Peso" value={draft.inputs.weight_kg.value} unit="kg" source={draft.inputs.weight_kg} onChange={(value) => update(patchEnergyInput(draft, "weight_kg", number(value)))} onRestore={() => update(restoreEnergyInput(draft, "weight_kg"))} />
              <DataInput label="Talla" value={draft.inputs.height_cm.value} unit="cm" source={draft.inputs.height_cm} onChange={(value) => update(patchEnergyInput(draft, "height_cm", number(value)))} onRestore={() => update(restoreEnergyInput(draft, "height_cm"))} />
              <DataInput label="Edad" value={draft.inputs.age_years.value} unit="años" source={draft.inputs.age_years} onChange={(value) => update(patchEnergyInput(draft, "age_years", number(value)))} onRestore={() => update(restoreEnergyInput(draft, "age_years"))} />
              <DataInput label="Sexo utilizado por la ecuación" value={draft.inputs.equation_sex.value} type="select" source={draft.inputs.equation_sex} onChange={(value) => update(patchEnergyInput(draft, "equation_sex", value === "male" || value === "female" ? value as EnergySex : null))} onRestore={() => update(restoreEnergyInput(draft, "equation_sex"))} />
            </div>
            <p className="energy-note">Los ajustes aquí se aplican sólo a este plan.</p>
          </div>
        </section>

        <section className="energy-card energy-method" aria-labelledby="energy-method-heading">
          <header className="energy-card-heading">
            <span className="energy-icon energy-icon-method"><Calculator size={20} /></span>
            <div><h2 id="energy-method-heading">Método de energía</h2><p>02 · Elige cómo definir la energía</p></div>
          </header>
          <div className="energy-card-body">
            <label className="energy-field">Método
              <select className="energy-input" value={draft.method_code} onChange={(event) => changeMode(event.target.value)}>
                <optgroup label="Ecuaciones predictivas">
                  {energyMethodCatalog.filter((item) => item.kind === "predictive_equation" && item.active).map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                </optgroup>
                <optgroup label="Otros criterios">
                  {energyMethodCatalog.filter((item) => item.kind === "measured" || item.kind === "manual_target").map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                </optgroup>
              </select>
            </label>
            {method && <MethodDetails methodCode={method.code} />}
            {draft.mode === "measured" && <div className="energy-measured-grid">
              <label className="energy-field">Gasto medido (kcal/día)<input className="energy-input" type="number" min="0" value={draft.measured.kcal_per_day ?? ""} onChange={(event) => update(calculatePlanEnergy({ ...draft, measured: { ...draft.measured, kcal_per_day: number(event.target.value) } }))} /></label>
              <label className="energy-field">Fecha de la medición<input className="energy-input" type="date" value={draft.measured.measured_at ?? ""} onChange={(event) => update(calculatePlanEnergy({ ...draft, measured: { ...draft.measured, measured_at: event.target.value || null } }))} /></label>
              <label className="energy-field">Equipo (opcional)<input className="energy-input" maxLength={120} value={draft.measured.equipment ?? ""} onChange={(event) => update(calculatePlanEnergy({ ...draft, measured: { ...draft.measured, equipment: event.target.value || null } }))} /></label>
            </div>}
            {draft.mode === "manual" ? <p className="energy-note">Introduce tu prescripción en la tarjeta de objetivo. La captura manual no estima gasto basal ni GET.</p> : <div className="energy-estimate">
              <div><p>Gasto energético total estimado</p><strong>{format(draft.results.total_kcal)} <span>kcal/día</span></strong></div>
              <span className="energy-estimate-label">GET</span>
            </div>}
            {draft.mode !== "manual" && <dl className="energy-breakdown">
              <div><dt>Gasto basal</dt><dd>{format(draft.results.basal_kcal)} <span>kcal</span></dd></div>
              <div><dt>Actividad</dt><dd>{format(draft.results.activity_kcal)} <span>kcal</span></dd></div>
              <div><dt>ETA</dt><dd>{draft.results.eta_integrated ? "Incluido" : <>{format(draft.results.eta_kcal)} <span>kcal</span></>}</dd></div>
            </dl>}
          </div>
        </section>

        {draft.mode !== "manual" && <section className="energy-card energy-activity" aria-labelledby="energy-activity-heading">
          <header className="energy-card-heading">
            <span className="energy-icon energy-icon-activity"><Activity size={20} /></span>
            <div><h2 id="energy-activity-heading">Actividad y ETA</h2><p>03 · Ajusta los factores del cálculo</p></div>
          </header>
          <div className="energy-card-body">
            <div className="energy-activity-fields">
              <label className="energy-field">Método de actividad
                <select className="energy-input" value={draft.activity.method_code} onChange={(event) => {
                  const methodCode = event.target.value as PlanEnergyCalculation["activity"]["method_code"];
                  update(calculatePlanEnergy({ ...draft, activity: { method_code: methodCode, level_code: null, factor: null, pal: null }, eta: methodCode === "PAL_FAO_WHO_UNU" ? { ...draft.eta, enabled: false } : draft.eta }));
                }}>
                  <option value="CLINICAL_ACTIVITY_FACTOR">Factor clínico</option><option value="PAL_FAO_WHO_UNU">PAL · FAO/WHO/UNU</option>
                </select>
              </label>
              <label className="energy-field">Nivel
                <select className="energy-input" value={draft.activity.level_code ?? ""} onChange={(event) => update(calculatePlanEnergy({ ...draft, activity: { ...draft.activity, level_code: event.target.value || null } }))}>
                  <option value="">Seleccionar</option>{levels.map((level) => <option key={level.code} value={level.code}>{level.label}{pal && level.minFactor !== undefined ? ` · ${level.minFactor.toFixed(2)}–${level.maxFactor?.toFixed(2)}` : ""}</option>)}
                </select>
              </label>
              <label className="energy-field">{pal ? "PAL utilizado" : "Factor utilizado"}
                <input className="energy-input" type="number" min="1" step="0.01" placeholder={pal ? "Ej. 1.70" : "Sugerido por nivel"} value={pal ? draft.activity.pal ?? "" : draft.activity.factor ?? ""} onChange={(event) => update(calculatePlanEnergy({ ...draft, activity: { ...draft.activity, ...(pal ? { pal: number(event.target.value) } : { factor: number(event.target.value) }) } }))} />
              </label>
            </div>
            {pal ? <p className="energy-note">El PAL ya integra el ETA; Nuthrick no lo sumará de nuevo.</p> : <div className="energy-eta">
              <label><input type="checkbox" checked={draft.eta.enabled} onChange={(event) => update(calculatePlanEnergy({ ...draft, eta: { ...draft.eta, enabled: event.target.checked } }))} /> Incluir ETA</label>
              <label><input aria-label="Porcentaje de ETA" type="number" min="0" max="100" step="1" value={draft.eta.rate === null ? etaMethodCatalog[0].defaultRate * 100 : draft.eta.rate * 100} onChange={(event) => update(calculatePlanEnergy({ ...draft, eta: { ...draft.eta, rate: number(event.target.value) === null ? null : Number(event.target.value) / 100 } }))} /> % del basal</label>
            </div>}
            <p className="energy-note">ETA: efecto térmico de los alimentos.</p>
          </div>
        </section>}

        <section className="energy-card energy-target" aria-labelledby="energy-target-heading">
          <header className="energy-card-heading">
            <span className="energy-icon energy-icon-target"><Target size={20} /></span>
            <div><h2 id="energy-target-heading">Tu objetivo del día</h2><p>{draft.mode === "manual" ? "03" : "04"} · Define la energía que vas a prescribir</p></div>
          </header>
          <div className="energy-card-body">
            <label className="energy-field" htmlFor="energy-prescribed-target">Objetivo prescrito (kcal/día)</label>
            <div className="energy-target-input">
              <input id="energy-prescribed-target" inputMode="decimal" type="number" min="1" max="10000" placeholder="—" value={draft.prescribed_target_kcal ?? ""} onChange={(event) => update(calculatePlanEnergy({ ...draft, prescribed_target_kcal: number(event.target.value) }))} />
              <span>kcal / día</span>
            </div>
            {draft.results.total_kcal !== null && <button type="button" className="energy-use-get" onClick={() => update(calculatePlanEnergy({ ...draft, prescribed_target_kcal: Math.round(draft.results.total_kcal!) }))}>Usar GET <ArrowRight size={14} /> <span>{format(Math.round(draft.results.total_kcal))} kcal</span></button>}
            {targetDifference !== null && <p className="energy-note">{targetDifference > 0 ? "+" : ""}{format(targetDifference)} kcal frente al GET estimado. Ajusta según tu criterio clínico.</p>}
            {!validTarget && <p className="energy-note">Registra un objetivo entre 1 y 10,000 kcal/día.</p>}
          </div>
        </section>
      </div>

      {(errors.length > 0 || warnings.length > 0) && <div className="energy-notices">
        {errors.map((message) => <p key={`${message.code}-${message.message}`} role="alert" className="energy-alert">{message.message}</p>)}
        {warnings.map((message) => <p key={`${message.code}-${message.message}`} className="energy-warning">{message.message}</p>)}
      </div>}

      <footer className="energy-actions">
        <div className="energy-actions-summary">
          <span className="energy-actions-label">Objetivo del día</span>
          <strong>{format(draft.prescribed_target_kcal)} <span>kcal</span></strong>
        </div>
        <div className="energy-save-status" role="status">
          {saveState === "saving" ? <LoaderCircle size={14} className="animate-spin" /> : saveState === "error" ? <CircleAlert size={14} /> : <Check size={14} />}
          <span>{saveState === "saving" ? "Guardando…" : saveState === "dirty" ? "Cambios pendientes" : saveState === "error" ? "No se pudo guardar" : saveState === "saved" ? "Guardado" : "Guardado automático"}</span>
        </div>
        {onSaveAndExit && <button type="button" className="energy-save-exit" onClick={onSaveAndExit}><Save size={15} />Guardar y salir</button>}
        <button type="button" className="energy-continue" disabled={!canContinue} aria-label="Continuar a macronutrientes" onClick={onContinue}>Continuar a Macros <ArrowRight size={17} /></button>
      </footer>
    </section>
  );
}
