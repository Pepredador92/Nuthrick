import { createClient } from '@supabase/supabase-js';
import { AIError, type AIStore, type FeatureConfig, type Generation, OpenAIResponsesProvider, parseRequest, runAIRequest } from './core.ts';
import { buildPesClinicalContext, redactClinicalText, type ClinicalSource } from './clinical.ts';
import { prepareDietSnapshot, prepareDietAlternative, verifyDietSnapshot, validateSnapshot, parseDietDecision, DietRoutingProvider, type DietSnapshot } from './diet.ts';
import { dietPreflight } from './diet-ux.ts';
import { localDietTestMode, SimulatedDietProvider } from './diet-provider-test.ts';

const site = Deno.env.get('AI_SITE_URL') || 'https://nuthrick.vercel.app';
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  'Access-Control-Allow-Origin': site, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body),{ status, headers });
const technicalCodes = new Set(['insufficient_credits','feature_disabled','account_disabled','too_many_requests','rate_limited','provider_credit_exhausted',
  'pilot_limit_reached','pilot_daily_limit','pilot_daily_budget','config_changed','context_unavailable','idempotency_conflict','generation_unavailable','invalid_request']);

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null,{ status: 204, headers });
  if (request.method !== 'POST') return respond({ error: 'method_not_allowed' },405);
  try {
    if (request.headers.get('origin') && request.headers.get('origin') !== site) throw new AIError('unauthorized');
    const url = Deno.env.get('SUPABASE_URL'), serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !serviceKey) throw new AIError('configuration_required');
    const db = createClient(url,serviceKey,{ auth: { persistSession: false, autoRefreshToken: false } });
    const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) throw new AIError('unauthorized');
    const { data, error } = await db.auth.getUser(token);
    if (error || !data.user || data.user.is_anonymous) throw new AIError('unauthorized');
    const owner = data.user.id;
    const testMode = localDietTestMode(url,Deno.env.get('NUTHRICK_DIET_TEST_MODE'));
    const dietEnabled = Deno.env.get('NUTHRICK_AI_ENABLED')==='true' && (testMode || Deno.env.get('NUTHRICK_DIET_REAL_PROVIDER_ENABLED')==='true');
    // Bounded streaming read (Content-Length is untrusted/optional).
    const reader = request.body?.getReader();
    if (!reader) throw new AIError('invalid_request');
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) { const { value, done } = await reader.read(); if (done) break;
      size += value.length; if (size > 750000) { await reader.cancel(); throw new AIError('invalid_request'); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new AIError('invalid_request'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AIError('invalid_request');
    const decision = body as {action?:string;payload?:string;signature?:string};
    if (decision.action === 'diet_preflight') {
      const {action: _action, ...fields} = body as Record<string, unknown>;
      const r = parseRequest(fields);
      if (r.feature !== 'diet_draft') throw new AIError('invalid_request');
      const {data: loaded, error} = await db.rpc('ai_diet_source',{p_owner:owner,p_plan:r.planId,p_revision:r.revision});
      if (error || !loaded || loaded.source.plan.patient_id !== (r.patientId ?? null) || loaded.source.plan.consultation_id !== (r.consultationId ?? null)) throw new AIError('context_unavailable');
      loaded.source.additionalInstructions = r.narrative ?? '';
      const config = await db.rpc('ai_server',{p_action:'config',p_owner:owner,p_data:{feature:'diet_draft'}});
      // Read balance with the caller's JWT; never impersonate an owner in a browser.
      const caller = createClient(url, serviceKey, {global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
      const balance = await caller.rpc('ai_balance');
      return respond(await dietPreflight(loaded, !config.error && config.data?.enabled === true && dietEnabled && (testMode || !!Deno.env.get('OPENAI_API_KEY')),
        !balance.error && (testMode || Number(balance.data?.available_credits) > 0)));
    }
    async function dietRpc(action: string, payload: Record<string,unknown>) {
      const {data,error}=await db.rpc('ai_diet_draft',{p_owner:owner,p_action:action,p_data:payload});
      if(error) throw new AIError(['context_changed','replacement_confirmation_required','difference_confirmation_required','invalid_request','invalid_output'].includes(error.message)?error.message:'context_unavailable');
      return data;
    }
    if (decision.action==='apply_diet_draft' || decision.action==='discard_diet_draft') {
      const command=parseDietDecision(body as Record<string,unknown>);
      const saved=await dietRpc('get',{generationId:command.generationId});
      await verifyDietSnapshot(saved.snapshot);
      return respond(await dietRpc(decision.action==='apply_diet_draft'?'apply':'discard',command));
    }
    if(size>60000) throw new AIError('invalid_request');
    const input = parseRequest(body);
    // Fail before reservation if secret/kill switch isn't ready. No real requests enabled by default.
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (Deno.env.get('NUTHRICK_AI_ENABLED') !== 'true') throw new AIError('feature_disabled');
    if(input.feature==='diet_draft' && !dietEnabled)throw new AIError('feature_disabled');
    const simulated=input.feature==='diet_draft' && testMode;
    if (!apiKey && !simulated) throw new AIError('configuration_required');
    async function rpc<T>(action: string, payload: Record<string, unknown>): Promise<T> {
      // Only safe idempotent database operations retried; never call the model from this retry.
      for (let attempt=0; attempt<2; attempt++) {
        const result = await db.rpc('ai_server',{ p_action: action, p_owner: owner, p_data: payload });
        if (!result.error) return result.data as T;
        if (technicalCodes.has(result.error.message)) throw new AIError(result.error.message);
      }
      throw new AIError('service_unavailable',true);
    }
    let dietSnapshot: DietSnapshot | null=null;
    let dietValidation: ReturnType<typeof validateSnapshot> | null=null;
    const store: AIStore = {
      context: async r => {
        if(r.feature==='diet_draft') {
          const {data:loaded,error}=await db.rpc('ai_diet_source',{p_owner:owner,p_plan:r.planId,p_revision:r.revision});
          if(error||!loaded||loaded.source.plan.patient_id!==(r.patientId??null)||loaded.source.plan.consultation_id!==(r.consultationId??null)) throw new AIError('context_unavailable');
          loaded.source.additionalInstructions = r.narrative ?? '';
          if(r.previousProposalId){
            const previous=await dietRpc('get',{generationId:r.previousProposalId});
            if(previous.planId!==r.planId || previous.stamp!==loaded.source.stamp || previous.status!=='succeeded' || !previous.result?.validation?.draft)throw new AIError('context_changed');
            dietSnapshot=await prepareDietAlternative(loaded,previous.snapshot,previous.result.validation.draft,r.rejectedItems);
          }else dietSnapshot=await prepareDietSnapshot(loaded);
          return {stamp:dietSnapshot.sourceStamp,context:dietSnapshot.prepared.payload};
        }
        const { data: source, error } = await db.rpc('ai_clinical_source',{p_owner:owner,p_patient:r.patientId,p_consultation:r.consultationId,p_revision:r.revision});
        if (error || !source) throw new AIError('context_unavailable');
        const clinical = source as ClinicalSource;
        const context=r.feature==='pes_diagnosis' ? buildPesClinicalContext(clinical) : {narrative:redactClinicalText(r.narrative!,clinical.identifiers?.filter((v): v is string => typeof v === 'string'))};
        if ('facts' in context && context.facts.length===0) throw new AIError('context_unavailable');
        return {stamp:clinical.stamp,context};
      },
      bindContext: async (id,r,stamp) => {
        if(r.feature==='diet_draft') {
          await dietRpc('bind',{generationId:id,planId:r.planId,revision:r.revision,stamp,snapshot:dietSnapshot});
          return;
        }
        const {error} = await db.rpc('ai_bind_clinical_context',{p_owner:owner,p_generation:id,p_revision:r.revision,p_stamp:stamp});
        if (error) throw new AIError('context_unavailable');
      },
      config: async feature => {
        const c=await rpc<FeatureConfig>('config',{feature});
        if(feature==='diet_draft' && (c.execution_mode==='simulated')!==simulated)throw new AIError('feature_disabled');
        return c;
      },
      reserve: (config,r,hash) => rpc('reserve',{ config, feature: r.feature, idempotency_key: r.idempotencyKey, request_hash: hash, patient_id: r.patientId ?? null, consultation_id: r.consultationId ?? null }),
      claim: async id => (await rpc<{ claimed: boolean }>('claim',{ generation_id: id })).claimed,
      settle: (id,status,usage,responseId) => rpc<Generation>('settle',{ generation_id: id,status,...usage,provider_response_id: responseId }),
      uncertain: async id => { await rpc('uncertain',{ generation_id: id }); },
      validateOutput: output => {
        if(dietSnapshot) { dietValidation=validateSnapshot(output,dietSnapshot); return dietValidation.status!=='invalid'; }
        return true;
      },
      recordResult: async (id,result,valid) => {
        const metadata=await db.rpc('ai_provider_metadata',{p_owner:owner,p_generation:id,p_request_id:result.requestId??null,p_model:result.model??null,p_latency:result.latencyMs??null});
        if(metadata.error)throw new AIError('result_unavailable');
        if(!dietSnapshot) return;
        // No raw malformed output is retained. All values below are scoped,
        // redacted snapshot-derived data or safe provider accounting metadata.
        await dietRpc('result',{generationId:id,result:{validation:valid?dietValidation:{status:'invalid',issues:[{code:'invalid_output',path:'output'}]},
          model:result.model??null,latencyMs:result.latencyMs??null,usage:result.usage}});
      },
    };
    const result=await runAIRequest(input,store,new DietRoutingProvider(simulated ? new SimulatedDietProvider() : new OpenAIResponsesProvider(apiKey!)));
    if(input.feature==='diet_draft' && ['succeeded','invalid_output'].includes(result.status)) {
      const saved=await dietRpc('get',{generationId:result.generationId});
      await verifyDietSnapshot(saved.snapshot);
      return respond({...result,output:{validation:saved.result.validation,hasManualMenu:saved.snapshot.hasManualMenu,snapshotHash:saved.snapshot.hash},decision:saved.decision});
    }
    return respond(result);
  } catch (error) {
    // Never log/request-echo raw exceptions, provider body, key, prompt or clinical output.
    const code = error instanceof AIError ? error.code : 'service_unavailable';
    return respond({ error: code }, code === 'unauthorized' ? 401 : code === 'invalid_request' ? 400 : code === 'insufficient_credits' ? 402 : 409);
  }
});
