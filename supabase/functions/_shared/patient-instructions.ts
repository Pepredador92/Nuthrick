import { isRecord, matchesCondition } from "./consultation-answers.ts";

// Keep generation below the editable document's capacity, including multiple
// proposals and the professional's own additions. The patient portal uses the
// same document capacity. Never shorten patient text with substring/slice.
export const PATIENT_INSTRUCTION_MAX_LENGTH = 2000;
export const PATIENT_INSTRUCTIONS_DOCUMENT_MAX_LENGTH = 12000;

export const patientInstructionLabels = {
  first_actions: "Indicaciones acordadas",
  patient_instructions: "Indicaciones para el paciente",
  recommendations: "Recomendaciones",
} as const;

export type PatientInstructionKey = keyof typeof patientInstructionLabels;
export const patientInstructionKeys = Object.keys(patientInstructionLabels) as PatientInstructionKey[];

export function isPatientInstructionKey(key: string): key is PatientInstructionKey {
  return Object.hasOwn(patientInstructionLabels, key);
}

export function patientInstructionValue(value: unknown): string {
  return typeof value === "string" ? value.trim()
    : typeof value === "boolean" ? value ? "Sí" : "No"
    : typeof value === "number" && Number.isFinite(value) ? String(value)
    : "";
}

function instructionQuestions(structure: unknown) {
  const questions = new Map<string, Record<string, unknown>>();
  const sections = isRecord(structure) ? structure.sections : undefined;
  if (Array.isArray(sections)) {
    for (const section of sections) {
      if (!isRecord(section) || !Array.isArray(section.questions)) continue;
      for (const question of section.questions) {
        if (isRecord(question) && typeof question.question_key === "string" && isPatientInstructionKey(question.question_key)) {
          questions.set(question.question_key, question);
        }
      }
    }
  }
  return Array.isArray(sections) ? questions : undefined;
}

export function patientInstructionSourceKeys(structure?: unknown): string[] {
  const keys = new Set<string>(patientInstructionKeys);
  const addDependencies = (condition: unknown) => {
    if (!isRecord(condition)) return;
    if (typeof condition.question_key === "string") keys.add(condition.question_key);
    for (const entries of [condition.any, condition.all]) {
      if (Array.isArray(entries)) entries.forEach(addDependencies);
    }
  };
  for (const question of instructionQuestions(structure)?.values() ?? []) addDependencies(question.visibility_condition);
  return [...keys];
}

/** Only these answers from the selected revision can become patient instructions. */
export function patientInstructionEntries(answers: Record<string, unknown>, structure?: unknown) {
  const questions = instructionQuestions(structure);
  return patientInstructionKeys.flatMap(key => {
    const question = questions?.get(key);
    if (questions && !question) return [];
    if (question && !matchesCondition(isRecord(question.visibility_condition) ? question.visibility_condition : null, answers)) return [];
    const value = patientInstructionValue(answers[key]);
    return value ? [{ key, label: patientInstructionLabels[key], value }] : [];
  });
}

export function patientInstructionText(answers: Record<string, unknown>, structure?: unknown): string {
  const entries = patientInstructionEntries(answers, structure);
  if (entries.length === 1) return entries[0].value;
  return entries.map(({ label, value }) => `${label}\n${value}`).join("\n\n");
}
