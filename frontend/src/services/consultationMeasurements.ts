import { supabase } from "@/src/lib/supabase";
import type { Consultation } from "@/src/types/domain";

export type MeasurementDataType =
  | "number"
  | "text"
  | "choice"
  | "boolean"
  | "percentage"
  | "ratio";

export type CatalogMeasurement = {
  id: string;
  code: string;
  name: string;
  display_name: string;
  clinical_name: string;
  category: string;
  subcategory: string;
  unit: string | null;
  data_type: MeasurementDataType;
  min_value: number;
  max_value: number;
  decimal_places: number;
  description: string;
  synonyms: string[];
  display_order: number;
  source_kind: string;
  choice_options: string[];
};

export type ConsultationMeasurement = {
  id: string;
  consultation_id: string;
  measurement_type_id: string;
  value: string | number | boolean;
  unit: string | null;
  data_type: MeasurementDataType;
  measured_at: string;
  device_session_id?: string | null;
  source_metadata?: {
    manufacturer_variable_name: string;
    manufacturer_unit: string | null;
    mapping_status: string;
    captured_at: string;
  } | null;
};

export type PreviousMeasurement = Pick<
  ConsultationMeasurement,
  "measurement_type_id" | "value" | "unit" | "measured_at"
>;

const defaultWorkspaceCodes = [
  "weight",
  "height",
  "waist_circumference",
  "hip_circumference",
  "abdominal_circumference",
];

export async function loadConsultationMeasurements(consultation: Consultation) {
  const [catalogResult, valuesResult, workspaceResult, itemsResult, followupResult, followupItemsResult, previousValuesResult] = await Promise.all([
    supabase
      .from("measurement_types")
      .select("*")
      .neq("category", "laboratory")
      .eq("is_active", true)
      .order("display_order"),
    supabase
      .from("consultation_measurements")
      .select("*")
      .eq("consultation_id", consultation.id)
      .is("device_session_id", null)
      .order("created_at"),
    supabase.from("professional_measurement_workspaces").select("professional_id").maybeSingle(),
    supabase.from("professional_measurement_workspace_items").select("measurement_type_id, display_order").order("display_order"),
    supabase
      .from("patient_measurement_followups")
      .select("patient_id")
      .eq("patient_id", consultation.patient_id)
      .is("device_session_id", null)
      .maybeSingle(),
    supabase
      .from("patient_measurement_followup_items")
      .select("measurement_type_id")
      .eq("patient_id", consultation.patient_id),
    supabase
      .from("consultation_measurements")
      .select("measurement_type_id, value, unit, measured_at")
      .eq("patient_id", consultation.patient_id)
      .neq("consultation_id", consultation.id)
      .lt("measured_at", consultation.consultation_date)
      .order("measured_at", { ascending: false }),
  ]);
  if (catalogResult.error || valuesResult.error || workspaceResult.error || itemsResult.error || followupResult.error || followupItemsResult.error || previousValuesResult.error)
    throw new Error("No pudimos cargar las mediciones de esta consulta.");
  const catalog = catalogResult.data as CatalogMeasurement[];
  const workspaceIds = workspaceResult.data
    ? (itemsResult.data ?? []).map((item) => item.measurement_type_id)
    : defaultWorkspaceCodes
        .map((code) => catalog.find((item) => item.code === code)?.id)
        .filter((id): id is string => Boolean(id));
  return {
    catalog,
    values: valuesResult.data as ConsultationMeasurement[],
    workspaceIds,
    hasFollowup: Boolean(followupResult.data),
    followupIds: (followupItemsResult.data ?? []).map((item) => item.measurement_type_id),
    previousValues: (previousValuesResult.data ?? []).reduce<Record<string, PreviousMeasurement>>((latest, item) => {
      if (!latest[item.measurement_type_id]) latest[item.measurement_type_id] = item as PreviousMeasurement;
      return latest;
    }, {}),
  };
}

export async function saveMeasurementWorkspace(measurementTypeIds: string[]) {
  const { data, error } = await supabase.rpc("save_measurement_workspace", {
    p_measurement_type_ids: measurementTypeIds,
  });
  if (error) throw new Error("No pudimos guardar tu espacio de trabajo.");
  const items = (data ?? []) as Array<{ measurement_type_id: string }>;
  return items.map((item) => item.measurement_type_id);
}

export async function savePatientMeasurementFollowup(
  patientId: string,
  measurementTypeIds: string[],
) {
  const { data, error } = await supabase.rpc("save_patient_measurement_followup", {
    p_patient_id: patientId,
    p_measurement_type_ids: measurementTypeIds,
  });
  if (error) throw new Error("No pudimos guardar el seguimiento de este paciente.");
  const items = (data ?? []) as Array<{ measurement_type_id: string }>;
  return items.map((item) => item.measurement_type_id);
}

export async function saveConsultationMeasurements(
  consultation: Consultation,
  values: Record<string, string | number | boolean>,
) {
  const { data, error } = await supabase.rpc("save_consultation_measurements", {
    p_consultation_id: consultation.id,
    p_values: values,
  });
  if (error) {
    if (error.message.includes("outside the allowed"))
      throw new Error("Revisa los valores capturados: alguno no es válido.");
    if (error.message.includes("owned draft"))
      throw new Error("Esta consulta ya no está disponible para editar.");
    throw new Error("No pudimos guardar las mediciones. Intenta nuevamente.");
  }
  return data as ConsultationMeasurement[];
}
