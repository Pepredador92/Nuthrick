import { conditionState } from "@/src/features/interpretations/engine";
import type { LongitudinalPoint, LongitudinalSeries } from "./longitudinal";
import { emptyProgressReferences, reportBodyFatInterpretation, type ProgressReferenceOptions } from "./progressReferences";

/** Uses the reference and classification saved at that visit, never today's thresholds. */
export function historicalClassification(point: LongitudinalPoint) {
  const snapshot = point.interpretation;
  if (snapshot?.state !== "classified" || !snapshot.rule || !snapshot.reference) return null;
  const rules = snapshot.reference.rules.filter((rule) => (rule.conditions ?? []).every((condition) => conditionState(condition, snapshot.context) === "matches"));
  const continuous = rules.some((rule) => rule.lower !== null || rule.upper !== null);
  const bounds = rules.flatMap((rule) => [rule.lower, rule.upper]).filter((value): value is number => value !== null && Number.isFinite(value) && (snapshot.unit !== "%" || value < 100));
  const spread = bounds.length ? Math.max(...bounds) - Math.min(...bounds) : 0;
  const padding = Math.max(spread * 0.15, 1);
  const low = Math.max(0, Math.min(snapshot.value - padding, ...bounds.filter((value) => value > 0).map((value) => value - padding)));
  const high = Math.min(snapshot.unit === "%" ? 100 : Infinity, Math.max(snapshot.value + padding, ...bounds.map((value) => value + padding)));
  const bands = continuous ? rules.flatMap((rule, index) => {
    const start = Math.max(low, rule.lower ?? low);
    const end = Math.min(high, rule.upper ?? high);
    return end > start ? [{ rule, color: classificationColors[index % classificationColors.length], left: 100 * (start - low) / (high - low), width: 100 * (end - start) / (high - low) }] : [];
  }) : [];
  return { bands, marker: 100 * (snapshot.value - low) / (high - low), label: snapshot.rule.label, source: `${snapshot.reference.organization} · ${snapshot.reference.year}`, reference: snapshot.reference, value: snapshot.value, rules: continuous ? rules : [], low, high };
}

export function summarySeries(series: LongitudinalSeries[]) {
  return series.filter((item) => ["weight", "bmi", "body_fat_percentage", "body_fat_percentage_device", "body_fat"].includes(item.conceptCode ?? "") || item.visualization === "somatochart");
}

export function pointClassification(item: LongitudinalSeries, point: LongitudinalPoint, allSeries: LongitudinalSeries[], options: ProgressReferenceOptions = emptyProgressReferences) {
  const historical = historicalClassification(point);
  if (historical) return { ...historical, origin: "Clasificación registrada" };
  const comparison = reportBodyFatInterpretation(item, point, allSeries, options);
  const classified = comparison?.interpretation ? historicalClassification({ ...point, interpretation: comparison.interpretation }) : null;
  return classified ? { ...classified, origin: "Comparación orientativa del informe" } : null;
}

/** A missing classification at the latest visit must not erase a recorded one. */
export function classificationSummary(item: LongitudinalSeries, allSeries: LongitudinalSeries[], options: ProgressReferenceOptions = emptyProgressReferences) {
  const history = item.points.map((point) => {
    const classification = pointClassification(item, point, allSeries, options);
    const reason = classification ? null : reportBodyFatInterpretation(item, point, allSeries, options)?.reason || point.interpretation?.reason || null;
    return { point, classification, reason };
  });
  const current = history.at(-1);
  const displayed = history.filter((entry) => entry.classification !== null).at(-1);
  const historicalLabel = displayed?.classification?.origin === "Comparación orientativa del informe" ? "Última comparación orientativa" : "Última clasificación registrada";
  return { history, current, displayed, historicalLabel, isHistorical: Boolean(displayed && displayed !== current) };
}

export const classificationColors = ["#c5d5ed", "#b8ded0", "#f2d39b", "#edbea8", "#dfa7ad", "#c58eaa", "#aa91b0"];
