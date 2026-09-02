import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, ChevronLeft, ChevronRight, LoaderCircle, Save, SlidersHorizontal } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { EmptyState, ErrorState, LoadingState, SuccessNote } from "@/src/components/ui/Status";
import { Input, Textarea } from "@/src/components/ui/FormField";
import { consultationLabel, formatPatientDate } from "@/src/features/patients/patientUtils";
import { getPatient, listConsultations } from "@/src/services/patients";
import { beginConsultation, ensureSnapshot, findDraft, finishConsultation, getSnapshot, listAnswers, loadActiveTemplate, saveAnswers } from "@/src/services/consultations";
import type { Consultation, ConsultationSnapshot, ConsultationSnapshotStructure, Patient } from "@/src/types/domain";

type Values = Record<string, unknown>;

function visible(question: ConsultationSnapshotStructure["sections"][number]["questions"][number], values: Values) {
  const condition = question.visibility_condition;
  if (!condition || typeof condition.question_key !== "string") return true;
  const current = values[condition.question_key];
  return "equals" in condition ? current === condition.equals : Boolean(current);
}

function emptyValue(value: unknown) {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function valueText(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => typeof item === "string" ? item : Object.values(item as Record<string, unknown>).filter(Boolean).join(" · ")).filter(Boolean).join("\n");
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

type RepeatableField = { key: string; label: string; type?: "text" | "number" | "date" | "time" | "select"; options?: string[] };

function repeatableFields(configuration: Record<string, unknown>): RepeatableField[] {
  const fields = Array.isArray(configuration?.fields) ? configuration.fields : [];
  return fields.flatMap((field) => {
    if (typeof field === "string") return [{ key: field, label: field.replaceAll("_", " ") }];
    if (!field || typeof field !== "object" || typeof (field as Record<string, unknown>).key !== "string") return [];
    const item = field as Record<string, unknown>;
    return [{ key: item.key as string, label: typeof item.label === "string" ? item.label : (item.key as string).replaceAll("_", " "), type: ["number", "date", "time", "select"].includes(String(item.type)) ? item.type as RepeatableField["type"] : "text", options: Array.isArray(item.options) ? item.options.filter((option): option is string => typeof option === "string") : undefined }];
  });
}

function QuestionField({ question, value, onChange }: { question: ConsultationSnapshotStructure["sections"][number]["questions"][number]; value: unknown; onChange: (value: unknown) => void }) {
  const options = Array.isArray(question.configuration?.options) ? question.configuration.options.filter((item): item is string => typeof item === "string") : [];
  const fields = repeatableFields(question.configuration);
  const common = <><label className="text-sm font-semibold text-[#315e4f]">{question.label}{question.is_required && <span className="ml-1 text-[#a55343]">*</span>}</label>{question.help_text && <p className="mt-1 text-xs leading-5 text-[#74817d]">{question.help_text}</p>}</>;
  if (question.question_type === "boolean") return <div className="rounded-2xl border border-[#dfe5e1] bg-white p-4">{common}<div className="mt-3 flex flex-wrap gap-3"><button type="button" onClick={() => onChange(true)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${value === true ? "bg-[#dcece1] text-[#285647]" : "bg-[#f4f6f3] text-[#65756d]"}`}>Sí</button><button type="button" onClick={() => onChange(false)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${value === false ? "bg-[#dcece1] text-[#285647]" : "bg-[#f4f6f3] text-[#65756d]"}`}>No</button></div></div>;
  if (question.question_type === "select") return <div>{common}<select className="nuth-input mt-2" value={valueText(value)} onChange={(event) => onChange(event.target.value)}><option value="">Selecciona una opción</option>{options.map((option) => <option key={option}>{option}</option>)}</select></div>;
  if (question.question_type === "multi_select") { const selectedValues = Array.isArray(value) ? value as unknown[] : []; return <div>{common}<details className="mt-2 rounded-xl border border-[#dfe5e1] bg-[#fbfcfa] p-3"><summary className="cursor-pointer text-sm font-semibold text-[#315e4f]">{selectedValues.length ? `${selectedValues.length} seleccionada${selectedValues.length === 1 ? "" : "s"}` : "Seleccionar opciones"}</summary><div className="mt-3 grid gap-2 sm:grid-cols-2">{options.map((option) => { const selected = selectedValues.includes(option); return <label key={option} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-[#42564d]"><input type="checkbox" checked={selected} onChange={() => onChange(selected ? selectedValues.filter((item) => item !== option) : [...selectedValues, option])} />{option}</label>; })}</div></details></div>; }
  if (question.question_type === "repeatable_group") {
    const rows = Array.isArray(value) ? value as Array<Record<string, string>> : [];
    return <div className="rounded-2xl border border-[#dfe5e1] bg-[#fbfcfa] p-4">{common}<div className="mt-3 space-y-3">{rows.map((row, rowIndex) => <div key={rowIndex} className="rounded-xl border border-[#e7ece8] bg-white p-3"><div className="grid gap-2 sm:grid-cols-2">{fields.map((field) => field.type === "select" ? <select key={field.key} className="nuth-input" value={row[field.key] ?? ""} onChange={(event) => onChange(rows.map((candidate, index) => index === rowIndex ? { ...candidate, [field.key]: event.target.value } : candidate))}><option value="">{field.label}</option>{field.options?.map((option) => <option key={option}>{option}</option>)}</select> : <Input key={field.key} type={field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "time" ? "time" : "text"} value={row[field.key] ?? ""} placeholder={field.label} onChange={(event) => onChange(rows.map((candidate, index) => index === rowIndex ? { ...candidate, [field.key]: event.target.value } : candidate))} />)}</div><button type="button" className="mt-2 text-xs font-semibold text-[#9b493a]" onClick={() => onChange(rows.filter((_, index) => index !== rowIndex))}>Quitar registro</button></div>)}</div><button type="button" className="mt-3 text-sm font-semibold text-[#3d705d]" onClick={() => onChange([...rows, Object.fromEntries(fields.map((field) => [field.key, ""]))])}>+ Agregar registro</button></div>;
  }
  const inputType = question.question_type === "number" ? "number" : question.question_type === "date" ? "date" : question.question_type === "time" ? "time" : "text";
  return <div>{common}{question.question_type === "long_text" ? <Textarea className="mt-2 min-h-28" value={valueText(value)} onChange={(event) => onChange(event.target.value)} /> : <Input className="mt-2" type={inputType} value={valueText(value)} onChange={(event) => onChange(question.question_type === "number" && event.target.value ? Number(event.target.value) : event.target.value)} />}</div>;
}

export function ConsultationPage() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [snapshot, setSnapshot] = useState<ConsultationSnapshot | null>(null);
  const [values, setValues] = useState<Values>({});
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const lastSaved = useRef("{}");

  const load = useCallback(async () => {
    if (!patientId) return;
    setLoading(true); setError("");
    try {
      const [loadedPatient, history] = await Promise.all([getPatient(patientId), listConsultations(patientId)]);
      if (!loadedPatient) throw new Error("No encontramos este paciente o no tienes autorización para verlo.");
      const desiredType: Consultation["consultation_type"] = history.some((item) => item.status === "completed") ? "follow_up" : "initial";
      const existing = await findDraft(patientId, desiredType);
      const started = existing ?? await beginConsultation(patientId, desiredType);
      const existingSnapshot = await getSnapshot(started.id);
      const loadedTemplate = existingSnapshot ? null : await loadActiveTemplate(started.consultation_type);
      const startedSnapshot = existingSnapshot ?? await ensureSnapshot(started, loadedTemplate!);
      const answers = await listAnswers(started.id);
      const nextValues = Object.fromEntries(answers.map((answer) => [answer.question_key, answer.value]));
      setPatient(loadedPatient); setConsultation(started); setSnapshot(startedSnapshot); setValues(nextValues); lastSaved.current = JSON.stringify(nextValues);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo iniciar la consulta."); }
    finally { setLoading(false); }
  }, [patientId]);
  // The consultation gets one immutable snapshot before any answer is captured.
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const sections = snapshot?.structure.sections ?? [];
  const current = sections[active];
  const save = async (showNotice = true) => {
    if (!consultation || !snapshot) return;
    const encoded = JSON.stringify(values);
    if (encoded === lastSaved.current) return;
    setSaving(true); setError("");
    try { await saveAnswers(consultation, snapshot, values); lastSaved.current = encoded; if (showNotice) setNotice("Borrador guardado."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar el borrador."); }
    finally { setSaving(false); }
  };
  useEffect(() => {
    if (!consultation || !snapshot || JSON.stringify(values) === lastSaved.current) return;
    const timer = window.setTimeout(() => { void save(false); }, 900);
    return () => window.clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, consultation?.id, snapshot?.id]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (JSON.stringify(values) !== lastSaved.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [values]);

  const goTo = async (index: number) => { await save(false); setActive(Math.max(0, Math.min(index, sections.length - 1))); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const complete = async () => {
    if (!consultation || !snapshot) return;
    const required = snapshot.structure.sections.flatMap((section) => section.questions).filter((question) => question.is_required && visible(question, values) && emptyValue(values[question.question_key]));
    if (required.length) { setError(`Completa los campos obligatorios antes de finalizar: ${required.slice(0, 2).map((question) => question.label).join(", ")}.`); return; }
    setSaving(true); setError("");
    try { await saveAnswers(consultation, snapshot, values); await finishConsultation(consultation.id, typeof values.professional_notes === "string" ? values.professional_notes : typeof values.clinical_notes === "string" ? values.clinical_notes : null); setNotice("Consulta finalizada y bloqueada en el historial."); setTimeout(() => navigate(`/app/patients/${patientId}`), 700); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo finalizar la consulta."); }
    finally { setSaving(false); }
  };

  if (loading) return <LoadingState label="Preparando consulta…" />;
  if (!patient || !consultation || !snapshot || !current) return <ErrorState message={error || "No pudimos abrir la consulta."} onRetry={() => void load()} />;
  const sectionQuestions = current.questions.filter((question) => visible(question, values));
  return <div className="mx-auto max-w-7xl pb-28"><header className="rounded-[28px] bg-[#173d36] p-5 text-white sm:p-7"><div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><Link to={`/app/patients/${patient.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-white/70 hover:text-white"><ArrowLeft size={16} />Volver a la ficha</Link><p className="mt-5 text-sm text-white/60">{consultationLabel(consultation)} · Borrador privado</p><h1 className="mt-1 text-3xl font-semibold">{patient.full_name}</h1><p className="mt-2 text-sm text-white/65">Iniciada el {formatPatientDate(consultation.consultation_date)}</p></div><div className="flex flex-wrap items-center gap-2"><Link className="rounded-xl border border-white/20 px-3 py-2 text-sm font-semibold" to={`/app/consultation-templates/${consultation.consultation_type}`}><SlidersHorizontal size={16} className="inline mr-1" />Plantilla</Link><button type="button" className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold" onClick={() => void save()} disabled={saving}>{saving ? <LoaderCircle className="inline animate-spin" size={16} /> : <Save className="inline mr-1" size={16} />}Guardar</button></div></div></header>
    {notice && <div className="mt-4"><SuccessNote>{notice}</SuccessNote></div>}{error && <div className="mt-4 rounded-xl bg-[#fbe9e5] px-4 py-3 text-sm text-[#963f32]">{error}</div>}
    <div className="mt-6 grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]"><aside className="lg:sticky lg:top-5 lg:h-fit"><label className="text-xs font-bold uppercase tracking-wide text-[#82908a] lg:hidden" htmlFor="consultation-section">Sección</label><select id="consultation-section" className="nuth-input mt-2 lg:hidden" value={active} onChange={(event) => void goTo(Number(event.target.value))}>{sections.map((section, index) => <option key={section.section_key} value={index}>{index + 1}. {section.title}</option>)}</select><nav className="hidden space-y-1 lg:block">{sections.map((section, index) => <button type="button" key={section.section_key} onClick={() => void goTo(index)} className={`w-full rounded-xl px-4 py-3 text-left text-sm font-semibold ${active === index ? "bg-[#dcece1] text-[#285647]" : "text-[#687870] hover:bg-white"}`}><span className="mr-2 text-xs opacity-70">{index + 1}</span>{section.title}</button>)}</nav></aside>
      <main className="min-w-0 rounded-[28px] border border-[#dfe5e1] bg-white p-5 sm:p-7"><p className="nuth-eyebrow">Sección {active + 1} de {sections.length}</p><h2 className="mt-2 text-2xl font-semibold text-[#173d36]">{current.title}</h2>{current.description && <div className="mt-4 rounded-2xl border border-[#d8e7dc] bg-[#eff7f1] p-4"><p className="text-xs font-bold uppercase tracking-wide text-[#477360]">Guión sugerido para la conversación</p><p className="mt-2 max-w-3xl text-sm leading-6 text-[#315e4f]">{current.description}</p></div>}<div className="mt-7 space-y-6">{sectionQuestions.map((question) => <QuestionField key={question.question_key} question={question} value={values[question.question_key]} onChange={(value) => setValues((currentValues) => ({ ...currentValues, [question.question_key]: value }))} />)}{!sectionQuestions.length && <EmptyState title="No hay campos visibles en esta sección." description="Los campos pueden depender de respuestas previas." />}</div></main></div>
    <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-[#dfe5e1] bg-white/95 px-4 py-3 backdrop-blur"><div className="mx-auto flex max-w-7xl items-center justify-between gap-3"><button type="button" className="nuth-button-secondary" disabled={active === 0 || saving} onClick={() => void goTo(active - 1)}><ChevronLeft size={16} />Anterior</button><span className="hidden text-xs text-[#74817d] sm:block">{saving ? "Guardando…" : "Se guarda automáticamente"}</span>{active === sections.length - 1 ? <button type="button" className="nuth-button" disabled={saving} onClick={() => void complete()}><Check size={16} />Finalizar consulta</button> : <button type="button" className="nuth-button" disabled={saving} onClick={() => void goTo(active + 1)}>Siguiente<ChevronRight size={16} /></button>}</div></footer>
  </div>;
}
