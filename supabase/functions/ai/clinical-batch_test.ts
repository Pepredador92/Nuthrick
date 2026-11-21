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
  const candidates: Partial<
    Record<ClinicalBatchFeature, ClinicalBatchProposal>
  > = {};
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
  let scenario: "complete" | "partial" | "history" | "insufficient" | "empty" =
    "complete";
  let visit: "initial" | "follow_up" = "follow_up";
  function json(value: unknown) {
    return Response.json(value);
  }
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const rpc = url.split("/").at(-1);
    if (url.endsWith("/auth/v1/user")) {
      return json({ id: owner, is_anonymous: false, app_metadata: {} });
    }
    if (url.includes("/rest/v1/consultations?")) {
      const filters = new URL(url).searchParams;
      assert.equal(filters.get("professional_id"), `eq.${owner}`);
      assert.equal(filters.get("patient_id"), `eq.${patient}`);
      assert.equal(filters.get("id"), `eq.${consultation}`);
      return json({ consultation_type: visit });
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
          token_policy: "model_capacity",
        });
      }
      if (body.p_action === "reserve") {
        assert.equal(data.counted_input_tokens, scenario === "empty" ? 1 : 200);
        const previous = generations.get(data.idempotency_key);
        if (previous) return json({ created: false, generation: previous });
        const generation = {
          id: crypto.randomUUID(),
          status: "reserved",
          feature: data.feature,
          config_snapshot: { allocated_output_tokens: 2000 },
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
        assert.equal(data.input_tokens, scenario === "empty" ? 0 : 50);
        assert.equal(data.output_tokens, scenario === "empty" ? 0 : 100);
        if (scenario === "empty") {
          assert.equal(data.provider_response_id, undefined);
        }
        assert.ok(
          [
            drafts[generation.feature]?.generationId,
            candidates[generation.feature]?.generationId,
          ].includes(generation.id),
        );
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
        identifiers: ["Paciente Ejemplo"],
        facts: scenario === "empty" ? [] : scenario === "insufficient"
          ? [{
            source: "Dato de ficha · Edad",
            finding: "Persona adulta.",
          }]
          : [
            {
              source: "Nota previa · 2026-11-01",
              finding: "Refirió dolor de espalda y no podía hacer ejercicio.",
            },
            ...(scenario === "history" ? [] : [{
              source: scenario === "partial"
                ? "Nota de la consulta · 2026-11-21"
                : "Entrevista · physical activity · Ejercicio actual",
              finding: "El dolor de espalda cesó y retomó el ejercicio.",
              consultation_date: "2026-11-21",
            }]),
            ...(scenario === "complete"
              ? [{
                source: "Entrevista · main reason",
                finding: "Refiere omitir comidas durante el trabajo.",
              }]
              : []),
          ],
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
      const target = body.p_result.revises ? candidates : drafts;
      target[generation.feature] = { ...body.p_result, batchId: body.p_batch };
      return json(null);
    }
    if (rpc === "ai_bind_clinical_context" || rpc === "ai_provider_metadata") {
      return json(null);
    }
    const context = JSON.parse(body.input);
    assert.match(body.instructions, /propuesta completa pendiente/);
    if (url === "https://api.openai.com/v1/responses/input_tokens") {
      assert.notEqual(scenario, "empty");
      return json({ input_tokens: 200 });
    }
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(body.max_output_tokens, 2000);
    const { SimulatorExampleProvider } = await import(
      "./simulator-provider.ts"
    );
    const generating = [...generations.values()].find((generation) =>
      generation.status === "running"
    )!;
    const reply = (output: unknown) =>
      json({
        status: "completed",
        id: "resp_batch_test",
        usage: { input_tokens: 50, output_tokens: 100, total_tokens: 150 },
        output: [{
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify(output) }],
        }],
      });
    assert.match(
      body.instructions,
      /antecedente no demuestra mejoría ni empeoramiento/,
    );
    const current = context.facts.find((fact: { finding: string }) =>
      fact.finding.includes("retomó el ejercicio")
    );
    const historical = context.facts.find((fact: { source: string }) =>
      fact.source.startsWith("Nota previa")
    );
    modelCalls++;
    if (scenario === "insufficient") {
      return reply(
        generating.feature === "pes_diagnosis"
          ? {
            problem: "",
            etiology: "",
            signsSymptoms: [],
            evidenceFactIds: [],
            priority: { text: "", evidenceFactIds: [] },
            missingContext: ["¿Qué te gustaría revisar?"],
            uncertainties: [],
          }
          : { items: [] },
      );
    }
    if (scenario === "history") {
      assert.equal(current, undefined);
      assert.equal(historical.timing, "historical");
      return reply(
        generating.feature === "pes_diagnosis"
          ? {
            problem: "",
            etiology: "",
            signsSymptoms: [],
            evidenceFactIds: [],
            priority: { text: "", evidenceFactIds: [] },
            missingContext: [
              "¿Cómo te va con el movimiento desde la última consulta?",
            ],
            uncertainties: [],
          }
          : {
            items: [{
              title: "Conoce qué cambió al moverte",
              action:
                "Cuéntanos cómo te ha ido al moverte desde la consulta anterior.",
              indicator: "Cambios comentados desde la visita anterior.",
              criterion: "Traer un ejemplo de cómo te va al moverte.",
              monitoring: "Comentaremos qué cambió desde la última visita.",
              goalIndex: 0,
              evidenceFactIds: [historical.id],
            }],
          },
      );
    }
    assert.equal(current.timing, "current");
    assert.equal(current.consultation_date, "2026-11-21");
    assert.equal(historical.timing, "historical");
    assert.ok(
      context.facts.indexOf(current) < context.facts.indexOf(historical),
    );
    if (scenario === "partial") {
      assert.match(current.source, /^Nota de la consulta/);
      assert.equal(
        context.facts.some((fact: { source: string }) =>
          fact.source.startsWith("Entrevista")
        ),
        false,
      );
      if (generating.feature === "pes_diagnosis") {
        assert.match(body.instructions, /antecedentes fechados/);
        return reply({
          problem: "Cambios de actividad por valorar",
          etiology: "",
          signsSymptoms: ["actividad retomada referida"],
          evidenceFactIds: [current.id],
          priority: {
            text: "Conviene precisar cómo cambió la actividad.",
            evidenceFactIds: [current.id],
          },
          missingContext: ["¿Qué facilitó retomar el ejercicio?"],
          uncertainties: [],
        });
      }
      assert.equal(context.approvedPes, undefined);
      assert.match(
        body.instructions,
        /Solo se permiten acciones de observación/,
      );
      assert.equal(
        context.priorDrafts.problem,
        "Cambios de actividad por valorar",
      );
      if (generating.feature === "patient_instructions") {
        assert.ok(context.priorDrafts.strategies.length);
      }
      return reply({
        items: [{
          title: "Revisa cómo te fue al volver a moverte",
          action:
            "Anota qué te ayudó a retomar tu actividad y cómo te sentiste.",
          indicator: "Cambios percibidos al retomar la actividad.",
          criterion: "Traer un ejemplo de lo que ayudó a retomar la actividad.",
          monitoring: "Revisaremos juntos tus anotaciones.",
          goalIndex: 0,
          evidenceFactIds: [current.id],
        }],
      });
    }
    if (context.clinicalFeedback) {
      assert.match(context.clinicalFeedback, /Prioriza el ejercicio retomado/);
      assert.doesNotMatch(
        context.clinicalFeedback,
        /Paciente Ejemplo|example\.invalid/,
      );
      assert.equal(
        context.previousDraft.problem,
        drafts.pes_diagnosis?.output.problem,
      );
      assert.match(body.instructions, /jamás como fuente de hechos/);
    }
    if (generating.feature === "patient_instructions") {
      assert.match(
        body.instructions,
        /habla directamente con la persona de tú/,
      );
    }
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
          evidenceFactIds: [
            context.facts.find((fact: { source: string }) =>
              fact.source.startsWith("Estrategia provisional")
            ).id,
          ],
        }],
      }
      : result.output;
    return reply(output);
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
      review?: { clinicalFeedback: string; revisionOf: string },
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
          ...review,
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
    const originalPes = drafts.pes_diagnosis!;
    const review = {
      clinicalFeedback:
        "Prioriza el ejercicio retomado de Paciente Ejemplo, persona@example.invalid.",
      revisionOf: originalPes.generationId,
    };
    assert.equal(
      (await request("pes_diagnosis", crypto.randomUUID(), batch, {
        ...review,
        revisionOf: crypto.randomUUID(),
      })).error,
      "context_changed",
    );
    const revision = await request(
      "pes_diagnosis",
      crypto.randomUUID(),
      batch,
      review,
    );
    assert.equal(revision.status, "succeeded", JSON.stringify(revision));
    assert.equal(drafts.pes_diagnosis!.generationId, originalPes.generationId);
    assert.equal(candidates.pes_diagnosis!.revises, originalPes.generationId);
    assert.equal(settled.size, 5);
    drafts.pes_diagnosis = candidates.pes_diagnosis;
    assert.equal(
      (await request("intervention_strategy")).error,
      "batch_previous_stage_stale",
    );
    assert.equal(modelCalls, 5);

    async function runAll() {
      for (const { feature } of clinicalBatchStages) {
        delete drafts[feature];
        delete candidates[feature];
      }
      for (const { feature } of clinicalBatchStages) {
        const key = crypto.randomUUID();
        const response = await request(feature, key);
        assert.equal(
          response.status,
          "succeeded",
          `${feature}: ${JSON.stringify(response)}`,
        );
        assert.equal((await request(feature, key)).replay, true);
        assert.ok(drafts[feature] && settled.has(drafts[feature].generationId));
      }
    }
    scenario = "partial";
    await runAll();
    assert.equal(drafts.pes_diagnosis?.output.etiology, "");
    for (const { feature } of clinicalBatchStages.slice(1)) {
      assert.equal(drafts[feature]?.output.batchBasis, "assessment");
      assert.match(
        JSON.stringify(drafts[feature]?.output),
        /Nota de la consulta/,
      );
      assert.doesNotMatch(
        JSON.stringify(drafts[feature]?.output),
        /no podía hacer ejercicio/,
      );
    }
    assert.equal(modelCalls, 9);

    scenario = "history";
    await runAll();
    for (const { feature } of clinicalBatchStages.slice(1)) {
      assert.equal(drafts[feature]?.output.batchBasis, "assessment");
      assert.match(JSON.stringify(drafts[feature]?.output), /Nota previa/);
    }
    assert.equal(modelCalls, 13);

    scenario = "insufficient";
    await runAll();
    for (const { feature } of clinicalBatchStages.slice(1)) {
      assert.equal(drafts[feature]?.output.batchBasis, "template");
    }
    assert.equal(modelCalls, 17);

    scenario = "empty";
    for (visit of ["initial", "follow_up"] as const) {
      await runAll();
      for (const { feature } of clinicalBatchStages) {
        assert.equal(drafts[feature]?.output.batchBasis, "template");
      }
      const indication = (drafts.patient_instructions?.output.instructions as {
        text: string;
        evidence: unknown[];
      }[])[0];
      assert.match(
        indication.text,
        visit === "initial" ? /un día habitual/ : /desde la última consulta/,
      );
      assert.deepEqual(indication.evidence, []);
      assert.equal(drafts.pes_diagnosis?.output.etiology, "");
    }
    assert.equal(modelCalls, 17);
  } finally {
    await server?.shutdown();
    globalThis.fetch = originalFetch;
    Deno.serve = originalServe;
    for (const [key, value] of Object.entries(oldEnv)) {
      value === undefined ? Deno.env.delete(key) : Deno.env.set(key, value);
    }
  }
});
