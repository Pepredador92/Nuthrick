import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CalendarRange,
  Check,
  ChevronRight,
  ClipboardPenLine,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Save,
  UserPlus,
} from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ErrorState, LoadingState } from "@/src/components/ui/Status";
import { DietEnergyStep } from "@/src/components/diet/DietEnergyStep";
import { DietMacrosStep } from "@/src/components/diet/DietMacrosStep";
import { DietEquivalentsStep } from "@/src/components/diet/DietEquivalentsStep";
import { DietMealDistributionStep } from "@/src/components/diet/DietMealDistributionStep";
import { DietMenuStep } from "@/src/components/diet/DietMenuStep";
import type { EnergyReferenceContext } from "@/src/features/diet-energy/model";
import { reconcileExchangePrescription } from "@/src/features/exchanges/model";
import { reconcileMealDistribution } from "@/src/features/meal-distribution/model";
import { reconcileDietMenu } from "@/src/features/menu/model";
import { reconcileMacroDistribution } from "@/src/features/macros/model";
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
import type { Consultation, DietMenu, ExchangePrescription, ExchangeTargetSnapshot, MacroDistribution, MealDistribution, NutritionPlan, Patient, PlanEnergyCalculation } from "@/src/types/domain";

const steps = [
  { id: "energy", label: "Objetivo energético", shortLabel: "Energía" },
  { id: "macros", label: "Macronutrientes", shortLabel: "Macros", ready: false },
  { id: "equivalents", label: "Equivalentes", shortLabel: "Equivalentes", ready: false },
  { id: "meals", label: "Tiempos de comida", shortLabel: "Tiempos", ready: false },
  { id: "menu", label: "Menú", shortLabel: "Menú", ready: false },
  { id: "review", label: "Revisión", shortLabel: "Revisión" },
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

function exchangeTargetsFor(plan: Pick<NutritionPlan, "target_calories" | "macro_distribution">): ExchangeTargetSnapshot | null {
  const macros = plan.macro_distribution?.macros;
  const carbohydrate = macros?.CARBOHYDRATE.grams;
  const protein = macros?.PROTEIN.grams;
  const fat = macros?.FAT.grams;
  if (!plan.target_calories || carbohydrate === null || protein === null || fat === null || carbohydrate === undefined || protein === undefined || fat === undefined) return null;
  return { energy_kcal: plan.target_calories, carbohydrate_g: carbohydrate, protein_g: protein, fat_g: fat };
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

type WorkshopStep = (typeof steps)[number]["id"];

function WorkshopNavigation({ targetReady, macrosReady, mealsReady, activeStep, onSelect }: { targetReady: boolean; macrosReady: boolean; mealsReady: boolean; activeStep: WorkshopStep; onSelect: (step: WorkshopStep) => void }) {
  const activeIndex = steps.findIndex((step) => step.id === activeStep);
  return (
    <nav className="mt-5 overflow-x-auto rounded-2xl border border-[#dfe6e1] bg-white p-1.5" aria-label="Secciones del Taller de dietas">
      <ol className="flex min-w-max gap-1">
        {steps.map((step, index) => {
          const ready = step.id === "energy" ? true : step.id === "macros" ? targetReady : step.id === "equivalents" || step.id === "meals" ? macrosReady : step.id === "menu" ? mealsReady : false;
          const current = activeStep === step.id;
          const completed = ready && index < activeIndex;
          return (
          <li key={step.id}>
            <button
              type="button"
              disabled={!ready}
              aria-label={step.label}
              aria-current={current ? "step" : undefined}
              onClick={() => onSelect(step.id)}
              className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition sm:px-4 ${current && ready ? "bg-[#173d36] text-white shadow-sm" : completed ? "bg-[#eaf3ec] text-[#315e4f]" : ready ? "text-[#537266] hover:bg-[#f4f8f5]" : "cursor-not-allowed text-[#98a39e]"}`}
            >
              <span className={`grid h-5 w-5 place-items-center rounded-full text-[10px] ${current && ready ? "bg-white/20 text-white" : completed ? "bg-[#3d705d] text-white" : ready ? "bg-[#e8f0eb] text-[#477363]" : "bg-[#e9eeea] text-[#89958f]"}`}>{completed ? <Check size={12} /> : index + 1}</span>
              {step.shortLabel}
              {!ready && <LockKeyhole size={12} aria-label="Próximamente" />}
            </button>
          </li>
          );
        })}
      </ol>
    </nav>
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
  const pendingEnergyCalculation = useRef<PlanEnergyCalculation | null>(null);
  const pendingMacroDistribution = useRef<MacroDistribution | null>(null);
  const pendingExchangePrescription = useRef<ExchangePrescription | null>(null);
  const pendingMealDistribution = useRef<MealDistribution | null>(null);
  const pendingDietMenu = useRef<DietMenu | null>(null);
  const [activeStep, setActiveStep] = useState<WorkshopStep>("energy");
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
  const energyReference: EnergyReferenceContext = {
    weightKg: reference?.weight?.value ?? patient?.weight_kg ?? null,
    heightCm: reference?.height?.value ?? patient?.height_cm ?? null,
    ageYears: patient?.birth_date ? calculateAge(patient.birth_date, consultation ? new Date(consultation.consultation_date) : new Date()) : null,
    equationSex: patient?.equation_sex ?? null,
    weightSource: reference?.weight ? "consultation" : patient?.weight_kg !== null && patient?.weight_kg !== undefined ? "patient" : undefined,
    heightSource: reference?.height ? "consultation" : patient?.height_cm !== null && patient?.height_cm !== undefined ? "patient" : undefined,
  };
  const energyReferenceWeightKg = plan.energy_calculation?.inputs.weight_kg.value ?? null;
  const macrosReady = Boolean(plan.macro_distribution?.complete);
  const exchangeTargets = exchangeTargetsFor(plan);
  return (
    <div className="mx-auto min-w-0 max-w-7xl pb-16 [overflow-wrap:anywhere]">
      <PlanContextHeader plan={{ ...plan, title }} patient={patient} consultation={consultation} saving={saving} onChangeContext={() => void openContextEditor()} onSaveAndExit={() => void (async () => {
        const saved = await saveTitle();
        if (!saved) return;
        const pendingEnergy = pendingEnergyCalculation.current;
        const pendingMacros = pendingMacroDistribution.current;
        if (pendingEnergy || pendingMacros || pendingExchangePrescription.current || pendingMealDistribution.current || pendingDietMenu.current) {
          setSaving(true);
          try {
            const nextTarget = pendingEnergy?.prescribed_target_kcal ?? saved.target_calories;
            const nextEnergyWeight = pendingEnergy?.inputs.weight_kg.value ?? saved.energy_calculation?.inputs.weight_kg.value ?? null;
            const macroToSave = pendingMacros
              ? (nextTarget ? reconcileMacroDistribution(pendingMacros, nextTarget, nextEnergyWeight) : pendingMacros)
              : pendingEnergy && saved.macro_distribution && nextTarget
                ? reconcileMacroDistribution(saved.macro_distribution, nextTarget, nextEnergyWeight)
                : undefined;
            const nextExchangeTargets = exchangeTargetsFor({ target_calories: nextTarget, macro_distribution: macroToSave ?? saved.macro_distribution });
            const exchangeToSave = pendingExchangePrescription.current
              ? (nextExchangeTargets ? reconcileExchangePrescription(pendingExchangePrescription.current, nextExchangeTargets) : pendingExchangePrescription.current)
              : saved.exchange_prescription && nextExchangeTargets ? reconcileExchangePrescription(saved.exchange_prescription, nextExchangeTargets) : undefined;
            const mealSource = pendingMealDistribution.current ?? saved.meal_distribution;
            const mealToSave = mealSource && exchangeToSave ? reconcileMealDistribution(mealSource, exchangeToSave) : mealSource ?? undefined;
            const menuSource = pendingDietMenu.current ?? saved.diet_menu;
            const menuToSave = menuSource && mealToSave ? reconcileDietMenu(menuSource, mealToSave) : menuSource ?? undefined;
            const updated = await updateDietPlan(saved.id, {
              ...(pendingEnergy ? { energy_calculation: pendingEnergy, target_calories: pendingEnergy.prescribed_target_kcal } : {}),
              ...(macroToSave ? { macro_distribution: macroToSave } : {}),
              ...(exchangeToSave ? { exchange_prescription: exchangeToSave } : {}),
              ...(mealToSave ? { meal_distribution: mealToSave } : {}),
              ...(menuToSave ? { diet_menu: menuToSave } : {}),
            });
            setPlan(updated);
            pendingEnergyCalculation.current = null;
            pendingMacroDistribution.current = null;
            pendingExchangePrescription.current = null;
            pendingMealDistribution.current = null;
            pendingDietMenu.current = null;
          } finally {
            setSaving(false);
          }
        }
        navigate(exitTarget);
      })().catch((cause) => setError(cause instanceof Error ? cause.message : "No pudimos guardar el plan."))} />
      {contextEditor && <ContextEditor currentPatient={patient} patients={patients} consultations={consultations} selectedPatientId={contextPatientId} selectedConsultationId={contextConsultationId} busy={busy} onPatient={(id) => void chooseContextPatient(id)} onConsultation={setContextConsultationId} onCancel={() => setContextEditor(false)} onSave={() => void saveContext()} />}
      <WorkshopNavigation targetReady={Boolean(plan.target_calories && plan.target_calories > 0)} macrosReady={macrosReady} mealsReady={Boolean(plan.meal_distribution?.distribution.some((item) => item.portions > 0))} activeStep={activeStep} onSelect={setActiveStep} />
      {notice && <p role="status" className="mt-4 rounded-xl bg-[#eaf3ec] px-4 py-3 text-sm text-[#315e4f]">{notice}</p>}
      {error && <p role="alert" className="mt-4 rounded-xl bg-[#fbe9e5] px-4 py-3 text-sm text-[#963f32]">{error}</p>}
      <div className="mt-5 space-y-5">
          <section className="rounded-2xl border border-[#dfe6e1] bg-white px-4 py-3 sm:px-5">
            <label className="block text-sm font-semibold text-[#315e4f]" htmlFor="diet-plan-title">Nombre del plan
              <input id="diet-plan-title" className="nuth-input mt-1 !py-2" maxLength={120} required value={title} onChange={(event) => { setTitle(event.target.value); setNotice(""); }} onBlur={() => void saveTitle().catch((cause) => setError(cause instanceof Error ? cause.message : "No pudimos guardar el título."))} />
            </label>
          </section>
          {activeStep === "energy" && <DietEnergyStep
            key={`${plan.id}:${reference?.weight?.value ?? ""}:${reference?.height?.value ?? ""}`}
            plan={plan}
            reference={energyReference}
            referenceLoading={referenceLoading}
            onSave={async (energy) => {
              setSaving(true);
              try {
                const macroSource = pendingMacroDistribution.current ?? plan.macro_distribution;
                const macro = macroSource && energy.prescribed_target_kcal
                  ? reconcileMacroDistribution(macroSource, energy.prescribed_target_kcal, energy.inputs.weight_kg.value)
                  : undefined;
                const nextExchangeTargets = exchangeTargetsFor({ target_calories: energy.prescribed_target_kcal, macro_distribution: macro ?? plan.macro_distribution });
                const exchange = plan.exchange_prescription && nextExchangeTargets ? reconcileExchangePrescription(plan.exchange_prescription, nextExchangeTargets) : undefined;
                const meal = plan.meal_distribution && exchange ? reconcileMealDistribution(plan.meal_distribution, exchange) : undefined;
                const updated = await updateDietPlan(plan.id, {
                  energy_calculation: energy,
                  target_calories: energy.prescribed_target_kcal,
                  ...(macro ? { macro_distribution: macro } : {}),
                  ...(exchange ? { exchange_prescription: exchange } : {}),
                  ...(meal ? { meal_distribution: meal } : {}),
                });
                setPlan(updated);
                pendingEnergyCalculation.current = null;
                if (macro) pendingMacroDistribution.current = null;
                if (exchange) pendingExchangePrescription.current = null;
                if (meal) pendingMealDistribution.current = null;
                setNotice("Objetivo energético guardado automáticamente.");
              } finally {
                setSaving(false);
              }
            }}
            onDraftChange={(energy) => { pendingEnergyCalculation.current = energy; }}
            onContinue={() => { setNotice(""); setActiveStep("macros"); }}
          />}
          {activeStep === "macros" && <DietMacrosStep
            plan={plan}
            targetEnergyKcal={plan.target_calories}
            energyReferenceWeightKg={energyReferenceWeightKg}
            onSave={async (distribution) => {
              setSaving(true);
              try {
                const nextExchangeTargets = exchangeTargetsFor({ target_calories: plan.target_calories, macro_distribution: distribution });
                const exchange = plan.exchange_prescription && nextExchangeTargets ? reconcileExchangePrescription(plan.exchange_prescription, nextExchangeTargets) : undefined;
                const meal = plan.meal_distribution && exchange ? reconcileMealDistribution(plan.meal_distribution, exchange) : undefined;
                const updated = await updateDietPlan(plan.id, { macro_distribution: distribution, ...(exchange ? { exchange_prescription: exchange } : {}), ...(meal ? { meal_distribution: meal } : {}) });
                setPlan(updated);
                pendingMacroDistribution.current = null;
                if (exchange) pendingExchangePrescription.current = null;
                if (meal) pendingMealDistribution.current = null;
                setNotice("Distribución de macronutrientes guardada automáticamente.");
              } finally {
                setSaving(false);
              }
            }}
            onDraftChange={(distribution) => { pendingMacroDistribution.current = distribution; }}
            onGoToEnergy={() => setActiveStep("energy")}
            onContinue={() => { setNotice(""); setActiveStep("equivalents"); }}
          />}
          {activeStep === "equivalents" && <DietEquivalentsStep
            plan={plan}
            targets={exchangeTargets}
            onSave={async (prescription) => {
              setSaving(true);
              try {
                const mealSource = pendingMealDistribution.current ?? plan.meal_distribution;
                const meal = mealSource ? reconcileMealDistribution(mealSource, prescription) : undefined;
                const updated = await updateDietPlan(plan.id, { exchange_prescription: prescription, ...(meal ? { meal_distribution: meal } : {}) });
                setPlan(updated);
                pendingExchangePrescription.current = null;
                if (meal) pendingMealDistribution.current = null;
                setNotice("Cuadro de equivalentes guardado automáticamente.");
              } finally { setSaving(false); }
            }}
            onDraftChange={(prescription) => { pendingExchangePrescription.current = prescription; }}
            onGoToMacros={() => setActiveStep("macros")}
            onContinue={() => setActiveStep("meals")}
          />}
          {activeStep === "meals" && <DietMealDistributionStep
            plan={plan}
            onSave={async (distribution) => {
              setSaving(true);
              try {
                const menuSource = pendingDietMenu.current ?? plan.diet_menu;
                const menu = menuSource ? reconcileDietMenu(menuSource, distribution) : undefined;
                const updated = await updateDietPlan(plan.id, { meal_distribution: distribution, ...(menu ? { diet_menu: menu } : {}) });
                setPlan(updated);
                pendingMealDistribution.current = null;
                if (menu) pendingDietMenu.current = null;
                setNotice("Distribución por tiempos guardada automáticamente.");
              } finally { setSaving(false); }
            }}
            onDraftChange={(distribution) => { pendingMealDistribution.current = distribution; }}
            onGoToEquivalents={() => setActiveStep("equivalents")}
            onContinue={() => setActiveStep("menu")}
          />}
          {activeStep === "menu" && <DietMenuStep
            plan={plan}
            onSave={async (menu) => {
              setSaving(true);
              try {
                const updated = await updateDietPlan(plan.id, { diet_menu: menu });
                setPlan(updated);
                pendingDietMenu.current = null;
                setNotice("Menú guardado automáticamente.");
              } finally { setSaving(false); }
            }}
            onDraftChange={(menu) => { pendingDietMenu.current = menu; }}
            onGoToMeals={() => setActiveStep("meals")}
          />}
      </div>
    </div>
  );
}
