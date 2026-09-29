import { decrypt, encrypt, parseInstant, secretToken, sha256 } from './security.ts';
import { uuid } from './portal-content.ts';
type Json = Record<string, unknown>;
type Dependencies = {
 owner: (request: Request) => Promise<string>;
 call: (action: string, data: Json) => Promise<Json | null>;
 busy: (owner: string, start: string, end: string) => Promise<string | null>;
 key: string;
 site: string;
};
const secret = (value: unknown) => {
 if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new Error('invalid_token');
 return value;
};
/** One boundary for both the secure invitation and the authenticated portal. */
export async function appointmentRequest(req: Request, body: Json, deps: Dependencies) {
 const op = String(body.op);
 if (op === 'appointment_info' || op === 'appointment_confirm') {
  return deps.call(op === 'appointment_info' ? 'info' : 'patient_confirm', { tokenHash: await sha256(secret(body.token)) });
 }
 if (op === 'portal_appointments' || op === 'portal_confirm_appointment') {
  return deps.call(op === 'portal_appointments' ? 'list' : 'patient_confirm', {
   sessionHash: await sha256(secret(body.session)), ...(op === 'portal_confirm_appointment' ? {id:uuid(body.id)} : {}),
  });
 }
 const owner = await deps.owner(req);
 if (op === 'appointment_options') return deps.call('options', { owner });
 if (op === 'appointment_list') return deps.call('list', { owner, ...(body.patientId ? { patientId: uuid(body.patientId) } : {}) });
 if (op === 'appointment_link') {
  const token = secretToken();
  const result = await deps.call('link', { owner, id: uuid(body.id), tokenHash: await sha256(token), encryptedToken: await encrypt(deps.key, token) });
  return { url: `${deps.site}/agenda/confirmar#${await decrypt(deps.key, String(result?.encryptedToken))}`, phone: result?.phone };
 }
 if (op === 'appointment_create') {
  const start = parseInstant(body.start);
  if (!['online','in_person'].includes(String(body.modality))) throw new Error('invalid_option');
  const data = { owner, patientId:uuid(body.patientId), start, modality:body.modality,
   locationId: body.locationId ? uuid(body.locationId) : null,
   allowOutsideSchedule:body.allowOutsideSchedule === true, operationKey:uuid(body.operationKey) };
  const replay = await deps.call('replay_create', data);
  if (replay) return replay;
  const options = await deps.call('options', { owner });
  const end = new Date(Date.parse(start) + Number(options?.duration) * 60000).toISOString();
  return deps.call('create', {...data, busyCheck: await deps.busy(owner, start, end)});
 }
 throw new Error('invalid_action');
}
