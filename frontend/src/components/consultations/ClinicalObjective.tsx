import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, Check, Plus, Target } from "lucide-react";
import {
  ClinicalStatusBadge,
  type ClinicalTaskStatus,
} from "./ClinicalTaskCard";
import {
  firstIncompleteObjectivePart,
  objectiveCompletedFields,
  ObjectiveGoalEditor,
  ObjectiveGoalSummary,
} from "./ObjectiveGoalEditor";
import {
  clinicalObjective,
  type ObjectiveWorkspace,
} from "@/src/services/clinicalCopilot";
import { ConsultationObjectiveAI } from "./ConsultationObjectiveAI";
import {
  composeObjective,
  emptyObjective,
  isObjectivePlan,
  type ObjectiveGoal,
  objectiveIssues,
  type ObjectivePlan,
  objectivePlansEqual,
} from "../../../../supabase/functions/_shared/objectives";

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
};
const blankPlan = (): ObjectivePlan => ({
  version: 1,
  pesApprovedAt: "",
  goals: [],
});
export function ClinicalObjective(props: Props) {
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
  const [plan, setPlan] = useState<ObjectivePlan>(() => {
    try {
      const cached: unknown = JSON.parse(
        sessionStorage.getItem(cacheKey) || "null",
      );
      return isObjectivePlan(cached) ? cached : blankPlan();
    } catch {
      return blankPlan();
    }
  });
  const [dirty, setDirty] = useState(() => {
    try {
      return isObjectivePlan(
        JSON.parse(sessionStorage.getItem(cacheKey) || "null"),
      );
    } catch {
      return false;
    }
  });
  const dirtyRef = useRef(dirty);
  const [workspace, setWorkspace] = useState<ObjectiveWorkspace | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [activeGoal, setActiveGoal] = useState<number | null>(null);
  const [activePart, setActivePart] = useState(0);
  const reviewButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const editorId = useId();
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
  const approved = !dirty && !!workspace?.objective?.smart_plan &&
    workspace?.pes?.approved_at === plan.pesApprovedAt &&
    workspace.objective.question_key === questionKey &&
    JSON.stringify(workspace.objective.value) === JSON.stringify(value) &&
    objectivePlansEqual(workspace.objective.smart_plan, plan);
  const issues = plan.goals.flatMap((goal, index) =>
    objectiveIssues(goal).map((issue) => `Objetivo ${index + 1}: ${issue}`)
  );
  const pesChanged = !!workspace?.pes && plan.goals.length > 0 &&
    plan.pesApprovedAt !== workspace.pes.approved_at;
  const signs =
    workspace?.pes?.signsSymptoms?.split("\n").map((sign) => sign.trim())
      .filter(Boolean) ?? [];
  const staleSigns = plan.goals.some((goal) => !signs.includes(goal.sign));
  const completeGoals =
    plan.goals.filter((goal) =>
      objectiveCompletedFields(goal, signs) === 10 &&
      !objectiveIssues(goal).length
    ).length;
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
  }, [consultationId, revision, questionKey, active, props.contextVersion]);
  // Recovered drafts also restore the existing interview answer, which remains
  // the canonical text used by closure, exports and explicit portal publication.
  const onChangeRef = useRef(props.onChangeText);
  useEffect(() => {
    onChangeRef.current = props.onChangeText;
  }, [props.onChangeText]);
  useEffect(() => {
    if (dirtyRef.current && text.length <= maxLength) {
      onChangeRef.current?.(text, plan.goals.map(composeObjective));
    }
  }, [text, maxLength, plan.goals]);
  function change(next: ObjectivePlan) {
    setPlan(next);
    dirtyRef.current = true;
    setDirty(true);
    setMessage("");
    sessionStorage.setItem(cacheKey, JSON.stringify(next));
    const texts = next.goals.map(composeObjective).filter(Boolean);
    const composed = texts.join("\n\n");
    if (composed.length <= maxLength) props.onChangeText?.(composed, texts);
  }
  function update(index: number, patch: Partial<ObjectiveGoal>) {
    change({
      ...plan,
      goals: plan.goals.map((goal, i) =>
        i === index ? { ...goal, ...patch } : goal
      ),
    });
  }
  function add(goal = emptyObjective()) {
    if (plan.goals.length >= 3) return;
    goal = {
      ...goal,
      etiology: goal.etiology || workspace?.pes?.etiology || "",
      sign: goal.sign || (signs.length === 1 ? signs[0] : ""),
    };
    setActiveGoal(plan.goals.length);
    setActivePart(0);
    change({
      ...plan,
      pesApprovedAt: plan.goals.length
        ? plan.pesApprovedAt
        : workspace?.pes?.approved_at ?? "",
      goals: [...plan.goals, goal],
    });
  }
  async function persist(action: "save" | "approve" | "revoke") {
    setBusy(true);
    setMessage("");
    try {
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
      if (action === "approve") props.onCompleted?.();
      dirtyRef.current = false;
      setDirty(false);
      sessionStorage.removeItem(cacheKey);
      setMessage(
        action === "approve"
          ? "Objetivos aprobados para seguimiento."
          : action === "save"
          ? "Borrador guardado. Puedes continuar y revisarlo después."
          : "Objetivos pendientes de revisión.",
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
      setBusy(false);
    }
  }
  function showPending() {
    const index = plan.goals.findIndex((goal) =>
      objectiveCompletedFields(goal, signs) < 10 || objectiveIssues(goal).length
    );
    if (index < 0) return;
    const part = firstIncompleteObjectivePart(plan.goals[index], signs);
    setActiveGoal(index);
    setActivePart(part);
    setMessage("");
  }
  function closeEditor() {
    const index = activeGoal;
    setActiveGoal(null);
    requestAnimationFrame(() => {
      if (index !== null) reviewButtons.current[index]?.focus();
    });
  }
  async function saveEditor() {
    if (!dirty || await persist("save")) closeEditor();
  }

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
          <p>
            Elige hasta tres prioridades. Abre cada objetivo para revisar la
            meta y acordarla con la persona.
          </p>
        </div>
        <ClinicalStatusBadge status={status}>
          {approved
            ? "Aprobados"
            : dirty
            ? "Borrador sin guardar"
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
      <fieldset disabled={busy} className="clinical-goals-list">
        {plan.goals.map((goal, index) => (
          <ObjectiveGoalSummary
            key={index}
            goal={goal}
            index={index}
            signs={signs}
            approved={approved}
            reviewRef={(element) => {
              reviewButtons.current[index] = element;
            }}
            onOpen={() => {
              setActiveGoal(index);
              setActivePart(firstIncompleteObjectivePart(goal, signs));
              setMessage("");
            }}
            onRemove={() => {
              change({
                ...plan,
                goals: plan.goals.filter((_, i) => i !== index),
              });
            }}
            onMoveUp={index > 0
              ? () => {
                const goals = [...plan.goals];
                [goals[index - 1], goals[index]] = [
                  goals[index],
                  goals[index - 1],
                ];
                change({ ...plan, goals });
              }
              : undefined}
          />
        ))}
        <button
          type="button"
          aria-label="Agregar objetivo"
          className={plan.goals.length
            ? "nuth-button-secondary clinical-add-objective"
            : "nuth-button clinical-add-objective"}
          disabled={plan.goals.length >= 3}
          onClick={() => add()}
        >
          <Plus size={17} />Agregar objetivo{plan.goals.length > 0 && (
            <span>{plan.goals.length} de 3</span>
          )}
        </button>
      </fieldset>
      {patientId && (
        <ConsultationObjectiveAI
          key={workspace?.pes?.approved_at ?? "no-pes"}
          patientId={patientId}
          consultationId={consultationId}
          revision={revision}
          before={before}
          disabled={busy || !workspace?.pes || plan.goals.length >= 3}
          onApply={(text) =>
            add({ ...emptyObjective(), outcome: text.slice(0, 400) })}
          onApplyGoal={(goal) => add(goal)}
        />
      )}
      {activeGoal !== null && plan.goals[activeGoal] && (
        <ObjectiveGoalEditor
          key={activeGoal}
          id={`${editorId}-${activeGoal}`}
          goal={plan.goals[activeGoal]}
          index={activeGoal}
          signs={signs}
          initialPart={activePart}
          busy={busy}
          message={message}
          dirty={dirty}
          saveDisabled={text.length > maxLength}
          onChange={(patch) => update(activeGoal, patch)}
          onClose={closeEditor}
          onSave={() => void saveEditor()}
        />
      )}
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
      {(plan.goals.length > 0 || dirty) && (
        <div
          className="clinical-approval-card"
          data-status={approved ? "approved" : ready ? "complete" : "progress"}
        >
          <div className="clinical-approval-copy">
            <span className="clinical-stage-icon">
              {approved || ready
                ? <Check size={20} aria-hidden="true" />
                : <Target size={20} aria-hidden="true" />}
            </span>
            <div>
              <h4>
                {approved
                  ? "Objetivos aprobados"
                  : !plan.goals.length
                  ? "Borrador sin objetivos"
                  : ready
                  ? "Todo listo para tu revisión"
                  : `${completeGoals} de ${plan.goals.length} objetivos listos para revisar`}
              </h4>
              <p>
                {approved
                  ? "Puedes continuar con la estrategia de intervención."
                  : !plan.goals.length
                  ? "Guarda el borrador para confirmar que retiraste los objetivos."
                  : ready
                  ? "Confirma que las metas son viables y representan lo acordado con la persona."
                  : "Completa los criterios y registra el acuerdo antes de aprobar."}
              </p>
            </div>
          </div>
          {!ready && !approved && completeGoals < plan.goals.length && (
            <button
              type="button"
              className="clinical-next-part"
              onClick={showPending}
            >
              Ir al siguiente pendiente<ArrowRight size={15} />
            </button>
          )}
          <div className="clinical-approval-actions">
            <button
              type="button"
              className="nuth-button-secondary !text-sm"
              disabled={busy || !dirty || text.length > maxLength}
              onClick={() => void persist("save")}
            >
              Guardar borrador
            </button>
            <button
              type="button"
              className="nuth-button !text-sm"
              disabled={busy || !ready || approved}
              onClick={() => void persist("approve")}
            >
              {busy ? "Guardando…" : "Aprobar objetivos"}
            </button>
            {approved && (
              <button
                type="button"
                className="nuth-button-secondary !text-sm"
                disabled={busy}
                onClick={() => void persist("revoke")}
              >
                Volver a revisar
              </button>
            )}
          </div>
          <details className="clinical-approval-details">
            <summary>Qué falta para aprobar</summary>
            <ul>
              {issues.map((issue, index) => <li key={index}>{issue}</li>)}
              {staleSigns && (
                <li>Selecciona un signo del PES vigente para cada objetivo.</li>
              )}
              {!workspace?.pes && <li>Revisa y aprueba primero el PES.</li>}
              {pesChanged && <li>Vincula los objetivos al PES actual.</li>}
              {!issues.length && !staleSigns && workspace?.pes && !pesChanged &&
                (
                  <li>
                    Revisa la pertinencia clínica y que lo documentado
                    represente lo acordado.
                  </li>
                )}
            </ul>
          </details>
        </div>
      )}
      {message && <p role="status" className="clinical-notice">{message}</p>}
    </section>
  );
}
