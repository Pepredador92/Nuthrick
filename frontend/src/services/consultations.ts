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

function fail(error: { code?: string; message?: string } | null, fallback = "No pudimos guardar la consulta. Intenta nuevamente."): never | void {
  if (!error) return;
  if (error.code === "23505") throw new Error("Ya existe un borrador de este tipo para este paciente. Puedes reanudarlo.");
  if (error.code === "42501" || error.code === "PGRST116") throw new Error("No tienes autorización para consultar este expediente.");
  throw new Error(fallback);
}

export interface LoadedTemplate {
  template: ConsultationTemplate;
  sections: ConsultationTemplateSection[];
  questions: ConsultationTemplateQuestion[];
}

export async function loadActiveTemplate(type: Consultation["consultation_type"]): Promise<LoadedTemplate> {
  const privateResult = await supabase.from("consultation_templates").select("*").eq("consultation_type", type).eq("is_default", true).eq("is_active", true).maybeSingle();
  fail(privateResult.error);
  const result = privateResult.data ? privateResult : await supabase.from("consultation_templates").select("*").eq("consultation_type", type).eq("is_system", true).eq("is_active", true).single();
  fail(result.error, "No encontramos la plantilla de esta consulta.");
  const template = result.data as ConsultationTemplate;
  const sectionsResult = await supabase.from("consultation_template_sections").select("*").eq("template_id", template.id).eq("is_active", true).order("display_order");
  fail(sectionsResult.error);
  const sections = (sectionsResult.data ?? []) as ConsultationTemplateSection[];
  const questionResult = sections.length ? await supabase.from("consultation_template_questions").select("*").in("section_id", sections.map((section) => section.id)).eq("is_active", true).order("display_order") : { data: [], error: null };
  fail(questionResult.error);
  return { template, sections, questions: (questionResult.data ?? []) as ConsultationTemplateQuestion[] };
}

export function createSnapshotStructure(type: Consultation["consultation_type"], sections: ConsultationTemplateSection[], questions: ConsultationTemplateQuestion[]): ConsultationSnapshotStructure {
  return {
    consultation_type: type,
    sections: sections.map((section) => ({
      section_key: section.section_key,
      title: section.title,
      description: section.description,
      questions: questions.filter((question) => question.section_id === section.id).map((question) => ({
        question_key: question.question_key,
        label: question.label,
        help_text: question.help_text,
        question_type: question.question_type,
        response_area: question.response_area,
        is_required: question.is_required,
        configuration: question.configuration,
        visibility_condition: question.visibility_condition,
      })),
    })),
  };
}

export async function findDraft(patientId: string, type: Consultation["consultation_type"]): Promise<Consultation | null> {
  const { data, error } = await supabase.from("consultations").select("*").eq("patient_id", patientId).eq("consultation_type", type).eq("status", "draft").maybeSingle();
  fail(error);
  return data as Consultation | null;
}

export async function beginConsultation(patientId: string, type: Consultation["consultation_type"]): Promise<Consultation> {
  const draft = await findDraft(patientId, type);
  if (draft) return draft;
  const { data: latest, error: latestError } = await supabase.from("consultations").select("sequence_number").eq("patient_id", patientId).order("sequence_number", { ascending: false }).limit(1).maybeSingle();
  fail(latestError);
  const sequence_number = latest?.sequence_number == null ? 0 : Number(latest.sequence_number) + 1;
  const consultation_type = sequence_number === 0 ? "initial" : "follow_up";
  const { data, error } = await supabase.from("consultations").insert({ patient_id: patientId, consultation_type, sequence_number, status: "draft", consultation_date: new Date().toISOString() }).select("*").single();
  fail(error);
  return data as Consultation;
}

export async function ensureSnapshot(consultation: Consultation, loaded: LoadedTemplate): Promise<ConsultationSnapshot> {
  const { data: existing, error: existingError } = await supabase.from("consultation_snapshots").select("*").eq("consultation_id", consultation.id).maybeSingle();
  fail(existingError);
  if (existing) return existing as ConsultationSnapshot;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Tu sesión terminó. Inicia sesión para continuar la consulta.");
  const { data, error } = await supabase.from("consultation_snapshots").insert({ professional_id: auth.user.id, consultation_id: consultation.id, patient_id: consultation.patient_id, template_id: loaded.template.id, template_name: loaded.template.name, template_version: loaded.template.version, structure: createSnapshotStructure(consultation.consultation_type, loaded.sections, loaded.questions) }).select("*").single();
  fail(error);
  return data as ConsultationSnapshot;
}

export async function getSnapshot(consultationId: string): Promise<ConsultationSnapshot | null> {
  const { data, error } = await supabase.from("consultation_snapshots").select("*").eq("consultation_id", consultationId).maybeSingle();
  fail(error);
  return data as ConsultationSnapshot | null;
}

export async function listAnswers(consultationId: string): Promise<ConsultationAnswer[]> {
  const { data, error } = await supabase.from("consultation_answers").select("*").eq("consultation_id", consultationId);
  fail(error);
  return (data ?? []) as ConsultationAnswer[];
}

export async function saveAnswers(consultation: Consultation, snapshot: ConsultationSnapshot, values: Record<string, unknown>): Promise<void> {
  const questions = snapshot.structure.sections.flatMap((section) => section.questions.map((question) => ({ ...question, section_key: section.section_key })));
  const rows = questions.filter((question) => Object.prototype.hasOwnProperty.call(values, question.question_key)).map((question) => ({ consultation_id: consultation.id, patient_id: consultation.patient_id, question_key: question.question_key, section_key: question.section_key, response_area: question.response_area, value: values[question.question_key] }));
  if (!rows.length) return;
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Tu sesión terminó. Inicia sesión para continuar la consulta.");
  const { error } = await supabase.from("consultation_answers").upsert(rows.map((row) => ({ ...row, professional_id: auth.user!.id })), { onConflict: "professional_id,consultation_id,question_key" });
  fail(error);
}

export async function finishConsultation(consultationId: string, summary: string | null): Promise<Consultation> {
  const { data, error } = await supabase.from("consultations").update({ status: "completed", summary: summary?.trim() || null, completed_at: new Date().toISOString() }).eq("id", consultationId).select("*").single();
  fail(error, "No pudimos finalizar la consulta.");
  return data as Consultation;
}

export async function listTemplate(type: Consultation["consultation_type"]): Promise<LoadedTemplate> {
  return loadActiveTemplate(type);
}

export async function createPersonalTemplateCopy(source: LoadedTemplate, templateKey: string): Promise<LoadedTemplate> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("Tu sesión terminó. Inicia sesión para personalizar la plantilla.");
  const { data: created, error } = await supabase.from("consultation_templates").insert({ professional_id: auth.user.id, template_key: templateKey, name: `${source.template.name} personalizada`, consultation_type: source.template.consultation_type, source_template_id: source.template.id, is_default: true, is_active: true }).select("*").single();
  fail(error, "No pudimos crear tu copia de plantilla.");
  const template = created as ConsultationTemplate;
  const { error: previousError } = await supabase.from("consultation_templates").update({ is_default: false }).eq("consultation_type", template.consultation_type).neq("id", template.id).eq("is_default", true);
  fail(previousError);
  const { data: copiedSections, error: sectionsError } = await supabase.from("consultation_template_sections").insert(source.sections.map((section) => ({ template_id: template.id, section_key: section.section_key, title: section.title, description: section.description, display_order: section.display_order, is_active: section.is_active }))).select("*");
  fail(sectionsError);
  const sections = (copiedSections ?? []) as ConsultationTemplateSection[];
  const sectionMap = new Map(source.sections.map((section, index) => [section.id, sections[index]?.id]));
  const { data: copiedQuestions, error: questionsError } = await supabase.from("consultation_template_questions").insert(source.questions.map((question) => ({ section_id: sectionMap.get(question.section_id), question_key: question.question_key, label: question.label, help_text: question.help_text, question_type: question.question_type, response_area: question.response_area, is_required: question.is_required, display_order: question.display_order, is_active: question.is_active, configuration: question.configuration, visibility_condition: question.visibility_condition }))).select("*");
  fail(questionsError);
  return { template, sections, questions: (copiedQuestions ?? []) as ConsultationTemplateQuestion[] };
}

export async function updateTemplateQuestion(questionId: string, patch: Partial<Pick<ConsultationTemplateQuestion, "label" | "help_text" | "is_required" | "is_active" | "display_order" | "configuration" | "visibility_condition">>): Promise<void> {
  const { error } = await supabase.from("consultation_template_questions").update(patch).eq("id", questionId);
  fail(error, "No pudimos actualizar la pregunta.");
}

export async function updateTemplateSection(sectionId: string, patch: Partial<Pick<ConsultationTemplateSection, "title" | "description" | "is_active" | "display_order">>): Promise<void> {
  const { error } = await supabase.from("consultation_template_sections").update(patch).eq("id", sectionId);
  fail(error, "No pudimos actualizar la sección.");
}

export async function swapTemplateQuestionOrder(first: ConsultationTemplateQuestion, second: ConsultationTemplateQuestion): Promise<void> {
  await updateTemplateQuestion(first.id, { display_order: 999999 });
  await updateTemplateQuestion(second.id, { display_order: first.display_order });
  await updateTemplateQuestion(first.id, { display_order: second.display_order });
}

export async function swapTemplateSectionOrder(first: ConsultationTemplateSection, second: ConsultationTemplateSection): Promise<void> {
  await updateTemplateSection(first.id, { display_order: 999999 });
  await updateTemplateSection(second.id, { display_order: first.display_order });
  await updateTemplateSection(first.id, { display_order: second.display_order });
}

export async function addTemplateSection(templateId: string, displayOrder: number): Promise<void> {
  const key = `section-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const { error } = await supabase.from("consultation_template_sections").insert({ template_id: templateId, section_key: key, title: "Nueva sección", display_order: displayOrder, is_active: true });
  fail(error, "No pudimos agregar la sección.");
}

export async function addTemplateQuestion(sectionId: string, displayOrder: number): Promise<void> {
  const key = `question-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const { error } = await supabase.from("consultation_template_questions").insert({ section_id: sectionId, question_key: key, label: "Nueva pregunta", question_type: "long_text", response_area: "professional_assessment", display_order: displayOrder, is_active: true });
  fail(error, "No pudimos agregar la pregunta.");
}

export async function restoreSystemTemplate(type: Consultation["consultation_type"]): Promise<void> {
  const { error } = await supabase.from("consultation_templates").update({ is_default: false, is_active: false }).eq("consultation_type", type).eq("is_system", false).eq("is_default", true);
  fail(error, "No pudimos restaurar la plantilla predeterminada.");
}
