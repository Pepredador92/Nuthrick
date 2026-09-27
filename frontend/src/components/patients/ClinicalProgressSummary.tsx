import type { LongitudinalSeries } from "@/src/features/evolution/longitudinal";
import { classificationColors, classificationSummary, summarySeries } from "@/src/features/evolution/clinicalSummary";
import { emptyProgressReferences, formatReferenceNumber, weightReference, type ProgressReferenceOptions } from "@/src/features/evolution/progressReferences";
import { numericPoints } from "@/src/features/evolution/exportEvolution";
import { formatPatientDate } from "@/src/features/patients/patientUtils";

export function ClinicalProgressSummary({ series, contextSeries = series, references = emptyProgressReferences }: { series: LongitudinalSeries[]; contextSeries?: LongitudinalSeries[]; references?: ProgressReferenceOptions }) {
  const entries = summarySeries(series);
  if (!entries.length) return null;
  return <section aria-label="Resumen de composición corporal" className="rounded-2xl border border-[#dfe8e3] bg-white p-4 sm:p-5">
    <p className="nuth-eyebrow">Tu evolución</p><h3 className="mt-1 text-lg font-semibold text-[#173d36]">Composición corporal</h3>
    <div className="mt-4 space-y-4">{entries.map((item) => {
      const points = numericPoints(item);
      const latest = points.at(-1);
      if (!latest) return null;
      const classifications = classificationSummary(item, contextSeries, references);
      const classification = classifications.displayed?.classification;
      const classifiedPoint = classifications.displayed?.point;
      const comparison = weightReference(latest, contextSeries, references);
      const weightScale = Math.max(latest.value, comparison.recorded?.value ?? 0, comparison.interval?.upper ?? 0, comparison.target?.value ?? 0, 1);
      return <article key={item.id} className="rounded-xl bg-[#f8faf8] p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h4 className="text-sm font-semibold text-[#173d36]">{item.label}</h4><p className="mt-1 text-xs text-[#60766a]">{formatPatientDate(latest.consultation_date)}</p></div><p className="text-lg font-semibold text-[#173d36]">{item.visualization === "somatochart" ? classifications.current?.classification?.label ?? latest.display_value : `${latest.display_value} ${latest.unit ?? ""}`}</p></div>
        {classifications.current?.reason && <p className="mt-3 text-xs text-[#60766a]">Sin clasificación en esta consulta: {classifications.current.reason}</p>}
        {classifications.isHistorical && classifiedPoint && <p className="mt-4 text-xs font-semibold text-[#60766a]">{classifications.historicalLabel} · {formatPatientDate(classifiedPoint.consultation_date)} · {classifiedPoint.display_value} {classifiedPoint.unit}</p>}
        {item.visualization !== "somatochart" && classification && <p className="mt-2 text-sm font-semibold text-[#315e4f]">{classification.label}</p>}
        {classification && classifiedPoint && classification.rules.length > 0 && <>
          <div className="relative mt-5" role="img" aria-label={`${item.label}: ${classifiedPoint.display_value}; ${classification.label}${classifications.isHistorical ? `; ${classifications.historicalLabel.toLocaleLowerCase("es")} el ${formatPatientDate(classifiedPoint.consultation_date)}` : ""}`}>
            <div className="relative h-5 overflow-hidden rounded-full bg-slate-100">{classification.bands.map((band) => <span key={band.rule.id} className="absolute inset-y-0" style={{ background: band.color, left: `${band.left}%`, width: `${band.width}%` }} />)}</div>
            <span className="absolute -top-1 h-7 w-1 rounded bg-[#173d36] ring-2 ring-white" style={{ left: `${classification.marker}%` }} />
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-[#536a5e]">{classification.rules.map((rule, index) => <li key={rule.id} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: classificationColors[index % classificationColors.length] }} />{rule.label}</li>)}</ul>
        </>}
        {classification && <p className="mt-3 text-[11px] text-[#60766a]">{classification.origin} · {classification.source}</p>}
        {item.conceptCode === "weight" && <div className="mt-4 space-y-3">
          {comparison.interval && <div><p className="mb-2 text-xs text-[#536a5e]">Intervalo por IMC adulto: {formatReferenceNumber(comparison.interval.lower)} a menos de {formatReferenceNumber(comparison.interval.upper)} kg</p><div className="relative h-5 rounded-full bg-[#e9eeea]"><span className="absolute inset-y-0 rounded-full bg-[#b8ded0]" style={{ left: `${100 * comparison.interval.lower / weightScale}%`, width: `${100 * (comparison.interval.upper - comparison.interval.lower) / weightScale}%` }}/><span className="absolute -top-1 h-7 w-1 rounded bg-[#173d36]" style={{ left: `${100 * latest.value / weightScale}%` }}/></div><p className="mt-2 text-[11px] text-[#60766a]">Talla registrada: {comparison.interval.heightCm} cm · IMC 18.5 a &lt;25 · OMS</p></div>}
          {[...(comparison.recorded ? [{ label: "Peso de referencia registrado", value: comparison.recorded.value, color: "#abcac3" }] : []), ...(comparison.target ? [{ label: `Objetivo elegido · IMC ${comparison.target.bmi}`, value: comparison.target.value, color: "#627fb6" }] : []), { label: "Peso actual", value: latest.value, color: "#315e4f" }].map((bar) => <div key={bar.label}><p className="mb-1 text-xs text-[#536a5e]">{bar.label}: {formatReferenceNumber(bar.value)} kg</p><div className="h-3 rounded-full" style={{ width: `${100 * bar.value / weightScale}%`, background: bar.color }} /></div>)}
          {comparison.recorded?.method && <p className="text-[11px] text-[#60766a]">Método registrado: {comparison.recorded.method}</p>}
          {!comparison.interval && <p className="text-[11px] text-[#60766a]">El intervalo necesita talla, edad adulta y contexto sin gestación de esta consulta.</p>}
        </div>}
        <details className="mt-3 text-xs text-[#536a5e]"><summary className="cursor-pointer font-semibold">Historial · {points.length} consultas</summary><ul className="mt-2 space-y-2">{classifications.history.map(({ point, classification: saved, reason }) => <li key={point.consultation_id}>{formatPatientDate(point.consultation_date)} · {point.display_value} {point.unit}{saved ? ` · ${saved.label}` : reason ? ` · Sin clasificación: ${reason}` : ""}</li>)}</ul></details>
      </article>;
    })}</div>
  </section>;
}
