import type { ConsultationSnapshotStructure } from "@/src/types/domain";
import { emptyValue, isRecord, matchesCondition } from "../../../../supabase/functions/_shared/consultation-answers";
import { isPatientInstructionKey, PATIENT_INSTRUCTIONS_DOCUMENT_MAX_LENGTH } from "../../../../supabase/functions/_shared/patient-instructions";
export { emptyValue, isRecord, matchesCondition };

export type Answers = Record<string, unknown>;
export type Question =
  ConsultationSnapshotStructure["sections"][number]["questions"][number];

/** Older snapshots keep their original configuration. Give the instruction
 * editor room for several complete proposals without rewriting that history. */
export function questionTextMaxLength(question: Question): number {
  const configured = typeof question.configuration.max_length === 'number'
    ? question.configuration.max_length : 2000;
  return question.question_type === 'long_text' &&
      isPatientInstructionKey(question.question_key)
    ? Math.max(configured, PATIENT_INSTRUCTIONS_DOCUMENT_MAX_LENGTH)
    : configured;
}
export type RepeatableField = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "time" | "select";
  options?: string[];
  required?: boolean;
  min?: number;
  max?: number;
  detail?: boolean;
  placeholder?: string;
};
export const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
export const inputValue = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";
export function toggleChoice(
  selected: string[],
  option: string,
  exclusive: string[],
): string[] {
  if (selected.includes(option))
    return selected.filter((item) => item !== option);
  if (exclusive.includes(option)) return [option];
  return [...selected.filter((item) => !exclusive.includes(item)), option];
}

/** Fail visibly when an option edit would strand a dependent question. */
export function templateQuestionErrors(questions: Question[]): string[] {
  const errors: string[] = [];
  const byKey = new Map(
    questions.map((question) => [question.question_key, question]),
  );
  const checkCondition = (
    condition: Record<string, unknown>,
    label: string,
  ) => {
    for (const group of ["all", "any"]) {
      if (Array.isArray(condition[group]))
        for (const child of condition[group])
          if (isRecord(child)) checkCondition(child, label);
    }
    if (typeof condition.question_key !== "string") return;
    const parent = byKey.get(condition.question_key);
    if (!parent) {
      errors.push(`${label}: falta la pregunta de la que depende.`);
      return;
    }
    const expected =
      "equals" in condition
        ? [condition.equals]
        : "contains" in condition
          ? [condition.contains]
          : Array.isArray(condition.in)
            ? condition.in
            : [];
    const valid = expected.every((value) =>
      parent.question_type === "boolean"
        ? typeof value === "boolean"
        : ["select", "multi_select"].includes(parent.question_type)
          ? stringList(parent.configuration.options).includes(String(value))
          : true,
    );
    if (!valid)
      errors.push(
        `${label}: una opción de “${parent.label}” usada por esta condición cambió. Conserva esa opción para mantener la pregunta condicional.`,
      );
  };
  const checkOptions = (options: string[], label: string) => {
    if (
      options.length < 2 ||
      options.some((option) => !option.trim()) ||
      new Set(options).size !== options.length
    )
      errors.push(
        `${label}: usa al menos dos opciones distintas, sin líneas vacías.`,
      );
  };
  for (const question of questions) {
    if (
      ["select", "multi_select"].includes(question.question_type) ||
      question.configuration.widget === "frequency_grid"
    )
      checkOptions(stringList(question.configuration.options), question.label);
    if (question.question_type === "repeatable_group")
      for (const field of repeatableFields(question.configuration)) {
        if (!field.label.trim())
          errors.push(`${question.label}: hay un campo sin etiqueta.`);
        if (field.type === "select")
          checkOptions(
            field.options ?? [],
            `${question.label} · ${field.label}`,
          );
      }
    if (question.visibility_condition)
      checkCondition(question.visibility_condition, question.label);
  }
  return errors;
}

export function repeatableFields(
  configuration: Record<string, unknown>,
): RepeatableField[] {
  if (!Array.isArray(configuration.fields)) return [];
  return configuration.fields.flatMap<RepeatableField>((item) => {
    if (typeof item === "string")
      return [
        { key: item, label: item.replaceAll("_", " "), type: "text" as const },
      ];
    if (!isRecord(item) || typeof item.key !== "string") return [];
    return [
      {
        key: item.key,
        label: typeof item.label === "string" ? item.label : item.key,
        type: ["number", "date", "time", "select"].includes(String(item.type))
          ? (item.type as RepeatableField["type"])
          : "text",
        options: stringList(item.options),
        required: item.required === true,
        detail: item.detail === true,
        min: typeof item.min === "number" ? item.min : undefined,
        max: typeof item.max === "number" ? item.max : undefined,
        placeholder:
          typeof item.placeholder === "string" ? item.placeholder : undefined,
      },
    ];
  });
}

export function formatAnswer(question: Question, value: unknown): string {
  if (emptyValue(value)) return "Sin registrar";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (question.configuration.widget === "frequency_grid" && isRecord(value))
    return Object.entries(value)
      .filter(([, frequency]) => !emptyValue(frequency))
      .map(([group, frequency]) => `${group}: ${inputValue(frequency)}`)
      .join("\n");
  if (Array.isArray(value)) {
    const fields = repeatableFields(question.configuration);
    return value
      .filter((item) => !emptyValue(item))
      .map((item, index) => {
        if (!isRecord(item)) return inputValue(item);
        const entries = Object.entries(item).filter(
          ([, entry]) => !emptyValue(entry),
        );
        return `${index + 1}. ${entries.map(([key, entry]) => `${fields.find((field) => field.key === key)?.label ?? key.replaceAll("_", " ")}: ${inputValue(entry)}`).join(" · ")}`;
      })
      .join("\n");
  }
  return inputValue(value);
}

type QuestionIssue = { kind: "missing" | "invalid"; message: string };

function questionIssues(question: Question, value: unknown): QuestionIssue[] {
  if (emptyValue(value))
    return question.is_required ? [{ kind: "missing", message: "Falta responder." }] : [];
  const issues: QuestionIssue[] = [];
  if (question.question_type === "repeatable_group" && Array.isArray(value)) {
    const fields = repeatableFields(question.configuration);
    value.forEach((row, index) => {
      if (!isRecord(row) || emptyValue(row)) return;
      for (const field of fields) {
        if (field.required && emptyValue(row[field.key]))
          issues.push({ kind: "missing", message: `Registro ${index + 1}: falta ${field.label.toLowerCase()}.` });
        if (field.type === "number" && !emptyValue(row[field.key])) {
          const n = Number(row[field.key]);
          if (
            !Number.isFinite(n) ||
            (field.min !== undefined && n < field.min) ||
            (field.max !== undefined && n > field.max)
          )
            issues.push({ kind: "invalid", message: `Registro ${index + 1}: revisa ${field.label.toLowerCase()}.` });
        }
      }
    });
  }
  if (question.question_type === "number") {
    const n = Number(value),
      min = question.configuration.min,
      max = question.configuration.max;
    if (
      !Number.isFinite(n) ||
      (typeof min === "number" && n < min) ||
      (typeof max === "number" && n > max)
    )
      issues.push({ kind: "invalid", message: "Revisa el valor y el rango permitido." });
  }
  return issues;
}

export function questionErrors(question: Question, value: unknown): string[] {
  return questionIssues(question, value).map(issue => issue.message);
}

export function consultationCloseFields(
  sections: ConsultationSnapshotStructure["sections"],
  values: Answers,
  editing?: ReadonlySet<string>,
) {
  return sections.flatMap(section => {
    const fields = section.questions.flatMap(question => {
      const key = question.question_key;
      if (!matchesCondition(question.visibility_condition, values)) return [];
      const issues = questionIssues(question, values[key]);
      return issues.length || editing?.has(key) ? [{ question, issues }] : [];
    });
    return fields.length ? [{ key: section.section_key, title: section.title, fields }] : [];
  });
}

export function sectionProgress(
  section: ConsultationSnapshotStructure["sections"][number],
  values: Answers,
) {
  const visible = section.questions.filter((question) =>
    matchesCondition(question.visibility_condition, values),
  );
  const answered = visible.filter(
    (question) => !emptyValue(values[question.question_key]),
  ).length;
  return { answered, total: visible.length };
}

export function createInterviewSummary(
  structure: ConsultationSnapshotStructure,
  values: Answers,
): string {
  return structure.sections
    .flatMap((section) => {
      const items = section.questions.filter(
        (question) =>
          matchesCondition(question.visibility_condition, values) &&
          !emptyValue(values[question.question_key]),
      );
      if (!items.length) return [];
      return [
        `${section.title}\n${items.map((question) => `${question.response_area === "professional_assessment" ? "Profesional" : "Referido"} · ${question.label}: ${formatAnswer(question, values[question.question_key])}`).join("\n")}`,
      ];
    })
    .join("\n\n");
}

/** Queue writes: a slow, older autosave must never overwrite a newer answer set. */
export function createSaveQueue() {
  let tail: Promise<void> = Promise.resolve();
  return (write: () => Promise<void>) => {
    const next = tail.catch(() => undefined).then(write);
    tail = next;
    return next;
  };
}
