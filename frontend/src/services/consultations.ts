import { supabase } from "@/src/lib/supabase";
import type {
  Consultation,
  ConsultationAnswer,
  ConsultationSnapshot,
  ConsultationSnapshotStructure,
  ConsultationTemplate,
  ConsultationTemplateQuestion,
  ConsultationTemplateSection,
} from "@/src/types/domain";

function fail(
  error: { code?: string; message?: string } | null,
  fallback = "No pudimos guardar. Tus cambios siguen en pantalla; vuelve a intentarlo.",
): never | void {
  if (!error) return;
  if (error.code === "23505")
    throw new Error(
      "Ya existe un registro con ese orden o identificador. Recarga para ver la versión actual.",
    );
  if (error.code === "42501" || error.code === "PGRST116")
    throw new Error(
      "No tienes autorización para modificar este registro, o ya no es un borrador.",
    );
  if (error.message?.includes("Reload"))
    throw new Error(
      "La versión cambió en otra ventana. Guarda una copia de tus cambios y recarga antes de continuar.",
    );
  throw new Error(fallback);
}

export interface LoadedTemplate {
  template: ConsultationTemplate;
  sections: ConsultationTemplateSection[];
  questions: ConsultationTemplateQuestion[];
}

export async function loadTemplateById(
  templateId: string,
  includeInactive = false,
): Promise<LoadedTemplate> {
  const result = await supabase
    .from("consultation_templates")
    .select("*")
    .eq("id", templateId)
    .single();
  fail(result.error, "No encontramos la plantilla.");
  let sectionsQuery = supabase
    .from("consultation_template_sections")
    .select("*")
    .eq("template_id", templateId)
    .order("display_order");
  if (!includeInactive) sectionsQuery = sectionsQuery.eq("is_active", true);
  const sectionsResult = await sectionsQuery;
  fail(sectionsResult.error);
  const sections = (sectionsResult.data ?? []) as ConsultationTemplateSection[];
  let questions: ConsultationTemplateQuestion[] = [];
  if (sections.length) {
    let questionQuery = supabase
      .from("consultation_template_questions")
      .select("*")
      .in(
        "section_id",
        sections.map((section) => section.id),
      )
      .order("display_order");
    if (!includeInactive) questionQuery = questionQuery.eq("is_active", true);
    const questionResult = await questionQuery;
    fail(questionResult.error);
    questions = (questionResult.data ?? []) as ConsultationTemplateQuestion[];
  }
  return { template: result.data as ConsultationTemplate, sections, questions };
}

export async function loadSystemTemplate(
  type: Consultation["consultation_type"],
  includeInactive = false,
): Promise<LoadedTemplate> {
  const { data, error } = await supabase
    .from("consultation_templates")
    .select("id")
    .eq("consultation_type", type)
    .eq("is_system", true)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .single();
  fail(error, "No encontramos la plantilla predeterminada.");
  return loadTemplateById(data!.id, includeInactive);
}

export async function loadActiveTemplate(
  type: Consultation["consultation_type"],
  includeInactive = false,
): Promise<LoadedTemplate> {
  const { data, error } = await supabase
    .from("consultation_templates")
    .select("id")
    .eq("consultation_type", type)
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle();
  fail(error);
  return data
    ? loadTemplateById(data.id, includeInactive)
    : loadSystemTemplate(type, includeInactive);
}

export function createSnapshotStructure(
  type: Consultation["consultation_type"],
  sections: ConsultationTemplateSection[],
  questions: ConsultationTemplateQuestion[],
): ConsultationSnapshotStructure {
  return structuredClone({
    consultation_type: type,
    sections: sections
      .filter((s) => s.is_active)
      .sort((a, b) => a.display_order - b.display_order)
      .map((section) => ({
        section_key: section.section_key,
        title: section.title,
        description: section.description,
        questions: questions
          .filter((q) => q.section_id === section.id && q.is_active)
          .sort((a, b) => a.display_order - b.display_order)
          .map((q) => ({
            question_key: q.question_key,
            label: q.label,
            help_text: q.help_text,
            question_type: q.question_type,
            response_area: q.response_area,
            is_required: q.is_required,
            configuration: q.configuration,
            visibility_condition: q.visibility_condition,
          })),
      })),
  });
}

export async function beginConsultation(
  patientId: string,
  type: Consultation["consultation_type"],
): Promise<Consultation> {
  const { data, error } = await supabase
    .rpc("start_consultation_draft", {
      target_patient: patientId,
      requested_type: type,
    })
    .single();
  fail(error, "No pudimos iniciar la consulta.");
  return data as Consultation;
}

export async function getSnapshot(
  consultationId: string,
): Promise<ConsultationSnapshot | null> {
  const { data, error } = await supabase
    .from("consultation_snapshots")
    .select("*")
    .eq("consultation_id", consultationId)
    .order("revision", { ascending: false })
    .limit(1)
    .maybeSingle();
  fail(error);
  return data as ConsultationSnapshot | null;
}

export async function listSnapshots(
  consultationId: string,
): Promise<ConsultationSnapshot[]> {
  const { data, error } = await supabase
    .from("consultation_snapshots")
    .select("*")
    .eq("consultation_id", consultationId)
    .order("revision", { ascending: false });
  fail(error);
  return (data ?? []) as ConsultationSnapshot[];
}

export async function adoptTemplate(
  consultation: Consultation,
  loaded: LoadedTemplate,
  expectedRevision: number,
): Promise<ConsultationSnapshot> {
  const { data, error } = await supabase
    .rpc("adopt_consultation_template", {
      target_consultation: consultation.id,
      target_template: loaded.template.id,
      expected_revision: expectedRevision,
    })
    .single();
  fail(
    error,
    "No pudimos cambiar de versión. El borrador anterior sigue intacto.",
  );
  return data as ConsultationSnapshot;
}

export async function ensureSnapshot(
  consultation: Consultation,
  loaded: LoadedTemplate,
): Promise<ConsultationSnapshot> {
  const existing = await getSnapshot(consultation.id);
  if (existing) return existing;
  try {
    return await adoptTemplate(consultation, loaded, 0);
  } catch (cause) {
    const concurrent = await getSnapshot(consultation.id);
    if (concurrent) return concurrent;
    throw cause;
  }
}

export async function listAnswers(
  consultationId: string,
  revision?: number,
): Promise<ConsultationAnswer[]> {
  const selectedRevision =
    revision ?? (await getSnapshot(consultationId))?.revision;
  if (!selectedRevision) return [];
  const { data, error } = await supabase
    .from("consultation_answers")
    .select("*")
    .eq("consultation_id", consultationId)
    .eq("revision", selectedRevision);
  fail(error);
  return (data ?? []) as ConsultationAnswer[];
}

export async function saveAnswers(
  consultation: Consultation,
  snapshot: ConsultationSnapshot,
  values: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.rpc("save_consultation_responses", {
    target_consultation: consultation.id,
    expected_revision: snapshot.revision,
    responses: values,
  });
  fail(error);
}

export async function finishConsultation(
  consultationId: string,
  summary: string | null,
): Promise<Consultation> {
  const { data, error } = await supabase
    .from("consultations")
    .update({
      status: "completed",
      summary: summary?.trim().slice(0, 4000) || null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", consultationId)
    .eq("status", "draft")
    .select("*")
    .single();
  fail(error, "No pudimos finalizar la consulta.");
  return data as Consultation;
}

export const listTemplate = (type: Consultation["consultation_type"]) =>
  loadActiveTemplate(type, true);

export async function createPersonalTemplateCopy(
  source: LoadedTemplate,
  templateKey: string,
): Promise<LoadedTemplate> {
  const { data, error } = await supabase
    .rpc("copy_consultation_template", {
      source_id: source.template.id,
      new_key: templateKey,
    })
    .single();
  fail(
    error,
    "No pudimos crear la copia. Tu plantilla previa sigue disponible.",
  );
  return loadTemplateById((data as ConsultationTemplate).id, true);
}

export async function saveTemplate(
  loaded: LoadedTemplate,
): Promise<LoadedTemplate> {
  const { error } = await supabase.rpc("save_consultation_template", {
    target_template: loaded.template.id,
    expected_updated_at: loaded.template.updated_at,
    section_data: loaded.sections,
    question_data: loaded.questions,
  });
  fail(
    error,
    "No pudimos guardar la plantilla. Revisa los títulos y las opciones; tus cambios siguen en pantalla.",
  );
  return loadTemplateById(loaded.template.id, true);
}

export async function restoreSystemTemplate(
  type: Consultation["consultation_type"],
): Promise<void> {
  const { error } = await supabase
    .from("consultation_templates")
    .update({ is_default: false })
    .eq("consultation_type", type)
    .eq("is_system", false)
    .eq("is_default", true);
  fail(error, "No pudimos elegir la plantilla predeterminada.");
}
