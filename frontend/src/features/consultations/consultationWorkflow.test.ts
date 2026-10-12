import { describe, expect, it } from 'vitest';
import { initialInterview } from './interviewTemplate';
import { withWorkflowSections, workflowSections } from './consultationWorkflow';
import type { ConsultationSnapshotStructure } from '@/src/types/domain';

describe('independent consultation steps', () => {
  it('moves the recall and clinical questions without changing a customized design or its answer keys', () => {
    const source = structuredClone(initialInterview);
    source.sections[0].questions[0].label = 'Mi pregunta personalizada';
    const prepared = withWorkflowSections(source);
    const modules = ['interview', 'recall', 'clinical'] as const;
    const questions = modules.flatMap(module => workflowSections(prepared, module).flatMap(section => section.questions));
    expect(questions).toHaveLength(prepared.sections.flatMap(section => section.questions).length);
    expect(new Set(questions.map(question => question.question_key)).size).toBe(questions.length);
    expect(workflowSections(prepared, 'interview').flatMap(section => section.questions).some(question => question.question_key.startsWith('recall_'))).toBe(false);
    expect(workflowSections(prepared, 'recall')[0].questions.find(question => question.question_key === 'recall_24h_v2')).toEqual(source.sections.find(section => section.section_key === 'recall')!.questions.find(question => question.question_key === 'recall_24h_v2'));
    expect(source.sections[0].questions[0].label).toBe('Mi pregunta personalizada');
    expect(withWorkflowSections(prepared)).toEqual(prepared);
  });

  it('provides recall and PES to follow-ups with an optional text objective when the design has none', () => {
    const source: ConsultationSnapshotStructure = { consultation_type: 'follow_up', sections: [] };
    const prepared = withWorkflowSections(source);
    const fields = prepared.sections.flatMap(section => section.questions);
    expect(fields.some(field => field.question_key === 'recall_24h_v2')).toBe(true);
    expect(fields.find(field => field.question_key === 'next_objectives')).toMatchObject({ question_type: 'long_text', is_required: false });
    expect(fields.some(field => field.question_key === 'pes_statement')).toBe(true);
    expect(source.sections).toEqual([]);
  });
});
