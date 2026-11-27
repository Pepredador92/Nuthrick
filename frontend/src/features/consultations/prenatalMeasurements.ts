export const prenatalOptionalFields = {
  arm: "Circunferencia media del brazo",
  blood_pressure: "Presión arterial",
  edema: "Edema",
  previous_weight: "Peso anterior del mismo embarazo",
} as const;

export type PrenatalOptionalField = keyof typeof prenatalOptionalFields;
export const defaultPrenatalOptionalFields = Object.keys(prenatalOptionalFields) as PrenatalOptionalField[];
export type PhysicalActivity = "inactive" | "low_active" | "active" | "very_active";
export type PregnancyType = "single" | "multiple";
export type WeightSource = "documented" | "reported" | "estimated" | "unspecified";
export type ClinicalRange = readonly [number, number];
export const maxReferenceGestation = 42 * 7 + 6;

export const activityOptions: Record<PhysicalActivity, string> = {
  inactive: "Inactiva",
  low_active: "Poco activa",
  active: "Activa",
  very_active: "Muy activa",
};

export const weightSourceOptions: Record<WeightSource, string> = {
  documented: "Registro previo",
  reported: "Referido por la paciente",
  estimated: "Estimado a partir de un registro temprano",
  unspecified: "Origen sin verificar",
};

const weightReferences = [
  { label: "Bajo peso", maxBmi: 18.5, total: [12.5, 18], rate: [0.44, 0.58], energy: 300 },
  { label: "Normopeso", maxBmi: 25, total: [11.5, 16], rate: [0.35, 0.5], energy: 200 },
  { label: "Sobrepeso", maxBmi: 30, total: [7, 11.5], rate: [0.23, 0.33], energy: 150 },
  { label: "Obesidad", maxBmi: Infinity, total: [5, 9], rate: [0.17, 0.27], energy: -50 },
] as const;

const energyCoefficients = {
  inactive: [1131.2, 0.34, 12.15],
  low_active: [693.35, 5.73, 10.2],
  active: [-223.84, 13.23, 8.15],
  very_active: [-779.72, 18.45, 8.73],
} satisfies Record<PhysicalActivity, number[]>;

export const iomReferenceUrl = "https://nap.nationalacademies.org/resource/12584/Resource-Page---Weight-Gain-During-Pregnancy.pdf";
export const driReferenceUrl = "https://www.nationalacademies.org/read/26818/chapter/7#1003";

export function clinicalNumber(value: unknown, min: number, max: number) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\d+(?:[,.]\d+)?$/.test(value.trim())) return null;
  const parsed = Number(typeof value === "string" ? value.trim().replace(",", ".") : value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export function gestationalAge(weeks: unknown, days: unknown) {
  const completedWeeks = clinicalNumber(weeks, 1, 43);
  const addedDays = clinicalNumber(days, 0, 6);
  if (completedWeeks === null || !Number.isInteger(completedWeeks)
    || (days !== null && days !== undefined && days !== "" && !Number.isInteger(addedDays))) return null;
  return completedWeeks * 7 + (addedDays ?? 0);
}

function normalizedAnswer(value: unknown) {
  return typeof value === "string" ? value.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase() : "";
}

export function extractPrenatalInterview(answers: Readonly<Record<string, unknown>>) {
  const typeAnswer = normalizedAnswer(answers.prenatal_type);
  const sourceAnswer = normalizedAnswer(answers.prenatal_weight_source);
  const source: WeightSource | null = /estimad|tempran|primeras semanas|primer control prenatal/.test(sourceAnswer) ? "estimated"
    : /referid|recuerd/.test(sourceAnswer) && !/no (lo )?(recuerda|referido)/.test(sourceAnswer) ? "reported"
    : /medid|document|registro|expediente/.test(sourceAnswer) ? "documented" : null;
  const type: PregnancyType | null = /multiple|gemelar/.test(typeAnswer) ? "multiple" : /unic/.test(typeAnswer) ? "single" : null;
  return {
    weeks: clinicalNumber(answers.prenatal_weeks, 1, 43),
    days: clinicalNumber(answers.prenatal_days, 0, 6),
    type,
    preWeight: source ? clinicalNumber(answers.prenatal_weight_kg, 0.1, 1000) : null,
    source,
    typePending: typeAnswer === "por confirmar",
    gestationPending: normalizedAnswer(answers.life_stage) === "por confirmar",
  };
}

/** Linear approximation of IOM 2009 trimester gain and rates. */
export function expectedGain(days: number, rate: ClinicalRange): ClinicalRange | null {
  if (days < 13 * 7 || days > maxReferenceGestation) return null;
  const elapsed = days / 7 - 13;
  return [0.5 + elapsed * rate[0], 2 + elapsed * rate[1]];
}

export function evaluatePrenatalMeasurements(input: {
  age: number | null;
  height: number | null;
  preWeight: number | null;
  weight: number | null;
  days: number | null;
  type: PregnancyType | null;
  activity: PhysicalActivity | null;
}) {
  const { age, height, preWeight, weight, days, type, activity } = input;
  const bmi = preWeight && height ? preWeight / (height / 100) ** 2 : null;
  const category = bmi !== null && age !== null && age >= 18 ? weightReferences.find((entry) => bmi < entry.maxBmi) ?? null : null;
  const reference = type === "single" ? category : null;
  const gain = preWeight !== null && weight !== null ? weight - preWeight : null;
  const range = reference && days !== null ? expectedGain(days, reference.rate) : null;
  let energy: number | null = null;
  if (reference && age !== null && height !== null && weight !== null && days !== null && days >= 14 * 7 && days <= maxReferenceGestation && activity) {
    const [intercept, heightCoefficient, weightCoefficient] = energyCoefficients[activity];
    energy = intercept - 2.04 * age + heightCoefficient * height + weightCoefficient * weight + 9.16 * (days / 7) + reference.energy;
  }
  const position: "below" | "above" | "inside" | null = gain === null || !range ? null
    : gain < range[0] - 1e-9 ? "below" : gain > range[1] + 1e-9 ? "above" : "inside";
  return { bmi, category, gain, reference, range, energy, position };
}

export type PrenatalWeightPoint = { days: number; weight: number; date: string; current?: boolean };

export function daysBetween(first: string, last: string) {
  return Math.round((Date.parse(last + "T00:00:00Z") - Date.parse(first + "T00:00:00Z")) / 86_400_000);
}

export function gainVelocity(points: readonly PrenatalWeightPoint[], current: PrenatalWeightPoint | null) {
  if (!current) return null;
  const previous = points.findLast((point) => point.days < current.days && point.date < current.date);
  return previous ? { rate: (current.weight - previous.weight) * 7 / (current.days - previous.days), previous } : null;
}
