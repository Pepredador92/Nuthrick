import { useEffect, useId, useRef, useState } from "react";
import { ArrowRight, ClipboardCheck, ClipboardList, FileDown, Route, Target, X } from "lucide-react";
import { PdfExportDialog } from "@/src/components/documents/PdfExportDialog";
import { Input, Textarea } from "@/src/components/ui/FormField";
import { ErrorState, LoadingState, SuccessNote } from "@/src/components/ui/Status";
import {
  activeProgressGoals, emptyGoalAssessment, emptyStrategyAssessment, goalStatuses, originalProgress, progressReviewedAfterVisit, progressSourceKey, sourcePrecedesVisit, strategyStatuses,
  type ProgressDocument, type ProgressGoal, type ProgressReview, type ProgressSource, type ProgressStrategy,
} from "@/src/features/progress/clinicalProgress";
import { consultationLabel, formatPatientDate } from "@/src/features/patients/patientUtils";
import { listProgressReviews, listProgressSources, saveProgressReview } from "@/src/services/clinicalProgress";
import type { Consultation, Patient } from "@/src/types/domain";
import "./ClinicalProgress.css";

const emptySources: ProgressSource[] = [];
const sourceLabel = (source: ProgressSource) => `${consultationLabel(source)} · ${formatPatientDate(source.consultation_date)}`;
const headline = (text: string, fallback: string) => text.trim().split("\n")[0] || fallback;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Intenta nuevamente.";

function useProgressSources(patientId: string, enabled: boolean, refreshKey: string) {
  const [sources, setSources] = useState<ProgressSource[] | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let ignore = false;
    void listProgressSources(patientId).then((data) => {
      if (!ignore) {
        setSources((previous) => data.map((source) => {
          const latest = previous?.find((item) => progressSourceKey(item) === progressSourceKey(source))?.latest_review;
          return latest && latest.version > (source.latest_review?.version ?? 0) ? { ...source, latest_review: latest } : source;
        }));
        setError("");
      }
    }).catch((cause: unknown) => {
      if (!ignore) setError(errorMessage(cause));
    });
    return () => { ignore = true; };
  }, [patientId, enabled, attempt, refreshKey]);
  const retry = () => { setError(""); setSources(null); setAttempt((current) => current + 1); };
  const onSaved = (key: string, review: ProgressReview) => {
    setSources((current) => current?.map((source) => progressSourceKey(source) === key ? { ...source, latest_review: review } : source) ?? null);
  };
  return { sources, error, retry, onSaved };
}

type EntryProps = {
  patient: Patient;
  consultation?: Consultation;
  historySource?: string | null;
  onHistoryClose?: () => void;
  consultationsRevision?: string;
};

export function ClinicalProgress({ patient, consultation, historySource, onHistoryClose, consultationsRevision }: EntryProps) {
  const [requestedSource, setRequestedSource] = useState<string | null>(null);
  const requested = historySource ?? requestedSource;
  const open = requested !== null;
  const data = useProgressSources(patient.id, open || !consultation, `${historySource ?? ""}:${consultationsRevision ?? ""}`);
  const allSources = data.sources ?? emptySources;
  const sources = consultation ? allSources.filter((source) => sourcePrecedesVisit(source, consultation)) : allSources;
  const goals = activeProgressGoals(sources);
  const dialog = open && <ProgressDialog key={requested}
    patient={patient}
    consultation={consultation}
    sources={sources}
    loading={!data.sources && !data.error}
    error={data.error}
    retry={data.retry}
    requestedSource={requested}
    onClose={() => { setRequestedSource(null); onHistoryClose?.(); }}
    onSaved={data.onSaved}
  />;
  if (consultation) {
    return <>
      <button type="button" className="nuth-button-secondary" onClick={() => { data.retry(); setRequestedSource(""); }}>
        <ClipboardCheck size={17} aria-hidden="true" /> Revisar progreso
      </button>
      {dialog}
    </>;
  }
  return <section className="patient-detail-card progress-summary rounded-2xl border p-5 sm:p-6" data-agreement-kind="goals" aria-labelledby="patient-progress-title">
    <header className="progress-row">
      <h2 id="patient-progress-title" className="progress-section-heading text-xl font-semibold">
        <Target size={18} aria-hidden="true" /> Progreso del paciente
      </h2>
      <button type="button" className="nuth-button-secondary" onClick={() => { data.retry(); setRequestedSource(""); }}>Ver progreso</button>
    </header>
    {data.error ? <ErrorState message={data.error} onRetry={data.retry} /> : !data.sources
      ? <p role="status">Cargando objetivos…</p>
      : goals.length ? <ul className="progress-summary-list">
        {goals.slice(0, 3).map(({ source, goal }) =>
          <li key={`${progressSourceKey(source)}:${goal.id}`}>
            <button type="button" onClick={() => { data.retry(); setRequestedSource(progressSourceKey(source)); }}>
              <span>
                <strong>{headline(goal.text, "Objetivo")}</strong>
                <small>
                  {goalStatuses[goal.assessment.status]}
                  {goal.assessment.result && ` · ${goal.assessment.result}`}
                  {goal.assessment.date && ` · ${formatPatientDate(goal.assessment.date)}`}
                </small>
              </span>
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </li>)}
        {goals.length > 3 && <li className="progress-summary-more">{goals.length - 3} más en el seguimiento</li>}
      </ul> : <p>{sources.length ? "No hay objetivos activos. Puedes abrir el progreso para consultar los acuerdos y las revisiones anteriores." : "Aquí aparecerán los objetivos acordados al cerrar una consulta."}</p>}
    {dialog}
  </section>;
}

type DialogProps = {
  patient: Patient;
  consultation?: Consultation;
  sources: ProgressSource[];
  loading: boolean;
  error: string;
  retry: () => void;
  requestedSource: string;
  onClose: () => void;
  onSaved: (key: string, review: ProgressReview) => void;
};

function ProgressDialog({ patient, consultation, sources, loading, error, retry, requestedSource, onClose, onSaved }: DialogProps) {
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [selectedKey, setSelectedKey] = useState(requestedSource);
  const [dirty, setDirty] = useState(false);
  const [locked, setLocked] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const source = selectedKey
    ? sources.find((item) => progressSourceKey(item) === selectedKey || item.id === selectedKey)
    : activeProgressGoals(sources).find(({ source }) => !consultation || !progressReviewedAfterVisit(source, consultation))?.source
      ?? sources.find((item) => item.current) ?? sources[0];

  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    if (!element?.open) element?.showModal?.();
    document.body.style.overflow = "hidden";
    return () => {
      if (element?.open) element.close?.();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  const close = () => { if (!locked) { if (dirty) setConfirmDiscard(true); else onClose(); } };
  return <dialog
    ref={dialog}
    className="progress-dialog"
    open={typeof HTMLDialogElement === "undefined" || !HTMLDialogElement.prototype.showModal}
    aria-labelledby={`${id}-title`}
    onCancel={(event) => { event.preventDefault(); close(); }}
  >
    <div className="progress-shell">
      <header className="progress-dialog-header progress-row">
        <div><h2 id={`${id}-title`}>Progreso del paciente</h2><p>{patient.full_name}</p></div>
        <button type="button" className="progress-close" aria-label="Cerrar progreso" disabled={locked} onClick={close}><X size={21} /></button>
      </header>
      {confirmDiscard ? <div className="progress-discard" role="alert">
        <p>Tienes cambios sin guardar. ¿Quieres cerrar y descartarlos?</p>
        <div className="progress-actions">
          <button type="button" className="nuth-button-secondary" onClick={() => setConfirmDiscard(false)}>Seguir editando</button>
          <button type="button" className="nuth-button-secondary" onClick={onClose}>Descartar cambios y cerrar</button>
        </div>
      </div> : null}
      {loading ? <LoadingState label="Cargando acuerdos y revisiones…" /> : error ? <div className="progress-body"><ErrorState message={error} onRetry={retry} /></div>
        : !source ? <div className="progress-body"><p>{selectedKey
          ? "Esta consulta no tiene acuerdos ni revisiones de progreso."
          : "Aún no hay acuerdos de consultas cerradas para revisar."}</p>
          {selectedKey && !!sources.length && <button type="button" className="nuth-button-secondary justify-self-start" onClick={() => setSelectedKey("")}>Ver otras consultas</button>}
        </div>
        : <>
          <div className="progress-source">
            <label htmlFor={`${id}-source`}>Consulta de origen</label>
            <select id={`${id}-source`} className="nuth-input" value={progressSourceKey(source)}
              disabled={dirty || locked} onChange={(event) => setSelectedKey(event.target.value)}>
              {sources.map((item) => <option key={progressSourceKey(item)} value={progressSourceKey(item)}>
                {sourceLabel(item)}{!item.current ? ` · Revisión anterior ${item.revision}` : ""}
              </option>)}
            </select>
          </div>
          <ProgressEntry key={progressSourceKey(source)} patient={patient} consultation={consultation}
            source={source} onStartEdit={() => setSelectedKey(progressSourceKey(source))} onDirty={setDirty} onLocked={setLocked}
            onSaved={(review) => {
              const key = progressSourceKey(source);
              setSelectedKey(key);
              onSaved(key, review);
            }}
          />
        </>}
    </div>
  </dialog>;
}

type EntryEditorProps = {
  patient: Patient;
  consultation?: Consultation;
  source: ProgressSource;
  onStartEdit: () => void;
  onDirty: (dirty: boolean) => void;
  onLocked: (locked: boolean) => void;
  onSaved: (review: ProgressReview) => void;
};

function ProgressEntry({ patient, consultation, source, onStartEdit, onDirty, onLocked, onSaved }: EntryEditorProps) {
  const id = useId();
  const [revision, setRevision] = useState("latest");
  const [older, setOlder] = useState<ProgressReview[] | null>(null);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [editing, setEditing] = useState<{ document: ProgressDocument; source: ProgressSource; base: ProgressDocument } | null>(null);
  const [recording, setRecording] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pdf, setPdf] = useState(false);
  const lock = useRef(false);
  const request = useRef<{ id: string; document: ProgressDocument } | null>(null);
  const original = originalProgress(source);
  const review = revision === "latest" ? source.latest_review : older?.find((item) => item.id === revision) ?? null;
  const saved = review?.document ?? original;
  const base = editing?.base ?? saved;
  const display = editing?.document ?? saved;
  const previousGoals = new Map(base.goals.map((goal) => [goal.id, goal.assessment]));
  const previousStrategies = new Map(base.strategies.map((strategy) => [strategy.id, strategy.assessment]));
  const submission: ProgressDocument = {
    ...display,
    instructions: display.instructions.trim() ? display.instructions : "",
    goals: display.goals.map((goal) => ({ ...goal, text: goal.text.trim(),
      assessment: recording[goal.id] ? goal.assessment : previousGoals.get(goal.id) ?? emptyGoalAssessment })),
    strategies: display.strategies.map((strategy) => ({ ...strategy, text: strategy.text.trim(),
      assessment: recording[strategy.id] ? strategy.assessment : previousStrategies.get(strategy.id) ?? emptyStrategyAssessment })),
  };
  const changed = !!editing && (JSON.stringify(submission) !== JSON.stringify(base)
    || [...display.goals, ...display.strategies].some((item) => recording[item.id]));
  const invalid = [...submission.goals, ...submission.strategies].some((item) => !item.text);
  const reviewedLater = !!consultation && progressReviewedAfterVisit(source, consultation);
  const canEdit = source.current && revision === "latest" && !reviewedLater;
  const messageDate = review ? formatPatientDate(review.recorded_at) : "";
  useEffect(() => { onDirty(changed); return () => onDirty(false); }, [changed, onDirty]);

  function beginEdit() {
    onStartEdit();
    setEditing({ document: saved, source, base: saved });
    setRecording({});
    setError("");
    setNotice("");
  }

  function change(next: ProgressDocument) {
    request.current = null;
    setEditing((current) => ({ document: next, source: current?.source ?? source, base: current?.base ?? saved }));
  }

  function addGoal() {
    change({ ...display, goals: [...display.goals, { id: crypto.randomUUID(), text: "", assessment: { ...emptyGoalAssessment } }] });
  }

  function addStrategy() {
    change({ ...display, strategies: [...display.strategies, {
      id: crypto.randomUUID(), text: "", goalIds: [], assessment: { ...emptyStrategyAssessment },
    }] });
  }

  function removeGoal(goalId: string) {
    change({
      ...display,
      goals: display.goals.filter((goal) => goal.id !== goalId),
      strategies: display.strategies.map((strategy) => ({
        ...strategy, goalIds: strategy.goalIds.filter((id) => id !== goalId),
      })),
    });
  }

  function markForReview(key: string) {
    onStartEdit();
    const keepAssessment = (visitId: string | null) => consultation ? visitId === consultation.id : false;
    change({
      ...display,
      goals: display.goals.map((goal) => goal.id === key && !keepAssessment(goal.assessment.visitId)
        ? { ...goal, assessment: { ...emptyGoalAssessment } } : goal),
      strategies: display.strategies.map((strategy) => strategy.id === key && !keepAssessment(strategy.assessment.visitId)
        ? { ...strategy, assessment: { ...emptyStrategyAssessment } } : strategy),
    });
    setRecording((items) => ({ ...items, [key]: false }));
    setError("");
    setNotice("");
  }

  const recordChange = (key: string) => setRecording((items) => ({ ...items, [key]: true }));

  async function loadHistory() {
    if (historyBusy) return;
    setHistoryBusy(true);
    setError("");
    try { setOlder(await listProgressReviews(patient.id, source)); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setHistoryBusy(false); }
  }

  async function save() {
    if (!editing || !changed || invalid || lock.current) return;
    lock.current = true;
    onLocked(true);
    setBusy(true);
    setError("");
    const visitId = consultation?.id ?? null;
    const date = consultation?.consultation_date ?? new Date().toISOString();
    request.current ??= {
      id: crypto.randomUUID(),
      document: {
        ...submission,
        goals: submission.goals.map((goal) => recording[goal.id] ? { ...goal, assessment: { ...goal.assessment, visitId, date } } : goal),
        strategies: submission.strategies.map((strategy) => recording[strategy.id] ? { ...strategy, assessment: { ...strategy.assessment, visitId, date } } : strategy),
      },
    };
    try {
      const review = await saveProgressReview(patient.id, editing.source, visitId, request.current.id, request.current.document);
      request.current = null;
      onSaved(review);
      setOlder((current) => current && [review, ...current.filter((item) => item.id !== review.id)]);
      setEditing(null);
      setRecording({});
      setNotice("Revisión guardada en el historial.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      lock.current = false;
      onLocked(false);
      setBusy(false);
    }
  }

  async function exportWord() {
    if (lock.current) return;
    lock.current = true;
    onLocked(true);
    setBusy(true);
    setError("");
    try {
      const { downloadProgressWord } = await import("@/src/features/progress/exportProgress");
      await downloadProgressWord(patient, source, review, saved);
    } catch (cause) { setError(errorMessage(cause)); }
    finally { lock.current = false; onLocked(false); setBusy(false); }
  }

  const updateGoal = (goal: ProgressGoal) => change({ ...display, goals: display.goals.map((item) => item.id === goal.id ? goal : item) });
  const updateStrategy = (strategy: ProgressStrategy) => change({ ...display, strategies: display.strategies.map((item) => item.id === strategy.id ? strategy : item) });
  const updateGoalAssessment = (goal: ProgressGoal, update: Partial<ProgressGoal["assessment"]>) => {
    recordChange(goal.id);
    updateGoal({ ...goal, assessment: { ...goal.assessment, ...update } });
  };
  return <>
    <div className="progress-body">
      <div className="progress-revisions progress-row">
        <div>
          <strong>{review ? `Revisión ${review.version} · ${messageDate}` : "Acuerdos originales"}</strong>
          {review?.review_consultation_date && <p>Seguimiento del {formatPatientDate(review.review_consultation_date)}</p>}
        </div>
        {older ? <label>Versión del registro
          <select className="nuth-input" value={revision} disabled={!!editing || busy} onChange={(event) => { setRevision(event.target.value); setError(""); setNotice(""); }}>
            <option value="latest">Versión más reciente</option>
            <option value="original">Acuerdos originales</option>
            {older.filter((item) => item.id !== source.latest_review?.id).map((item) =>
              <option key={item.id} value={item.id}>Revisión {item.version} · {formatPatientDate(item.recorded_at)}</option>)}
          </select>
        </label> : !!source.latest_review && <button type="button" className="nuth-button-secondary" disabled={!!editing || historyBusy || busy}
          onClick={() => void loadHistory()}>{historyBusy ? "Cargando historial…" : "Ver historial de revisiones"}</button>}
      </div>
      {error && !editing && <ErrorState message={error} />}
      {notice && <SuccessNote>{notice}</SuccessNote>}
      {reviewedLater && <p>Estos acuerdos se revisaron en una cita posterior. Puedes consultar el registro de esta cita en el historial de revisiones.</p>}
      <section className="progress-section" data-agreement-kind="goals" aria-labelledby={`${id}-goals`}>
        <h3 id={`${id}-goals`} className="progress-section-heading"><Target size={17} aria-hidden="true" /> Objetivos acordados</h3>
        {!display.goals.length && <p>No hay objetivos en esta versión.</p>}
        {display.goals.map((goal, index) => {
          const field = `${id}-goal-${index}`;
          const assess = Object.hasOwn(recording, goal.id);
          return <article key={goal.id} className="progress-card">
            <div className="progress-row">
              <h4>{editing ? `Objetivo ${index + 1}` : headline(goal.text, `Objetivo ${index + 1}`)}</h4>
              <span className="progress-pill">{goalStatuses[assess && !recording[goal.id] ? previousGoals.get(goal.id)?.status ?? "unreviewed" : goal.assessment.status]}</span>
            </div>
            {editing
              ? <Textarea aria-label={`Texto del objetivo ${index + 1}`} required value={goal.text} disabled={busy} onChange={(event) => updateGoal({ ...goal, text: event.target.value })} />
              : goal.text.includes("\n") && <p className="progress-text">{goal.text.split("\n").slice(1).join("\n")}</p>}
            {goal.assessment.date && <small>Última revisión · {formatPatientDate(goal.assessment.date)}</small>}
            {assess && editing ? <div className="progress-assessment">
              <label htmlFor={`${field}-status`}>¿Qué avance hubo hacia el objetivo?</label>
              <select id={`${field}-status`} value={goal.assessment.status} className="nuth-input" disabled={busy}
                onChange={(event) => updateGoalAssessment(goal, { status: event.target.value as ProgressGoal["assessment"]["status"] })}>
                {Object.entries(goalStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <label htmlFor={`${field}-result`}>Resultado observado</label>
              <Input id={`${field}-result`} placeholder="Por ejemplo, 3 de 5 días" value={goal.assessment.result} disabled={busy}
                onChange={(event) => updateGoalAssessment(goal, { result: event.target.value })} />
              <label htmlFor={`${field}-note`}>Nota de seguimiento</label>
              <Textarea id={`${field}-note`} value={goal.assessment.note} disabled={busy}
                onChange={(event) => updateGoalAssessment(goal, { note: event.target.value })} />
            </div> : <>
              {goal.assessment.result && <p className="progress-text">{goal.assessment.result}</p>}
              {goal.assessment.note && <p className="progress-text">{goal.assessment.note}</p>}
              {canEdit && <button type="button" className="nuth-button-secondary" disabled={busy}
                aria-label={`Registrar avance del objetivo ${index + 1}`}
                onClick={() => markForReview(goal.id)}>Registrar avance</button>}
            </>}
            {editing && <button type="button" className="progress-remove" disabled={busy} aria-label={`Quitar objetivo ${index + 1}`}
              onClick={() => removeGoal(goal.id)}>Quitar objetivo</button>}
          </article>;
        })}
        {editing && <button type="button" className="nuth-button-secondary justify-self-start" disabled={busy} onClick={addGoal}>Agregar objetivo</button>}
      </section>
      <section className="progress-section" data-agreement-kind="strategies" aria-labelledby={`${id}-strategies`}>
        <h3 id={`${id}-strategies`} className="progress-section-heading"><Route size={17} aria-hidden="true" /> Estrategias acordadas</h3>
        {!display.strategies.length && <p>No hay estrategias en esta versión.</p>}
        {display.strategies.map((strategy, index) => {
          const field = `${id}-strategy-${index}`;
          const links = display.goals.flatMap((goal, i) => strategy.goalIds.includes(goal.id) ? [headline(goal.text, `Objetivo ${i + 1}`)] : []);
          return <article key={strategy.id} className="progress-card">
            <div className="progress-row">
              <h4>{editing ? `Estrategia ${index + 1}` : headline(strategy.text, `Estrategia ${index + 1}`)}</h4>
              <span className="progress-pill">{strategy.assessment.status === "unreviewed" ? "Sin revisar" :
                strategy.assessment.status === "applied" ? "Aplicada" : strategy.assessment.status === "partial" ? "Aplicada en parte" : "Sin aplicar"}</span>
            </div>
            {!editing && !!links.length && <small>Objetivos que apoya · {links.join(" · ")}</small>}
            {editing
              ? <Textarea aria-label={`Texto de la estrategia ${index + 1}`} required value={strategy.text} disabled={busy} onChange={(event) => updateStrategy({ ...strategy, text: event.target.value })} />
              : strategy.text.includes("\n") && <p className="progress-text">{strategy.text.split("\n").slice(1).join("\n")}</p>}
            {editing && display.goals.length > 0 && <fieldset className="progress-links" disabled={busy}>
              <legend>Objetivos que apoya</legend>
              {display.goals.map((goal, goalIndex) => <label key={goal.id}>
                <input type="checkbox" checked={strategy.goalIds.includes(goal.id)} onChange={(event) => updateStrategy({
                  ...strategy, goalIds: event.target.checked ? [...strategy.goalIds, goal.id] : strategy.goalIds.filter((id) => id !== goal.id),
                })} />
                {headline(goal.text, `Objetivo ${goalIndex + 1}`)}
              </label>)}
            </fieldset>}
            {strategy.assessment.date && <small>Última revisión · {formatPatientDate(strategy.assessment.date)}</small>}
            {editing && Object.hasOwn(recording, strategy.id) ? <div className="progress-assessment">
              <label htmlFor={field}>¿Se aplicó la estrategia?</label>
              <select id={field} value={strategy.assessment.status} className="nuth-input" disabled={busy}
                onChange={(event) => {
                  recordChange(strategy.id);
                  updateStrategy({ ...strategy, assessment: { ...strategy.assessment, status: event.target.value as ProgressStrategy["assessment"]["status"] } });
                }}>
                {Object.entries(strategyStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div> : canEdit && <button type="button" className="nuth-button-secondary" disabled={busy}
              aria-label={`Revisar aplicación de la estrategia ${index + 1}`}
              onClick={() => markForReview(strategy.id)}>Revisar aplicación</button>}
            {editing && <button type="button" className="progress-remove" disabled={busy} aria-label={`Quitar estrategia ${index + 1}`}
              onClick={() => change({ ...display, strategies: display.strategies.filter((item) => item.id !== strategy.id) })}>Quitar estrategia</button>}
          </article>;
        })}
        {editing && <button type="button" className="nuth-button-secondary justify-self-start" disabled={busy} onClick={addStrategy}>Agregar estrategia</button>}
      </section>
      <section className="progress-section" data-agreement-kind="instructions" aria-labelledby={`${id}-instructions`}>
        <h3 id={`${id}-instructions`} className="progress-section-heading"><ClipboardList size={17} aria-hidden="true" /> Indicaciones de la consulta</h3>
        <div className="progress-card">
          {editing ? <Textarea aria-labelledby={`${id}-instructions`} rows={5} value={display.instructions} disabled={busy}
            onChange={(event) => change({ ...display, instructions: event.target.value })} />
            : <p className="progress-text">{display.instructions.trim() || "No hay indicaciones en esta versión."}</p>}
        </div>
      </section>
    </div>
    <footer className="progress-footer">
      {editing && error && <p className="progress-validation" role="alert">{error}</p>}
      {editing && invalid && <p className="progress-validation">Escribe el texto de cada objetivo y estrategia que quieras guardar.</p>}
      <div className="progress-actions">
        {editing ? <>
          <button type="button" className="nuth-button-secondary" disabled={busy} onClick={() => { request.current = null; setEditing(null); setRecording({}); setError(""); }}>Cancelar edición</button>
          <button type="button" className="nuth-button" disabled={busy || !changed || invalid} onClick={() => void save()}>{busy ? "Guardando…" : "Guardar revisión"}</button>
        </> : <>
          <button type="button" className="nuth-button-secondary" disabled={busy} onClick={() => setPdf(true)}><FileDown size={16} /> Exportar PDF</button>
          <button type="button" className="nuth-button-secondary" disabled={busy} onClick={() => void exportWord()}>{busy ? "Preparando Word…" : "Exportar Word"}</button>
          {canEdit && <button type="button" className="nuth-button" disabled={busy} onClick={() => beginEdit()}>Editar acuerdos</button>}
        </>}
      </div>
    </footer>
    {pdf && <PdfExportDialog title="Exportar progreso del paciente" description="Elige el diseño para los acuerdos y el avance de esta revisión."
      onClose={() => setPdf(false)} onDownload={async (design) => {
        const { downloadProgressPdf } = await import("@/src/features/progress/exportProgress");
        await downloadProgressPdf(patient, source, review, saved, design);
      }} />}
  </>;
}
