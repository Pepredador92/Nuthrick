import { interventionAdapter, interventionEvidenceValid, interventionValidationIssues, normalizeInterventionOutput, type InterventionContext } from './intervention.ts';
import { isDietGuidance, type DietGuidance } from '../_shared/diet-guidance.ts';
import {isTextDietGuidance,type TextDietGuidance} from '../_shared/text-diet.ts';
import {textDietAdapter} from './text-diet-contract.ts';
import { Ajv } from 'ajv';
import { pesSynthesisEvidenceValid } from './pes-synthesis.ts';
import { normalizeReferencedPes, referencedPesContext } from './pes-references.ts';
import { normalizeConcisePes } from './pes-concise.ts';
import { normalizeObjectiveProposals, normalizedObjectiveProposalsSchema } from './objective-proposals.ts';
import { clinicalAdapter, clinicalEvidenceValid, conservativeRecallQuantities, normalizePesOutput, normalizeSmartObjectivesOutput, pesClinicalStructureValid, pesSchema, smartObjectiveValidationIssues } from './clinical.ts';
import { dietDraftAdapter, dietDraftAdapterV1, dietDraftAdapterV3 } from './diet-contract.ts';

export type FeatureConfig = {
  feature: string; enabled: boolean; provider: string; model: string; prompt_version: string;
  max_input_tokens: number; max_output_tokens: number; timeout_ms: number;
  reasoning_level: string | null; temperature: number | null;
  execution_mode?: 'real' | 'simulated';
  max_provider_attempts?: number;
  token_policy?: 'fixed' | 'model_capacity';
};
export type Usage = { input_tokens: number; output_tokens: number; cached_tokens: number; cache_write_tokens?: number; cache_write_12h_tokens?: number };
export type ProviderResult = { status: string; output: unknown; usage: Usage; responseId: string; model?: string; latencyMs?: number; requestId?: string };
export type ProviderInput = { config: FeatureConfig; instructions: string; context: unknown; schema: Record<string, unknown>; generationId: string; countedInputTokens?: number };
export interface AIProvider {
  countInput?(input: Omit<ProviderInput, 'generationId'>): Promise<number>;
  run(input: ProviderInput): Promise<ProviderResult>;
}
export class AIError extends Error {
  constructor(public code: string, public uncertain = false) { super(code); }
}

// Feature adapters are server-authored allowlists, not a generic prompt proxy.
// Each clinical adapter also requires an owned, server-hydrated context.
const checkSchema = {
  type: 'object', properties: { ok: { type: 'boolean', enum: [true] } }, required: ['ok'], additionalProperties: false,
};
export function featureAdapter(feature: string, promptVersion: string, textMode=false) {
  if(feature==='diet_draft'&&promptVersion==='diet_draft@4')return {...(textMode?textDietAdapter:dietDraftAdapterV3)};
  if(textMode)throw new AIError('feature_not_implemented');
  if (feature === 'diet_draft' && promptVersion === 'diet_draft@1') return { ...dietDraftAdapterV1 };
  if (feature === 'diet_draft' && promptVersion === 'diet_draft@2') return { ...dietDraftAdapter };
  if (feature === 'diet_draft' && promptVersion === 'diet_draft@3') return { ...dietDraftAdapterV3 };
  if (feature === 'intervention_strategy' && ['intervention_strategy@1','intervention_strategy@2','intervention_strategy@3'].includes(promptVersion)) return { ...interventionAdapter, context: {} as unknown };
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
  const writes = details?.cache_write_tokens ?? 0;
  const lifetimes = details?.cache_write_tokens_details as Record<string, unknown> | undefined;
  const longWrites = lifetimes?.ttl_12h_tokens ?? 0;
  if (![input, output, cached, u.total_tokens].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0)
    || Number(cached) > Number(input) || u.total_tokens !== Number(input) + Number(output)) throw new AIError('usage_unknown', true);
  if (![writes,longWrites].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0)
    || Number(cached) + Number(writes) > Number(input) || Number(longWrites) > Number(writes)
    || (lifetimes && Number(lifetimes.ttl_30m_tokens) + Number(longWrites) !== Number(writes))) throw new AIError('usage_unknown', true);
  return { input_tokens: Number(input), output_tokens: Number(output), cached_tokens: Number(cached),
    ...(details?.cache_write_tokens !== undefined ? {cache_write_tokens:Number(writes),cache_write_12h_tokens:Number(longWrites)} : {}) };
}

export class OpenAIResponsesProvider implements AIProvider {
  constructor(private key: string, private transport: typeof fetch = fetch, private pause = (ms: number) => new Promise(r => setTimeout(r, ms))) {}
  async countInput({config,instructions,context,schema}: Omit<ProviderInput,'generationId'>): Promise<number> {
    if (!this.key) throw new AIError('configuration_required');
    try {
      // Count the exact server-owned prompt and schema before reserving credits.
      // This endpoint does not generate a response or consume generation credits.
      const response = await this.transport('https://api.openai.com/v1/responses/input_tokens', {
        method:'POST',signal:AbortSignal.timeout(15000),
        headers:{Authorization:`Bearer ${this.key}`,'Content-Type':'application/json'},
        body:JSON.stringify({model:config.model,instructions,input:JSON.stringify(context),truncation:'disabled',
          text:{format:{type:'json_schema',name:'nuthrick_result',strict:true,schema}}}),
      });
      if (!response.ok) throw new Error('count_unavailable');
      const tokens = (await response.json()).input_tokens;
      if (!Number.isSafeInteger(tokens) || tokens < 1) throw new Error('invalid_count');
      if (tokens > config.max_input_tokens) throw new AIError('input_too_large');
      return tokens;
    } catch (error) {
      if (error instanceof AIError) throw error;
      throw new AIError('input_count_unavailable');
    }
  }
  async run({ config, instructions, context, schema, generationId, countedInputTokens }: ProviderInput): Promise<ProviderResult> {
    const started = performance.now();
    if (!this.key) throw new AIError('configuration_required');
    const input = JSON.stringify(context);
    // Bytes are only a conservative fast path for legacy fixed budgets. Clinical
    // model-capacity requests already have an exact count and a funded output budget.
    const bytes = new TextEncoder().encode(instructions + input + JSON.stringify(schema)).length;
    const body = {
      model: config.model, instructions, input, store: false, background: false,
      max_output_tokens: config.max_output_tokens, truncation: 'disabled',
      text: { format: { type: 'json_schema', name: 'nuthrick_result', strict: true, schema } },
      ...(config.reasoning_level ? { reasoning: { effort: config.reasoning_level } } : {}),
      ...(config.temperature !== null ? { temperature: config.temperature } : {}),
    };
    const signal = AbortSignal.timeout(config.timeout_ms);
    if (countedInputTokens !== undefined) {
      if (!Number.isSafeInteger(countedInputTokens) || countedInputTokens < 1 || countedInputTokens > config.max_input_tokens) throw new AIError('input_too_large');
    } else if (config.token_policy === 'model_capacity' || bytes + 2048 > config.max_input_tokens) {
      await this.countInput({config,instructions,context,schema});
    }
    // Only an explicit rate-limit rejection is retried once. Never replay timeout/5xx/network uncertainty.
    const attempts = config.max_provider_attempts === 1 || config.feature === 'diet_draft' ? 1 : 2;
    for (let attempt = 0; attempt < attempts; attempt++) {
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
          if (typeof candidate === 'string' && ['context_length_exceeded','credit_balance_exhausted','insufficient_quota','rate_limit_exceeded','invalid_api_key','invalid_request_error','server_error'].includes(candidate)) providerCode = candidate;
        } catch { /* A non-JSON body is intentionally ignored. */ }
        console.warn(JSON.stringify({ event: 'provider_rejected', status: response.status, model: config.model, code: providerCode }));
        if (providerCode === 'credit_balance_exhausted') throw new AIError('provider_credit_exhausted');
        if (providerCode === 'context_length_exceeded') throw new AIError('input_too_large');
        if (response.status === 429 && attempt + 1 < attempts) { await this.pause(250); continue; }
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
      return { usage, output, status: String(data.status), responseId: typeof data.id === 'string' ? data.id : '',
        model: typeof data.model === 'string' ? data.model : undefined, latencyMs: Math.round(performance.now() - started),
        requestId: /^[a-zA-Z0-9_-]{1,200}$/.test(response.headers.get('x-request-id') ?? '') ? response.headers.get('x-request-id')! : undefined };
    }
    throw new AIError('provider_rejected');
  }
}

export type Generation = { id: string; status: string; charged_credits: number; config_snapshot?: { allocated_output_tokens?: number } };
export interface AIStore {
  config(feature: string): Promise<FeatureConfig>;
  reserve(config: FeatureConfig, request: AIRequest, fingerprint: string, inputTokens?: number): Promise<{ generation: Generation; created: boolean }>;
  claim(id: string): Promise<boolean>;
  settle(id: string, status: string, usage: Usage, responseId?: string): Promise<Generation>;
  uncertain(id: string): Promise<void>;
  context?(request: AIRequest): Promise<{ context: unknown; stamp: string }>;
  bindContext?(id: string, request: AIRequest, stamp: string): Promise<void>;
  validateOutput?(output: unknown): boolean;
  recordResult?(id: string, result: ProviderResult, valid: boolean): Promise<void>;
  refundInvalidPes?(id: string): Promise<number>;
}
export type AIRequest = { objectiveTextStyle?: 'patient_v1'; textGuidance?: TextDietGuidance; guidance?: DietGuidance; strategyFeedback?: string; feature: string; idempotencyKey: string; patientId?: string; consultationId?: string; revision?: number; narrative?: string; planId?: string; previousProposalId?: string; rejectedItems?: string[]; rejectedFoodIds?: string[]; rejectedSignatures?: string[] };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseRequest(value: unknown): AIRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AIError('invalid_request');
  const v = value as Record<string, unknown>;
  if (Object.keys(v).some(k => !['feature','idempotencyKey','patientId','consultationId','revision','narrative','planId','previousProposalId','rejectedItems','guidance','textGuidance','strategyFeedback','objectiveTextStyle'].includes(k))
    || typeof v.feature !== 'string' || !/^[a-z][a-z0-9_]{1,63}$/.test(v.feature)
    || typeof v.idempotencyKey !== 'string' || !uuid.test(v.idempotencyKey)
    || [v.patientId,v.consultationId].some(id => id !== undefined && (typeof id !== 'string' || !uuid.test(id)))
    || (v.consultationId && !v.patientId)) throw new AIError('invalid_request');
  if(v.objectiveTextStyle!==undefined && (v.feature!=='consultation_support' || v.objectiveTextStyle!=='patient_v1'))throw new AIError('invalid_request');
  if(v.feature==='diet_workshop')throw new AIError('feature_disabled'); // Retired; historical ledger remains immutable.
  const workshop = v.feature === 'diet_draft';
  if(v.textGuidance!==undefined && (!workshop || !isTextDietGuidance(v.textGuidance) || v.guidance!==undefined || v.previousProposalId!==undefined))throw new AIError('invalid_request');
  if(v.guidance!==undefined && (!workshop || !isDietGuidance(v.guidance)))throw new AIError('invalid_request');
  if(v.previousProposalId!==undefined && (!workshop || typeof v.previousProposalId!=='string' || !uuid.test(v.previousProposalId)))throw new AIError('invalid_request');
  if(v.rejectedItems!==undefined && (!v.previousProposalId || !Array.isArray(v.rejectedItems) || v.rejectedItems.length>30 || v.rejectedItems.some(v=>typeof v!=='string'||!/^c[1-9][0-9]{0,3}$/.test(v))))throw new AIError('invalid_request');
  if (v.feature === 'diet_draft' && ['rejectedFoodIds','rejectedSignatures'].some(k => v[k] !== undefined)) throw new AIError('invalid_request');
  if (workshop && (typeof v.planId !== 'string' || !uuid.test(v.planId) || !Number.isSafeInteger(v.revision) || Number(v.revision)<1)) throw new AIError('invalid_request');
  if (!workshop && ['planId','rejectedFoodIds','rejectedSignatures'].some(k => v[k] !== undefined)) throw new AIError('invalid_request');
  if (v.rejectedFoodIds !== undefined && (!Array.isArray(v.rejectedFoodIds) || v.rejectedFoodIds.length>30 || v.rejectedFoodIds.some(id => typeof id!=='string'||!uuid.test(id)))) throw new AIError('invalid_request');
  if (v.rejectedSignatures !== undefined && (!Array.isArray(v.rejectedSignatures) || v.rejectedSignatures.length>3 || v.rejectedSignatures.some(s => typeof s!=='string'||s.length>16000))) throw new AIError('invalid_request');
  if (v.strategyFeedback !== undefined && (v.feature !== 'intervention_strategy' || typeof v.strategyFeedback !== 'string' || v.strategyFeedback.length > 600)) throw new AIError('invalid_request');
  const clinical = ['pes_diagnosis','recall_24h','consultation_support','patient_instructions','intervention_strategy'].includes(v.feature as string);
  if (clinical && (!v.consultationId || !Number.isSafeInteger(v.revision) || Number(v.revision) < 1)) throw new AIError('invalid_request');
  if (!clinical && !workshop && (v.revision !== undefined || v.narrative !== undefined)) throw new AIError('invalid_request');
  // Reuse the already fingerprinted narrative field for bounded diet instructions.
  // No new prompt/model parameters and no changes to reservation/idempotency.
  if (v.feature === 'diet_draft') {
    if (v.narrative !== undefined && (typeof v.narrative !== 'string' || v.narrative.length > 1200)) throw new AIError('invalid_request');
  } else if (v.feature === 'recall_24h' ? typeof v.narrative !== 'string' || !v.narrative.trim() || v.narrative.length > 8000 : v.narrative !== undefined) throw new AIError('invalid_request');
  return v as AIRequest;
}
export async function runAIRequest(request: AIRequest, store: AIStore, provider: AIProvider) {
  const config = await store.config(request.feature);
  const referencedPes = request.feature === 'pes_diagnosis' && ['pes_diagnosis@8','pes_diagnosis@9'].includes(config.prompt_version);
  const proposedObjectives = request.feature === 'consultation_support' && config.prompt_version === 'consultation_support@5';
  if (referencedPes && !store.refundInvalidPes) throw new AIError('configuration_required');
  if (!config.enabled || config.provider !== 'openai') throw new AIError('feature_disabled');
  const adapter = featureAdapter(request.feature, config.prompt_version,!!request.textGuidance);
  const clinical = ['pes_diagnosis','recall_24h','consultation_support','patient_instructions','intervention_strategy','diet_draft'].includes(request.feature);
  if (clinical && (!store.context || !store.bindContext)) throw new AIError('context_unavailable');
  const hydrated = clinical ? await store.context!(request) : null;
  if (hydrated) adapter.context = hydrated.context;
  if (proposedObjectives) adapter.context = { ...(adapter.context as object), objectiveFormat: 'smart@2' };
  if (referencedPes) adapter.context = referencedPesContext(adapter.context);
  const canonical = JSON.stringify([request.feature,request.patientId ?? null,request.consultationId ?? null, ...(hydrated ? [request.revision, hydrated.stamp, request.narrative,request.planId,request.previousProposalId,request.rejectedItems] : []), ...(request.guidance ? [request.guidance] : []), ...(request.textGuidance ? [request.textGuidance] : []), ...(request.feature==='intervention_strategy'?[request.strategyFeedback??null]:[]), ...(request.objectiveTextStyle ? [request.objectiveTextStyle] : [])]);
  const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical))), b => b.toString(16).padStart(2,'0')).join('');
  let countedInputTokens: number | undefined;
  if (config.token_policy === 'model_capacity') {
    if (!provider.countInput) throw new AIError('configuration_required');
    countedInputTokens = await provider.countInput({config,...adapter});
  }
  const { generation, created } = await store.reserve(config,request,fingerprint,countedInputTokens);
  if (!created) return { generationId: generation.id, status: generation.status, replay: true };
  const allocatedOutput = generation.config_snapshot?.allocated_output_tokens;
  if (config.token_policy === 'model_capacity' && (!Number.isSafeInteger(allocatedOutput) || allocatedOutput! < 16 || allocatedOutput! > config.max_output_tokens)) {
    await store.settle(generation.id,'failed',{input_tokens:0,output_tokens:0,cached_tokens:0});
    throw new AIError('configuration_required');
  }
  try { if (hydrated) await store.bindContext!(generation.id,request,hydrated.stamp); }
  catch { await store.settle(generation.id,'failed',{input_tokens:0,output_tokens:0,cached_tokens:0}); throw new AIError('context_unavailable'); }
  if (!await store.claim(generation.id)) return { generationId: generation.id, status: generation.status, replay: true };
  let result: ProviderResult;
  try { result = await provider.run({ config:allocatedOutput ? {...config,max_output_tokens:allocatedOutput} : config, ...adapter, generationId: generation.id, countedInputTokens }); }
  catch (error) {
    if (!(error instanceof AIError) || error.uncertain) {
      await store.uncertain(generation.id);
      throw new AIError('provider_outcome_unknown',true);
    }
    await store.settle(generation.id,'failed',{ input_tokens: 0, output_tokens: 0, cached_tokens: 0 });
    throw error;
  }
  const structuredPes = request.feature === 'pes_diagnosis' && ['pes_diagnosis@5', 'pes_diagnosis@6', 'pes_diagnosis@7'].includes(config.prompt_version);
  if (referencedPes) {
    result = { ...result, output: result.status === 'completed' && validOutput(adapter.schema,result.output)
      ? (config.prompt_version === 'pes_diagnosis@9' ? normalizeConcisePes : normalizeReferencedPes)(result.output,adapter.context) : null };
  }
  const outputSchema = referencedPes ? pesSchema : proposedObjectives ? normalizedObjectiveProposalsSchema : adapter.schema;
  if (structuredPes) result = { ...result, output: normalizePesOutput(result.output) };
  let valid = false;
  try {
    const smartObjectives = request.feature === 'consultation_support' && config.prompt_version === 'consultation_support@4';
    if (proposedObjectives) result = { ...result, output: result.status === 'completed' && validOutput(adapter.schema,result.output) ? normalizeObjectiveProposals(result.output,adapter.context) : null };
    if (smartObjectives && result.status === 'completed' && validOutput(adapter.schema,result.output)) result = { ...result, output: normalizeSmartObjectivesOutput(result.output,adapter.context) };
    if (request.feature === 'intervention_strategy' && validOutput(adapter.schema,result.output)) result = { ...result, output: normalizeInterventionOutput(result.output,adapter.context as InterventionContext) };
    valid = result.status === 'completed' && validOutput(outputSchema,result.output) && clinicalEvidenceValid(request.feature,result.output,adapter.context) && (request.feature !== 'intervention_strategy' || interventionEvidenceValid(result.output,adapter.context as InterventionContext,generation.id)) && (!structuredPes || pesClinicalStructureValid(result.output)) && (request.feature !== 'pes_diagnosis' || config.prompt_version !== 'pes_diagnosis@7' || pesSynthesisEvidenceValid(result.output)) && (!store.validateOutput || store.validateOutput(result.output));
    if (!valid && request.feature === 'pes_diagnosis') console.warn(JSON.stringify({event:'pes_output_rejected',generationId:generation.id,promptVersion:config.prompt_version,codes:result.status!=='completed'?['provider_incomplete']:!validOutput(outputSchema,result.output)?['schema_or_references']:['evidence_or_structure']}));
    if (!valid && smartObjectives) console.warn(JSON.stringify({event:'objective_output_rejected',generationId:generation.id,codes:result.status!=='completed'?['provider_incomplete']:!validOutput(adapter.schema,result.output)?['schema']:smartObjectiveValidationIssues(result.output,adapter.context)}));
    if (!valid && proposedObjectives) console.warn(JSON.stringify({event:'objective_output_rejected',generationId:generation.id,promptVersion:config.prompt_version,codes:result.status!=='completed'?['provider_incomplete']:!validOutput(outputSchema,result.output)?['schema_or_references']:['evidence_or_proposal']}));
    if (!valid && request.feature === 'intervention_strategy') console.warn(JSON.stringify({event:'strategy_output_rejected',generationId:generation.id,codes:result.status!=='completed'?['provider_incomplete']:!validOutput(adapter.schema,result.output)?['schema']:interventionValidationIssues(result.output,adapter.context as InterventionContext,generation.id)}));
    await store.recordResult?.(generation.id,result,valid);
  } catch {
    // Confirmed provider usage remains billable even if domain validation or
    // snapshot persistence fails afterwards. Never settle these as zero usage.
    await store.settle(generation.id,'failed',result.usage,result.responseId);
    throw new AIError('result_unavailable');
  }
  await store.settle(generation.id, valid ? 'succeeded' : 'invalid_output',result.usage,result.responseId);
  if (!valid) {
    if (referencedPes) {
      try { await store.refundInvalidPes!(generation.id); }
      catch { throw new AIError('invalid_output_refund_pending'); }
      throw new AIError('invalid_output_refunded');
    }
    throw new AIError('invalid_output');
  }
  return { generationId: generation.id, status: 'succeeded', output: request.feature==='recall_24h' && config.prompt_version==='recall_24h@1'?conservativeRecallQuantities(result.output):result.output, replay: false };
}
