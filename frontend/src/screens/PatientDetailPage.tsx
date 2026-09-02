import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  Archive,
  ArrowLeft,
  CalendarPlus,
  Check,
  Edit3,
  FileText,
  LoaderCircle,
  MessageCircle,
  Plus,
  RotateCcw,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Field, Input, Textarea } from "@/src/components/ui/FormField";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  SuccessNote,
} from "@/src/components/ui/Status";
import { PatientEvolutionChart } from "@/src/components/patients/PatientEvolutionChart";
import { useAuth } from "@/src/features/auth/AuthProvider";
import {
  calculateAge,
  consultationLabel,
  formatPatientDate,
  normalizePhone,
  patientInitials,
  patientStatusLabel,
} from "@/src/features/patients/patientUtils";
import {
  getSignedPatientPhotoUrl,
  uploadPatientProgressPhoto,
} from "@/src/services/media";
import {
  archivePatient,
  assignPatientTag,
  createConsultation,
  createMeasurement,
  createPatientNote,
  createPatientTag,
  deletePatientNote,
  deletePatient,
  getPatient,
  listMeasurements,
  listNutritionPlans,
  listPatientAssignedTags,
  listPatientNotes,
  listPatientTags,
  listProgressPhotos,
  listQuestionnaireResponses,
  listQuestionnaireSubmissions,
  listConsultations,
  registerProgressPhoto,
  removePatientTag,
  restorePatient,
  updatePatient,
  updatePatientNote,
} from "@/src/services/patients";
import type {
  Consultation,
  NutritionPlan,
  Patient,
  PatientMeasurement,
  PatientNote,
  PatientProgressPhoto,
  PatientTag,
  QuestionnaireResponse,
  QuestionnaireSubmission,
} from "@/src/types/domain";

type HistoryTab = "consultations" | "measurements" | "plans" | "notes" | "evolution";
type ConfirmAction = "archive" | "delete" | "note-delete";

const countries = [
  ["+52", "México (+52)"],
  ["+1", "Estados Unidos / Canadá (+1)"],
  ["+34", "España (+34)"],
  ["+57", "Colombia (+57)"],
  ["+54", "Argentina (+54)"],
] as const;
const timezones = [
  "America/Mexico_City",
  "America/Bogota",
  "America/Santiago",
  "Europe/Madrid",
  "America/New_York",
];

function ConfirmDialog({
  action,
  patientName,
  busy,
  onCancel,
  onConfirm,
}: {
  action: ConfirmAction;
  patientName: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const note = action === "note-delete";
  const title = note
    ? "¿Eliminar esta nota?"
    : action === "archive"
      ? "¿Archivar este paciente?"
      : "¿Eliminar este paciente?";
  const description = note
    ? "La nota dejará de mostrarse en el historial."
    : action === "archive"
      ? `La ficha de ${patientName} dejará de aparecer entre los activos, pero conservará su historial.`
      : `La ficha de ${patientName} dejará de aparecer en tus listados. Su información histórica se conservará de forma segura.`;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#102d27]/45 p-4" role="dialog" aria-modal="true" aria-labelledby="patient-confirm-title">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h2 id="patient-confirm-title" className="text-xl font-semibold">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-[#74817d]">{description}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" className="nuth-button-secondary" onClick={onCancel}>Cancelar</button>
          <button type="button" disabled={busy} className={`nuth-button ${action !== "archive" ? "!bg-[#9b493a]" : ""}`} onClick={onConfirm}>
            {busy ? <LoaderCircle className="animate-spin" size={16} /> : <Trash2 size={16} />}
            {note ? "Eliminar nota" : action === "archive" ? "Archivar paciente" : "Eliminar paciente"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConsultationDetail({
  consultation,
  measurements,
  submissions,
  responses,
}: {
  consultation: Consultation | null;
  measurements: PatientMeasurement[];
  submissions: QuestionnaireSubmission[];
  responses: Record<string, QuestionnaireResponse[]>;
}) {
  if (!consultation) return <EmptyState title="Aún no hay consultas registradas." description="Crea la primera consulta para comenzar el historial longitudinal." />;
  const measurement = measurements.find((item) => item.consultation_id === consultation.id);
  const related = submissions.filter((item) => item.consultation_id === consultation.id);
  return <div className="space-y-5"><div className="rounded-2xl border border-[#dfe5e1] bg-[#fbfcfa] p-5"><p className="text-xs font-bold uppercase tracking-wide text-[#82908a]">{consultationLabel(consultation)}</p><h3 className="mt-2 text-2xl font-semibold">{formatPatientDate(consultation.consultation_date)}</h3>{consultation.summary && <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#5f6f68]">{consultation.summary}</p>}<div className="mt-4 flex flex-wrap gap-2 text-xs text-[#60726a]">{measurement && <span className="rounded-full bg-white px-3 py-1.5">{measurement.weight_kg} kg · IMC {measurement.bmi}</span>}{related.length > 0 && <span className="rounded-full bg-white px-3 py-1.5">Cuestionario asociado</span>}</div></div>{related.length === 0 ? <EmptyState title="Cuestionario pendiente" description="Esta consulta todavía no tiene un cuestionario asociado." /> : related.map((submission) => { const grouped = (responses[submission.id] ?? []).reduce<Record<string, QuestionnaireResponse[]>>((acc, response) => { (acc[response.section_key] ??= []).push(response); return acc; }, {}); return <section key={submission.id} className="rounded-2xl border border-[#dfe5e1] bg-white p-5"><h4 className="font-semibold">Cuestionario {submission.questionnaire_type === "initial" ? "de inicio" : "de seguimiento"} · v{submission.version}</h4>{Object.keys(grouped).length === 0 ? <p className="mt-3 text-sm text-[#74817d]">No hay respuestas capturadas.</p> : <div className="mt-4 space-y-2">{Object.entries(grouped).map(([section, sectionResponses], index) => <details key={section} open={index < 1} className="rounded-xl bg-[#f5f7f3] p-3"><summary className="cursor-pointer font-semibold text-[#315e4f]">{section}</summary><dl className="mt-3 space-y-2 text-sm">{sectionResponses.map((response) => <div key={response.id} className="grid gap-1 sm:grid-cols-[minmax(0,180px)_1fr]"><dt className="text-[#74817d]">{response.question_key}</dt><dd className="break-words text-[#42564d]">{typeof response.value === "string" ? response.value : JSON.stringify(response.value)}</dd></div>)}</dl></details>)}</div>}</section>; })}</div>;
}

function HistoryModal({
  tab,
  onTab,
  onClose,
  consultations,
  selectedConsultationId,
  onSelectConsultation,
  measurements,
  plans,
  notes,
  submissions,
  responses,
  onNewConsultation,
  onNewMeasurement,
  onCreateNote,
  onEditNote,
  onDeleteNote,
}: {
  tab: HistoryTab;
  onTab: (tab: HistoryTab) => void;
  onClose: () => void;
  consultations: Consultation[];
  selectedConsultationId: string | null;
  onSelectConsultation: (id: string) => void;
  measurements: PatientMeasurement[];
  plans: NutritionPlan[];
  notes: PatientNote[];
  submissions: QuestionnaireSubmission[];
  responses: Record<string, QuestionnaireResponse[]>;
  onNewConsultation: (event: FormEvent<HTMLFormElement>) => void;
  onNewMeasurement: (event: FormEvent<HTMLFormElement>) => void;
  onCreateNote: (event: FormEvent<HTMLFormElement>) => void;
  onEditNote: (note: PatientNote) => void;
  onDeleteNote: (note: PatientNote) => void;
}) {
  const selectedConsultation = consultations.find((item) => item.id === selectedConsultationId) ?? consultations[0] ?? null;
  const [measurementDetail, setMeasurementDetail] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [editingNote, setEditingNote] = useState<PatientNote | null>(null);
  const beginEdit = (note: PatientNote) => { setEditingNote(note); setNoteDraft(note.content); };
  const submitEdit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (editingNote && noteDraft.trim()) { onEditNote({ ...editingNote, content: noteDraft.trim() }); setEditingNote(null); setNoteDraft(""); } };
  return <div className="fixed inset-0 z-40 grid place-items-center bg-[#102d27]/45 p-0 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="history-title"><div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white sm:h-[90vh] sm:max-w-6xl sm:rounded-[28px] sm:shadow-2xl"><header className="flex items-center justify-between gap-4 border-b border-[#e3eae4] px-5 py-4 sm:px-7"><div><p className="nuth-eyebrow">Historial longitudinal</p><h2 id="history-title" className="mt-1 text-2xl font-semibold">Historial del paciente</h2></div><button type="button" className="rounded-xl p-2 text-[#74817d] hover:bg-[#f3f7f3]" onClick={onClose} aria-label="Cerrar historial"><X size={20} /></button></header><nav className="flex gap-1 overflow-x-auto border-b border-[#e3eae4] px-5 sm:px-7">{([['consultations','Consultas'],['measurements','Medidas'],['plans','Planes'],['notes','Notas'],['evolution','Evolución']] as const).map(([key,label]) => <button type="button" key={key} onClick={() => onTab(key)} className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold ${tab === key ? "border-[#3d705d] text-[#285647]" : "border-transparent text-[#86918c]"}`}>{label}</button>)}</nav><div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">{tab === "consultations" && <div className="grid gap-5 lg:grid-cols-[250px_1fr]"><div><div className="lg:hidden"><label className="text-xs font-semibold uppercase tracking-wide text-[#82908a]" htmlFor="consultation-select">Seleccionar consulta</label><select id="consultation-select" className="nuth-input mt-2" value={selectedConsultation?.id ?? ""} onChange={(event) => onSelectConsultation(event.target.value)}>{consultations.map((item) => <option key={item.id} value={item.id}>{consultationLabel(item)} · {formatPatientDate(item.consultation_date)}</option>)}</select></div><div className="hidden space-y-2 lg:block"><p className="text-xs font-bold uppercase tracking-wide text-[#82908a]">Consultas</p>{consultations.map((item) => <button type="button" key={item.id} className={`w-full rounded-xl p-3 text-left ${selectedConsultation?.id === item.id ? "bg-[#eaf3ed]" : "hover:bg-[#f5f7f3]"}`} onClick={() => onSelectConsultation(item.id)}><span className="block text-sm font-semibold text-[#315e4f]">{consultationLabel(item)}</span><span className="mt-1 block text-xs text-[#74817d]">{formatPatientDate(item.consultation_date)}</span></button>)}{!consultations.length && <p className="mt-3 text-sm text-[#74817d]">Aún no hay consultas.</p>}</div><form className="mt-5 rounded-xl border border-[#dfe5e1] bg-[#fbfcfa] p-3" onSubmit={onNewConsultation}><p className="text-sm font-semibold">Nueva consulta</p><Input className="mt-3" type="datetime-local" name="consultation_date" defaultValue={new Date().toISOString().slice(0,16)} required /><Textarea className="mt-2" name="summary" placeholder="Resumen breve (opcional)" /><button className="nuth-button mt-3 w-full justify-center"><CalendarPlus size={15} />Registrar</button></form></div><ConsultationDetail consultation={selectedConsultation} measurements={measurements} submissions={submissions} responses={responses} /></div>}{tab === "measurements" && <div className="space-y-5"><form className="grid gap-3 rounded-2xl border border-[#dfe5e1] bg-[#fbfcfa] p-4 md:grid-cols-[1fr_1fr_1fr_auto]" onSubmit={onNewMeasurement}><select name="consultation_id" className="nuth-input" defaultValue={selectedConsultation?.id ?? ""}><option value="">Sin consulta asociada</option>{consultations.map((item) => <option key={item.id} value={item.id}>{consultationLabel(item)}</option>)}</select><Input name="measured_at" type="date" defaultValue={new Date().toISOString().slice(0,10)} required /><Input name="weight_kg" type="number" min="0.1" max="1000" step="0.01" placeholder="Peso (kg)" required /><div className="flex gap-2"><Input name="height_cm" type="number" min="20" max="300" step="0.01" placeholder="Estatura (cm)" required /><button className="nuth-button" aria-label="Guardar medición"><Plus size={16} /></button></div></form>{measurements.length ? <div className="overflow-x-auto rounded-2xl border border-[#dfe5e1]"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-[#f5f7f3] text-xs uppercase tracking-wide text-[#82908a]"><tr><th className="px-4 py-3">Consulta</th><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Peso</th><th className="px-4 py-3">IMC</th><th className="px-4 py-3" /></tr></thead><tbody className="divide-y divide-[#edf1ed]">{measurements.map((item) => <tr key={item.id}><td className="px-4 py-3">{consultations.find((consultation) => consultation.id === item.consultation_id) ? consultationLabel(consultations.find((consultation) => consultation.id === item.consultation_id)!) : "Sin consulta"}</td><td className="px-4 py-3">{formatPatientDate(item.measured_at)}</td><td className="px-4 py-3">{item.weight_kg} kg</td><td className="px-4 py-3 font-semibold text-[#285647]">{item.bmi}</td><td className="px-4 py-3 text-right"><button type="button" className="text-xs font-semibold text-[#3d705d]" onClick={() => setMeasurementDetail(measurementDetail === item.id ? null : item.id)}>{measurementDetail === item.id ? "Ocultar" : "Ver detalle"}</button></td></tr>)}{measurementDetail && <tr><td colSpan={5} className="bg-[#fbfcfa] px-4 py-4 text-sm"><strong>Valores capturados:</strong> peso {measurements.find((item) => item.id === measurementDetail)?.weight_kg} kg · estatura {measurements.find((item) => item.id === measurementDetail)?.height_cm} cm · fecha {formatPatientDate(measurements.find((item) => item.id === measurementDetail)?.measured_at)}<br /><strong>Valor calculado:</strong> IMC {measurements.find((item) => item.id === measurementDetail)?.bmi}. No se aplican diagnósticos automáticos.</td></tr>}</tbody></table></div> : <EmptyState title="No hay mediciones registradas." description="Registra una medición para comenzar la evolución." />}</div>}{tab === "plans" && <div>{plans.length ? <div className="overflow-x-auto rounded-2xl border border-[#dfe5e1]"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-[#f5f7f3] text-xs uppercase text-[#82908a]"><tr><th className="px-4 py-3">Consulta</th><th className="px-4 py-3">Asignado</th><th className="px-4 py-3">Revisión</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Calorías</th></tr></thead><tbody className="divide-y divide-[#edf1ed]">{plans.map((plan) => <tr key={plan.id}><td className="px-4 py-3">{consultations.find((item) => item.id === plan.consultation_id) ? consultationLabel(consultations.find((item) => item.id === plan.consultation_id)!) : "Sin consulta"}</td><td className="px-4 py-3">{formatPatientDate(plan.assigned_at)}</td><td className="px-4 py-3">{formatPatientDate(plan.review_date)}</td><td className="px-4 py-3">{plan.plan_type || "—"}</td><td className="px-4 py-3">{plan.target_calories ? `${plan.target_calories} kcal` : "—"}</td></tr>)}</tbody></table></div> : <EmptyState title="No hay planes registrados." description="El historial quedará disponible cuando conectemos el módulo de planes." />}</div>}{tab === "notes" && <div className="grid gap-5 lg:grid-cols-[.8fr_1.2fr]"><form className="rounded-2xl border border-[#dfe5e1] bg-[#fbfcfa] p-5" onSubmit={onCreateNote}><p className="text-sm font-semibold">Crear nota libre</p><p className="mt-1 text-xs leading-5 text-[#74817d]">Puedes asociarla a una consulta o dejarla como nota general.</p><Textarea name="content" className="mt-4" placeholder="Escribe una nota para recordar…" required /><select name="consultation_id" className="nuth-input mt-3"><option value="">Nota general</option>{consultations.map((item) => <option key={item.id} value={item.id}>{consultationLabel(item)}</option>)}</select><button className="nuth-button mt-4"><Plus size={16} />Guardar nota</button></form><div className="space-y-3">{notes.length ? notes.map((note) => <article key={note.id} className="rounded-2xl border border-[#dfe5e1] bg-white p-4"><p className="whitespace-pre-wrap text-sm leading-6 text-[#42564d]">{note.content}</p><p className="mt-3 text-xs text-[#82908a]">{formatPatientDate(note.updated_at)}{note.consultation_id ? " · Asociada a consulta" : " · Nota general"}</p><div className="mt-3 flex gap-3"><button type="button" className="text-xs font-semibold text-[#3d705d]" onClick={() => beginEdit(note)}>Editar</button><button type="button" className="text-xs font-semibold text-[#9b493a]" onClick={() => onDeleteNote(note)}>Eliminar</button></div></article>) : <EmptyState title="Aún no has creado notas." description="Las notas libres aparecerán aquí." />}{editingNote && <form className="rounded-2xl border border-[#dfe5e1] bg-white p-4" onSubmit={submitEdit}><p className="text-sm font-semibold">Editar nota</p><Textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} className="mt-3" required /><div className="mt-3 flex gap-2"><button className="nuth-button"><Check size={16} />Guardar cambios</button><button type="button" className="nuth-button-secondary" onClick={() => setEditingNote(null)}>Cancelar</button></div></form>}</div></div>}{tab === "evolution" && <PatientEvolutionChart measurements={measurements} />}</div></div></div>;
}

function RecentConsultations({
  consultations,
  onOpen,
}: {
  consultations: Consultation[];
  onOpen: (id: string) => void;
}) {
  if (!consultations.length) {
    return <EmptyState title="Aún no hay consultas registradas." description="Registra una nueva consulta para comenzar." />;
  }
  return (
    <div className="mt-5 space-y-2">
      {consultations.slice(0, 5).map((item) => (
        <button type="button" key={item.id} className="flex w-full items-center justify-between rounded-xl border border-[#e4eae5] p-4 text-left hover:bg-[#f5f7f3]" onClick={() => onOpen(item.id)}>
          <span><span className="block font-semibold text-[#315e4f]">{consultationLabel(item)}</span><span className="mt-1 block text-xs text-[#82908a]">{formatPatientDate(item.consultation_date)}</span></span>
          <span className="text-sm text-[#3d705d]">Ver →</span>
        </button>
      ))}
    </div>
  );
}

export function PatientDetailPage({ recordMode = false }: { recordMode?: boolean }) {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [measurements, setMeasurements] = useState<PatientMeasurement[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [notes, setNotes] = useState<PatientNote[]>([]);
  const [plans, setPlans] = useState<NutritionPlan[]>([]);
  const [submissions, setSubmissions] = useState<QuestionnaireSubmission[]>([]);
  const [responses, setResponses] = useState<Record<string, QuestionnaireResponse[]>>({});
  const [tags, setTags] = useState<PatientTag[]>([]);
  const [photos, setPhotos] = useState<PatientProgressPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(recordMode);
  const [historyTab, setHistoryTab] = useState<HistoryTab>("consultations");
  const [selectedConsultationId, setSelectedConsultationId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ action: ConfirmAction; note?: PatientNote } | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const load = async () => {
    if (!patientId) return;
    setLoading(true); setError("");
    try {
      const [p, m, c, n, pl, subs, allTags, assigned, ph] = await Promise.all([getPatient(patientId), listMeasurements(patientId), listConsultations(patientId), listPatientNotes(patientId), listNutritionPlans(patientId), listQuestionnaireSubmissions(patientId), listPatientTags(), listPatientAssignedTags(patientId), listProgressPhotos(patientId)]);
      if (!p) { setPatient(null); setError("No encontramos este paciente o no tienes autorización para verlo."); return; }
      const responseEntries = await Promise.all(subs.map(async (submission) => [submission.id, await listQuestionnaireResponses(submission.id)] as const));
      setPatient({ ...p, tags: assigned }); setMeasurements(m); setConsultations(c); setNotes(n); setPlans(pl); setSubmissions(subs); setResponses(Object.fromEntries(responseEntries)); setTags(allTags); setSelectedConsultationId((current) => current ?? c[0]?.id ?? null);
      setPhotos(await Promise.all(ph.map(async (item) => ({ ...item, signedUrl: await getSignedPatientPhotoUrl(item.storage_path) ?? undefined }))));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo cargar la ficha."); } finally { setLoading(false); }
  };
  // Loading is intentionally triggered when the route changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);
  if (loading) return <LoadingState label="Cargando ficha del paciente…" />;
  if (!patient) return <div><Link to="/app/patients" className="inline-flex items-center gap-2 text-sm font-semibold text-[#3d705d]"><ArrowLeft size={16} />Volver a pacientes</Link><div className="mt-6"><ErrorState message={error || "Paciente no encontrado."} onRetry={() => void load()} /></div></div>;
  const assigned = patient.tags ?? [];
  const age = calculateAge(patient.birth_date);
  const openHistory = (tab: HistoryTab = "consultations") => { setHistoryTab(tab); setSelectedConsultationId((current) => current ?? consultations[0]?.id ?? null); setHistoryOpen(true); };
  const run = async (action: () => Promise<void>, message: string) => { setBusy(true); setError(""); try { await action(); setNotice(message); } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo completar la acción."); } finally { setBusy(false); } };
  const save = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const email = String(form.get("email") || "").trim(); const localPhone = String(form.get("phone") || "").trim(); const countryCode = String(form.get("country_code") || ""); if (localPhone && localPhone.replace(/\D/g, "").length < 7) { setError("Escribe un número de teléfono válido."); return; } if (form.get("portal_access_enabled") && !email) { setError("Para activar el portal necesitas un correo."); return; } await run(async () => { const updated = await updatePatient(patient.id, { full_name: String(form.get("full_name") || "").trim(), email: email || null, country_code: localPhone ? countryCode : null, phone: localPhone ? normalizePhone(countryCode, localPhone) : null, timezone: String(form.get("timezone") || patient.timezone), birth_date: String(form.get("birth_date") || "") || null, gender: String(form.get("gender") || "") || null, portal_access_enabled: Boolean(form.get("portal_access_enabled")) }); setPatient({ ...updated, tags: assigned }); setEditing(false); }, "Datos actualizados."); };
  const addConsultation = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); await run(async () => { const created = await createConsultation(patient.id, { consultation_date: new Date(String(form.get("consultation_date"))).toISOString(), status: "completed", summary: String(form.get("summary") || "") || null }); setConsultations((current) => [created, ...current]); setSelectedConsultationId(created.id); event.currentTarget.reset(); }, "Consulta registrada."); };
  const addMeasurement = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); await run(async () => { const created = await createMeasurement(patient.id, { consultation_id: String(form.get("consultation_id") || "") || null, measured_at: new Date(`${String(form.get("measured_at"))}T12:00:00`).toISOString(), weight_kg: Number(form.get("weight_kg")), height_cm: Number(form.get("height_cm")) }); setMeasurements((current) => [created, ...current].sort((a, b) => new Date(b.measured_at).getTime() - new Date(a.measured_at).getTime())); event.currentTarget.reset(); }, "Medición agregada."); };
  const addNote = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); await run(async () => { const created = await createPatientNote(patient.id, String(form.get("content") || ""), String(form.get("consultation_id") || "") || null); setNotes((current) => [created, ...current]); event.currentTarget.reset(); }, "Nota guardada."); };
  const editNote = async (note: PatientNote) => { await run(async () => { const updated = await updatePatientNote(note.id, note.content); setNotes((current) => current.map((item) => item.id === updated.id ? updated : item)); }, "Nota actualizada."); };
  const deleteNote = async () => { if (!confirm?.note) return; const id = confirm.note.id; setConfirm(null); await run(async () => { await deletePatientNote(id); setNotes((current) => current.filter((item) => item.id !== id)); }, "Nota eliminada."); };
  const toggleTag = async (tag: PatientTag) => { const has = assigned.some((item) => item.id === tag.id); await run(async () => { if (has) await removePatientTag(patient.id, tag.id); else await assignPatientTag(patient.id, tag.id); setPatient((current) => current ? { ...current, tags: has ? (current.tags ?? []).filter((item) => item.id !== tag.id) : [...(current.tags ?? []), tag] } : current); }, has ? "Etiqueta quitada." : "Etiqueta agregada."); };
  const addTag = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const name = String(form.get("tag") || "").trim(); if (!name) return; await run(async () => { const existing = tags.find((tag) => tag.name.toLowerCase() === name.toLowerCase()); const tag = existing ?? await createPatientTag(name); if (!existing) setTags((current) => [...current, tag]); if (!assigned.some((item) => item.id === tag.id)) { await assignPatientTag(patient.id, tag.id); setPatient((current) => current ? { ...current, tags: [...(current.tags ?? []), tag] } : current); } event.currentTarget.reset(); }, "Etiqueta agregada."); };
  const uploadPhoto = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (!file || !user) return; setPhotoBusy(true); try { const path = await uploadPatientProgressPhoto(file, patient.id, user.id); await registerProgressPhoto(patient.id, path); const refreshed = await listProgressPhotos(patient.id); setPhotos(await Promise.all(refreshed.map(async (item) => ({ ...item, signedUrl: await getSignedPatientPhotoUrl(item.storage_path) ?? undefined })))); setNotice("Foto privada guardada."); } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo subir la foto."); } finally { setPhotoBusy(false); event.target.value = ""; } };
  const confirmAction = async () => { if (!confirm) return; if (confirm.action === "note-delete") return deleteNote(); const action = confirm.action; setConfirm(null); await run(async () => { if (action === "archive") { const updated = await archivePatient(patient.id); setPatient({ ...updated, tags: assigned }); } else { await deletePatient(patient.id); navigate("/app/patients"); } }, action === "archive" ? "Paciente archivado." : "Paciente eliminado de la lista."); };
  const restore = async () => { await run(async () => { const updated = await restorePatient(patient.id); setPatient({ ...updated, tags: assigned }); }, "Paciente restaurado."); };
  const genderLabel = patient.gender === "female" ? "Mujer" : patient.gender === "male" ? "Hombre" : patient.gender === "non_binary" ? "No binario" : patient.gender === "other" ? "Otro" : "No indicado";
  return (
    <div>
      <Link to="/app/patients" className="inline-flex items-center gap-2 text-sm font-semibold text-[#3d705d]"><ArrowLeft size={16} />Volver a pacientes</Link>
      {notice && <div className="mt-4"><SuccessNote>{notice}</SuccessNote></div>}
      <header className="mt-6 rounded-[28px] bg-[#173d36] p-6 text-white sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="grid h-16 w-16 place-items-center rounded-3xl bg-[#e4b374] text-lg font-bold text-[#173d36]">{patientInitials(patient)}</span>
            <div><p className="text-sm text-white/60">Ficha de paciente</p><h1 className="mt-1 text-3xl font-semibold">{patient.full_name}</h1><p className="mt-2 text-sm text-white/65">{age === null ? "Edad no indicada" : age + " años"}{patient.email ? " · " + patient.email : ""}</p></div>
          </div>
          <div className="flex flex-wrap gap-2"><button type="button" className="nuth-button !bg-[#efbd6b] !text-[#173d36]" onClick={() => openHistory("consultations")}><CalendarPlus size={16} />Nueva consulta</button><button type="button" className="rounded-xl border border-white/20 px-3 py-2 text-sm font-semibold" onClick={() => setEditing(true)}><Edit3 size={16} />Editar</button></div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2"><span className="rounded-full bg-white/10 px-3 py-1.5 text-xs">Paciente {patientStatusLabel(patient.status).toLowerCase()}</span>{patient.portal_access_enabled && <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs"><ShieldCheck size={14} />Portal habilitado</span>}</div>
      </header>
      {editing && (
        <form onSubmit={save} className="mt-5 rounded-2xl border border-[#dfe5e1] bg-white p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre completo" name="edit-name"><Input name="full_name" defaultValue={patient.full_name} required /></Field>
            <Field label="Correo" name="edit-email"><Input name="email" type="email" defaultValue={patient.email ?? ""} /></Field>
            <Field label="Lada" name="edit-country"><select name="country_code" className="nuth-input" defaultValue={patient.country_code ?? "+52"}>{countries.map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></Field>
            <Field label="Teléfono" name="edit-phone"><Input name="phone" type="tel" inputMode="numeric" defaultValue={patient.phone && patient.country_code ? patient.phone.slice(patient.country_code.length) : patient.phone ?? ""} /></Field>
            <Field label="Zona horaria" name="edit-timezone"><select name="timezone" className="nuth-input" defaultValue={patient.timezone}>{timezones.map((timezone) => <option key={timezone}>{timezone}</option>)}</select></Field>
            <Field label="Fecha de nacimiento" name="edit-birth"><Input name="birth_date" type="date" max={new Date().toISOString().slice(0, 10)} defaultValue={patient.birth_date ?? ""} /></Field>
            <Field label="Género" name="edit-gender"><select name="gender" className="nuth-input" defaultValue={patient.gender ?? ""}><option value="">No indicado</option><option value="female">Mujer</option><option value="male">Hombre</option><option value="non_binary">No binario</option><option value="other">Otro</option></select></Field>
          </div>
          <label className="mt-4 flex items-start gap-3 rounded-2xl bg-[#f3f7f3] p-4 text-sm"><input type="checkbox" name="portal_access_enabled" className="mt-1" defaultChecked={patient.portal_access_enabled} /><span><span className="block font-semibold">Permitir acceso al portal/app</span><span className="mt-1 block text-xs text-[#75827d]">Requiere un correo electrónico.</span></span></label>
          <div className="mt-4 flex gap-3"><button className="nuth-button" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" size={16} /> : <Check size={16} />}Guardar</button><button type="button" className="nuth-button-secondary" onClick={() => setEditing(false)}>Cancelar</button></div>
        </form>
      )}
      {recordMode ? (
        <section className="mt-6 rounded-2xl border border-[#dfe5e1] bg-white p-8">
          <div className="flex items-center gap-3"><FileText className="text-[#3d705d]" /><div><h2 className="text-2xl font-semibold">Expediente clínico</h2><p className="mt-1 text-sm text-[#74817d]">Este espacio queda preparado para integrar antecedentes, historia clínica, cuestionarios, consultas, medidas, notas y planes.</p></div></div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2"><div className="rounded-xl bg-[#f5f7f3] p-4"><p className="text-xs uppercase tracking-wide text-[#82908a]">Datos personales</p><p className="mt-2 font-semibold">{patient.full_name}</p><p className="mt-1 text-sm text-[#74817d]">{patient.email || "Sin correo"} · {genderLabel}</p></div><div className="rounded-xl bg-[#f5f7f3] p-4"><p className="text-xs uppercase tracking-wide text-[#82908a]">Historial disponible</p><p className="mt-2 font-semibold">{consultations.length} consultas · {measurements.length} mediciones</p><button type="button" className="mt-3 text-sm font-semibold text-[#3d705d]" onClick={() => openHistory("consultations")}>Abrir historial →</button></div></div>
        </section>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="space-y-5">
            <section className="rounded-2xl border border-[#dfe5e1] bg-white p-5"><h2 className="text-lg font-semibold">Información del paciente</h2><dl className="mt-4 space-y-3 text-sm"><div><dt className="text-xs text-[#82908a]">Correo</dt><dd className="mt-1 break-words font-semibold">{patient.email || "No indicado"}</dd></div><div><dt className="text-xs text-[#82908a]">Teléfono</dt><dd className="mt-1 font-semibold">{patient.phone || "No indicado"}</dd></div><div><dt className="text-xs text-[#82908a]">Nacimiento</dt><dd className="mt-1 font-semibold">{patient.birth_date ? formatPatientDate(patient.birth_date) : "No indicada"}</dd></div><div><dt className="text-xs text-[#82908a]">Género</dt><dd className="mt-1 font-semibold">{genderLabel}</dd></div></dl></section>
            <section className="rounded-2xl border border-[#dfe5e1] bg-white p-5"><h2 className="text-lg font-semibold">Etiquetas</h2><p className="mt-1 text-xs leading-5 text-[#74817d]">Usa etiquetas para organizar y encontrar pacientes rápidamente.</p><div className="mt-4 flex flex-wrap gap-2">{tags.map((tag) => <button type="button" key={tag.id} onClick={() => void toggleTag(tag)} className={assigned.some((item) => item.id === tag.id) ? "rounded-full bg-[#dcece1] px-3 py-1.5 text-xs font-semibold text-[#285647]" : "rounded-full bg-[#f3f5f2] px-3 py-1.5 text-xs font-semibold text-[#87938e]"}>{assigned.some((item) => item.id === tag.id) ? "✓ " : ""}{tag.name}</button>)}</div><form className="mt-4 flex gap-2" onSubmit={addTag}><Input name="tag" aria-label="Nueva etiqueta" placeholder="Nueva etiqueta" /><button className="nuth-button !px-3" aria-label="Agregar etiqueta"><Plus size={16} /></button></form></section>
            <section className="rounded-2xl border border-[#dfe5e1] bg-white p-5"><h2 className="text-lg font-semibold">Acciones</h2><div className="mt-4 grid gap-2"><button type="button" className="nuth-button-secondary justify-start" onClick={() => openHistory("consultations")}><CalendarPlus size={16} />Nueva consulta</button><button type="button" className="nuth-button-secondary justify-start" onClick={() => openHistory("consultations")}><FileText size={16} />Ver historial</button><button type="button" className="nuth-button-secondary justify-start" onClick={() => navigate("/app/patients/" + patient.id + "/record")}><FileText size={16} />Ver expediente</button><button type="button" className="nuth-button-secondary justify-start" onClick={() => setNotice("La transferencia de pacientes estará disponible próximamente.")}><UserRound size={16} />Transferir paciente</button><button type="button" className="nuth-button-secondary justify-start" onClick={() => setNotice("Mensajería estará disponible próximamente.")}><MessageCircle size={16} />Enviar mensaje</button><button type="button" className="nuth-button-secondary justify-start" onClick={() => setNotice("El calendario estará disponible próximamente.")}><CalendarPlus size={16} />Ver calendario</button>{patient.status === "archived" ? <button type="button" className="nuth-button-secondary justify-start" onClick={() => void restore()}><RotateCcw size={16} />Restaurar paciente</button> : <button type="button" className="nuth-button-secondary justify-start" onClick={() => setConfirm({ action: "archive" })}><Archive size={16} />Archivar paciente</button>}<button type="button" className="justify-start rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#9b493a]" onClick={() => setConfirm({ action: "delete" })}><Trash2 size={16} />Eliminar paciente</button></div></section>
          </aside>
          <main className="min-w-0 space-y-5">
            <section className="rounded-2xl border border-[#dfe5e1] bg-white p-5 sm:p-6"><PatientEvolutionChart measurements={measurements} compact /></section>
            <section className="rounded-2xl border border-[#dfe5e1] bg-white p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Consultas recientes</h2><p className="mt-1 text-sm text-[#74817d]">Una vista rápida de tu seguimiento.</p></div><button type="button" className="nuth-button-secondary" onClick={() => openHistory("consultations")}>Ver historial</button></div><RecentConsultations consultations={consultations} onOpen={(id) => { setSelectedConsultationId(id); openHistory("consultations"); }} /></section>
            <section className="rounded-2xl border border-[#dfe5e1] bg-white p-5 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Fotos de progreso</h2><p className="mt-1 text-sm text-[#74817d]">Privadas y accesibles sólo desde tu espacio.</p></div><label className="nuth-button cursor-pointer">{photoBusy ? "Subiendo…" : "Subir foto"}<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => void uploadPhoto(event)} /></label></div>{photos.length ? <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">{photos.map((photo) => photo.signedUrl && <img key={photo.id} src={photo.signedUrl} alt={photo.caption || "Foto de progreso"} className="aspect-square rounded-2xl object-cover" />)}</div> : <p className="mt-4 text-sm text-[#74817d]">Aún no hay fotos.</p>}</section>
          </main>
        </div>
      )}
      {historyOpen && <HistoryModal tab={historyTab} onTab={setHistoryTab} onClose={() => setHistoryOpen(false)} consultations={consultations} selectedConsultationId={selectedConsultationId} onSelectConsultation={setSelectedConsultationId} measurements={measurements} plans={plans} notes={notes} submissions={submissions} responses={responses} onNewConsultation={addConsultation} onNewMeasurement={addMeasurement} onCreateNote={addNote} onEditNote={(note) => void editNote(note)} onDeleteNote={(note) => setConfirm({ action: "note-delete", note })} />}
      {confirm && <ConfirmDialog action={confirm.action} patientName={patient.full_name} busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => void confirmAction()} />}
    </div>
  );
}
