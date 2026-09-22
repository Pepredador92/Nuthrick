import { createClient } from '@supabase/supabase-js';
import { AIError, type AIStore, type FeatureConfig, type Generation, OpenAIResponsesProvider, parseRequest, runAIRequest } from './core.ts';

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
      size += value.length; if (size > 2048) { await reader.cancel(); throw new AIError('invalid_request'); } chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.length; }
    let body: unknown;
    try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new AIError('invalid_request'); }
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
    const store: AIStore = {
      config: feature => rpc<FeatureConfig>('config',{ feature }),
      reserve: (config,r,hash) => rpc('reserve',{ config, feature: r.feature, idempotency_key: r.idempotencyKey, request_hash: hash, patient_id: r.patientId ?? null, consultation_id: r.consultationId ?? null }),
      claim: async id => (await rpc<{ claimed: boolean }>('claim',{ generation_id: id })).claimed,
      settle: (id,status,usage,responseId) => rpc<Generation>('settle',{ generation_id: id,status,...usage,provider_response_id: responseId }),
      uncertain: async id => { await rpc('uncertain',{ generation_id: id }); },
    };
    return respond(await runAIRequest(input,store,new OpenAIResponsesProvider(apiKey)));
  } catch (error) {
    // Never log/request-echo raw exceptions, provider body, key, prompt or clinical output.
    const code = error instanceof AIError ? error.code : 'service_unavailable';
    return respond({ error: code }, code === 'unauthorized' ? 401 : code === 'invalid_request' ? 400 : code === 'insufficient_credits' ? 402 : 409);
  }
});
