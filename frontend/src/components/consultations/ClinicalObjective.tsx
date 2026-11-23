import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
import { AIButton } from "@/src/components/ai/AIControls";
import {
  ClinicalStatusBadge,
  type ClinicalTaskStatus,
} from "./ClinicalTaskCard";
import {
  ObjectiveGoalEditor,
  ObjectiveGoalSummary,
  objectivePendingFields,
  type ObjectivePending,
  type ObjectiveProposalEvidence,
} from "./ObjectiveGoalEditor";
import { formatObjectiveEditorText, objectiveEditorFieldHint, objectiveEditorFieldOffset, readObjectiveEditorText, withObjectiveTemplateGaps } from "@/src/features/consultations/objectiveEditorText";
import {
  clinicalObjective,
  type ObjectiveWorkspace,
} from "@/src/services/clinicalCopilot";
import { ConsultationObjectiveAI, type ObjectiveAssistance } from "./ConsultationObjectiveAI";
import { ClinicalBatchStageRevision } from "./ClinicalBatchAI";
import { ClinicalTaskDialog } from "./ClinicalTaskDialog";
import {useConsultationDraft,useConsultationDraftContext} from './ConsultationDrafts';
import {changedAnswers} from '@/src/features/consultations/answerAutosave';
import { hasUsablePesEtiology } from '../../../../supabase/functions/_shared/pes';
import {
  composeObjective,
  emptyObjective,
  isObjectivePlan,
  type ObjectiveGoal,
  type ObjectivePlan,
  objectivePlansEqual,
} from "../../../../supabase/functions/_shared/objectives";
import './SmartObjectiveEditor.css';

type Props = {
  consultationId: string;
  revision: number;
  questionKey: string;
  value: unknown;
  before: () => Promise<boolean>;
  patientId?: string;
  active?: boolean;
  contextVersion?: number;
  onChangeText?: (text: string, texts: string[]) => void;
  onPendingChange?: (pending: boolean) => void;
  maxLength?: number;
  onStatusChange?: (status: ClinicalTaskStatus) => void;
  onCompleted?: () => void;
  onReviewPes?: () => void;
  reviewBatch?: boolean;
};
const blankPlan = (): ObjectivePlan => ({
  version: 1,
  pesApprovedAt: "",
  goals: [],
});
type GoalEditor = { basis: string; text?: string; grounding?: ObjectiveProposalEvidence };

function editorForGoal(goal: ObjectiveGoal, entry?: GoalEditor) {
  const basis = formatObjectiveEditorText(goal);
  return entry?.basis === basis ? entry : { basis };
}

function editorIssue(goal: ObjectiveGoal, entry?: GoalEditor) {
  const saved = editorForGoal(goal, entry).text;
  if (saved === undefined) return;
  const result = readObjectiveEditorText(saved);
  if ('issue' in result) return result;
}

export function ClinicalObjective(props: Props) {
  const { patientId, consultationId, revision, before, active, questionKey, reviewBatch } = props;
  return patientId ? <ConsultationObjectiveAI patientId={patientId} consultationId={consultationId}
    revision={revision} draftKey={questionKey} before={before} active={active} reviewBatch={reviewBatch}
    renderObjectives={assistance => <ObjectiveWorkspaceEditor {...props} assistance={assistance} />}
  /> : <ObjectiveWorkspaceEditor {...props} />;
}

function ObjectiveWorkspaceEditor(props: Props & { assistance?: ObjectiveAssistance }) {
  const checkpoint=useConsultationDraftContext();
  const {
    consultationId,
    revision,
    questionKey,
    value,
    before,
    patientId,
    active,
    onPendingChange,
    onStatusChange,
    maxLength = 2000,
    assistance,
  } = props;
  const cacheKey =
    `objective-draft:${consultationId}:${revision}:${questionKey}`;
  const [workingPlan, setPlan] = useConsultationDraft<ObjectivePlan>(`objective:${questionKey}`,() => {
    try {
      const cached: unknown = JSON.parse(
        sessionStorage.getItem(cacheKey) || "null",
      );
      return isObjectivePlan(cached) ? cached : blankPlan();
    } catch {
      return blankPlan();
    }
  });
  const [dirty, setDirty] = useConsultationDraft(`objective-dirty:${questionKey}`,() => {
    try {
      return isObjectivePlan(
        JSON.parse(sessionStorage.getItem(cacheKey) || "null"),
      );
    } catch {
      return false;
    }
  });
  const [workingEditors, setEditors] = useConsultationDraft<GoalEditor[]>(`objective-text-editor:${questionKey}`, () => {
    try {
      const value: unknown = JSON.parse(sessionStorage.getItem(`${cacheKey}:editor`) || '[]');
      return Array.isArray(value) ? value as GoalEditor[] : [];
    } catch {
      return [];
    }
  });
  const dirtyRef = useRef(dirty);
  const sessionDraft = useRef(dirty ? { plan: workingPlan, editors: workingEditors } : null);
  useEffect(() => {
    const restored = sessionDraft.current;
    if (!restored || !checkpoint) return;
    sessionDraft.current = null;
    if (Object.hasOwn(checkpoint.values, `objective:${questionKey}`)) return;
    setPlan(restored.plan);
    setEditors(restored.editors);
    setDirty(true);
  }, [checkpoint, questionKey, setPlan, setEditors, setDirty]);
  const [workspace, setWorkspace] = useState<ObjectiveWorkspace | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [replacementId, setReplacementId] = useState<string | null>(null);
  const [usedProposal, setUsedProposal] = useConsultationDraft<string | null>(`objective-used-proposal:${questionKey}`, null);
  const saving = useRef(false);
  const [activeGoal, setActiveGoal] = useConsultationDraft<number | null>(`objective-editor:${questionKey}`,null);
  const editorId = useId();
  const legacy = typeof value === "string"
    ? value
    : Array.isArray(value)
    ? value.map((item) =>
      typeof item === "string"
        ? item
        : item && typeof item === "object"
        ? Object.values(item).filter((v) => typeof v === "string" && v).join(
          " · ",
        )
        : ""
    ).join("\n\n")
    : "";
  const pes = workspace?.pes;
  const signs = [...new Set(pes?.signsSymptoms?.split("\n").map(sign => sign.trim()).filter(Boolean) ?? [])];
  const suggestions = assistance?.suggestions ?? [];
  const proposedGoals = suggestions.map(suggestion => withObjectiveTemplateGaps({
    ...emptyObjective(),
    ...suggestion.goal,
    outcome: suggestion.goal?.outcome || suggestion.text,
    baseline: suggestion.goal?.baseline ?? '',
    textStyle: suggestion.goal ? suggestion.goal.textStyle : 'patient_v1',
    agreement: 'pending',
  }));
  const needsBinding = !!(assistance?.stale || assistance?.assessment ||
    (assistance?.batchOrigin && assistance.baseProblem && assistance.baseProblem !== pes?.problem) ||
    proposedGoals.some(goal => (goal.sign && !signs.includes(goal.sign)) ||
      (assistance?.batchOrigin && goal.etiology && goal.etiology !== pes?.etiology)));
  const proposalPlan: ObjectivePlan = { version: 1, goals: proposedGoals, pesApprovedAt: !needsBinding ? pes?.approved_at ?? "" : "" };
  const proposalId = assistance?.generationId ?? (proposedGoals.length ? JSON.stringify(proposedGoals) : null);
  const alreadyInEditor = objectivePlansEqual(
    { ...workingPlan, pesApprovedAt: proposalPlan.pesApprovedAt,
      goals: workingPlan.goals.map(goal => ({ ...goal, agreement: "pending" })) },
    proposalPlan,
  );
  const candidate = workspace && proposalId && proposalId !== usedProposal && proposedGoals.length > 0 &&
    isObjectivePlan(proposalPlan) && !alreadyInEditor ? {
      id: proposalId, plan: proposalPlan,
      editors: proposedGoals.map((goal, index): GoalEditor => ({
        basis: formatObjectiveEditorText(goal),
        grounding: { evidence: suggestions[index].evidence, references: suggestions[index].references },
      })),
    } : null;
  const inline = !dirty && !workingPlan.goals.length && !legacy.trim() ? candidate : null;
  const alternate = candidate && !inline ? candidate : null;
  const replacement = alternate?.id === replacementId ? alternate : null;
  const plan = inline?.plan ?? workingPlan;
  const editors = inline?.editors ?? workingEditors;
  const selected = Math.min(Math.max(0, activeGoal ?? 0), plan.goals.length - 1);
  const goal = plan.goals[selected];
  const goalEditor = goal ? editorForGoal(goal, editors[selected]) : undefined;
  const editorIssues = plan.goals.map((goal, index) => editorIssue(goal, editors[index]));
  const malformed = editorIssues.some(Boolean);
  const text = plan.goals.map(composeObjective).filter(Boolean).join("\n\n");
  const approved = !malformed && !!workspace?.objective?.smart_plan &&
    workspace?.pes?.approved_at === plan.pesApprovedAt &&
    (workspace.objective.pes_approved_at ?? workspace.objective.smart_plan.pesApprovedAt) === workspace.pes.approved_at &&
    workspace.objective.question_key === questionKey &&
    !Object.keys(changedAnswers({value:workspace.objective.value},{value})).length &&
    objectivePlansEqual(workspace.objective.smart_plan, plan);
  useEffect(() => {
    if (approved && dirty) {
      dirtyRef.current = false;
      setDirty(false);
      sessionStorage.removeItem(cacheKey);
    }
  }, [approved, dirty, setDirty, cacheKey]);
  const pesChanged = !!workspace?.pes && plan.goals.length > 0 &&
    plan.pesApprovedAt !== workspace.pes.approved_at;
  const staleSigns = plan.goals.some((goal) => !signs.includes(goal.sign));
  const pendingByGoal = plan.goals.map((goal, index): ObjectivePending[] => {
    const issue = editorIssues[index];
    return issue ? [{ label: issue.issue, field: issue.field }] : objectivePendingFields(goal, signs);
  });
  const completeGoals = pendingByGoal.filter(pending => !pending.length).length;
  const ready = !!plan.goals.length && completeGoals === plan.goals.length &&
    !!workspace?.pes && !pesChanged && text.length <= maxLength;
  const status: ClinicalTaskStatus = approved
    ? "approved"
    : ready
    ? "complete"
    : plan.goals.length || dirty
    ? "progress"
    : "pending";
  useEffect(() => {
    onStatusChange?.(status);
  }, [onStatusChange, status]);
  const pendingCallback = useRef(onPendingChange);
  useEffect(() => {
    pendingCallback.current = onPendingChange;
  }, [onPendingChange]);
  useEffect(() => {
    pendingCallback.current?.(dirty || busy);
  }, [dirty, busy]);
  useEffect(() => () => pendingCallback.current?.(false), []);
  useEffect(() => {
    let alive = true;
    void clinicalObjective(consultationId, revision).then((w) => {
      if (!alive) return;
      setWorkspace(w);
      const saved = w.plans?.[questionKey];
      if (!dirtyRef.current && isObjectivePlan(saved)) {
        setPlan({
          version: 1,
          pesApprovedAt: saved.pesApprovedAt,
          goals: saved.goals,
        });
      }
    }).catch((error) => {
      if (alive) setMessage(error.message);
    });
    return () => {
      alive = false;
    };
  }, [consultationId, revision, questionKey, active, props.contextVersion,setPlan]);
  // Recovered drafts also restore the existing interview answer, which remains
  // the canonical text used by closure, exports and explicit portal publication.
  const onChangeRef = useRef(props.onChangeText);
  useEffect(() => {
    onChangeRef.current = props.onChangeText;
  }, [props.onChangeText]);
  useEffect(() => {
    if (dirtyRef.current && !malformed && text.length <= maxLength) {
      onChangeRef.current?.(text, plan.goals.map(composeObjective).filter(Boolean));
    }
  }, [text, maxLength, plan.goals, malformed]);
  function change(next: ObjectivePlan, nextEditors = editors) {
    sessionDraft.current = null;
    dirtyRef.current = true;
    if (inline) setUsedProposal(inline.id);
    setPlan(next);
    if (nextEditors !== workingEditors) setEditors(nextEditors);
    setDirty(true);
    setMessage("");
    sessionStorage.setItem(cacheKey, JSON.stringify(next));
    sessionStorage.setItem(`${cacheKey}:editor`, JSON.stringify(nextEditors));
    const texts = next.goals.map(composeObjective).filter(Boolean);
    const composed = texts.join("\n\n");
    if (composed.length <= maxLength && !next.goals.some((goal, index) => editorIssue(goal, nextEditors[index]))) {
      props.onChangeText?.(composed, texts);
    }
  }
  function editText(index: number, text: string) {
    const current = plan.goals[index];
    const parsed = readObjectiveEditorText(text);
    const next = 'fields' in parsed ? { ...current, ...parsed.fields } : current;
    const nextEditors = editors.slice();
    nextEditors[index] = { ...editorForGoal(current, editors[index]), basis: formatObjectiveEditorText(next), text };
    change({ ...plan, goals: plan.goals.map((goal, i) => i === index ? next : goal) }, nextEditors);
  }
  function update(index: number, patch: Partial<ObjectiveGoal>) {
    change({
      ...plan,
      goals: plan.goals.map((goal, i) =>
        i === index ? { ...goal, ...patch } : goal
      ),
    });
  }
  function add(goal: ObjectiveGoal = { ...emptyObjective(), textStyle: 'patient_v1' }) {
    if (plan.goals.length >= 3) return;
    setActiveGoal(plan.goals.length);
    const next = { ...goal, sign: goal.sign || (signs.length === 1 ? signs[0] : '') };
    change({
      ...plan,
      pesApprovedAt: plan.goals.length
        ? plan.pesApprovedAt
        : workspace?.pes?.approved_at ?? "",
      goals: [...plan.goals, next],
    }, [...plan.goals.map((goal, index) => editorForGoal(goal, editors[index])), { basis: formatObjectiveEditorText(next) }]);
    focusGoal();
  }
  function useReplacement() {
    if (!replacement || busy) return;
    setUsedProposal(replacement.id);
    setReplacementId(null);
    setActiveGoal(0);
    change(replacement.plan, replacement.editors);
    focusGoal();
  }
  async function persist(action: "save" | "approve" | "revoke") {
    if (saving.current || (action === 'approve' && !ready)) return false;
    saving.current = true;
    setBusy(true);
    setMessage("");
    try {
      if (inline && action === "save") change(plan, editors);
      if (action === 'save' && (malformed || text.length > maxLength)) {
        if (checkpoint && !await checkpoint.flush()) throw new Error('No pudimos guardar el borrador. Tus cambios siguen aquí.');
        setMessage(checkpoint ? 'Borrador guardado. Revisa el texto antes de aprobar.' : 'Borrador guardado en esta sesión. Revisa el texto antes de aprobar.');
        return true;
      }
      if (!(await before())) {
        throw new Error("Guarda la entrevista antes de continuar.");
      }
      const fresh = await clinicalObjective(consultationId, revision);
      setWorkspace(fresh);
      if (
        action === "approve" && fresh.pes?.approved_at !== plan.pesApprovedAt
      ) {
        throw new Error(
          "El PES cambió. Vincula los objetivos al PES actual y revisa la evidencia.",
        );
      }
      const saved = await clinicalObjective(
        consultationId,
        revision,
        action,
        fresh.stamp,
        questionKey,
        action === "revoke" ? undefined : plan,
      );
      setWorkspace(saved);
      dirtyRef.current = false;
      setDirty(false);
      sessionStorage.removeItem(cacheKey);
      const checkpointSaved = !checkpoint || await checkpoint.flush();
      if (action === "approve") props.onCompleted?.();
      setMessage(
        (action === "approve"
          ? "Objetivos aprobados para seguimiento."
          : action === "save"
          ? "Borrador guardado. Puedes continuar y revisarlo después."
          : "Objetivos pendientes de revisión.") + (checkpointSaved ? '' : ' Reintenta el guardado del avance de la pantalla antes de salir.'),
      );
      return true;
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No pudimos guardar los objetivos.",
      );
      return false;
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  function showPending() {
    const index = pendingByGoal[selected]?.length ? selected : pendingByGoal.findIndex(pending => pending.length);
    if (index < 0) return;
    setActiveGoal(index);
    setMessage("");
    focusGoal(pendingByGoal[index][0].field);
  }
  function focusGoal(field?: ObjectivePending['field']) {
    requestAnimationFrame(() => {
      if (field === 'sign' || field === 'agreement') {
        const select = document.getElementById(`${editorId}-${field}`);
        if (field === 'sign') {
          const details = select?.closest('details');
          if (details) details.open = true;
        }
        select?.focus();
        return;
      }
      const input = document.getElementById(editorId) as HTMLTextAreaElement | null;
      input?.focus();
      if (input && field) {
        const offset = objectiveEditorFieldOffset(input.value, field);
        const hint = objectiveEditorFieldHint(field);
        input.setSelectionRange(offset, offset + (input.value.startsWith(hint, offset) ? hint.length : 0));
      }
    });
  }
  function remove(index: number) {
    const info = plan.goals.map((goal, index) => editorForGoal(goal, editors[index]));
    change({ ...plan, goals: plan.goals.filter((_, i) => i !== index) }, info.filter((_, i) => i !== index));
    setActiveGoal(index < selected ? selected - 1 : selected);
  }
  function moveUp(index: number) {
    const goals = [...plan.goals];
    const info = goals.map((goal, i) => editorForGoal(goal, editors[i]));
    [goals[index - 1], goals[index]] = [goals[index], goals[index - 1]];
    [info[index - 1], info[index]] = [info[index], info[index - 1]];
    change({ ...plan, goals }, info);
    setActiveGoal(selected === index - 1 ? index : selected === index ? index - 1 : selected);
  }

  const generating = assistance?.state === "generating";
  const locked = busy || generating;
  const canGenerate = !!pes && hasUsablePesEtiology(pes.etiology);
  const approvalPending = !approved && completeGoals < plan.goals.length;
  const approvalPendingId = `${editorId}-approval-pending`;
  const actions = <footer className="smart-objective-actions">
    {approvalPending && <button type="button" className="clinical-text-action" disabled={locked} onClick={showPending}>
      Ir al siguiente pendiente <ArrowRight size={15} aria-hidden="true" />
    </button>}
    {approved ? <button type="button" className="nuth-button-secondary !text-sm" disabled={locked} onClick={() => void persist('revoke')}>
      Volver a revisar
    </button> : <>
      <button type="button" className="nuth-button-secondary !text-sm" disabled={locked || (!dirty && !inline)} onClick={() => void persist('save')}>
        Guardar borrador
      </button>
      <button type="button" className="nuth-button !text-sm" disabled={locked || !ready}
        aria-describedby={approvalPending ? approvalPendingId : undefined} onClick={() => void persist('approve')}>
        {busy ? 'Guardando…' : 'Aprobar objetivos'}
      </button>
    </>}
  </footer>;

  return (
    <section aria-label="Revisión del objetivo" className="clinical-objectives-workspace">
      <header className="smart-objective-toolbar">
        <div>
          <h3>Objetivos SMART</h3>
          {!!plan.goals.length && <ClinicalStatusBadge status={status}>
            {approved ? "Aprobados" : ready ? "Listos para aprobar" : "En revisión"}
          </ClinicalStatusBadge>}
        </div>
        {assistance && <div className="smart-objective-toolbar-actions">
          {alternate && <button type="button" className="nuth-button-secondary !text-sm"
            disabled={locked} onClick={() => setReplacementId(alternate.id)}>
            Ver propuesta de IA
          </button>}
          <AIButton capability="ai.consultation_support" state={assistance.state}
            disabled={busy || !canGenerate} onClick={() => void assistance.generate()}
            aria-label="Proponer objetivos con IA" title="Usa créditos de IA según el consumo real">
            Proponer objetivos con IA
          </AIButton>
          {assistance.state === 'uncertain' && <button type="button" className="clinical-text-action" onClick={() => void assistance.checkStatus()}>
            Comprobar solicitud
          </button>}
        </div>}
      </header>
      {assistance?.message && <p role="status" className="smart-objective-message">{assistance.message}</p>}
      {workspace && !canGenerate && <div className="smart-objective-context">
        <p>Para generar objetivos vinculados y aprobarlos, completa y aprueba el PES.</p>
        {props.onReviewPes && <button type="button" className="clinical-text-action" onClick={props.onReviewPes}>Ir al PES <ArrowRight size={15} aria-hidden="true" /></button>}
      </div>}
      {pesChanged && <div className="smart-objective-context" role="status">
        <p>Revisa el vínculo con el PES vigente antes de aprobar.</p>
        <button type="button" className="nuth-button-secondary !text-xs" disabled={locked}
          onClick={() => {
            change({ ...plan, pesApprovedAt: pes?.approved_at ?? "" });
            if (staleSigns) showPending();
          }}>Vincular al PES actual</button>
      </div>}
      {!plan.goals.length && legacy && (
        <div className="clinical-legacy-objective">
          <strong>Objetivo registrado anteriormente</strong>
          <p>{legacy}</p>
          <button type="button" className="nuth-button-secondary !text-xs"
            disabled={locked || legacy.length > 400}
            onClick={() => add({ ...emptyObjective(), outcome: legacy })}>
            Usar texto como resultado esperado
          </button>
        </div>
      )}
      <fieldset disabled={locked} className="smart-objective-layout">
        <legend className="sr-only">Redacción de objetivos SMART</legend>
        <div className="smart-objective-list">
          {plan.goals.map((item, index) => (
            <ObjectiveGoalSummary
              key={index}
              goal={item}
              index={index}
              active={index === selected}
              approved={approved}
              ready={!!pes && !pesChanged && !pendingByGoal[index].length}
              fromAI={!!editorForGoal(item, editors[index]).grounding}
              onOpen={() => setActiveGoal(index)}
              onRemove={() => remove(index)}
              onMoveUp={index > 0 ? () => moveUp(index) : undefined}
            />
          ))}
          {plan.goals.length < 3 && <button type="button" className="nuth-button-secondary smart-objective-add" onClick={() => add()}>
            <Plus size={17} aria-hidden="true" /> Agregar objetivo
          </button>}
        </div>
        {goal && goalEditor && (
          <ObjectiveGoalEditor
            key={selected}
            id={editorId}
            text={goalEditor.text ?? goalEditor.basis}
            issue={editorIssues[selected]?.issue}
            goal={goal}
            index={selected}
            signs={signs}
            approved={approved}
            cause={pes?.etiology}
            grounding={goalEditor.grounding}
            pending={approved ? [] : pendingByGoal[selected]}
            onPending={focusGoal}
            onText={text => editText(selected, text)}
            onChange={patch => update(selected, patch)}
          />
        )}
      </fieldset>
      {text.length > maxLength && <p role="alert" className="clinical-notice is-warning">
        Resume los objetivos a {maxLength} caracteres en total antes de aprobar.
      </p>}
      {approvalPending && <p id={approvalPendingId} className="smart-objective-approval-note">
        {plan.goals.length === 1 ? 'Revisa los campos marcados en el objetivo.'
          : `${completeGoals} de ${plan.goals.length} objetivos completos. Completa los pendientes para aprobar el conjunto.`}
      </p>}
      {(goal || dirty) && actions}
      {message && <p role="status" className="smart-objective-message">{message}</p>}
      {(pes || !!workspace?.facts.length) && <details className="clinical-support-details smart-objective-source">
        <summary>{pes ? 'PES aprobado' : 'Datos de la consulta'}</summary>
        {pes && <dl>
          <div><dt>Etiología</dt><dd>{pes.etiology}</dd></div>
          <div><dt>Signos y síntomas</dt><dd className="whitespace-pre-line">{pes.signsSymptoms}</dd></div>
        </dl>}
        {!!workspace?.facts.length && <details>
          <summary>Consultar datos de valoración registrados</summary>
          <ul className="consultation-context-facts">
            {workspace.facts.map((fact, index) => <li key={index}><strong>{fact.source}</strong><p>{fact.finding}</p></li>)}
          </ul>
        </details>}
      </details>}
      {props.reviewBatch && props.active !== false && patientId && <ClinicalBatchStageRevision
        feature="consultation_support" patientId={patientId} consultationId={consultationId}
        revision={revision} before={before} blocked={locked || assistance?.state === 'uncertain'}
        renderAction={action => <details className="clinical-support-details smart-objective-source">
          <summary>Más opciones de IA</summary>
          <button type="button" className="nuth-button-secondary !text-sm"
            disabled={action.disabled} onClick={action.open}>{action.label}</button>
        </details>}
      />}
      {replacement && <ClinicalTaskDialog open title="Revisar propuesta de objetivos"
        description={approved
          ? "Si la usas, los objetivos actuales se sustituirán y la nueva versión quedará pendiente de aprobación."
          : "Si la usas, estos objetivos sustituirán los del borrador actual."}
        onClose={() => setReplacementId(null)}
        footer={<>
          <button type="button" className="nuth-button-secondary" onClick={() => setReplacementId(null)}>Conservar objetivos actuales</button>
          <button type="button" className="nuth-button" disabled={locked}
            onClick={useReplacement}>Usar como borrador</button>
        </>}>
        <div className="clinical-batch-comparison">
          <section><h3>Objetivos actuales</h3><p>{text || legacy}</p></section>
          <section><h3>Propuesta de IA</h3><ol>
            {replacement.plan.goals.map((item, index) => <li key={index}>{item.outcome}</li>)}
          </ol></section>
        </div>
      </ClinicalTaskDialog>}
    </section>
  );
}
