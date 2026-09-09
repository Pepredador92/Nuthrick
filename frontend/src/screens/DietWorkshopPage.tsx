import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarRange,
  Check,
  ChevronRight,
  Circle,
  ClipboardPenLine,
  Clock3,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Save,
  UserPlus,
} from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ErrorState, LoadingState } from "@/src/components/ui/Status";
import { calculateAge, consultationLabel, formatPatientDate } from "@/src/features/patients/patientUtils";
import {
  createDietPlan,
  getDietPlan,
  listDietPlans,
  loadDietReferenceData,
  updateDietPlan,
  type DietReferenceData,
} from "@/src/services/dietPlans";
import { getPatient, listConsultations, listPatients } from "@/src/services/patients";
import type { Consultation, NutritionPlan, Patient } from "@/src/types/domain";

const steps = [
  { id: "energy", label: "Objetivo energético", ready: true },
  { id: "macros", label: "Macronutrientes", ready: false },
  { id: "equivalents", label: "Equivalentes", ready: false },
  { id: "meals", label: "Tiempos de comida", ready: false },
  { id: "menu", label: "Menú", ready: false },
  { id: "review", label: "Revisión", ready: false },
] as const;

function consultationStatus(consultation: Consultation) {
  if (consultation.status === "draft") return "Borrador";
  if (consultation.status === "completed") return "Completada";
  return "Cancelada";
}

function planStatus(plan: NutritionPlan) {
  if (plan.status === "draft") return "Borrador";
  if (plan.status === "active") return "Activo";
  return "Archivado";
}

function ConsultationChoice({
  consultation,
  selected,
  onSelect,
}: {
  consultation: Consultation;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${selected ? "border-[#719381] bg-[#edf5ef]" : "border-[#dfe6e1] bg-white hover:border-[#aabdb2]"}`}
    >
      <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${selected ? "border-[#3d705d] bg-[#3d705d] text-white" : "border-[#bdcac2] text-transparent"}`}>
        <Check size={12} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-[#24463b]">{consultationLabel(consultation)}</span>
        <span className="mt-1 block text-sm text-[#64756d]">{formatPatientDate(consultation.consultation_date)}</span>
      </span>
      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#607269]">{consultationStatus(consultation)}</span>
    </button>
  );
}

function SourcePicker({
  patient,
  consultations,
  selectedId,
  busy,
  error,
  onSelect,
  onCreate,
}: {
  patient: Patient;
  consultations: Consultation[];
  selectedId: string | null;
  busy: boolean;
  error?: string;
  onSelect: (id: string | null) => void;
  onCreate: (consultationId: string | null) => void;
}) {
  return (
    <div className="mx-auto max-w-4xl">
      <Link to={`/app/patients/${patient.id}`} className="inline-flex items-center gap-2 text-sm font-semibold text-[#3d705d]">
        <ArrowLeft size={16} /> Volver a la ficha
      </Link>
      <header className="mt-5 rounded-[28px] bg-[#173d36] p-6 text-white sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-[#efbd6b]">Taller de dietas</p>
        <h1 className="mt-2 text-3xl font-semibold">Elige la fuente del plan</h1>
        <p className="mt-3 text-sm leading-6 text-white/70">Paciente seleccionado: <strong className="text-white">{patient.full_name}</strong></p>
      </header>
      <section className="mt-5 rounded-[24px] border border-[#dfe6e1] bg-white p-5 sm:p-7">
        <h2 className="text-xl font-semibold text-[#173d36]">¿Qué consulta quieres utilizar como fuente?</h2>
        <p className="mt-2 text-sm leading-6 text-[#718078]">El Taller sólo leerá los datos guardados en esa consulta. No modificará el expediente.</p>
        {error && <p role="alert" className="mt-4 rounded-xl bg-[#fbe9e5] px-4 py-3 text-sm text-[#963f32]">{error}</p>}
        {consultations.length ? (
          <div className="mt-5 space-y-3" role="radiogroup" aria-label="Consulta fuente">
            {consultations.map((consultation) => (
              <ConsultationChoice key={consultation.id} consultation={consultation} selected={selectedId === consultation.id} onSelect={() => onSelect(consultation.id)} />
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-[#cdd9d1] bg-[#fbfcfa] p-6 text-center">
            <CalendarRange className="mx-auto text-[#789087]" size={22} />
            <p className="mt-3 font-semibold text-[#355c4e]">Este paciente todavía no tiene consultas.</p>
            <p className="mt-1 text-sm text-[#74817d]">Puedes comenzar un plan sin consulta y asignar una fuente después.</p>
          </div>
        )}
        <div className="mt-6 flex flex-col-reverse gap-3 border-t border-[#e8ede9] pt-5 sm:flex-row sm:justify-end">
          <button type="button" disabled={busy} className="nuth-button-secondary justify-center" onClick={() => onCreate(null)}>
            Crear plan sin consulta
          </button>
          {consultations.length > 0 && (
            <button type="button" disabled={busy || !selectedId} className="nuth-button justify-center" onClick={() => onCreate(selectedId)}>
              {busy ? <LoaderCircle size={16} className="animate-spin" /> : <ClipboardPenLine size={16} />}
              Abrir taller
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function PlanContextHeader({
  plan,
  patient,
  consultation,
  saving,
  onChangeContext,
  onSaveAndExit,
}: {
  plan: NutritionPlan;
  patient: Patient | null;
  consultation: Consultation | null;
  saving: boolean;
  onChangeContext: () => void;
  onSaveAndExit: () => void;
}) {
  return (
    <header className="sticky top-20 z-10 rounded-[22px] border border-[#d7e1da] bg-white/95 p-4 shadow-[0_12px_35px_rgba(23,61,54,.08)] backdrop-blur sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="nuth-eyebrow">Taller de dietas</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3 sm:gap-6">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#8a9690]">Paciente</p>
              <p className="mt-1 truncate text-sm font-semibold text-[#23473b]">{patient?.full_name || "Sin asignar"}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#8a9690]">Consulta fuente</p>
              <p className="mt-1 truncate text-sm font-semibold text-[#23473b]">{consultation ? formatPatientDate(consultation.consultation_date) : "Sin asignar"}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#8a9690]">Plan</p>
              <p className="mt-1 truncate text-sm font-semibold text-[#23473b]">{plan.title} · {planStatus(plan)}</p>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" className="nuth-button-secondary !px-3 !py-2.5 !text-xs" onClick={onChangeContext}>
            {patient ? <CalendarRange size={15} /> : <UserPlus size={15} />}
            {patient ? "Cambiar consulta" : "Asignar paciente"}
          </button>
          <button type="button" className="nuth-button !px-3 !py-2.5 !text-xs" disabled={saving} onClick={onSaveAndExit}>
            {saving ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}
            Guardar y salir
          </button>
        </div>
      </div>
    </header>
  );
}

function WorkshopNavigation() {
  return (
    <nav className="mt-5 overflow-x-auto border-b border-[#dfe6e1]" aria-label="Secciones del Taller de dietas">
      <ol className="flex min-w-max gap-1">
        {steps.map((step, index) => (
          <li key={step.id}>
            <button
              type="button"
              disabled={!step.ready}
              aria-current={step.ready ? "step" : undefined}
              className={`flex items-center gap-2 rounded-t-xl px-4 py-3 text-sm font-semibold ${step.ready ? "bg-[#e7f0ea] text-[#285647]" : "cursor-not-allowed text-[#98a39e]"}`}
            >
              <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${step.ready ? "bg-[#3d705d] text-white" : "bg-[#e9eeea] text-[#89958f]"}`}>{index + 1}</span>
              {step.label}
              {!step.ready && <LockKeyhole size={12} aria-label="Próximamente" />}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function ReferenceValue({ label, value, detail }: { label: string; value: string | null; detail: string }) {
  return (
    <div className="rounded-2xl border border-[#e1e8e3] bg-[#fbfcfa] p-4">
      <p className="text-xs font-semibold text-[#718078]">{label}</p>
      <p className={`mt-2 text-xl font-semibold ${value ? "text-[#1f483a]" : "text-[#89958f]"}`}>{value || "No disponible"}</p>
      <p className="mt-1 text-[11px] leading-5 text-[#8a9690]">{detail}</p>
    </div>
  );
}

function ReferenceDataPanel({ patient, consultation, data, loading }: { patient: Patient | null; consultation: Consultation | null; data: DietReferenceData | null; loading: boolean }) {
  const age = patient?.birth_date ? calculateAge(patient.birth_date, consultation ? new Date(consultation.consultation_date) : new Date()) : null;
  const height = data?.height
    ? data.height.unit === "cm"
      ? `${(data.height.value / 100).toLocaleString("es-MX", { maximumFractionDigits: 2 })} m`
      : `${data.height.value.toLocaleString("es-MX")} ${data.height.unit}`
    : null;
  if (loading) return <LoadingState label="Leyendo datos de la consulta…" />;
  return (
    <section className="rounded-[24px] border border-[#dfe6e1] bg-white p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="nuth-eyebrow">Fuente clínica</p>
          <h2 className="mt-2 text-xl font-semibold text-[#173d36]">Datos de referencia</h2>
          <p className="mt-2 text-sm leading-6 text-[#718078]">Sólo lectura. Estos datos permanecen en su consulta original.</p>
        </div>
        <span className="rounded-full bg-[#edf5ef] px-3 py-1.5 text-xs font-semibold text-[#3d705d]">{consultation ? "Consulta vinculada" : "Sin consulta"}</span>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <ReferenceValue label="Peso" value={data?.weight ? `${data.weight.value.toLocaleString("es-MX")} ${data.weight.unit}` : null} detail={consultation ? "Registrado en la consulta fuente" : "Selecciona una consulta fuente"} />
        <ReferenceValue label="Talla" value={height} detail={consultation ? "Registrada en la consulta fuente" : "Selecciona una consulta fuente"} />
        <ReferenceValue label="Edad" value={age === null ? null : `${age} años`} detail={patient?.birth_date ? `Calculada para ${consultation ? "la fecha de consulta" : "hoy"}` : "Falta fecha de nacimiento"} />
      </div>
    </section>
  );
}

function ContextEditor({
  currentPatient,
  patients,
  consultations,
  selectedPatientId,
  selectedConsultationId,
  busy,
  onPatient,
  onConsultation,
  onCancel,
  onSave,
}: {
  currentPatient: Patient | null;
  patients: Patient[];
  consultations: Consultation[];
  selectedPatientId: string;
  selectedConsultationId: string;
  busy: boolean;
  onPatient: (id: string) => void;
  onConsultation: (id: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <section className="mt-4 rounded-[22px] border border-[#d7e1da] bg-[#f9fbf8] p-5" aria-label={currentPatient ? "Cambiar consulta fuente" : "Asignar paciente al plan"}>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-semibold text-[#315e4f]">
          Paciente
          <select className="nuth-input mt-2" value={selectedPatientId} disabled={Boolean(currentPatient) || busy} onChange={(event) => onPatient(event.target.value)}>
            {!selectedPatientId && <option value="">Selecciona un paciente</option>}
            {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.full_name}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold text-[#315e4f]">
          Consulta fuente
          <select className="nuth-input mt-2" value={selectedConsultationId} disabled={!selectedPatientId || busy} onChange={(event) => onConsultation(event.target.value)}>
            <option value="">Sin consulta</option>
            {consultations.map((consultation) => <option key={consultation.id} value={consultation.id}>{consultationLabel(consultation)} · {formatPatientDate(consultation.consultation_date)}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="nuth-button-secondary" disabled={busy} onClick={onCancel}>Cancelar</button>
        <button type="button" className="nuth-button" disabled={busy || !selectedPatientId} onClick={onSave}>{busy && <LoaderCircle size={16} className="animate-spin" />}Guardar contexto</button>
      </div>
    </section>
  );
}

function WorkshopLanding({ plans, busy, onCreate }: { plans: NutritionPlan[]; busy: boolean; onCreate: () => void }) {
  const drafts = plans.filter((plan) => plan.status === "draft");
  return (
    <div className="mx-auto max-w-5xl">
      <header className="rounded-[28px] bg-[#173d36] p-6 text-white sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-[#efbd6b]">Espacio clínico</p>
        <div className="mt-2 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Taller de dietas</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">Prepara planes libres o continúa los borradores vinculados a tus pacientes.</p>
          </div>
          <button type="button" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#efbd6b] px-4 py-3 text-sm font-semibold text-[#173d36]" disabled={busy} onClick={onCreate}>
            {busy ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />} Nuevo plan libre
          </button>
        </div>
      </header>
      <section className="mt-6">
        <div className="flex items-end justify-between gap-3">
          <div><p className="nuth-eyebrow">Continuar trabajando</p><h2 className="mt-2 text-2xl font-semibold">Borradores recientes</h2></div>
          <span className="text-sm text-[#74817d]">{drafts.length}</span>
        </div>
        {drafts.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {drafts.map((plan) => (
              <Link key={plan.id} to={`/app/diet-workshop/${plan.id}`} className="group rounded-2xl border border-[#dfe6e1] bg-white p-5 transition hover:border-[#8fab9a] hover:shadow-sm">
                <div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-[#24463b]">{plan.title}</p><p className="mt-2 text-xs text-[#7b8982]">Actualizado {formatPatientDate(plan.updated_at)}</p></div><ChevronRight size={18} className="text-[#82908a] group-hover:text-[#3d705d]" /></div>
                <p className="mt-4 text-xs font-semibold text-[#607269]">{plan.patient_id ? "Paciente asignado" : "Plan libre"} · Borrador</p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-[#cdd9d1] bg-white p-8 text-center text-sm text-[#74817d]">Aún no tienes planes en borrador.</div>
        )}
      </section>
    </div>
  );
}

export function DietWorkshopPage() {
  const { dietPlanId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const requestedPatientId = searchParams.get("patientId");
  const requestedConsultationId = searchParams.get("consultationId");
  const creatingDirect = useRef(false);
  const [plan, setPlan] = useState<NutritionPlan | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [plans, setPlans] = useState<NutritionPlan[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [reference, setReference] = useState<DietReferenceData | null>(null);
  const [title, setTitle] = useState("Plan nutricional");
  const [savedTitle, setSavedTitle] = useState("Plan nutricional");
  const [selectedConsultationId, setSelectedConsultationId] = useState<string | null>(null);
  const [contextEditor, setContextEditor] = useState(false);
  const [contextPatientId, setContextPatientId] = useState("");
  const [contextConsultationId, setContextConsultationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadPatientContext = useCallback(async (patientId: string, consultationId?: string | null) => {
    const [nextPatient, nextConsultations] = await Promise.all([getPatient(patientId), listConsultations(patientId)]);
    if (!nextPatient) throw new Error("No encontramos este paciente o no tienes autorización para verlo.");
    const nextConsultation = consultationId ? nextConsultations.find((item) => item.id === consultationId) : null;
    if (consultationId && !nextConsultation) throw new Error("La consulta seleccionada no pertenece a este paciente o ya no está disponible.");
    setPatient(nextPatient);
    setConsultations(nextConsultations);
    setConsultation(nextConsultation ?? null);
    setSelectedConsultationId(nextConsultation?.id ?? nextConsultations[0]?.id ?? null);
    return { patient: nextPatient, consultations: nextConsultations, consultation: nextConsultation ?? null };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (dietPlanId) {
        const nextPlan = await getDietPlan(dietPlanId);
        if (!nextPlan) throw new Error("No encontramos este plan o no tienes autorización para verlo.");
        setPlan(nextPlan);
        setTitle(nextPlan.title);
        setSavedTitle(nextPlan.title);
        if (nextPlan.patient_id) await loadPatientContext(nextPlan.patient_id, nextPlan.consultation_id);
        else {
          setPatient(null);
          setConsultation(null);
          setConsultations([]);
        }
        return;
      }
      if (requestedPatientId) {
        const context = await loadPatientContext(requestedPatientId, requestedConsultationId);
        if (requestedConsultationId && context.consultation) {
          if (creatingDirect.current) return;
          creatingDirect.current = true;
          const created = await createDietPlan({ patientId: requestedPatientId, consultationId: requestedConsultationId });
          navigate(`/app/diet-workshop/${created.id}`, { replace: true });
        }
        return;
      }
      setPlans(await listDietPlans());
    } catch (cause) {
      creatingDirect.current = false;
      setError(cause instanceof Error ? cause.message : "No pudimos abrir el Taller de dietas.");
    } finally {
      setLoading(false);
    }
  }, [dietPlanId, loadPatientContext, navigate, requestedConsultationId, requestedPatientId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!plan?.consultation_id) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setReferenceLoading(true);
      void loadDietReferenceData(plan.consultation_id!)
        .then((data) => { if (active) setReference(data); })
        .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "No pudimos leer los datos de referencia."); })
        .finally(() => { if (active) setReferenceLoading(false); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [plan?.consultation_id]);

  useEffect(() => {
    if (!plan || title.trim() === savedTitle || !title.trim()) return;
    const timer = window.setTimeout(() => {
      setSaving(true);
      void updateDietPlan(plan.id, { title })
        .then((updated) => { setPlan(updated); setSavedTitle(updated.title); setNotice("Borrador guardado automáticamente."); })
        .catch((cause) => setError(cause instanceof Error ? cause.message : "No pudimos guardar el título."))
        .finally(() => setSaving(false));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [plan, savedTitle, title]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (plan && title.trim() && title.trim() !== savedTitle) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [plan, savedTitle, title]);

  const create = async (patientId: string | null, consultationId: string | null) => {
    setBusy(true);
    setError("");
    try {
      const created = await createDietPlan({ patientId, consultationId });
      navigate(`/app/diet-workshop/${created.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos crear el borrador.");
    } finally {
      setBusy(false);
    }
  };

  const saveTitle = async () => {
    if (!plan) return null;
    if (!title.trim()) {
      setError("Escribe un nombre para guardar el plan.");
      return null;
    }
    if (title.trim() === savedTitle) return plan;
    setSaving(true);
    try {
      const updated = await updateDietPlan(plan.id, { title });
      setPlan(updated);
      setSavedTitle(updated.title);
      return updated;
    } finally {
      setSaving(false);
    }
  };

  const openContextEditor = async () => {
    setError("");
    setContextPatientId(patient?.id ?? "");
    setContextConsultationId(consultation?.id ?? "");
    if (!patient) {
      setBusy(true);
      try {
        const result = await listPatients({ status: "active", pageSize: 100, sort: "name_asc" });
        setPatients(result.rows);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "No pudimos cargar los pacientes.");
      } finally {
        setBusy(false);
      }
    } else setPatients([patient]);
    setContextEditor(true);
  };

  const chooseContextPatient = async (patientId: string) => {
    setContextPatientId(patientId);
    setContextConsultationId("");
    if (!patientId) return setConsultations([]);
    setBusy(true);
    try { setConsultations(await listConsultations(patientId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos cargar las consultas."); }
    finally { setBusy(false); }
  };

  const saveContext = async () => {
    if (!plan || !contextPatientId) return;
    setBusy(true);
    setError("");
    try {
      const available = await listConsultations(contextPatientId);
      if (contextConsultationId && !available.some((item) => item.id === contextConsultationId))
        throw new Error("La consulta seleccionada no pertenece a este paciente o ya no está disponible.");
      const updated = await updateDietPlan(plan.id, { patient_id: contextPatientId, consultation_id: contextConsultationId || null });
      setPlan(updated);
      if (!contextConsultationId) setReference(null);
      await loadPatientContext(contextPatientId, contextConsultationId || null);
      setContextEditor(false);
      setNotice("Contexto del plan actualizado.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos actualizar el contexto del plan.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState label="Preparando Taller de dietas…" />;
  if (error && !plan && !patient && !plans.length) return <ErrorState message={error} onRetry={() => void load()} />;
  if (!dietPlanId && requestedPatientId && patient) {
    return <SourcePicker patient={patient} consultations={consultations} selectedId={selectedConsultationId} busy={busy} error={error} onSelect={setSelectedConsultationId} onCreate={(consultationId) => void create(patient.id, consultationId)} />;
  }
  if (!dietPlanId && !requestedPatientId) return <WorkshopLanding plans={plans} busy={busy} onCreate={() => void create(null, null)} />;
  if (!plan) return <ErrorState message={error || "No pudimos abrir este plan."} onRetry={() => void load()} />;

  const exitTarget = patient ? `/app/patients/${patient.id}` : "/app/diet-workshop";
  return (
    <div className="mx-auto min-w-0 max-w-7xl pb-16 [overflow-wrap:anywhere]">
      <PlanContextHeader plan={{ ...plan, title }} patient={patient} consultation={consultation} saving={saving} onChangeContext={() => void openContextEditor()} onSaveAndExit={() => void saveTitle().then((saved) => { if (saved) navigate(exitTarget); }).catch((cause) => setError(cause instanceof Error ? cause.message : "No pudimos guardar el plan."))} />
      {contextEditor && <ContextEditor currentPatient={patient} patients={patients} consultations={consultations} selectedPatientId={contextPatientId} selectedConsultationId={contextConsultationId} busy={busy} onPatient={(id) => void chooseContextPatient(id)} onConsultation={setContextConsultationId} onCancel={() => setContextEditor(false)} onSave={() => void saveContext()} />}
      <WorkshopNavigation />
      {notice && <p role="status" className="mt-4 rounded-xl bg-[#eaf3ec] px-4 py-3 text-sm text-[#315e4f]">{notice}</p>}
      {error && <p role="alert" className="mt-4 rounded-xl bg-[#fbe9e5] px-4 py-3 text-sm text-[#963f32]">{error}</p>}
      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          <section className="rounded-[24px] border border-[#dfe6e1] bg-white p-5 sm:p-7">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="nuth-eyebrow">Paso 1</p>
                <h1 className="mt-2 text-2xl font-semibold text-[#173d36]">Objetivo energético</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#718078]">La estructura está lista para definir requerimientos en el siguiente objetivo. Todavía no realiza cálculos.</p>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[#fff4df] px-3 py-1.5 text-xs font-semibold text-[#7a5a28]"><Circle size={8} fill="currentColor" /> Pendiente</span>
            </div>
            <label className="mt-6 block text-sm font-semibold text-[#315e4f]" htmlFor="diet-plan-title">
              Nombre del plan
              <input id="diet-plan-title" className="nuth-input mt-2" maxLength={120} required value={title} onChange={(event) => { setTitle(event.target.value); setNotice(""); }} onBlur={() => void saveTitle().catch((cause) => setError(cause instanceof Error ? cause.message : "No pudimos guardar el título."))} />
            </label>
            <div className="mt-5 flex items-center gap-2 text-xs text-[#74817d]">
              {saving ? <LoaderCircle size={14} className="animate-spin" /> : <Clock3 size={14} />}
              {saving ? "Guardando…" : title.trim() === savedTitle ? `Guardado · ${formatPatientDate(plan.updated_at)}` : "Cambios pendientes"}
            </div>
          </section>
          <ReferenceDataPanel patient={patient} consultation={consultation} data={reference} loading={referenceLoading} />
        </div>
        <aside className="h-fit rounded-[24px] border border-[#dfe6e1] bg-[#f9fbf8] p-5 xl:sticky xl:top-56">
          <p className="text-sm font-semibold text-[#315e4f]">Preparado para continuar</p>
          <p className="mt-2 text-sm leading-6 text-[#718078]">El borrador conserva sólo su contexto y nombre. Los datos clínicos permanecen en el expediente.</p>
          <ul className="mt-4 space-y-3 text-sm text-[#51665d]">
            <li className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-[#3d705d]" /> Paciente y consulta opcionales</li>
            <li className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-[#3d705d]" /> Borrador recuperable</li>
            <li className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-[#3d705d]" /> Fuente clínica sin duplicar</li>
          </ul>
        </aside>
      </div>
    </div>
  );
}
