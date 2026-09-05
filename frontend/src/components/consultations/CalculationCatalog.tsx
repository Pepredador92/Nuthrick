import { useState } from "react";
import type { Interpretation } from "@/src/features/interpretations/types";
import {
  InterpretationDetails,
  InterpretationLabel,
} from "./InterpretationDetails";
import {
  AlertCircle,
  BookOpen,
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

type ResultEntry = {
  evaluation: CalculationEvaluation;
  label: string;
  method?: string;
};
export type CalculationResultGroup = { title: string; entries: ResultEntry[] };

const methodBySuffix: Record<string, string> = {
  jp3: "Jackson & Pollock 3",
  jp7: "Jackson & Pollock 7",
  durnin: "Durnin & Womersley",
  density: "Densidad registrada",
  lean_1996: "Lean",
  device: "Bioimpedancia",
};
function sourceMethod(code: string) {
  const suffix = code
    .replace(/^body_fat_/, "")
    .replace(/^fat_mass_/, "")
    .replace(/^fat_free_mass_/, "")
    .replace(/_(siri|brozek)$/, "");
  return methodBySuffix[suffix] ?? suffix.replaceAll("_", " ");
}
function bodyFatFormula(code: string) {
  if (code.endsWith("_siri")) return "Grasa - Siri";
  if (code.endsWith("_brozek")) return "Grasa - Brozek";
  if (code.includes("lean")) return "Grasa - Lean";
  return undefined;
}
function resultEntry(
  evaluation: CalculationEvaluation,
): ResultEntry | undefined {
  const { code } = evaluation.item;
  if (evaluation.state !== "calculated" || code.startsWith("density_"))
    return undefined;
  if (code === "bmi") return { evaluation, label: "IMC" };
  if (code === "waist_height_ratio")
    return { evaluation, label: "Índice cintura-talla" };
  if (code === "waist_hip_ratio")
    return { evaluation, label: "Índice cintura-cadera" };
  if (code.startsWith("body_fat_"))
    return {
      evaluation,
      label: bodyFatFormula(code) ?? evaluation.item.definition.resultName,
      method: sourceMethod(code),
    };
  if (code.startsWith("fat_mass_") || code.startsWith("fat_free_mass_")) {
    const formula = code.endsWith("_siri")
      ? "Siri"
      : code.endsWith("_brozek")
        ? "Brozek"
        : undefined;
    return {
      evaluation,
      label: code.startsWith("fat_mass_")
        ? "Grasa calculada"
        : "Masa magra calculada",
      method: [formula, sourceMethod(code)].filter(Boolean).join(" · "),
    };
  }
  if (code === "somatotype_endomorphy")
    return { evaluation, label: "Endomorfia" };
  if (code === "somatotype_mesomorphy")
    return { evaluation, label: "Mesomorfia" };
  if (code === "somatotype_ectomorphy")
    return { evaluation, label: "Ectomorfia" };
  if (code === "somatochart_coordinates")
    return { evaluation, label: "Somatocarta" };
  return {
    evaluation,
    label: evaluation.item.definition.resultName,
    method: evaluation.item.definition.methodName,
  };
}

/** Presentation only: preserves every calculation and groups concurrent provenances. */
export function buildCalculationResultGroups(
  evaluations: CalculationEvaluation[],
): CalculationResultGroup[] {
  const entries = evaluations.flatMap((evaluation) => {
    const entry = resultEntry(evaluation);
    return entry ? [entry] : [];
  });
  const indexed = entries.filter((entry) =>
    ["IMC", "Índice cintura-cadera", "Índice cintura-talla"].includes(
      entry.label,
    ),
  );
  const fats = entries.filter((entry) => entry.label.startsWith("Grasa -"));
  const masses = entries.filter((entry) =>
    ["Grasa calculada", "Masa magra calculada"].includes(entry.label),
  );
  const somatotype = entries.filter((entry) =>
    ["Endomorfia", "Mesomorfia", "Ectomorfia", "Somatocarta"].includes(
      entry.label,
    ),
  );
  const accounted = new Set(
    [...indexed, ...fats, ...masses, ...somatotype].map(
      (entry) => entry.evaluation.item.code,
    ),
  );
  const other = entries.filter(
    (entry) => !accounted.has(entry.evaluation.item.code),
  );
  return [
    indexed.length && {
      title: "Índices y composición corporal",
      entries: indexed,
    },
    fats.length && { title: "Fórmulas de grasa corporal", entries: fats },
    masses.length && { title: "Composición corporal", entries: masses },
    somatotype.length && { title: "Somatotipo", entries: somatotype },
    other.length && { title: "Masa muscular y peso", entries: other },
  ].filter(Boolean) as CalculationResultGroup[];
}

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
const validationPresentation = {
  validated: { label: "Definición validada", className: "text-[#285647]" },
  requires_decision: {
    label: "Requiere decisión metodológica",
    className: "text-[#8a5b22]",
  },
  pending_evidence: {
    label: "Pendiente de evidencia",
    className: "text-[#963f32]",
  },
} as const;
function statePresentation(evaluation: CalculationEvaluation) {
  if (evaluation.state === "calculated")
    return {
      icon: CheckCircle2,
      label: "Calculado",
      className: "border-[#9fc8aa] bg-[#eef8f0] text-[#285647]",
    };
  if (evaluation.state === "not_implemented")
    return {
      icon: Clock3,
      label: "Pendiente de implementación",
      className: "border-[#e3d4b5] bg-[#fff9eb] text-[#775527]",
    };
  if (evaluation.state === "partial")
    return {
      icon: AlertCircle,
      label: "Parcialmente alimentada",
      className: "border-[#d8c49b] bg-[#fffaf0] text-[#775527]",
    };
  return {
    icon: Circle,
    label: "Sin información suficiente",
    className: "border-[#dfe5e1] bg-white text-[#66766f]",
  };
}

function TechnicalInputs({
  title,
  inputs,
  showWorkspace = false,
}: {
  title: string;
  inputs: ResolvedCalculationInput[];
  showWorkspace?: boolean;
}) {
  if (!inputs.length) return null;
  return (
    <div className="mt-4">
      <h5 className="text-xs font-bold uppercase tracking-wide text-[#52705f]">
        {title}
      </h5>
      <ul className="mt-2 space-y-2">
        {inputs.map((input) => (
          <li
            key={input.key}
            className="flex min-w-0 items-start justify-between gap-3 rounded-xl bg-white/70 px-3 py-2.5 text-xs"
          >
            <span className="min-w-0">
              <span className="block font-semibold text-[#173d36]">
                {input.available ? "✓" : "○"} {input.label}
              </span>
              <span className="mt-0.5 block text-[#718176]">
                {showWorkspace
                  ? `${input.inWorkspace ? "En tu espacio" : "Fuera de tu espacio"} · ${input.expectedUnit ?? input.unit ?? "unidad no indicada"}`
                  : sourceLabel(input.source)}
              </span>
            </span>
            <span className="shrink-0 font-semibold text-[#3f5e53]">
              {inputValue(input)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
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
      <button
        type="button"
        className="flex w-full min-w-0 items-start gap-3 text-left"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        <StateIcon size={19} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-[#173d36]">
            {evaluation.item.definition.methodName}
          </span>
          <span className="mt-1 block text-xs leading-5 text-[#6c7b74]">
            {evaluation.item.definition.resultName}
          </span>
        </span>
        {expanded ? (
          <ChevronDown size={17} className="shrink-0" />
        ) : (
          <ChevronRight size={17} className="shrink-0" />
        )}
      </button>
      <div className="mt-3 pl-8">
        <p className="text-xs font-semibold">{presentation.label}</p>
        <p className="mt-1 text-xs leading-5 text-[#60766a]">
          {evaluation.requiredMeasurementCount > 0
            ? `${evaluation.availableMeasurementCount} de ${evaluation.requiredMeasurementCount} mediciones disponibles`
            : `${evaluation.availableCount} de ${evaluation.requiredCount} requisitos disponibles`}{" "}
          ·{" "}
          {evaluation.inputState === "complete"
            ? "inputs completos"
            : evaluation.inputState === "partial"
              ? "inputs parciales"
              : "sin inputs"}
        </p>
        {evaluation.state === "calculated" ? (
          <p className="mt-2 text-2xl font-semibold text-[#173d36]">
            {evaluation.displayedResult}{" "}
            <span className="text-sm font-medium text-[#52705f]">
              {evaluation.item.definition.unit}
            </span>
          </p>
        ) : (
          <p className="mt-2 text-xs leading-5">
            {evaluation.availableCount} de {evaluation.requiredCount} datos
            disponibles
            {evaluation.missingLabels.length
              ? ` · Faltan: ${evaluation.missingLabels.join(", ")}`
              : ""}
          </p>
        )}
        {evaluation.missingMeasurementIdsOutsideWorkspace.length > 0 && (
          <button
            type="button"
            className="nuth-button-secondary mt-3 !px-3 !py-2 !text-xs"
            disabled={adding}
            onClick={() =>
              onAddMissing(evaluation.missingMeasurementIdsOutsideWorkspace)
            }
          >
            <Plus size={14} />{" "}
            {evaluation.state === "not_implemented"
              ? "Agregar mediciones del método a mi espacio"
              : "Agregar faltantes a mi espacio"}
          </button>
        )}
      </div>
      {expanded && (
        <div className="mt-4 border-t border-current/15 pt-4">
          <p className="text-sm leading-6 text-[#536860]">
            {evaluation.item.definition.summary}
          </p>
          {evaluation.activeVariant && (
            <p className="mt-2 text-xs font-semibold text-[#315e4f]">
              Variante activa: {evaluation.activeVariant}
            </p>
          )}
          <TechnicalInputs
            title="Datos automáticos del paciente"
            inputs={evaluation.automaticInputs}
          />
          <TechnicalInputs
            title="Mediciones requeridas"
            inputs={evaluation.measurementInputs}
            showWorkspace
          />
          {evaluation.dependencyStates.length > 0 && (
            <div className="mt-3 text-xs leading-5 text-[#60766a]">
              <p className="font-semibold text-[#315e4f]">Dependencias</p>
              <ul className="mt-1 space-y-1">
                {evaluation.dependencyStates.map((dependency) => (
                  <li key={dependency.code}>
                    ○ {dependency.label} ·{" "}
                    {dependency.resultAvailable
                      ? "resultado disponible"
                      : dependency.implementationState === "pending"
                        ? "matemática pendiente"
                        : `inputs ${dependency.inputState}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {evaluation.item.definition.provenance && (
            <p className="mt-3 text-xs leading-5 text-[#60766a]">
              Procedencia metodológica: conserva el porcentaje de grasa de{" "}
              {evaluation.item.definition.provenance.sourceCalculationCode}.
            </p>
          )}
          <div className="mt-4 min-w-0 break-words rounded-xl bg-white/70 p-3 text-xs leading-5 text-[#60766a]">
            <p
              className={`font-semibold ${evaluation.item.definition.validationStatus ? validationPresentation[evaluation.item.definition.validationStatus].className : "text-[#60766a]"}`}
            >
              Estado metodológico:{" "}
              {evaluation.item.definition.validationStatus
                ? validationPresentation[
                    evaluation.item.definition.validationStatus
                  ].label
                : "Sin clasificar"}
            </p>
            {evaluation.item.definition.validationNote && (
              <p className="mt-1">
                {evaluation.item.definition.validationNote}
              </p>
            )}
            <p className="mt-2">
              <strong>Método:</strong>{" "}
              {evaluation.item.definition.method ??
                evaluation.item.definition.methodName}
              {evaluation.item.definition.variant
                ? ` · ${evaluation.item.definition.variant}`
                : ""}
            </p>
            <p className="mt-1">
              <strong>Población:</strong>{" "}
              {evaluation.activePopulation ??
                evaluation.item.definition.applicability?.population ??
                "No documentada"}
            </p>
            <p className="mt-1">
              <strong>Resultado:</strong>{" "}
              {evaluation.item.definition.resultName} (
              {evaluation.item.definition.unit})
            </p>
            <p className="mt-1">
              <strong>Ecuación:</strong>{" "}
              {evaluation.activeEquation ??
                evaluation.item.definition.equation?.expression ??
                "Pendiente de documentar"}
            </p>
            <p className="mt-1">
              <strong>Limitaciones:</strong>{" "}
              {evaluation.item.definition.limitations}
            </p>
          </div>
          {evaluation.item.definition.references.length > 0 &&
            typeof evaluation.item.definition.references[0] !== "string" && (
              <div className="mt-3 min-w-0 break-words text-xs leading-5 text-[#60766a]">
                <p className="flex items-center gap-1.5 font-semibold text-[#315e4f]">
                  <BookOpen size={14} /> Referencias
                </p>
                <ul className="mt-1 space-y-1">
                  {(
                    evaluation.item.definition.references as Exclude<
                      typeof evaluation.item.definition.references,
                      string[]
                    >
                  ).map((reference) => (
                    <li key={`${reference.url}-${reference.year}`}>
                      <a
                        className="underline decoration-[#9bb7a6] underline-offset-2"
                        href={reference.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {reference.authors} ({reference.year}).{" "}
                        {reference.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          <p className="mt-3 text-xs leading-5 text-[#718176]">
            Versión del contrato {evaluation.item.method_version}.
          </p>
        </div>
      )}
    </article>
  );
}
function ResultCard({
  entry,
  interpretation,
  onViewMethod,
  showLabel = true,
}: {
  entry: ResultEntry;
  interpretation?: Interpretation | null;
  onViewMethod: (code: string) => void;
  showLabel?: boolean;
}) {
  return (
    <article className="min-w-0 rounded-xl border border-[#dfe8e1] bg-white px-3.5 py-3">
      {showLabel && (
        <p className="text-sm font-semibold text-[#173d36]">{entry.label}</p>
      )}
      <p
        className={`${showLabel ? "mt-1" : ""} text-xl font-semibold tracking-[-.02em] text-[#173d36]`}
      >
        {entry.evaluation.displayedResult}{" "}
        <span className="text-sm font-medium text-[#52705f]">
          {entry.evaluation.item.definition.unit}
        </span>
      </p>
      {entry.method && (
        <p
          className="mt-1 truncate text-xs text-[#718176]"
          title={entry.method}
        >
          {entry.method}
        </p>
      )}
      <InterpretationLabel interpretation={interpretation} />
      <InterpretationDetails
        interpretation={interpretation}
        onViewMethod={() => onViewMethod(entry.evaluation.item.code)}
      />
    </article>
  );
}
function ResultsView({
  groups,
  interpretations,
  onViewMethod,
}: {
  groups: CalculationResultGroup[];
  interpretations: Record<string, Interpretation | null>;
  onViewMethod: (code: string) => void;
}) {
  if (!groups.length)
    return (
      <p className="mt-5 rounded-2xl border border-dashed border-[#cbd9ce] p-4 text-sm leading-6 text-[#718176]">
        Los resultados aparecerán aquí automáticamente al completar las
        mediciones necesarias.
      </p>
    );
  return (
    <div className="mt-5 space-y-6">
      {groups.map((group) => (
        <section key={group.title}>
          <h4 className="text-sm font-semibold text-[#173d36]">
            {group.title}
          </h4>
          {group.title === "Somatotipo" ? (
            <div className="mt-3 rounded-2xl border border-[#dfe8e1] bg-white p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {group.entries.map((entry) => (
                  <div key={entry.evaluation.item.code} className="min-w-0">
                    <p className="text-xs font-semibold text-[#60766a]">
                      {entry.label}
                    </p>
                    <p className="mt-1 text-lg font-semibold text-[#173d36]">
                      {entry.evaluation.displayedResult}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-[#718176]">
                Método: Heath-Carter
              </p>
              <button
                type="button"
                className="mt-2 text-xs font-semibold text-[#315e4f] underline decoration-[#9bb7a6] underline-offset-2"
                onClick={() =>
                  onViewMethod(group.entries[0].evaluation.item.code)
                }
              >
                Ver detalles
              </button>
            </div>
          ) : (
            <div className="mt-3 space-y-4">
              {[
                ...new Map(
                  group.entries.map((entry) => [
                    entry.label,
                    group.entries.filter(
                      (candidate) => candidate.label === entry.label,
                    ),
                  ]),
                ).values(),
              ].map((entries) => (
                <div key={entries[0].label}>
                  {entries.length > 1 && (
                    <h5 className="mb-2 text-sm font-semibold text-[#315e4f]">
                      {entries[0].label}
                    </h5>
                  )}
                  <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                    {entries.map((entry) => (
                      <ResultCard
                        key={entry.evaluation.item.code}
                        entry={entry}
                        interpretation={
                          interpretations[entry.evaluation.item.code]
                        }
                        onViewMethod={onViewMethod}
                        showLabel={entries.length === 1}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

export function CalculationCatalog({
  evaluations,
  interpretations = {},
  adding,
  onAddMissing,
}: {
  evaluations: CalculationEvaluation[];
  interpretations?: Record<string, Interpretation | null>;
  adding: boolean;
  onAddMissing: (ids: string[]) => void;
}) {
  const categories = calculationCategoryOrder.filter((category) =>
    evaluations.some((item) => item.item.category === category),
  );
  const [view, setView] = useState<"results" | "methods">("results");
  const [openCategories, setOpenCategories] = useState<Set<string>>(
    () => new Set(categories.slice(0, 1)),
  );
  const [expandedCalculations, setExpandedCalculations] = useState<Set<string>>(
    new Set(),
  );
  const toggleSet = (current: Set<string>, key: string) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };
  const viewMethod = (code: string) => {
    const evaluation = evaluations.find((item) => item.item.code === code);
    if (!evaluation) return;
    setView("methods");
    setOpenCategories(
      (current) => new Set([...current, evaluation.item.category]),
    );
    setExpandedCalculations((current) => new Set([...current, code]));
  };
  const groups = buildCalculationResultGroups(evaluations);
  return (
    <section
      className="mt-8 border-t border-[#dfe5e1] pt-7"
      aria-labelledby="calculation-catalog-title"
    >
      <p className="nuth-eyebrow">Disponibilidad automática</p>
      <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3
            id="calculation-catalog-title"
            className="text-xl font-semibold text-[#173d36]"
          >
            Datos calculados
          </h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#718176]">
            Los resultados se actualizan mientras capturas; no es necesario
            pulsar “Calcular”.
          </p>
        </div>
        <div
          className="inline-flex rounded-xl border border-[#d6e2d9] bg-white p-1"
          role="tablist"
          aria-label="Vista de cálculos"
        >
          <button
            type="button"
            role="tab"
            aria-selected={view === "results"}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${view === "results" ? "bg-[#173d36] text-white" : "text-[#52705f]"}`}
            onClick={() => setView("results")}
          >
            Resultados
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "methods"}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${view === "methods" ? "bg-[#173d36] text-white" : "text-[#52705f]"}`}
            onClick={() => setView("methods")}
          >
            Métodos
          </button>
        </div>
      </div>
      {view === "results" ? (
        <ResultsView
          groups={groups}
          interpretations={interpretations}
          onViewMethod={viewMethod}
        />
      ) : (
        <div className="mt-5 space-y-3">
          {categories.map((category) => {
            const items = evaluations.filter(
              (evaluation) => evaluation.item.category === category,
            );
            const calculated = items.filter(
              (evaluation) => evaluation.state === "calculated",
            ).length;
            const open = openCategories.has(category);
            return (
              <section
                key={category}
                className="overflow-hidden rounded-2xl border border-[#dfe5e1] bg-[#f8fbf8]"
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-4 text-left"
                  aria-expanded={open}
                  onClick={() =>
                    setOpenCategories((current) => toggleSet(current, category))
                  }
                >
                  {open ? (
                    <ChevronDown size={18} />
                  ) : (
                    <ChevronRight size={18} />
                  )}
                  <span className="min-w-0 flex-1 text-sm font-semibold text-[#173d36]">
                    {calculationCategoryNames[category] ?? category}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-[#60766a]">
                    {calculated} de {items.length} calculados
                  </span>
                </button>
                {open && (
                  <div className="grid gap-3 border-t border-[#dfe5e1] p-3 lg:grid-cols-2">
                    {items.map((evaluation) => (
                      <CalculationCard
                        key={evaluation.item.code}
                        evaluation={evaluation}
                        expanded={expandedCalculations.has(
                          evaluation.item.code,
                        )}
                        adding={adding}
                        onToggle={() =>
                          setExpandedCalculations((current) =>
                            toggleSet(current, evaluation.item.code),
                          )
                        }
                        onAddMissing={onAddMissing}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}
