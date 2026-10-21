import { Check } from "lucide-react";
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
  referenceTitle: "Guía o protocolo utilizado",
  referenceUrl: "Enlace de la referencia",
  referenceVersion: "Versión o año",
  referenceNotes: "Fundamento y justificación clínica",
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
      "Completa los detalles de este tipo de intervención y las adaptaciones necesarias.",
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
    description: "Confirma que representa lo conversado antes de aprobarla.",
    keys: ["agreement", "referenceUrl"],
  },
] as const;
export function strategyStepIssues(strategy: Strategy, step: number) {
  const keys: readonly string[] = strategySteps[step].keys;
  return strategyIssues(strategy).filter((key) => keys.includes(key));
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

export function InterventionStrategyForm(
  { document, workspace, disabled, step, onChange }: {
    document: StrategyDocument;
    workspace: InterventionWorkspace | null;
    disabled: boolean;
    step: number;
    onChange: (document: StrategyDocument) => void;
  },
) {
  const s = document.strategy;
  const objective=workspace?.objective??workspace?.planningObjective;
  const goals = objective?.smart_plan?.goals ?? [];
  const linked = !!workspace?.pes && !!objective &&
    document.pesApprovedAt === workspace.pes.approved_at &&
    document.objectiveApprovedAt === objective.approved_at;
  const change = (patch: Partial<Strategy>) =>
    onChange({ ...document, strategy: { ...s, ...patch } });
  const issues = strategyIssues(s);
  function field(key: keyof typeof strategyLabels, short = false) {
    const value = s[key as keyof Strategy] as string;
    const label = strategyLabels[key];
    return (
      <label
        key={key}
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
        {short
          ? (
            <input
              aria-label={label}
              className="nuth-input"
              maxLength={1500}
              value={value}
              onChange={(e) => change({ [key]: e.target.value })}
            />
          )
          : (
            <textarea
              aria-label={label}
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
          {!linked && (
            <div className="clinical-notice is-warning">
              <p>Revisa el vínculo con el PES y los objetivos vigentes.</p>
              <button
                type="button"
                className="nuth-button-secondary mt-2 !text-xs"
                disabled={!workspace?.pes || !objective?.smart_plan}
                onClick={() =>
                  onChange({
                    ...document,
                    pesApprovedAt: workspace!.pes!.approved_at,
                    objectiveApprovedAt: objective!.approved_at,
                    strategy: { ...s, goalIndexes: [] },
                  })}
              >
                Vincular a los objetivos actuales
              </button>
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
          <fieldset className="clinical-strategy-goals">
            <legend>Objetivos que apoya</legend>
            {goals.length
              ? goals.map((goal, index) => (
                <label key={index}>
                  <input
                    type="checkbox"
                    checked={s.goalIndexes.includes(index)}
                    onChange={(e) =>
                      change({
                        goalIndexes: e.target.checked
                          ? [...s.goalIndexes, index].sort()
                          : s.goalIndexes.filter((i) => i !== index),
                      })}
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
          </fieldset>
        </>
      )}
      {step === 1 &&
        ["action", "method", "etiologyLink"].map((key) => field(key))}
      {step === 2 && (
        <>
          {["food", "supplementation"].includes(s.category) && (
            <label className="clinical-goal-field">
              <span>Vía de administración</span>
              <select
                className="nuth-input"
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
            <span>Acuerdo con la persona</span>
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
