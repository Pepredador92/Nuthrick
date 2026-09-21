import { codeHash, encrypt, decrypt, secretToken, sha256, normalizeEmail } from './security.ts';
import { sanitizePortalContent, uuid } from './portal-content.ts';

type Json = Record<string, unknown>;
type Dependencies = {
  rpc: (data: Json) => Promise<Json>;
  owner: (req: Request) => Promise<string>;
  limit: (bucket: string, max: number, seconds: number) => Promise<void>;
  mail: (to: string, subject: string, message: string, id: string) => Promise<string>;
  key: string;
};
const token = (v: unknown) => {
  if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{40,100}$/.test(v)) throw new Error('portal_unavailable');
  return v;
};

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
    let n: number; do { n = crypto.getRandomValues(new Uint32Array(1))[0]; } while (n >= 4294000000);
    const code = String(n % 1000000).padStart(6, '0');
    const target = await call('challenge', { id, linkHash, email, codeHash: await codeHash(deps.key, id, code) });
    await deps.mail(String(target.email), 'Tu acceso privado a Nuthrick', `Tu código de acceso es: ${code}\n\nVence en 10 minutos. No compartas este código. Si no solicitaste entrar a tu espacio de paciente, ignora este mensaje.`, id);
    return { id, delivery: 'sent' };
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
    ? ['view', 'link', 'revoke', 'publish', 'messages', 'message', 'read']
    : ['view', 'messages', 'message', 'read', 'notes', 'note', 'delete_note', 'logout'];
  if (!allowed.includes(action)) throw new Error('invalid_action');
  // Whitelist each payload; never spread untrusted JSON into actor fields.
  let data: Json = {};
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
