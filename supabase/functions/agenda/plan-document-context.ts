import type { SupabaseClient } from '@supabase/supabase-js';
import type {PlanDocumentContext} from './plan-document.ts';

type Row = Record<string, unknown>;
const row = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const text = (value: unknown, max = 12000) => typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : undefined;
const id = (value: unknown) => typeof value === 'string' && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value) ? value : undefined;
const before = (value: unknown, cutoff: string) => typeof value === 'string' && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.parse(cutoff);
export type DocumentContextRows = {
  patient?: Row | null; consultation?: Row | null; revision?: Row | null;
  answers?: Row[]; portal?: Row | null; sharedPlan?: Row | null;
};

/** Explicit patient-facing fields only; never copy notes, evidence, prompts or draft diagnoses. */
export function projectPlanDocumentContext(raw: unknown, data: DocumentContextRows): PlanDocumentContext {
  const published = row(raw), snapshot = row(published.snapshot), patient = row(snapshot.patient), professional = row(snapshot.professional);
  const consultation = row(snapshot.consultation), plan = row(snapshot.plan), cutoff = text(published.publishedAt, 50);
  const patientId = id(patient.id), owner = id(professional.id), consultationId = id(consultation.id);
  if (!patientId || !owner || !cutoff) return {};
  const context: PlanDocumentContext = { recordReference: patientId, consultationDate: text(consultation.date, 50) };
  const p = row(data.patient);
  if (p.id === patientId && p.professional_id === owner) {
    context.birthDate = text(p.birth_date, 10);
    context.sex = p.equation_sex === 'female' ? 'Femenino' : p.equation_sex === 'male' ? 'Masculino' : undefined;
  }
  const c = row(data.consultation);
  if (!consultationId || c.id !== consultationId || c.patient_id !== patientId || c.professional_id !== owner) return context;
  context.consultationLabel = c.consultation_type === 'initial' ? 'Consulta inicial' : c.consultation_type === 'follow_up' ? `Consulta de seguimiento${Number.isInteger(c.sequence_number) ? ` · ${c.sequence_number}` : ''}` : undefined;
  const s = row(data.revision), records = row(s.clinical_records);
  if (s.consultation_id === consultationId && s.patient_id === patientId && s.professional_id === owner && before(s.created_at, cutoff)) {
    const answers = (data.answers ?? []).filter(a => a.consultation_id === consultationId && a.patient_id === patientId && a.professional_id === owner && a.revision === s.revision && before(a.updated_at, cutoff));
    if (before(row(records.pes).approved_at, cutoff)) context.pes = text(answers.find(a => a.question_key === 'pes_statement')?.value, 2000);
    const objective = row(records.objective);
    if (before(objective.approved_at, cutoff)) context.objective = text(objective.content);
    if (c.status === 'completed' && before(c.completed_at, cutoff)) {
      context.instructions = text(answers.find(a => a.question_key === 'first_actions')?.value);
    }
  }
  // Portal instructions have their own publication date. Include only for the
  // exact currently shared version and a goal explicitly bound to this consultation.
  const sharedPlan = row(data.sharedPlan), sharedSnapshot = row(sharedPlan.snapshot);
  const portal = row(data.portal), shared = row(portal.shared), source = row(shared.goalSource);
  if (portal.enabled === true && id(plan.id) && row(sharedSnapshot.plan).id === plan.id && row(sharedSnapshot.patient).id === patientId && row(sharedSnapshot.professional).id === owner && sharedPlan.versionNumber === published.versionNumber && sharedPlan.publishedAt === published.publishedAt && source.consultationId === consultationId) {
    const instructions = text(shared.instructions), objective = text(shared.goal);
    if (instructions || objective) {
      context.instructions = instructions ?? context.instructions;
      context.objective = objective ?? context.objective;
      context.sharedAt = text(portal.publishedAt, 50);
    }
  }
  return context;
}

/** Called only after patient_portal has authorized the requested published version. */
export async function loadPlanDocumentContext(raw: unknown, db: SupabaseClient): Promise<PlanDocumentContext> {
  const published = row(raw), snapshot = row(published.snapshot);
  const patientId = id(row(snapshot.patient).id), owner = id(row(snapshot.professional).id), consultationId = id(row(snapshot.consultation).id);
  if (!patientId || !owner) return {};
  const result = await db.from('patients').select('id,professional_id,birth_date,equation_sex').eq('id', patientId).eq('professional_id', owner).is('deleted_at', null).maybeSingle();
  if (result.error || !result.data) throw new Error('invalid_plan');
  const data: DocumentContextRows = { patient: result.data };
  if (!consultationId) return projectPlanDocumentContext(raw, data);
  const [consultation, revision, portal, sharedPlan] = await Promise.all([
    db.from('consultations').select('id,professional_id,patient_id,consultation_type,sequence_number,status,completed_at').eq('id', consultationId).eq('professional_id', owner).eq('patient_id', patientId).is('deleted_at', null).maybeSingle(),
    db.from('consultation_snapshots').select('consultation_id,professional_id,patient_id,revision,created_at,clinical_records').eq('consultation_id', consultationId).eq('professional_id', owner).eq('patient_id', patientId).lte('created_at', String(published.publishedAt)).order('revision', {ascending: false}).limit(1).maybeSingle(),
    db.rpc('patient_portal', {p_action: 'view', p_data: {owner, patientId}}),
    db.rpc('patient_portal', {p_action: 'plan', p_data: {owner, patientId}}),
  ]);
  if (consultation.error || revision.error || portal.error || sharedPlan.error) throw new Error('temporarily_unavailable');
  data.consultation = consultation.data; data.revision = revision.data;
  data.portal = portal.data?.error ? null : portal.data;
  data.sharedPlan = sharedPlan.data?.error ? null : sharedPlan.data?.plan;
  if (revision.data) {
    const answers = await db.from('consultation_answers').select('consultation_id,professional_id,patient_id,revision,question_key,value,updated_at').eq('consultation_id', consultationId).eq('professional_id', owner).eq('patient_id', patientId).eq('revision', revision.data.revision).in('question_key', ['pes_statement', 'first_actions']).lte('updated_at', String(published.publishedAt));
    if (answers.error) throw new Error('temporarily_unavailable');
    data.answers = answers.data;
  }
  return projectPlanDocumentContext(raw, data);
}
