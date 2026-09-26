import { useState } from "react";
import type { LongitudinalSeries } from "@/src/features/evolution/longitudinal";
import { isBodyFatSeries, type ProgressReferenceOptions } from "@/src/features/evolution/progressReferences";
import { parseMeasurementNumber } from "@/src/features/calculations/measurementNumber";

export function ProgressReferenceControls({ series, value, onChange }: { series: LongitudinalSeries[]; value: ProgressReferenceOptions; onChange: (value: ProgressReferenceOptions) => void }) {
  const [draft, setDraft] = useState({ model: value.targetBmi, text: value.targetBmi?.toString() ?? "" });
  const target = draft.model === value.targetBmi ? draft.text : value.targetBmi?.toString() ?? "";
  const parsed = parseMeasurementNumber(target, { min_value: 1, max_value: 100 });
  const fatSeries = series.filter(isBodyFatSeries);
  return <details className="rounded-2xl border border-[#dfe8e3] bg-[#f8faf8] p-4">
    <summary className="cursor-pointer text-sm font-semibold text-[#315e4f]">Referencias para esta comparación y el PDF</summary>
    <p className="mt-3 text-xs leading-5 text-[#60766a]">Estas opciones se mantienen mientras trabajas en esta ficha y se incluyen en el informe exportado. Las clasificaciones registradas en consultas anteriores se conservan.</p>
    {series.some((item) => item.conceptCode === "weight") && <div className="mt-4">
      <label className="block text-sm font-medium text-[#315e4f]">IMC objetivo individual (opcional)<input className="nuth-input mt-1 max-w-40" inputMode="decimal" value={target} aria-invalid={Boolean(parsed.error)} placeholder="Sin objetivo" onChange={(event) => {
        const result = parseMeasurementNumber(event.target.value, { min_value: 1, max_value: 100 });
        const model = result.error ? null : result.value ?? null;
        setDraft({ model, text: event.target.value });
        onChange({ ...value, targetBmi: model });
      }} onBlur={() => { if (!parsed.error && parsed.value !== undefined) setDraft({ model: value.targetBmi, text: String(parsed.value) }); }} /></label>
      {parsed.error && <p role="alert" className="mt-1 text-xs text-red-700">{parsed.error}</p>}
      <p className="mt-2 text-xs text-[#60766a]">El intervalo por IMC adulto utiliza la talla y el contexto de cada consulta. El objetivo es una referencia elegida por ti, independiente del intervalo general.</p>
    </div>}
    {fatSeries.length > 0 && <fieldset className="mt-4 space-y-3"><legend className="text-sm font-semibold text-[#315e4f]">Grasa corporal · Gallagher (2000), tabla 4</legend>
      <p className="text-xs leading-5 text-[#60766a]">Referencia orientativa para 20–79 años e IMC hasta 35. Muestra blanca y afroamericana, modelo de cuatro compartimentos. Al seleccionar una serie confirmas que revisaste población, método y todas las consultas incluidas: sin gestación, enfermedad, cambios recientes de peso ni entrenamiento vigoroso. La comparación no valida el equipo o la fórmula utilizada.</p>
      {fatSeries.map((item) => <label key={item.id} className="flex items-start gap-2 text-sm text-[#315e4f]"><input className="mt-1" type="checkbox" checked={value.gallagherSeriesIds.includes(item.id)} onChange={(event) => onChange({ ...value, gallagherSeriesIds: event.target.checked ? [...value.gallagherSeriesIds, item.id] : value.gallagherSeriesIds.filter((id) => id !== item.id) })}/><span>Aplicar Gallagher a {item.label}</span></label>)}
      <a href="https://doi.org/10.1093/ajcn/72.3.694" target="_blank" rel="noreferrer" className="inline-block text-xs underline text-[#315e4f]">Consultar referencia y limitaciones</a>
    </fieldset>}
  </details>;
}
