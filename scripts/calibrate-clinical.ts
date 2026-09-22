// Opt-in, ONE synthetic case per invocation. No Supabase or clinical writes.
// deno run --config supabase/functions/ai/deno.json --allow-env=OPENAI_API_KEY
//   --allow-net=api.openai.com scripts/calibrate-clinical.ts A --execute
import { OpenAIResponsesProvider, validOutput, type FeatureConfig } from "../supabase/functions/ai/core.ts";
import { buildPesClinicalContext, clinicalAdapter, clinicalEvidenceValid } from "../supabase/functions/ai/clinical.ts";
import { clinicalCalibrationCases } from "../supabase/functions/ai/clinical_calibration_fixtures.ts";

const selected = clinicalCalibrationCases[Deno.args[0]];
if (!selected) throw new Error("Select synthetic case A, B or C.");
const adapter = clinicalAdapter("pes_diagnosis", "pes_diagnosis@1")!;
const context = buildPesClinicalContext(selected.source);
const config: FeatureConfig = { feature: "pes_diagnosis", enabled: true, provider: "openai", model: "gpt-5.6-terra", prompt_version: "pes_diagnosis@1", max_input_tokens: 8192, max_output_tokens: 1024, timeout_ms: 30000, reasoning_level: "low", temperature: null };
if (!Deno.args.includes("--execute")) {
  console.log(JSON.stringify({ dryRun: true, case: Deno.args[0], purpose: selected.purpose, config, context }));
} else {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("OPENAI_API_KEY is missing locally. No request made.");
  let requests = 0;
  let responseModel: string | null = null;
  const transport: typeof fetch = async (url, init) => {
    if (++requests > 1) throw new Error("Calibration does not retry paid requests.");
    const response = await fetch(url, init);
    if (response.ok) {
      const metadata = await response.clone().json();
      responseModel = typeof metadata.model === "string" ? metadata.model : null;
    }
    return response;
  };
  const start = performance.now();
  const result = await new OpenAIResponsesProvider(key, transport).run({ config, context, schema: adapter.schema, instructions: adapter.instructions, generationId: crypto.randomUUID() });
  const schemaValid = result.status === "completed" && validOutput(adapter.schema, result.output);
  const evidenceValid = schemaValid && clinicalEvidenceValid(config.feature, result.output, context);
  const u = result.usage;
  // Same pricing snapshot as IA-4 pilot; not a provider balance statement.
  const cost = ((u.input_tokens - u.cached_tokens) * 2 + u.cached_tokens * 0.2 + u.output_tokens * 12) / 1e6;
  const report = { case: Deno.args[0], purpose: selected.purpose, feature: config.feature, model: config.model, responseModel, promptVersion: config.prompt_version,
    requests: 1, ...u, total_tokens: u.input_tokens + u.output_tokens, estimated_cost_usd: cost,
    pricing_snapshot: "openai-2026-07-30", latency_ms: Math.round(performance.now() - start), schemaValid, evidenceValid,
    parserValid: result.output !== null, providerStatus: result.status,
    semanticReviewRequired: true, output: result.output };
  const reportPath = Deno.args.find(arg => arg.startsWith("--report="))?.slice(9);
  if (reportPath) await Deno.writeTextFile(reportPath, JSON.stringify({ ...report, exactInput: { config, instructions: adapter.instructions, context, schema: adapter.schema } }, null, 2), { createNew: true });
  console.log(JSON.stringify(report, null, 2));
  if (!evidenceValid) Deno.exit(1);
}
