import { type Ref, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import {
  composeObjective,
  type ObjectiveGoal,
  objectiveIssues,
} from "../../../../supabase/functions/_shared/objectives";
import { ClinicalStatusBadge } from "./ClinicalTaskCard";

const fields = {
  outcome: ["Resultado esperado", "¿Qué cambio quieren lograr?"],
  etiology: [
    "Causa del PES que se abordará",
    "¿Cómo responde este cambio a la causa del PES?",
  ],
  indicator: [
    "Indicador de seguimiento",
    "Qué medirán y en qué unidad o escala.",
  ],
  baseline: [
    "Situación inicial y fecha",
    "De dónde parten y cuándo se registró. Si falta el dato, indica cómo lo obtendrán.",
  ],
  target: [
    "Meta o criterio de logro",
    "Qué valor, rango o conducta indicará un avance.",
  ],
  timeframe: ["Plazo de reevaluación", "Fecha, duración o próxima consulta."],
  monitoring: [
    "Cómo se evaluará",
    "Cómo registrarán el avance y con qué frecuencia.",
  ],
  feasibility: [
    "Viabilidad, barreras y preferencias",
    "Qué necesita la persona para llevarlo a cabo.",
  ],
} as const;

export const objectiveParts = [
  {
    title: "Cambio",
    heading: "¿Qué quieren lograr?",
    description: "Define el cambio y su relación con el diagnóstico.",
    keys: ["outcome", "etiology", "sign"],
  },
  {
    title: "Meta",
    heading: "¿Cómo reconocerán el avance?",
    description: "Acuerda una meta concreta y el punto de partida.",
    keys: ["target", "indicator", "baseline"],
  },
  {
    title: "Seguimiento",
    heading: "¿Cuándo y cómo lo revisarán?",
    description: "Define el plazo y una forma sencilla de registrar el avance.",
    keys: ["timeframe", "monitoring"],
  },
  {
    title: "Acuerdo",
    heading: "¿Es viable y lo acordaron?",
    description: "Conversa las barreras y registra el acuerdo con la persona.",
    keys: ["feasibility", "agreement"],
  },
] as const;

export function objectiveFieldComplete(
  goal: ObjectiveGoal,
  key: (typeof objectiveParts)[number]["keys"][number],
  signs: string[],
) {
  if (key === "agreement") {
    return goal.agreement === "patient" || goal.agreement === "caregiver";
  }
  if (key === "sign") {
    return !!goal.sign.trim() && goal.sign.length <= 2000 &&
      signs.includes(goal.sign);
  }
  return !!goal[key].trim() &&
    goal[key].length <= (key === "etiology" ? 1500 : 400);
}
export function objectivePartProgress(
  goal: ObjectiveGoal,
  part: number,
  signs: string[],
) {
  return objectiveParts[part].keys.filter((key) =>
    objectiveFieldComplete(goal, key, signs)
  ).length;
}
export function firstIncompleteObjectivePart(
  goal: ObjectiveGoal,
  signs: string[],
) {
  const index = objectiveParts.findIndex((part, index) =>
    objectivePartProgress(goal, index, signs) < part.keys.length
  );
  return index < 0 ? 0 : index;
}
export function objectiveCompletedFields(goal: ObjectiveGoal, signs: string[]) {
  return objectiveParts.reduce(
    (total, _, index) => total + objectivePartProgress(goal, index, signs),
    0,
  );
}

export function ObjectiveGoalSummary(
  { goal, index, signs, approved, onOpen, onRemove, onMoveUp, reviewRef }: {
    goal: ObjectiveGoal;
    index: number;
    signs: string[];
    approved: boolean;
    onOpen: () => void;
    onRemove: () => void;
    onMoveUp?: () => void;
    reviewRef?: Ref<HTMLButtonElement>;
  },
) {
  const complete = objectiveCompletedFields(goal, signs) === 10 &&
    !objectiveIssues(goal).length;
  const status = approved ? "approved" : complete ? "complete" : "progress";
  return (
    <section
      className="clinical-goal-card clinical-goal-summary"
      data-status={status}
      aria-label={`Objetivo ${index + 1}`}
    >
      <div className="clinical-goal-summary-heading">
        <span className="clinical-goal-priority" aria-hidden="true">
          {index + 1}
        </span>
        <div>
          <small>Objetivo {index + 1}</small>
          <h4>{goal.outcome.trim() || "Define un cambio con tu paciente"}</h4>
        </div>
        <ClinicalStatusBadge status={status}>
          {approved
            ? "Aprobado"
            : complete
            ? "Listo para aprobar"
            : goal.agreement === "pending" &&
                objectiveCompletedFields(goal, signs) === 9
            ? "Por acordar"
            : "Por completar"}
        </ClinicalStatusBadge>
      </div>
      <dl className="clinical-goal-summary-facts">
        <div>
          <dt>Meta</dt>
          <dd>{goal.target || "Por definir"}</dd>
        </div>
        <div>
          <dt>Revisión</dt>
          <dd>{goal.timeframe || "Por definir"}</dd>
        </div>
      </dl>
      <div className="clinical-goal-summary-actions">
        <button
          ref={reviewRef}
          type="button"
          className="clinical-text-action"
          aria-label={`Revisar objetivo ${index + 1}`}
          aria-haspopup="dialog"
          onClick={onOpen}
        >
          <Pencil size={15} aria-hidden="true" />
          {approved ? "Consultar o editar" : "Revisar objetivo"}
          <ArrowRight size={15} aria-hidden="true" />
        </button>
        <div className="clinical-goal-tools">
          {onMoveUp && (
            <button
              type="button"
              onClick={onMoveUp}
              aria-label="Subir prioridad"
              title="Subir prioridad"
            >
              <ArrowUp size={16} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Quitar objetivo ${index + 1}`}
            title={`Quitar objetivo ${index + 1}`}
          >
            <Trash2 size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}

/** A focused editor; the consultation keeps ownership of saving and clinical approval. */
export function ObjectiveGoalEditor(
  {
    id,
    goal,
    index,
    signs,
    initialPart,
    busy,
    message,
    saveDisabled,
    dirty,
    onChange,
    onClose,
    onSave,
  }: {
    id: string;
    goal: ObjectiveGoal;
    index: number;
    signs: string[];
    initialPart: number;
    busy: boolean;
    message: string;
    saveDisabled: boolean;
    dirty: boolean;
    onChange: (patch: Partial<ObjectiveGoal>) => void;
    onClose: () => void;
    onSave: () => void;
  },
) {
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [part, setPart] = useState(initialPart);
  const [pesOpen, setPesOpen] = useState(() =>
    !(objectiveFieldComplete(goal, "etiology", signs) &&
      objectiveFieldComplete(goal, "sign", signs))
  );
  const completed = objectiveCompletedFields(goal, signs);
  const saveLabel = busy ? "Guardando…" : dirty ? "Guardar y cerrar" : "Listo";
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element?.showModal?.();
    document.body.style.overflow = "hidden";
    title.current?.focus();
    return () => {
      if (element?.open) element.close?.();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  function goToPart(next: number) {
    setPart(next);
    requestAnimationFrame(() => {
      if (body.current) body.current.scrollTop = 0;
      document.getElementById(`${id}-step-${next}`)?.focus();
    });
  }
  function field(key: keyof typeof fields) {
    const [label, hint] = fields[key];
    const complete = objectiveFieldComplete(goal, key, signs);
    const proposed = goal.agreement === "pending" &&
      ((key === "target" && goal.targetOrigin === "proposed") ||
        (key === "timeframe" && goal.timeframeOrigin === "proposed"));
    return (
      <label
        key={key}
        className={`clinical-goal-field${complete ? " is-complete" : ""}`}
      >
        <span>
          {label}
          {complete && <Check size={14} aria-label="Registrado" />}
        </span>
        {proposed && (
          <small>Propuesta de IA · ajusta y acuerda con la persona</small>
        )}
        <textarea
          aria-label={`${label} · objetivo ${index + 1}`}
          className="nuth-input"
          rows={2}
          maxLength={key === "etiology" ? 1500 : 400}
          value={goal[key]}
          placeholder={hint}
          onChange={(event) => onChange({ [key]: event.target.value })}
        />
      </label>
    );
  }
  const pesComplete = objectiveFieldComplete(goal, "etiology", signs) &&
    objectiveFieldComplete(goal, "sign", signs);
  return (
    <dialog
      ref={dialog}
      className="clinical-objective-dialog clinical-objectives-workspace"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-help`}
      open={typeof HTMLDialogElement === "undefined" ||
        !HTMLDialogElement.prototype.showModal}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="clinical-objective-dialog-shell">
        <header className="clinical-objective-dialog-heading">
          <div>
            <p className="nuth-eyebrow">Objetivo {index + 1}</p>
            <h2 ref={title} tabIndex={-1} id={`${id}-title`}>
              Revisa y acuerda este objetivo
            </h2>
            <p id={`${id}-help`}>
              Un paso a la vez. Puedes guardar y continuar después.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            aria-label="Cerrar revisión del objetivo"
          >
            <X size={21} aria-hidden="true" />
          </button>
        </header>
        <nav
          className="clinical-objective-stepper"
          aria-label="Pasos del objetivo"
        >
          {objectiveParts.map((item, step) => {
            const complete =
              objectivePartProgress(goal, step, signs) === item.keys.length;
            return (
              <button
                type="button"
                key={item.title}
                disabled={busy}
                aria-current={part === step ? "step" : undefined}
                aria-controls={`${id}-panel-${step}`}
                onClick={() => goToPart(step)}
                data-complete={complete}
              >
                <span aria-hidden="true">
                  {complete ? <Check size={15} /> : step + 1}
                </span>
                <span>{item.title}</span>
                <span className="sr-only">
                  {complete ? "Completo" : "Pendiente"}
                </span>
              </button>
            );
          })}
        </nav>
        <div ref={body} className="clinical-objective-dialog-body">
          <div className="clinical-goal-progress">
            <span>Paso {part + 1} de {objectiveParts.length}</span>
            <progress
              value={completed}
              max={10}
              aria-label={`Avance del objetivo ${index + 1}`}
            />
          </div>
          <fieldset disabled={busy}>
            {objectiveParts.map((item, step) => (
              <section
                key={item.title}
                id={`${id}-panel-${step}`}
                hidden={part !== step}
                aria-labelledby={`${id}-step-${step}`}
                className="clinical-objective-step"
              >
                <h3 id={`${id}-step-${step}`} tabIndex={-1}>{item.heading}</h3>
                <p>{item.description}</p>
                <div className="clinical-objective-step-fields">
                  {step === 0
                    ? (
                      <>
                        {field("outcome")}
                        <details
                          className="clinical-objective-pes-link"
                          open={pesOpen}
                          onToggle={(event) =>
                            setPesOpen(event.currentTarget.open)}
                        >
                          <summary>
                            Vinculación con el PES<ClinicalStatusBadge
                              status={pesComplete ? "complete" : "pending"}
                            >
                              {pesComplete ? "Registrada" : "Por completar"}
                            </ClinicalStatusBadge>
                          </summary>
                          <div>
                            {field("etiology")}
                            <label
                              className={`clinical-goal-field${
                                objectiveFieldComplete(goal, "sign", signs)
                                  ? " is-complete"
                                  : ""
                              }`}
                            >
                              <span>Signo o síntoma del PES</span>
                              <select
                                aria-label={`Signo o síntoma del PES · objetivo ${
                                  index + 1
                                }`}
                                className="nuth-input"
                                value={goal.sign}
                                onChange={(event) =>
                                  onChange({ sign: event.target.value })}
                              >
                                <option value="">
                                  Selecciona qué evidencia reevaluarás
                                </option>
                                {goal.sign && !signs.includes(goal.sign) && (
                                  <option value={goal.sign}>
                                    {goal.sign} · revisar vigencia
                                  </option>
                                )}
                                {signs.map((sign) => (
                                  <option key={sign} value={sign}>
                                    {sign}
                                  </option>
                                ))}
                              </select>
                              {goal.sign && !signs.includes(goal.sign) && (
                                <small className="clinical-inline-warning">
                                  Selecciona un signo del PES vigente.
                                </small>
                              )}
                            </label>
                          </div>
                        </details>
                      </>
                    )
                    : item.keys.map((key) =>
                      key === "agreement"
                        ? (
                          <label
                            key={key}
                            className={`clinical-goal-field${
                              objectiveFieldComplete(goal, key, signs)
                                ? " is-complete"
                                : ""
                            }`}
                          >
                            <span>Acuerdo con la persona</span>
                            <select
                              aria-label={`Acuerdo · objetivo ${index + 1}`}
                              className="nuth-input"
                              value={goal.agreement}
                              onChange={(event) =>
                                onChange({
                                  agreement: event.target
                                    .value as ObjectiveGoal["agreement"],
                                })}
                            >
                              <option value="pending">
                                Pendiente de conversar
                              </option>
                              <option value="patient">
                                Acordado con el paciente
                              </option>
                              <option value="caregiver">
                                Acordado con cuidador o representante
                              </option>
                            </select>
                            <small>
                              Registra el acuerdo después de conversarlo.
                            </small>
                          </label>
                        )
                        : key !== "sign" && field(key)
                    )}
                </div>
                {step === 3 && (
                  <details className="clinical-objective-preview">
                    <summary>Ver texto completo del objetivo</summary>
                    <output aria-label={`Enunciado del objetivo ${index + 1}`}>
                      {composeObjective(goal) ||
                        "Completa el resultado y sus criterios de seguimiento."}
                    </output>
                  </details>
                )}
              </section>
            ))}
          </fieldset>
          {saveDisabled && (
            <p role="alert" className="clinical-notice is-warning">
              Resume los objetivos para respetar el límite de texto de la
              consulta.
            </p>
          )}
          {message && <p role="status" className="clinical-notice">{message}
          </p>}
        </div>
        <footer className="clinical-objective-dialog-footer">
          <button
            type="button"
            className="clinical-text-action"
            disabled={busy}
            onClick={() => part > 0 ? goToPart(part - 1) : onClose()}
          >
            {part > 0 && <ArrowLeft size={15} />}
            {part > 0 ? "Volver" : "Continuar después"}
          </button>
          <div>
            {part < objectiveParts.length - 1 && (
              <button
                type="button"
                className="nuth-button-secondary"
                disabled={busy || saveDisabled}
                onClick={onSave}
              >
                {saveLabel}
              </button>
            )}
            <button
              type="button"
              className="nuth-button"
              disabled={busy ||
                (part === objectiveParts.length - 1 && saveDisabled)}
              onClick={() =>
                part < objectiveParts.length - 1
                  ? goToPart(part + 1)
                  : onSave()}
            >
              {part === objectiveParts.length - 1 ? saveLabel : (
                <>
                  Continuar<ArrowRight size={15} aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
