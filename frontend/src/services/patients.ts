import { supabase } from "@/src/lib/supabase";
import type {
  Consultation,
  ConsultationNote,
  NutritionPlan,
  Patient,
  PatientMeasurement,
  PatientNote,
  PatientProgressPhoto,
  PatientTag,
  QuestionnaireResponse,
  QuestionnaireSubmission,
} from "@/src/types/domain";

export interface PatientListFilters {
  search?: string;
  status?: string;
  portalAccess?: string;
  tagId?: string;
  tagIds?: string[];
  sort?: "created_desc" | "created_asc" | "name_asc" | "activity_desc";
  page?: number;
  pageSize?: number;
}

export interface PatientCounters {
  total: number;
  active: number;
}

const unwrap = <T>(
  data: T,
  error: { message: string; code?: string } | null,
): T => {
  if (error) {
    if (error.code === "23505")
      throw new Error("Ya existe un registro con esos datos.");
    if (error.code === "42501" || error.code === "PGRST116")
      throw new Error("No tienes autorización para acceder a este paciente.");
    if (error.code === "23514")
      throw new Error(
        "Revisa los datos: hay un valor fuera de los límites permitidos.",
      );
    throw new Error("No pudimos completar la operación. Intenta nuevamente.");
  }
  return data;
};

function friendlyError(
  error: { code?: string } | null,
  fallback = "No pudimos completar la operación. Intenta nuevamente.",
): Error {
  if (error?.code === "23505")
    return new Error("Ya existe un registro con esos datos.");
  if (error?.code === "42501" || error?.code === "PGRST116")
    return new Error("No tienes autorización para acceder a este paciente.");
  if (error?.code === "23514")
    return new Error(
      "Revisa los datos: hay un valor fuera de los límites permitidos.",
    );
  return new Error(fallback);
}

export async function listPatientTags(): Promise<PatientTag[]> {
  const { data, error } = await supabase
    .from("patient_tags")
    .select("*")
    .order("name");
  return unwrap((data ?? []) as PatientTag[], error);
}

export async function createPatientTag(
  name: string,
  color = "#7A9D8D",
): Promise<PatientTag> {
  const { data, error } = await supabase
    .from("patient_tags")
    .insert({ name: name.trim(), color })
    .select("*")
    .single();
  return unwrap(data as PatientTag, error);
}

export async function assignPatientTag(
  patientId: string,
  tagId: string,
): Promise<void> {
  const { error } = await supabase
    .from("patient_tag_assignments")
    .insert({ patient_id: patientId, tag_id: tagId });
  if (error) throw friendlyError(error);
}

export async function removePatientTag(
  patientId: string,
  tagId: string,
): Promise<void> {
  const { error } = await supabase
    .from("patient_tag_assignments")
    .delete()
    .eq("patient_id", patientId)
    .eq("tag_id", tagId);
  if (error) throw friendlyError(error);
}

export async function listPatientAssignedTags(
  patientId: string,
): Promise<PatientTag[]> {
  const { data, error } = await supabase
    .from("patient_tag_assignments")
    .select("tag_id")
    .eq("patient_id", patientId);
  if (error) throw friendlyError(error);
  const tags = await listPatientTags();
  const ids = new Set((data ?? []).map((row) => row.tag_id as string));
  return tags.filter((tag) => ids.has(tag.id));
}

export async function listPatients(
  filters: PatientListFilters = {},
): Promise<{ rows: Patient[]; total: number }> {
  const pageSize = filters.pageSize ?? 20;
  const page = filters.page ?? 0;
  let query = supabase.from("patients").select("*", { count: "exact" });
  query = query.is("deleted_at", null);
  const search = filters.search?.trim();
  if (search) {
    const safeSearch = search.replace(/[%,()]/g, " ");
    query = query.or(
      `full_name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%`,
    );
  }
  if (filters.status && filters.status !== "all")
    query = query.eq("status", filters.status);
  if (filters.portalAccess === "enabled")
    query = query.eq("portal_access_enabled", true);
  if (filters.portalAccess === "disabled")
    query = query.eq("portal_access_enabled", false);
  const requestedTagIds =
    filters.tagIds?.filter(Boolean) ?? (filters.tagId ? [filters.tagId] : []);
  if (requestedTagIds.length) {
    const { data: assignments, error } = await supabase
      .from("patient_tag_assignments")
      .select("patient_id")
      .in("tag_id", requestedTagIds);
    if (error) throw friendlyError(error);
    const ids = (assignments ?? []).map((row) => row.patient_id as string);
    if (!ids.length) return { rows: [], total: 0 };
    query = query.in("id", ids);
  }
  const sort = filters.sort ?? "created_desc";
  if (sort === "name_asc")
    query = query.order("full_name", { ascending: true });
  else if (sort === "created_asc")
    query = query.order("created_at", { ascending: true });
  else if (sort === "activity_desc")
    query = query.order("last_activity_at", {
      ascending: false,
      nullsFirst: false,
    });
  else query = query.order("created_at", { ascending: false });
  query = query
    .order("id", { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  const { data, count, error } = await query;
  if (error) throw friendlyError(error);
  const rows = (data ?? []) as Patient[];
  if (rows.length) {
    const { data: assignments, error: assignmentError } = await supabase
      .from("patient_tag_assignments")
      .select("patient_id, tag_id")
      .in(
        "patient_id",
        rows.map((row) => row.id),
      );
    if (assignmentError) throw friendlyError(assignmentError);
    const tags = await listPatientTags();
    const tagsById = new Map(tags.map((tag) => [tag.id, tag]));
    const byPatient = new Map<string, PatientTag[]>();
    (assignments ?? []).forEach((assignment) => {
      const tag = tagsById.get(assignment.tag_id as string);
      if (tag)
        byPatient.set(assignment.patient_id as string, [
          ...(byPatient.get(assignment.patient_id as string) ?? []),
          tag,
        ]);
    });
    rows.forEach((row) => {
      row.tags = byPatient.get(row.id) ?? [];
    });
  }
  return { rows, total: count ?? 0 };
}

export async function getPatientCounters(): Promise<PatientCounters> {
  const [totalResult, activeResult] = await Promise.all([
    supabase
      .from("patients")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null),
    supabase
      .from("patients")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("status", "active"),
  ]);
  if (totalResult.error) throw friendlyError(totalResult.error);
  if (activeResult.error) throw friendlyError(activeResult.error);
  return {
    total: totalResult.count ?? 0,
    active: activeResult.count ?? 0,
  };
}

export async function getPatient(patientId: string): Promise<Patient | null> {
  const { data, error } = await supabase
    .from("patients")
    .select("*")
    .eq("id", patientId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw friendlyError(error);
  return data as Patient | null;
}

export interface PatientInput {
  full_name: string;
  email?: string | null;
  country_code?: string | null;
  timezone: string;
  phone?: string | null;
  weight_kg?: number | null;
  height_cm?: number | null;
  gender?: string | null;
  birth_date?: string | null;
  portal_access_enabled: boolean;
  archived_at?: string | null;
}

export async function createPatient(input: PatientInput): Promise<Patient> {
  const { data, error } = await supabase
    .from("patients")
    .insert(input)
    .select("*")
    .single();
  const patient = unwrap(data as Patient, error);
  if (input.weight_kg != null && input.height_cm != null) {
    const { error: measurementError } = await supabase
      .from("patient_measurements")
      .insert({
        patient_id: patient.id,
        weight_kg: input.weight_kg,
        height_cm: input.height_cm,
        measured_at: new Date().toISOString(),
      });
    if (measurementError)
      throw new Error(
        `Paciente creado, pero no se pudo guardar la medición inicial. ${friendlyError(measurementError).message}`,
      );
  }
  return patient;
}

export async function updatePatient(
  patientId: string,
  input: Partial<PatientInput> & {
    status?: Patient["status"];
    deleted_at?: string | null;
  },
): Promise<Patient> {
  const { data, error } = await supabase
    .from("patients")
    .update(input)
    .eq("id", patientId)
    .select("*")
    .single();
  return unwrap(data as Patient, error);
}

export async function deactivatePatient(
  patientId: string,
  inactive: boolean,
): Promise<Patient> {
  return updatePatient(patientId, { status: inactive ? "inactive" : "active" });
}

export async function archivePatient(patientId: string): Promise<Patient> {
  return updatePatient(patientId, {
    status: "archived",
    archived_at: new Date().toISOString(),
    deleted_at: null,
  });
}

export async function restorePatient(patientId: string): Promise<Patient> {
  return updatePatient(patientId, {
    status: "active",
    archived_at: null,
    deleted_at: null,
  });
}

export async function deletePatient(patientId: string): Promise<Patient> {
  return updatePatient(patientId, {
    status: "archived",
    deleted_at: new Date().toISOString(),
  });
}

export async function listMeasurements(
  patientId: string,
): Promise<PatientMeasurement[]> {
  const { data, error } = await supabase
    .from("patient_measurements")
    .select("*")
    .eq("patient_id", patientId)
    .order("measured_at", { ascending: false });
  return unwrap((data ?? []) as PatientMeasurement[], error);
}

export async function createMeasurement(
  patientId: string,
  input: {
    consultation_id?: string | null;
    weight_kg: number;
    height_cm: number;
    measured_at?: string;
    ideal_weight_kg?: number | null;
    ideal_weight_method?: string | null;
    notes?: string | null;
  },
): Promise<PatientMeasurement> {
  const { data, error } = await supabase
    .from("patient_measurements")
    .insert({ patient_id: patientId, ...input })
    .select("*")
    .single();
  return unwrap(data as PatientMeasurement, error);
}

export async function deleteMeasurement(measurementId: string): Promise<void> {
  const { error } = await supabase
    .from("patient_measurements")
    .delete()
    .eq("id", measurementId);
  if (error)
    throw new Error("No pudimos eliminar la medición. Intenta nuevamente.");
}

export async function listConsultations(
  patientId: string,
): Promise<Consultation[]> {
  const { data, error } = await supabase
    .from("consultations")
    .select("*")
    .eq("patient_id", patientId)
    .order("consultation_date", { ascending: false });
  return unwrap((data ?? []) as Consultation[], error);
}

export async function createConsultation(
  patientId: string,
  input: {
    consultation_date: string;
    status: Consultation["status"];
    summary?: string | null;
    consultation_type?: Consultation["consultation_type"];
    sequence_number?: number;
  },
): Promise<Consultation> {
  let sequenceNumber = input.sequence_number;
  if (sequenceNumber === undefined) {
    const { data: latest, error: latestError } = await supabase
      .from("consultations")
      .select("sequence_number")
      .eq("patient_id", patientId)
      .order("sequence_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw friendlyError(latestError);
    sequenceNumber = latest?.sequence_number == null ? 0 : latest.sequence_number + 1;
  }
  const consultationType =
    input.consultation_type ?? (sequenceNumber === 0 ? "initial" : "follow_up");
  const { data, error } = await supabase
    .from("consultations")
    .insert({
      patient_id: patientId,
      consultation_date: input.consultation_date,
      status: input.status,
      summary: input.summary ?? null,
      consultation_type: consultationType,
      sequence_number: sequenceNumber,
    })
    .select("*")
    .single();
  return unwrap(data as Consultation, error);
}

export async function listNotes(
  patientId: string,
): Promise<ConsultationNote[]> {
  const { data, error } = await supabase
    .from("consultation_notes")
    .select("*")
    .eq("patient_id", patientId)
    .order("updated_at", { ascending: false });
  return unwrap((data ?? []) as ConsultationNote[], error);
}

export async function listPatientNotes(patientId: string): Promise<PatientNote[]> {
  const { data, error } = await supabase
    .from("patient_notes")
    .select("*")
    .eq("patient_id", patientId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  return unwrap((data ?? []) as PatientNote[], error);
}

export async function createPatientNote(
  patientId: string,
  content: string,
  consultationId?: string | null,
): Promise<PatientNote> {
  const { data, error } = await supabase
    .from("patient_notes")
    .insert({
      patient_id: patientId,
      consultation_id: consultationId ?? null,
      content: content.trim(),
    })
    .select("*")
    .single();
  return unwrap(data as PatientNote, error);
}

export async function updatePatientNote(
  noteId: string,
  content: string,
): Promise<PatientNote> {
  const { data, error } = await supabase
    .from("patient_notes")
    .update({ content: content.trim() })
    .eq("id", noteId)
    .select("*")
    .single();
  return unwrap(data as PatientNote, error);
}

export async function deletePatientNote(noteId: string): Promise<void> {
  const { error } = await supabase
    .from("patient_notes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", noteId);
  if (error) throw friendlyError(error);
}

export async function listNutritionPlans(
  patientId: string,
): Promise<NutritionPlan[]> {
  const { data, error } = await supabase
    .from("nutrition_plans")
    .select("*")
    .eq("patient_id", patientId)
    .order("assigned_at", { ascending: false });
  return unwrap((data ?? []) as NutritionPlan[], error);
}

export async function listQuestionnaireSubmissions(
  patientId: string,
): Promise<QuestionnaireSubmission[]> {
  const { data, error } = await supabase
    .from("questionnaire_submissions")
    .select("*")
    .eq("patient_id", patientId)
    .order("created_at", { ascending: false });
  return unwrap((data ?? []) as QuestionnaireSubmission[], error);
}

export async function listQuestionnaireResponses(
  submissionId: string,
): Promise<QuestionnaireResponse[]> {
  const { data, error } = await supabase
    .from("questionnaire_responses")
    .select("*")
    .eq("submission_id", submissionId)
    .order("section_key")
    .order("question_key");
  return unwrap((data ?? []) as QuestionnaireResponse[], error);
}

export async function upsertNote(
  patientId: string,
  consultationId: string,
  note: string,
): Promise<ConsultationNote> {
  const { data, error } = await supabase
    .from("consultation_notes")
    .upsert(
      { patient_id: patientId, consultation_id: consultationId, note },
      { onConflict: "professional_id,consultation_id" },
    )
    .select("*")
    .single();
  return unwrap(data as ConsultationNote, error);
}

export async function listProgressPhotos(
  patientId: string,
): Promise<PatientProgressPhoto[]> {
  const { data, error } = await supabase
    .from("patient_progress_photos")
    .select("*")
    .eq("patient_id", patientId)
    .order("captured_at", { ascending: false });
  return unwrap((data ?? []) as PatientProgressPhoto[], error);
}

export async function registerProgressPhoto(
  patientId: string,
  storagePath: string,
  capturedAt?: string,
  caption?: string,
): Promise<PatientProgressPhoto> {
  const { data, error } = await supabase
    .from("patient_progress_photos")
    .insert({
      patient_id: patientId,
      storage_path: storagePath,
      captured_at: capturedAt,
      caption,
    })
    .select("*")
    .single();
  return unwrap(data as PatientProgressPhoto, error);
}
