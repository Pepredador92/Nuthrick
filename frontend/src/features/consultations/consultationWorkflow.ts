import type { ConsultationSnapshotStructure } from '@/src/types/domain';
import { initialInterview } from './interviewTemplate';

type Section = ConsultationSnapshotStructure['sections'][number];
export type ConsultationModule = 'interview' | 'recall' | 'measurements' | 'laboratories' | 'clinical' | 'evolution';
export const consultationSteps: { key: ConsultationModule; label: string }[] = [
  { key: 'interview', label: 'Entrevista' },
  { key: 'recall', label: 'Recordatorio de 24 horas' },
  { key: 'measurements', label: 'Mediciones' },
  { key: 'laboratories', label: 'Laboratorios' },
  { key: 'clinical', label: 'Revisión clínica, PES y objetivos' },
  { key: 'evolution', label: 'Evolución' },
];
export const objectiveKeys = ['objectives', 'treatment_objective', 'next_objectives'];
const clinicalKeys = new Set([...objectiveKeys, 'nutrition_assessment', 'clinical_notes', 'first_actions', 'adjustments', 'professional_notes', 'recommendations', 'patient_instructions', 'next_appointment', 'measurement_notes', 'indicator_progress']);

export function questionModule(key: string): 'interview' | 'recall' | 'clinical' {
  if (key.startsWith('recall_')) return 'recall';
  if (key.startsWith('pes_') || clinicalKeys.has(key)) return 'clinical';
  return 'interview';
}

/** Presentation only: preserve every saved question, label, condition and answer key. */
export function workflowSections(structure: ConsultationSnapshotStructure, module: 'interview' | 'recall' | 'clinical') {
  return structure.sections.flatMap(section => {
    const questions = section.questions.filter(question => questionModule(question.question_key) === module);
    return questions.length ? [{ ...section, questions }] : [];
  });
}

const question = (question_key: string, label: string): Section['questions'][number] => ({
  question_key, label, question_type: 'long_text', response_area: 'professional_assessment',
  configuration: { max_length: 2000 }, is_required: false,
});

/** Also serialized into the database migration; used for previews and compatibility tests. */
export function defaultWorkflowSections(type: ConsultationSnapshotStructure['consultation_type']): Section[] {
  return [
    structuredClone(initialInterview.sections.find(section => section.section_key === 'recall')!),
    { section_key: 'workflow_pes', title: 'Diagnóstico PES', questions: [
      question('pes_problem', 'Problema nutricional'), question('pes_etiology', 'Etiología'),
      question('pes_evidence', 'Signos y síntomas'), question('pes_statement', 'Redacción PES'),
    ] },
    { section_key: 'workflow_objective', title: 'Objetivos acordados', questions: [
      question(type === 'follow_up' ? 'next_objectives' : 'treatment_objective', 'Objetivo acordado con el paciente'),
    ] },
    { section_key: 'workflow_recommendations', title: 'Recomendaciones y seguimiento', questions: [
      question('first_actions', 'Indicaciones acordadas con el paciente'),
    ] },
  ];
}

/** Add optional workspace fields only where a draft's design does not provide them. */
export function withWorkflowSections(structure: ConsultationSnapshotStructure) {
  const keys = new Set(structure.sections.flatMap(section => section.questions.map(question => question.question_key)));
  const sectionKeys = new Set(structure.sections.map(section => section.section_key));
  const additions = defaultWorkflowSections(structure.consultation_type).flatMap(section => {
    const questions = section.questions.filter(question => !keys.has(question.question_key) &&
      !(objectiveKeys.includes(question.question_key) && objectiveKeys.some(key => keys.has(key))));
    if (!questions.length) return [];
    let sectionKey = `workflow_${section.section_key}`;
    while (sectionKeys.has(sectionKey)) sectionKey += '_extra';
    sectionKeys.add(sectionKey);
    return [{ ...section, section_key: sectionKey, questions }];
  });
  return { ...structure, sections: [...structure.sections, ...additions] };
}
