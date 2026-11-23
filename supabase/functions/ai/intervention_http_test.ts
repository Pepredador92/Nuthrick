// Actual HTTP handler with synthetic auth, database and model responses.
// Outbound requests are intercepted; only the local HTTP listener uses network.
import { strict as assert } from "node:assert";
import { emptyObjective, type ObjectiveGoal } from "../_shared/objectives.ts";
import {
  emptyStrategy,
  isStrategyDocument,
  strategyFields,
} from "../_shared/interventions.ts";
import type { InterventionContext } from "./intervention.ts";

Deno.test("HTTP strategy proposals retain long SMART evidence and reject unusable documents", async (t) => {
  const nativeFetch = globalThis.fetch, nativeServe = Deno.serve;
  const env = {
    SUPABASE_URL: "http://synthetic.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key",
    OPENAI_API_KEY: "synthetic-provider-key",
    NUTHRICK_AI_ENABLED: "true",
  };
  const previous = Object.fromEntries(
    Object.keys(env).map((key) => [key, Deno.env.get(key)]),
  );
  for (const [key, value] of Object.entries(env)) Deno.env.set(key, value);
  const owner = "11111111-1111-4111-8111-111111111111";
  const goal: ObjectiveGoal = {
    ...emptyObjective(),
    outcome: "o".repeat(400),
    etiology: "e".repeat(800),
    sign: "s".repeat(800),
    indicator: "i".repeat(400),
    baseline: 'Registro "citado"\nRuta \\ 😀 '.repeat(15),
    target: "t".repeat(400),
    timeframe: "f".repeat(400),
    monitoring: "m".repeat(400),
    feasibility: "v".repeat(400),
    agreement: "patient",
  };
  assert.ok(JSON.stringify(goal).length > 4000);
  const pes = {
    approved_at: "2026-10-18T12:00:00Z",
    problem: "Ingesta insuficiente",
    etiology: goal.etiology,
    signsSymptoms: goal.sign,
    pesStatement: "Enunciado sintético",
  };
  let server: Deno.HttpServer | undefined, port = 0, count = 1;
  let oversized = false,
    unverifiedParameters = false,
    clippedMonitoring = false;
  let guidanceSeen = "", revisionSeen: unknown, instructionsSeen = "";
  let maxStrategiesSeen: number | undefined;
  const settlements: string[] = [];
  const json = (value: unknown) =>
    new Response(JSON.stringify(value), {
      headers: { "content-type": "application/json" },
    });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("http://127.0.0.1:")) return nativeFetch(input, init);
    if (url.endsWith("/auth/v1/user")) {
      return json({ id: owner, is_anonymous: false });
    }
    if (url.includes("/rest/v1/rpc/")) {
      const body = JSON.parse(String(init?.body));
      if (url.endsWith("ai_clinical_source")) {
        return json({
          stamp: "synthetic",
          facts: [],
          identifiers: [],
          approvedPes: pes,
          approvedObjective: {
            approved_at: "2026-10-18T12:10:00Z",
            pes_approved_at: pes.approved_at,
            smart_plan: {
              version: 1,
              pesApprovedAt: pes.approved_at,
              goals: Array.from({ length: count }, () => goal),
            },
          },
        });
      }
      if (
        url.endsWith("ai_bind_clinical_context") ||
        url.endsWith("ai_provider_metadata") ||
        url.endsWith("ai_store_consultation_proposal")
      ) return json(null);
      assert.ok(url.endsWith("ai_server"), url);
      switch (body.p_action) {
        case "config":
          return json({
            feature: "intervention_strategy",
            enabled: true,
            provider: "openai",
            model: "synthetic",
            prompt_version: "intervention_strategy@3",
            max_input_tokens: 8192,
            max_output_tokens: 4500,
            timeout_ms: 2000,
            reasoning_level: "low",
            temperature: null,
          });
        case "reserve":
          return json({
            created: true,
            generation: { id: owner, status: "reserved" },
          });
        case "claim":
          return json({ claimed: true });
        case "settle":
          settlements.push(body.p_data.status);
          return json({
            id: owner,
            status: body.p_data.status,
            charged_credits: 1,
          });
        default:
          throw new Error(`Unexpected RPC action ${body.p_action}`);
      }
    }
    if (url === "https://api.openai.com/v1/responses/input_tokens") {
      return json({ input_tokens: 2500 });
    }
    assert.equal(url, "https://api.openai.com/v1/responses");
    const payload = JSON.parse(String(init?.body));
    const context: InterventionContext & { strategyToRevise?: unknown } = JSON
      .parse(payload.input);
    guidanceSeen = context.feedback;
    revisionSeen = context.strategyToRevise;
    instructionsSeen = payload.instructions;
    maxStrategiesSeen =
      payload.text.format.schema.properties.strategies.maxItems;
    const base = emptyStrategy();
    const output = {
      strategies: context.approvedGoals.slice(0, maxStrategiesSeen).map((
        g,
      ) => ({
        ...Object.fromEntries(
          strategyFields.filter((key) => !key.startsWith("reference")).map(
            (key) => [key, oversized ? "漢".repeat(1499) + "." : base[key]],
          ),
        ),
        title: oversized ? "漢".repeat(1500) : "Educación nutricional",
        action: oversized
          ? "漢".repeat(1499) + "."
          : "Practicar el registro con la persona.",
        ...(clippedMonitoring
          ? { monitoring: "Revisar qué funcionó y qué falta por confir" }
          : {}),
        etiologyLink: "Aborda conocimientos",
        ...(unverifiedParameters
          ? { dose: "999 mg", frequency: "Diariamente" }
          : {}),
        category: "education",
        route: "not_applicable",
        priority: 1,
        goalIndexes: [g.index],
        evidenceFactIds: context.facts.filter((f) =>
          f.source.startsWith(`Objetivo aprobado · ${g.index + 1} · `)
        ).map((f) => f.id),
        referenceIds: ["academy-intervention"],
        missingContext: ["Acordar frecuencia"],
      })),
    };
    return json({
      id: "resp_synthetic",
      status: "completed",
      usage: { input_tokens: 20, output_tokens: 20, total_tokens: 40 },
      output: [{
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(output) }],
      }],
    });
  };
  Deno.serve = ((handler: Deno.ServeHandler) => {
    server = nativeServe({
      hostname: "127.0.0.1",
      port: 0,
      onListen: (address) => {
        port = address.port;
      },
    }, handler);
    return server;
  }) as typeof Deno.serve;
  try {
    await import("./index.ts");
    const request = async (options: Record<string, unknown> = {}) => {
      const response = await nativeFetch(
        `http://127.0.0.1:${port}/functions/v1/ai`,
        {
          method: "POST",
          headers: {
            authorization: "Bearer synthetic",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            feature: "intervention_strategy",
            idempotencyKey: crypto.randomUUID(),
            patientId: owner,
            consultationId: owner,
            revision: 1,
            ...options,
          }),
        },
      );
      return { status: response.status, body: await response.json() };
    };
    for (const goals of [1, 3]) {
      await t.step(
        `${goals} long approved goals return complete editable evidence`,
        async () => {
          count = goals;
          const response = await request();
          assert.equal(response.status, 200, JSON.stringify(response.body));
          assert.equal(response.body.status, "succeeded");
          assert.equal(response.body.output.strategies.length, goals);
          for (const doc of response.body.output.strategies) {
            assert.equal(isStrategyDocument(doc), true);
            assert.equal(doc.generationId, owner);
            assert.equal(doc.strategy.agreement, "pending");
            assert.equal(doc.strategy.evidence.length, 9);
            assert.ok(
              doc.strategy.evidence.some((f: { finding: string }) =>
                f.finding === goal.baseline
              ),
            );
            assert.ok(
              doc.strategy.evidence.some((f: { finding: string }) =>
                f.finding === goal.etiology
              ),
            );
            assert.ok(
              doc.strategy.evidence.some((f: { finding: string }) =>
                f.finding === goal.sign
              ),
            );
          }
          assert.equal(settlements.at(-1), "succeeded");
        },
      );
    }
    await t.step(
      "professional guidance reaches the prompt for a group and one selected strategy",
      async () => {
        const feedback = "Usa ejemplos de casa.";
        const grouped = await request({ strategyFeedback: feedback });
        assert.equal(grouped.status, 200);
        assert.equal(grouped.body.output.strategies.length, 3);
        assert.equal(guidanceSeen, feedback);
        assert.match(instructionsSeen, /Aplica de forma concreta/);
        const strategyRevision = {
          id: owner,
          title: "Estrategia actual",
          action: "Practicar con ejemplos.",
          method: "En sesión.",
        };
        const revised = await request({
          strategyFeedback: feedback,
          strategyRevision,
        });
        assert.equal(revised.status, 200, JSON.stringify(revised.body));
        assert.equal(revised.body.output.strategyRevisionId, owner);
        assert.equal(revised.body.output.strategies.length, 1);
        assert.deepEqual(revisionSeen, {
          title: strategyRevision.title,
          action: strategyRevision.action,
          method: strategyRevision.method,
        });
        assert.equal(guidanceSeen, feedback);
        assert.equal(maxStrategiesSeen, 1);
        assert.match(instructionsSeen, /una alternativa/);
        const malformed = await request({
          strategyRevision: { ...strategyRevision, id: "incorrecto" },
        });
        assert.equal(malformed.status, 400);
        assert.equal(malformed.body.error, "invalid_request");
      },
    );
    await t.step(
      "oversized hydrated documents fail before successful settlement",
      async () => {
        count = 1;
        oversized = true;
        const response = await request();
        assert.equal(response.status, 409, JSON.stringify(response.body));
        assert.equal(response.body.error, "invalid_output");
        assert.equal(settlements.at(-1), "invalid_output");
        assert.equal(response.body.output, undefined);
      },
    );
    await t.step(
      "unsupported operational parameters return empty fields for professional review",
      async () => {
        oversized = false;
        unverifiedParameters = true;
        count = 1;
        const response = await request();
        assert.equal(response.status, 200, JSON.stringify(response.body));
        const doc = response.body.output.strategies[0];
        assert.equal(isStrategyDocument(doc), true);
        assert.equal(doc.strategy.dose, "");
        assert.equal(doc.strategy.frequency, "");
        assert.equal(doc.strategy.agreement, "pending");
        assert.ok(
          doc.strategy.missingContext.some((note: string) =>
            note.startsWith("Definir dosis")
          ),
        );
        assert.ok(!JSON.stringify(doc).includes("999 mg"));
        assert.equal(settlements.at(-1), "succeeded");
      },
    );
    await t.step(
      "a clipped optional field does not reach the editable draft",
      async () => {
        unverifiedParameters = false;
        clippedMonitoring = true;
        const response = await request();
        assert.equal(response.status, 200, JSON.stringify(response.body));
        const { strategy } = response.body.output.strategies[0];
        assert.equal(strategy.action, "Practicar el registro con la persona.");
        assert.equal(strategy.monitoring, "");
        assert.ok(
          strategy.missingContext.some((note: string) =>
            /seguimiento.*incompleto/.test(note)
          ),
        );
      },
    );
  } finally {
    await server?.shutdown();
    globalThis.fetch = nativeFetch;
    Deno.serve = nativeServe;
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
});
