import { useEffect, useRef, useState } from "react";
import { useConsultationDraft, useConsultationDraftContext } from './ConsultationDrafts';
import {
  ArrowRight,
  Check,
  ClipboardCheck,
  History,
  MessageCircle,
  RefreshCw,
  Ruler,
  Utensils,
} from "lucide-react";
import {
  clinicalObjective,
  type ClinicalWorkspace,
  clinicalWorkspace,
  type ObjectiveWorkspace,
} from "@/src/services/clinicalCopilot";
import { InterviewReview } from "./InterviewReview";
import { ConfirmedRecall } from "./ClinicalCopilot";
import {
  emptyValue,
  matchesCondition,
} from "@/src/features/consultations/questionnaire";
import type { Answers } from "@/src/features/consultations/questionnaire";
import type { ConsultationSnapshot } from "@/src/types/domain";
import {
  type ConsultationModule,
  workflowSections,
} from "@/src/features/consultations/consultationWorkflow";
import { ClinicalMeasurementsReview } from "./ClinicalMeasurementsReview";
import {
  ClinicalStatusBadge,
  ClinicalTaskCard,
  type ClinicalTaskStatus,
} from "./ClinicalTaskCard";

export function ClinicalReview(
  {
    consultationId,
    snapshot,
    values,
    active,
    before,
    onStatusChange,
    onReviewed,
    onOpenModule,
  }: {
    consultationId: string;
    snapshot: ConsultationSnapshot;
    values: Answers;
    active: boolean;
    before: () => Promise<boolean>;
    onReviewed?: (message:string,complete:boolean)=>void;
    onStatusChange?: (status: ClinicalTaskStatus) => void;
    onOpenModule?: (module: ConsultationModule) => void;
  },
) {
  const [context, setContext] = useState<ObjectiveWorkspace | null>(null);
  const [records, setRecords] = useState<ClinicalWorkspace["records"]>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const checkpoints = useConsultationDraftContext();
  const [savingReview, setSavingReview] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const reviewLock = useRef(false);
  // Persist the source contents in this consultation revision's checkpoint.
  // Approvals and navigation are excluded: only a change to a reviewed source
  // should ask the professional to review that source again.
  const [reviewedSources, setReviewedSources] = useConsultationDraft<
    Record<string, string>
  >('clinical-reviewed-sources', {});
  const [expandedSources, setExpandedSources] = useState<
    Record<string, boolean>
  >({});
  useEffect(() => {
    if (!active) return;
    let alive = true;
    queueMicrotask(() => { if (alive) setLoading(true); });
    void Promise.all([
      clinicalObjective(consultationId, snapshot.revision),
      clinicalWorkspace(consultationId, snapshot.revision),
    ])
      .then(([next, workspace]) => {
        if (alive) {
          setContext(next);
          setRecords(workspace.records);
          setError("");
          setLoading(false);
        }
      })
      .catch((cause) => {
        if (alive) {
          setLoading(false);
          setError(
            cause instanceof Error
              ? cause.message
              : "No pudimos cargar la revisión.",
          );
        }
      });
    return () => {
      alive = false;
    };
  }, [active, consultationId, snapshot.revision]);
  const historical = (source: string) =>
    /^(Historial|Antecedente de entrevista|PES previo aprobado)/.test(source);
  const facts = context?.facts ?? [];
  const currentFacts = facts.filter((fact) =>
    !historical(fact.source) && fact.origin !== "baseline"
  );
  const historyFacts = facts.filter((fact) => historical(fact.source));
  const interviewStructure = {
    ...snapshot.structure,
    sections: workflowSections(snapshot.structure, "interview"),
  };
  const interviewAnswers = interviewStructure.sections.flatMap((section) =>
    section.questions
  ).filter((question) =>
    matchesCondition(question.visibility_condition, values) &&
    !emptyValue(values[question.question_key])
  );
  const interviewValues = Object.fromEntries(
    interviewAnswers.map(
      (question) => [question.question_key, values[question.question_key]],
    ),
  );
  const measurementFacts = facts.filter((fact) =>
    fact.metric_code ||
    /Antropometría|Laboratorio|Estudio|Cálculo/i.test(fact.source)
  );
  const otherCurrentFacts = currentFacts.filter((fact) =>
    !fact.metric_code && !/^Entrevista/.test(fact.source)
  );
  const sources = [
    {
      key: "interview",
      title: "Lo conversado",
      description: interviewAnswers.length
        ? `${interviewAnswers.length} respuestas de esta consulta`
        : "Sin entrevista registrada",
      icon: MessageCircle,
      available: interviewAnswers.length > 0,
      signature: JSON.stringify(Object.entries(interviewValues).sort(([a], [b]) => a.localeCompare(b))),
    },
    {
      key: "recall",
      title: "Alimentación del día",
      description: records.recall
        ? "Recordatorio de 24 horas confirmado"
        : "Recordatorio sin confirmar",
      icon: Utensils,
      available: !!records.recall,
      signature: JSON.stringify(records.recall ? {narrative:records.recall.narrative,items:records.recall.items,method:records.recall.method,estimate:records.recall.estimate} : null),
    },
    {
      key: "measurements",
      title: "Mediciones y estudios",
      description: measurementFacts.length
        ? "Registros, fechas y cambios disponibles"
        : "Sin mediciones o estudios registrados",
      icon: Ruler,
      available: measurementFacts.length > 0 || otherCurrentFacts.length > 0,
      signature: JSON.stringify([measurementFacts, otherCurrentFacts].map(items => items.map(fact => JSON.stringify(fact)).sort())),
    },
    {
      key: "history",
      title: "Consultas anteriores",
      description: historyFacts.length
        ? `${historyFacts.length} antecedentes con su fuente`
        : "Sin antecedentes disponibles",
      icon: History,
      available: historyFacts.length > 0,
      signature: JSON.stringify(historyFacts.map(fact => JSON.stringify(fact)).sort()),
    },
  ];
  const available = sources.filter((source) => source.available);
  const reviewedCount =
    available.filter((source) =>
      reviewedSources[source.key] === source.signature
    ).length;
  const status: ClinicalTaskStatus = !context || error
    ? "pending"
    : available.length > 0 && reviewedCount === available.length
    ? "complete"
    : reviewedCount
    ? "progress"
    : "pending";
  useEffect(() => {
    onStatusChange?.(status);
  }, [onStatusChange, status]);
  async function refresh() {
    setLoading(true);
    try {
      if (!await before()) return;
      const [next, workspace] = await Promise.all([
        clinicalObjective(consultationId, snapshot.revision),
        clinicalWorkspace(consultationId, snapshot.revision),
      ]);
      setContext(next);
      setRecords(workspace.records);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos actualizar la revisión.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function markSources(selected: typeof sources, reviewed: boolean) {
    if (loading || reviewLock.current || !context || error || !selected.length) return;
    reviewLock.current = true;
    setSavingReview(true);
    setReviewError('');
    let previous: Record<string, string> | null = null;
    try {
      if (!await before()) throw new Error('No pudimos guardar la consulta antes de confirmar la revisión.');
      setReviewedSources(current => {
        previous = current;
        return {...current, ...Object.fromEntries(selected.map(source => [source.key, reviewed ? '' : source.signature]))};
      });
      if (checkpoints && !await checkpoints.flush()) throw new Error('La revisión sigue en esta pestaña. Reintenta guardar antes de salir.');
      setExpandedSources(current => ({...current, ...Object.fromEntries(selected.map(source => [source.key, false]))}));
      const complete = available.every(source => selected.some(item => item.key === source.key)
        ? !reviewed : reviewedSources[source.key] === source.signature);
      if (!reviewed) onReviewed?.(complete ? 'Revisión clínica completada.' : `${selected[0].title}: revisión completada.`, complete);
      const focusId = selected.length === 1 ? `clinical-source-${consultationId}-${selected[0].key}` : 'clinical-review-title';
      requestAnimationFrame(() => document.getElementById(focusId)?.focus({preventScroll:true}));
    } catch (cause) {
      if (previous) setReviewedSources(previous);
      setReviewError(cause instanceof Error ? cause.message : 'No pudimos guardar la revisión. Vuelve a intentarlo.');
    } finally {
      reviewLock.current = false;
      setSavingReview(false);
    }
  }
  return (
    <section className="clinical-stage" aria-labelledby="clinical-review-title">
      <header className="clinical-stage-heading">
        <div>
          <p className="nuth-eyebrow">01 · Comprende la situación</p>
          <h2 id="clinical-review-title" tabIndex={-1}>Revisión clínica</h2>
          <p>
            Revisa las fuentes y confirma qué datos siguen vigentes antes de
            formular el diagnóstico.
          </p>
        </div>
        <button
          type="button"
          className="nuth-button-secondary"
          disabled={loading || savingReview}
          onClick={() =>
            void refresh()}
        >
          <RefreshCw size={15} />
          {loading ? "Actualizando…" : "Actualizar revisión"}
        </button>
      </header>
      <div className="clinical-review-instruction">
        <span className="clinical-stage-icon">
          <ClipboardCheck size={22} aria-hidden="true" />
        </span>
        <div>
          <strong>
            Revisa los datos y confirma todas las fuentes con un clic o márcalas por separado.
          </strong>
          <p>Tu revisión queda guardada. Solo tendrás que revisar de nuevo las fuentes cuyos datos cambien.</p>
          <button
            type="button"
            className="nuth-button mt-3"
            disabled={loading || savingReview || !context || !!error || !available.length || reviewedCount === available.length}
            onClick={() => void markSources(available, false)}
          >
            <Check size={16} aria-hidden="true" />
            {savingReview ? 'Guardando revisión…' : available.length > 0 && reviewedCount === available.length ? 'Todos los datos confirmados' : 'Confirmar todos los datos'}
          </button>
        </div>
        <ClinicalStatusBadge status={status}>
          {context
            ? available.length
              ? `${reviewedCount} de ${available.length} ${
                available.length === 1 ? "fuente revisada" : "fuentes revisadas"
              }`
              : "Sin fuentes disponibles"
            : "Cargando fuentes"}
        </ClinicalStatusBadge>
      </div>
      {!context && !error && (
        <p role="status" className="clinical-notice">
          Reuniendo los datos de la consulta…
        </p>
      )}
      {error && (
        <p role="alert" className="clinical-notice is-warning">{error}</p>
      )}
      {reviewError && <p role="alert" className="clinical-notice is-warning">{reviewError}</p>}
      <div
        className="clinical-review-card-grid"
        aria-busy={loading || !context && !error}
      >
        {sources.map((source) => {
          const reviewed = source.available &&
            reviewedSources[source.key] === source.signature;
          const Icon = source.icon;
          return (
            <ClinicalTaskCard
              key={source.key}
              id={`clinical-source-${consultationId}-${source.key}`}
              marker={<Icon size={20} />}
              title={source.title}
              description={context
                ? source.description
                : "Consultando registros…"}
              status={reviewed ? "complete" : "pending"}
              statusLabel={reviewed
                ? "Revisado"
                : source.available
                ? "Por revisar"
                : context
                ? "Sin registro"
                : "Cargando"}
              open={expandedSources[source.key] ?? false}
              onToggle={() =>
                setExpandedSources((current) => ({
                  ...current,
                  [source.key]: !(current[source.key] ?? false),
                }))}
            >
              {source.key === "interview" && (interviewAnswers.length
                ? (
                  <InterviewReview
                    structure={interviewStructure}
                    values={values}
                  />
                )
                : (
                  <div className="clinical-source-empty">
                    <p>No hay respuestas en la entrevista actual.</p>
                    {onOpenModule && (
                      <button
                        type="button"
                        className="clinical-text-action"
                        onClick={() => onOpenModule("interview")}
                      >
                        Ir a la entrevista<ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                ))}
              {source.key === "recall" && (records.recall
                ? <ConfirmedRecall record={records.recall} />
                : (
                  <div className="clinical-source-empty">
                    <p>
                      Confirma el recordatorio para incluir los alimentos y sus
                      cantidades.
                    </p>
                    {onOpenModule && (
                      <button
                        type="button"
                        className="clinical-text-action"
                        onClick={() => onOpenModule("recall")}
                      >
                        Ir al recordatorio<ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                ))}
              {source.key === "measurements" && (
                <>
                  <ClinicalMeasurementsReview facts={facts} />
                  {otherCurrentFacts.length > 0 && (
                    <details className="clinical-support-details">
                      <summary>Otros datos de esta consulta</summary>
                      <ul className="consultation-context-facts">
                        {otherCurrentFacts.map((fact, index) => (
                          <li key={index}>
                            <strong>{fact.source}</strong>
                            <p>{fact.finding}</p>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {!source.available && onOpenModule && (
                    <button
                      type="button"
                      className="clinical-text-action"
                      onClick={() => onOpenModule("measurements")}
                    >
                      Ir a mediciones<ArrowRight size={14} />
                    </button>
                  )}
                </>
              )}
              {source.key === "history" && (
                <>
                  <p className="clinical-source-guidance">
                    Comprueba las fechas y confirma con la persona qué sigue
                    vigente.
                  </p>
                  {historyFacts.length
                    ? (
                      <ul className="consultation-context-facts">
                        {historyFacts.map((fact, index) => (
                          <li key={index}>
                            <strong>{fact.source}</strong>
                            <p>{fact.finding}</p>
                          </li>
                        ))}
                      </ul>
                    )
                    : (
                      <p className="clinical-source-empty">
                        No hay antecedentes disponibles para esta revisión.
                      </p>
                    )}
                </>
              )}
              {source.available && (
                <>
                {!reviewed && reviewedSources[source.key] && <p className="clinical-source-guidance">Los datos de esta fuente cambiaron desde tu última revisión. Confirma los cambios para actualizar la marca.</p>}
                <button
                  type="button"
                  className="clinical-review-check"
                  aria-pressed={reviewed}
                  disabled={loading || savingReview || !!error}
                  onClick={() => void markSources([source], reviewed)}
                >
                  <Check size={16} />
                  {reviewed
                    ? "Revisado · quitar marca"
                    : "Marcar como revisado"}
                </button>
                </>
              )}
            </ClinicalTaskCard>
          );
        })}
      </div>
      <details className="clinical-support-details">
        <summary>Cómo se utilizan estas fuentes</summary>
        <p>
          La IA prioriza esta consulta. Si falta la entrevista actual, puede
          usar entrevistas de consultas cerradas anteriores con su fecha. Revisa
          la propuesta antes de aprobarla. Las marcas de esta pantalla no
          aprueban datos ni diagnósticos.
        </p>
      </details>
      <p className="clinical-stage-next">
        <ArrowRight size={16} aria-hidden="true" />Después, formula el
        diagnóstico PES con los datos revisados.
      </p>
    </section>
  );
}
