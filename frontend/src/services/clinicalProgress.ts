import { supabase } from "@/src/lib/supabase";
import type { ProgressDocument, ProgressReview, ProgressSource } from "@/src/features/progress/clinicalProgress";

const reviewFields = "id,version,recorded_at,review_consultation_id,review_consultation_date,document";

export async function listProgressSources(patientId: string): Promise<ProgressSource[]> {
  const { data, error } = await supabase.rpc("patient_clinical_progress_sources", { p_patient: patientId });
  if (error) throw new Error("No pudimos cargar el progreso del paciente.");
  return (data ?? []) as ProgressSource[];
}

export async function listProgressReviews(patientId: string, source: ProgressSource): Promise<ProgressReview[]> {
  const { data, error } = await supabase.from("patient_clinical_progress_reviews")
    .select(reviewFields)
    .eq("patient_id", patientId)
    .eq("source_consultation_id", source.id)
    .eq("source_revision", source.revision)
    .order("version", { ascending: false });
  if (error) throw new Error("No pudimos cargar el historial de progreso.");
  return (data ?? []) as ProgressReview[];
}

export async function saveProgressReview(patientId: string, source: ProgressSource, visitId: string | null, requestId: string, document: ProgressDocument): Promise<ProgressReview> {
  const { data, error } = await supabase.rpc("save_patient_clinical_progress", {
    p_patient: patientId,
    p_source: source.id,
    p_revision: source.revision,
    p_visit: visitId,
    p_expected: source.latest_review?.version ?? 0,
    p_request: requestId,
    p_document: document,
  }).single();
  if (error || !data) {
    const message = error?.message;
    if (message === "progress_conflict") throw new Error("Hay una revisión más reciente. Copia tus cambios si los quieres conservar y vuelve a abrir el progreso.");
    if (message === "progress_unavailable") throw new Error("La consulta ya no está disponible para guardar esta revisión. Vuelve a abrir el progreso.");
    if (message === "progress_later_review") throw new Error("Los acuerdos ya se revisaron en una cita posterior. Puedes consultar las versiones en el historial.");
    if (message === "progress_invalid") throw new Error("Esta revisión supera el tamaño admitido o contiene datos inválidos.");
    if (message === "retention_patient_read_only" || message === "account_read_only" || message === "entitlement_required")
      throw new Error("Tu acceso actual permite consultar el progreso de este paciente. Para guardar cambios necesitas acceso de edición.");
    throw new Error("No pudimos guardar la revisión. Tu texto sigue en pantalla.");
  }
  return data as ProgressReview;
}
