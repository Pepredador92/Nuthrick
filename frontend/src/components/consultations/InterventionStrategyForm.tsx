import { Check } from "lucide-react";
import { useId } from "react";
import {
  type Strategy,
  strategyCategories,
  type StrategyDocument,
  strategyIssues,
  strategyReferences,
  strategyRequiredFields,
} from "../../../../supabase/functions/_shared/interventions";
import type { InterventionWorkspace } from "@/src/services/clinicalInterventions";
import { objectivePlansEqual } from '../../../../supabase/functions/_shared/objectives';

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
  referenceTitle: "Guía o protocolo utilizado",
  referenceUrl: "Enlace de la referencia",
  referenceVersion: "Versión o año",
  referenceNotes: "Fundamento y justificación clínica",
};
export const strategyIssueMessages: Record<string, string> = {
  title: "Escribe el nombre de la estrategia.",
  action: "Describe la acción concreta que se realizará.",
  goalIndexes: "Elige al menos un objetivo que apoyará esta estrategia.",
  route: "Selecciona una vía que corresponda al tipo de estrategia.",
  referenceUrl: "Escribe un enlace que comience con https:// o deja el campo vacío.",
};
export const strategySteps = [
  {
    title: "Propósito",
    heading: "¿Qué objetivo apoyará?",
    description:
      "Elige el tipo de estrategia y vincula el objetivo que quieres trabajar.",
    keys: ["title", "goalIndexes"],
  },
  {
    title: "Acción",
    heading: "¿Qué se hará y cómo?",
    description:
      "Describe una acción concreta y cómo responde a la causa del PES.",
    keys: ["action", "method", "etiologyLink"],
  },
  {
    title: "Recursos",
    heading: "¿Qué necesitan para llevarla a cabo?",
    description:
      "Añade los detalles que conozcas. Puedes dejar los demás pendientes.",
    keys: [
      "composition",
      "dose",
      "route",
      "access",
      "educationTopic",
      "materials",
      "comprehensionCheck",
      "coordinationWith",
      "coordinationReason",
      "adaptations",
    ],
  },
  {
    title: "Aplicación",
    heading: "¿Cuándo comienza y quién participa?",
    description: "Organiza los tiempos y las responsabilidades previstas.",
    keys: ["frequency", "duration", "startDate", "responsible", "executor"],
  },
  {
    title: "Seguimiento",
    heading: "¿Cómo sabrán si está funcionando?",
    description:
      "Define qué revisarás y cuándo conviene ajustar la estrategia.",
    keys: ["monitoring", "reviewAt", "adjustmentCriteria"],
  },
  {
    title: "Acuerdo",
    heading: "Revisa y acuerda la estrategia",
    description: "Registra el acuerdo si ya lo conversaron. Puede quedar pendiente al aprobar.",
    keys: ["agreement", "referenceUrl"],
  },
] as const;
export function strategyStepIssues(strategy: Strategy, step: number) {
  const keys: readonly string[] = strategySteps[step].keys;
  return strategyIssues(strategy).filter((key) => keys.includes(key));
}
export function strategyStepHasDetails(strategy: Strategy, step: number) {
  return strategySteps[step].keys.some((key) => {
    const value = strategy[key];
    if (key === "agreement") return value !== "pending";
    if (key === "route") return value !== "not_applicable";
    return Array.isArray(value) ? value.length > 0 : value.trim().length > 0;
  });
}
export function firstIncompleteStrategyStep(
  strategy: Strategy,
  linked: boolean,
) {
  if (!linked) return 0;
  const step = strategySteps.findIndex((_, index) =>
    strategyStepIssues(strategy, index).length > 0
  );
  return step < 0 ? 0 : step;
}

export function strategyContextEligible(workspace: InterventionWorkspace | null) {
  const objective = workspace?.objective;
  return !!workspace?.pes && !!objective?.smart_plan &&
    !!objective.approved_at && !objective.approved_at.startsWith('draft:') &&
    objective.smart_plan.goals.length > 0 &&
    (objective.pes_approved_at ?? objective.smart_plan.pesApprovedAt) === workspace.pes.approved_at &&
    objective.pes_statement === workspace.pes.pesStatement;
}

// A strategy proposed against a draft can follow that exact plan's approval.
// A changed plan still needs an explicit choice from the current goal list.
export function strategyDocumentForWorkspace(document: StrategyDocument, workspace: InterventionWorkspace | null) {
  const approved = workspace?.objective;
  const planning = workspace?.planningObjective;
  if (strategyContextEligible(workspace) && approved?.smart_plan && planning?.smart_plan &&
    document.pesApprovedAt === workspace?.pes?.approved_at &&
    document.objectiveApprovedAt === planning.approved_at &&
    planning.approved_at.startsWith('draft:') &&
    objectivePlansEqual(approved.smart_plan, planning.smart_plan)) {
    return {...document, objectiveApprovedAt: approved.approved_at};
  }
  return document;
}

export function strategyIsLinked(
  document: StrategyDocument,
  workspace: InterventionWorkspace | null,
) {
  const objective = workspace?.objective;
  const current = strategyDocumentForWorkspace(document, workspace);
  return strategyContextEligible(workspace) && !!workspace?.pes && !!objective &&
    current.pesApprovedAt === workspace.pes.approved_at &&
    current.objectiveApprovedAt === objective.approved_at &&
    current.strategy.goalIndexes.every(index => Number.isInteger(index) && index >= 0 && index < objective.smart_plan!.goals.length);
}

export function InterventionStrategyForm(
  { document, workspace, disabled, step, showErrors = false, onChange }: {
    document: StrategyDocument;
    workspace: InterventionWorkspace | null;
    disabled: boolean;
    step: number;
    showErrors?: boolean;
    onChange: (document: StrategyDocument) => void;
  },
) {
  const errorPrefix = useId();
  const currentDocument = strategyDocumentForWorkspace(document, workspace);
  const s = currentDocument.strategy;
  const objective=workspace?.objective??workspace?.planningObjective;
  const goals = objective?.smart_plan?.goals ?? [];
  const eligible = strategyContextEligible(workspace);
  const linked = strategyIsLinked(document, workspace);
  const change = (patch: Partial<Strategy>) =>
    onChange({ ...currentDocument, strategy: { ...s, ...patch } });
  const issues = strategyIssues(s);
  function field(key: keyof typeof strategyLabels, short = false) {
    const value = s[key as keyof Strategy] as string;
    const label = strategyLabels[key];
    const required = strategyRequiredFields.some((field) => field === key);
    const invalid = showErrors && issues.includes(key);
    const errorId = `${errorPrefix}-${key}`;
    return (
      <label
        key={key}
        data-strategy-field={key}
        className={`clinical-goal-field${
          value.trim() && !issues.includes(key) ? " is-complete" : ""
        }`}
      >
        <span>
          {label}
          {value.trim() && !issues.includes(key) && (
            <Check size={14} aria-hidden="true" />
          )}
        </span>
        <small>{required ? "Obligatorio para aprobar" : "Opcional"}</small>
        {short
          ? (
            <input
              aria-label={label}
              aria-required={required}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? errorId : undefined}
              className="nuth-input"
              maxLength={1500}
              value={value}
              onChange={(e) => change({ [key]: e.target.value })}
            />
          )
          : (
            <textarea
              aria-label={label}
              aria-required={required}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? errorId : undefined}
              className="nuth-input"
              rows={2}
              maxLength={1500}
              value={value}
              onChange={(e) => change({ [key]: e.target.value })}
              placeholder={key === "adaptations"
                ? "Recursos, preferencias y apoyos que necesita la persona"
                : undefined}
            />
          )}
        {invalid && <small id={errorId} className="clinical-strategy-field-error">
          {strategyIssueMessages[key] ?? `Revisa: ${label}.`}
        </small>}
      </label>
    );
  }
  const resourceFields: string[] = [];
  if (["food", "supplementation"].includes(s.category)) {
    resourceFields.push("composition", "dose");
  }
  if (["enteral", "parenteral"].includes(s.route)) {
    resourceFields.push("access", "coordinationWith");
  }
  if (["education", "counseling"].includes(s.category)) {
    resourceFields.push("educationTopic", "materials", "comprehensionCheck");
  }
  if (["coordination", "supplementation"].includes(s.category)) {
    resourceFields.push("coordinationWith", "coordinationReason");
  }
  resourceFields.push("adaptations");
  return (
    <fieldset disabled={disabled} className="clinical-strategy-fields">
      {step === 0 && (
        <>
          {!linked && eligible && (
            <div className="clinical-notice is-warning" data-strategy-field="context" tabIndex={-1}>
              <p>El PES o los objetivos cambiaron. Revisa la estrategia y elige al menos un objetivo de la lista actual.</p>
            </div>
          )}
          {field("title", true)}
          <div className="clinical-strategy-short-fields">
            <label className="clinical-goal-field">
              <span>Categoría</span>
              <select
                className="nuth-input"
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
            <label className="clinical-goal-field">
              <span>Prioridad · 1 es la mayor</span>
              <input
                type="number"
                className="nuth-input"
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
          <fieldset className="clinical-strategy-goals" data-strategy-field="goalIndexes" tabIndex={-1}
            aria-invalid={showErrors && issues.includes("goalIndexes") || undefined}
            aria-describedby={showErrors && issues.includes("goalIndexes") ? `${errorPrefix}-goalIndexes` : undefined}>
            <legend>Objetivos que apoya · elige al menos uno para aprobar</legend>
            {goals.length
              ? goals.map((goal, index) => (
                <label key={index}>
                  <input
                    type="checkbox"
                    checked={(!eligible || linked) && s.goalIndexes.includes(index)}
                    onChange={(e) => {
                      const selected = eligible && !linked ? [] : s.goalIndexes;
                      onChange({...currentDocument,
                        pesApprovedAt: workspace?.pes?.approved_at ?? '',
                        objectiveApprovedAt: objective?.approved_at ?? '',
                        strategy: {...s, goalIndexes: e.target.checked
                          ? [...new Set([...selected, index])].sort()
                          : selected.filter(i => i !== index)},
                      });
                    }}
                  />
                  <span>
                    <strong>{index + 1}. {goal.outcome}</strong>
                  </span>
                </label>
              ))
              : (
                <p className="clinical-notice">
                  Aprueba los objetivos SMART para vincularlos.
                </p>
              )}
            {showErrors && issues.includes("goalIndexes") &&
              <p id={`${errorPrefix}-goalIndexes`} className="clinical-strategy-field-error">{strategyIssueMessages.goalIndexes}</p>}
          </fieldset>
        </>
      )}
      {step === 1 &&
        ["action", "method", "etiologyLink"].map((key) => field(key))}
      {step === 2 && (
        <>
          {(["food", "supplementation"].includes(s.category) || issues.includes("route")) && (
            <label className="clinical-goal-field" data-strategy-field="route">
              <span>Vía de administración · opcional</span>
              <select
                className="nuth-input"
                aria-invalid={showErrors && issues.includes("route") || undefined}
                aria-describedby={showErrors && issues.includes("route") ? `${errorPrefix}-route` : undefined}
                value={s.route}
                onChange={(e) =>
                  change({
                    route: e.target.value as Strategy["route"],
                    ...(!["enteral", "parenteral"].includes(e.target.value)
                      ? { access: "", coordinationWith: "" }
                      : {}),
                  })}
              >
                <option value="not_applicable">{["food", "supplementation"].includes(s.category) ? "Por definir" : "No aplica"}</option>
                {["food", "supplementation"].includes(s.category) && <>
                  <option value="oral">Oral</option>
                  <option value="enteral">Enteral</option>
                  <option value="parenteral">Parenteral</option>
                </>}
              </select>
              {showErrors && issues.includes("route") && <small id={`${errorPrefix}-route`} className="clinical-strategy-field-error">{strategyIssueMessages.route}</small>}
            </label>
          )}
          {[...new Set(resourceFields)].map((key) => field(key))}
        </>
      )}
      {step === 3 && (
        <div className="clinical-strategy-short-fields">
          {["frequency", "duration", "startDate", "responsible", "executor"]
            .map((key) => field(key, true))}
        </div>
      )}
      {step === 4 &&
        ["monitoring", "reviewAt", "adjustmentCriteria"].map((key) =>
          field(key)
        )}
      {step === 5 && (
        <>
          <label className="clinical-goal-field">
            <span>Acuerdo con la persona · opcional</span>
            <select
              className="nuth-input"
              aria-label="Acuerdo con la persona"
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
            <small>Registra el acuerdo después de conversarlo.</small>
          </label>
          <details className="clinical-support-details">
            <summary>Fundamento y referencias</summary>
            <p className="mt-3 text-xs">
              Registra la guía o protocolo que corresponde a esta estrategia.
            </p>
            {strategyReferences.map((ref) => (
              <label key={ref.id} className="clinical-strategy-reference">
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
                  <small>{ref.scope}</small>
                </span>
              </label>
            ))}
            <div className="clinical-strategy-fields mt-4">
              {[
                "referenceTitle",
                "referenceUrl",
                "referenceVersion",
                "referenceNotes",
              ].map((key) => field(key))}
            </div>
          </details>
          {!!s.evidence.length && (
            <details className="clinical-support-details">
              <summary>
                Datos del expediente utilizados por la propuesta
              </summary>
              <ul className="mt-3 space-y-2 text-xs">
                {s.evidence.map((e, i) => (
                  <li key={i}>
                    <strong>{e.source}:</strong> {e.finding}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {!!s.missingContext.length && (
            <details className="clinical-support-details">
              <summary>Datos pendientes en la propuesta original</summary>
              <ul className="mt-3 list-disc pl-4 text-xs">
                {s.missingContext.map((note, i) => <li key={i}>{note}</li>)}
              </ul>
            </details>
          )}
        </>
      )}
    </fieldset>
  );
}
