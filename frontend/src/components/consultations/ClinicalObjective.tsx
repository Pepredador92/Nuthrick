import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Check, Plus, Target } from "lucide-react";
import {
  ClinicalStatusBadge,
  type ClinicalTaskStatus,
} from "./ClinicalTaskCard";
import {
  ObjectiveGoalEditor,
  ObjectiveGoalSummary,
  objectiveReady,
  type ObjectiveProposalEvidence,
} from "./ObjectiveGoalEditor";
import { formatObjectiveEditorText, objectiveEditorFieldOffset, readObjectiveEditorText, withObjectiveTemplateGaps, type ObjectiveEditorField } from "@/src/features/consultations/objectiveEditorText";
import {
  clinicalObjective,
  type ObjectiveWorkspace,
} from "@/src/services/clinicalCopilot";
import { ConsultationObjectiveAI } from "./ConsultationObjectiveAI";
import { useClinicalBatchProposal } from "./ClinicalBatchAI";
import { ClinicalTaskDialog } from "./ClinicalTaskDialog";
import {useConsultationDraft,useConsultationDraftContext} from './ConsultationDrafts';
import {changedAnswers} from '@/src/features/consultations/answerAutosave';
import { hasUsablePesEtiology } from '../../../../supabase/functions/_shared/pes';
import {
  composeObjective,
  emptyObjective,
  isObjectivePlan,
  type ObjectiveGoal,
  objectiveIssues,
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
  onApplySuggestion?: (text: string) => void;
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
type GoalReplacement = { goals: ObjectiveGoal[]; generationId: string; grounding: ObjectiveProposalEvidence[] };

function editorForGoal(goal: ObjectiveGoal, entry?: GoalEditor) {
  const basis = formatObjectiveEditorText(goal);
  return entry?.basis === basis ? entry : { basis };
}

function editorIssue(goal: ObjectiveGoal, entry?: GoalEditor) {
  const saved = editorForGoal(goal, entry).text;
  if (saved === undefined) return;
  const result = readObjectiveEditorText(saved);
  if ('issue' in result) return result.issue;
}

export function ClinicalObjective(props: Props) {
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
  } = props;
  const cacheKey =
    `objective-draft:${consultationId}:${revision}:${questionKey}`;
  const [plan, setPlan] = useConsultationDraft<ObjectivePlan>(`objective:${questionKey}`,() => {
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
  const [editors, setEditors] = useConsultationDraft<GoalEditor[]>(`objective-text-editor:${questionKey}`, () => {
    try {
      const value: unknown = JSON.parse(sessionStorage.getItem(`${cacheKey}:editor`) || '[]');
      return Array.isArray(value) ? value as GoalEditor[] : [];
    } catch {
      return [];
    }
  });
  const dirtyRef = useRef(dirty);
  useEffect(()=>{
    if(dirtyRef.current&&checkpoint&&!Object.hasOwn(checkpoint.values,`objective:${questionKey}`)){setPlan(plan);setDirty(true);}
  },[checkpoint,questionKey,plan,setPlan,setDirty]);
  const [workspace, setWorkspace] = useState<ObjectiveWorkspace | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [replacement, setReplacement] = useState<GoalReplacement | null>(null);
  const saving = useRef(false);
  const batch = useClinicalBatchProposal('consultation_support');
  const [activeGoal, setActiveGoal] = useConsultationDraft<number | null>(`objective-editor:${questionKey}`,null);
  const editorId = useId();
  const selected = Math.min(Math.max(0, activeGoal ?? 0), plan.goals.length - 1);
  const goal = plan.goals[selected];
  const goalEditor = goal ? editorForGoal(goal, editors[selected]) : undefined;
  const editorIssues = plan.goals.map((goal, index) => editorIssue(goal, editors[index]));
  const malformed = editorIssues.some(Boolean);
  const text = plan.goals.map(composeObjective).filter(Boolean).join("\n\n");
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
  const issues = plan.goals.flatMap((goal, index) =>
    (editorIssues[index] ? [editorIssues[index]] : objectiveIssues(goal)).map(issue => `Objetivo ${index + 1}: ${issue}`)
  );
  const pesChanged = !!workspace?.pes && plan.goals.length > 0 &&
    plan.pesApprovedAt !== workspace.pes.approved_at;
  const signs =
    [...new Set(workspace?.pes?.signsSymptoms?.split("\n").map(sign => sign.trim()).filter(Boolean) ?? [])];
  const replaceBlocked = busy || !workspace || workspace.objective?.question_key === questionKey;
  const hasPreviousGoals = plan.goals.length > 0 || !!legacy.trim();
  const staleSigns = plan.goals.some((goal) => !signs.includes(goal.sign));
  const completeGoals =
    plan.goals.filter((goal, index) => !editorIssues[index] && objectiveReady(goal, signs)).length;
  const ready = !!plan.goals.length && !issues.length && !staleSigns &&
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
    setPlan(next);
    if (nextEditors !== editors) setEditors(nextEditors);
    dirtyRef.current = true;
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
  function add(goal: ObjectiveGoal = { ...emptyObjective(), textStyle: 'patient_v1' }, grounding?: ObjectiveProposalEvidence) {
    if (plan.goals.length >= 3) return;
    setActiveGoal(plan.goals.length);
    const next = grounding
      ? { ...withObjectiveTemplateGaps(goal), agreement: 'pending' as const }
      : { ...goal, sign: goal.sign || (signs.length === 1 ? signs[0] : '') };
    change({
      ...plan,
      pesApprovedAt: plan.goals.length
        ? plan.pesApprovedAt
        : workspace?.pes?.approved_at ?? "",
      goals: [...plan.goals, next],
    }, [...plan.goals.map((goal, index) => editorForGoal(goal, editors[index])), { basis: formatObjectiveEditorText(next), grounding }]);
    focusGoal();
  }
  function batchGoalsToPlan(goals: ObjectiveGoal[]): ObjectivePlan {
    return {
      version: 1,
      pesApprovedAt: workspace?.pes?.approved_at ?? "",
      goals: goals.map(goal => ({ ...withObjectiveTemplateGaps(goal), agreement: "pending" })),
    };
  }
  function applyBatchGoals(goals: ObjectiveGoal[], generationId: string, grounding: ObjectiveProposalEvidence[], confirmed = false) {
    const next = batchGoalsToPlan(goals);
    if (replaceBlocked || batch.stale || batch.proposal?.generationId !== generationId ||
      !goals.length || !isObjectivePlan(next)) return;
    if (next.goals.map(composeObjective).join("\n\n").length > maxLength) {
      setMessage("La propuesta supera el espacio disponible. Puedes agregar los objetivos uno por uno y editar el texto.");
      return;
    }
    if (hasPreviousGoals && !confirmed) {
      setReplacement({ goals, generationId, grounding });
      return;
    }
    setReplacement(null);
    setActiveGoal(0);
    change(next, next.goals.map((goal, index) => ({ basis: formatObjectiveEditorText(goal), grounding: grounding[index] })));
    setMessage("La propuesta nueva está en el borrador. Revisa los objetivos y guarda cuando estén listos.");
  }
  async function persist(action: "save" | "approve" | "revoke") {
    if (saving.current || (action === 'approve' && !ready)) return false;
    saving.current = true;
    setBusy(true);
    setMessage("");
    try {
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
    const index = plan.goals.findIndex((goal, index) => editorIssues[index] || !objectiveReady(goal, signs));
    if (index < 0) return;
    setActiveGoal(index);
    setMessage("");
    const goal = plan.goals[index];
    const fields: ObjectiveEditorField[] = ['outcome', 'etiology', 'target', 'indicator', 'baseline', 'timeframe', 'monitoring', 'feasibility'];
    const missing = fields.find(field => !goal[field].trim());
    focusGoal(
      editorIssues[index] ? undefined : missing ?? (signs.includes(goal.sign) ? 'agreement' : 'sign'),
    );
  }
  function focusGoal(field?: ObjectiveEditorField | 'sign' | 'agreement') {
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
        input.setSelectionRange(offset, offset);
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

  const actions = <div className="smart-objective-actions">
    {!ready && !approved && completeGoals < plan.goals.length && <button type="button" className="clinical-text-action" onClick={showPending}>
      Ir al siguiente pendiente <ArrowRight size={15} aria-hidden="true" />
    </button>}
    <button type="button" className="nuth-button-secondary !text-sm" disabled={busy || !dirty} onClick={() => void persist('save')}>
      Guardar borrador
    </button>
    <button type="button" className="nuth-button !text-sm" disabled={busy || !ready || approved} onClick={() => void persist('approve')}>
      {busy ? 'Guardando…' : 'Aprobar objetivos'}
    </button>
    {approved && <button type="button" className="nuth-button-secondary !text-sm" disabled={busy} onClick={() => void persist('revoke')}>
      Volver a revisar
    </button>}
  </div>;

  return (
    <section
      aria-label="Revisión del objetivo"
      className="clinical-objectives-workspace"
    >
      <div className="clinical-objective-overview">
        <span className="clinical-stage-icon">
          <Target size={22} aria-hidden="true" />
        </span>
        <div>
          <h3>Un objetivo a la vez</h3>
          <p>Redacta hasta tres objetivos SMART y acuerda cómo van a revisar el avance.</p>
        </div>
        <ClinicalStatusBadge status={status}>
          {approved
            ? "Aprobados"
            : dirty
            ? "Borrador por revisar"
            : ready
            ? "Listos para revisar"
            : "Pendientes de revisión"}
        </ClinicalStatusBadge>
      </div>
      {workspace?.pes
        ? (
          <details className="clinical-context-strip">
            <summary>
              <Check size={16} aria-hidden="true" />
              <span>PES aprobado</span>
              <small>Consultar causa y evidencia</small>
            </summary>
            <dl>
              <div>
                <dt>Etiología</dt>
                <dd>{workspace.pes.etiology}</dd>
              </div>
              <div>
                <dt>Signos y síntomas</dt>
                <dd className="whitespace-pre-line">
                  {workspace.pes.signsSymptoms}
                </dd>
              </div>
            </dl>
          </details>
        )
        : (
          <p className="clinical-notice">
            Puedes redactar y guardar un borrador. Para aprobarlo, revisa
            primero el PES.
          </p>
        )}
      {pesChanged && (
        <div role="alert" className="clinical-notice is-warning">
          <p>
            El PES cambió. Revisa la causa, el signo y las metas antes de volver
            a aprobar.
          </p>
          <button
            type="button"
            className="nuth-button-secondary mt-3 !text-xs"
            disabled={busy}
            onClick={() =>
              change({
                ...plan,
                pesApprovedAt: workspace?.pes?.approved_at ?? "",
              })}
          >
            Vincular al PES actual
          </button>
        </div>
      )}
      {patientId && (
        <>
          {workspace?.pes && !hasUsablePesEtiology(workspace.pes.etiology) && <aside role="status" className="clinical-notice is-warning"><p>Para proponer objetivos vinculados desde este paso, completa la etiología del PES. Puedes revisar los objetivos de valoración que se hayan generado en la propuesta completa.</p>{props.onReviewPes&&<button type="button" className="clinical-text-action" onClick={props.onReviewPes}>Completar etiología del PES<ArrowRight size={15}/></button>}</aside>}
          <ConsultationObjectiveAI draftKey={questionKey} compactObjectives
            key={workspace?.pes?.approved_at ?? "no-pes"}
            patientId={patientId}
            consultationId={consultationId}
            revision={revision}
            before={before}
            reviewBatch={props.reviewBatch}
            batchDraft={props.reviewBatch ? {
              label: hasPreviousGoals ? "Sustituir objetivos del borrador" : "Incorporar propuesta al borrador",
              blocked: replaceBlocked,
              contains: goals => objectivePlansEqual(plan, batchGoalsToPlan(goals)),
              use: applyBatchGoals,
            } : undefined}
            approvedPes={workspace?.pes}
            assessmentApplyDisabled={busy || !workspace || plan.goals.length >= 3}
            disabled={busy || !workspace?.pes || !hasUsablePesEtiology(workspace.pes.etiology) || plan.goals.length >= 3}
            onApply={(text) => add({ ...emptyObjective(), outcome: text, textStyle: 'patient_v1' }, { evidence: [] })}
            onApplyGoal={add}
          />
        </>
      )}
      {!plan.goals.length && legacy && (
        <div className="clinical-legacy-objective">
          <strong>Objetivo registrado anteriormente</strong>
          <p>{legacy}</p>
          <button
            type="button"
            className="nuth-button-secondary !text-xs"
            disabled={busy || legacy.length > 400}
            onClick={() => add({ ...emptyObjective(), outcome: legacy })}
          >
            Usar texto como resultado esperado
          </button>
        </div>
      )}
      {workspace?.objective && !workspace.objective.smart_plan && (
        <p className="clinical-notice">
          Aprobación anterior conservada. Revisa los criterios SMART para una
          nueva aprobación.
        </p>
      )}
      {!plan.goals.length && (
        <div className="clinical-empty-state">
          <span className="clinical-stage-icon">
            <Target size={24} aria-hidden="true" />
          </span>
          <h4>¿Qué quieren lograr primero?</h4>
          <p>
            Agrega el primer objetivo o usa una propuesta de IA como punto de
            partida.
          </p>
        </div>
      )}
      <fieldset disabled={busy} className="smart-objective-layout">
        <legend className="sr-only">Redacción de objetivos SMART</legend>
        <div className="smart-objective-list">
          {plan.goals.map((item, index) => (
            <ObjectiveGoalSummary
              key={index}
              goal={item}
              index={index}
              active={index === selected}
              signs={signs}
              approved={approved}
              contextReady={!!workspace?.pes && !pesChanged}
              fromAI={!!editorForGoal(item, editors[index]).grounding}
              problem={!!editorIssues[index]}
              onOpen={() => setActiveGoal(index)}
              onRemove={() => remove(index)}
              onMoveUp={index > 0 ? () => moveUp(index) : undefined}
            />
          ))}
          <button type="button" className="nuth-button-secondary smart-objective-add"
            disabled={plan.goals.length >= 3} onClick={() => add()}>
            <Plus size={17} aria-hidden="true" /> Agregar objetivo
          </button>
        </div>
        {goal && goalEditor && (
          <ObjectiveGoalEditor
            key={selected}
            id={editorId}
            text={goalEditor.text ?? goalEditor.basis}
            issue={editorIssues[selected]}
            goal={goal}
            index={selected}
            signs={signs}
            approved={approved}
            cause={workspace?.pes?.etiology}
            grounding={goalEditor.grounding}
            onText={text => editText(selected, text)}
            onChange={patch => update(selected, patch)}
          >
            {actions}
          </ObjectiveGoalEditor>
        )}
      </fieldset>
      {!goal && dirty && actions}
      {replacement && <ClinicalTaskDialog open title="Sustituir objetivos del borrador"
        description="Revisa qué objetivos quedarán en el editor y confirma el cambio."
        onClose={() => setReplacement(null)}
        footer={<>
          <button type="button" className="nuth-button-secondary" onClick={() => setReplacement(null)}>Conservar borrador actual</button>
          <button type="button" className="nuth-button" disabled={replaceBlocked || batch.stale || batch.proposal?.generationId !== replacement.generationId}
            onClick={() => applyBatchGoals(replacement.goals, replacement.generationId, replacement.grounding, true)}>Confirmar sustitución</button>
        </>}>
        <div className="clinical-batch-comparison">
          <section><h3>Borrador actual</h3><p>{text || legacy}</p></section>
          <section><h3>Nueva propuesta</h3><p>{replacement.goals.map(composeObjective).join("\n\n")}</p></section>
        </div>
      </ClinicalTaskDialog>}
      <details className="clinical-support-details">
        <summary>Consultar datos de valoración registrados</summary>
        <ul className="consultation-context-facts">
          {workspace?.facts.map((fact, index) => (
            <li key={index}>
              <strong>{fact.source}</strong>
              <p>{fact.finding}</p>
            </li>
          ))}
        </ul>
      </details>
      {text.length > maxLength && (
        <p role="alert" className="clinical-notice is-warning">
          El texto de los objetivos supera el límite de {maxLength}{" "}
          caracteres de esta pregunta. Resume los enunciados antes de guardar.
        </p>
      )}
      {plan.goals.length > 0 && !approved && !ready && <details className="clinical-support-details">
        <summary>Qué falta para aprobar</summary>
        <ul>
          {issues.map((issue, index) => <li key={index}>{issue}</li>)}
          {staleSigns && <li>Selecciona un signo del PES vigente para cada objetivo.</li>}
          {!workspace?.pes && <li>Revisa y aprueba primero el PES.</li>}
          {pesChanged && <li>Vincula los objetivos al PES actual.</li>}
        </ul>
      </details>}
      {message && <p role="status" className="clinical-notice">{message}</p>}
    </section>
  );
}
