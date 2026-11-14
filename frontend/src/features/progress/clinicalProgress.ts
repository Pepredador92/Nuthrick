import { emptyValue, formatAnswer, type Question } from "@/src/features/consultations/questionnaire";
import { isObjectivePlan } from "../../../../supabase/functions/_shared/objectives";
import { sharedObjectiveLabels, sharedStrategyLabels } from "../../../../supabase/functions/_shared/clinical-guidance";
import type { Strategy } from "../../../../supabase/functions/_shared/interventions";
import type { Consultation } from "@/src/types/domain";

export const goalStatuses = {
  unreviewed: "Sin revisar",
  achieved: "Alcanzado",
  partial: "Avance parcial",
  no_progress: "Sin avance",
} as const;

export const strategyStatuses = {
  unreviewed: "Sin revisar",
  applied: "Sí",
  partial: "En parte",
  not_applied: "Todavía no",
} as const;

export const emptyGoalAssessment = {
  status: "unreviewed", result: "", note: "", date: null, visitId: null,
} as const;

export const emptyStrategyAssessment = {
  status: "unreviewed", date: null, visitId: null,
} as const;

type AssessmentDate = { date: string | null; visitId: string | null };
export type ProgressGoal = {
  id: string;
  text: string;
  assessment: AssessmentDate & { status: keyof typeof goalStatuses; result: string; note: string };
};
export type ProgressStrategy = {
  id: string;
  text: string;
  goalIds: string[];
  assessment: AssessmentDate & { status: keyof typeof strategyStatuses };
};
export type ProgressDocument = {
  goals: ProgressGoal[];
  strategies: ProgressStrategy[];
  instructions: string;
};
export type ProgressReview = {
  id: string;
  version: number;
  recorded_at: string;
  review_consultation_id: string | null;
  review_consultation_date: string | null;
  latest_linked_visit_date?: string | null;
  document: ProgressDocument;
};
type Answer = { key: string; value: unknown };
export type ProgressSource = Pick<Consultation, "id" | "consultation_date" | "display_name" | "consultation_type" | "sequence_number"> & {
  revision: number;
  current: boolean;
  objective: unknown;
  strategies: { id: string; strategy: Strategy }[];
  instructions: (Answer & { value: string | number | boolean })[];
  legacy_objectives: (Answer & { question: Question | null })[];
  latest_review: ProgressReview | null;
};

const instructionLabels: Record<string, string> = {
  first_actions: "Indicaciones acordadas",
  patient_instructions: "Indicaciones para el paciente",
  recommendations: "Recomendaciones",
};

function agreementText(labels: Record<string, string>, values: Record<string, unknown>, first: string) {
  return [first, ...Object.entries(labels).flatMap(([key, label]) => {
    const value = values[key];
    return typeof value === "string" && value.trim() ? [`${label}: ${value.trim()}`] : [];
  })].filter(Boolean).join("\n");
}

export function originalProgress(source: ProgressSource): ProgressDocument {
  const goals: ProgressGoal[] = isObjectivePlan(source.objective)
    ? source.objective.goals.map((goal, index) => ({
        id: `goal-${index}`,
        text: agreementText(sharedObjectiveLabels, { ...goal, outcome: "" }, goal.outcome),
        assessment: { ...emptyGoalAssessment },
      }))
    : [];
  for (const answer of source.legacy_objectives) {
    const question = answer.question;
    if (!question || emptyValue(answer.value)) continue;
    const entries = question.question_type === "repeatable_group" && Array.isArray(answer.value)
      ? answer.value : [answer.value];
    entries.forEach((entry, index) => {
      if (emptyValue(entry)) return;
      const value = formatAnswer(question, question.question_type === "repeatable_group" ? [entry] : entry);
      const text = (question.question_type === "repeatable_group" ? value.replace(/^1\. /, "") : value).trim();
      if (text) goals.push({ id: `${answer.key}-${index}`, text, assessment: { ...emptyGoalAssessment } });
    });
  }
  return {
    goals,
    strategies: source.strategies.map(({ id, strategy }) => ({
      id,
      text: agreementText(sharedStrategyLabels, { ...strategy, title: "", action: "" }, [strategy.title, strategy.action].filter(Boolean).join("\n")),
      goalIds: strategy.goalIndexes.map((index) => `goal-${index}`).filter((goalId) => goals.some((goal) => goal.id === goalId)),
      assessment: { ...emptyStrategyAssessment },
    })),
    instructions: source.instructions.map(({ key, value }) => `${instructionLabels[key]}\n${typeof value === "boolean" ? value ? "Sí" : "No" : String(value).trim()}`).join("\n\n"),
  };
}

export const progressSourceKey = (source: ProgressSource) => `${source.id}:${source.revision}`;

export function sourcePrecedesVisit(source: ProgressSource, visit: Consultation) {
  const timeDifference = Date.parse(source.consultation_date) - Date.parse(visit.consultation_date);
  const sequenceDifference = source.sequence_number - visit.sequence_number;
  return source.id !== visit.id && (timeDifference || sequenceDifference || source.id.localeCompare(visit.id)) < 0;
}

export function activeProgressGoals(sources: ProgressSource[]) {
  return sources.filter((source) => source.current).flatMap((source) => {
    const document = source.latest_review?.document ?? originalProgress(source);
    return document.goals.filter((goal) => goal.assessment.status !== "achieved")
      .map((goal) => ({ source, goal }));
  });
}

export function progressReviewedAfterVisit(source: ProgressSource, visit: Consultation) {
  const lastVisitDate = source.latest_review?.latest_linked_visit_date ?? source.latest_review?.review_consultation_date;
  return !!lastVisitDate && Date.parse(lastVisitDate) > Date.parse(visit.consultation_date);
}
