import "../patients/SharedClinicalGuidance.css";
import { useEffect, useState } from "react";
import {
  clinicalObjective,
  type ObjectiveWorkspace,
} from "@/src/services/clinicalCopilot";
import {
  clinicalInterventions,
  type InterventionWorkspace,
} from "@/src/services/clinicalInterventions";
import { ClinicalTaskCard } from "./ClinicalTaskCard";
export function ClinicalFollowUp(
  { consultationId, revision, active, onReady }: {
    consultationId: string;
    revision: number;
    active: boolean;
    onReady: (ready: boolean, signature: string) => void;
  },
) {
  const [data, setData] = useState<
      | { objectives: ObjectiveWorkspace; strategies: InterventionWorkspace }
      | null
    >(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    queueMicrotask(()=>{if(alive)setLoading(true);});
    void Promise.all([
      clinicalObjective(consultationId, revision),
      clinicalInterventions(consultationId, revision),
    ]).then(([objectives, strategies]) => {
      if (alive) {
        setData({ objectives, strategies });
        setError("");
        setLoading(false);
      }
    }).catch(() => {
      if (alive) {
        setError(
          "No pudimos cargar el seguimiento acordado. Vuelve a abrir este paso.",
        );
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [active, consultationId, revision]);
  const goals = data?.objectives.objective?.smart_plan?.goals ?? [];
  const strategies =
    data?.strategies.items.filter((item) =>
      item.approved && !item.requiresReview && item.state !== "withdrawn" &&
      !item.draft
    ) ?? [];
  const signature = JSON.stringify([
    data?.objectives.objective?.approved_at,
    strategies.map((item) => [item.id, item.updated_at]),
    error,
  ]);
  useEffect(() => {
    onReady(
      !loading && !error && (goals.length > 0 || strategies.length > 0),
      loading||error?"":signature,
    );
  }, [onReady, signature, loading, error, goals.length, strategies.length]);
  if (error) {
    return <p role="alert" className="clinical-notice is-warning">{error}</p>;
  }
  if (loading) {
    return (
      <p role="status" className="clinical-notice">
        Reuniendo metas y fechas de revisión…
      </p>
    );
  }
  return (
    <div className="clinical-review-card-grid">
      {goals.map((goal, index) => (
        <ClinicalTaskCard
          key={`goal-${index}`}
          marker={index + 1}
          title={goal.outcome}
          description={`Revisión: ${goal.timeframe}`}
          status="approved"
          statusLabel="Objetivo aprobado"
        >
          <dl className="shared-guidance-fields">
            <div>
              <dt>Indicador y meta</dt>
              <dd>{goal.indicator} · {goal.target}</dd>
            </div>
            <div>
              <dt>Cómo se revisará</dt>
              <dd>{goal.monitoring}</dd>
            </div>
          </dl>
        </ClinicalTaskCard>
      ))}
      {strategies.map((item) => (
        <ClinicalTaskCard
          key={item.id}
          marker="↻"
          title={item.approved!.document.strategy.title}
          description={`Revisión: ${item.approved!.document.strategy.reviewAt}`}
          status="approved"
          statusLabel="Estrategia aprobada"
        >
          <p className="clinical-source-guidance">
            {item.approved!.document.strategy.monitoring}
          </p>
          <p className="clinical-source-guidance">
            Criterios de ajuste:{" "}
            {item.approved!.document.strategy.adjustmentCriteria}
          </p>
        </ClinicalTaskCard>
      ))}
      {!goals.length && !strategies.length && (
        <p className="clinical-source-empty">
          Aprueba los objetivos o las estrategias para reunir aquí sus
          indicadores y plazos de seguimiento.
        </p>
      )}
    </div>
  );
}
