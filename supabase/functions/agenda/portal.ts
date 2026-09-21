import { codeHash, encrypt, decrypt, secretToken, sha256, normalizeEmail } from './security.ts';
import { sanitizePortalContent, uuid } from './portal-content.ts';
import { projectPortalPlan } from './portal-plan.ts';

type Json = Record<string, unknown>;
type Dependencies = {
  rpc: (data: Json) => Promise<Json>;
  owner: (req: Request) => Promise<string>;
  limit: (bucket: string, max: number, seconds: number) => Promise<void>;
  mail: (to: string, subject: string, message: string, id: string) => Promise<string>;
  key: string;
  document?: (plan:unknown,professional:unknown,format:'pdf'|'tex')=>Promise<Json>;
};
const token = (v: unknown) => {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{40,100}$/.test(v)) throw new Error('portal_unavailable');
  return v;
};
function randomCode(digits: number) {
  const range = 10 ** digits, limit = Math.floor(4294967296 / range) * range;
  let n: number; do { n = crypto.getRandomValues(new Uint32Array(1))[0]; } while (n >= limit);
  return String(n % range).padStart(digits, '0');
}

/** Dedicated purposes; an Agenda booking proof can never become a portal session. */
export async function portalRequest(req: Request, body: Json, deps: Dependencies): Promise<Json> {
  const action = String(body.action || '');
  const call = async (action: string, data: Json) => {
    const result = await deps.rpc({ p_action: action, p_data: data });
    if (result.error) throw new Error(String(result.error));
    return result;
  };
  let actor: Json;
  if (body.op === 'portal_owner') {
    const owner = await deps.owner(req);
    if (action === 'inbox') {
      if (typeof body.search !== 'string' || body.search.length > 100 || !Number.isInteger(body.offset) || Number(body.offset) < 0 || Number(body.offset) > 10000) throw new Error('invalid_input');
      return call('inbox', { owner, search: body.search, offset: body.offset });
    }
    actor = { owner, patientId: uuid(body.patientId) };
  } else if (body.op === 'portal_code') {
    const linkHash = await sha256(token(body.link));
    const email = normalizeEmail(body.email);
    await deps.limit(`portal:code:${linkHash}`, 3, 900);
    await deps.limit(`agenda:email:${email}`, 3, 900);
    await deps.limit('agenda:all-mail', 60, 3600);
    const id = crypto.randomUUID();
    const code = randomCode(6);
    const target = await call('challenge', { id, linkHash, email, codeHash: await codeHash(deps.key, id, code) });
    await deps.mail(String(target.email), 'Tu acceso privado a Nuthrick', `Tu código de acceso es: ${code}\n\nVence en 10 minutos. No compartas este código. Si no solicitaste entrar a tu espacio de paciente, ignora este mensaje.`, id);
    return { id, delivery: 'sent' };
  } else if (body.op === 'portal_verify_professional') {
    const linkHash = await sha256(token(body.link));
    if (typeof body.code !== 'string' || !/^\d{8}$/.test(body.code)) throw new Error('invalid_code');
    await deps.limit(`portal:professional-verify:${linkHash}`, 10, 900);
    const session = secretToken();
    await call('verify_professional', {linkHash,codeHash:await codeHash(deps.key,linkHash,`professional:${body.code}`),newSessionHash:await sha256(session)});
    return {session,expiresAt:new Date(Date.now()+7200000).toISOString()};
  } else if (body.op === 'portal_verify') {
    const id = uuid(body.id);
    if (typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) throw new Error('invalid_code');
    await deps.limit(`portal:verify:${id}`, 10, 900);
    const session = secretToken();
    await call('verify', { id, linkHash: await sha256(token(body.link)), codeHash: await codeHash(deps.key, id, body.code), newSessionHash: await sha256(session) });
    return { session, expiresAt: new Date(Date.now() + 7200000).toISOString() };
  } else if (body.op === 'portal_patient') {
    actor = { sessionHash: await sha256(token(body.session)) };
  } else throw new Error('invalid_action');

  const allowed = body.op === 'portal_owner'
    ? ['view', 'link', 'revoke', 'publish', 'messages', 'message', 'read', 'issue_code', 'plan', 'plan_options', 'plan_preview', 'share_plan','goal_candidates','plan_history','plan_version','export_plan']
    : ['view', 'messages', 'message', 'read', 'notes', 'note', 'delete_note', 'logout', 'plan','export_plan'];
  if (!allowed.includes(action)) throw new Error('invalid_action');
  // Whitelist each payload; never spread untrusted JSON into actor fields.
  let data: Json = {};
  if(action==='plan_history') {
    if(body.offset!==undefined && (!Number.isInteger(body.offset)||Number(body.offset)<0||Number(body.offset)>10000))throw new Error('invalid_input');
    data={offset:body.offset||0};
  }
  if(action==='plan_version')data={versionId:uuid(body.versionId)};
  if(action==='export_plan') {
    const owner=body.op==='portal_owner';
    if(body.format!=='pdf' && !(owner&&body.format==='tex'))throw new Error('invalid_action');
    if(!owner && ('planId' in body || 'versionId' in body))throw new Error('invalid_action');
    data={format:body.format,...(owner?{versionId:uuid(body.versionId)}:{})};
    await deps.limit(`portal:export:${actor.owner||actor.sessionHash}`,10,300);
  }
  if (action === 'issue_code') {
    if (body.identityConfirmed !== true) throw new Error('identity_confirmation_required');
    await deps.limit(`portal:issue:${actor.owner}:${actor.patientId}`,3,900);
    const space = await call('view',actor);
    if (!space.enabled || !space.encryptedLink) throw new Error('portal_unavailable');
    const linkHash = await sha256(await decrypt(deps.key,String(space.encryptedLink)));
    const code = randomCode(8);
    const result = await call('issue_code',{...actor,identityConfirmed:true,id:crypto.randomUUID(),linkHash,codeHash:await codeHash(deps.key,linkHash,`professional:${code}`)});
    return {code,expiresAt:result.expiresAt};
  }
  if (action === 'plan_preview' || action === 'share_plan') data={planId:body.planId===null && action==='share_plan' ? null : uuid(body.planId)};
  if (action === 'link') {
    const raw = secretToken();
    await call(action, { ...actor, linkHash: await sha256(raw), encryptedLink: await encrypt(deps.key, raw) });
    return { link: raw };
  }
  if (action === 'publish') {
    if (!Number.isInteger(body.revision) || Number(body.revision) < 0) throw new Error('invalid_input');
    data = { shared: sanitizePortalContent(body.shared), revision: body.revision };
  }
  if (action === 'message' || action === 'note') {
    if (typeof body.body !== 'string' || !body.body.trim() || body.body.length > (action === 'message' ? 4000 : 2000)) throw new Error('invalid_input');
    if (action === 'message') {
      await deps.limit(`portal:message:${actor.owner || actor.sessionHash}`, 30, 60);
      data = { body: body.body, clientId: uuid(body.clientId) };
    } else data = { body: body.body, id: uuid(body.id), done: body.done === true };
  }
  if (action === 'delete_note' || action === 'read') data = { id: uuid(body.id) };
  if (action === 'messages' && (body.before || body.after)) {
    const cursor = (body.before || body.after) as Json;
    if (typeof cursor.at !== 'string' || cursor.at.length > 40 || !Number.isFinite(Date.parse(cursor.at))) throw new Error('invalid_input');
    data = { [body.before ? 'before' : 'after']: { id: uuid(cursor.id), at: cursor.at } };
  }
  const result = await call(action, { ...actor, ...data });
  if (action === 'plan' || action === 'plan_preview' || action==='plan_version') return {plan:projectPortalPlan(result.plan)};
  if(action==='export_plan') {
    if(!deps.document)throw new Error('document_unavailable');
    let document:Json;
    try { document=await deps.document(result.plan,result.professional,body.format as 'pdf'|'tex'); }
    catch(error) {
      // Operational diagnostics only: never log document data or error messages,
      // which can contain user-provided text or storage identifiers.
      console.error('portal_document_failed',error instanceof Error?error.name:'Error',error instanceof Error?error.stack?.split('\n').slice(1,4).join('\n'):'');
      throw error;
    }
    // Revalidate after rendering, so revocation or a different shared version
    // during generation cannot deliver a stale document.
    const current=await call(action,{...actor,...data});
    if(JSON.stringify(current.plan)!==JSON.stringify(result.plan))throw new Error('invalid_plan');
    return document;
  }
  if (action === 'view') {
    // Defense in depth: old or malformed snapshots also cannot leak metadata.
    result.shared = sanitizePortalContent(result.shared);
    if (body.op === 'portal_owner') {
      const { encryptedLink, ...safe } = result;
      return { ...safe, link: encryptedLink && result.enabled ? await decrypt(deps.key, String(encryptedLink)) : null };
    }
  }
  return result;
}
