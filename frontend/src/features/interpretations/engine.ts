import type {
  ContextCondition,
  Interpretation,
  InterpretationContext,
  InterpretationReference,
  InterpretationRule,
} from "./types";
import { calculateAge } from "@/src/features/patients/patientUtils";
import type { Patient, Consultation } from "@/src/types/domain";

export function conditionState(
  condition: ContextCondition,
  context: InterpretationContext,
): "matches" | "missing" | "outside" {
  const value = context[condition.field];
  if (value === null || value === undefined || value === "") return "missing";
  if (condition.equals !== undefined && value !== condition.equals)
    return "outside";
  if (condition.oneOf && !condition.oneOf.includes(String(value)))
    return "outside";
  if (
    condition.min !== undefined &&
    (typeof value !== "number" ||
      (condition.minInclusive ? value < condition.min : value <= condition.min))
  )
    return "outside";
  if (
    condition.max !== undefined &&
    (typeof value !== "number" ||
      (condition.maxInclusive ? value > condition.max : value >= condition.max))
  )
    return "outside";
  return "matches";
}
export function matchesRange(value: number, rule: InterpretationRule) {
  return (
    Number.isFinite(value) &&
    (rule.lower === null ||
      (rule.lowerInclusive ? value >= rule.lower : value > rule.lower)) &&
    (rule.upper === null ||
      (rule.upperInclusive ? value <= rule.upper : value < rule.upper))
  );
}

export function classifyHeathCarterSomatotype(
  endomorphy: number | undefined,
  mesomorphy: number | undefined,
  ectomorphy: number | undefined,
): string | null {
  if (
    !Number.isFinite(endomorphy) ||
    !Number.isFinite(mesomorphy) ||
    !Number.isFinite(ectomorphy)
  )
    return null;
  const endo = endomorphy!;
  const meso = mesomorphy!;
  const ecto = ectomorphy!;
  const close = (a: number, b: number) => Math.abs(a - b) <= 0.5;
  if (Math.max(endo, meso, ecto) - Math.min(endo, meso, ecto) <= 1)
    return "central";
  if (close(endo, meso) && ecto < Math.min(endo, meso))
    return "mesomorph-endomorph";
  if (close(meso, ecto) && endo < Math.min(meso, ecto))
    return "mesomorph-ectomorph";
  if (close(endo, ecto) && meso < Math.min(endo, ecto))
    return "endomorph-ectomorph";
  if (endo > meso && endo > ecto) {
    if (close(meso, ecto)) return "balanced-endomorph";
    return meso > ecto
      ? "mesomorphic-endomorph"
      : "ectomorphic-endomorph";
  }
  if (meso > endo && meso > ecto) {
    if (close(endo, ecto)) return "balanced-mesomorph";
    return endo > ecto
      ? "endomorphic-mesomorph"
      : "ectomorphic-mesomorph";
  }
  if (ecto > endo && ecto > meso) {
    if (close(endo, meso)) return "balanced-ectomorph";
    return endo > meso
      ? "endomorphic-ectomorph"
      : "mesomorphic-ectomorph";
  }
  return null;
}

export function extendInterpretationContext(
  context: InterpretationContext,
  dependencyResults: Record<string, number>,
): InterpretationContext {
  const endomorphy = dependencyResults.somatotype_endomorphy;
  const mesomorphy = dependencyResults.somatotype_mesomorphy;
  const ectomorphy = dependencyResults.somatotype_ectomorphy;
  return {
    ...context,
    somatotypeEndomorphy: endomorphy ?? null,
    somatotypeMesomorphy: mesomorphy ?? null,
    somatotypeEctomorphy: ectomorphy ?? null,
    somatotypeCategory: classifyHeathCarterSomatotype(
      endomorphy,
      mesomorphy,
      ectomorphy,
    ),
  };
}
export function interpretResult(
  resultCode: string,
  value: number,
  unit: string,
  context: InterpretationContext,
  references: InterpretationReference[],
  consultationId: string,
  interpretedAt = new Date().toISOString(),
): Interpretation {
  const result: Interpretation = {
    state: "no_reference",
    resultCode,
    value,
    unit,
    consultationId,
    context: structuredClone(context),
    interpretedAt,
    reason: "Sin referencia de interpretación disponible.",
    reference: null,
    rule: null,
    candidates: [],
  };
  const candidates = references.filter((r) => r.resultCode === resultCode);
  if (!candidates.length) return result;
  const assessed = candidates.map((reference) => ({
    reference,
    outside:
      reference.unit !== unit ||
      reference.conditions.some(
        (c) => conditionState(c, context) === "outside",
      ),
    missing: reference.conditions.filter(
      (c) => conditionState(c, context) === "missing",
    ),
  }));
  const applicable = assessed.filter((r) => !r.outside && !r.missing.length);
  const defaults = applicable.filter((r) => r.reference.isDefault);
  const pool = defaults.length ? defaults : applicable;
  if (pool.length > 1)
    return {
      ...result,
      state: "requires_decision",
      reason:
        "Hay varias referencias aplicables; se requiere decisión metodológica.",
      candidates: pool.map((r) => `${r.reference.id}@${r.reference.version}`),
    };
  if (!pool.length) {
    const missing = assessed.find((r) => !r.outside && r.missing.length);
    return {
      ...result,
      state: missing ? "missing_context" : "not_applicable",
      reference: structuredClone((missing ?? assessed[0]).reference),
      reason: missing
        ? `Falta: ${missing.missing.map((c) => c.label).join(", ")}.`
        : "La referencia no aplica al contexto de esta consulta.",
    };
  }
  const reference = pool[0].reference;
  const evaluatedValue =
    reference.valueTransform === "nearest_half"
      ? Math.round(value * 2) / 2
      : value;
  const rules = reference.rules.filter(
    (r) =>
      matchesRange(evaluatedValue, r) &&
      (r.conditions ?? []).every(
        (c) => conditionState(c, context) === "matches",
      ),
  );
  return {
    ...result,
    evaluatedValue,
    reference: structuredClone(reference),
    state:
      rules.length > 1
        ? "requires_decision"
        : rules.length
          ? "classified"
          : "not_applicable",
    rule: rules.length === 1 ? structuredClone(rules[0]) : null,
    reason:
      rules.length > 1
        ? "Existen rangos superpuestos; se requiere decisión metodológica."
        : rules.length
          ? ""
          : "Valor fuera del rango clasificatorio definido por la referencia.",
  };
}
export function interpretationContext(
  patient: Patient,
  consultation: Consultation,
  bmi: number | undefined,
  pregnant: boolean | null,
): InterpretationContext {
  // Reuse the existing age helper, using the consultation's calendar date in the patient's timezone.
  const calendarDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: patient.timezone || "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(consultation.consultation_date));
  return {
    age: calculateAge(patient.birth_date, new Date(`${calendarDate}T12:00:00`)),
    sex: patient.equation_sex ?? null,
    birthDate: patient.birth_date,
    consultationDate: consultation.consultation_date,
    timezone: patient.timezone || "America/Mexico_City",
    bmi: bmi ?? null,
    pregnant,
  };
}
export function pregnancyFromLifeStage(value: unknown): boolean | null {
  if (value === "Embarazo") return true;
  if (value === "Ninguna particular") return false;
  return null;
}
