import { strict as assert } from "node:assert";
import {
  emptyObjective,
  isObjectivePlan,
  objectiveFields,
  type ObjectiveGoal,
} from "../_shared/objectives.ts";
import {
  emptyStrategy,
  isStrategyDocument,
  strategyFields,
} from "../_shared/interventions.ts";
import type { ClinicalSource } from "./clinical.ts";
import {
  buildInterventionContext,
  hydrateInterventionOutput,
  interventionAdapter,
  interventionEvidenceValid,
} from "./intervention.ts";
import {
  type AIStore,
  type Generation,
  runAIRequest,
  validOutput,
} from "./core.ts";

const generationId = "11111111-1111-4111-8111-111111111111";
const longGoal = (): ObjectiveGoal => ({
  ...emptyObjective(),
  outcome: "o".repeat(400),
  etiology: "e".repeat(800),
  sign: "s".repeat(800),
  indicator: "i".repeat(400),
  baseline: "b".repeat(400),
  target: "t".repeat(400),
  timeframe: "f".repeat(400),
  monitoring: "m".repeat(400),
  feasibility: "v".repeat(400),
  agreement: "patient",
});
function source(goals = [longGoal()]): ClinicalSource {
  const pes = {
    approved_at: "2026-10-18T12:00:00Z",
    problem: "Ingesta insuficiente",
    etiology: goals[0].etiology,
    signsSymptoms: goals[0].sign,
    pesStatement: `Ingesta insuficiente relacionado con ${
      goals[0].etiology
    }, evidenciado por ${goals[0].sign}.`,
  };
  const smart_plan = {
    version: 1 as const,
    pesApprovedAt: pes.approved_at,
    goals,
  };
  assert.equal(isObjectivePlan(smart_plan), true);
  assert.ok(pes.pesStatement.length <= 2000);
  return {
    stamp: "synthetic",
    facts: [],
    identifiers: [],
    approvedPes: pes,
    approvedObjective: {
      approved_at: "2026-10-18T12:10:00Z",
      pes_approved_at: pes.approved_at,
      smart_plan,
    },
  };
}
function proposal(ids = ["f1"]) {
  const base = emptyStrategy();
  return {
    ...Object.fromEntries(
      strategyFields.filter((k) => !k.startsWith("reference")).map(
        (k) => [k, base[k]],
      ),
    ),
    title: "Educación nutricional",
    action: "Practicar registro",
    etiologyLink: "Aborda conocimientos",
    category: "education",
    route: "not_applicable",
    priority: 1,
    goalIndexes: [0],
    evidenceFactIds: ids,
    referenceIds: ["academy-intervention"],
    missingContext: ["Acordar frecuencia"],
  };
}
Deno.test("long approved SMART goals produce lossless evidence accepted by the editor", () => {
  const g = longGoal(), context = buildInterventionContext(source([g]));
  assert.ok(
    JSON.stringify(context.approvedGoals[0]).length > 4000,
    "reproduces the original oversized JSON fact",
  );
  const facts = context.facts.filter((f) =>
    f.source.startsWith("Objetivo aprobado · 1")
  );
  for (const field of objectiveFields) {
    assert.ok(
      facts.some((f) => f.finding === g[field]),
      `${field} preserved verbatim`,
    );
  }
  assert.ok(facts.every((f) => f.finding.length <= 4000));
  const output = { strategies: [proposal(facts.map((f) => f.id))] };
  assert.equal(validOutput(interventionAdapter.schema, output), true);
  assert.equal(interventionEvidenceValid(output, context), true);
  const doc =
    hydrateInterventionOutput(output, context, generationId).strategies[0];
  assert.equal(isStrategyDocument(doc), true);
  assert.equal(doc.strategy.agreement, "pending");
  assert.deepEqual(
    doc.strategy.evidence,
    facts.map(({ source, finding }) => ({ source, finding })),
  );
});
Deno.test("all three approved goals keep their evidence and bindings", () => {
  const context = buildInterventionContext(
    source([longGoal(), longGoal(), longGoal()]),
  );
  for (let index = 0; index < 3; index++) {
    const facts = context.facts.filter((f) =>
      f.source.startsWith(`Objetivo aprobado · ${index + 1} · `)
    );
    assert.equal(facts.length, objectiveFields.length);
    const output = {
      strategies: [{
        ...proposal(facts.map((f) => f.id)),
        goalIndexes: [index],
      }],
    };
    assert.equal(interventionEvidenceValid(output, context), true);
    const doc =
      hydrateInterventionOutput(output, context, generationId).strategies[0];
    assert.equal(isStrategyDocument(doc), true);
    assert.deepEqual(doc.strategy.goalIndexes, [index]);
  }
});
Deno.test("quotes, line breaks, Unicode and redaction do not truncate approved goal evidence", () => {
  const g = {
    ...longGoal(),
    baseline: 'Línea "citada"\nRuta \\ y valoración áéíóú 😀',
    feasibility: "Apoyo de Persona Sintética",
  };
  const input = source([g]);
  input.identifiers = ["Persona Sintética"];
  const context = buildInterventionContext(input);
  assert.ok(context.facts.some((f) => f.finding === g.baseline));
  assert.ok(
    context.facts.every((f) => !f.finding.includes("Persona Sintética")),
  );
  assert.ok(JSON.stringify(context.approvedGoals).includes("[dato omitido]"));
  assert.equal(
    interventionEvidenceValid({ strategies: [proposal()] }, context),
    true,
  );
});
Deno.test("unsupported numbers and invented citations stay rejected", () => {
  const context = buildInterventionContext(source());
  assert.equal(
    interventionEvidenceValid({ strategies: [proposal(["f99"])] }, context),
    false,
  );
  assert.equal(
    interventionEvidenceValid(
      { strategies: [proposal(["f1", "f1"])] },
      context,
    ),
    false,
  );
  assert.equal(
    interventionEvidenceValid({
      strategies: [{ ...proposal(), dose: "999 mg" }],
    }, context),
    false,
  );
});
Deno.test("provider success cannot return evidence that the editor rejects", () => {
  for (
    const patch of [{ finding: "x".repeat(4001) }, {
      source: "Objetivo aprobado · " + "x".repeat(2001),
    }]
  ) {
    const context = buildInterventionContext(source());
    Object.assign(context.facts[0], patch);
    assert.equal(
      interventionEvidenceValid({ strategies: [proposal()] }, context),
      false,
    );
  }
});
Deno.test("multibyte documents exceeding the database byte limit are rejected", () => {
  const context = buildInterventionContext(source()),
    item = proposal() as Record<string, unknown>;
  context.facts[0].finding = "漢".repeat(1500);
  for (const key of strategyFields) {
    if (!key.startsWith("reference")) item[key] = "漢".repeat(1500);
  }
  const doc =
    hydrateInterventionOutput({ strategies: [item] }, context, generationId)
      .strategies[0];
  assert.ok(new TextEncoder().encode(JSON.stringify(doc)).length > 90000);
  assert.equal(isStrategyDocument(doc), false);
  assert.equal(
    interventionEvidenceValid({ strategies: [item] }, context),
    false,
  );
});
Deno.test("the byte bound includes PostgreSQL JSONB separator spacing", () => {
  const context = buildInterventionContext(source());
  const doc = hydrateInterventionOutput(
    { strategies: [proposal()] },
    context,
    generationId,
  ).strategies[0];
  for (const key of strategyFields) doc.strategy[key] = "x".repeat(1500);
  doc.strategy.evidence = Array.from(
    { length: 10 },
    () => ({ source: "", finding: "x".repeat(4000) }),
  );
  doc.strategy.missingContext = Array.from(
    { length: 15 },
    () => "x".repeat(400),
  );
  let remaining = 89999 - new TextEncoder().encode(JSON.stringify(doc)).length;
  assert.ok(remaining > 0 && remaining <= 20000);
  for (const entry of doc.strategy.evidence) {
    const length = Math.min(2000, remaining);
    entry.source = "x".repeat(length);
    remaining -= length;
  }
  assert.equal(new TextEncoder().encode(JSON.stringify(doc)).length, 89999);
  assert.equal(isStrategyDocument(doc), false);
});
Deno.test("the request pipeline validates hydrated documents before settling a successful result", async () => {
  const context = buildInterventionContext(source());
  context.facts[0].finding = "x".repeat(4001);
  const statuses: string[] = [],
    usage = { input_tokens: 20, output_tokens: 10, cached_tokens: 0 };
  const store: AIStore = {
    config: () =>
      Promise.resolve({
        feature: "intervention_strategy",
        enabled: true,
        provider: "openai",
        model: "synthetic",
        prompt_version: "intervention_strategy@1",
        max_input_tokens: 8192,
        max_output_tokens: 4500,
        timeout_ms: 1000,
        reasoning_level: null,
        temperature: null,
      }),
    context: () => Promise.resolve({ stamp: "synthetic", context }),
    bindContext: () => Promise.resolve(),
    reserve: () =>
      Promise.resolve({
        created: true,
        generation: { id: generationId, status: "reserved" } as Generation,
      }),
    claim: () => Promise.resolve(true),
    settle: (_id, status, actual) => {
      statuses.push(status);
      assert.deepEqual(actual, usage);
      return Promise.resolve({ id: generationId, status, charged_credits: 1 });
    },
    uncertain: () => Promise.resolve(),
  };
  await assert.rejects(
    () =>
      runAIRequest(
        {
          feature: "intervention_strategy",
          idempotencyKey: generationId,
          patientId: generationId,
          consultationId: generationId,
          revision: 1,
        },
        store,
        {
          run: () =>
            Promise.resolve({
              status: "completed",
              output: { strategies: [proposal()] },
              usage,
              responseId: "synthetic",
            }),
        },
      ),
    /invalid_output/,
  );
  assert.deepEqual(statuses, ["invalid_output"]);
});
