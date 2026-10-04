import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, CircleAlert, LoaderCircle, PieChart, RotateCcw, Save, Scale, Target } from "lucide-react";
import { SupplementEditor } from "./SupplementEditor";
import { dietNutritionSplit } from "@/src/features/supplements/targets";
import { macroCatalog } from "@/src/features/macros/catalog";
import {
  createMacroDistribution,
  patchMacroInput,
  restoreEnergyReferenceWeight,
  setMacroReferenceWeight,
} from "@/src/features/macros/model";
import type { MacroDistribution, MacroInputMode, NutritionPlan } from "@/src/types/domain";
import { useChangeAutosave } from "./useChangeAutosave";
import "./DietEnergyStep.css";
import "./DietMacrosStep.css";

type Props = {
  plan: NutritionPlan;
  targetEnergyKcal: number | null;
  energyReferenceWeightKg: number | null;
  onSave: (distribution: MacroDistribution) => Promise<void>;
  onDraftChange: (distribution: MacroDistribution) => void;
  onGoToEnergy: () => void;
  onContinue: () => void;
  onSaveAndExit?: () => void;
};

const numeric = (value: string) => {
  if (value.trim() === "") return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : null;
};

const display = (value: number | null, maximumFractionDigits = 1) =>
  value === null ? "—" : value.toLocaleString("es-MX", { maximumFractionDigits, minimumFractionDigits: 0 });

const macroPresentation = {
  CARBOHYDRATE: { tone: "carbohydrate", nutritionKey: "carbohydrate_g" },
  PROTEIN: { tone: "protein", nutritionKey: "protein_g" },
  FAT: { tone: "fat", nutritionKey: "fat_g" },
} as const;

export function DietMacrosStep(props: Props) {
  return <MacroEditor key={`${props.plan.id}:${props.targetEnergyKcal}`} {...props} targetEnergyKcal={props.targetEnergyKcal ?? 0} />;
}

function MacroEditor({ plan, targetEnergyKcal, energyReferenceWeightKg, onSave, onDraftChange, onGoToEnergy, onContinue, onSaveAndExit }: Omit<Props, "targetEnergyKcal"> & { targetEnergyKcal: number }) {
  const initial = useMemo(
    () => plan.macro_distribution ?? createMacroDistribution(targetEnergyKcal, energyReferenceWeightKg),
    [energyReferenceWeightKg, plan.macro_distribution, targetEnergyKcal],
  );
  const [draft, setDraft] = useState(initial);
  const planId = useRef(plan.id);
  const autosave = useChangeAutosave({ initialValue: initial, onSave, onDraftChange });
  const saveState = autosave.status;

  useEffect(() => {
    if (planId.current !== plan.id) {
      planId.current = plan.id;
      setDraft(initial);
    }
  }, [initial, plan.id, plan.macro_distribution]);

  const update = (next: MacroDistribution) => {
    setDraft(next);
    autosave.change(next);
  };

  const hasReferenceWeight = draft.reference_weight_kg !== null && draft.reference_weight_kg > 0;
  const hasData = Object.values(draft.macros).some((macro) => macro.input_value !== null);
  const split = dietNutritionSplit({ target_calories: targetEnergyKcal, macro_distribution: draft });
  const barTotal = Math.max(targetEnergyKcal, draft.totals.kcal, 1);
  const differenceLabel = draft.totals.difference_kcal > 0 ? "Por distribuir" : draft.totals.difference_kcal < 0 ? "Por encima del objetivo" : "Diferencia";
  const reset = () => {
    if (hasData && !window.confirm("¿Restablecer la distribución? Se eliminarán únicamente los valores de macronutrientes de este plan.")) return;
    update({ ...createMacroDistribution(targetEnergyKcal, energyReferenceWeightKg), supplements: draft.supplements });
  };

  return (
    <section className="diet-macros-step" aria-labelledby="macros-heading">
      <header className="energy-intro">
        <div>
          <p className="energy-eyebrow">PASO 02 / 06</p>
          <h1 id="macros-heading" aria-label="Kilocalorías y macronutrientes">Macros</h1>
          <p>Distribuye la energía del día y revisa cuánto cubrirán los alimentos y los suplementos.</p>
        </div>
        <span className={`energy-status ${draft.complete ? "is-ready" : "is-pending"}`}>
          {draft.complete ? <Check size={14} /> : <CircleAlert size={14} />}
          {draft.complete ? "Distribución lista" : "Por completar"}
        </span>
      </header>

      <div className="macros-reference-grid">
        <section className="energy-card energy-reference" aria-labelledby="macros-energy-heading">
          <header className="energy-card-heading">
            <span className="energy-icon energy-icon-reference"><Target size={20} /></span>
            <div><h2 id="macros-energy-heading">Energía del día</h2><p>Tu punto de partida</p></div>
            <button type="button" className="macros-text-button" onClick={onGoToEnergy}>Editar <ArrowRight size={14} /></button>
          </header>
          <div className="energy-card-body macros-reference-body">
            <p className="macros-reference-value">{display(targetEnergyKcal || null, 0)} <span>kcal / día</span></p>
            <p className="macros-caption">{targetEnergyKcal > 0 ? "Objetivo guardado en Energía." : "Puedes definir el objetivo en Energía."}</p>
          </div>
        </section>
        <section className="energy-card macros-weight" aria-labelledby="macros-weight-heading">
          <header className="energy-card-heading">
            <span className="energy-icon energy-icon-method"><Scale size={20} /></span>
            <div><h2 id="macros-weight-heading">Peso para g/kg</h2><p>Referencia para esta distribución</p></div>
            {draft.reference_weight_source === "manual" && <button type="button" className="macros-text-button" onClick={() => update(restoreEnergyReferenceWeight(draft, energyReferenceWeightKg))}><RotateCcw size={13} /> Restaurar</button>}
          </header>
          <div className="energy-card-body macros-reference-body">
            <label className="macros-weight-input"><span className="sr-only">Peso de referencia</span>
              <input aria-label="Peso de referencia" inputMode="decimal" type="number" min="0" step="any" value={draft.reference_weight_kg ?? ""} placeholder="—" onChange={(event) => {
                const value = numeric(event.target.value);
                update(value === null && draft.reference_weight_source === "manual"
                  ? restoreEnergyReferenceWeight(draft, energyReferenceWeightKg)
                  : setMacroReferenceWeight(draft, value));
              }} /><span>kg</span>
            </label>
            <p className="macros-caption">{draft.reference_weight_source === "manual" ? "Ajuste de este plan. No modifica al paciente." : draft.reference_weight_source === "energy_calculation" ? "Peso utilizado en Energía. Puedes ajustarlo aquí." : "Registra un peso para utilizar g/kg."}</p>
          </div>
        </section>
      </div>

      <section className="macros-distribution" aria-labelledby="macros-distribution-heading">
        <header className="macros-section-heading">
          <div><p className="energy-eyebrow">01 · DISTRIBUYE</p><h2 id="macros-distribution-heading">Macronutrientes del día</h2><p>Define el total diario, incluido lo que aportarán tus suplementos.</p></div>
          <button type="button" className="macros-secondary" onClick={reset}><RotateCcw size={14} /> Restablecer</button>
        </header>
        <div className="energy-card macros-table-scroll" role="region" aria-label="Tabla de macronutrientes, desplazable horizontalmente" tabIndex={0}>
          <table className="macros-table">
            <caption className="sr-only">Distribución de macronutrientes</caption>
            <colgroup><col className="macro-name-col" /><col className="macro-mode-col" /><col className="macro-value-col" /><col /><col /><col /></colgroup>
            <thead><tr><th scope="col">Macronutriente</th><th scope="col">Modo</th><th scope="col">Valor</th><th scope="col">kcal</th><th scope="col">g</th><th scope="col">g/kg</th></tr></thead>
            <tbody>{macroCatalog.map((entry) => {
              const macro = draft.macros[entry.code];
              const unit = macro.input_mode === "percentage" ? "%" : macro.input_mode === "grams" ? "g" : "g/kg";
              return (
                <tr key={entry.code}>
                  <th scope="row"><span className="macro-table-name"><span aria-hidden="true" className={`macro-segment-${macroPresentation[entry.code].tone}`} />{entry.label}</span></th>
                  <td><select aria-label={`Modo de ${entry.label}`} value={macro.input_mode} onChange={(event) => update(patchMacroInput(draft, entry.code, event.target.value as MacroInputMode, macro.input_value))}>
                    <option value="percentage">%</option><option value="grams">g</option><option value="grams_per_kg" disabled={!hasReferenceWeight}>g/kg</option>
                  </select></td>
                  <td><div className="macro-table-value"><input aria-label={`Valor de ${entry.label}`} inputMode="decimal" type="number" min="0" step="any" placeholder="—" value={macro.input_value ?? ""} onChange={(event) => update(patchMacroInput(draft, entry.code, macro.input_mode, numeric(event.target.value)))} /><span aria-hidden="true">{unit}</span></div></td>
                  <td className="macro-table-kcal">{display(macro.kcal)}</td>
                  <td>{display(macro.grams)}</td>
                  <td>{display(macro.grams_per_kg, 2)}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        {!hasReferenceWeight && <p className="energy-note">Registra un peso de referencia para habilitar el modo g/kg. Esto no modifica los datos del paciente.</p>}
      </section>

      <div className="macros-bottom-grid">
        <SupplementEditor appearance="night" showSummary={false} items={draft.supplements ?? []} daily={split.daily} onChange={supplements => update({ ...draft, supplements, updated_at: new Date().toISOString() })} />
        <section className="energy-card macros-summary" aria-labelledby="macros-summary-heading">
          <header className="energy-card-heading">
            <span className="energy-icon energy-icon-target"><PieChart size={20} /></span>
            <div><h2 id="macros-summary-heading">Así queda tu día</h2><p>03 · Revisa antes de continuar</p></div>
          </header>
          <div className="energy-card-body">
            <div className="macros-assigned"><div><p>Energía asignada</p><strong>{hasData ? display(draft.totals.kcal) : "—"} <span>kcal</span></strong></div><span>{display(draft.totals.percentage)}% del objetivo</span></div>
            <div className="macros-distribution-bar" aria-hidden="true">{macroCatalog.map(entry => <span key={entry.code} className={`macro-segment-${macroPresentation[entry.code].tone}`} style={{ width: `${(draft.macros[entry.code].kcal ?? 0) / barTotal * 100}%` }} />)}</div>
            <ul className="macros-legend">{macroCatalog.map(entry => <li key={entry.code}><span className={`macro-segment-${macroPresentation[entry.code].tone}`} />{entry.label}</li>)}</ul>
            <p className="macros-difference">{differenceLabel}<strong>{display(Math.abs(draft.totals.difference_kcal))} kcal</strong></p>
            <div className="macros-split-wrap">
              <table className="macros-split-table">
                <caption>Distribución de la meta diaria</caption>
                <thead><tr><th scope="col">Aporte</th><th scope="col">Alimentos</th><th scope="col">Suplementos</th></tr></thead>
                <tbody>
                  <tr><th scope="row">Energía</th><td>{display(split.food.energy_kcal)} <span>kcal</span></td><td>{display(split.supplements.energy_kcal)} <span>kcal</span></td></tr>
                  {macroCatalog.map(entry => {
                    const key = macroPresentation[entry.code].nutritionKey;
                    return <tr key={key}><th scope="row">{entry.label}</th><td>{draft.macros[entry.code].grams === null ? "—" : <>{display(split.food[key])} <span>g</span></>}</td><td>{display(split.supplements[key])} <span>g</span></td></tr>;
                  })}
                </tbody>
              </table>
            </div>
            <p className="energy-note">Equivalentes se calcula con el aporte de alimentos. Puedes continuar con diferencias o datos pendientes.</p>
          </div>
        </section>
      </div>

      <footer className="energy-actions macros-actions">
        <button type="button" className="macros-back" onClick={onGoToEnergy}><ArrowLeft size={15} /> Energía</button>
        <div className="energy-actions-summary"><span className="energy-actions-label">Distribución del día</span><strong>{display(draft.totals.percentage)} <span>%</span></strong></div>
        <div className="energy-save-status" role="status">
          {saveState === "saving" ? <LoaderCircle size={14} className="animate-spin" /> : saveState === "error" ? <CircleAlert size={14} /> : <Check size={14} />}
          <span>{saveState === "saving" ? "Guardando…" : saveState === "dirty" ? "Cambios pendientes" : saveState === "error" ? "No se pudo guardar" : saveState === "saved" ? "Guardado" : "Guardado automático"}</span>
        </div>
        {onSaveAndExit && <button type="button" className="energy-save-exit" onClick={onSaveAndExit}><Save size={15} /> Guardar y salir</button>}
        <button type="button" className="energy-continue" disabled={saveState === "saving"} aria-label="Continuar a equivalentes" onClick={onContinue}>Continuar a Equivalentes <ArrowRight size={17} /></button>
      </footer>
    </section>
  );
}
