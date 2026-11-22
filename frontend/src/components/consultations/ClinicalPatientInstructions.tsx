import { useEffect, useId, useRef, useState } from "react";
import { Check, Pencil } from "lucide-react";
import { AIButton } from "@/src/components/ai/AIControls";
import type { ClinicalTaskStatus } from "./ClinicalTaskCard";
import { ClinicalStatusBadge } from "./ClinicalTaskCard";
import { ClinicalSuggestionsAI, type InstructionAssistance } from "./ConsultationObjectiveAI";
import { useConsultationDraft, useConsultationDraftContext } from "./ConsultationDrafts";
import { ClinicalFieldCards } from "./ClinicalFieldCards";
import { ClinicalBatchStageRevision } from "./ClinicalBatchAI";
import {
  formatInstructionsEditor, instructionEditorFields, parseInstructionsEditor, type InstructionField,
} from "@/src/features/consultations/instructionsEditor";
import { questionErrors, questionTextMaxLength, type Answers, type Question } from "@/src/features/consultations/questionnaire";
import {
  PATIENT_INSTRUCTIONS_DOCUMENT_MAX_LENGTH, patientInstructionText, patientInstructionValue,
} from "../../../../supabase/functions/_shared/patient-instructions";
import "./ClinicalPatientInstructions.css";

type Props = {
  consultationId: string;
  patientId: string;
  revision: number;
  active: boolean;
  busy: boolean;
  questions: Question[];
  values: Answers;
  before: () => Promise<boolean>;
  saveDraft: () => Promise<boolean>;
  onApprove: (changes: Answers) => Promise<boolean>;
  onCompleted: () => void;
  onChangeOtherAnswer: (key: string, value: unknown) => void;
  onStatusChange: (status: ClinicalTaskStatus) => void;
};
type Evidence = InstructionAssistance["suggestions"][number]["evidence"];
type Draft = { fields: InstructionField[]; text: string; generation?: string; evidence?: Evidence };

export function ClinicalPatientInstructions(props: Props) {
  const fields = instructionEditorFields(props.questions);
  const extra = props.questions.filter(question => !fields.some(field => field.key === question.question_key));
  const { onStatusChange } = props;
  const hasEditor = fields.length > 0;
  useEffect(() => {
    if (!hasEditor) onStatusChange("pending");
  }, [hasEditor, onStatusChange]);
  return (
    <>
      {fields.length ? <ClinicalSuggestionsAI
        kind="instructions" active={props.active} reviewBatch draftKey={fields[0].key} disabled={props.busy}
        patientId={props.patientId} consultationId={props.consultationId} revision={props.revision} before={props.before}
        renderInstructions={assistance => <InstructionEditor {...props} fields={fields} assistance={assistance} />}
      /> : <p className="clinical-notice">Los apartados disponibles de este guion aparecen abajo.</p>}
      {!!extra.length && <details className="clinical-support-details">
        <summary>Otros campos del guion</summary>
        <ClinicalFieldCards questions={extra} values={props.values} busy={props.busy} showErrors={false}
          before={props.saveDraft} onChange={props.onChangeOtherAnswer} />
      </details>}
    </>
  );
}

function InstructionEditor({
  fields, values, questions, assistance, busy, saveDraft, onApprove, onCompleted, onStatusChange,
  patientId, consultationId, revision, before,
}: Props & { fields: InstructionField[]; assistance: InstructionAssistance }) {
  const id = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const checkpoints = useConsultationDraftContext();
  const [draft, setDraft] = useConsultationDraft<Draft | null>("instructions-editor", null);
  const [approved, setApproved] = useConsultationDraft<string | null>("instructions-approved", null);
  const [evidence, setEvidence] = useConsultationDraft<Evidence>("instructions-approved-evidence", []);
  const [handled, setHandled] = useConsultationDraft<string | null>("instructions-editor-generation", null);
  const [action, setAction] = useState<"save" | "approve" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const published = Object.fromEntries(fields.map(({ key }) => [key, patientInstructionValue(values[key])]));
  const hasPublished = Object.values(published).some(Boolean);
  const publishedText = formatInstructionsEditor(fields, published);
  const signature = patientInstructionText(published);
  const savedApproval = hasPublished && approved === signature;
  const candidateText = assistance.suggestions.map(suggestion => suggestion.text).join("\n\n");
  const candidateId = assistance.generationId ?? (candidateText ? JSON.stringify(assistance.suggestions.map(item => item.text)) : null);
  const candidate = candidateText && candidateId && handled !== candidateId && draft?.generation !== candidateId ? {
    fields, generation: candidateId,
    text: formatInstructionsEditor(fields, { [fields[0].key]: candidateText }),
    evidence: [...new Map(assistance.suggestions.flatMap(item => item.evidence)
      .map(fact => [JSON.stringify([fact.source, fact.finding]), fact] as const)).values()],
  } : null;
  const working = draft ?? (!hasPublished && !assistance.stale ? candidate : null);
  const text = working?.text ?? (hasPublished ? signature : publishedText);
  const editedFields = working?.fields ?? fields;
  const layoutChanged = JSON.stringify(editedFields) !== JSON.stringify(fields);
  const stale = !!working?.generation && assistance.stale && working.generation === candidateId;
  const editable = !!working || !hasPublished;
  const source = editable ? working?.evidence ?? [] : savedApproval ? evidence : [];
  const parsed = working && !layoutChanged ? parseInstructionsEditor(fields, text) : null;
  const emptyDraft = parsed && "values" in parsed && !Object.values(parsed.values).some(Boolean);
  const status: ClinicalTaskStatus = !editable && savedApproval ? "approved" : working || hasPublished ? "progress" : "pending";
  useEffect(() => onStatusChange(status), [onStatusChange, status]);
  const locked = busy || action !== null;
  const generating = assistance.state === "generating";
  const alternate = candidate && candidate !== working ? candidate : null;

  function focusText() {
    requestAnimationFrame(() => textarea.current?.focus());
  }
  function edit(value: string) {
    setError("");
    setMessage("");
    setDraft({ ...working, fields: editedFields, text: value });
  }
  function applyCandidate(next: Draft) {
    if (layoutChanged || (parsed && "issue" in parsed)) {
      setError("Revisa los encabezados del borrador antes de incorporar la propuesta.");
      focusText();
      return;
    }
    setDraft({ ...next, text: formatInstructionsEditor(fields, {
      ...published, ...(parsed && "values" in parsed ? parsed.values : {}), [fields[0].key]: candidateText,
    }) });
    setError("");
    setMessage("");
    focusText();
  }
  async function save() {
    if (locked) return;
    setAction("save");
    setError("");
    setMessage("");
    try {
      if (working && !draft) setDraft(working);
      if (!await saveDraft()) throw new Error("No pudimos guardar el borrador. Tu texto sigue aquí.");
      setMessage("Borrador guardado.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos guardar el borrador.");
    } finally {
      setAction(null);
    }
  }
  async function approve() {
    if (locked || layoutChanged || generating) return;
    setError("");
    setMessage("");
    const result = parsed ?? parseInstructionsEditor(fields, text);
    if ("issue" in result) { setError(result.issue); focusText(); return; }
    const changes = result.values;
    const selected = questions.filter(question => fields.some(field => field.key === question.question_key));
    for (const question of selected) {
      const value = changes[question.question_key as keyof typeof changes] ?? "";
      const issue = questionErrors(question, value)[0];
      if (issue || value.length > questionTextMaxLength(question)) {
        setError(issue ? `${question.label}. ${issue}` : `El apartado «${question.label}» supera la longitud del guion.`);
        focusText();
        return;
      }
    }
    const combined = patientInstructionText(Object.fromEntries(questions.map(question => [question.question_key,
      Object.hasOwn(changes, question.question_key) ? changes[question.question_key as keyof typeof changes] : values[question.question_key],
    ])));
    if (combined.length > PATIENT_INSTRUCTIONS_DOCUMENT_MAX_LENGTH) {
      setError("Las indicaciones superan el espacio disponible en Super Link. Ajusta el texto antes de aprobarlo.");
      focusText();
      return;
    }
    setAction("approve");
    try {
      // Keep a working copy until the canonical answers are saved successfully.
      if (working && !draft) setDraft(working);
      if (!await onApprove(changes)) throw new Error("No pudimos guardar la aprobación. Tu texto sigue aquí.");
      setApproved(patientInstructionText(changes));
      setEvidence(working?.evidence ?? []);
      if (working?.generation) setHandled(working.generation);
      setDraft(null);
      const checkpointSaved = !checkpoints || await checkpoints.flush();
      if (!checkpointSaved) setMessage("El texto se guardó en la consulta. Reintenta el guardado del avance antes de salir.");
      onCompleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos aprobar las indicaciones.");
    } finally {
      setAction(null);
    }
  }

  function refreshLayout() {
    const parsed = parseInstructionsEditor(editedFields, text);
    if ("issue" in parsed) { setError(parsed.issue); focusText(); return; }
    setDraft({ ...working, fields, text: formatInstructionsEditor(fields, { ...published, ...parsed.values }) });
    setError("");
  }

  return <article className="clinical-instruction-editor" aria-label="Editor de indicaciones" id={`question-${fields[0].key}`}>
    <header className="clinical-instruction-toolbar">
      <div>
        <label htmlFor={id}>Texto para el paciente</label>
        {status !== "pending" && <ClinicalStatusBadge status={savedApproval && !editable ? "approved" : "progress"}>
          {!editable ? savedApproval ? "Aprobadas" : "Guardadas" : working?.generation ? "Borrador de IA" : "Borrador"}
        </ClinicalStatusBadge>}
      </div>
      <div>
        {!editable && <button type="button" className="nuth-button-secondary !text-xs" disabled={locked} onClick={() => {
          setDraft({ fields, text: publishedText, evidence: source });
          setMessage(""); setError(""); focusText();
        }}><Pencil size={15} aria-hidden="true" />Editar indicaciones</button>}
        {(!savedApproval || editable) && <ClinicalBatchStageRevision feature="patient_instructions" patientId={patientId}
          consultationId={consultationId} revision={revision} blocked={locked || generating} before={before}
          renderAction={action => <AIButton capability="ai.patient_instructions" className="instruction-generate-button"
            state={assistance.state} disabled={action.disabled} onClick={action.open}>
            {action.label === "Revisar nueva propuesta" ? action.label : "Regenerar con IA"}
          </AIButton>}
          fallback={<AIButton capability="ai.patient_instructions" className="instruction-generate-button" state={assistance.state}
            disabled={locked} onClick={() => {
              if (working && !draft) setDraft(working);
              setMessage(""); setError(""); void assistance.generate();
            }}>
            {hasPublished || working?.generation ? "Regenerar con IA" : "Proponer indicaciones con IA"}
          </AIButton>} />}
      </div>
    </header>
    <textarea id={id} ref={textarea} className="nuth-input clinical-instruction-text" value={text}
      rows={9} readOnly={locked || !editable} aria-invalid={!!error || undefined} aria-describedby={`${id}-help`}
      data-approved={savedApproval && !editable}
      placeholder="Escribe qué hará el paciente, cuándo y qué revisarán juntos."
      onChange={event => edit(event.target.value)} />
    <p id={`${id}-help`} className="clinical-instruction-hint">
      {editable && fields.length > 1 ? "Escribe debajo de los encabezados de tu guion. " : ""}
      {editable ? "Usa palabras sencillas y habla de tú. Generar usa créditos de IA." : "Puedes volver a editar el texto desde esta consulta."}
    </p>
    {!!source.length && <details className="clinical-support-details">
      <summary>Datos que usó la IA</summary>
      <ul className="mt-3 space-y-2 text-xs">
        {source.map((fact, index) => <li key={index}><strong>{fact.source}</strong><p className="whitespace-pre-wrap">{fact.finding}</p></li>)}
      </ul>
    </details>}
    {alternate && <details className="clinical-support-details">
      <summary>Revisar otra propuesta de IA</summary>
      <p className="clinical-instruction-preview">{candidateText}</p>
      {assistance.stale ? <p className="clinical-notice is-warning">Cambió un paso anterior. Revisa la propuesta con los acuerdos vigentes.</p>
        : <button type="button" className="nuth-button-secondary mt-2 !text-xs" disabled={locked || generating}
          onClick={() => applyCandidate(alternate)}>Usar este texto</button>}
      <button type="button" className="clinical-text-action mt-2" disabled={locked} onClick={() => setHandled(alternate.generation ?? null)}>Descartar propuesta</button>
    </details>}
    {(stale || (working?.generation && assistance.assessment && working.generation === candidateId)) &&
      <p className="clinical-notice">Revisa el borrador con los acuerdos vigentes antes de aprobar.</p>}
    {layoutChanged && <div className="clinical-notice">
      <p>Cambiaron los apartados visibles del guion.</p>
      <button type="button" className="clinical-text-action" disabled={locked} onClick={refreshLayout}>Actualizar apartados</button>
    </div>}
    {assistance.state === "uncertain" && <button type="button" className="nuth-button-secondary mt-2 !text-xs"
      disabled={locked} onClick={() => void assistance.checkStatus()}>Comprobar solicitud</button>}
    {assistance.message && <p role="status" className="clinical-instruction-hint">{assistance.message}</p>}
    {message && <p role="status" className="clinical-instruction-hint">{message}</p>}
    {error && <p role="alert" className="clinical-notice is-warning">{error}</p>}
    <footer className="clinical-instruction-footer">
      <p>Disponibles para compartir en Super Link después del cierre.</p>
      {editable && <div>
        <button type="button" className="nuth-button-secondary !text-xs" disabled={locked || !working}
          onClick={() => void save()}>{action === "save" ? "Guardando…" : "Guardar borrador"}</button>
        <button type="button" className="nuth-button !text-xs" disabled={locked || generating || layoutChanged || !working || !!emptyDraft && !hasPublished}
          onClick={() => void approve()}><Check size={15} aria-hidden="true" />
          {action === "approve" ? "Guardando…" : hasPublished && emptyDraft ? "Quitar indicaciones" : "Aprobar indicaciones"}
        </button>
      </div>}
    </footer>
  </article>;
}
