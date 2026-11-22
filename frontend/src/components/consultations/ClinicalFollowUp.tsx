import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { CalendarClock, ClipboardCheck, Save, Target } from "lucide-react";
import { Link } from "react-router-dom";
import { objectivePlansEqual } from "../../../../supabase/functions/_shared/objectives";
import { ScheduleAppointmentButton } from "@/src/components/agenda/ScheduleAppointmentButton";
import { useAppointmentClock } from "@/src/components/agenda/useAppointmentClock";
import { ClinicalProgress } from "@/src/components/patients/ClinicalProgress";
import { Textarea } from "@/src/components/ui/FormField";
import { emptyValue, type Answers } from "@/src/features/consultations/questionnaire";
import { listAppointments, type Appointment } from "@/src/services/appointments";
import { clinicalObjective, type ObjectiveWorkspace } from "@/src/services/clinicalCopilot";
import { clinicalInterventions, type InterventionWorkspace } from "@/src/services/clinicalInterventions";
import type { Consultation, Patient } from "@/src/types/domain";
import { useConsultationDraft } from "./ConsultationDrafts";
import type { ClinicalTaskStatus } from "./ClinicalTaskCard";
import "./ClinicalFollowUp.css";

type FollowupProps = {
  consultation: Consultation;
  patient: Patient;
  revision: number;
  active: boolean;
  answers: Answers;
  noteInTemplate: boolean;
  additionalAnswers: unknown[];
  additionalFields?: ReactNode;
  busy: boolean;
  progressVersion: number;
  onProgressSaved: () => void;
  onNoteChange: (note: string) => void;
  onEdit: (stage: number) => void;
  onSave: () => Promise<boolean>;
  onStatusChange: (status: ClinicalTaskStatus) => void;
};

export function ClinicalFollowUp({
  consultation, patient, revision, active, answers, noteInTemplate, additionalAnswers, additionalFields, busy,
  progressVersion, onProgressSaved, onNoteChange, onEdit, onSave, onStatusChange,
}: FollowupProps) {
  const noteId = useId();
  const consultationId = consultation.id;
  const [data, setData] = useState<{ objectives: ObjectiveWorkspace; strategies: InterventionWorkspace } | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [draftNote, setDraftNote] = useConsultationDraft<string>("followup-note", "");
  const [savedSignature, setSavedSignature] = useConsultationDraft<string>("followup-review", "");
  const note = noteInTemplate ? String(answers.followup_plan ?? "") : draftNote;

  useEffect(() => {
    if (!active) return;
    let alive = true;
    void Promise.all([
      clinicalObjective(consultationId, revision),
      clinicalInterventions(consultationId, revision),
    ]).then(([objectives, strategies]) => {
      if (!alive) return;
      setData({ objectives, strategies });
      setError(false);
    }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [active, consultationId, revision, retry]);

  const objective = data?.objectives.objective;
  const approvedPlan = objective?.smart_plan;
  const currentPlan = objective && data?.objectives.plans?.[objective.question_key];
  const goals = objective && approvedPlan && approvedPlan.pesApprovedAt === data?.objectives.pes?.approved_at
    && (!currentPlan || objectivePlansEqual(approvedPlan, currentPlan))
    && JSON.stringify(answers[objective.question_key]) === JSON.stringify(objective.value)
    ? approvedPlan.goals : [];
  const strategies = data?.strategies.items.flatMap((item) =>
    item.approved && !item.requiresReview && item.state !== "withdrawn" && !item.draft
      ? [{ id: item.id, updatedAt: item.updated_at, ...item.approved.document.strategy }] : [],
  ) ?? [];
  const loaded = !!data && !error;
  const hasContent = !!note.trim() || additionalAnswers.some((value) => !emptyValue(value))
    || (loaded && (goals.length > 0 || strategies.length > 0));
  const signature = JSON.stringify([
    note, additionalAnswers, goals.length ? objective?.approved_at : null,
    strategies.map(({ id, updatedAt }) => [id, updatedAt]),
  ]);
  const saved = !saving && !saveError && savedSignature === signature;
  useEffect(() => {
    if (active) onStatusChange(saved && loaded ? "complete" : hasContent ? "progress" : "pending");
  }, [active, hasContent, loaded, onStatusChange, saved]);

  async function saveFollowup() {
    if (saving || busy) return;
    setSaving(true);
    setSaveError(false);
    setSavedSignature(signature);
    try {
      if (!await onSave()) {
        setSavedSignature(savedSignature);
        setSaveError(true);
      }
    } catch {
      setSavedSignature(savedSignature);
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  }

  return <div className="clinical-followup">
    <div className="clinical-followup-grid">
      <section className="clinical-followup-card clinical-followup-progress">
        <h3><ClipboardCheck size={21} aria-hidden="true" /> Avance de hoy</h3>
        <ClinicalProgress patient={patient} consultation={consultation} summaryActive={active}
          consultationsRevision={String(progressVersion)} onProgressSaved={onProgressSaved} />
      </section>

      <section className="clinical-followup-card clinical-followup-plan">
        <h3><Target size={21} aria-hidden="true" /> Para la próxima revisión</h3>
        {error ? <div className="clinical-notice" role="alert">
          <p>No pudimos cargar los acuerdos de esta consulta.</p>
          <button type="button" className="clinical-text-action" onClick={() => { setError(false); setData(null); setRetry((value) => value + 1); }}>Reintentar</button>
        </div> : !loaded ? <p role="status">Cargando los acuerdos de hoy…</p>
          : goals.length || strategies.length ? <div className="clinical-followup-plan-pair">
            <div>
            <h4>Qué revisarán</h4>
            <ul className="clinical-followup-plan-list">
              {goals.map((goal, index) => <li key={index}>{goal.outcome}</li>)}
              {strategies.map((strategy) => <li key={strategy.id}>{strategy.title || strategy.action}</li>)}
            </ul>
            </div>
            <div>
            <h4>Cómo lo revisarán</h4>
            <ul className="clinical-followup-plan-list">
              {goals.map((goal, index) => <li key={index}>
                {[goal.monitoring || goal.indicator || goal.target, goal.timeframe].filter(Boolean).join(" · ") || "Por acordar en la próxima revisión"}
              </li>)}
              {strategies.map((strategy) => <li key={strategy.id}>
                {[strategy.monitoring || strategy.adjustmentCriteria, strategy.reviewAt].filter(Boolean).join(" · ") || "Por acordar en la próxima revisión"}
              </li>)}
            </ul>
            </div>
          </div> : <p className="clinical-followup-muted">Los objetivos y las estrategias que apruebes en esta consulta aparecerán aquí.</p>}

        <div className="clinical-followup-note">
          <label htmlFor={noteId}>Nota para la próxima revisión <span>· opcional</span></label>
          <Textarea id={noteId} rows={3} value={note} disabled={busy || saving}
            placeholder="Escribe algo que quieras retomar en la próxima consulta."
            onChange={(event) => (noteInTemplate ? onNoteChange : setDraftNote)(event.target.value)} />
        </div>

        {loaded && <details className="clinical-followup-details">
          <summary>Ver acuerdos de hoy</summary>
          {goals.map((goal, index) => <Agreement key={index} title={goal.outcome} fields={[
            ["Indicador", goal.indicator], ["Situación inicial", goal.baseline], ["Meta acordada", goal.target],
            ["Cuándo lo revisarán", goal.timeframe], ["Cómo registrarán el avance", goal.monitoring],
            ["Barreras y apoyos", goal.feasibility],
          ]} />)}
          {strategies.map((strategy) => <Agreement key={strategy.id} title={strategy.title} fields={[
            ["Acción acordada", strategy.action], ["Frecuencia", strategy.frequency], ["Responsable previsto", strategy.responsible],
            ["Cuándo lo revisarán", strategy.reviewAt], ["Cómo evaluarán el avance", strategy.monitoring],
            ["Cuándo ajustar la estrategia", strategy.adjustmentCriteria],
          ]} />)}
          <div className="clinical-followup-actions">
            <button type="button" className="clinical-text-action" onClick={() => onEdit(2)}>Ir a objetivos</button>
            <button type="button" className="clinical-text-action" onClick={() => onEdit(3)}>Ir a estrategias</button>
          </div>
        </details>}
        {additionalFields && <details className="clinical-followup-details">
          <summary>Otros datos de seguimiento</summary>
          {additionalFields}
        </details>}
      </section>

      <NextAppointment patient={patient} active={active} />
    </div>

    <div className="clinical-followup-footer">
      <button type="button" className="nuth-button" disabled={busy || saving} onClick={() => void saveFollowup()}>
        <Save size={17} aria-hidden="true" /> {saving ? "Guardando seguimiento…" : "Guardar seguimiento"}
      </button>
      {saveError ? <p role="alert">No pudimos guardar el seguimiento. Tu nota sigue aquí. Intenta de nuevo.</p>
        : saved ? <p role="status">Seguimiento guardado.</p> : null}
    </div>
  </div>;
}

function Agreement({ title, fields }: { title: string; fields: [string, string][] }) {
  return <article className="clinical-followup-agreement">
    <h4>{title}</h4>
    <dl>
      {fields.filter(([, value]) => value.trim()).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
  </article>;
}

function NextAppointment({ patient, active }: { patient: Patient; active: boolean }) {
  const title = useRef<HTMLHeadingElement>(null);
  const request = useRef(0);
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const now = useAppointmentClock();
  useEffect(() => {
    if (!active) return;
    let alive = true;
    const refresh = () => {
      const id = ++request.current;
      void listAppointments(patient.id).then(({ appointments }) => {
        if (!alive || request.current !== id) return;
        setAppointments(appointments);
        setError(false);
      }).catch(() => { if (alive && request.current === id) setError(true); });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => { alive = false; window.removeEventListener("focus", refresh); };
  }, [patient.id, active, retry]);
  const next = (appointments ?? [])
    .filter((item) => item.status === "confirmed" && Date.parse(item.starts_at) > now)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))[0];
  const date = next && new Intl.DateTimeFormat("es-MX", {
    dateStyle: "long", timeStyle: "short", timeZone: next.timezone,
  }).format(new Date(next.starts_at));

  return <section className="clinical-followup-card clinical-followup-appointment">
    <h3 ref={title} tabIndex={-1}><CalendarClock size={21} aria-hidden="true" /> Próxima cita</h3>
    {next ? <>
      <span className="clinical-followup-pill">Agendada</span>
      <p><time dateTime={next.starts_at}>{date}</time></p>
      <p className="clinical-followup-muted">{next.modality === "online" ? "En línea" : next.location_snapshot?.name || "Presencial"}</p>
      <Link className="clinical-text-action" to="/app/agenda" target="_blank" rel="noreferrer">Ver en Agenda<span className="sr-only"> (abre otra pestaña)</span></Link>
    </> : error ? <>
      <p role="alert">No pudimos comprobar si hay una cita próxima.</p>
      <button type="button" className="clinical-text-action" onClick={() => { setError(false); setAppointments(null); setRetry((value) => value + 1); }}>Reintentar</button>
    </> : !appointments ? <p role="status">Consultando la agenda…</p> : <>
      <span className="clinical-followup-pill">Por agendar</span>
      <p className="clinical-followup-muted">Elige un horario disponible sin salir de la consulta.</p>
    </>}
    <ScheduleAppointmentButton patient={patient} label="Agendar próxima cita" className="nuth-button clinical-followup-book"
      hideTrigger={!!next || !appointments || error} onSaved={(appointment) => {
        request.current++;
        setError(false);
        setAppointments((current) => [...(current ?? []).filter((item) => item.id !== appointment.id), appointment]);
      }}
      returnFocus={title} />
  </section>;
}
