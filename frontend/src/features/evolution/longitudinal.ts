import type { Consultation, PatientMeasurement } from "@/src/types/domain";
import type { ConsultationMeasurement, CatalogMeasurement } from "@/src/services/consultationMeasurements";
import type { LaboratoryReport, LaboratoryResult } from "@/src/services/laboratories";

export type LongitudinalCategory =
  | "measurements"
  | "calculations"
  | "bioimpedance"
  | "laboratories";

export type LongitudinalSourceType =
  | "manual_measurement"
  | "calculation"
  | "bioimpedance_device"
  | "laboratory_report";

export type LongitudinalPoint = {
  consultation_id: string;
  consultation_date: string;
  raw_value: number | string | boolean | null;
  display_value: string;
  unit: string | null;
  source_reference: Record<string, string | null>;
  source_references?: Array<Record<string, string | null>>;
};

export type LongitudinalSeries = {
  id: string;
  label: string;
  category: LongitudinalCategory;
  concept: string;
  unit: string | null;
  sourceType: LongitudinalSourceType;
  method: string | null;
  provenance: string | null;
  graphable: boolean;
  points: LongitudinalPoint[];
};

export type HistoricalCalculation = {
  id: string;
  consultation_id: string;
  calculation_code: string;
  result_key: string;
  method_name: string;
  method_version: string;
  raw_result: number;
  displayed_result: string;
  unit: string;
  definition_snapshot: Record<string, unknown>;
};

export type HistoricalDeviceSession = {
  id: string;
  consultation_id: string;
  professional_device_id: string;
  capture_source: string;
  device_snapshot: {
    alias?: string | null;
    manufacturer?: string | null;
    model?: string | null;
    commercial_name?: string | null;
  };
};

export type LongitudinalHistoryInput = {
  consultations: Consultation[];
  catalog: CatalogMeasurement[];
  measurements: ConsultationMeasurement[];
  legacyMeasurements: PatientMeasurement[];
  calculations: HistoricalCalculation[];
  deviceSessions: HistoricalDeviceSession[];
  laboratoryReports: LaboratoryReport[];
  laboratoryResults: LaboratoryResult[];
};

export type LongitudinalHistory = {
  consultations: Consultation[];
  series: LongitudinalSeries[];
};

const categoryOrder: Record<LongitudinalCategory, number> = {
  measurements: 0,
  calculations: 1,
  bioimpedance: 2,
  laboratories: 3,
};

const normalize = (value: string | null | undefined) =>
  value?.trim().toLocaleLowerCase() ?? "";

const humanize = (value: string) =>
  value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());

const presentationValue = (
  value: string | number | boolean,
  decimalPlaces?: number,
) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.NumberFormat("es-MX", {
      maximumFractionDigits: decimalPlaces ?? 6,
    }).format(value);
  }
  if (typeof value === "boolean") return value ? "Sí" : "No";
  return String(value);
};

function storedCalculationLabel(result: HistoricalCalculation) {
  const snapshot = result.definition_snapshot ?? {};
  const snapshotLabel = [
    snapshot.resultName,
    snapshot.result_label,
    snapshot.display_name,
    snapshot.name,
    snapshot.output_name,
  ].find((value): value is string => typeof value === "string" && value.trim().length > 0);
  const concept = snapshotLabel ?? humanize(result.result_key || result.calculation_code);
  const method = result.method_name?.trim() ||
    (typeof snapshot.methodName === "string" ? snapshot.methodName : "") ||
    humanize(result.calculation_code);
  return normalize(concept) === normalize(method) ? concept : `${concept} · ${method}`;
}

function addPoint(series: LongitudinalSeries, point: LongitudinalPoint) {
  const existing = series.points.find(
    (candidate) => candidate.consultation_id === point.consultation_id,
  );
  if (!existing) {
    series.points.push(point);
    return;
  }

  // Two equivalent lab reports can be linked to one consultation. Keep both
  // documentary values rather than silently replacing one with the other.
  existing.display_value = `${existing.display_value} · ${point.display_value}`;
  existing.raw_value = null;
  existing.source_references = [
    existing.source_reference,
    ...(existing.source_references ?? []),
    point.source_reference,
  ];
  series.graphable = false;
}

export function buildLongitudinalHistory(
  input: LongitudinalHistoryInput,
): LongitudinalHistory {
  const consultations = input.consultations
    .slice()
    .sort(
      (left, right) =>
        new Date(left.consultation_date).getTime() -
          new Date(right.consultation_date).getTime() ||
        new Date(left.created_at).getTime() - new Date(right.created_at).getTime() ||
        left.id.localeCompare(right.id),
    );
  const consultationById = new Map(consultations.map((item) => [item.id, item]));
  const catalogById = new Map(input.catalog.map((item) => [item.id, item]));
  const sessionById = new Map(input.deviceSessions.map((item) => [item.id, item]));
  const reportById = new Map(input.laboratoryReports.map((item) => [item.id, item]));
  const byId = new Map<string, LongitudinalSeries>();

  const ensure = (series: Omit<LongitudinalSeries, "points">) => {
    const existing = byId.get(series.id);
    if (existing) return existing;
    const next = { ...series, points: [] };
    byId.set(next.id, next);
    return next;
  };

  for (const measurement of input.measurements) {
    const consultation = consultationById.get(measurement.consultation_id);
    if (!consultation) continue;
    const catalog = catalogById.get(measurement.measurement_type_id);
    const value = measurement.value;
    const numeric = typeof value === "number" && Number.isFinite(value);
    const session = measurement.device_session_id
      ? sessionById.get(measurement.device_session_id)
      : undefined;
    const device = session?.device_snapshot;
    const deviceLabel = [device?.alias, device?.commercial_name || device?.model]
      .filter(Boolean)
      .join(" · ");
    const category: LongitudinalCategory = session ? "bioimpedance" : "measurements";
    const sourceType: LongitudinalSourceType = session
      ? "bioimpedance_device"
      : "manual_measurement";
    const concept = catalog?.display_name || catalog?.name || measurement.measurement_type_id;
    const unit = measurement.unit ?? catalog?.unit ?? null;
    const series = ensure({
      id: session
        ? `bioimpedance:${measurement.measurement_type_id}:${unit ?? ""}:${session.professional_device_id}`
        : `measurement:${measurement.measurement_type_id}:${unit ?? ""}`,
      label: session && deviceLabel ? `${concept} · ${deviceLabel}` : concept,
      category,
      concept,
      unit,
      sourceType,
      method: null,
      provenance: session
        ? [device?.manufacturer, device?.model, session.capture_source]
            .filter(Boolean)
            .join(" · ")
        : null,
      graphable: numeric,
    });
    if (!numeric) series.graphable = false;
    addPoint(series, {
      consultation_id: consultation.id,
      consultation_date: consultation.consultation_date,
      raw_value: numeric ? value : value,
      display_value: presentationValue(value, catalog?.decimal_places),
      unit,
      source_reference: {
        measurement_id: measurement.id,
        device_session_id: session?.id ?? null,
        professional_device_id: session?.professional_device_id ?? null,
      },
    });
  }

  // Early versions of Nuthrick stored peso, talla and IMC in
  // patient_measurements. When they are linked to a real consultation they
  // remain legitimate historical records, so include them without deriving
  // anything anew. A newer consultation_measurements value takes precedence.
  for (const measurement of input.legacyMeasurements) {
    const consultation = measurement.consultation_id
      ? consultationById.get(measurement.consultation_id)
      : undefined;
    if (!consultation) continue;
    const legacyValues: Array<{
      code: string;
      fallbackLabel: string;
      unit: string | null;
      value: number;
      decimalPlaces: number;
    }> = [
      { code: "weight", fallbackLabel: "Peso", unit: "kg", value: Number(measurement.weight_kg), decimalPlaces: 2 },
      { code: "height", fallbackLabel: "Estatura", unit: "cm", value: Number(measurement.height_cm), decimalPlaces: 2 },
    ];
    for (const legacy of legacyValues) {
      if (!Number.isFinite(legacy.value)) continue;
      const catalog = input.catalog.find((item) => item.code === legacy.code);
      const unit = catalog?.unit ?? legacy.unit;
      const series = ensure({
        id: `measurement:${catalog?.id ?? legacy.code}:${unit ?? ""}`,
        label: catalog?.display_name || catalog?.name || legacy.fallbackLabel,
        category: "measurements",
        concept: catalog?.display_name || catalog?.name || legacy.fallbackLabel,
        unit,
        sourceType: "manual_measurement",
        method: null,
        provenance: "Registro histórico de la consulta",
        graphable: true,
      });
      if (series.points.some((point) => point.consultation_id === consultation.id)) continue;
      addPoint(series, {
        consultation_id: consultation.id,
        consultation_date: consultation.consultation_date,
        raw_value: legacy.value,
        display_value: presentationValue(legacy.value, catalog?.decimal_places ?? legacy.decimalPlaces),
        unit,
        source_reference: { patient_measurement_id: measurement.id, legacy_source: "patient_measurements" },
      });
    }

    const bmi = Number(measurement.bmi);
    if (!Number.isFinite(bmi)) continue;
    const series = ensure({
      id: "calculation:legacy:bmi:registered:",
      label: "IMC",
      category: "calculations",
      concept: "IMC",
      unit: null,
      sourceType: "calculation",
      method: "IMC registrado",
      provenance: "Registro histórico de la consulta",
      graphable: true,
    });
    if (series.points.some((point) => point.consultation_id === consultation.id)) continue;
    addPoint(series, {
      consultation_id: consultation.id,
      consultation_date: consultation.consultation_date,
      raw_value: bmi,
      display_value: presentationValue(bmi, 2),
      unit: null,
      source_reference: { patient_measurement_id: measurement.id, legacy_source: "patient_measurements" },
    });
  }

  for (const result of input.calculations) {
    const consultation = consultationById.get(result.consultation_id);
    if (!consultation) continue;
    const label = storedCalculationLabel(result);
    const method = result.method_name?.trim() || humanize(result.calculation_code);
    const series = ensure({
      id: `calculation:${result.calculation_code}:${result.result_key}:${method}:${result.method_version}:${result.unit}`,
      label,
      category: "calculations",
      concept: humanize(result.result_key || result.calculation_code),
      unit: result.unit || null,
      sourceType: "calculation",
      method,
      provenance: result.method_version ? `${method} · v${result.method_version}` : method,
      graphable: Number.isFinite(Number(result.raw_result)),
    });
    addPoint(series, {
      consultation_id: consultation.id,
      consultation_date: consultation.consultation_date,
      raw_value: Number(result.raw_result),
      display_value: result.displayed_result,
      unit: result.unit || null,
      source_reference: {
        calculation_result_id: result.id,
        calculation_code: result.calculation_code,
        result_key: result.result_key,
        method: method,
      },
    });
  }

  for (const result of input.laboratoryResults) {
    const consultation = consultationById.get(result.consultation_id);
    const report = reportById.get(result.report_id);
    if (!consultation || !report) continue;
    const unit = result.unit?.trim() || null;
    const sampleType = report.sample_type?.trim() || "sin tipo de muestra";
    const method = report.analytical_method?.trim() || "sin método informado";
    const analyteKey = result.analyte_id ?? result.analyte_code_snapshot ?? result.custom_analyte_id ?? result.analyte_name_snapshot;
    const comparator = result.numeric_comparator ?? "";
    const numeric = result.result_kind === "numeric" && !comparator && Number.isFinite(Number(result.numeric_value));
    const series = ensure({
      id: `laboratory:${normalize(analyteKey)}:${normalize(unit)}:${normalize(sampleType)}:${normalize(method)}`,
      label: result.analyte_name_snapshot,
      category: "laboratories",
      concept: result.analyte_name_snapshot,
      unit,
      sourceType: "laboratory_report",
      method: report.analytical_method,
      provenance: [report.laboratory_name, sampleType, report.analytical_method]
        .filter(Boolean)
        .join(" · ") || null,
      graphable: numeric,
    });
    if (!numeric) series.graphable = false;
    addPoint(series, {
      consultation_id: consultation.id,
      consultation_date: consultation.consultation_date,
      raw_value: numeric ? Number(result.numeric_value) : result.result_value_original,
      display_value: result.result_value_original,
      unit,
      source_reference: {
        laboratory_result_id: result.id,
        laboratory_report_id: report.id,
        laboratory_name: report.laboratory_name,
        sample_type: report.sample_type,
        analytical_method: report.analytical_method,
      },
    });
  }

  return {
    consultations,
    series: [...byId.values()]
      .map((series) => ({
        ...series,
        points: series.points.sort(
          (left, right) =>
            new Date(left.consultation_date).getTime() -
            new Date(right.consultation_date).getTime(),
        ),
      }))
      .sort(
        (left, right) =>
          categoryOrder[left.category] - categoryOrder[right.category] ||
          left.label.localeCompare(right.label, "es"),
      ),
  };
}
