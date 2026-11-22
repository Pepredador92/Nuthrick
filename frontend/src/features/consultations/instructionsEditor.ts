import {
  isPatientInstructionKey,
  patientInstructionLabels,
  patientInstructionValue,
  type PatientInstructionKey,
} from "../../../../supabase/functions/_shared/patient-instructions";
import type { Question } from "./questionnaire";

export type InstructionField = { key: PatientInstructionKey; title: string };

export function instructionEditorFields(questions: Question[]): InstructionField[] {
  return questions.flatMap(question => {
    const key = question.question_key;
    if (!isPatientInstructionKey(key) || !["long_text", "short_text"].includes(question.question_type)) return [];
    const title = question.label.trim().replace(/\s+/g, ' ') || patientInstructionLabels[key];
    return [{ key, title: questions.filter(item => item.label.trim().replace(/\s+/g, ' ') === title).length > 1
      ? `${title} (${patientInstructionLabels[key]})` : title }];
  });
}

function instructionHeading(field: InstructionField) {
  return `## ${field.title}`;
}

export function formatInstructionsEditor(fields: InstructionField[], values: Record<string, unknown>): string {
  if (fields.length === 1) return patientInstructionValue(values[fields[0].key]);
  const headings = new Set(fields.map(instructionHeading));
  return fields.map(field => {
    const value = patientInstructionValue(values[field.key]).split("\n")
      .map(line => headings.has(line.trimStart()) ? ` ${line}` : line).join("\n");
    return `${instructionHeading(field)}\n${value}`;
  }).join("\n\n");
}

export function parseInstructionsEditor(fields: InstructionField[], text: string): { values: Partial<Record<PatientInstructionKey, string>> } | { issue: string } {
  if (fields.length === 1) return { values: { [fields[0].key]: text.trim() } };
  const headings = new Map(fields.map(field => [instructionHeading(field), field.key]));
  const sections = new Map<PatientInstructionKey, string[]>();
  let current: string[] | undefined;
  const issue = "Conserva los encabezados del guion y escribe debajo del apartado correspondiente.";
  for (const raw of text.split(/\r?\n/u)) {
    const key = headings.get(raw.trimEnd());
    if (key) {
      if (sections.has(key)) return { issue };
      current = [];
      sections.set(key, current);
    } else if (current) {
      current.push(raw.startsWith(" ") && headings.has(raw.trimStart()) ? raw.slice(1) : raw);
    } else if (raw.trim()) return { issue };
  }
  if (sections.size !== fields.length) return { issue };
  return { values: Object.fromEntries(Array.from(sections, ([key, lines]) => [key, lines.join("\n").trim()])) };
}
