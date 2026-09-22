import { Ajv } from 'ajv';
import { clinicalAdapter, clinicalEvidenceValid, conservativeRecallQuantities } from './clinical.ts';
import { workshopAdapter } from './workshop.ts';

export type FeatureConfig = {
  feature: string; enabled: boolean; provider: string; model: string; prompt_version: string;
  max_input_tokens: number; max_output_tokens: number; timeout_ms: number;
  reasoning_level: string | null; temperature: number | null;
};
export type Usage = { input_tokens: number; output_tokens: number; cached_tokens: number };
export type ProviderResult = { status: string; output: unknown; usage: Usage; responseId: string };
export type ProviderInput = { config: FeatureConfig; instructions: string; context: unknown; schema: Record<string, unknown>; generationId: string };
export interface AIProvider { run(input: ProviderInput): Promise<ProviderResult> }
export class AIError extends Error {
  constructor(public code: string, public uncertain = false) { super(code); }
}

// Feature adapters are server-authored allowlists, not a generic prompt proxy.
// Each clinical adapter also requires an owned, server-hydrated context.
const checkSchema = {
  type: 'object', properties: { ok: { type: 'boolean', enum: [true] } }, required: ['ok'], additionalProperties: false,
};
export function featureAdapter(feature: string, promptVersion: string) {
  if (feature === 'diet_workshop' && promptVersion === 'diet_workshop@1') return { ...workshopAdapter };
  const clinical = clinicalAdapter(feature,promptVersion);
  if (clinical) return { ...clinical, context: {} as unknown };
  if (feature !== 'core_check' || promptVersion !== 'core_check@1') throw new AIError('feature_not_implemented');
  return {
    instructions: 'Nuthrick infrastructure connectivity check. Return only the required JSON object with ok set to true. No clinical task.',
    schema: checkSchema,
    // No free text, patient identifiers or demographics accepted by this probe.
    context: { check: 'infrastructure' },
  };
}
const ajv = new Ajv({ strict: true, allErrors: false });
export function validOutput(schema: Record<string, unknown>, value: unknown): boolean {
  return ajv.compile(schema)(value) === true;
}
export function readUsage(value: unknown): Usage {
  if (!value || typeof value !== 'object') throw new AIError('usage_unknown', true);
  const u = value as Record<string, unknown>;
  const details = u.input_tokens_details as Record<string, unknown> | undefined;
  const input = u.input_tokens, output = u.output_tokens, cached = details?.cached_tokens ?? 0;
  if (![input, output, cached, u.total_tokens].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0)
    || Number(cached) > Number(input) || u.total_tokens !== Number(input) + Number(output)) throw new AIError('usage_unknown', true);
  return { input_tokens: Number(input), output_tokens: Number(output), cached_tokens: Number(cached) };
}

export class OpenAIResponsesProvider implements AIProvider {
  constructor(private key: string, private transport: typeof fetch = fetch, private pause = (ms: number) => new Promise(r => setTimeout(r, ms))) {}
  async run({ config, instructions, context, schema, generationId }: ProviderInput): Promise<ProviderResult> {
    if (!this.key) throw new AIError('configuration_required');
    const input = JSON.stringify(context);
    // Byte upper bound for text tokens + framing reserve. No images/tools or hidden history.
    const bytes = new TextEncoder().encode(instructions + input + JSON.stringify(schema)).length;
    if (bytes + 2048 > config.max_input_tokens) throw new AIError('input_too_large');
    const body = {
      model: config.model, instructions, input, store: false, background: false,
      max_output_tokens: config.max_output_tokens, truncation: 'disabled',
      text: { format: { type: 'json_schema', name: 'nuthrick_result', strict: true, schema } },
      ...(config.reasoning_level ? { reasoning: { effort: config.reasoning_level } } : {}),
      ...(config.temperature !== null ? { temperature: config.temperature } : {}),
    };
    const signal = AbortSignal.timeout(config.timeout_ms);
    // Only an explicit rate-limit rejection is retried once. Never replay timeout/5xx/network uncertainty.
    for (let attempt = 0; attempt < 2; attempt++) {
      let response: Response;
      try {
        response = await this.transport('https://api.openai.com/v1/responses', {
          method: 'POST', signal,
          headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json', 'X-Client-Request-Id': generationId },
          body: JSON.stringify(body),
        });
      } catch { throw new AIError('provider_outcome_unknown', true); }
      if (!response.ok) {
        // Keep provider diagnostics safe: never log the response body, prompt, or
        // credentials. The code/type fields are stable technical identifiers.
        let providerCode = '';
        try {
          const raw = await response.text();
          const parsed = JSON.parse(raw) as { error?: { code?: unknown; type?: unknown } };
          const candidate = parsed.error?.code ?? parsed.error?.type;
          if (typeof candidate === 'string') providerCode = candidate.slice(0, 80);
        } catch { /* A non-JSON body is intentionally ignored. */ }
        console.warn(JSON.stringify({ event: 'provider_rejected', status: response.status, model: config.model, code: providerCode }));
        if (providerCode === 'credit_balance_exhausted') throw new AIError('provider_credit_exhausted');
        if (response.status === 429 && attempt === 0) { await this.pause(250); continue; }
        if ([400,401,403,404,422,429].includes(response.status)) throw new AIError('provider_rejected');
        throw new AIError('provider_outcome_unknown', true);
      }
      let data: Record<string, unknown>;
      try { data = await response.json(); } catch { throw new AIError('provider_outcome_unknown', true); }
      const usage = readUsage(data.usage);
      let output: unknown = null;
      try {
        const items = data.output as { type: string; content?: { type: string; text?: string }[] }[];
        const texts = items.filter(item => item.type === 'message').flatMap(item => item.content ?? []).filter(c => c.type === 'output_text');
        if (texts.length === 1) output = JSON.parse(texts[0].text!);
      } catch { /* Invalid/refused/incomplete output still has real billable usage. */ }
      return { usage, output, status: String(data.status), responseId: typeof data.id === 'string' ? data.id : '' };
    }
    throw new AIError('provider_rejected');
  }
}

export type Generation = { id: string; status: string; charged_credits: number };
export interface AIStore {
  config(feature: string): Promise<FeatureConfig>;
  reserve(config: FeatureConfig, request: AIRequest, fingerprint: string): Promise<{ generation: Generation; created: boolean }>;
  claim(id: string): Promise<boolean>;
  settle(id: string, status: string, usage: Usage, responseId?: string): Promise<Generation>;
  uncertain(id: string): Promise<void>;
  context?(request: AIRequest): Promise<{ context: unknown; stamp: string }>;
  bindContext?(id: string, request: AIRequest, stamp: string): Promise<void>;
  validateOutput?(output: unknown): boolean;
}
export type AIRequest = { feature: string; idempotencyKey: string; patientId?: string; consultationId?: string; revision?: number; narrative?: string; planId?: string; rejectedFoodIds?: string[]; rejectedSignatures?: string[] };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseRequest(value: unknown): AIRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AIError('invalid_request');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k => !['feature','idempotencyKey','patientId','consultationId','revision','narrative','planId','rejectedFoodIds','rejectedSignatures'].includes(k))
    || typeof v.feature !== 'string' || !/^[a-z][a-z0-9_]{1,63}$/.test(v.feature)
    || typeof v.idempotencyKey !== 'string' || !uuid.test(v.idempotencyKey)
    || [v.patientId,v.consultationId].some(id => id !== undefined && (typeof id !== 'string' || !uuid.test(id)))
    || (v.consultationId && !v.patientId)) throw new AIError('invalid_request');
  const workshop = v.feature === 'diet_workshop';
  if (workshop && (typeof v.planId !== 'string' || !uuid.test(v.planId) || !Number.isSafeInteger(v.revision) || Number(v.revision)<1)) throw new AIError('invalid_request');
  if (!workshop && ['planId','rejectedFoodIds','rejectedSignatures'].some(k => v[k] !== undefined)) throw new AIError('invalid_request');
  if (v.rejectedFoodIds !== undefined && (!Array.isArray(v.rejectedFoodIds) || v.rejectedFoodIds.length>30 || v.rejectedFoodIds.some(id => typeof id!=='string'||!uuid.test(id)))) throw new AIError('invalid_request');
  if (v.rejectedSignatures !== undefined && (!Array.isArray(v.rejectedSignatures) || v.rejectedSignatures.length>3 || v.rejectedSignatures.some(s => typeof s!=='string'||s.length>16000))) throw new AIError('invalid_request');
  const clinical = ['pes_diagnosis','recall_24h'].includes(v.feature as string);
  if (clinical && (!v.consultationId || !Number.isSafeInteger(v.revision) || Number(v.revision) < 1)) throw new AIError('invalid_request');
  if (!clinical && !workshop && (v.revision !== undefined || v.narrative !== undefined)) throw new AIError('invalid_request');
  if (v.feature === 'recall_24h' ? typeof v.narrative !== 'string' || !v.narrative.trim() || v.narrative.length > 8000 : v.narrative !== undefined) throw new AIError('invalid_request');
  return v as AIRequest;
}
export async function runAIRequest(request: AIRequest, store: AIStore, provider: AIProvider) {
  const config = await store.config(request.feature);
  if (!config.enabled || config.provider !== 'openai') throw new AIError('feature_disabled');
  const adapter = featureAdapter(request.feature, config.prompt_version);
  const clinical = ['pes_diagnosis','recall_24h','diet_workshop'].includes(request.feature);
  if (clinical && (!store.context || !store.bindContext)) throw new AIError('context_unavailable');
  const hydrated = clinical ? await store.context!(request) : null;
  if (hydrated) adapter.context = hydrated.context;
  const canonical = JSON.stringify([request.feature,request.patientId ?? null,request.consultationId ?? null, ...(hydrated ? [request.revision, hydrated.stamp, request.narrative,request.planId,request.rejectedFoodIds,request.rejectedSignatures] : [])]);
  const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical))), b => b.toString(16).padStart(2,'0')).join('');
  const { generation, created } = await store.reserve(config,request,fingerprint);
  if (!created) return { generationId: generation.id, status: generation.status, replay: true };
  try { if (hydrated) await store.bindContext!(generation.id,request,hydrated.stamp); }
  catch { await store.settle(generation.id,'failed',{input_tokens:0,output_tokens:0,cached_tokens:0}); throw new AIError('context_unavailable'); }
  if (!await store.claim(generation.id)) return { generationId: generation.id, status: generation.status, replay: true };
  let result: ProviderResult;
  try { result = await provider.run({ config, ...adapter, generationId: generation.id }); }
  catch (error) {
    if (!(error instanceof AIError) || error.uncertain) {
      await store.uncertain(generation.id);
      throw new AIError('provider_outcome_unknown',true);
    }
    await store.settle(generation.id,'failed',{ input_tokens: 0, output_tokens: 0, cached_tokens: 0 });
    throw error;
  }
  const valid = result.status === 'completed' && validOutput(adapter.schema,result.output) && clinicalEvidenceValid(request.feature,result.output,adapter.context) && (!store.validateOutput || store.validateOutput(result.output));
  await store.settle(generation.id, valid ? 'succeeded' : 'invalid_output',result.usage,result.responseId);
  if (!valid) throw new AIError('invalid_output');
  return { generationId: generation.id, status: 'succeeded', output: request.feature==='recall_24h'?conservativeRecallQuantities(result.output):result.output, replay: false };
}
