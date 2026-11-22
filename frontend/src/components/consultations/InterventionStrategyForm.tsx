import { useId } from "react";
import {
  type Strategy,
  strategyCategories,
  type StrategyDocument,
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
  { document, workspace, disabled, showErrors = false, onChange }: {
    document: StrategyDocument;
    workspace: InterventionWorkspace | null;
    disabled: boolean;
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
  const needsGoal = showErrors && s.goalIndexes.length === 0;
  return (
    <fieldset disabled={disabled} className="clinical-strategy-fields">
      <div className="clinical-strategy-short-fields">
        <label className="clinical-goal-field">
          <span>Categoría</span>
          <select
            className="nuth-input"
            value={s.category}
            onChange={(e) =>
              change({ category: e.target.value as Strategy["category"] })}
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
        aria-invalid={needsGoal || undefined}
        aria-describedby={needsGoal ? `${errorPrefix}-goalIndexes` : undefined}>
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
        {needsGoal &&
          <p id={`${errorPrefix}-goalIndexes`} className="clinical-strategy-field-error">{strategyIssueMessages.goalIndexes}</p>}
      </fieldset>
    </fieldset>
  );
}

export function StrategyProposalSources({ strategy }: { strategy: Strategy }) {
  if (!strategy.evidence.length && !strategy.missingContext.length) return null;
  return (
    <details className="clinical-support-details">
      <summary>Datos que usó la IA</summary>
      {!!strategy.evidence.length && (
        <ul className="mt-3 space-y-2 text-xs">
          {strategy.evidence.map(({ source, finding }, index) => (
            <li key={index}><strong>{source}</strong><p className="mt-1 whitespace-pre-wrap">{finding}</p></li>
          ))}
        </ul>
      )}
      {!!strategy.missingContext.length && (
        <div className="mt-3 text-xs">
          <p className="font-semibold">Información por confirmar</p>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {strategy.missingContext.map((note, index) => <li key={index}>{note}</li>)}
          </ul>
        </div>
      )}
    </details>
  );
}
