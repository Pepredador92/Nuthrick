import type { SharedResult } from "@/src/services/patientPortal";
import { classificationColors } from "@/src/features/evolution/clinicalSummary";
import { formatReferenceNumber } from "@/src/features/evolution/progressReferences";
import { formatPatientDate } from "@/src/features/patients/patientUtils";
import { portalProgress } from "@/src/features/patients/portalProgress";

function safeDate(value: string) {
  return formatPatientDate(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00` : value);
}

function classificationBands(classification: NonNullable<SharedResult["presentation"]>["classification"]) {
  if (!classification || classification.high <= classification.low) return [];
  return classification.rules.flatMap((rule) => {
    const lower = Math.max(classification.low, rule.lower ?? classification.low);
    const upper = Math.min(classification.high, rule.upper ?? classification.high);
    return upper > lower
      ? [{ ...rule, left: 100 * (lower - classification.low) / (classification.high - classification.low), width: 100 * (upper - lower) / (classification.high - classification.low) }]
      : [];
  });
}

export function PortalProgressCard({ result, compact = false, showSource = false }: { result: SharedResult; compact?: boolean; showSource?: boolean }) {
  const progress = portalProgress(result);
  const points = progress.numeric;
  const latest = points.at(-1);
  if (!latest) {
    return <article className="rounded-xl bg-[#f8faf8] p-4"><h4 className="text-sm font-semibold text-[#173d36]">{result.label}</h4><p className="mt-3 text-xs text-[#60766a]">Aún no hay un valor numérico disponible.</p></article>;
  }
  const presentation = result.presentation;
  const classification = presentation?.classification;
  const classifiedPoint = classification ? progress.points.find((point) => point.consultationId === classification.consultationId) : undefined;
  const historical = Boolean(classification && classifiedPoint && classifiedPoint.consultationId !== latest.consultationId);
  const bands = classificationBands(classification);
  const reference = result.conceptCode === "weight" ? presentation?.weightReference : undefined;
  const weightScale = Math.max(latest.number, reference?.recorded?.value ?? 0, reference?.interval?.upper ?? 0, reference?.target?.value ?? 0, 1);
  const historyPoints = progress.points.filter((point) => point.date || point.value);
  return (
    <article className="rounded-xl bg-[#f8faf8] p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div><h4 className="text-sm font-semibold text-[#173d36]">{result.label}</h4><p className="mt-1 text-xs text-[#60766a]">{safeDate(latest.date)}</p></div>
        <p className="text-lg font-semibold text-[#173d36]">{latest.value} {result.unit}</p>
      </div>
      {presentation?.currentReason && <p className="mt-3 text-xs text-[#60766a]">Sin clasificación en esta consulta: {presentation.currentReason}</p>}
      {historical && classifiedPoint && <p className="mt-4 text-xs font-semibold text-[#60766a]">Última clasificación registrada · {safeDate(classifiedPoint.date)} · {classifiedPoint.value} {result.unit}</p>}
      {classification && <p className="mt-2 text-sm font-semibold text-[#315e4f]">{classification.label}</p>}
      {classification && bands.length > 0 && <>
        <div className="relative mt-5" role="img" aria-label={`${result.label}: ${classifiedPoint?.value ?? latest.value}; ${classification.label}${historical ? `; última clasificación registrada el ${safeDate(classifiedPoint!.date)}` : ""}`}>
          <div className="relative h-5 overflow-hidden rounded-full bg-slate-100">{bands.map((band) => <span key={band.id} className="absolute inset-y-0" style={{ background: classificationColors[classification.rules.findIndex((rule) => rule.id === band.id) % classificationColors.length], left: `${band.left}%`, width: `${band.width}%` }} />)}</div>
          <span className="absolute -top-1 h-7 w-1 rounded bg-[#173d36] ring-2 ring-white" style={{ left: `${classification.marker}%` }} />
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-[#536a5e]">{classification.rules.map((rule, index) => <li key={rule.id} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: classificationColors[index % classificationColors.length] }} />{rule.label}</li>)}</ul>
      </>}
      {showSource && classification && <p className="mt-3 text-[11px] text-[#60766a]">{classification.origin} · {classification.source}</p>}
      {reference && <div className="mt-4 space-y-3">
        {reference.interval && <div><p className="mb-2 text-xs text-[#536a5e]">Intervalo por IMC adulto: {formatReferenceNumber(reference.interval.lower)} a menos de {formatReferenceNumber(reference.interval.upper)} kg</p><div className="relative h-5 rounded-full bg-[#e9eeea]"><span className="absolute inset-y-0 rounded-full bg-[#b8ded0]" style={{ left: `${100 * reference.interval.lower / weightScale}%`, width: `${100 * (reference.interval.upper - reference.interval.lower) / weightScale}%` }} /><span className="absolute -top-1 h-7 w-1 rounded bg-[#173d36]" style={{ left: `${100 * latest.number / weightScale}%` }} /></div><p className="mt-2 text-[11px] text-[#60766a]">Talla registrada: {formatReferenceNumber(reference.interval.heightCm)} cm · IMC 18.5 a &lt;25{showSource ? " · OMS" : ""}</p></div>}
        {[...(reference.recorded ? [{ label: "Peso de referencia registrado", value: reference.recorded.value, color: "#abcac3" }] : []), ...(reference.target ? [{ label: `Objetivo elegido · IMC ${reference.target.bmi}`, value: reference.target.value, color: "#627fb6" }] : []), { label: "Peso actual", value: latest.number, color: "#315e4f" }].map((bar) => <div key={bar.label}><p className="mb-1 text-xs text-[#536a5e]">{bar.label}: {formatReferenceNumber(bar.value)} kg</p><div className="h-3 rounded-full" style={{ width: `${100 * bar.value / weightScale}%`, background: bar.color }} /></div>)}
        {showSource && reference.recorded?.method && <p className="text-[11px] text-[#60766a]">Método registrado: {reference.recorded.method}</p>}
      </div>}
      {!compact && <details className="mt-3 text-xs text-[#536a5e]"><summary className="cursor-pointer font-semibold">Historial · {historyPoints.length} consultas</summary><ul className="mt-2 space-y-2">{historyPoints.map((point) => <li key={point.key}>{safeDate(point.date)} · {point.value} {result.unit}{point.classificationLabel ? ` · ${point.classificationLabel}` : ""}</li>)}</ul></details>}
    </article>
  );
}

export function PortalClinicalProgressSummary({ results, showSource = false }: { results: SharedResult[]; showSource?: boolean }) {
  if (!results.length) return null;
  return <section aria-label="Resumen de composición corporal" className="rounded-2xl border border-[#dfe8e3] bg-white p-4 sm:p-5"><p className="nuth-eyebrow">Tu evolución</p><h3 className="mt-1 text-lg font-semibold text-[#173d36]">Composición corporal</h3><div className="mt-4 space-y-4">{results.map((result) => <PortalProgressCard key={result.id} result={result} showSource={showSource} />)}</div></section>;
}
