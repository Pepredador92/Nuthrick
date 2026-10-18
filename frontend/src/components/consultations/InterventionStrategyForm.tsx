import {
  type Strategy,
  strategyCategories,
  type StrategyDocument,
  strategyIssues,
  strategyReferences,
} from "../../../../supabase/functions/_shared/interventions";
import type { InterventionWorkspace } from "@/src/services/clinicalInterventions";
export const strategyLabels: Record<string, string> = {
  title: "Nombre de la estrategia",
  action: "Acción concreta",
  etiologyLink: "Cómo aborda la etiología",
  method: "Cómo se realizará",
  frequency: "Frecuencia",
  duration: "Duración prevista",
  startDate: "Inicio previsto",
  responsible: "Profesional responsable",
  executor: "Quién la ejecutará",
  adaptations: "Barreras, preferencias y adaptaciones",
  monitoring: "Indicador y método de seguimiento",
  reviewAt: "Cuándo se revisará",
  adjustmentCriteria: "Cuándo ajustar o reconsiderar",
  access: "Método de acceso",
  dose: "Cantidad o dosis y unidad",
  composition: "Dieta, consistencia, composición o producto",
  educationTopic: "Tema o habilidad que se trabajará",
  materials: "Materiales y apoyos",
  comprehensionCheck: "Cómo se comprobará comprensión o habilidad",
  coordinationWith: "Profesional o servicio con quien se coordina",
  coordinationReason: "Motivo de la coordinación",
  goalIndexes: "Objetivos vinculados",
  route: "Vía de administración",
  agreement: "Acuerdo con el paciente",
  referenceUrl: "Enlace de la referencia",
};
export function InterventionStrategyForm({
  document,
  workspace,
  disabled,
  onChange,
}: {
  document: StrategyDocument;
  workspace: InterventionWorkspace | null;
  disabled: boolean;
  onChange: (document: StrategyDocument) => void;
}) {
  const s = document.strategy;
  const goals = workspace?.objective?.smart_plan?.goals ?? [];
  const linked = !!workspace?.pes && !!workspace.objective &&
    document.pesApprovedAt === workspace.pes.approved_at &&
    document.objectiveApprovedAt === workspace.objective.approved_at;
  const change = (patch: Partial<Strategy>) =>
    onChange({ ...document, strategy: { ...s, ...patch } });
  const fields: (keyof Strategy)[] = [
    "title",
    "action",
    "etiologyLink",
    "method",
    "frequency",
    "duration",
    "startDate",
    "responsible",
    "executor",
    "adaptations",
    "monitoring",
    "reviewAt",
    "adjustmentCriteria",
  ];
  if (["food", "supplementation"].includes(s.category)) {
    fields.push("composition", "dose");
  }
  if (["enteral", "parenteral"].includes(s.route)) {
    fields.push("access", "coordinationWith");
  }
  if (["education", "counseling"].includes(s.category)) {
    fields.push("educationTopic", "materials", "comprehensionCheck");
  }
  if (["coordination", "supplementation"].includes(s.category)) {
    fields.push("coordinationWith", "coordinationReason");
  }
  const issues = strategyIssues(s);
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-4">
      {!linked && (
        <div className="rounded-xl border border-[var(--nuth-line)] p-3 text-sm">
          <p>Revisa el vínculo con el PES y los objetivos vigentes.</p>
          <button
            type="button"
            className="nuth-button-secondary mt-2 !text-xs"
            disabled={!workspace?.pes || !workspace.objective?.smart_plan}
            onClick={() =>
              onChange({
                ...document,
                pesApprovedAt: workspace!.pes!.approved_at,
                objectiveApprovedAt: workspace!.objective!.approved_at,
                strategy: { ...s, goalIndexes: [] },
              })}
          >
            Vincular a los objetivos actuales
          </button>
        </div>
      )}
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <label className="min-w-0 text-sm">
          Categoría<select
            className="nuth-input mt-1 w-full"
            value={s.category}
            onChange={(e) =>
              change({
                category: e.target.value as Strategy["category"],
                route: "not_applicable",
                access: "",
                dose: "",
                composition: "",
                educationTopic: "",
                materials: "",
                comprehensionCheck: "",
                coordinationWith: "",
                coordinationReason: "",
              })}
          >
            {Object.entries(strategyCategories).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Prioridad · 1 es la mayor<input
            type="number"
            className="nuth-input mt-1 w-full"
            min={1}
            max={10}
            value={s.priority}
            onChange={(e) =>
              change({
                priority: Math.min(
                  10,
                  Math.max(1, Number(e.target.value) || 1),
                ),
              })}
          />
        </label>
      </div>
      <fieldset className="rounded-xl border border-[var(--nuth-line)] p-3">
        <legend className="px-1 text-sm font-semibold">
          Objetivos que apoya
        </legend>
        {goals.length
          ? goals.map((goal, index) => (
            <label key={index} className="mb-2 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={s.goalIndexes.includes(index)}
                onChange={(e) =>
                  change({
                    goalIndexes: e.target.checked
                      ? [...s.goalIndexes, index].sort()
                      : s.goalIndexes.filter((i) =>
                        i !== index
                      ),
                  })}
              />
              <span>
                <strong>{index + 1}. {goal.outcome}</strong>
                <span className="block text-xs text-[var(--nuth-muted)]">
                  {goal.indicator} · Meta: {goal.target} · {goal.timeframe}
                </span>
              </span>
            </label>
          ))
          : (
            <p className="text-sm text-[var(--nuth-muted)]">
              Aprueba los objetivos SMART para vincularlos.
            </p>
          )}
      </fieldset>
      {["food", "supplementation"].includes(s.category) && (
        <label className="block text-sm">
          Vía de administración<select
            className="nuth-input mt-1 w-full"
            value={s.route}
            onChange={(e) =>
              change({
                route: e.target.value as Strategy["route"],
                ...(!["enteral", "parenteral"].includes(e.target.value)
                  ? { access: "", coordinationWith: "" }
                  : {}),
              })}
          >
            <option value="not_applicable">Por definir</option>
            <option value="oral">Oral</option>
            <option value="enteral">Enteral</option>
            <option value="parenteral">Parenteral</option>
          </select>
        </label>
      )}
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <label key={field} className="min-w-0 text-sm">
            {strategyLabels[field]}
            <textarea
              className="nuth-input mt-1 w-full !text-sm"
              rows={field === "action" || field === "method" ? 3 : 2}
              maxLength={1500}
              value={s[field] as string}
              onChange={(e) => change({ [field]: e.target.value })}
              placeholder={field === "startDate"
                ? "Fecha o condición de inicio acordada"
                : field === "adaptations"
                ? "Considera recursos, preferencias, disposición y apoyos"
                : undefined}
            />
          </label>
        ))}
      </div>
      <label className="block text-sm">
        Acuerdo con la persona<select
          className="nuth-input mt-1 w-full"
          value={s.agreement}
          onChange={(e) =>
            change({ agreement: e.target.value as Strategy["agreement"] })}
        >
          <option value="pending">Pendiente de conversar</option>
          <option value="patient">Acordado con el paciente</option>
          <option value="caregiver">
            Acordado con cuidador o representante
          </option>
        </select>
      </label>
      <details className="rounded-xl border border-[var(--nuth-line)] p-3 text-sm">
        <summary className="font-semibold">Fundamento y referencias</summary>
        <p className="mt-2 text-xs text-[var(--nuth-muted)]">
          Los marcos generales describen el proceso de atención. Registra la
          guía terapéutica o protocolo y la justificación clínica que
          correspondan a tu estrategia.
        </p>
        {strategyReferences.map((ref) => (
          <label key={ref.id} className="mt-3 flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              checked={s.referenceIds.includes(ref.id)}
              onChange={(e) =>
                change({
                  referenceIds: e.target.checked
                    ? [...s.referenceIds, ref.id]
                    : s.referenceIds.filter((id) =>
                      id !== ref.id
                    ),
                })}
            />
            <span>
              <a
                href={ref.url}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                {ref.title}
              </a>
              <span className="block">{ref.scope}</span>
            </span>
          </label>
        ))}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {([
            "referenceTitle",
            "referenceUrl",
            "referenceVersion",
            "referenceNotes",
          ] as const).map((field) => (
            <label key={field} className="text-xs">
              {{
                referenceTitle: "Guía o protocolo utilizado",
                referenceUrl: "Enlace HTTPS",
                referenceVersion: "Versión o año",
                referenceNotes: "Fundamento y justificación clínica",
              }[field]}
              <textarea
                className="nuth-input mt-1 w-full !text-sm"
                maxLength={1500}
                value={s[field]}
                onChange={(e) => change({ [field]: e.target.value })}
              />
            </label>
          ))}
        </div>
      </details>
      {!!s.evidence.length && (
        <details className="text-xs">
          <summary>Datos del expediente utilizados por la propuesta</summary>
          <ul className="mt-2 space-y-2">
            {s.evidence.map((e, i) => (
              <li key={i}>
                <strong>{e.source}:</strong> {e.finding}
              </li>
            ))}
          </ul>
        </details>
      )}
      {!!s.missingContext.length && (
        <details className="text-xs">
          <summary>Datos pendientes en la propuesta original</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {s.missingContext.map((note, i) => <li key={i}>{note}</li>)}
          </ul>
        </details>
      )}
      <details className="text-xs text-[var(--nuth-muted)]">
        <summary>
          {issues.length
            ? `${issues.length} componentes pendientes para aprobar`
            : "Componentes documentados para revisión profesional"}
        </summary>
        <ul className="mt-2 list-disc pl-4">
          {issues.map((key) => <li key={key}>{strategyLabels[key] ?? key}</li>)}
        </ul>
      </details>
    </fieldset>
  );
}
