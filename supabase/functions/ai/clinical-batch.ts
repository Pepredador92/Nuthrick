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

// The goal editor mirrors its text into the questionnaire before approval.
// Keep only the confirmed objective field; downstream drafts take their
// planning anchors from the checkpoint for this batch.
export function clinicalBatchSource(source: ClinicalSource): ClinicalSource {
  const approvedKey = source.approvedObjective?.question_key;
  const facts = source.facts.filter((fact) => {
    const answer =
      /^Entrevista · (objectives|treatment objective|next objectives)(?: · |$)/u
        .exec(fact.source);
    return !answer || answer[1].replaceAll(" ", "_") === approvedKey;
  });
  return { ...source, facts };
}

export function clinicalBatchInput(
  source: ClinicalSource,
  stages: BatchStages,
  feature: ClinicalBatchFeature,
) {
  const previous = clinicalBatchStages.slice(
    0,
    clinicalBatchStages.findIndex((stage) => stage.feature === feature),
  );
  const inputGenerations: string[] = [];
  for (const stage of previous) {
    const proposal = stages[stage.feature];
    if (!proposal?.generationId) {
      throw new AIError("batch_previous_stage_required");
    }
    if (
      inputGenerations.some((id, index) =>
        proposal.inputGenerations?.[index] !== id
      )
    ) {
      throw new AIError("batch_previous_stage_stale");
    }
    inputGenerations.push(proposal.generationId);
  }
  const assessment = { source, inputGenerations, assessment: true };
  if (!previous.length) return { source, inputGenerations, assessment: false };

  const draft = stages.pes_diagnosis!;
  const { problem, etiology, signsSymptoms, pesStatement } = draft.output;
  const draftUsable = typeof problem === "string" && !!problem.trim() &&
    hasUsablePesEtiology(etiology) &&
    Array.isArray(signsSymptoms) &&
    signsSymptoms.some((sign) => typeof sign === "string" && sign.trim()) &&
    typeof pesStatement === "string";
  if (!draftUsable) return assessment;
  const pes = {
    approved_at: `draft:${draft.generationId}`,
    problem,
    etiology,
    signsSymptoms: (signsSymptoms as string[]).join("\n"),
    pesStatement,
  };

  const clinical: ClinicalSource = {
    ...source,
    approvedPes: pes,
    provisionalPes: draftUsable,
  };
  if (feature === "consultation_support") {
    return { source: clinical, inputGenerations, assessment: false };
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
    !objectives.output.batchBasis && goals.length && isObjectivePlan(smart_plan) &&
    goals.every((goal) => goal.etiology.trim() && signs.includes(goal.sign))
  ) {
    clinical.approvedObjective = null;
    clinical.planningObjective = {
      approved_at: `draft:${objectives.generationId}`,
      pes_approved_at: pes.approved_at,
      smart_plan,
    };
  } else return assessment;
  if (feature === "intervention_strategy") {
    return { source: clinical, inputGenerations, assessment: false };
  }

  const strategyOutput = stages.intervention_strategy!.output;
  if (strategyOutput.batchBasis) return assessment;
  const strategies = strategyOutput.strategies;
  if (
    Array.isArray(strategies) && strategies.length &&
    strategies.every(isStrategyDocument)
  ) {
    clinical.approvedStrategies = [];
    clinical.provisionalStrategies = strategies.map((document) => ({
      document,
    }));
  } else return assessment;
  return { source: clinical, inputGenerations, assessment: false };
}
