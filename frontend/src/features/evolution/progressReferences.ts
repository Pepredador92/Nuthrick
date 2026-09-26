import { interpretResult } from "@/src/features/interpretations/engine";
import type { InterpretationContext, InterpretationReference } from "@/src/features/interpretations/types";
import type { LongitudinalPoint, LongitudinalSeries } from "./longitudinal";

/** Explicit comparisons for the current report; never overwrite clinical snapshots. */
export type ProgressReferenceOptions = { targetBmi: number | null; gallagherSeriesIds: string[] };
export const emptyProgressReferences: ProgressReferenceOptions = { targetBmi: null, gallagherSeriesIds: [] };
export const isBodyFatSeries = (series: LongitudinalSeries) => series.unit === "%" && ["body_fat_percentage", "body_fat_percentage_device", "body_fat"].includes(series.conceptCode ?? "");
export const formatReferenceNumber = (value: number) => value.toLocaleString("es-MX", { maximumFractionDigits: 1 });

// Gallagher et al. AJCN 2000;72:694–701, Table 4 (4C, combined sample).
const thresholds = {
  female: [[21, 33, 39], [23, 34, 40], [24, 36, 42]],
  male: [[8, 20, 25], [11, 22, 28], [13, 25, 30]],
};

export function gallagherReference(sex: "female" | "male", age: number): InterpretationReference {
  const limits = thresholds[sex][age < 40 ? 0 : age < 60 ? 1 : 2];
  const labels = ["Bajo", "Dentro de referencia", "Alto", "Muy alto"];
  return {
    id: "gallagher-2000-table4", version: "1", resultCode: "body_fat_percentage", name: "Gallagher · referencia orientativa", organization: "Gallagher et al.", year: 2000,
    sourceVersion: "Tabla 4", title: "Healthy percentage body fat ranges: an approach for developing guidelines based on body mass index",
    url: "https://doi.org/10.1093/ajcn/72.3.694", locator: "Tabla 4, página 699", population: "Adultos de la muestra combinada blanca y afroamericana; modelo 4C", unit: "%", isDefault: false,
    conditions: [
      { field: "age", label: "Edad entre 20 y 79 años", min: 20, minInclusive: true, max: 80, maxInclusive: false },
      { field: "sex", label: "Sexo utilizado por la ecuación", equals: sex },
      { field: "pregnant", label: "Contexto de gestación", equals: false },
      { field: "bmi", label: "IMC de la consulta (hasta 35)", min: 0, minInclusive: false, max: 35, maxInclusive: true },
    ],
    rules: labels.map((label, index) => ({ id: `gallagher-${sex}-${age < 40 ? 20 : age < 60 ? 40 : 60}-${index}`, label, description: "Comparación orientativa seleccionada por el profesional", level: index, lower: index === 0 ? 0 : limits[index - 1], upper: index === 3 ? 100 : limits[index], lowerInclusive: true, upperInclusive: index === 3 })),
    notes: ["Rangos provisionales derivados del IMC; no son un diagnóstico."],
    limitations: ["No extrapolar a menores, embarazo, IMC >35, enfermedad o entrenamiento vigoroso.", "Requiere valorar población y método; no valida todos los equipos de bioimpedancia ni fórmulas de pliegues."],
  };
}

export function contextForPoint(point: LongitudinalPoint, series: LongitudinalSeries[]): InterpretationContext {
  const contexts = series.flatMap((item) => item.points.filter((entry) => entry.consultation_id === point.consultation_id).map((entry) => entry.interpretation?.context)).filter((entry): entry is InterpretationContext => Boolean(entry));
  const context: InterpretationContext = {};
  for (const key of ["age", "sex", "pregnant", "bmi"]) {
    const values = [...new Set(contexts.map((entry) => entry[key]).filter((value) => value !== null && value !== undefined))];
    context[key] = values.length === 1 ? values[0] : null;
  }
  if (context.bmi == null) {
    const values = [...new Set(series.filter((item) => item.conceptCode === "bmi").flatMap((item) => item.points.filter((entry) => entry.consultation_id === point.consultation_id && typeof entry.raw_value === "number").map((entry) => entry.raw_value as number)))];
    if (values.length === 1 && Number.isFinite(values[0])) context.bmi = values[0];
  }
  return context;
}

export function reportBodyFatInterpretation(series: LongitudinalSeries, point: LongitudinalPoint, allSeries: LongitudinalSeries[], options: ProgressReferenceOptions) {
  if (!isBodyFatSeries(series) || !options.gallagherSeriesIds.includes(series.id)) return null;
  const context = contextForPoint(point, allSeries);
  if (context.sex !== "female" && context.sex !== "male" || typeof context.age !== "number" || !Number.isFinite(context.age)) return { interpretation: null, reason: "Falta edad o sexo de la ecuación en el contexto guardado de esta consulta." };
  if (typeof point.raw_value !== "number" || !Number.isFinite(point.raw_value)) return null;
  const interpretation = interpretResult("body_fat_percentage", point.raw_value, "%", context, [gallagherReference(context.sex, context.age)], point.consultation_id);
  return { interpretation, reason: interpretation.reason };
}

export function weightReference(point: LongitudinalPoint, allSeries: LongitudinalSeries[], options: ProgressReferenceOptions) {
  const context = contextForPoint(point, allSeries);
  const heights = allSeries.filter((series) => series.conceptCode === "height" && (series.unit === "cm" || series.unit === "m"))
    .flatMap((series) => series.points.filter((entry) => entry.consultation_id === point.consultation_id && typeof entry.raw_value === "number")
      .map((entry) => (entry.raw_value as number) * (series.unit === "m" ? 100 : 1)));
  const savedHeights = allSeries.flatMap((series) => series.points.filter((entry) => entry.consultation_id === point.consultation_id && entry.heightCm != null).map((entry) => entry.heightCm!));
  const candidates = [...new Set((heights.length ? heights : savedHeights).filter((value) => Number.isFinite(value) && value > 0))];
  const height = candidates.length === 1 ? candidates[0] : null;
  const applicable = typeof context.age === "number" && context.age >= 18 && context.pregnant === false && height !== null;
  const heightSquared = applicable ? (height / 100) ** 2 : null;
  const targetBmi = options.targetBmi !== null && Number.isFinite(options.targetBmi) && options.targetBmi > 0 ? options.targetBmi : null;
  return {
    recorded: point.referenceWeight ?? null,
    interval: heightSquared === null ? null : { lower: 18.5 * heightSquared, upper: 25 * heightSquared, heightCm: height! },
    target: heightSquared === null || targetBmi === null ? null : { value: targetBmi * heightSquared, bmi: targetBmi },
  };
}
