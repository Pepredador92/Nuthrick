// In-memory visual fixtures. No Supabase, Gmail, patient records or network writes.
import type { PortalView, PortalContent, PortalMessage, PortalNote } from '../../src/services/patientPortal';
const cid = '20000000-0000-0000-0000-000000000001';
const plan = {title:'Mi semana de alimentación',versionNumber:2,publishedAt:'2026-09-21',days:[{name:'Lunes',meals:[{name:'Desayuno',time:'08:00',title:'Huevos con frijoles y tortilla',ingredients:[{name:'Huevo entero',amount:2,unit:'pieza',alternatives:[{name:'Pollo cocido',amount:60,unit:'g'},{name:'Pescado cocido',amount:60,unit:'g'}]},{name:'Tortilla de maíz',amount:2,unit:'tortilla',alternatives:[]},{name:'Frijoles cocidos',amount:0.5,unit:'taza',alternatives:[]},{name:'Plátano',amount:0.5,unit:'pieza',alternatives:[]},{name:'Agua natural',amount:240,unit:'ml',alternatives:[]}],instructions:['Cocina los huevos y acompaña con frijoles y tortillas. Sirve la fruta y el agua al lado.']}]}]};
let selectedPlanId: string|null = 'plan-fixture';
const shared: PortalContent = {
  goal: 'Construir una rutina de alimentación que se adapte a mis horarios y me ayude a sentirme con más energía.',
  instructions: 'Mantén tus tres comidas principales y lleva una colación cuando tengas una jornada larga.\n\nIncluye verduras en comida y cena. Ten agua a la mano durante el día.\n\nEn nuestra próxima consulta revisaremos cómo te sentiste con estos cambios.',
  results: [
    { id: 'weight', label: 'Peso', unit: 'kg', method: 'Medición antropométrica', points: [{ consultationId: cid, date: '2026-09-01', value: '72.4' }, { consultationId: cid, date: '2026-09-15', value: '71.8' }] },
    { id: 'waist', label: 'Cintura', unit: 'cm', method: 'Medición antropométrica', points: [{ consultationId: cid, date: '2026-09-01', value: '84' }, { consultationId: cid, date: '2026-09-15', value: '82' }] },
  ],
  consultations: [{ id: cid, date: '2026-09-15', title: 'Consulta de seguimiento', summary: 'Revisamos tu rutina y ajustamos los horarios de tus comidas. Para la próxima visita, anota qué cambios te resultaron más cómodos.' }],
};
const view: PortalView = { patientName: 'Valeria Torres', professional: { name: 'Andrea Ríos', title: 'Licenciada en Nutrición' }, shared, revision: 1, publishedAt: '2026-09-15', unread: 1, enabled: true, link: 'x'.repeat(43), expiresAt: '2026-12-15' };
const messages: PortalMessage[] = [{ id: 'm1', sender: 'professional', body: 'Hola, Valeria. Ya puedes revisar tus indicaciones. Si surge alguna duda, puedes escribirme por aquí.', created_at: '2026-09-16T16:00:00Z' }];
let notes: PortalNote[] = [{ id: 'n1', body: 'Preguntar qué colaciones puedo llevar los días que salgo tarde del trabajo.', done: false, updated_at: '2026-09-16' }];
export class PortalError extends Error { code = 'portal_unavailable'; }
export function portalLink(link: string) { return `https://example.invalid/mi-espacio#${link}`; }
export async function portalApi(op: string, data: Record<string, unknown>) {
  if (op === 'portal_code') return { id: 'fixture-challenge' };
  if (op === 'portal_verify' || op === 'portal_verify_professional') { if (data.code !== (op==='portal_verify'?'123456':'12345678')) throw new Error('Código de prueba incorrecto.'); return { session: 'fixture-session', expiresAt: new Date(Date.now()+7200000).toISOString() }; }
  return {};
}
export async function portalAction(access: Record<string, unknown>, action: string, data: Record<string, unknown> = {}) {
  if(action==='goal_candidates')return {goals:[{consultationId:cid,date:'2026-09-21',revision:1,questionKey:'objectives',content:'Organizar mis horarios de alimentación.'}]};
  if(action==='plan_history')return {plans:[{id:'version-fixture',title:plan.title,version_number:2,published_at:plan.publishedAt}],hasMore:false};
  if(action==='plan_version')return {plan};
  if(action==='export_plan')throw new Error('La maqueta no genera documentos clínicos.');
  if(action==='plan_options')return {plans:[{id:'plan-fixture',title:plan.title,version_number:2,published_at:plan.publishedAt}],selectedPlanId};
  if(action==='plan_preview')return {plan};
  if(action==='plan')return {plan:selectedPlanId?plan:null};
  if(action==='share_plan'){selectedPlanId=data.planId as string|null;return {ok:true};}
  if(action==='issue_code')return {code:'12345678',expiresAt:new Date(Date.now()+600000).toISOString()};
  if (action === 'view') return { ...view, unread: messages.some(m => m.sender === 'professional') ? 1 : 0 };
  if (action === 'messages') {
    const after = data.after as { id: string } | undefined;
    return { messages: after ? messages.slice(messages.findIndex(m => m.id === after.id)+1) : [...messages], before: null };
  }
  if (action === 'message') { messages.push({ id: crypto.randomUUID(), sender: access.patientId ? 'professional' : 'patient', body: String(data.body), created_at: new Date().toISOString() }); }
  if (action === 'notes') return { notes: [...notes] };
  if (action === 'note') { const note = { id: String(data.id), body: String(data.body), done: data.done === true, updated_at: new Date().toISOString() }; notes = [...notes.filter(n => n.id !== data.id), note]; }
  if (action === 'delete_note') notes = notes.filter(n => n.id !== data.id);
  if (action === 'publish') { view.shared = data.shared as PortalContent; view.revision++; }
  if (action === 'link') view.enabled = true;
  if (action === 'revoke') view.enabled = false;
  return { ok: true };
}
export async function getPatient() { return { email: 'valeria@example.invalid' }; }
export async function loadLongitudinalHistory() { return {
  consultations: [{ id: cid, status: 'completed', consultation_type: 'follow_up', sequence_number: 2, consultation_date: '2026-09-15', summary: 'Never share this private field.' }],
  series: shared.results.map(r => ({ ...r, method: r.method, category: 'measurements', catalogCategory: 'Mediciones básicas', points: r.points.map(p => ({ consultation_id: p.consultationId, consultation_date: p.date, display_value: p.value })) })),
}; }
