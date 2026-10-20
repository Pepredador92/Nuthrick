import { ArrowRight, ArrowUp, Check, ChevronDown, Trash2 } from "lucide-react";
import {
  composeObjective,
  type ObjectiveGoal,
  objectiveIssues,
} from "../../../../supabase/functions/_shared/objectives";
import { ClinicalStatusBadge, ClinicalTaskCard } from "./ClinicalTaskCard";

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
    title: "El cambio que buscamos",
    description: "Resultado y relación con el PES",
    keys: ["outcome", "etiology", "sign"],
  },
  {
    title: "Cómo sabremos que avanzó",
    description: "Punto de partida, meta y seguimiento",
    keys: ["indicator", "baseline", "target", "timeframe", "monitoring"],
  },
  {
    title: "Lo que acordaron",
    description: "Viabilidad y acuerdo con la persona",
    keys: ["feasibility", "agreement"],
  },
] as const;

export function objectiveFieldComplete(
  goal: ObjectiveGoal,
  key: keyof ObjectiveGoal,
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

export function ObjectiveGoalEditor(
  {
    id,
    goal,
    index,
    signs,
    expanded,
    activePart,
    approved,
    onExpand,
    onPartChange,
    onChange,
    onRemove,
    onMoveUp,
  }: {
    id: string;
    goal: ObjectiveGoal;
    index: number;
    signs: string[];
    expanded: boolean;
    activePart: number | null;
    approved: boolean;
    onExpand: () => void;
    onPartChange: (part: number | null) => void;
    onChange: (patch: Partial<ObjectiveGoal>) => void;
    onRemove: () => void;
    onMoveUp?: () => void;
  },
) {
  const completed = objectiveCompletedFields(goal, signs);
  const ready = completed === 10 && !objectiveIssues(goal).length;
  const status = approved
    ? "approved"
    : ready
    ? "complete"
    : completed
    ? "progress"
    : "pending";
  function field(key: keyof typeof fields) {
    const [label, hint] = fields[key];
    const complete = objectiveFieldComplete(goal, key, signs);
    return (
      <label
        key={key}
        className={`clinical-goal-field${complete ? " is-complete" : ""}`}
      >
        <span>
          {label}
          {complete && <Check size={14} aria-label="Registrado" />}
        </span>
        <textarea
          aria-label={`${label} · objetivo ${index + 1}`}
          className="nuth-input"
          rows={key === "etiology" || key === "feasibility" ? 3 : 2}
          maxLength={key === "etiology" ? 1500 : 400}
          value={goal[key]}
          placeholder={hint}
          onChange={(event) => onChange({ [key]: event.target.value })}
        />
      </label>
    );
  }
  return (
    <section
      className="clinical-goal-card"
      data-status={status}
      aria-label={`Objetivo ${index + 1}`}
    >
      <header className="clinical-goal-heading">
        <button
          type="button"
          onClick={onExpand}
          aria-expanded={expanded}
          aria-controls={`${id}-body`}
        >
          <span className="clinical-goal-priority">{index + 1}</span>
          <span>
            <strong>Objetivo {index + 1}</strong>
            <small>
              {goal.outcome.trim() || "Define un cambio con tu paciente"}
            </small>
          </span>
          <ClinicalStatusBadge status={status}>
            {approved
              ? "Aprobado"
              : ready
              ? "Listo para revisar"
              : `${completed} de 10 criterios`}
          </ClinicalStatusBadge>
          <ChevronDown size={18} aria-hidden="true" />
        </button>
        <div className="clinical-goal-tools">
          {onMoveUp && (
            <button
              type="button"
              onClick={onMoveUp}
              aria-label="Subir prioridad"
              title="Subir prioridad"
            >
              <ArrowUp size={16} />
              <span>Subir prioridad</span>
            </button>
          )}
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Quitar objetivo ${index + 1}`}
            title={`Quitar objetivo ${index + 1}`}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </header>
      <div id={`${id}-body`} hidden={!expanded} className="clinical-goal-body">
        <div className="clinical-goal-progress">
          <span>{completed} de 10 criterios registrados</span>
          <progress
            value={completed}
            max={10}
            aria-label={`Avance del objetivo ${index + 1}`}
          />
        </div>
        <div className="clinical-objective-parts">
          {objectiveParts.map((part, partIndex) => {
            const count = objectivePartProgress(goal, partIndex, signs);
            return (
              <ClinicalTaskCard
                key={part.title}
                id={`${id}-part-${partIndex}`}
                marker={partIndex + 1}
                title={part.title}
                description={part.description}
                status={count === part.keys.length
                  ? "complete"
                  : count
                  ? "progress"
                  : "pending"}
                statusLabel={count === part.keys.length
                  ? "Completo"
                  : `${count} de ${part.keys.length}`}
                open={activePart === partIndex}
                onToggle={() =>
                  onPartChange(activePart === partIndex ? null : partIndex)}
              >
                <div className="clinical-goal-field-grid">
                  {part.keys.map((key) => {
                    if (key === "sign") {
                      return (
                        <label
                          key={key}
                          className={`clinical-goal-field${
                            objectiveFieldComplete(goal, key, signs)
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
                              <option key={sign} value={sign}>{sign}</option>
                            ))}
                          </select>
                          {goal.sign && !signs.includes(goal.sign) && (
                            <small className="clinical-inline-warning">
                              Selecciona un signo del PES vigente.
                            </small>
                          )}
                        </label>
                      );
                    }
                    if (key === "agreement") {
                      return (
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
                        </label>
                      );
                    }
                    return field(key);
                  })}
                </div>
                {partIndex < objectiveParts.length - 1 && (
                  <button
                    type="button"
                    className="clinical-next-part"
                    onClick={() => onPartChange(partIndex + 1)}
                  >
                    {partIndex === 0
                      ? "Continuar con la medición"
                      : "Continuar con el acuerdo"}
                    <ArrowRight size={15} />
                  </button>
                )}
              </ClinicalTaskCard>
            );
          })}
        </div>
        <details className="clinical-objective-preview">
          <summary>Ver enunciado del objetivo</summary>
          <output aria-label={`Enunciado del objetivo ${index + 1}`}>
            {composeObjective(goal) ||
              "Completa el resultado y sus criterios de seguimiento."}
          </output>
        </details>
      </div>
    </section>
  );
}
