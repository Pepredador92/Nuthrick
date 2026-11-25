import { useState } from "react";
import { saveCustomSupplement, type SupplementInput } from "@/src/services/supplements";
import type { SupplementCatalogItem } from "../../../../supabase/functions/_shared/supplements";
import { supplementNumber } from "./SupplementPlanItem";

const fields = [
  { key: "name", label: "Nombre", required: true, text: true, max: 180 },
  { key: "brand", label: "Marca", text: true, max: 120 },
  { key: "presentation", label: "Presentación / sabor", text: true, max: 120 },
  { key: "serving_label", label: "Descripción de una porción", required: true, text: true, max: 180 },
  { key: "serving_grams", label: "Gramos por porción (opcional)" },
  { key: "scoops_per_serving", label: "Scoops por porción (opcional)" },
  { key: "energy_kcal", label: "Energía por porción (kcal)", required: true },
  { key: "protein_g", label: "Proteína por porción (g)", required: true },
  { key: "carbohydrate_g", label: "Carbohidratos por porción (g)", required: true },
  { key: "fat_g", label: "Grasas por porción (g)", required: true },
] as const;

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
    <div>
      <h3>{product ? "Editar ficha" : "Nuevo suplemento"}</h3>
      <p>Transcribe los datos de la etiqueta por porción. Usa cero cuando el aporte sea cero.</p>
    </div>
    <div className="supplement-plan-grid">
      {fields.map(field => <label key={field.key}>{field.label}<input name={field.key} className="nuth-input"
        required={"required" in field && field.required} inputMode={"text" in field ? "text" : "decimal"}
        defaultValue={product?.[field.key] ?? ""} maxLength={"max" in field ? field.max : undefined}/></label>)}
    </div>
    {error && <p role="alert">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <button type="submit" disabled={saving} className="nuth-button">{saving ? "Guardando…" : "Guardar en mi biblioteca"}</button>
      <button type="button" disabled={saving} className="nuth-button-secondary" onClick={onCancel}>Cancelar</button>
    </div>
  </form>;
}
