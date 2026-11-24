import { strict as assert } from "node:assert";
import {
  type ClinicalBatchFeature,
  type ClinicalBatchProposal,
  clinicalBatchStages,
} from "../_shared/clinical-batch.ts";
import { clinicalBatchSource } from "./clinical-batch.ts";
import { emptyObjective } from '../_shared/objectives.ts';

Deno.test("a fresh batch keeps clinical notes and only the approved objective answer", () => {
  const note = {
    source: "Nota de la consulta · 2026-11-21",
    finding: "La persona propone ajustar sus horarios.",
  };
  const draft = {
    source: "Entrevista · next objectives · Próximos objetivos",
    finding: "Meta previa sin aprobar.",
  };
  const approved = {
    source: "Entrevista · treatment objective",
    finding: "Meta revisada y aprobada.",
  };
  const source = {
    stamp: "synthetic",
    facts: [draft, approved, note],
    approvedObjective: {
      approved_at: "2026-11-21",
      pes_approved_at: "2026-11-21",
      question_key: "treatment_objective",
    },
  };
  assert.deepEqual(clinicalBatchSource(source).facts, [approved, note]);
  assert.deepEqual(
    clinicalBatchSource({ ...source, approvedObjective: null }).facts,
    [note],
  );
  assert.deepEqual(source.facts, [draft, approved, note]);
});

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
  let standalone = false;
  let standaloneProposal: { objectives: { goal: Record<string, string> }[] } | undefined;
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
        if (!standalone) assert.ok(
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
              finding: scenario === "partial"
                ? "La molestia ya cedió y retomó el ejercicio. Quiere dejar lista una comida para llevar los días de turno largo."
                : "El dolor de espalda cesó y retomó el ejercicio.",
              consultation_date: "2026-11-21",
            }]),
            ...(scenario === "complete"
              ? [{
                source: "Entrevista · main reason",
                finding: "Refiere omitir comidas durante el trabajo.",
              }]
              : []),
            ...(scenario === "partial"
              ? [
                {
                  source:
                    "Entrevista · next objectives · Objetivos del siguiente periodo",
                  finding:
                    "Borrador anterior sobre comprobar cómo se hicieron las mediciones.",
                },
                ...Array.from({ length: 100 }, (_, index) => ({
                  source: `Antropometría · Medición sintética ${index}`,
                  finding: `${index} cm`,
                  consultation_date: "2026-11-21",
                })),
              ]
              : []),
          ],
        strategyRequired: true,
        approvedPes: standalone && scenario === 'complete' ? {
          approved_at: 'pes-current', problem: 'Patrón de comidas irregular', etiology: 'Horarios variables',
          signsSymptoms: 'Omisión de comidas referida', pesStatement: 'Patrón de comidas irregular.',
        } : null,
        approvedObjective: standalone && scenario === 'complete' ? {
          smart_plan: { version: 1, pesApprovedAt: 'pes-current', goals: [{ ...emptyObjective(), outcome: 'Registrar cuándo haces tus comidas.' }] },
        } : null,
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
    if (rpc === 'ai_store_consultation_proposal' && standalone) {
      assert.equal(body.p_owner, owner);
      assert.ok(settled.has(body.p_generation));
      standaloneProposal = body.p_result.output;
      return json(null);
    }
    const context = JSON.parse(body.input);
    if (!standalone) assert.match(body.instructions, /propuesta completa pendiente/);
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
    const strategyAssessment = (factId: string, monitoring: string) => ({
      title: "Preparación de una comida para el trabajo",
      action: "Acordar con la persona una comida que pueda preparar y llevar en un turno largo.",
      method: "Practicar cómo dejar lista una opción en la consulta.",
      adaptations: "Acordar cuándo podría prepararla según su horario.",
      educationTopic: "Preparación de una comida para llevar",
      materials: "Un ejemplo de comida de la consulta.",
      comprehensionCheck: "Pedir que explique cómo dejaría lista la opción.",
      coordinationWith: "", coordinationReason: "",
      monitoring, reviewAt: "",
      adjustmentCriteria: "Si prepararla resulta difícil, revisar el paso que puede simplificarse.",
      referenceNotes: "La práctica permite explorar una opción para la jornada.",
      goalIndexes: [0],
      evidenceFactIds: [factId],
      category: "counseling",
      missingContext: [],
    });
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
      if (generating.feature === "intervention_strategy") {
        return reply({ items: [strategyAssessment(historical.id, "Comentar el resultado en la consulta.")] });
      }
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
              ...(generating.feature === 'consultation_support' ? {
                baselineFactId: historical.id,
                feasibility: 'Conversen sobre qué forma de registro encaja en la rutina.',
              } : {}),
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
      assert.equal(context.facts[0].id, current.id);
      assert.match(current.finding, /comida para llevar/);
      assert.match(
        body.instructions,
        /La cantidad de mediciones no determina la prioridad/,
      );
      assert.equal(
        context.facts.some((fact: { source: string }) =>
          fact.source.startsWith("Entrevista")
        ),
        false,
      );
      if (generating.feature === "pes_diagnosis") {
        assert.match(body.instructions, /antecedentes específicos/);
        return reply({
          problem: "Dificultad para preparar comidas para el trabajo",
          etiology: "",
          signsSymptoms: [
            "necesidad referida de preparar comida para los turnos largos",
          ],
          evidenceFactIds: [current.id],
          priority: {
            text: "La persona quiere una opción que pueda llevar al trabajo.",
            evidenceFactIds: [current.id],
          },
          missingContext: [
            "¿En qué parte de la preparación suele encontrar dificultades?",
          ],
          uncertainties: [],
        });
      }
      assert.equal(context.approvedPes, undefined);
      assert.match(
        body.instructions,
        /práctica de pasos sencillos/,
      );
      if (!standalone) assert.equal(
        context.priorDrafts.problem,
        "Dificultad para preparar comidas para el trabajo",
      );
      if (generating.feature === "patient_instructions") {
        assert.ok(context.priorDrafts.strategies.length);
        assert.match(body.instructions, /Háblale de tú/);
      }
      const professional = generating.feature === "intervention_strategy";
      if (professional) {
        assert.match(body.instructions, /qué hará el nutriólogo/);
        assert.equal(
          body.text.format.schema.properties.items.items.properties.monitoring
            .maxLength,
          1500,
        );
        return reply({ items: [strategyAssessment(current.id, "Revisar qué le facilitó preparar la comida y qué quedó pendiente de ver<<")] });
      }
      return reply({
        items: [{
          title: "Preparación de una comida para el trabajo",
          action: "Elige una comida que puedas dejar lista antes de tu próximo turno largo.",
          indicator: "Preparación de una opción para el trabajo.",
          criterion: "Probar la opción acordada en un día con turno largo.",
          monitoring: "En la próxima consulta, platica cómo te funcionó.",
          goalIndex: 0,
          evidenceFactIds: [current.id],
          ...(generating.feature === 'consultation_support' ? {
            baselineFactId: current.id,
            feasibility: 'Elige algo que puedas preparar antes de un turno largo.',
          } : {}),
        }],
      });
    }
    if (standalone) {
      assert.equal(context.clinicalFeedback, 'Completa la viabilidad con una acción observable.');
      assert.equal(context.previousDraft.objectives[0].outcome, 'Registrar cuándo haces tus comidas.');
    } else if (context.clinicalFeedback) {
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
      batchId: string | null = batch,
      review?: { clinicalFeedback: string; revisionOf?: string },
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
          ...(batchId ? { batchId } : {}),
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
    const objective = (drafts.consultation_support?.output.objectives as { goal: Record<string, string> }[])[0].goal;
    for (const field of ['outcome', 'etiology', 'target', 'indicator', 'baseline', 'monitoring', 'feasibility']) {
      assert.ok(objective[field], field);
    }
    assert.equal(objective.timeframe, '');
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
    const assessmentStrategies = drafts.intervention_strategy?.output
      .strategies as {
        strategy: {
          action: string;
          method: string;
          educationTopic: string;
          adaptations: string;
          comprehensionCheck: string;
          etiologyLink: string;
          monitoring: string;
          missingContext: string[];
        };
      }[];
    assert.match(
      assessmentStrategies[0].strategy.action,
      /^Acordar con la persona/,
    );
    assert.equal(assessmentStrategies[0].strategy.monitoring, "");
    assert.match(assessmentStrategies[0].strategy.method, /Practicar cómo/);
    assert.ok(assessmentStrategies[0].strategy.educationTopic);
    assert.ok(assessmentStrategies[0].strategy.adaptations);
    assert.ok(assessmentStrategies[0].strategy.comprehensionCheck);
    assert.equal(assessmentStrategies[0].strategy.etiologyLink, "");
    assert.match(
      assessmentStrategies[0].strategy.missingContext[0],
      /seguimiento.*incompleto/,
    );
    const assessmentInstructions = drafts.patient_instructions?.output
      .instructions as { text: string }[];
    assert.match(assessmentInstructions[0].text, /^Elige una comida/);
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

    standalone = true;
    scenario = 'complete';
    const regenerated = await request('consultation_support', crypto.randomUUID(), null, {
      clinicalFeedback: 'Completa la viabilidad con una acción observable.',
    });
    assert.equal(regenerated.status, 'succeeded', JSON.stringify(regenerated));
    assert.deepEqual(standaloneProposal, regenerated.output);
    assert.equal(standaloneProposal?.objectives[0].goal.timeframe, '');
    assert.ok(standaloneProposal?.objectives[0].goal.feasibility);

    scenario = 'partial';
    const assessment = await request('consultation_support', crypto.randomUUID(), null);
    assert.equal(assessment.status, 'succeeded', JSON.stringify(assessment));
    assert.equal(assessment.output.batchBasis, 'assessment');
    assert.equal(assessment.output.objectives[0].goal.timeframe, '');
    assert.match(assessment.output.objectives[0].goal.baseline, /turno largo/);
    assert.equal(modelCalls, 19);
  } finally {
    await server?.shutdown();
    globalThis.fetch = originalFetch;
    Deno.serve = originalServe;
    for (const [key, value] of Object.entries(oldEnv)) {
      value === undefined ? Deno.env.delete(key) : Deno.env.set(key, value);
    }
  }
});
