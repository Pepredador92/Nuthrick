import { supabase } from "@/src/lib/supabase";
import type { Consultation } from "@/src/types/domain";

export type LaboratoryResultKind = "numeric" | "qualitative" | "ordinal" | "text";
export type LaboratoryRangeComparison = "in_range" | "below" | "above" | "not_comparable";
export type FastingStatus = "fasting" | "not_fasting" | "unknown";

export type LaboratoryCatalogItem = {
  id: string;
  code: string;
  display_name: string;
  clinical_name: string;
  subcategory: string;
  unit: string | null;
  data_type: string;
  synonyms: string[];
  choice_options: string[];
};

export type LaboratoryReport = {
  id: string;
  professional_id: string;
  patient_id: string;
  consultation_id: string;
  report_name: string | null;
  laboratory_name: string | null;
  sample_date: string | null;
  sample_time: string | null;
  report_date: string | null;
  fasting_status: FastingStatus;
  fasting_hours: number | null;
  sample_type: string | null;
  analytical_method: string | null;
  notes: string | null;
  external_identifier: string | null;
  capture_origin: "manual" | "imported" | "integration" | "other";
  created_at: string;
  updated_at: string;
};

export type LaboratoryResult = {
  id: string;
  report_id: string;
  analyte_id: string | null;
  custom_analyte_id: string | null;
  analyte_code_snapshot: string | null;
  analyte_name_snapshot: string;
  analyte_clinical_name_snapshot: string | null;
  analyte_synonyms_snapshot: string[];
  result_kind: LaboratoryResultKind;
  numeric_comparator: "<" | ">" | "<=" | ">=" | null;
  numeric_value: number | null;
  text_value: string | null;
  result_value_original: string;
  unit: string | null;
  reference_text: string | null;
  reference_lower: number | null;
  reference_upper: number | null;
  reference_lower_inclusive: boolean;
  reference_upper_inclusive: boolean;
  reference_unit: string | null;
  laboratory_flag: string | null;
  range_comparison: LaboratoryRangeComparison;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type LaboratoryPanelTemplate = {
  id: string;
  code: string | null;
  name: string;
  description: string | null;
  is_system: boolean;
};

export type LaboratoryPanelItem = {
  template_id: string;
  analyte_id: string;
  display_order: number;
};

export type CustomAnalyteDraft = {
  name: string;
  clinicalName: string;
  resultKind: LaboratoryResultKind;
  defaultUnit: string;
};

export type LaboratoryResultDraft = Partial<LaboratoryResult> & {
  local_id: string;
  custom?: CustomAnalyteDraft;
};

export type LaboratoryReportDraft = Partial<LaboratoryReport> & {
  local_id: string;
  results: LaboratoryResultDraft[];
  persisted_result_ids?: string[];
};

const emptyToNull = (value: string | null | undefined) => {
  const cleaned = value?.trim();
  return cleaned ? cleaned : null;
};

export function newLaboratoryReportDraft(): LaboratoryReportDraft {
  return {
    local_id: `laboratory-report-${crypto.randomUUID()}`,
    report_name: "",
    laboratory_name: "",
    sample_date: null,
    sample_time: null,
    report_date: null,
    fasting_status: "unknown",
    fasting_hours: null,
    sample_type: "",
    analytical_method: "",
    notes: "",
    external_identifier: "",
    capture_origin: "manual",
    results: [],
    persisted_result_ids: [],
  };
}

export function newLaboratoryResultDraft(item?: LaboratoryCatalogItem): LaboratoryResultDraft {
  const kind: LaboratoryResultKind = item?.data_type === "number" || item?.data_type === "percentage" || item?.data_type === "ratio"
    ? "numeric"
    : item?.data_type === "choice" || item?.data_type === "boolean"
      ? "qualitative"
      : "text";
  return {
    local_id: `laboratory-result-${crypto.randomUUID()}`,
    analyte_id: item?.id ?? null,
    custom_analyte_id: null,
    analyte_name_snapshot: item?.display_name ?? "Resultado personalizado",
    analyte_clinical_name_snapshot: item?.clinical_name ?? null,
    analyte_synonyms_snapshot: item?.synonyms ?? [],
    result_kind: kind,
    numeric_comparator: null,
    numeric_value: null,
    text_value: null,
    result_value_original: "",
    unit: item?.unit ?? "",
    reference_text: "",
    reference_lower: null,
    reference_upper: null,
    reference_lower_inclusive: true,
    reference_upper_inclusive: true,
    reference_unit: item?.unit ?? "",
    laboratory_flag: "",
    range_comparison: "not_comparable",
    notes: "",
  };
}

export function resultHasContent(result: Pick<LaboratoryResultDraft, "result_kind" | "numeric_value" | "text_value">) {
  if (result.result_kind === "numeric") return result.numeric_value !== null && result.numeric_value !== undefined && !Number.isNaN(Number(result.numeric_value));
  return Boolean(result.text_value?.trim());
}

export function originalResultValue(result: Pick<LaboratoryResultDraft, "result_kind" | "numeric_comparator" | "numeric_value" | "text_value">) {
  if (result.result_kind === "numeric") {
    if (result.numeric_value === null || result.numeric_value === undefined || Number.isNaN(Number(result.numeric_value))) return "";
    return `${result.numeric_comparator ?? ""}${result.numeric_value}`;
  }
  return result.text_value?.trim() ?? "";
}

export function compareReportedRange(result: Pick<LaboratoryResultDraft, "result_kind" | "numeric_comparator" | "numeric_value" | "unit" | "reference_unit" | "reference_lower" | "reference_upper" | "reference_lower_inclusive" | "reference_upper_inclusive">): LaboratoryRangeComparison {
  if (
    result.result_kind !== "numeric" || result.numeric_comparator || result.numeric_value === null || result.numeric_value === undefined ||
    !result.unit?.trim() || !result.reference_unit?.trim() || result.unit.trim().toLocaleLowerCase() !== result.reference_unit.trim().toLocaleLowerCase() ||
    (result.reference_lower === null || result.reference_lower === undefined) && (result.reference_upper === null || result.reference_upper === undefined)
  ) return "not_comparable";
  const value = Number(result.numeric_value);
  if (result.reference_lower !== null && result.reference_lower !== undefined && (value < Number(result.reference_lower) || (value === Number(result.reference_lower) && result.reference_lower_inclusive === false))) return "below";
  if (result.reference_upper !== null && result.reference_upper !== undefined && (value > Number(result.reference_upper) || (value === Number(result.reference_upper) && result.reference_upper_inclusive === false))) return "above";
  return "in_range";
}

export function searchLaboratoryCatalog(catalog: LaboratoryCatalogItem[], query: string) {
  const search = query.trim().toLocaleLowerCase();
  if (!search) return [];
  return catalog.filter((item) => [item.display_name, item.clinical_name, item.code, ...(item.synonyms ?? [])]
    .some((value) => value.toLocaleLowerCase().includes(search)));
}

export async function loadLaboratoryData(consultation: Consultation) {
  const [catalogResult, reportResult, resultResult, templateResult, itemResult, customResult] = await Promise.all([
    supabase.from("measurement_types").select("id,code,display_name,clinical_name,subcategory,unit,data_type,synonyms,choice_options").eq("category", "laboratory").eq("is_active", true).order("display_order"),
    supabase.from("laboratory_reports").select("*").eq("consultation_id", consultation.id).order("created_at"),
    supabase.from("laboratory_results").select("*").eq("consultation_id", consultation.id).order("created_at"),
    supabase.from("laboratory_panel_templates").select("id,code,name,description,is_system").order("name"),
    supabase.from("laboratory_panel_template_items").select("template_id,analyte_id,display_order").order("display_order"),
    supabase.from("laboratory_custom_analytes").select("id,display_name,clinical_name,result_kind,default_unit,synonyms").order("display_name"),
  ]);
  if (catalogResult.error || reportResult.error || resultResult.error || templateResult.error || itemResult.error || customResult.error)
    throw new Error("No pudimos cargar los laboratorios de esta consulta.");
  return {
    catalog: catalogResult.data as LaboratoryCatalogItem[],
    reports: reportResult.data as LaboratoryReport[],
    results: resultResult.data as LaboratoryResult[],
    templates: templateResult.data as LaboratoryPanelTemplate[],
    templateItems: itemResult.data as LaboratoryPanelItem[],
    customAnalytes: customResult.data as Array<{ id: string; display_name: string; clinical_name: string | null; result_kind: LaboratoryResultKind; default_unit: string | null; synonyms: string[] }>,
  };
}

async function createCustomAnalyte(reportId: string, custom: CustomAnalyteDraft) {
  const { data, error } = await supabase.from("laboratory_custom_analytes").insert({
    first_report_id: reportId,
    display_name: custom.name.trim(),
    clinical_name: emptyToNull(custom.clinicalName),
    result_kind: custom.resultKind,
    default_unit: emptyToNull(custom.defaultUnit),
  }).select("id").single();
  if (error || !data) throw new Error("No pudimos guardar el analito personalizado.");
  return data.id as string;
}

export async function saveLaboratoryReport(consultation: Consultation, draft: LaboratoryReportDraft) {
  const reportPayload = {
    report_name: emptyToNull(draft.report_name),
    laboratory_name: emptyToNull(draft.laboratory_name),
    sample_date: draft.sample_date || null,
    sample_time: draft.sample_time || null,
    report_date: draft.report_date || null,
    fasting_status: draft.fasting_status ?? "unknown",
    fasting_hours: draft.fasting_hours === null || draft.fasting_hours === undefined || Number.isNaN(Number(draft.fasting_hours)) ? null : Number(draft.fasting_hours),
    sample_type: emptyToNull(draft.sample_type),
    analytical_method: emptyToNull(draft.analytical_method),
    notes: emptyToNull(draft.notes),
    external_identifier: emptyToNull(draft.external_identifier),
    capture_origin: draft.capture_origin ?? "manual",
  };
  const reportQuery = draft.id
    ? supabase.from("laboratory_reports").update(reportPayload).eq("id", draft.id).select("*").single()
    : supabase.from("laboratory_reports").insert({ ...reportPayload, patient_id: consultation.patient_id, consultation_id: consultation.id }).select("*").single();
  const { data: report, error: reportError } = await reportQuery;
  if (reportError || !report) throw new Error("No pudimos guardar el reporte de laboratorio.");

  const persistedIds: string[] = [];
  for (const result of draft.results.filter(resultHasContent)) {
    const customAnalyteId = result.custom_analyte_id ?? (result.custom ? await createCustomAnalyte(report.id, result.custom) : null);
    if (!result.analyte_id && !customAnalyteId) throw new Error("Selecciona un analito o escribe el nombre del resultado personalizado.");
    const payload = {
      patient_id: consultation.patient_id,
      consultation_id: consultation.id,
      report_id: report.id,
      analyte_id: result.analyte_id ?? null,
      custom_analyte_id: customAnalyteId,
      result_kind: result.result_kind ?? "text",
      numeric_comparator: result.result_kind === "numeric" ? result.numeric_comparator ?? null : null,
      numeric_value: result.result_kind === "numeric" ? Number(result.numeric_value) : null,
      text_value: result.result_kind === "numeric" ? null : result.text_value?.trim() ?? null,
      result_value_original: originalResultValue(result),
      unit: emptyToNull(result.unit),
      reference_text: emptyToNull(result.reference_text),
      reference_lower: result.reference_lower === null || result.reference_lower === undefined || Number.isNaN(Number(result.reference_lower)) ? null : Number(result.reference_lower),
      reference_upper: result.reference_upper === null || result.reference_upper === undefined || Number.isNaN(Number(result.reference_upper)) ? null : Number(result.reference_upper),
      reference_lower_inclusive: result.reference_lower_inclusive ?? true,
      reference_upper_inclusive: result.reference_upper_inclusive ?? true,
      reference_unit: emptyToNull(result.reference_unit),
      laboratory_flag: emptyToNull(result.laboratory_flag),
      notes: emptyToNull(result.notes),
    };
    const query = result.id
      ? supabase.from("laboratory_results").update(payload).eq("id", result.id).select("id").single()
      : supabase.from("laboratory_results").insert(payload).select("id").single();
    const { data, error } = await query;
    if (error || !data) throw new Error("No pudimos guardar uno de los resultados.");
    persistedIds.push(data.id as string);
  }
  const existingIds = draft.persisted_result_ids ?? draft.results.map((result) => result.id).filter((id): id is string => Boolean(id));
  const removedIds = existingIds.filter((id) => !persistedIds.includes(id));
  if (removedIds.length) {
    const { error } = await supabase.from("laboratory_results").delete().in("id", removedIds);
    if (error) throw new Error("No pudimos retirar los resultados eliminados.");
  }
  return report as LaboratoryReport;
}

export async function deleteLaboratoryReport(id: string) {
  const { error } = await supabase.from("laboratory_reports").delete().eq("id", id);
  if (error) throw new Error("No pudimos eliminar el reporte.");
}
