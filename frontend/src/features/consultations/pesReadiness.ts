import type { ConsultationSnapshotStructure } from "@/src/types/domain";
import {
  emptyValue,
  isRecord,
  matchesCondition,
  type Answers,
  type Question,
} from "./questionnaire";
import {
  questionModule,
  type ConsultationModule,
} from "./consultationWorkflow";

export type PesContextTarget = {
  module: ConsultationModule;
  questionKey?: string;
  label: string;
  path: string;
  hint?: string;
};
export type PesContextField = { target: PesContextTarget; recorded: boolean };
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const questionsOf = (structure: ConsultationSnapshotStructure) =>
  structure.sections.flatMap((section) =>
    section.questions.map((question) => ({ question, section })),
  );

function conditionKeys(condition: unknown): string[] {
  if (!isRecord(condition)) return [];
  return [
    ...(typeof condition.question_key === "string"
      ? [condition.question_key]
      : []),
    ...["any", "all"].flatMap((key) =>
      Array.isArray(condition[key])
        ? condition[key].flatMap(conditionKeys)
        : [],
    ),
  ];
}

/** Resolve against the saved design. A hidden dependent field leads to its
 * visible controlling question; navigation never changes a clinical answer. */
export function pesFieldTarget(
  structure: ConsultationSnapshotStructure,
  answers: Answers,
  key: string,
): PesContextTarget | null {
  const questions = questionsOf(structure);
  const requested = questions.find(
    (item) => item.question.question_key === key,
  );
  if (!requested) return null;
  let resolved = requested;
  const seen = new Set<string>();
  while (!matchesCondition(resolved.question.visibility_condition, answers)) {
    seen.add(resolved.question.question_key);
    const parent = conditionKeys(resolved.question.visibility_condition)
      .map((parentKey) =>
        questions.find((item) => item.question.question_key === parentKey),
      )
      .find((item) => item && !seen.has(item.question.question_key));
    if (!parent) return null;
    resolved = parent;
  }
  const destination = questionModule(resolved.question.question_key);
  return {
    module: destination,
    questionKey: resolved.question.question_key,
    label: requested.question.label,
    path: `${destination === "interview" ? "Entrevista" : destination === "recall" ? "Recordatorio de 24 horas" : "Revisión clínica"} → ${resolved.section.title} → ${resolved.question.label}`,
    ...(resolved !== requested
      ? {
          hint: `Revisa «${resolved.question.label}». Según tu respuesta se mostrará «${requested.question.label}».`,
        }
      : {}),
  };
}

type Topic = { match: RegExp; keys: string[]; labels: RegExp };
const topics: Topic[] = [
  {
    match: /evacu|estren|heces|deposici/,
    keys: ["bowel_frequency"],
    labels: /frecuencia.*(evacua|deposici)/,
  },
  {
    match:
      /sintoma|desde cuando|duracion|frecuencia|estren|heces|dolor|esfuerzo|nausea|vomito|diarrea|plenitud|saciedad/,
    keys: ["symptom_details_v2", "symptom_detail", "symptoms_changes"],
    labels: /caracterizar.*sintoma|detalle.*sintoma|cambio.*sintoma/,
  },
  {
    match: /medicamento|farmaco|tratamiento/,
    keys: ["medication_list_v2", "medical_changes", "medication_status"],
    labels: /medicamentos actuales|cambios.*medic|usa medicamentos/,
  },
  {
    match: /suplement/,
    keys: ["supplement_list_v2", "supplement_types"],
    labels: /suplementos|productos utilizados/,
  },
  {
    match: /fibra|verdura|fruta|legumino|integral|frecuencia.*alimento/,
    keys: ["food_frequency_v2", "usual_meals", "usual_pattern"],
    labels:
      /frecuencia.*grupo|alimentacion habitual|horarios y opciones habituales/,
  },
  {
    match: /liquido|agua|hidrat|bebida/,
    keys: ["daily_drinks", "food_frequency_v2"],
    labels: /cantidad.*liquidos|consumo.*agua|hidratacion/,
  },
  {
    match: /ingesta|comida|alimenta|porcion|cantidad|horario/,
    keys: ["usual_meals", "usual_pattern", "daily_schedule"],
    labels: /horarios y opciones habituales|patron.*habitual|tiempos de comida/,
  },
  {
    match:
      /barrera|organiza|tiempo.*(comer|comprar)|disponibilidad|acceso|prepar/,
    keys: [
      "schedule_constraints",
      "access_barriers",
      "barriers",
      "cooking_time",
    ],
    labels: /barreras|limitaciones.*horario|tiempo.*preparar/,
  },
  {
    match: /emocion|ansiedad|estres|culpa/,
    keys: ["eating_drivers", "food_relationship", "stress_level"],
    labels: /emociones|relacion.*aliment|estres/,
  },
  {
    match: /sueno|dormir|descanso/,
    keys: ["sleep_hours", "sleep_continuity"],
    labels: /horas.*sueno|continuidad.*sueno/,
  },
  {
    match: /actividad|ejercicio|sedentar/,
    keys: ["daily_activity", "exercise_status"],
    labels: /actividad cotidiana|ejercicio/,
  },
  {
    match: /antecedente|diagnostico|enfermedad/,
    keys: ["medical_diagnoses_v2", "medical_changes", "medical_history_status"],
    labels: /diagnosticos|antecedentes.*medic/,
  },
];

function findQuestion(
  structure: ConsultationSnapshotStructure,
  keys: string[],
  labels: RegExp,
): Question | undefined {
  const questions = questionsOf(structure)
    .map((item) => item.question)
    .filter(
      (question) => questionModule(question.question_key) === "interview",
    );
  return (
    keys
      .map((key) => questions.find((question) => question.question_key === key))
      .find(Boolean) ??
    questions.find((question) => labels.test(normalize(question.label)))
  );
}

/** This routes the model's questions; it does not declare causal evidence valid
 * or mark an AI question resolved merely because a field is nonempty. */
export function pesGapTargets(
  text: string,
  structure: ConsultationSnapshotStructure,
  answers: Answers,
): PesContextField[] {
  const targets: PesContextField[] = [];
  for (const topic of topics) {
    if (!topic.match.test(normalize(text))) continue;
    const question = findQuestion(structure, topic.keys, topic.labels);
    if (!question) continue;
    const target = pesFieldTarget(structure, answers, question.question_key);
    if (
      target &&
      !targets.some((item) => item.target.questionKey === target.questionKey)
    ) {
      targets.push({
        target,
        recorded: !emptyValue(answers[question.question_key]),
      });
    }
  }
  if (
    /recordatorio|registro.*aliment|dia.*(laboral|no laboral)/.test(
      normalize(text),
    )
  ) {
    targets.push({
      target: {
        module: "recall",
        label: "Alimentación del día",
        path: "Recordatorio de 24 horas",
      },
      recorded: false,
    });
  }
  if (
    /medici|peso|estatura|imc|grasa corporal|antropometr/.test(
      normalize(text),
    ) &&
    !/medicamento/.test(normalize(text))
  ) {
    targets.push({
      target: {
        module: "measurements",
        label: "Mediciones",
        path: "Mediciones",
      },
      recorded: false,
    });
  }
  if (/laboratorio|bioquim|analisis|estudio/.test(normalize(text))) {
    targets.push({
      target: {
        module: "laboratories",
        label: "Estudios registrados",
        path: "Laboratorios",
      },
      recorded: false,
    });
  }
  return targets;
}

export function pesSuggestedFields(
  structure: ConsultationSnapshotStructure,
  answers: Answers,
): PesContextField[] {
  const groups: [string[], RegExp][] = [
    [["main_reason", "changes_since_last"], /motivo.*consulta|cambios.*ultima/],
    [
      ["medical_history_status", "medical_changes"],
      /antecedentes.*medic|cambios.*salud/,
    ],
    [["medication_status"], /usa medicamentos/],
    [
      ["usual_pattern", "adherence"],
      /tiempos de comida|alimentacion habitual|adherencia/,
    ],
  ];
  if (
    ["digestive_screen", "general_symptoms", "symptoms_changes"].some(
      (key) =>
        !emptyValue(answers[key]) &&
        !/^(ningun|no |sin )/.test(normalize(String(answers[key]))),
    )
  ) {
    groups.push([
      ["symptom_details_v2", "symptom_detail", "symptoms_changes"],
      /caracterizar.*sintoma|detalle.*sintoma/,
    ]);
  }
  return groups.flatMap(([keys, labels]) => {
    const question = findQuestion(structure, keys, labels);
    const target =
      question && pesFieldTarget(structure, answers, question.question_key);
    return question && target
      ? [{ target, recorded: !emptyValue(answers[question.question_key]) }]
      : [];
  });
}
