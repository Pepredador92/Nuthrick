import { useEffect, useState } from "react";
import { CalendarClock, Check, Target } from "lucide-react";
import { objectivePlansEqual } from "../../../../supabase/functions/_shared/objectives";
import type { Answers } from "@/src/features/consultations/questionnaire";
import {
  clinicalObjective,
  type ObjectiveWorkspace,
} from "@/src/services/clinicalCopilot";
import {
  clinicalInterventions,
  type InterventionWorkspace,
} from "@/src/services/clinicalInterventions";
import { ClinicalStatusBadge } from "./ClinicalTaskCard";
import { ClinicalTaskDialog } from "./ClinicalTaskDialog";

type FollowupEntry = {
  key: string;
  kind: "goal" | "strategy";
  title: string;
  timeframe: string;
  fields: { label: string; value: string }[];
};

export function ClinicalFollowUp(
  { consultationId, revision, active, onReady, onEdit, answers }: {
    consultationId: string;
    revision: number;
    active: boolean;
    onReady: (ready: boolean, signature: string) => void;
    onEdit?: (stage: number) => void;
    answers?: Answers;
  },
) {
  const [data, setData] = useState<
    { objectives: ObjectiveWorkspace; strategies: InterventionWorkspace } | null
  >(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<string[]>([]);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    queueMicrotask(() => {
      if (alive) {
        setLoading(true);
        setError("");
      }
    });
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
        setError("No pudimos cargar los acuerdos para el seguimiento.");
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [active, consultationId, revision, retry]);
  const objective = data?.objectives.objective;
  const approvedPlan = objective?.smart_plan;
  const currentPlan = objective &&
    data?.objectives.plans?.[objective.question_key];
  const goals = approvedPlan &&
      approvedPlan.pesApprovedAt === data?.objectives.pes?.approved_at &&
      (!currentPlan || objectivePlansEqual(approvedPlan, currentPlan)) &&
      (!answers ||
        JSON.stringify(answers[objective.question_key]) ===
          JSON.stringify(objective.value))
    ? approvedPlan.goals
    : [];
  const strategies =
    data?.strategies.items.filter((item) =>
      item.approved && !item.requiresReview && item.state !== "withdrawn" &&
      !item.draft
    ) ?? [];
  const signature = JSON.stringify([
    data?.objectives.objective?.approved_at,
    goals,
    strategies.map((item) => [item.id, item.updated_at]),
    error,
  ]);
  useEffect(() => {
    onReady(
      !loading && !error && (goals.length > 0 || strategies.length > 0),
      loading || error ? "" : signature,
    );
  }, [onReady, signature, loading, error, goals.length, strategies.length]);
  const entries: FollowupEntry[] = [
    ...goals.map((goal, index): FollowupEntry => ({
      key: JSON.stringify([
        "goal",
        data?.objectives.objective?.approved_at,
        index,
        goal,
      ]),
      kind: "goal",
      title: goal.outcome,
      timeframe: goal.timeframe,
      fields: [
        { label: "Indicador", value: goal.indicator },
        { label: "Situación inicial", value: goal.baseline },
        { label: "Meta acordada", value: goal.target },
        { label: "Cuándo lo revisarán", value: goal.timeframe },
        { label: "Cómo registrarán el avance", value: goal.monitoring },
        { label: "Barreras y apoyos", value: goal.feasibility },
      ],
    })),
    ...strategies.map((item): FollowupEntry => {
      const strategy = item.approved!.document.strategy;
      return {
        key: JSON.stringify(["strategy", item.id, item.updated_at]),
        kind: "strategy",
        title: strategy.title,
        timeframe: strategy.reviewAt,
        fields: [
          { label: "Acción acordada", value: strategy.action },
          { label: "Frecuencia", value: strategy.frequency },
          { label: "Responsable previsto", value: strategy.responsible },
          { label: "Cuándo lo revisarán", value: strategy.reviewAt },
          { label: "Cómo evaluarán el avance", value: strategy.monitoring },
          {
            label: "Cuándo ajustar la estrategia",
            value: strategy.adjustmentCriteria,
          },
        ],
      };
    }),
  ];
  const entry = entries.find((item) => item.key === selected);
  if (error) {
    return (
      <div role="alert" className="clinical-notice is-warning">
        <p>{error}</p>
        <button
          type="button"
          className="clinical-text-action mt-2"
          onClick={() => setRetry((value) => value + 1)}
        >
          Reintentar
        </button>
      </div>
    );
  }
  if (loading) {
    return (
      <p role="status" className="clinical-notice">
        Reuniendo metas y fechas de revisión…
      </p>
    );
  }
  return (
    <div className="clinical-next-workspace">
      <div className="clinical-followup-summary">
        <p>
          {goals.length} {goals.length === 1 ? "objetivo" : "objetivos"} ·{" "}
          {strategies.length}{" "}
          {strategies.length === 1 ? "estrategia" : "estrategias"}
        </p>
        <span title="Marcas de revisión de esta sesión">
          {entries.filter((item) => reviewed.includes(item.key)).length} de{" "}
          {entries.length} revisados
        </span>
      </div>
      <div className="clinical-next-grid">
        {entries.map((item) => {
          const done = reviewed.includes(item.key);
          const Icon = item.kind === "goal" ? Target : CalendarClock;
          return (
            <article
              className="clinical-next-card"
              key={item.key}
              data-status={done ? "complete" : "pending"}
            >
              <header>
                <Icon size={19} aria-hidden="true" />
                <div>
                  <p className="nuth-eyebrow">
                    {item.kind === "goal"
                      ? "Objetivo aprobado"
                      : "Estrategia aprobada"}
                  </p>
                  <h3>{item.title}</h3>
                </div>
              </header>
              <ClinicalStatusBadge status={done ? "complete" : "pending"}>
                {done ? "Revisado" : "Por revisar"}
              </ClinicalStatusBadge>
              <dl className="clinical-next-facts">
                <div>
                  <dt>Próxima revisión</dt>
                  <dd>{item.timeframe || "Plazo por acordar"}</dd>
                </div>
              </dl>
              <button
                type="button"
                className="clinical-text-action"
                onClick={() => setSelected(item.key)}
              >
                {done ? "Ver seguimiento" : "Revisar seguimiento"}
                <span className="sr-only">: {item.title}</span>
              </button>
            </article>
          );
        })}
      </div>
      {!entries.length && (
        <div className="clinical-notice">
          <p>
            Aprueba un objetivo o una estrategia para reunir aquí sus metas y
            plazos.
          </p>
          {onEdit && (
            <div className="clinical-next-toolbar mt-3">
              <button
                type="button"
                className="nuth-button-secondary"
                onClick={() => onEdit(2)}
              >
                Ir a objetivos
              </button>
              <button
                type="button"
                className="nuth-button-secondary"
                onClick={() => onEdit(3)}
              >
                Ir a estrategias
              </button>
            </div>
          )}
        </div>
      )}
      <ClinicalTaskDialog
        open={!!entry}
        title="Revisar seguimiento"
        description={entry?.title || "Revisa los acuerdos y sus plazos."}
        onClose={() => setSelected(null)}
        footer={
          <>
            {onEdit && (
              <button
                type="button"
                className="clinical-text-action"
                onClick={() => {
                  setSelected(null);
                  onEdit(entry?.kind === "goal" ? 2 : 3);
                }}
              >
                Editar {entry?.kind === "goal" ? "objetivo" : "estrategia"}
              </button>
            )}
            <button
              type="button"
              className="nuth-button"
              onClick={() => {
                if (entry) {
                  setReviewed((current) =>
                    current.includes(entry.key)
                      ? current
                      : [...current, entry.key]
                  );
                }
                setSelected(null);
              }}
            >
              <Check size={16} aria-hidden="true" />Marcar como revisado
            </button>
          </>
        }
      >
        <dl className="clinical-next-facts">
          {entry?.fields.filter((field) => field.value).map((field) => (
            <div key={field.label}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </div>
          ))}
        </dl>
      </ClinicalTaskDialog>
    </div>
  );
}
