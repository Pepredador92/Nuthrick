// Offline fixture for the actual consultation screen. No real patient data or AI calls.
import { initialInterview } from '../../src/features/consultations/interviewTemplate';
import { withWorkflowSections } from '../../src/features/consultations/consultationWorkflow';
export * from '../../src/services/consultations';
export * from '../../src/services/patients';
export * from './clinical-copilot-fixtures';
const followUp = location.search.includes('follow-up');
const consultation = { id: 'demo', patient_id: 'patient', professional_id: 'owner', consultation_type: followUp ? 'follow_up' : 'initial', status: 'draft', consultation_date: '2026-10-12T12:00:00Z', sequence_number: 0 };
const snapshot = { id: 'snapshot', consultation_id: 'demo', patient_id: 'patient', revision: 1, template_id: 'template', template_version: 3, template_name: followUp ? 'Entrevista de seguimiento' : 'Entrevista inicial', structure: withWorkflowSections(followUp ? { consultation_type: 'follow_up', sections: [{ section_key: 'progress', title: 'Cambios desde la última consulta', questions: [{ question_key: 'changes_since_last', label: '¿Qué ha cambiado?', question_type: 'long_text', response_area: 'patient_reported', is_required: false, configuration: {} }] }] } : initialInterview) };
const template = { template: { id: 'template', name: snapshot.template_name, version: 3, consultation_type: consultation.consultation_type, is_system: true }, sections: [], questions: [] };
export const getPatient = async () => ({ id: 'patient', full_name: 'Paciente de demostración', timezone: 'America/Mexico_City' });
export const listConsultations = async () => [consultation];
export const getSnapshot = async () => snapshot;
export const prepareConsultationWorkflow = async () => snapshot;
export const loadTemplateById = async () => template;
export const loadSystemTemplate = async () => template;
export const saveAnswers = async () => undefined;
export const listAnswers = async () => [];
export const useAccess = () => ({ data: null });
