import { strict as assert } from "node:assert";
import {
  type ClinicalBatchFeature,
  type ClinicalBatchProposal,
  clinicalBatchStages,
} from "../_shared/clinical-batch.ts";

Deno.test("complete clinical draft HTTP flow uses its own saved results and accounts for each generation", async () => {
  const originalFetch = globalThis.fetch;
  const originalServe = Deno.serve;
  const env = {
    SUPABASE_URL: "http://batch.test.invalid",
    SUPABASE_SERVICE_ROLE_KEY: "test-service",
    OPENAI_API_KEY: "test-provider",
    NUTHRICK_AI_ENABLED: "true",
  };
  const oldEnv = Object.fromEntries(
    Object.keys(env).map((key) => [key, Deno.env.get(key)]),
  );
  for (const [key, value] of Object.entries(env)) Deno.env.set(key, value);
  const owner = crypto.randomUUID(),
    patient = crypto.randomUUID(),
    consultation = crypto.randomUUID(),
    batch = crypto.randomUUID();
  const drafts: Partial<Record<ClinicalBatchFeature, ClinicalBatchProposal>> =
    {};
  const settled = new Set<string>();
  const generations = new Map<
    string,
    { id: string; status: string; feature: ClinicalBatchFeature }
  >();
  const versions = {
    pes_diagnosis: 10,
    consultation_support: 6,
    intervention_strategy: 3,
    patient_instructions: 3,
  };
  const instructions =
    ("Anota a qué hora comes y cómo te sentiste después de comer. ").repeat(18)
      .trim() +
    " Lleva tus anotaciones a la revisión.";
  let server: Deno.HttpServer | undefined, port = 0, modelCalls = 0;
  function json(value: unknown) {
    return Response.json(value);
  }
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const rpc = url.split("/").at(-1);
    if (url.endsWith("/auth/v1/user")) {
      return json({ id: owner, is_anonymous: false, app_metadata: {} });
    }
    const body = JSON.parse(String(init?.body));
    const data = body.p_data;
    if (rpc === "ai_server") {
      if (body.p_action === "config") {
        const feature = data.feature as ClinicalBatchFeature;
        return json({
          feature,
          enabled: true,
          provider: "openai",
          model: "test",
          prompt_version: `${feature}@${versions[feature]}`,
          max_input_tokens: 20000,
          max_output_tokens: 6000,
          timeout_ms: 3000,
          reasoning_level: "low",
          temperature: null,
        });
      }
      if (body.p_action === "reserve") {
        const previous = generations.get(data.idempotency_key);
        if (previous) return json({ created: false, generation: previous });
        const generation = {
          id: crypto.randomUUID(),
          status: "reserved",
          feature: data.feature,
        };
        generations.set(data.idempotency_key, generation);
        return json({ created: true, generation });
      }
      const generation = [...generations.values()].find((item) =>
        item.id === data.generation_id
      )!;
      if (body.p_action === "claim") {
        generation.status = "running";
        return json({ claimed: true });
      }
      if (body.p_action === "settle") {
        assert.equal(data.status, "succeeded");
        assert.equal(data.input_tokens, 50);
        assert.equal(data.output_tokens, 100);
        assert.equal(drafts[generation.feature]?.generationId, generation.id);
        generation.status = data.status;
        settled.add(generation.id);
        return json(generation);
      }
    }
    if (
      rpc === "ai_clinical_source" || rpc === "ai_patient_instructions_source"
    ) {
      assert.equal(body.p_owner, owner);
      assert.equal(body.p_consultation, consultation);
      assert.equal(body.p_patient, patient);
      return json({
        stamp: "current",
        facts: [{
          source: "Entrevista · main reason",
          finding: "Refiere omitir comidas durante el trabajo.",
        }],
        strategyRequired: true,
        approvedPes: null,
        approvedObjective: null,
        approvedStrategies: [],
      });
    }
    if (rpc === "ai_clinical_batch_stages") {
      return json(
        body.p_batch === batch
          ? Object.fromEntries(
            Object.entries(drafts).filter(([, draft]) =>
              settled.has(draft.generationId)
            ),
          )
          : {},
      );
    }
    if (rpc === "ai_store_clinical_batch_stage") {
      assert.equal(body.p_batch, batch);
      const generation = [...generations.values()].find((item) =>
        item.id === body.p_generation
      )!;
      assert.equal(generation.status, "running");
      drafts[generation.feature] = { ...body.p_result, batchId: body.p_batch };
      return json(null);
    }
    if (rpc === "ai_bind_clinical_context" || rpc === "ai_provider_metadata") {
      return json(null);
    }
    assert.equal(url, "https://api.openai.com/v1/responses");
    const context = JSON.parse(body.input);
    assert.match(body.instructions, /propuesta completa pendiente/);
    const { SimulatorExampleProvider } = await import(
      "./simulator-provider.ts"
    );
    const generating = [...generations.values()].find((generation) =>
      generation.status === "running"
    )!;
    modelCalls++;
    const result = await new SimulatorExampleProvider().run({
      config: { feature: generating.feature } as never,
      generationId: generating.id,
      schema: body.text.format.schema,
      context,
      instructions: body.instructions,
    });
    const output = generating.feature === "patient_instructions"
      ? {
        instructions: [{
          text: instructions,
          evidenceFactIds: [context.facts[0].id],
        }],
      }
      : result.output;
    return json({
      status: "completed",
      id: "resp_batch_test",
      usage: { input_tokens: 50, output_tokens: 100, total_tokens: 150 },
      output: [{
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(output) }],
      }],
    });
  };
  Deno.serve = ((handler: Deno.ServeHandler) => {
    server = originalServe({
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
    const request = async (
      feature: ClinicalBatchFeature,
      idempotencyKey = crypto.randomUUID(),
      batchId = batch,
    ) => {
      const response = await originalFetch(`http://127.0.0.1:${port}`, {
        method: "POST",
        headers: {
          authorization: "Bearer test",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          feature,
          idempotencyKey,
          batchId,
          patientId: patient,
          consultationId: consultation,
          revision: 1,
          ...(feature === "consultation_support"
            ? { objectiveTextStyle: "patient_v1" }
            : {}),
        }),
      });
      return await response.json();
    };
    assert.equal(
      (await request("consultation_support")).error,
      "batch_previous_stage_required",
    );
    assert.equal(generations.size, 0);
    for (const [index, { feature }] of clinicalBatchStages.entries()) {
      const key = crypto.randomUUID();
      const response = await request(feature, key);
      assert.equal(response.status, "succeeded", JSON.stringify(response));
      assert.equal(drafts[feature]?.inputGenerations?.length, index);
      assert.equal((await request(feature, key)).replay, true);
    }
    assert.equal(
      (await request(
        "patient_instructions",
        crypto.randomUUID(),
        crypto.randomUUID(),
      )).error,
      "batch_previous_stage_required",
    );
    const recommendations = drafts.patient_instructions?.output
      .instructions as { text: string; evidence: { source: string }[] }[];
    assert.equal(recommendations[0].text, instructions);
    assert.match(
      recommendations[0].evidence[0].source,
      /^Estrategia provisional · /,
    );
    assert.equal(modelCalls, 4);
    assert.equal(settled.size, 4);
  } finally {
    await server?.shutdown();
    globalThis.fetch = originalFetch;
    Deno.serve = originalServe;
    for (const [key, value] of Object.entries(oldEnv)) {
      value === undefined ? Deno.env.delete(key) : Deno.env.set(key, value);
    }
  }
});
