import { supabase } from "@/src/lib/supabase";
import type {
  AnthroPayload,
  AnthroRecord,
} from "@/src/features/anthropometry/model";
import type { Consultation } from "@/src/types/domain";
import type {
  MeasurementType,
  MeasurementDevice,
  PatientMeasurementTemplate,
} from "@/src/features/anthropometry/workflowTypes";
import type { PatientMeasurement } from "@/src/types/domain";

export async function loadAnthropometry(
  patientId: string,
): Promise<AnthroRecord[]> {
  const { data, error } = await supabase
    .from("consultation_anthropometry")
    .select("*")
    .eq("patient_id", patientId)
    .order("revision", { ascending: false });
  if (error)
    throw new Error("No pudimos cargar la antropometría. Vuelve a intentar.");
  return (data ?? []) as AnthroRecord[];
}
export async function saveAnthropometry(
  c: Consultation,
  expectedRevision: number,
  payload: AnthroPayload,
): Promise<AnthroRecord> {
  if (payload.workflow) {
    const { data, error } = await supabase.rpc("save_measurement_workflow", {
      p_consultation: c.id,
      p_expected_revision: expectedRevision,
      p_payload: payload,
      p_template_scope: payload.workflow.templateScope,
      p_expected_template_revision: payload.workflow.templateRevision,
      p_save_patient_context: payload.workflow.context.fromPatient === false,
    });
    if (error)
      throw new Error(
        error.message.includes("Reload") ||
          error.message.includes("Template changed") ||
          error.code === "23505"
          ? "La consulta o el seguimiento cambió en otra ventana. Conserva tus cambios y recarga antes de guardar."
          : "No pudimos guardar las mediciones. Revisa los valores, el equipo y que la consulta siga abierta.",
      );
    return data as AnthroRecord;
  }
  const { data, error } = await supabase
    .from("consultation_anthropometry")
    .insert({
      professional_id: c.professional_id,
      patient_id: c.patient_id,
      consultation_id: c.id,
      revision: expectedRevision + 1,
      measured_at: payload.input.measuredAt,
      payload,
    })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505" || error.message.includes("Reload"))
      throw new Error(
        "La antropometría cambió en otra ventana. Conserva tus cambios y recarga antes de guardar.",
      );
    throw new Error(
      "No se pudo guardar la antropometría. Comprueba la conexión y que la consulta siga abierta.",
    );
  }
  return data as AnthroRecord;
}

export async function loadMeasurementSetup(c: Consultation) {
  const [types, devices, template, legacy] = await Promise.all([
    supabase.from("measurement_types").select("*").order("name"),
    supabase.from("measurement_devices").select("*").order("manufacturer"),
    supabase
      .from("patient_measurement_templates")
      .select("*")
      .eq("patient_id", c.patient_id)
      .maybeSingle(),
    supabase
      .from("patient_measurements")
      .select("*")
      .eq("patient_id", c.patient_id)
      .lt("measured_at", c.consultation_date)
      .order("measured_at", { ascending: false })
      .limit(30),
  ]);
  if (types.error || devices.error || template.error || legacy.error)
    throw new Error(
      "No se pudo cargar el catálogo o el seguimiento del paciente. Vuelve a intentar.",
    );
  return {
    types: types.data as MeasurementType[],
    devices: devices.data as MeasurementDevice[],
    template: template.data as PatientMeasurementTemplate | null,
    legacy: legacy.data as PatientMeasurement[],
  };
}
export async function createMeasurementDevice(
  input: Pick<
    MeasurementDevice,
    "manufacturer" | "model" | "device_type" | "technology" | "notes"
  >,
  owner: string,
) {
  const { data, error } = await supabase
    .from("measurement_devices")
    .insert({ ...input, created_by: owner, is_system_device: false })
    .select("*")
    .single();
  if (error)
    throw new Error(
      "No se pudo registrar el equipo. Revisa fabricante y modelo.",
    );
  return data as MeasurementDevice;
}
export async function createMeasurementType(
  input: Omit<MeasurementType, "id" | "code" | "created_by">,
  owner: string,
) {
  const code = "custom_" + crypto.randomUUID().replaceAll("-", "");
  const { data, error } = await supabase
    .from("measurement_types")
    .insert({ ...input, id: code, code, created_by: owner })
    .select("*")
    .single();
  if (error)
    throw new Error(
      "No se pudo registrar la medición. Revisa nombre, unidad y límites.",
    );
  return data as MeasurementType;
}
export async function loadGuidancePreference(
  professionalId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("professional_profiles")
    .select("show_formula_guidance")
    .eq("id", professionalId)
    .single();
  if (error)
    throw new Error("No pudimos cargar la preferencia de orientación.");
  return data.show_formula_guidance !== false;
}
export async function saveGuidancePreference(
  professionalId: string,
  show: boolean,
): Promise<void> {
  const { error } = await supabase
    .from("professional_profiles")
    .update({ show_formula_guidance: show })
    .eq("id", professionalId);
  if (error) throw new Error("No pudimos guardar la preferencia.");
}
