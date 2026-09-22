import { createClient } from '@supabase/supabase-js';
import { AIError, type AIStore, type FeatureConfig, type Generation, OpenAIResponsesProvider, parseRequest, runAIRequest } from './core.ts';
import { buildPesClinicalContext, redactClinicalText, type ClinicalSource } from './clinical.ts';
import { prepareWorkshop, sanitizeWorkshopValue, signWorkshop, verifyWorkshop, type WorkshopSource } from './workshop.ts';

const site = Deno.env.get('AI_SITE_URL') || 'https://nuthrick.vercel.app';
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  'Access-Control-Allow-Origin': site, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body),{ status, headers });
const technicalCodes = new Set(['insufficient_credits','feature_disabled','account_disabled','too_many_requests','rate_limited',
  'config_changed','context_unavailable','idempotency_conflict','generation_unavailable','invalid_request']);

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
    const decision = body as {action?:string;payload?:string;signature?:string};
    if (decision.action === 'apply_workshop' || decision.action === 'discard_workshop') {
      let signed;
      try { signed=await verifyWorkshop(decision.payload!,decision.signature!,serviceKey,decision.action==='discard_workshop'); } catch { throw new AIError('invalid_request'); }
      if (signed.owner!==owner) throw new AIError('unauthorized');
      const {data,error}=await db.rpc('ai_workshop_decision',{p_owner:owner,p_plan:signed.planId,p_revision:signed.revision,p_generation:signed.generationId,p_stamp:signed.stamp,p_decision:decision.action==='apply_workshop'?'accepted':'discarded',p_patch:signed.patch});
      if(error) throw new AIError('context_changed');
      return respond(data);
    }
    if(size>60000) throw new AIError('invalid_request');
    const input = parseRequest(body);
    // Fail before reservation if secret/kill switch isn't ready. No real requests enabled by default.
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (Deno.env.get('NUTHRICK_AI_ENABLED') !== 'true') throw new AIError('feature_disabled');
    if (!apiKey) throw new AIError('configuration_required');
    async function rpc<T>(action: string, payload: Record<string, unknown>): Promise<T> {
      // Only safe idempotent database operations retried; never call the model from this retry.
      for (let attempt=0; attempt<2; attempt++) {
        const result = await db.rpc('ai_server',{ p_action: action, p_owner: owner, p_data: payload });
        if (!result.error) return result.data as T;
        if (technicalCodes.has(result.error.message)) throw new AIError(result.error.message);
      }
      throw new AIError('service_unavailable',true);
    }
    let workshop: ReturnType<typeof prepareWorkshop> | null=null;
    let workshopSource: WorkshopSource | null=null;
    const store: AIStore = {
      context: async r => {
        if(r.feature==='diet_workshop') {
          const {data:source,error}=await db.rpc('ai_workshop_source',{p_owner:owner,p_plan:r.planId,p_revision:r.revision});
          if(error||!source||source.plan.patient_id!==(r.patientId??null)||source.plan.consultation_id!==(r.consultationId??null)) throw new AIError('context_unavailable');
          workshopSource=source as WorkshopSource;
          try { workshop=prepareWorkshop(workshopSource,r.rejectedFoodIds,r.rejectedSignatures); }
          catch(error) { throw new AIError(error instanceof Error && ['targets_required','restrictions_need_review'].includes(error.message)?error.message:'proposal_unavailable'); }
          // Redact custom recipe/food labels too, not just consultation facts.
          return {stamp:source.stamp,context:sanitizeWorkshopValue(workshop.context,source.identifiers.filter((v:unknown):v is string=>typeof v==='string'))};
        }
        const { data: source, error } = await db.rpc('ai_clinical_source',{p_owner:owner,p_patient:r.patientId,p_consultation:r.consultationId,p_revision:r.revision});
        if (error || !source) throw new AIError('context_unavailable');
        const clinical = source as ClinicalSource;
        return {stamp:clinical.stamp,context:r.feature==='pes_diagnosis' ? buildPesClinicalContext(clinical) : {narrative:redactClinicalText(r.narrative!,clinical.identifiers?.filter((v): v is string => typeof v === 'string'))}};
      },
      bindContext: async (id,r,stamp) => {
        if(r.feature==='diet_workshop') {
          const {error}=await db.rpc('ai_workshop_bind',{p_owner:owner,p_generation:id,p_plan:r.planId,p_revision:r.revision});
          if(error) throw new AIError('context_unavailable');
          return;
        }
        const {error} = await db.rpc('ai_bind_clinical_context',{p_owner:owner,p_generation:id,p_revision:r.revision,p_stamp:stamp});
        if (error) throw new AIError('context_unavailable');
      },
      config: feature => rpc<FeatureConfig>('config',{ feature }),
      reserve: (config,r,hash) => rpc('reserve',{ config, feature: r.feature, idempotency_key: r.idempotencyKey, request_hash: hash, patient_id: r.patientId ?? null, consultation_id: r.consultationId ?? null }),
      claim: async id => (await rpc<{ claimed: boolean }>('claim',{ generation_id: id })).claimed,
      settle: (id,status,usage,responseId) => rpc<Generation>('settle',{ generation_id: id,status,...usage,provider_response_id: responseId }),
      uncertain: async id => { await rpc('uncertain',{ generation_id: id }); },
      validateOutput: output => !workshop || Number.isInteger((output as {option:number}).option) && (output as {option:number}).option>=0 && (output as {option:number}).option<workshop.options.length,
    };
    const result=await runAIRequest(input,store,new OpenAIResponsesProvider(apiKey));
    if (input.feature==='diet_workshop' && result.output && workshop && workshopSource) {
      const generated=result.output as {option:number;summary:string;warnings:string[];assumptions:string[]};
      const prepared=workshop as ReturnType<typeof prepareWorkshop>;
      const source=workshopSource as WorkshopSource;
      const selected=prepared.options[generated.option];
      const {signature:menuSignature,...patch}=selected;
      const signed=await signWorkshop({owner,planId:input.planId,revision:input.revision,generationId:result.generationId,stamp:source.stamp,expires:Date.now()+30*60*1000,patch},serviceKey);
      return respond({...result,output:{...signed,patch,menuSignature,summary:generated.summary,warnings:generated.warnings,assumptions:generated.assumptions,goal:source.goal??null}});
    }
    return respond(result);
  } catch (error) {
    // Never log/request-echo raw exceptions, provider body, key, prompt or clinical output.
    const code = error instanceof AIError ? error.code : 'service_unavailable';
    return respond({ error: code }, code === 'unauthorized' ? 401 : code === 'invalid_request' ? 400 : code === 'insufficient_credits' ? 402 : 409);
  }
});
