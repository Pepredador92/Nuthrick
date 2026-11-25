import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import {
  formatSupplementDirections, isSupplementList, nutritionKeys, supplementServings,
  type SupplementItem, type SupplementProduct,
} from "../../../../supabase/functions/_shared/supplements";
import {
  advertisedStrength, labeledPreparation, referenceWarning, type SupplementReference, type SupplementSuggestion,
} from "@/src/features/supplements/catalog";

export type SupplementSelection = {
  id: string;
  label?: SupplementProduct;
  reference?: SupplementReference;
  item?: SupplementItem;
  equivalent?: SupplementItem;
  suggestion?: SupplementSuggestion;
};

export function supplementNumber(value: string) {
  const text = value.trim();
  return /^\d+(?:[.,]\d+)?$/.test(text) ? Number(text.replace(",", ".")) : NaN;
}

const nutritionFields = {
  energy_kcal: "Energía (kcal)",
  carbohydrate_g: "Carbohidratos (g)",
  protein_g: "Proteína (g)",
  fat_g: "Grasas (g)",
};

export function SupplementSource({ url, children }: { url?: string | null; children: string }) {
  return url?.startsWith("https://") ? <a href={url} target="_blank" rel="noreferrer">{children}</a> : null;
}

export function SupplementPlanItem({ selection, onBack, onApply }: {
  selection: SupplementSelection;
  onBack: () => void;
  onApply: (item: SupplementItem) => void;
}) {
  const { item, reference, suggestion, equivalent } = selection;
  const preparation = labeledPreparation(reference);
  const [copyLabel, setCopyLabel] = useState(false);
  const base = item ?? (copyLabel ? equivalent : undefined);
  const confirmedLabel = base?.product ?? selection.label;
  const [quantity, setQuantity] = useState(item ? String(item.quantity) : "");
  const [unit, setUnit] = useState<SupplementItem["unit"]>(item?.unit ?? "serving");
  const [serving, setServing] = useState("");
  const [nutrition, setNutrition] = useState<Record<string, string>>({});
  const [folate, setFolate] = useState("");
  const [when, setWhen] = useState(item?.directions?.schedule ?? "");
  const [duration, setDuration] = useState(item?.directions?.duration ?? "");
  const [instructions, setInstructions] = useState(item?.directions?.notes ?? item?.instructions ?? preparation?.text ?? "");
  const [error, setError] = useState("");

  const hasFreeTextInstructions = !!base && !base.directions;
  const needsFolateVerification = reference?.id === "SUP-073" && !confirmedLabel;
  const changeUnit = (next: SupplementItem["unit"]) => {
    const value = supplementNumber(quantity);
    if (confirmedLabel && Number.isFinite(value)) {
      const servings = supplementServings({ id: selection.id, product: confirmedLabel, quantity: value, unit, instructions });
      setQuantity(String(Number((servings * (next === "g" ? confirmedLabel.serving_grams! : next === "scoop" ? confirmedLabel.scoops_per_serving! : 1)).toFixed(6))));
    }
    setUnit(next);
  };
  const name = reference?.name ?? confirmedLabel?.name ?? "";
  const customNutrition = Object.fromEntries(nutritionKeys.map(key => [key, supplementNumber(nutrition[key] ?? "")])) as Pick<SupplementProduct, typeof nutritionKeys[number]>;
  const presentation = reference ? [advertisedStrength(reference), reference.presentation].filter(Boolean).join(" · ") : confirmedLabel?.presentation ?? "";
  const product = reference ? {
    ...(confirmedLabel ?? customNutrition),
    id: reference.id,
    name,
    brand: confirmedLabel?.brand ?? "",
    presentation,
    serving_label: confirmedLabel?.serving_label ?? serving.trim(),
    serving_grams: confirmedLabel?.serving_grams ?? null,
    scoops_per_serving: confirmedLabel?.scoops_per_serving ?? null,
    source_url: reference.source || null,
    label_url: null,
    verified_at: null,
  } : confirmedLabel;
  const quantityValue = supplementNumber(quantity);
  const candidate = product ? { id: selection.id, product, quantity: quantityValue, unit, instructions: "" } : null;
  const directions = !hasFreeTextInstructions && when.trim() && duration.trim()
    ? { schedule: when.trim(), duration: duration.trim(), notes: instructions.trim() }
    : undefined;
  const preview = candidate && directions && Number.isFinite(quantityValue) && quantityValue > 0 && product?.serving_label
    ? formatSupplementDirections(candidate, directions) : "";

  return <form className="supplement-plan-form" onSubmit={event => {
    event.preventDefault();
    if (needsFolateVerification && supplementNumber(folate) !== 400) {
      setError("Confirma en el envase que esta presentación contiene 400 µg por tableta. Si indica otra concentración, cambia la presentación.");
      return;
    }
    const patientInstructions = hasFreeTextInstructions ? instructions.trim() : preview;
    const next = candidate ? { ...candidate, instructions: patientInstructions, ...(directions && { directions }) } : null;
    if (!next || !isSupplementList([next])) {
      setError("Revisa la porción, el aporte de etiqueta y la cantidad diaria.");
      return;
    }
    if (!hasFreeTextInstructions && !patientInstructions) {
      setError("Completa el horario y la duración de la indicación.");
      return;
    }
    if (copyLabel && !patientInstructions) {
      setError("Confirma las indicaciones para esta presentación.");
      return;
    }
    onApply(next);
  }}>
    <button type="button" className="supplement-plan-link" onClick={onBack}><ArrowLeft size={16}/> Volver a la selección</button>
    <div>
      <h3>{name}</h3>
      <p>{[reference?.ingredient, presentation].filter(Boolean).join(" · ")}</p>
    </div>
    {suggestion?.source && <div className="supplement-plan-note">
      <p>{suggestion.note}</p>
      <SupplementSource url={suggestion.source}>Ver guía clínica</SupplementSource>
    </div>}
    {reference && <details className="supplement-plan-reference">
      <summary>Consultar etiqueta y referencia clínica</summary>
      <p>{reference.type} · {reference.verification}</p>
      <p>{reference.composition}</p>
      <p>{reference.intakeReference}</p>
      <p>{reference.precautions}</p>
      <p>{reference.interactions}</p>
      <div className="flex flex-wrap gap-3">
        <SupplementSource url={reference.source}>Ficha comercial</SupplementSource>
        <SupplementSource url={reference.clinicalSource}>Referencia del ingrediente</SupplementSource>
        <SupplementSource url={preparation?.source}>Preparación del fabricante</SupplementSource>
      </div>
    </details>}
    {equivalent && <label className="supplement-plan-check">
      <input type="checkbox" checked={copyLabel} onChange={event => {
        const checked = event.target.checked;
        setCopyLabel(checked);
        setUnit(checked ? equivalent.unit : "serving");
        setQuantity(checked ? String(equivalent.quantity) : "");
        setWhen(checked ? equivalent.directions?.schedule ?? "" : "");
        setDuration(checked ? equivalent.directions?.duration ?? "" : "");
        setInstructions(checked ? equivalent.directions?.notes ?? equivalent.instructions : preparation?.text ?? "");
      }}/>
      Cotejé que la fórmula, concentración y porción son iguales. Conservar la indicación.
    </label>}
    {reference && !confirmedLabel && <fieldset className="supplement-plan-fieldset">
      <legend>Porción y aporte de etiqueta</legend>
      <p>{referenceWarning(reference)}</p>
      <label>Descripción de una porción<input required className="nuth-input" maxLength={180} placeholder="Ej. 1 tableta o 1 medida de 30 g" value={serving} onChange={event => setServing(event.target.value)}/></label>
      <button type="button" className="supplement-plan-link" onClick={() => setNutrition(Object.fromEntries(nutritionKeys.map(key => [key, "0"])))}>
        Confirmé que la porción no aporta energía ni macros
      </button>
      <div className="supplement-plan-grid">
        {nutritionKeys.map(key => <label key={key}>{nutritionFields[key]}
          <input required className="nuth-input" inputMode="decimal" value={nutrition[key] ?? ""} onChange={event => setNutrition({ ...nutrition, [key]: event.target.value })}/>
        </label>)}
      </div>
    </fieldset>}
    {(needsFolateVerification || suggestion?.folateMicrograms && reference?.group === "FOL" && !item && !copyLabel) && <div className="supplement-plan-note supplement-plan-folate">
      <label>Ácido fólico confirmado por tableta (µg)
        <input className="nuth-input" required={needsFolateVerification} inputMode="decimal" value={folate} onChange={event => setFolate(event.target.value)}/>
      </label>
      {suggestion?.folateMicrograms && <button type="button" className="nuth-button-secondary" disabled={supplementNumber(folate) !== suggestion.folateMicrograms} onClick={() => { setQuantity("1"); setUnit("serving"); setServing("1 tableta"); }}>
        Usar 1 tableta al día como propuesta
      </button>}
    </div>}
    <div className="supplement-plan-grid">
      <label>Cantidad diaria
        <input aria-label={`Cantidad diaria de ${name}`} required className="nuth-input" inputMode="decimal" value={quantity} onChange={event => setQuantity(event.target.value)}/>
      </label>
      <label>Unidad
        <select aria-label={`Unidad de ${name}`} className="nuth-input" value={unit} onChange={event => changeUnit(event.target.value as SupplementItem["unit"])}>
          <option value="serving">Porciones de etiqueta</option>
          {confirmedLabel?.scoops_per_serving && <option value="scoop">Medidas del producto (scoops)</option>}
          {confirmedLabel?.serving_grams && <option value="g">Gramos</option>}
        </select>
      </label>
    </div>
    {confirmedLabel && <p className="text-sm">Porción de etiqueta · {confirmedLabel.serving_label} <SupplementSource url={confirmedLabel.label_url}>Ver etiqueta</SupplementSource></p>}
    {!hasFreeTextInstructions && <div className="supplement-plan-grid">
      <label>Horario y reparto de las tomas<input required className="nuth-input" maxLength={230} placeholder="Ej. Con el desayuno" value={when} onChange={event => setWhen(event.target.value)}/></label>
      <label>Duración o fecha de revisión<input required className="nuth-input" maxLength={230} placeholder="Ej. Hasta la próxima consulta" value={duration} onChange={event => setDuration(event.target.value)}/></label>
    </div>}
    <label>{hasFreeTextInstructions ? "Indicaciones para el paciente" : "Indicaciones adicionales (opcional)"}
      <textarea aria-label={`Indicaciones de ${name}`} className="nuth-input min-h-20" maxLength={hasFreeTextInstructions ? 1500 : 600} value={instructions} onChange={event => setInstructions(event.target.value)}/>
    </label>
    {preview && <div className="supplement-plan-note">
      <h4>Lo que leerá el paciente</h4>
      <p className="whitespace-pre-line">{preview}</p>
    </div>}
    {error && <p role="alert">{error}</p>}
    <div><button type="submit" className="nuth-button">Confirmar indicación</button></div>
  </form>;
}
