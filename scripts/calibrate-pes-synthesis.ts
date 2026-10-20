// Synthetic, opt-in provider calibration. No Supabase writes or professional credits.
// Dry-run: deno run --config supabase/functions/ai/deno.json scripts/calibrate-pes-synthesis.ts behavioral
// Live: add --execute --version=7 plus --allow-env=OPENAI_API_KEY --allow-net=api.openai.com --env-file=supabase/functions/.env
import { OpenAIResponsesProvider, validOutput, type FeatureConfig } from '../supabase/functions/ai/core.ts';
import { buildPesClinicalContext, clinicalAdapter, clinicalEvidenceValid, normalizePesOutput, pesClinicalStructureValid } from '../supabase/functions/ai/clinical.ts';
import { pesSynthesisCases } from '../supabase/functions/ai/pes-synthesis-fixtures.ts';
import { pesSynthesisEvidenceValid } from '../supabase/functions/ai/pes-synthesis.ts';

const scenario = pesSynthesisCases[Deno.args[0]];
if (!scenario) throw new Error('Choose behavioral, anthropometry_only or intake.');
const version = Deno.args.find(arg => arg.startsWith('--version='))?.slice(10) ?? '7';
if (!['6','7'].includes(version)) throw new Error('Only PES versions 6 and 7 are supported.');
const prompt_version = `pes_diagnosis@${version}`;
const config: FeatureConfig = { feature:'pes_diagnosis', enabled:true, provider:'openai', model:'gpt-5.6-luna', prompt_version,
  max_input_tokens:8192, max_output_tokens:4096, reasoning_level:'low', timeout_ms:60000, temperature:null };
const adapter = clinicalAdapter(config.feature, prompt_version)!;
const context = buildPesClinicalContext(scenario.source);
if (!Deno.args.includes('--execute')) {
  console.log(JSON.stringify({dryRun:true,case:Deno.args[0],purpose:scenario.purpose,config,context}));
} else {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) throw new Error('OPENAI_API_KEY missing; no request sent.');
  let generations = 0;
  const transport: typeof fetch = (url, init) => {
    if (String(url) === 'https://api.openai.com/v1/responses' && ++generations > 1) throw new Error('Calibration never repeats a paid generation.');
    return fetch(url, init);
  };
  const started = performance.now();
  const response = await new OpenAIResponsesProvider(key,transport).run({config,instructions:adapter.instructions,context,schema:adapter.schema,generationId:crypto.randomUUID()});
  const schemaValid = response.status === 'completed' && validOutput(adapter.schema,response.output);
  const output = schemaValid ? normalizePesOutput(response.output) : response.output;
  const evidenceValid = schemaValid && clinicalEvidenceValid(config.feature,output,context);
  const structureValid = schemaValid && pesClinicalStructureValid(output) && (version !== '7' || pesSynthesisEvidenceValid(output));
  const report = {case:Deno.args[0],promptVersion:prompt_version,model:config.model,purpose:scenario.purpose,generations,
    providerStatus:response.status,schemaValid,evidenceValid,structureValid,usage:response.usage,
    latency_ms:Math.round(performance.now()-started),semanticReviewRequired:true,output};
  const file = Deno.args.find(arg => arg.startsWith('--report='))?.slice(9);
  if (file) await Deno.writeTextFile(file,JSON.stringify(report,null,2),{createNew:true});
  console.log(JSON.stringify(report,null,2));
  if (!schemaValid || !evidenceValid || !structureValid) Deno.exit(1);
}
