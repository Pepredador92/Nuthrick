// Isolated browser fixture. Only qa/vite.config.ts aliases production imports here.
// No credentials, storage, network calls, or production routes are involved.
import { initialInterview } from "../src/features/consultations/interviewTemplate";
import type { LoadedTemplate } from "../src/services/consultations";
import type { Consultation, ConsultationSnapshot } from "../src/types/domain";
const owner = "qa-owner";
const now = "2026-09-02T12:00:00Z";
const system: LoadedTemplate = {
  template: {
    id: "qa-template",
    professional_id: null,
    template_key: "system_initial_v2",
    name: "Entrevista nutricional inicial",
    description: "Entrevista clínico-nutricional de prueba.",
    estimated_duration_minutes: 60,
    display_order: 0,
    version: 2,
    source_template_id: null,
    consultation_type: "initial",
    is_default: false,
    is_system: true,
    is_active: true,
    created_at: now,
    updated_at: now,
  },
  sections: initialInterview.sections.map((s, index) => ({
    id: s.section_key,
    template_id: "qa-template",
    section_key: s.section_key,
    title: s.title,
    description: s.description ?? null,
    display_order: index,
    is_active: true,
    created_at: now,
    updated_at: now,
  })),
  questions: initialInterview.sections.flatMap((s) =>
    s.questions.map((q, index) => ({
      ...q,
      id: q.question_key,
      section_id: s.section_key,
      display_order: index,
      is_active: true,
      help_text: q.help_text ?? null,
      visibility_condition: q.visibility_condition ?? null,
      created_at: now,
      updated_at: now,
    })),
  ),
};
let activeTemplate = structuredClone(system);
const consultation: Consultation = {
  id: "qa-consultation",
  professional_id: owner,
  patient_id: "fixture",
  consultation_type: "initial",
  sequence_number: 0,
  consultation_date: now,
  status: "draft",
  summary: null,
  completed_at: null,
  created_at: now,
  updated_at: now,
};
let snapshots: ConsultationSnapshot[] = [
  {
    id: "qa-revision-1",
    professional_id: owner,
    patient_id: "fixture",
    consultation_id: consultation.id,
    template_id: "qa-old-template",
    template_name: "Consulta de inicio",
    template_version: 1,
    revision: 1,
    structure: {
      consultation_type: "initial",
      sections: [
        {
          ...initialInterview.sections[0],
          questions: initialInterview.sections[0].questions.slice(0, 3),
        },
      ],
    },
    created_at: now,
  },
];
const answers: Record<number, Record<string, unknown>> = {
  1: { main_reason: "Mejorar hábitos" },
};
export const useAuth = () => ({
  profile: { full_name: "Profesional de prueba", public_slug: null },
  user: { email: "prueba@example.test" },
  signOut: async () => undefined,
});
export const getPatient = async () => ({
  id: "fixture",
  full_name: "Paciente ficticio para pruebas",
});
export const listConsultations = async () => [consultation];
export const beginConsultation = async () => consultation;
export const loadSystemTemplate = async () => structuredClone(system);
export const loadActiveTemplate = async () => structuredClone(activeTemplate);
export const listAvailableTemplates = async () =>
  activeTemplate.template.is_system
    ? [structuredClone(system)]
    : [structuredClone(activeTemplate), structuredClone(system)];
export const listAvailableSystemTemplates = listAvailableTemplates;
export const loadTemplateById = async (id: string) =>
  structuredClone(
    id === activeTemplate.template.id ? activeTemplate : system,
  );
export const listTemplate = loadActiveTemplate;
export const ensureSnapshot = async () => snapshots[0];
export const listSnapshots = async () => structuredClone(snapshots);
export const listAnswers = async (
  _id: string,
  revision = snapshots[0].revision,
) =>
  Object.entries(answers[revision] ?? {}).map(([question_key, value]) => ({
    question_key,
    value,
  }));
export const saveAnswers = async (
  _c: Consultation,
  snapshot: ConsultationSnapshot,
  values: Record<string, unknown>,
) => {
  await new Promise((resolve) => setTimeout(resolve, 80));
  answers[snapshot.revision] = structuredClone(values);
};
export const finishConsultation = async () => {
  consultation.status = "completed";
};
export const adoptTemplate = async () => {
  const next: ConsultationSnapshot = {
    ...snapshots[0],
    id: "qa-revision-2",
    template_id: system.template.id,
    template_name: system.template.name,
    template_version: 2,
    revision: 2,
    structure: structuredClone(initialInterview),
  };
  snapshots = [next, ...snapshots];
  answers[2] = { main_reason: answers[1].main_reason };
  return next;
};
export const createPersonalTemplateCopy = async (source: LoadedTemplate) => {
  activeTemplate = structuredClone(source);
  activeTemplate.template = {
    ...activeTemplate.template,
    id: "qa-personal",
    is_system: false,
    is_default: true,
    professional_id: owner,
    source_template_id: source.template.id,
  };
  return structuredClone(activeTemplate);
};
export const saveTemplate = async (loaded: LoadedTemplate) => {
  activeTemplate = structuredClone(loaded);
  activeTemplate.template.version += 1;
  return structuredClone(activeTemplate);
};
export const restoreSystemTemplate = async () => {
  activeTemplate = structuredClone(system);
};
export const setDefaultTemplate = async () => {
  activeTemplate.template.is_default = true;
};
export const archiveTemplate = async () => {
  activeTemplate.template.is_active = false;
  activeTemplate.template.is_default = false;
};
export const restoreTemplate = async () => {
  activeTemplate.template.is_active = true;
};
export const deleteTemplate = async () => {
  activeTemplate = structuredClone(system);
};
