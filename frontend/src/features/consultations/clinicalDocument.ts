import { isRecallEstimate, recallNutrients } from "./recallEstimate";
import {
  isObjectivePlan,
  type ObjectivePlan,
  objectivePlansEqual,
} from "../../../../supabase/functions/_shared/objectives";
import {
  isStrategyDocument,
  type Strategy,
  strategyCategories,
} from "../../../../supabase/functions/_shared/interventions";
import {
  clinicalRouteLabels,
  sharedObjectiveLabels,
  sharedStrategyLabels,
} from "../../../../supabase/functions/_shared/clinical-guidance";
import type { InterventionItem } from "@/src/services/clinicalInterventions";
import type { ConsultationSnapshot } from "@/src/types/domain";
import type { LongitudinalHistory } from "@/src/features/evolution/longitudinal";

export type ClinicalDocumentCard = {
  title: string;
  fields: { label?: string; value: string }[];
};
export type ClinicalDocumentSection = {
  title: string;
  cards: ClinicalDocumentCard[];
};
export type ConsultationDocumentData = {
  sections: ClinicalDocumentSection[];
  coveredKeys: string[];
};
const row = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const agreement = (value: unknown) =>
  value === "patient"
    ? "Acordado con el paciente"
    : value === "caregiver"
    ? "Acordado con el cuidador"
    : "Acuerdo pendiente";
const stamp = (value: unknown) =>
  text(value)
    ? new Date(text(value)).toLocaleString("es-MX", {
      timeZone: "America/Mexico_City",
    })
    : "";
const fields = (
  labels: Record<string, string>,
  value: Record<string, unknown>,
) =>
  Object.entries(labels).flatMap(([key, label]) =>
    text(value[key]) ? [{ label, value: text(value[key]) }] : []
  );
const states = {
  draft: "Borrador",
  approved: "Aprobada",
  executing: "En ejecución",
  completed: "Finalizada",
  withdrawn: "Retirada",
};
const events: Record<string, string> = {
  approve: "Aprobación",
  start: "Inicio de ejecución",
  communicate: "Comunicación",
  complete: "Finalización",
  withdraw: "Retiro",
  revert: "Borrador descartado",
};
const strategyLabels: Record<string, string> = {
  ...sharedStrategyLabels,
  etiologyLink: "Relación con la etiología",
  adjustmentCriteria: "Criterios de ajuste",
  referenceTitle: "Referencia",
  referenceUrl: "Fuente",
  referenceVersion: "Versión de referencia",
  referenceNotes: "Fundamento clínico",
};
function strategyCard(strategy: Strategy, title: string): ClinicalDocumentCard {
  return {
    title,
    fields: [
      {
        label: "Categoría y prioridad",
        value: `${
          strategyCategories[strategy.category]
        } · Prioridad ${strategy.priority}`,
      },
      ...fields(strategyLabels, strategy),
      ...(clinicalRouteLabels[strategy.route]
        ? [{ label: "Vía", value: clinicalRouteLabels[strategy.route] }]
        : []),
      {
        label: "Objetivos vinculados",
        value:
          strategy.goalIndexes.map((index) => `Objetivo ${index + 1}`).join(
            ", ",
          ) || "Sin vincular",
      },
      { label: "Acuerdo", value: agreement(strategy.agreement) },
      ...strategy.evidence.filter((fact) =>
        fact.source.trim() || fact.finding.trim()
      ).map((fact) => ({
        label: fact.source || "Evidencia registrada",
        value: fact.finding,
      })),
      ...(strategy.missingContext.length
        ? [{
          label: "Información por confirmar",
          value: strategy.missingContext.join("\n"),
        }]
        : []),
    ],
  };
}
/** Both professional exports consume these exact blocks from saved data, never browser drafts. */
export function buildClinicalDocumentData(
  snapshot: ConsultationSnapshot,
  interventions: InterventionItem[] = [],
  history?: LongitudinalHistory,
): ConsultationDocumentData {
  const records = row(snapshot.clinical_records),
    sections: ClinicalDocumentSection[] = [],
    coveredKeys: string[] = [];
  const recall = snapshot.clinical_records?.recall;
  if (recall) {
    sections.push({
      title: "Alimentación del día · recordatorio confirmado",
      cards: [{
        title: "Registro confirmado",
        fields: [
          ...(recall.narrative
            ? [{ label: "Relato", value: recall.narrative }]
            : []),
          ...recall.items.map((item) => ({
            label: item.mealLabel,
            value: `${item.food.name} · ${item.quantity} ${item.unit}`,
          })),
          ...(recall.approved_at
            ? [{ label: "Confirmado", value: stamp(recall.approved_at) }]
            : []),
          ...(recall.method === "ai_estimate"
            ? [{
              label: "Método",
              value: "Estimación con IA revisada por el profesional",
            }]
            : []),
        ],
      }],
    });
  }
  if (recall?.estimate && isRecallEstimate(recall.estimate)) {
    sections.push({
      title: "Estimación nutricional del recordatorio",
      cards: recall.estimate.meals.map<ClinicalDocumentCard>((meal) => ({
        title: meal.mealLabel,
        fields: [
          { value: meal.description },
          ...recallNutrients.map((nutrient) => ({
            label: nutrient.label,
            value: `${meal[nutrient.key]} ${nutrient.unit}`,
          })),
        ],
      })).concat([{
        title: "Aspectos revisados de la estimación",
        fields: [{
          label: "Supuestos",
          value: recall.estimate.assumptions.join("\n"),
        }, {
          label: "Incertidumbres",
          value: recall.estimate.uncertainties.join("\n"),
        }],
      }]),
    });
  }
  const measurements =
    history?.series.flatMap((series) =>
      series.points.filter((point) =>
        point.consultation_id === snapshot.consultation_id
      ).map((point) => ({
        label: series.label,
        value: [
          point.display_value,
          series.unit,
          series.method,
          series.provenance,
          point.interpretation?.rule?.label,
        ].filter(Boolean).join(" · "),
      }))
    ) ?? [];
  if (measurements.length) {
    sections.push({
      title: "Mediciones, cálculos y estudios de esta consulta",
      cards: [{ title: "Resultados registrados", fields: measurements }],
    });
  }
  const pes = row(records.pes);
  if (text(pes.approved_at)) {
    sections.push({
      title: "Revisión del diagnóstico PES",
      cards: [{
        title: "Aprobación clínica",
        fields: [
          {
            label: "Estado",
            value: `PES aprobado · ${stamp(pes.approved_at)}`,
          },
          ...(Array.isArray(pes.evidence)
            ? pes.evidence.map((fact) => ({
              label: text(row(fact).source) || "Evidencia",
              value: text(row(fact).finding),
            })).filter((fact) => fact.value)
            : []),
          ...(Array.isArray(pes.uncertainties)
            ? [{
              label: "Aspectos por confirmar",
              value: pes.uncertainties.map(String).join("\n"),
            }]
            : []),
        ],
      }],
    });
  }
  const approved = row(records.objective), plans = {...row(records.objective_plans)};
  if (typeof approved.question_key === "string" && isObjectivePlan(approved.smart_plan) && !plans[approved.question_key]) plans[approved.question_key]=approved.smart_plan;
  for (const [key, candidate] of Object.entries(plans)) {
    if (!isObjectivePlan(candidate) || !candidate.goals.length) continue;
    const plan: ObjectivePlan = candidate;
    const approvedHere = approved.question_key === key &&
      !!text(approved.approved_at) && isObjectivePlan(approved.smart_plan) &&
      objectivePlansEqual(plan, approved.smart_plan) &&
      plan.pesApprovedAt === pes.approved_at;
    coveredKeys.push(key);
    sections.push({
      title: "Objetivos acordados · detalle estructurado",
      cards: plan.goals.map((goal, index) => ({
        title: `Objetivo ${index + 1} · ${
          approvedHere ? "Aprobado" : "Borrador guardado"
        }`,
        fields: [
          ...fields({
            ...sharedObjectiveLabels,
            etiology: "Relación con la etiología",
            sign: "Signo o síntoma del PES",
          }, goal),
          { label: "Acuerdo", value: agreement(goal.agreement) },
          ...(approvedHere
            ? [{ label: "Aprobación", value: stamp(approved.approved_at) }]
            : []),
          ...(goal.targetOrigin === "proposed" ||
              goal.timeframeOrigin === "proposed"
            ? [{
              label: "Origen de meta o plazo",
              value: approvedHere
                ? "Meta o plazo propuestos y aprobados por el profesional"
                : "Meta o plazo propuestos · aprobación pendiente",
            }]
            : []),
        ],
      })),
    });
  }
  if (interventions.length) {
    sections.push({
      title: "Estrategias de intervención",
      cards: interventions.flatMap((item) => [
        ...(item.approved && isStrategyDocument(item.approved.document)
          ? [{
            ...strategyCard(
              item.approved.document.strategy,
              `${item.approved.document.strategy.title || "Estrategia"} · ${
                states[item.state]
              }`,
            ),
            fields: [
              {
                label: "Estado clínico",
                value: `${
                  states[item.state]
                } · Versión ${item.approved.version}${
                  item.requiresReview ? " · Requiere nueva revisión" : ""
                }`,
              },
              ...strategyCard(item.approved.document.strategy, "").fields,
              { label: "Aprobada", value: stamp(item.approved.approvedAt) },
              ...fields({
                executor: "Ejecutor registrado",
                startDate: "Inicio de ejecución registrado",
              }, item.execution),
              ...(item.execution.communication
                ? [{
                  label: "Comunicación registrada",
                  value: `${item.execution.communication.recipient} · ${
                    stamp(item.execution.communication.recordedAt)
                  }`,
                }]
                : []),
              ...item.history.map((event) => ({
                label: `${events[event.action] ?? event.action} · ${
                  stamp(event.recorded_at)
                }`,
                value: [
                  text(event.payload.reason),
                  text(event.payload.executor),
                  text(event.payload.recipient),
                ].filter(Boolean).join(" · ") || `Versión ${event.version}`,
              })),
            ],
          }]
          : []),
        ...(item.draft && isStrategyDocument(item.draft)
          ? [
            strategyCard(
              item.draft.strategy,
              `${
                item.draft.strategy.title || "Estrategia"
              } · Borrador guardado`,
            ),
          ]
          : []),
      ]),
    });
  }
  return { sections, coveredKeys };
}
