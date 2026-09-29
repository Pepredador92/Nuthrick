import { createClient } from '@supabase/supabase-js';
import { publicReferrer } from '../_shared/site-analytics.ts';
import { productOriginAllowed, siteOrigin } from '../_shared/site.ts';

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error('configuration_required');
  return value;
};
const site = siteOrigin(Deno.env.get('ANALYTICS_SITE_URL'));
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const headers = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': site,
  'Access-Control-Allow-Headers': 'content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

async function digest(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  const allowed = productOriginAllowed(origin, site);
  const finish = (result: Response) => {
    if (allowed) result.headers.set('Access-Control-Allow-Origin', origin!);
    result.headers.set('Vary', 'Origin');
    return result;
  };
  if (request.method === 'OPTIONS') return finish(new Response(null, { status: allowed ? 204 : 403, headers }));
  if (!allowed || request.method !== 'POST') return finish(response({ error: 'unauthorized' }, 401));
  try {
    if (Number(request.headers.get('content-length')) > 4096) return finish(response({ error: 'invalid_input' }, 400));
    const text = await request.text();
    if (text.length > 4096) return finish(response({ error: 'invalid_input' }, 400));
    const body = JSON.parse(text) as { path?: unknown; referrer?: unknown; sessionId?: unknown };
    if (typeof body.path !== 'string' || !['/', '/planes', '/privacy', '/terms', '/refunds', '/perfil-publico', '/reservar-cita'].includes(body.path)
      || typeof body.sessionId !== 'string' || !/^[A-Za-z0-9_-]{16,120}$/.test(body.sessionId)) {
      return finish(response({ error: 'invalid_input' }, 400));
    }
    // Abuse control shares the existing short-lived rate buckets, never the visits table.
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const { data: allowedRate, error: rateError } = await db.rpc('agenda_rate_limit', {
      p_bucket_hash: await digest(`visits:${new Date().toISOString().slice(0, 10)}:${ip}`), p_max: 120, p_seconds: 60,
    });
    if (rateError) return finish(response({ error: 'temporarily_unavailable' }, 503));
    if (!allowedRate) return finish(response({ error: 'rate_limited' }, 429));
    const referrer = publicReferrer(body.referrer);
    const { error } = await db.rpc('site_analytics_record', {
      p_session_hash: await digest(body.sessionId),
      p_path: body.path,
      p_referrer: referrer,
    });
    if (error) return finish(response({ error: 'temporarily_unavailable' }, 503));
    return finish(response({ recorded: true }));
  } catch {
    return finish(response({ error: 'invalid_input' }, 400));
  }
});
