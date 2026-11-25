import { useState } from "react";
import { saveCustomSupplement, type SupplementInput } from "@/src/services/supplements";
import type { SupplementCatalogItem } from "../../../../supabase/functions/_shared/supplements";
import { supplementNumber } from "./SupplementPlanItem";

const fieldGroups = [
  { tone: "blue", title: "Datos del producto", fields: [
    { key: "name", label: "Nombre", required: true, text: true, max: 180, wide: true },
    { key: "brand", label: "Marca", text: true, max: 120 },
    { key: "presentation", label: "Presentación / sabor", text: true, max: 120 },
  ] },
  { tone: "mint", title: "Porción de etiqueta", fields: [
    { key: "serving_label", label: "Descripción de una porción", required: true, text: true, max: 180, wide: true },
    { key: "serving_grams", label: "Gramos por porción (opcional)" },
    { key: "scoops_per_serving", label: "Scoops por porción (opcional)" },
  ] },
  { tone: "violet", title: "Aporte por porción", hint: "Usa cero cuando la etiqueta indique que no hay aporte.", fields: [
    { key: "energy_kcal", label: "Energía por porción (kcal)", required: true },
    { key: "carbohydrate_g", label: "Carbohidratos por porción (g)", required: true },
    { key: "protein_g", label: "Proteína por porción (g)", required: true },
    { key: "fat_g", label: "Grasas por porción (g)", required: true },
  ] },
] as const;
type Field = typeof fieldGroups[number]["fields"][number];
const fields = fieldGroups.flatMap<Field>(group => group.fields);

export function ManualSupplementForm({ product, onCancel, onSaved }: {
  product: SupplementCatalogItem | null;
  onCancel: () => void;
  onSaved: (product: SupplementCatalogItem) => void;
}) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  return <form className="supplement-plan-form" onSubmit={async event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = Object.fromEntries(fields.map(field => {
      const value = String(data.get(field.key) ?? "").trim();
      return [field.key, "text" in field ? value : value === "" ? null : supplementNumber(value)];
    })) as SupplementInput;
    setSaving(true);
    setError("");
    try { onSaved(await saveCustomSupplement(payload, product?.id)); }
    catch (error) { setError((error as Error).message); }
    finally { setSaving(false); }
  }}>
    <div className="supplement-plan-product">
      <h3>{product ? "Editar ficha" : "Nuevo suplemento"}</h3>
      <p>Guarda los datos de la etiqueta en tu biblioteca para usarlos en tus planes.</p>
    </div>
    <div className="supplement-plan-manual-grid">
      {fieldGroups.map(group => <section key={group.tone} className="supplement-plan-panel" data-tone={group.tone} aria-labelledby={`supplement-manual-${group.tone}`}>
        <h4 id={`supplement-manual-${group.tone}`}>{group.title}</h4>
        {"hint" in group && <p>{group.hint}</p>}
        <div className="supplement-plan-grid">
          {group.fields.map(field => <label key={field.key} className={"wide" in field ? "supplement-plan-wide-field" : undefined}>
            {field.label}<input name={field.key} className="nuth-input"
              required={"required" in field && field.required} inputMode={"text" in field ? "text" : "decimal"}
              defaultValue={product?.[field.key] ?? ""} maxLength={"max" in field ? field.max : undefined}/>
          </label>)}
        </div>
      </section>)}
    </div>
    <div className="supplement-plan-form-actions">
      {error && <p role="alert" className="supplement-plan-error">{error}</p>}
      <button type="button" disabled={saving} className="nuth-button-secondary" onClick={onCancel}>Cancelar</button>
      <button type="submit" disabled={saving} className="nuth-button">{saving ? "Guardando…" : "Guardar en mi biblioteca"}</button>
    </div>
  </form>;
}
