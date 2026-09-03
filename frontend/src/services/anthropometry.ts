import { supabase } from "@/src/lib/supabase";
import type {
  AnthroPayload,
  AnthroRecord,
} from "@/src/features/anthropometry/model";
import type { Consultation } from "@/src/types/domain";

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
