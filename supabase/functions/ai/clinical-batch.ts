import { AIError } from "./core.ts";
import type { ClinicalSource } from "./clinical.ts";
import { isObjectivePlan, type ObjectiveGoal } from "../_shared/objectives.ts";
import { isStrategyDocument } from "../_shared/interventions.ts";
import { hasUsablePesEtiology } from "../_shared/pes.ts";
import {
  type ClinicalBatchFeature,
  type ClinicalBatchProposal,
  clinicalBatchStages,
} from "../_shared/clinical-batch.ts";

export type BatchStages = Partial<
  Record<ClinicalBatchFeature, ClinicalBatchProposal>
>;

export function clinicalBatchInput(
  source: ClinicalSource,
  stages: BatchStages,
  feature: ClinicalBatchFeature,
) {
  const previous = clinicalBatchStages.slice(
    0,
    clinicalBatchStages.findIndex((stage) => stage.feature === feature),
  );
  const inputGenerations = previous.map((stage) => {
    const id = stages[stage.feature]?.generationId;
    if (!id) throw new AIError("batch_previous_stage_required");
    return id;
  });
  if (!previous.length) return { source, inputGenerations };

  const draft = stages.pes_diagnosis!;
  const { problem, etiology, signsSymptoms, pesStatement } = draft.output;
  const draftUsable = typeof problem === "string" && !!problem.trim() &&
    hasUsablePesEtiology(etiology) &&
    Array.isArray(signsSymptoms) &&
    signsSymptoms.some((sign) => typeof sign === "string" && sign.trim()) &&
    typeof pesStatement === "string";
  const pes = draftUsable
    ? {
      approved_at: `draft:${draft.generationId}`,
      problem,
      etiology,
      signsSymptoms: (signsSymptoms as string[]).join("\n"),
      pesStatement,
    }
    : source.approvedPes;
  if (
    !pes || !hasUsablePesEtiology(pes.etiology) || !pes.signsSymptoms.trim()
  ) throw new AIError("batch_pes_review_required");

  const clinical: ClinicalSource = {
    ...source,
    approvedPes: pes,
    provisionalPes: draftUsable,
  };
  if (feature === "consultation_support") {
    return { source: clinical, inputGenerations };
  }

  const objectives = stages.consultation_support!;
  const suggestions = objectives.output.objectives;
  const goals = Array.isArray(suggestions)
    ? suggestions.map((item) => item?.goal as ObjectiveGoal)
    : [];
  const smart_plan = {
    version: 1 as const,
    pesApprovedAt: pes.approved_at,
    goals,
  };
  const signs = pes.signsSymptoms.split("\n").map((sign) => sign.trim());
  if (
    goals.length && isObjectivePlan(smart_plan) &&
    goals.every((goal) =>
      goal.etiology === pes.etiology && signs.includes(goal.sign)
    )
  ) {
    clinical.approvedObjective = null;
    clinical.planningObjective = {
      approved_at: `draft:${objectives.generationId}`,
      pes_approved_at: pes.approved_at,
      smart_plan,
    };
  } else if (
    !source.approvedObjective?.smart_plan?.goals.length ||
    source.approvedObjective.pes_approved_at !== pes.approved_at
  ) {
    throw new AIError("batch_objectives_review_required");
  }
  if (feature === "intervention_strategy") {
    return { source: clinical, inputGenerations };
  }

  const strategies = stages.intervention_strategy!.output.strategies;
  if (
    Array.isArray(strategies) && strategies.length &&
    strategies.every(isStrategyDocument)
  ) {
    clinical.approvedStrategies = [];
    clinical.provisionalStrategies = strategies.map((document) => ({
      document,
    }));
  } else if (!source.approvedStrategies?.length) {
    throw new AIError("batch_strategies_review_required");
  }
  return { source: clinical, inputGenerations };
}
