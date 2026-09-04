import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock3,
  Plus,
} from "lucide-react";
import {
  calculationCategoryNames,
  calculationCategoryOrder,
} from "@/src/features/calculations/catalog";
import type {
  CalculationEvaluation,
  ResolvedCalculationInput,
} from "@/src/features/calculations/engine";

function inputValue(input: ResolvedCalculationInput) {
  if (!input.available) return "Falta";
  if (input.value === "male") return "Masculino";
  if (input.value === "female") return "Femenino";
  if (typeof input.value === "boolean") return input.value ? "Sí" : "No";
  return `${input.value}${input.unit ? ` ${input.unit}` : ""}`;
}

function sourceLabel(source: ResolvedCalculationInput["source"]) {
  if (source === "consultation_measurement") return "Medición de hoy";
  if (source === "patient_record") return "Expediente";
  if (source === "patient_derived") return "Derivado del expediente";
  return "Otro cálculo";
}

function statePresentation(evaluation: CalculationEvaluation) {
  if (evaluation.state === "calculated")
    return { icon: CheckCircle2, label: "Calculado", className: "border-[#9fc8aa] bg-[#eef8f0] text-[#285647]" };
  if (evaluation.state === "not_implemented")
    return { icon: Clock3, label: "Pendiente de implementación", className: "border-[#e3d4b5] bg-[#fff9eb] text-[#775527]" };
  if (evaluation.state === "partial")
    return { icon: AlertCircle, label: "Parcialmente alimentada", className: "border-[#d8c49b] bg-[#fffaf0] text-[#775527]" };
  return { icon: Circle, label: "Sin información suficiente", className: "border-[#dfe5e1] bg-white text-[#66766f]" };
}

function CalculationCard({
  evaluation,
  expanded,
  adding,
  onToggle,
  onAddMissing,
}: {
  evaluation: CalculationEvaluation;
  expanded: boolean;
  adding: boolean;
  onToggle: () => void;
  onAddMissing: (ids: string[]) => void;
}) {
  const presentation = statePresentation(evaluation);
  const StateIcon = presentation.icon;
  return (
    <article className={`rounded-2xl border p-4 ${presentation.className}`}>
      <button type="button" className="flex w-full min-w-0 items-start gap-3 text-left" onClick={onToggle} aria-expanded={expanded}>
        <StateIcon size={19} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[#173d36]">{evaluation.item.definition.methodName}</span>
          <span className="mt-1 block text-xs leading-5 text-[#6c7b74]">{evaluation.item.definition.resultName}</span>
        </span>
        {expanded ? <ChevronDown size={17} className="shrink-0" /> : <ChevronRight size={17} className="shrink-0" />}
      </button>
      <div className="mt-3 pl-8">
        <p className="text-xs font-semibold">{presentation.label}</p>
        {evaluation.state === "calculated" && (
          <p className="mt-2 text-2xl font-semibold text-[#173d36]">
            {evaluation.displayedResult} <span className="text-sm font-medium text-[#52705f]">{evaluation.item.definition.unit}</span>
          </p>
        )}
        {evaluation.state !== "calculated" && evaluation.state !== "not_implemented" && (
          <p className="mt-2 text-xs leading-5">
            {evaluation.availableCount} de {evaluation.requiredCount} datos disponibles
            {evaluation.missingLabels.length ? ` · Faltan: ${evaluation.missingLabels.join(", ")}` : ""}
          </p>
        )}
        {evaluation.missingMeasurementIdsOutsideWorkspace.length > 0 && (
          <button type="button" className="nuth-button-secondary mt-3 !px-3 !py-2 !text-xs" disabled={adding} onClick={() => onAddMissing(evaluation.missingMeasurementIdsOutsideWorkspace)}>
            <Plus size={14} /> {evaluation.state === "not_implemented" ? "Agregar mediciones del método a mi espacio" : "Agregar faltantes a mi espacio"}
          </button>
        )}
      </div>
      {expanded && (
        <div className="mt-4 border-t border-current/15 pt-4">
          <p className="text-sm leading-6 text-[#536860]">{evaluation.item.definition.summary}</p>
          {evaluation.inputs.length > 0 && (
            <div className="mt-4">
              <h5 className="text-xs font-bold uppercase tracking-wide text-[#52705f]">Datos utilizados o requeridos</h5>
              <ul className="mt-2 space-y-2">
                {evaluation.inputs.map((input) => (
                  <li key={input.key} className="flex min-w-0 items-start justify-between gap-3 rounded-xl bg-white/70 px-3 py-2.5 text-xs">
                    <span className="min-w-0"><span className="block font-semibold text-[#173d36]">{input.available ? "✓" : "○"} {input.label}</span><span className="mt-0.5 block text-[#718176]">{sourceLabel(input.source)}</span></span>
                    <span className="shrink-0 font-semibold text-[#3f5e53]">{inputValue(input)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {evaluation.dependencyLabels.length > 0 && (
            <p className="mt-3 text-xs leading-5 text-[#60766a]">Depende de: {evaluation.dependencyLabels.join(", ")}</p>
          )}
          <p className="mt-3 text-xs leading-5 text-[#718176]">Método {evaluation.item.method_version}. {evaluation.item.definition.limitations}</p>
        </div>
      )}
    </article>
  );
}

export function CalculationCatalog({
  evaluations,
  adding,
  onAddMissing,
}: {
  evaluations: CalculationEvaluation[];
  adding: boolean;
  onAddMissing: (ids: string[]) => void;
}) {
  const categories = calculationCategoryOrder.filter((category) => evaluations.some((item) => item.item.category === category));
  const [openCategories, setOpenCategories] = useState<Set<string>>(() => new Set(categories.slice(0, 1)));
  const [expandedCalculations, setExpandedCalculations] = useState<Set<string>>(new Set());
  const toggleSet = (current: Set<string>, key: string) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  };

  return (
    <section className="mt-8 border-t border-[#dfe5e1] pt-7" aria-labelledby="calculation-catalog-title">
      <p className="nuth-eyebrow">Disponibilidad automática</p>
      <h3 id="calculation-catalog-title" className="mt-1 text-xl font-semibold text-[#173d36]">Cálculos</h3>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[#718176]">Explora los métodos disponibles y los datos que necesita cada uno. Los resultados se actualizan mientras capturas; no es necesario pulsar “Calcular”.</p>
      <div className="mt-5 space-y-3">
        {categories.map((category) => {
          const items = evaluations.filter((evaluation) => evaluation.item.category === category);
          const calculated = items.filter((evaluation) => evaluation.state === "calculated").length;
          const open = openCategories.has(category);
          return (
            <section key={category} className="overflow-hidden rounded-2xl border border-[#dfe5e1] bg-[#f8fbf8]">
              <button type="button" className="flex w-full items-center gap-3 px-4 py-4 text-left" aria-expanded={open} onClick={() => setOpenCategories((current) => toggleSet(current, category))}>
                {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                <span className="min-w-0 flex-1 text-sm font-semibold text-[#173d36]">{calculationCategoryNames[category] ?? category}</span>
                <span className="shrink-0 text-xs font-semibold text-[#60766a]">{calculated} de {items.length} calculados</span>
              </button>
              {open && <div className="grid gap-3 border-t border-[#dfe5e1] p-3 lg:grid-cols-2">{items.map((evaluation) => <CalculationCard key={evaluation.item.code} evaluation={evaluation} expanded={expandedCalculations.has(evaluation.item.code)} adding={adding} onToggle={() => setExpandedCalculations((current) => toggleSet(current, evaluation.item.code))} onAddMissing={onAddMissing} />)}</div>}
            </section>
          );
        })}
      </div>
    </section>
  );
}
