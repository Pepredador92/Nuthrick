import { supabase } from "@/src/lib/supabase";
import { isSupplementList, type SupplementItem } from "../../../supabase/functions/_shared/supplements";

export type PatientSupplementation = {
  id: string;
  patient_id: string;
  consultation_id: string | null;
  items: SupplementItem[];
  tags: string[];
  created_at: string;
  updated_at: string;
};

export async function listPatientSupplementation(patientId: string): Promise<PatientSupplementation[]> {
  const { data, error } = await supabase.from("patient_supplementation")
    .select("id, patient_id, consultation_id, items, tags, created_at, updated_at")
    .eq("patient_id", patientId).order("created_at", { ascending: false }).order("id", { ascending: false });
  if (error) throw new Error("No pudimos cargar el historial de suplementación.");
  return data as PatientSupplementation[];
}

export async function savePatientSupplementation(
  patientId: string,
  id: string,
  items: SupplementItem[],
  tags: string[],
  consultationId: string | null,
  expectedUpdatedAt?: string,
): Promise<PatientSupplementation> {
  if (!items.length || !isSupplementList(items) || items.some(item => !item.instructions.trim())) {
    throw new Error("Confirma las indicaciones de cada suplemento antes de guardar.");
  }
  const payload = { items, tags, consultation_id: consultationId };
  const table = supabase.from("patient_supplementation");
  const result = expectedUpdatedAt
    ? await table.update(payload).eq("id", id).eq("patient_id", patientId).eq("updated_at", expectedUpdatedAt).select().maybeSingle()
    : await table.insert({ id, patient_id: patientId, ...payload }).select().single();
  if (result.error?.code === "23505" && !expectedUpdatedAt) {
    const existing = await supabase.from("patient_supplementation").select().eq("id", id).eq("patient_id", patientId).maybeSingle();
    if (existing.data) return existing.data as PatientSupplementation;
  }
  if (result.error?.code === "23503") throw new Error("La consulta ya no está disponible para vincularla a este paciente.");
  if (result.error) throw new Error("No pudimos guardar la suplementación. Intenta nuevamente.");
  if (!result.data) throw new Error("El registro cambió en otra pestaña. Abre de nuevo el historial para actualizarlo.");
  return result.data as PatientSupplementation;
}
