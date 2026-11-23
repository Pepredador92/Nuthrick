import { followupKeys, objectiveKeys } from './consultationWorkflow';

const clinicalFeatures = ['pes_diagnosis', 'consultation_support', 'intervention_strategy', 'patient_instructions'];
const planAnswers = new Set([
  ...objectiveKeys, ...followupKeys, 'nutrition_assessment', 'first_actions', 'adjustments', 'recommendations', 'patient_instructions',
]);
const draftPrefixes = /^(pes-|objective[-:]|strategy-|instructions-|followup-|suggestions:(objectives|instructions):)/;
const aiSlots = /^(proposal:(batch:|batch-revision:)?|batch-reviewed:|batch-revision-request:|request:|handled:|handled-history:|generation:|destination:)/;

export function isClinicalPlanAnswer(key: string) {
  return key.startsWith('pes_') || planAnswers.has(key);
}

export function isClinicalPlanDraft(key: string) {
  return ['clinical-batch', 'pes', 'strategies'].includes(key) || draftPrefixes.test(key) ||
    (aiSlots.test(key) && clinicalFeatures.includes(key.slice(key.lastIndexOf(':') + 1)));
}

export function clearClinicalPlanSession(id: string, revision: number) {
  try {
    sessionStorage.removeItem(`intervention-drafts:${id}:${revision}`);
    sessionStorage.removeItem(`clinical-pending:${id}:${revision}:intervention_strategy`);
    for (const feature of clinicalFeatures) sessionStorage.removeItem(`clinical-pending:${id}:${feature}`);
    for (const key of objectiveKeys) {
      sessionStorage.removeItem(`objective-draft:${id}:${revision}:${key}`);
      sessionStorage.removeItem(`objective-draft:${id}:${revision}:${key}:editor`);
    }
  } catch { /* The saved revision remains available even without browser storage. */ }
}
