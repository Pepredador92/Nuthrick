import { useEffect, useState } from "react";
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
    onOpenModule,
  }: {
    consultationId: string;
    snapshot: ConsultationSnapshot;
    values: Answers;
    active: boolean;
    before: () => Promise<boolean>;
    onStatusChange?: (status: ClinicalTaskStatus) => void;
    onOpenModule?: (module: ConsultationModule) => void;
  },
) {
  const [context, setContext] = useState<ObjectiveWorkspace | null>(null);
  const [records, setRecords] = useState<ClinicalWorkspace["records"]>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Reading a source is a session aid, not a clinical approval. Changed sources
  // lose their checkmark so an earlier review cannot acknowledge newer data.
  const [reviewedSources, setReviewedSources] = useState<
    Record<string, string>
  >({});
  const [expandedSources, setExpandedSources] = useState<
    Record<string, boolean>
  >({});
  useEffect(() => {
    if (!active) return;
    let alive = true;
    void Promise.all([
      clinicalObjective(consultationId, snapshot.revision),
      clinicalWorkspace(consultationId, snapshot.revision),
    ])
      .then(([next, workspace]) => {
        if (alive) {
          setContext(next);
          setRecords(workspace.records);
          setError("");
        }
      })
      .catch((cause) => {
        if (alive) {
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
      signature: JSON.stringify([interviewStructure, interviewValues]),
    },
    {
      key: "recall",
      title: "Alimentación del día",
      description: records.recall
        ? "Recordatorio de 24 horas confirmado"
        : "Recordatorio sin confirmar",
      icon: Utensils,
      available: !!records.recall,
      signature: JSON.stringify(records.recall ?? null),
    },
    {
      key: "measurements",
      title: "Mediciones y estudios",
      description: measurementFacts.length
        ? "Registros, fechas y cambios disponibles"
        : "Sin mediciones o estudios registrados",
      icon: Ruler,
      available: measurementFacts.length > 0 || otherCurrentFacts.length > 0,
      signature: JSON.stringify([measurementFacts, otherCurrentFacts]),
    },
    {
      key: "history",
      title: "Consultas anteriores",
      description: historyFacts.length
        ? `${historyFacts.length} antecedentes con su fuente`
        : "Sin antecedentes disponibles",
      icon: History,
      available: historyFacts.length > 0,
      signature: JSON.stringify(historyFacts),
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
  return (
    <section className="clinical-stage" aria-labelledby="clinical-review-title">
      <header className="clinical-stage-heading">
        <div>
          <p className="nuth-eyebrow">01 · Comprende la situación</p>
          <h2 id="clinical-review-title">Revisión clínica</h2>
          <p>
            Revisa las fuentes y confirma qué datos siguen vigentes antes de
            formular el diagnóstico.
          </p>
        </div>
        <button
          type="button"
          className="nuth-button-secondary"
          disabled={loading}
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
            Abre una fuente, revisa sus datos y márcala al terminar.
          </strong>
          <p>Las marcas indican lo revisado durante esta sesión.</p>
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
                <button
                  type="button"
                  className="clinical-review-check"
                  aria-pressed={reviewed}
                  disabled={loading || !!error}
                  onClick={() => {
                    setReviewedSources((current) => ({
                      ...current,
                      [source.key]: reviewed ? "" : source.signature,
                    }));
                    setExpandedSources((current) => ({
                      ...current,
                      [source.key]: false,
                    }));
                  }}
                >
                  <Check size={16} />
                  {reviewed
                    ? "Revisado · quitar marca"
                    : "Marcar como revisado"}
                </button>
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
