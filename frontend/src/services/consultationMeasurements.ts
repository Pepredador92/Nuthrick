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
};

const defaultWorkspaceCodes = [
  "weight",
  "height",
  "waist_circumference",
  "hip_circumference",
  "abdominal_circumference",
];

export async function loadConsultationMeasurements(consultationId: string) {
  const [catalogResult, valuesResult, workspaceResult, itemsResult] = await Promise.all([
    supabase
      .from("measurement_types")
      .select("*")
      .neq("category", "laboratory")
      .eq("is_active", true)
      .order("display_order"),
    supabase
      .from("consultation_measurements")
      .select("*")
      .eq("consultation_id", consultationId)
      .order("created_at"),
    supabase.from("professional_measurement_workspaces").select("professional_id").maybeSingle(),
    supabase.from("professional_measurement_workspace_items").select("measurement_type_id, display_order").order("display_order"),
  ]);
  if (catalogResult.error || valuesResult.error || workspaceResult.error || itemsResult.error)
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
