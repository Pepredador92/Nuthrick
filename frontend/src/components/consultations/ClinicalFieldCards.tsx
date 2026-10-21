import { useRef, useState } from "react";
import { ArrowLeft, ArrowRight, FileText, Pencil } from "lucide-react";
import { AIButton } from "@/src/components/ai/AIControls";
import {
  type Answers,
  emptyValue,
  formatAnswer,
  type Question,
  questionErrors,
} from "@/src/features/consultations/questionnaire";
import {
  appendComposedText,
  composeInterviewDraft,
} from "@/src/features/consultations/composeClinicalText";
import { QuestionField } from "./QuestionField";
import { ClinicalStatusBadge } from "./ClinicalTaskCard";
import { ClinicalTaskDialog } from "./ClinicalTaskDialog";
import { ClinicalSuggestionsAI } from "./ConsultationObjectiveAI";

type AIContext = {
  patientId: string;
  consultationId: string;
  revision: number;
};

/** Uses the original question controls and canonical answers, including autosave. */
export function ClinicalFieldCards(
  { questions, values, busy, showErrors, before, onChange, ai }: {
    questions: Question[];
    values: Answers;
    busy: boolean;
    showErrors: boolean;
    before: () => Promise<boolean>;
    onChange: (key: string, value: unknown) => void;
    ai?: AIContext;
  },
) {
  const editor = useRef<HTMLFieldSetElement>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "preview" | "ai">("edit");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const question = questions.find((item) => item.question_key === selected);
  const instruction = questions.find((item) =>
    ["first_actions", "patient_instructions", "recommendations"].includes(
      item.question_key,
    ) &&
    ["long_text", "short_text"].includes(item.question_type)
  );
  const open = selected !== null && (!!question || mode === "ai");
  function edit(item: Question) {
    setError("");
    setMode("edit");
    setSelected(item.question_key);
  }
  async function save() {
    if (busy || saving) return;
    setSaving(true);
    setError("");
    try {
      if (!await before()) {
        throw new Error(
          "No se pudieron guardar los cambios. Tu texto sigue aquí; vuelve a intentarlo.",
        );
      }
      setSelected(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudieron guardar los cambios.",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="clinical-next-workspace clinical-stage">
      {ai && instruction && (
        <div className="clinical-next-toolbar">
          <span>Redacta tus indicaciones o revisa una propuesta.</span>
          <AIButton
            capability="ai.patient_instructions"
            disabled={busy}
            onClick={() => {
              setError("");
              setMode("ai");
              setSelected(instruction.question_key);
            }}
          >
            Proponer indicaciones con IA
          </AIButton>
        </div>
      )}
      <div className="clinical-next-grid">
        {questions.map((item) => {
          const hasValue = !emptyValue(values[item.question_key]);
          const issues = questionErrors(item, values[item.question_key]);
          const ready = hasValue && !issues.length;
          return (
            <article
              className="clinical-next-card"
              data-status={ready
                ? "complete"
                : hasValue
                ? "progress"
                : "pending"}
              key={item.question_key}
            >
              <header>
                <FileText size={19} aria-hidden="true" />
                <h3>{item.label}</h3>
              </header>
              <ClinicalStatusBadge
                status={ready ? "complete" : hasValue ? "progress" : "pending"}
              >
                {ready
                  ? "Listo para revisar"
                  : hasValue
                  ? "En curso"
                  : "Sin registrar"}
              </ClinicalStatusBadge>
              <p className="clinical-next-excerpt">
                {hasValue
                  ? formatAnswer(item, values[item.question_key])
                  : item.help_text ||
                    "Abre esta tarjeta y registra lo acordado."}
              </p>
              <button
                type="button"
                className="clinical-text-action"
                disabled={busy}
                onClick={() => edit(item)}
              >
                <Pencil size={15} aria-hidden="true" />
                {hasValue ? "Revisar y editar" : "Redactar"}
                <span className="sr-only">: {item.label}</span>
              </button>
            </article>
          );
        })}
      </div>
      <ClinicalTaskDialog
        open={open}
        busy={busy || saving}
        onClose={() => setSelected(null)}
        title={mode === "ai"
          ? "Propuestas de indicaciones"
          : question?.label || "Indicaciones"}
        description={mode === "ai"
          ? "Genera borradores y elige uno para adaptarlo antes de guardarlo."
          : "Redacta en palabras sencillas y revisa el texto completo antes de terminar."}
        footer={mode === "ai"
          ? (
            <button
              type="button"
              className="nuth-button-secondary"
              disabled={busy || saving}
              onClick={() => setSelected(null)}
            >
              Volver a las tarjetas
            </button>
          )
          : (
            <>
              <button
                type="button"
                className="clinical-text-action"
                disabled={busy || saving}
                onClick={() => setMode(mode === "edit" ? "preview" : "edit")}
              >
                {mode === "preview" ? <ArrowLeft size={15} /> : null}
                {mode === "edit" ? "Vista previa" : "Editar texto"}
                {mode === "edit" ? <ArrowRight size={15} /> : null}
              </button>
              <button
                type="button"
                className="nuth-button"
                disabled={busy || saving}
                onClick={() => void save()}
              >
                {saving ? "Guardando…" : "Guardar y cerrar"}
              </button>
            </>
          )}
      >
        <div hidden={mode !== "ai"}>
          {ai && instruction && (
            <ClinicalSuggestionsAI
              {...ai}
              kind="instructions"
              compactInstructions
              before={before}
              disabled={busy || saving}
              onApply={(text) => {
                onChange(
                  instruction.question_key,
                  appendComposedText(values[instruction.question_key], text),
                );
                setSelected(instruction.question_key);
                setMode("edit");
                setError("");
                requestAnimationFrame(() =>
                  editor.current?.querySelector<HTMLElement>(
                    "textarea,input,select,button",
                  )?.focus()
                );
              }}
            />
          )}
        </div>
        {question && mode !== "ai" && (
          <>
            <nav className="clinical-next-tabs" aria-label="Revisión del texto">
              <button
                type="button"
                aria-current={mode === "edit" ? "step" : undefined}
                onClick={() => setMode("edit")}
              >
                1 · Redacción
              </button>
              <button
                type="button"
                aria-current={mode === "preview" ? "step" : undefined}
                onClick={() => setMode("preview")}
              >
                2 · Vista previa
              </button>
            </nav>
            {mode === "edit"
              ? (
                <fieldset ref={editor} disabled={busy || saving}>
                  <QuestionField
                    key={question.question_key}
                    question={question}
                    value={values[question.question_key]}
                    onChange={(value) => onChange(question.question_key, value)}
                    errors={showErrors ||
                        !emptyValue(values[question.question_key])
                      ? questionErrors(question, values[question.question_key])
                      : []}
                  />
                  {question.question_type === "long_text" &&
                    composeInterviewDraft(question.question_key, values) && (
                    <details className="clinical-suggestion-preview">
                      <summary>Datos para apoyar la redacción</summary>
                      <p>
                        {composeInterviewDraft(question.question_key, values)}
                      </p>
                      <button
                        type="button"
                        className="clinical-text-action"
                        onClick={() =>
                          onChange(
                            question.question_key,
                            appendComposedText(
                              values[question.question_key],
                              composeInterviewDraft(
                                question.question_key,
                                values,
                              ),
                            ),
                          )}
                      >
                        Redactar con datos registrados
                      </button>
                    </details>
                  )}
                </fieldset>
              )
              : (
                <div className="clinical-next-preview">
                  <h3>Texto registrado</h3>
                  <p>
                    {emptyValue(values[question.question_key])
                      ? "Todavía no has registrado contenido."
                      : formatAnswer(question, values[question.question_key])}
                  </p>
                </div>
              )}
            {ai && instruction && (
              <button
                type="button"
                disabled={busy || saving}
                className="clinical-text-action"
                onClick={() => setMode("ai")}
              >
                Ver propuestas de IA
              </button>
            )}
          </>
        )}
        {error && (
          <p role="alert" className="clinical-notice is-warning">{error}</p>
        )}
      </ClinicalTaskDialog>
    </div>
  );
}
