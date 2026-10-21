import {ConsultationDrafts,ConsultationDraftPosition,type ConsultationDraftController} from '@/src/components/consultations/ConsultationDrafts';
import {ClinicalStepNotice,type ClinicalCompletion} from '@/src/components/consultations/ClinicalStepNotice';
import {ClinicalFollowUp} from '@/src/components/consultations/ClinicalFollowUp';
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ClipboardList,
  ClipboardCheck,
  FileText,
  LoaderCircle,
  RotateCcw,
  Save,
  Salad,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ErrorState, LoadingState } from "@/src/components/ui/Status";
import { Field, Input } from "@/src/components/ui/FormField";
import { QuestionField } from "@/src/components/consultations/QuestionField";
import { InterviewWorkspace, InterviewQuestionCard } from "@/src/components/consultations/InterviewWorkspace";
import { InterviewReview } from "@/src/components/consultations/InterviewReview";
import { PesCopilot, RecallCopilot, type RecallNavigation, type RecallNavigationActions } from "@/src/components/consultations/ClinicalCopilot";
import { ClinicalReview } from "@/src/components/consultations/ClinicalReview";
import { ConsultationGuide } from "@/src/components/consultations/ConsultationGuide";
import { ClinicalFieldCards } from "@/src/components/consultations/ClinicalFieldCards";
import { consultationSteps, objectiveKeys, followupKeys, questionModule, workflowSections, type ConsultationModule } from "@/src/features/consultations/consultationWorkflow";
import { ClinicalInterventions } from "@/src/components/consultations/ClinicalInterventions";
import { ClinicalObjective } from "@/src/components/consultations/ClinicalObjective";
import type { ClinicalTaskStatus } from "@/src/components/consultations/ClinicalTaskCard";
import { SnapshotHistory } from "@/src/components/consultations/SnapshotHistory";
import { ConsultationCloseDialog } from "@/src/components/consultations/ConsultationCloseDialog";
import { ConsultationExitDialog } from "@/src/components/consultations/ConsultationExitDialog";
import { ConsultationMeasurements } from "@/src/components/consultations/ConsultationMeasurements";
import { LaboratoryReports } from "@/src/components/consultations/LaboratoryReports";
import { PatientEvolutionTable } from "@/src/components/patients/PatientEvolutionTable";
import {
  consultationLabel,
  withConsultationDisplayNumbers,
  formatPatientDate,
} from "@/src/features/patients/patientUtils";
import {
  emptyValue,
  formatAnswer,
  isRecord,
  matchesCondition,
  questionErrors,
  repeatableFields,
} from "@/src/features/consultations/questionnaire";
import { appendComposedText, composeInterviewDraft } from "@/src/features/consultations/composeClinicalText";
import type { Answers, Question } from "@/src/features/consultations/questionnaire";
import { getPatient, listConsultations } from "@/src/services/patients";
import {
  adoptTemplate,
  beginConsultation,
  linkConsultationToAppointment,
  ensureSnapshot,
  prepareConsultationWorkflow,
  finishConsultation,
  getSnapshot,
  listAvailableTemplates,
  syncConsultationAnswers,
  loadActiveTemplate,
  loadTemplateById,
  loadSystemTemplate,
  reopenConsultationForEdit,
  updateConsultationDate,
  discardConsultationDraft,
} from "@/src/services/consultations";
import { ANSWER_SAVE_DELAY, boundedAnswerRequest, createAnswerAutosave, type AnswerState } from '@/src/features/consultations/answerAutosave';

import type { LoadedTemplate } from "@/src/services/consultations";
import type {
  Consultation,
  ConsultationSnapshot,
  Patient,
} from "@/src/types/domain";
import "./ConsultationPage.css";

const clinicalStages = [
  { title: 'Datos', description: 'Revisa la consulta' },
  { title: 'PES', description: 'Formula el diagnóstico' },
  { title: 'Objetivos', description: 'Acuerda la intervención' },
  { title: 'Estrategia', description: 'Define las acciones y responsables' },
  { title: 'Indicaciones', description: 'Revisa las recomendaciones' },
  { title: 'Seguimiento', description: 'Revisa indicadores y plazos' },
];
const clinicalStageFor = (key: string) => followupKeys.includes(key) ? 5 : objectiveKeys.includes(key) ? 2
  : key.startsWith('pes_') || ['nutrition_assessment', 'clinical_notes', 'measurement_notes', 'indicator_progress'].includes(key) ? 1 : 4;

type ConsultationWorkspace = {
  active: number;
  values: Answers;
  scrollY: number;
  updatedAt: string;
  module?: ConsultationModule;
  sectionKey?: string;
  base?: AnswerState;
  revision?: number;
  requiresReview?: boolean;
};

const workspaceKey = (id: string) => `nuthrick:consultation-workspace:${id}`;
const canDiscardDraft = (draft: Consultation) => draft.status === "draft" && !draft.draft_discard_protected && draft.summary == null && draft.completed_at == null;
function clearWorkspace(id: string) {
  try { window.sessionStorage.removeItem(workspaceKey(id)); } catch { /* Storage can be unavailable. */ }
}

function dateInZone(value: Date, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function readWorkspace(id: string): ConsultationWorkspace | null {
  try {
    const value = JSON.parse(
      window.sessionStorage.getItem(workspaceKey(id)) ?? "null",
    ) as ConsultationWorkspace | null;
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

export function ConsultationPage() {
  const { patientId, consultationId } = useParams();
  return <ConsultationEditor key={`${patientId}:${consultationId ?? "new"}`} />;
}

function ConsultationEditor() {
  const { patientId, consultationId } = useParams();
  const [searchParams] = useSearchParams();
  const appointmentId = searchParams.get("appointmentId");
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const consultationHistory = useRef<Consultation[]>([]);
  const [clinicalDate, setClinicalDate] = useState(() => dateInZone(new Date()));
  const clinicalDateRef = useRef(clinicalDate);
  const changeClinicalDate = (date: string) => {
    clinicalDateRef.current = date;
    setClinicalDate(date);
  };
  const [snapshot, setSnapshot] = useState<ConsultationSnapshot | null>(null);
  const [latest, setLatest] = useState<LoadedTemplate | null>(null);
  const [availableTemplates, setAvailableTemplates] = useState<
    LoadedTemplate[]
  >([]);
  const [selectedConsultationType, setSelectedConsultationType] = useState<Consultation["consultation_type"] | null>(null);
  const selectionDialog = useRef<HTMLDialogElement>(null);
  const selectionOpener = useRef<HTMLButtonElement>(null);
  const [openDrafts, setOpenDrafts] = useState<Consultation[]>([]);
  const [values, setValues] = useState<Answers>({});
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveConflict, setSaveConflict] = useState(false);
  const [backupWarning, setBackupWarning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [exitError, setExitError] = useState("");
  const [discardDraft, setDiscardDraft] = useState<Consultation | null>(null);
  const discardDialog = useRef<HTMLDialogElement>(null);
  const loadLock = useRef(false);
  const enteringConsultation = useRef(false);
  const exitLock = useRef(false);
  const [reviewed, setReviewed] = useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [recallOpened, setRecallOpened] = useState(false);
  const [clinicalOpened, setClinicalOpened] = useState(false);
  const [clinicalStage, setClinicalStage] = useState(0);
  const [clinicalRefresh, setClinicalRefresh] = useState(0);
  const [completion,setCompletion]=useState<ClinicalCompletion|null>(null);
  const [stageChecks,setStageChecks]=useState<Record<string,string>>({});
  const [followupReady,setFollowupReady]=useState({ready:false,signature:''});
  const reportCompletion=useCallback((message:string,nextStage?:number)=>setCompletion(current=>({id:(current?.id??0)+1,message,nextStage})),[]);
  const receiveFollowup=useCallback((ready:boolean,signature:string)=>setFollowupReady(current=>current.ready===ready&&current.signature===signature?current:{ready,signature}),[]);
  const [clinicalProgress, setClinicalProgress] = useState<Record<string, ClinicalTaskStatus>>({});
  const updateClinicalProgress = useCallback((key: string, status: ClinicalTaskStatus) => {
    setClinicalProgress(current => current[key] === status ? current : { ...current, [key]: status });
  }, []);
  const [recallPending, setRecallPending] = useState(false);
  const [pesPending, setPesPending] = useState(false);
  const [strategyPending, setStrategyPending] = useState(false);
  const [objectivePending, setObjectivePending] = useState<Record<string, boolean>>({});
  const hasObjectivePending = Object.values(objectivePending).some(Boolean);
  const [recallNavigation, setRecallNavigation] = useState<RecallNavigation | null>(null);
  const recallNavigationRef = useRef<RecallNavigationActions>(null);
  const [measurementsOpened, setMeasurementsOpened] = useState(false);
  const [laboratoriesOpened, setLaboratoriesOpened] = useState(false);
  const [measurementsPending, setMeasurementsPending] = useState(false);
  const [laboratoriesPending, setLaboratoriesPending] = useState(false);
  const closing = useRef(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [savedEncoded, setSavedEncoded] = useState("{}");
  const [module, setModule] = useState<ConsultationModule>("interview");
  const valuesRef = useRef<Answers>({});
  const lastSaved = useRef("{}");
  const saveTarget = useRef<{id:string;revision:number}|null>(null);
  const mounted = useRef(true);
  const heading = useRef<HTMLHeadingElement>(null);
  const closed = useRef(false);
  const [autosave] = useState(() => createAnswerAutosave());
  const draftController = useRef<ConsultationDraftController|null>(null);
  useEffect(() => {autosave.configure({
    read: signal => { const t=saveTarget.current; if(!t) throw new Error('Consulta no disponible.'); return syncConsultationAnswers(t.id,t.revision,undefined,signal); },
    write: (request,signal) => { const t=saveTarget.current; if(!t) throw new Error('Consulta no disponible.'); return syncConsultationAnswers(t.id,t.revision,request,signal); },
    onState: state => { if(mounted.current) { setSaving(state.saving);setSaveError(state.error);setSaveConflict(state.conflict); } },
    onMerge: (next,saved) => {
      if(!mounted.current || closed.current) return;
      valuesRef.current=next;setValues(next);
      lastSaved.current=JSON.stringify(saved.answers);setSavedEncoded(lastSaved.current);
    },
  });},[autosave]);
  useEffect(() => { mounted.current=true;return () => {mounted.current=false;void autosave.stop();}; },[autosave]);
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    Boolean(consultation || enteringConsultation.current) && !closed.current &&
    (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search),
  );

  const load = useCallback(
    async (chosenTemplate?: LoadedTemplate, resumeDraftId?: string) => {
      if (!patientId) return;
      if (loadLock.current) return;
      loadLock.current = true;
      enteringConsultation.current = Boolean(consultationId || chosenTemplate || resumeDraftId);
      setLoading(true);
      setError("");
      try {
        const [loadedPatient, history] = await Promise.all([
          getPatient(patientId),
          listConsultations(patientId),
        ]);
        consultationHistory.current = history;
        if (!loadedPatient)
          throw new Error(
            "No encontramos este paciente o no tienes autorización para verlo.",
          );
        const requestedConsultation = consultationId
          ? history.find((item) => item.id === consultationId)
          : null;
        if (consultationId && !requestedConsultation)
          throw new Error(
            "No encontramos esta consulta o no tienes autorización para verla.",
          );
        const drafts = history.filter((item) => item.status === "draft");
        const existingConsultation =
          requestedConsultation ??
          drafts.find((item) => item.id === resumeDraftId) ??
          (chosenTemplate
            ? drafts.find(
                (item) =>
                  item.consultation_type ===
                  chosenTemplate.template.consultation_type,
              )
            : null);
        if (!consultationId && !chosenTemplate && !resumeDraftId) {
          const templates = (
            await Promise.all([
              listAvailableTemplates("initial"),
              listAvailableTemplates("follow_up"),
            ])
          ).flat();
          setPatient(loadedPatient);
          changeClinicalDate(dateInZone(new Date(), loadedPatient.timezone));
          setAvailableTemplates(templates);
          setOpenDrafts(drafts);
          return;
        }
        if (!existingConsultation && !chosenTemplate)
          throw new Error("Elige un diseño para iniciar la consulta.");
        const type: Consultation["consultation_type"] =
          existingConsultation?.consultation_type ??
          chosenTemplate!.template.consultation_type;
        const started =
          consultationId &&
          existingConsultation &&
          existingConsultation.status !== "draft"
            ? await reopenConsultationForEdit(existingConsultation.id)
            : (existingConsultation ?? (await beginConsultation(patientId, type)));
        setConsultation(started);
        const datedConsultation = existingConsultation
          ? started
          : await updateConsultationDate(started.id, clinicalDateRef.current, loadedPatient.timezone);
        const consultationForLoad = appointmentId && datedConsultation.agenda_entry_id !== appointmentId
          ? await linkConsultationToAppointment(datedConsultation.id, appointmentId)
          : datedConsultation;
        const existingSnapshot = await getSnapshot(consultationForLoad.id);
        const loadedTemplate =
          chosenTemplate ??
          (existingSnapshot?.template_id
            ? await loadTemplateById(existingSnapshot.template_id)
            : await loadActiveTemplate(type));
        const systemTemplate = await loadSystemTemplate(type);
        const startedSnapshot =
          await prepareConsultationWorkflow(existingSnapshot ?? (await ensureSnapshot(consultationForLoad, loadedTemplate)));
        const saved = await boundedAnswerRequest(signal => syncConsultationAnswers(consultationForLoad.id,startedSnapshot.revision,undefined,signal));
        const serverValues = saved.answers;
        const workspace = readWorkspace(started.id);
        const editableKeys=new Set(startedSnapshot.structure.sections.flatMap(section=>section.questions.map(q=>q.question_key)));
        const restoredValues=Object.fromEntries(Object.entries(workspace?.values ?? {}).filter(([key])=>editableKeys.has(key)));
        const nextValues = workspace
          ? { ...serverValues, ...restoredValues }
          : serverValues;
        saveTarget.current={id:consultationForLoad.id,revision:startedSnapshot.revision};
        autosave.reset(saved,nextValues,workspace?.revision===startedSnapshot.revision?workspace.base:undefined,!!workspace && (workspace.requiresReview || !workspace.base || workspace.revision!==startedSnapshot.revision));
        const changedPersonal =
          startedSnapshot.template_id === loadedTemplate.template.id &&
          startedSnapshot.template_version < loadedTemplate.template.version;
        setLatest(
          changedPersonal
            ? loadedTemplate
            : existingSnapshot && loadedTemplate.template.is_system &&
                (systemTemplate.template.id !== startedSnapshot.template_id ||
                  systemTemplate.template.version > startedSnapshot.template_version)
              ? systemTemplate
              : null,
        );
        setPatient(loadedPatient);
        consultationHistory.current = withConsultationDisplayNumbers([
          ...history.filter((item) => item.id !== consultationForLoad.id),
          consultationForLoad,
        ]);
        setConsultation(consultationHistory.current.find((item) => item.id === consultationForLoad.id)!);
        changeClinicalDate(dateInZone(new Date(consultationForLoad.consultation_date), loadedPatient.timezone));
        setSnapshot(startedSnapshot);
        setValues(nextValues);
        valuesRef.current = nextValues;
        lastSaved.current = JSON.stringify(serverValues);
        setSavedEncoded(lastSaved.current);
        if (workspace) {
          const interview = workflowSections(startedSnapshot.structure, 'interview');
          const sectionKey = workspace.sectionKey ?? startedSnapshot.structure.sections[workspace.active]?.section_key;
          const sectionIndex = interview.findIndex(section => section.section_key === sectionKey);
          setActive(workspace.active === interview.length ? interview.length : Math.max(0, sectionIndex));
          setModule(workspace.module ?? 'interview');
          setRecallOpened(workspace.module === 'recall');
          setClinicalStage(0);
          setCompletion(null);
          setStageChecks({});
          setClinicalOpened(workspace.module === 'clinical');
          setMeasurementsOpened(workspace.module === 'measurements');
          setLaboratoriesOpened(workspace.module === 'laboratories');
          requestAnimationFrame(() => window.scrollTo(0, workspace.scrollY));
        }
        closed.current = false;
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "No se pudo iniciar la consulta.",
        );
      } finally {
        loadLock.current = false;
        enteringConsultation.current = false;
        setLoading(false);
      }
    },
    [appointmentId, consultationId, patientId, autosave],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const dialog = selectionDialog.current;
    if (selectedConsultationType) {
      dialog?.showModal();
      dialog?.querySelector<HTMLElement>("h2")?.focus();
      return () => {
        if (dialog?.open) dialog.close();
      };
    }
    selectionOpener.current?.focus();
  }, [selectedConsultationType]);

  useEffect(() => {
    if (!discardDraft) return;
    const dialog = discardDialog.current;
    dialog?.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, [discardDraft]);

  useEffect(() => {
    if (!consultation) return;
    const persistWorkspace = () => {
      if (closed.current) return;
      const workspace: ConsultationWorkspace = {
        active,
        module,
        sectionKey: snapshot ? workflowSections(snapshot.structure, 'interview')[active]?.section_key : undefined,
        values: valuesRef.current,
        scrollY: window.scrollY,
        updatedAt: new Date().toISOString(),
        base:autosave.saved(),
        revision:snapshot?.revision,
        requiresReview:saveConflict,
      };
      try { window.sessionStorage.setItem(workspaceKey(consultation.id),JSON.stringify(workspace)); }
      catch { queueMicrotask(() => {if(mounted.current) setBackupWarning(true);}); }
    };
    persistWorkspace();
    document.addEventListener("visibilitychange", persistWorkspace);
    window.addEventListener("pagehide", persistWorkspace);
    return () => {
      persistWorkspace();
      document.removeEventListener("visibilitychange", persistWorkspace);
      window.removeEventListener("pagehide", persistWorkspace);
    };
  }, [active, module, snapshot, consultation, values, autosave, saveConflict]);

  const save = useCallback(
    async (): Promise<boolean> => {
      if (!consultation || !snapshot || closed.current) return false;
      autosave.update(valuesRef.current);
      return autosave.flush();
    },
    [consultation, snapshot, autosave],
  );

  const saveAll = useCallback(async ():Promise<boolean> => {
    try {
      if (draftController.current && !await draftController.current.flush()) {
        setError('No pudimos guardar el avance completo. Reintenta antes de salir.');return false;
      }
      if (!await save()) return false;
      if(consultation&&clinicalDate!==dateInZone(new Date(consultation.consultation_date),patient?.timezone)) {
        const updated=await updateConsultationDate(consultation.id,clinicalDate,patient?.timezone);
        consultationHistory.current=withConsultationDisplayNumbers([...consultationHistory.current.filter(item=>item.id!==updated.id),updated]);
        setConsultation(consultationHistory.current.find(item=>item.id===updated.id)!);
      }
      return true;
    } catch(cause) {
      setError(cause instanceof Error?cause.message:'No pudimos guardar el avance completo. Reintenta antes de salir.');return false;
    }
  },[save,consultation,clinicalDate,patient]);

  useEffect(() => {
    if (busy || loading || saveError || JSON.stringify(values) === lastSaved.current) return;
    const timer = window.setTimeout(() => {
      void save();
    }, ANSWER_SAVE_DELAY);
    return () => window.clearTimeout(timer);
  }, [values, save, busy, loading, saveError]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (consultation && !closed.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    // Plain anchors also use the router. Links have already handled their click
    // by the time this bubbles to document.
    const leave = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element ? event.target.closest("a") : null;
      if (
        event.defaultPrevented || !anchor ||
        anchor.hasAttribute("download") ||
        anchor.target === "_blank" ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      )
        return;
      const url = new URL(anchor.href);
      if (
        url.origin !== window.location.origin ||
        closed.current ||
        !consultation ||
        (url.pathname === window.location.pathname && url.search === window.location.search)
      )
        return;
      event.preventDefault();
      navigate(url.pathname + url.search + url.hash);
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", leave);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", leave);
    };
  }, [consultation, navigate]);

  const pendingModules: { key: ConsultationModule; label: string }[] = [
    ...(recallPending ? [{ key: "recall" as const, label: "recordatorio de 24 horas" }] : []),
    ...(measurementsPending ? [{ key: "measurements" as const, label: "mediciones" }] : []),
    ...(laboratoriesPending ? [{ key: "laboratories" as const, label: "laboratorios" }] : []),
    ...(pesPending ? [{ key: "clinical" as const, label: "propuesta PES" }] : []),
    ...(hasObjectivePending ? [{ key: "clinical" as const, label: "objetivos sin guardar" }] : []),
    ...(strategyPending ? [{ key: "clinical" as const, label: "estrategias sin guardar o propuestas pendientes" }] : []),
  ];
  const continueConsultation = () => {
    if (exitLock.current) return;
    setExitError("");
    if (blocker.state === "blocked") blocker.reset();
  };
  const exitConsultation = async (discard: boolean) => {
    if (blocker.state !== "blocked" || exitLock.current || busy || loading) return;
    if (!consultation) { blocker.proceed(); return; }
    if (!discard && pendingModules.some(item=>item.key!=="clinical")) return;
    exitLock.current = true;
    setBusy(true);
    setExitError("");
    try {
      if (discard) {
        if (!canDiscardDraft(consultation)) throw new Error("Esta consulta conserva un historial previo. Guarda el borrador para continuar.");
        // Stop autosave and drain writes before retiring the draft.
        closed.current = true;
        await autosave.stop();
        await draftController.current?.stop();
        await discardConsultationDraft(consultation.id);
        clearWorkspace(consultation.id);
      } else {
        if (!await saveAll()) throw new Error("No pudimos guardar el borrador. Tus respuestas siguen aquí; vuelve a intentarlo.");
        closed.current = true;
      }
      blocker.proceed();
    } catch (cause) {
      closed.current = false;
      if(discard) {autosave.resume();draftController.current?.resume();}
      setExitError(cause instanceof Error ? cause.message : "No pudimos completar la acción. Continúa aquí e inténtalo de nuevo.");
    } finally {
      exitLock.current = false;
      setBusy(false);
    }
  };
  const discardExistingDraft = async () => {
    if (!discardDraft || exitLock.current) return;
    exitLock.current = true;
    setBusy(true);
    setError("");
    try {
      await discardConsultationDraft(discardDraft.id);
      clearWorkspace(discardDraft.id);
      setOpenDrafts(current => current.filter(draft => draft.id !== discardDraft.id));
      setDiscardDraft(null);
      setNotice("Borrador eliminado. Ya puedes elegir el diseño para la nueva consulta.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos eliminar el borrador.");
    } finally {
      exitLock.current = false;
      setBusy(false);
    }
  };

  const setAnswer = (key: string, value: unknown) => {
    setCompletion(null);
    const next = { ...valuesRef.current, [key]: value };
    valuesRef.current = next;
    autosave.update(next);
    setValues(next);
    setReviewed(false);
  };
  const discardPes = async () => {
    const fields = ['pes_problem', 'pes_etiology', 'pes_evidence', 'pes_statement'];
    if (!fields.some(key => typeof valuesRef.current[key] === 'string' && valuesRef.current[key] !== '')) return true;
    const previous = Object.fromEntries(fields.map(key => [key, valuesRef.current[key] ?? '']));
    const update = (parts: Answers) => {
      const next = { ...valuesRef.current, ...parts };
      valuesRef.current = next;
      autosave.update(next);
      setValues(next);
      setReviewed(false);
    };
    update(Object.fromEntries(fields.map(key => [key, ''])));
    let saved = false;
    try {
      saved = await save();
      if (saved) setClinicalRefresh(value => value + 1);
      return saved;
    } finally {
      if (!saved) update(previous);
    }
  };
  const replaceObjectiveText = (question: Question, text: string, texts: string[]) => {
    if (question.question_type === 'repeatable_group') {
      const fields = repeatableFields(question.configuration);
      const objectiveField = fields.find(field => /objetivo|objective|goal/i.test(`${field.key} ${field.label}`));
      if (!objectiveField) return;
      const existing = valuesRef.current[question.question_key];
      const rows = Array.isArray(existing) ? existing.filter(isRecord) : [];
      setAnswer(question.question_key, texts.map((item, index) => ({ ...Object.fromEntries(fields.map(field => [field.key, ''])), ...rows[index], [objectiveField.key]: item })));
    } else setAnswer(question.question_key, text);
  };
  const allSections = snapshot?.structure.sections ?? [];
  const sections = snapshot ? workflowSections(snapshot.structure, 'interview') : [];
  const recallSections = snapshot ? workflowSections(snapshot.structure, 'recall') : [];
  const clinicalSections = snapshot ? workflowSections(snapshot.structure, 'clinical') : [];
  const reviewing = active === sections.length;
  const current = sections[active];
  const goTo = async (index: number) => {
    if(!saveError) void saveAll();
    setActive(Math.max(0, Math.min(index, sections.length)));
    setNotice("");
    requestAnimationFrame(() => {
      heading.current?.focus({ preventScroll: true });
      heading.current?.parentElement?.scrollIntoView?.({
        behavior: "smooth",
        block: "start",
      });
    });
  };
  const upgrade = async () => {
    if (!consultation || !snapshot || !latest) return;
    if (
      !window.confirm(
        "¿Usar la entrevista actualizada en este borrador? Se conservará una revisión de todas las preguntas y respuestas anteriores. Solo se copiarán las respuestas compatibles. Tu diseño personalizado no se modificará.",
      )
    )
      return;
    setBusy(true);
    try {
      if (!(await save())) return;
      const next = await prepareConsultationWorkflow(await adoptTemplate(consultation, latest, snapshot.revision));
      const saved = await boundedAnswerRequest(signal => syncConsultationAnswers(consultation.id,next.revision,undefined,signal));
      const nextValues = saved.answers;
      saveTarget.current={id:consultation.id,revision:next.revision};
      autosave.reset(saved,nextValues);
      setSnapshot(next);
      setValues(nextValues);
      valuesRef.current = nextValues;
      lastSaved.current = JSON.stringify(nextValues);
      setSavedEncoded(lastSaved.current);
      setActive(0);
      setReviewed(false);
      setShowHistory(false);
      setNotice(
        "Entrevista actualizada. Las respuestas anteriores están en “Revisiones conservadas”. Revisa las respuestas copiadas antes de cerrar.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo actualizar. La revisión anterior sigue intacta.",
      );
    } finally {
      setBusy(false);
    }
  };
  const complete = async () => {
    if (!consultation || !snapshot || !reviewed || closing.current) return;
    if (recallPending || measurementsPending || laboratoriesPending || clinicalDate !== dateInZone(new Date(consultation.consultation_date), patient?.timezone)) {
      setCloseDialogOpen(true);
      return;
    }
    setShowErrors(true);
    const firstInvalid = allSections.findIndex((section) =>
      section.questions.some(
        (q) =>
          matchesCondition(q.visibility_condition, valuesRef.current) &&
          (questionModule(q.question_key)!=="clinical" && questionErrors(q, valuesRef.current[q.question_key]).length),
      ),
    );
    if (firstInvalid >= 0) {
      setCloseDialogOpen(false);
      const invalidSection = allSections[firstInvalid];
      const invalidQuestion = invalidSection.questions.find(question => matchesCondition(question.visibility_condition, valuesRef.current) && questionModule(question.question_key)!=="clinical" && questionErrors(question, valuesRef.current[question.question_key]).length)!;
      const invalidModule = questionModule(invalidQuestion.question_key);
      setModule(invalidModule);
      if (invalidModule === 'recall') setRecallOpened(true);
      if (invalidModule === 'clinical') { setClinicalOpened(true); setClinicalStage(clinicalStageFor(invalidQuestion.question_key)); }
      if (invalidModule === 'interview') setActive(Math.max(0, sections.findIndex(section => section.section_key === invalidSection.section_key)));
      setError(
        "Revisa los campos señalados antes de cerrar. Los campos opcionales pueden quedar sin responder.",
      );
      return;
    }
    closing.current = true;
    setBusy(true);
    try {
      if (!(await saveAll())) return;
      if (allSections.some(section=>section.questions.some(q=>matchesCondition(q.visibility_condition,valuesRef.current) && questionModule(q.question_key)!=="clinical" && questionErrors(q,valuesRef.current[q.question_key]).length))) {
        setCloseDialogOpen(false);setError('La información sincronizada tiene campos pendientes. Revisa los campos señalados antes de cerrar.');return;
      }
      const answered = allSections
        .flatMap((s) => s.questions)
        .filter(
          (q) =>
            matchesCondition(q.visibility_condition, valuesRef.current) &&
            !emptyValue(valuesRef.current[q.question_key]),
        ).length;
      const notes =
        typeof valuesRef.current.interview_notes === "string"
          ? valuesRef.current.interview_notes
          : typeof valuesRef.current.professional_notes === "string"
            ? valuesRef.current.professional_notes
            : "";
      await finishConsultation(
        consultation.id,
        snapshot.template_name +
          " · " +
          answered +
          " respuestas registradas.\n" +
          notes,
      );
      window.sessionStorage.removeItem(workspaceKey(consultation.id));
      closed.current = true;
      navigate("/app/patients/" + patientId);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo cerrar la entrevista.",
      );
    } finally {
      closing.current = false;
      setBusy(false);
    }
  };
  const saveClinicalDate = async () => {
    if (!consultation) return;
    setBusy(true);
    setError("");
    try {
      const updated = await updateConsultationDate(consultation.id, clinicalDate, patient?.timezone);
      consultationHistory.current = withConsultationDisplayNumbers([
        ...consultationHistory.current.filter((item) => item.id !== updated.id), updated,
      ]);
      setConsultation(consultationHistory.current.find((item) => item.id === updated.id)!);
      changeClinicalDate(dateInZone(new Date(updated.consultation_date), patient?.timezone));
      setNotice("Fecha de consulta actualizada.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo actualizar la fecha.");
    } finally {
      setBusy(false);
    }
  };

  const saveForClinical = async () => {
    if (measurementsPending || laboratoriesPending || recallPending) {
      setError('Guarda las mediciones y los estudios pendientes, y confirma los cambios del recordatorio antes de generar una propuesta clínica.');
      return false;
    }
    return saveAll();
  };
  const goModule = async (next: ConsultationModule) => {
    if (next === 'clinical' && (measurementsPending || laboratoriesPending || recallPending)) {
      setError('Guarda las mediciones y los estudios pendientes, y confirma los cambios del recordatorio antes de generar una propuesta clínica.');return;
    }
    if(!saveError) void saveAll();
    if (next === 'measurements') setMeasurementsOpened(true);
    if (next === 'laboratories') setLaboratoriesOpened(true);
    if (next === 'recall') setRecallOpened(true);
    if (next === 'clinical') setClinicalOpened(true);
    setModule(next); setNotice(''); setError('');
  };
  const nextStepLabel = () => {
    if (module === 'interview' && !reviewing) return `Sigue: ${sections[active + 1]?.title ?? 'Revisar entrevista'}`;
    if (module === 'recall' && recallNavigation?.open) return recallNavigation.stage === 0 ? recallNavigation.mode === 'ai' ? 'Sigue: revisar la estimación' : 'Sigue: revisar alimentos' : recallNavigation.stage === 1 ? 'Sigue: revisar el resumen' : 'Confirma para continuar a Mediciones';
    if (module === 'clinical' && clinicalStage < clinicalStages.length - 1) return `Sigue: ${clinicalStages[clinicalStage + 1].description}`;
    const index = consultationSteps.findIndex(step => step.key === module);
    return `Sigue: ${consultationSteps[index + 1]?.label ?? 'Revisar y cerrar la consulta'}`;
  };
  const nextStep = async () => {
    if (module === 'interview' && !reviewing) return goTo(active + 1);
    if (module === 'recall' && recallNavigation?.open) return recallNavigationRef.current?.next();
    if (module === 'clinical' && clinicalStage < clinicalStages.length - 1) return goClinicalStage(clinicalStage + 1);
    const index = consultationSteps.findIndex(step => step.key === module);
    if (index === consultationSteps.length - 1) { setReviewed(false); setError(''); setCloseDialogOpen(true); return; }
    return goModule(consultationSteps[index + 1].key);
  };
  const previousStep = async () => {
    if (module === 'interview') return goTo(active - 1);
    if (module === 'recall' && recallNavigation?.open && recallNavigation.stage > 0) return recallNavigationRef.current?.previous();
    if (module === 'clinical' && clinicalStage > 0) return goClinicalStage(clinicalStage - 1);
    const index = consultationSteps.findIndex(step => step.key === module);
    return goModule(consultationSteps[index - 1].key);
  };
  const goClinicalStage = async (next: number) => {
    if(!saveError) void saveAll();
    setClinicalStage(next);
    requestAnimationFrame(() => document.getElementById('consultation-clinical-heading')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }));
  };
  const renderQuestions = (questions: Question[]) => <fieldset disabled={busy} className="interview-question-grid">{questions.filter(question => matchesCondition(question.visibility_condition, values)).map(question => <InterviewQuestionCard key={question.question_key} question={question} className={['pes_problem', 'pes_etiology'].includes(question.question_key) ? 'clinical-pes-field' : ''}>
    {question.question_type === 'long_text' && composeInterviewDraft(question.question_key, values) && <button type="button" className="nuth-button-secondary mb-2 !text-xs" onClick={() => setAnswer(question.question_key, appendComposedText(valuesRef.current[question.question_key], composeInterviewDraft(question.question_key, values)))}><FileText size={15} />Redactar con datos registrados</button>}
    <QuestionField question={question} value={values[question.question_key]} errors={showErrors ? questionErrors(question, values[question.question_key]) : []} onChange={value => setAnswer(question.question_key, value)} />
  </InterviewQuestionCard>)}</fieldset>;
  const renderClinicalFields = (category: 'diagnosis' | 'objectives' | 'recommendations' | 'followup') => clinicalSections.flatMap(section => {
    const questions = section.questions.filter(question => {
      if (['pes_problem', 'pes_etiology', 'pes_evidence', 'pes_statement', ...objectiveKeys].includes(question.question_key)) return false;
      const kind = followupKeys.includes(question.question_key) ? 'followup' : objectiveKeys.includes(question.question_key) ? 'objectives' : question.question_key.startsWith('pes_') || ['nutrition_assessment', 'clinical_notes', 'measurement_notes', 'indicator_progress'].includes(question.question_key) ? 'diagnosis' : 'recommendations';
      return kind === category;
    });
    return questions.length ? [<div className="consultation-clinical-fields" key={section.section_key}>{!['Diagnóstico PES', 'Objetivos acordados', 'Recomendaciones y seguimiento'].includes(section.title) && <h3>{section.title}</h3>}{renderQuestions(questions)}</div>] : [];
  });
  const clinicalObjectiveQuestions = clinicalSections.flatMap(section => section.questions).filter(question => objectiveKeys.includes(question.question_key) && matchesCondition(question.visibility_condition, values));
  const objectiveStatuses = clinicalObjectiveQuestions.map(question => clinicalProgress[`objective:${question.question_key}`] ?? 'pending');
  const objectiveStatus: ClinicalTaskStatus = objectiveStatuses.length && objectiveStatuses.every(status => status === 'approved') ? 'approved'
    : objectiveStatuses.length && objectiveStatuses.every(status => status === 'complete' || status === 'approved') ? 'complete'
    : objectiveStatuses.some(status => status !== 'pending') ? 'progress' : 'pending';
  const recommendationQuestions=clinicalSections.flatMap(section=>section.questions).filter(question=>!followupKeys.includes(question.question_key)&&!question.question_key.startsWith('pes_')&&!objectiveKeys.includes(question.question_key)&&!['nutrition_assessment','clinical_notes','measurement_notes','indicator_progress'].includes(question.question_key)&&matchesCondition(question.visibility_condition,values));
  const recommendationSignature=JSON.stringify(recommendationQuestions.map(question=>[question.question_key,values[question.question_key]]));
  const hasRecommendations=recommendationQuestions.some(question=>!['professional_notes','clinical_notes'].includes(question.question_key)&&!emptyValue(values[question.question_key]));
  const followupQuestions=clinicalSections.flatMap(section=>section.questions).filter(question=>followupKeys.includes(question.question_key)&&matchesCondition(question.visibility_condition,values));
  const followupValues=followupQuestions.map(question=>[question.question_key,values[question.question_key]]);
  const followupSignature=JSON.stringify([followupReady.signature,followupValues]);
  const hasFollowup=Boolean(followupReady.signature)&&(followupReady.ready||followupValues.some(([,value])=>!emptyValue(value)));
  async function completeClinicalStage(kind:'recommendations'|'followup') {
    if (!await saveForClinical()) return;
    setStageChecks(current=>({...current,[kind]:kind==='recommendations'?recommendationSignature:followupSignature}));
    reportCompletion(kind==='recommendations'?'Recomendaciones guardadas y completadas.':'Seguimiento revisado y completado.',kind==='recommendations'?5:6);
  }
  const clinicalStepsWithProgress = clinicalStages.map((step, index) => {
    const status = index === 0 ? clinicalProgress.review : index === 1 ? clinicalProgress.pes : index === 2 ? objectiveStatus : index===3 ? clinicalProgress.strategies : index===4 ? stageChecks.recommendations===recommendationSignature?'complete':hasRecommendations?'progress':'pending' : stageChecks.followup===followupSignature?'complete':hasFollowup?'progress':'pending';
    return { ...step, status, statusLabel: status === 'approved' ? 'Aprobado' : status === 'complete' ? index === 0 ? 'Revisado' : index>=4?'Completado':'Listo para revisar' : status === 'progress' ? 'En curso' : undefined };
  });

  const exitDialog = blocker.state === "blocked" && <ConsultationExitDialog busy={busy || loading} canDiscard={!consultation || canDiscardDraft(consultation)} pending={pendingModules.filter(item=>item.key!=="clinical").map(item => item.label)} error={exitError} onSave={() => void exitConsultation(false)} onDiscard={() => void exitConsultation(true)} onContinue={continueConsultation} onReview={() => {
    const pendingModule = pendingModules[0];
    continueConsultation();
    if (pendingModule) {
      setModule(pendingModule.key);
      if (pendingModule.key === "clinical") setClinicalStage(pesPending ? 1 : hasObjectivePending ? 2 : strategyPending ? 3 : 1);
    }
  }} />;
  if (loading) return <>{exitDialog}<LoadingState label="Preparando entrevista…" /></>;
  if (!consultation && patient) {
    const selectedDraft = openDrafts.find(
      (draft) => draft.consultation_type === selectedConsultationType,
    ) ?? openDrafts[0];
    const selectedTemplates = availableTemplates.filter(
      (item) => item.template.consultation_type === selectedConsultationType,
    );
    const renderChoices = (items: LoadedTemplate[]) =>
      items.map((item) => {
        return (
          <button
            type="button"
            key={item.template.id}
            disabled={busy}
            className={`consultation-template-choice ${item.template.is_system ? "consultation-template-choice-system" : "consultation-template-choice-personal"}`}
            onClick={() => void load(item)}
          >
            <span className="consultation-template-heading">
              {item.template.name}
            </span>
            {item.template.description ? (
              <span className="consultation-template-description">
                {item.template.description}
              </span>
            ) : null}
            <span className="consultation-template-meta">
              <span className="consultation-template-duration">
                <Clock3 size={17} aria-hidden="true" />
                <span>Duración aproximada</span>
                <strong>{item.template.estimated_duration_minutes ? `${item.template.estimated_duration_minutes} min` : "No definida"}</strong>
              </span>
              {item.template.is_default && (
                <span className="consultation-template-badge consultation-template-default">
                  Predeterminada
                </span>
              )}
              {item.template.is_system && (
                <span className="consultation-template-badge consultation-template-system">
                  Base Nuthrick
                </span>
              )}
              {!item.template.is_system && <span className="consultation-template-badge consultation-template-personal">Diseño propio</span>}
            </span>
            {item.template.is_system && (
              <span className="consultation-template-references">
                <strong>Referencias normativas de apoyo</strong>
                <span>NOM-004-SSA3-2012 · Expediente clínico</span>
                <span>NOM-043-SSA2-2012 · Orientación alimentaria</span>
                <span className="consultation-template-reference-note">La NOM-008-SSA3-2017 corresponde solo cuando se atiende sobrepeso u obesidad.</span>
              </span>
            )}
            <span className="consultation-template-choose">Usar este diseño <ChevronRight size={16} aria-hidden="true" /></span>
          </button>
        );
      });
    return <>{exitDialog}
      <div className="mx-auto max-w-4xl">
        <Link
          to={`/app/patients/${patient.id}`}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#3d705d]"
        >
          <ArrowLeft size={16} />
          Volver a la ficha
        </Link>
        <header className="consultation-selection-hero mt-5">
          <p className="nuth-eyebrow">Nueva consulta · Paso 1</p>
          <h1>¿Qué tipo de consulta vas a iniciar?</h1>
          <p>Elige una opción para ver los diseños disponibles y su duración aproximada.</p>
        </header>
        <div className="consultation-date-card mt-5 max-w-sm rounded-2xl border border-[#dfe5e1] bg-white p-4">
          <Field label="Fecha de consulta" name="new-consultation-date">
            <Input
              id="new-consultation-date"
              type="date"
              value={clinicalDate}
              max={dateInZone(new Date(), patient.timezone)}
              onChange={(event) => changeClinicalDate(event.target.value)}
            />
          </Field>
        </div>
        {openDrafts.length > 0 && (
          <details open className="consultation-drafts mt-5 rounded-2xl border border-[#e7d3ae] bg-[#fff9eb] p-4">
            <summary className="cursor-pointer text-sm font-semibold text-[#775527]">
              Tienes {openDrafts.length === 1 ? "un borrador abierto" : `${openDrafts.length} borradores abiertos`}
            </summary>
            <p className="text-sm font-semibold text-[#775527]">
              Reanuda una consulta pendiente o elimina su borrador antes de iniciar otra.
            </p>
            <div className="mt-4 space-y-3">
              {openDrafts.map((draft) => (
                <div
                  key={draft.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/70 p-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#5f4824]">
                      {consultationLabel(draft)}
                    </p>
                    <p className="mt-0.5 text-xs text-[#8e744c]">
                      Iniciada el {formatPatientDate(draft.consultation_date)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2"><button
                    type="button"
                    className="nuth-button-secondary !px-3 !py-2 !text-xs"
                    disabled={busy}
                    onClick={() => void load(undefined, draft.id)}
                  >
                    Reanudar borrador
                  </button>
                  {canDiscardDraft(draft) && <button type="button" className="nuth-button-secondary !px-3 !py-2 !text-xs consultation-discard-action" disabled={busy} onClick={() => setDiscardDraft(draft)}>Eliminar borrador</button>}</div>
                </div>
              ))}
            </div>
          </details>
        )}
        {notice && (
          <p
            role="status"
            className="mt-5 rounded-xl bg-[#eaf3ec] px-4 py-3 text-sm text-[#315e4f]"
          >
            {notice}
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="mt-5 rounded-xl bg-[#fbe9e5] px-4 py-3 text-sm text-[#963f32]"
          >
            {error}
          </div>
        )}
        <div className="consultation-type-choices mt-6">
          <button type="button" ref={selectedConsultationType === "initial" ? selectionOpener : null} className="consultation-type-card consultation-type-initial" onClick={(event) => { selectionOpener.current = event.currentTarget; setSelectedConsultationType("initial"); }}>
            <span className="consultation-type-icon"><ClipboardList size={24} aria-hidden="true" /></span>
            <span className="consultation-type-content"><strong>Consulta inicial</strong><span>Conoce su historia, hábitos y objetivos.</span></span>
            <ChevronRight size={20} aria-hidden="true" />
          </button>
          <button type="button" ref={selectedConsultationType === "follow_up" ? selectionOpener : null} className="consultation-type-card consultation-type-followup" onClick={(event) => { selectionOpener.current = event.currentTarget; setSelectedConsultationType("follow_up"); }}>
            <span className="consultation-type-icon"><RotateCcw size={24} aria-hidden="true" /></span>
            <span className="consultation-type-content"><strong>Consulta de seguimiento</strong><span>Revisa avances y acuerdos previos.</span></span>
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
        <p className="mt-5 text-sm text-[#66766f]">
          ¿Quieres cambiar las preguntas de entrevista? <Link to="/app/settings" className="font-semibold text-[#315e4f] underline">Configura tus diseños</Link> antes o después.
        </p>
        <dialog ref={selectionDialog} aria-modal="true" aria-labelledby="consultation-design-dialog-title" className="consultation-design-dialog" onCancel={(event) => { event.preventDefault(); setSelectedConsultationType(null); }}>
          <div className="consultation-design-dialog-heading">
            <div>
              <p className="nuth-eyebrow">Nueva consulta · Paso 2</p>
              <h2 id="consultation-design-dialog-title" tabIndex={-1}>
                Elige un diseño de {selectedConsultationType === "initial" ? "consulta inicial" : "seguimiento"}
              </h2>
              <p>Compara las preguntas y el tiempo aproximado antes de comenzar.</p>
            </div>
            <button type="button" className="nuth-button-secondary consultation-design-dialog-close" aria-label="Cerrar diseños" onClick={() => setSelectedConsultationType(null)}><X size={18} /></button>
          </div>
          {selectedDraft ? (
            <section className="consultation-existing-draft">
              <p className="nuth-eyebrow">Ya tienes una entrevista en curso</p>
              <h3>{consultationLabel(selectedDraft)}</h3>
              <p>Este paciente tiene una consulta pendiente. Reanúdala para continuar o elimina su borrador antes de iniciar otra.</p>
              <button type="button" className="nuth-button" disabled={busy} onClick={() => void load(undefined, selectedDraft.id)}>Reanudar borrador</button>
              {canDiscardDraft(selectedDraft) && <button type="button" className="nuth-button-secondary mt-3 consultation-discard-action" disabled={busy} onClick={() => setDiscardDraft(selectedDraft)}>Eliminar borrador para empezar otra</button>}
            </section>
          ) : selectedTemplates.length ? (
            <div className="consultation-template-options">{renderChoices(selectedTemplates)}</div>
          ) : (
            <section className="consultation-no-designs">
              <ClipboardList size={22} aria-hidden="true" />
              <p>No hay diseños activos para este tipo de consulta.</p>
              <Link to={`/app/consultation-templates/${selectedConsultationType}`} onClick={() => setSelectedConsultationType(null)} className="font-semibold underline">Configurar diseños de entrevista</Link>
            </section>
          )}
          <div className="consultation-design-dialog-footer"><span>Puedes cambiar tus diseños en Configuración cuando lo necesites.</span><button type="button" className="nuth-button-secondary" onClick={() => setSelectedConsultationType(null)}>Volver</button></div>
        </dialog>
        {discardDraft && <dialog ref={discardDialog} aria-labelledby="discard-draft-title" onCancel={event => { event.preventDefault(); if (!busy) setDiscardDraft(null); }} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-3xl border border-[#dfe5e1] bg-white p-6 text-[#173d36] shadow-xl backdrop:bg-[#173d36]/50">
          <h2 id="discard-draft-title" className="text-xl font-semibold">¿Eliminar este borrador?</h2>
          <p className="mt-3 text-sm leading-6 text-[#60766a]">Se eliminarán {consultationLabel(discardDraft)} y los datos capturados en ese borrador. Esta acción no se puede deshacer. Podrás empezar una consulta nueva.</p>
          {error && <p role="alert" className="mt-3 text-sm text-[#963f32]">{error}</p>}
          <div className="mt-5 flex flex-wrap justify-end gap-3"><button autoFocus type="button" disabled={busy} className="nuth-button-secondary" onClick={() => setDiscardDraft(null)}>Conservar borrador</button><button type="button" disabled={busy} className="nuth-button-secondary consultation-discard-action" onClick={() => void discardExistingDraft()}>{busy ? "Eliminando…" : "Confirmar eliminación"}</button></div>
        </dialog>}
      </div>
    </>;
  }
  if (!patient || !consultation || !snapshot)
    return <>{exitDialog}
      <ErrorState
        message={error || "No pudimos abrir la consulta."}
        onRetry={() => void load()}
      />
    </>;
  const canUpgrade =
    latest &&
    (latest.template.id === snapshot.template_id
      ? latest.template.version > snapshot.template_version
      : latest.template.is_system &&
        snapshot.template_version < latest.template.version);
  const dirty = JSON.stringify(values) !== savedEncoded;
  return (
    <>{exitDialog}<ConsultationDrafts key={`${consultation.id}:${snapshot.revision}`} consultationId={consultation.id} revision={snapshot.revision} controllerRef={draftController} onSave={saveAll}><div className="consultation-workspace">
      <ConsultationDraftPosition value={{module,active,clinicalStage}} onRestore={position=>{if(consultationSteps.some(step=>step.key===position.module)){setModule(position.module as ConsultationModule);setActive(Math.max(0,position.active));setClinicalStage(Math.max(0,Math.min(clinicalStages.length-1,position.clinicalStage)));setRecallOpened(position.module==="recall");setClinicalOpened(position.module==="clinical");setMeasurementsOpened(position.module==="measurements");setLaboratoriesOpened(position.module==="laboratories");}}}/>
      <header className="rounded-[24px] bg-[#173d36] p-5 text-white sm:p-7">
        <Link
          to={"/app/patients/" + patient.id}
          className="inline-flex items-center gap-2 text-sm text-white/70"
        >
          <ArrowLeft size={16} />
          Volver a la ficha
        </Link>
        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs text-white/65">
              {consultationLabel(consultation)} · Borrador privado
            </p>
            <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">
              {patient.full_name}
            </h1>
            <p className="mt-2 text-xs leading-5 text-white/65">
              {snapshot.template_name} · v{snapshot.template_version} · revisión{" "}
              {snapshot.revision}
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <div className="space-y-2">
                <label htmlFor="consultation-date" className="block text-xs font-semibold text-white/80">
                  Fecha de consulta
                </label>
                <Input
                  id="consultation-date"
                  type="date"
                  value={clinicalDate}
                  max={dateInZone(new Date(), patient.timezone)}
                  onChange={(event) => changeClinicalDate(event.target.value)}
                />
              </div>
              <button
                type="button"
                className="rounded-xl bg-white/10 px-3 py-2.5 text-xs font-semibold disabled:opacity-50"
                disabled={busy || saving || clinicalDate === dateInZone(new Date(consultation.consultation_date), patient.timezone)}
                onClick={() => void saveClinicalDate()}
              >
                Guardar fecha
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <Link
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-3 py-2.5 text-xs font-semibold"
              to={
                "/app/consultation-templates/" + consultation.consultation_type
              }
            >
              <SlidersHorizontal size={15} />
              Configurar diseño de entrevista
            </Link>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-xs font-semibold"
              disabled={busy || saving}
              onClick={() =>
                void saveAll().then((ok) => {
                  if (ok) setNotice("Borrador guardado.");
                })
              }
            >
              {saving ? (
                <LoaderCircle className="animate-spin" size={15} />
              ) : (
                <Save size={15} />
              )}
              Guardar
            </button>
          </div>
        </div>
      </header>
      {closeDialogOpen && <ConsultationCloseDialog busy={busy || saving} reviewed={reviewed} pending={[recallPending && "Recordatorio de 24 horas", measurementsPending && "Mediciones / Bioimpedancia", laboratoriesPending && "Laboratorios", clinicalDate !== dateInZone(new Date(consultation.consultation_date), patient.timezone) && "la fecha de consulta"].filter((item): item is string => Boolean(item))} error={error || saveError} onReview={setReviewed} onCancel={() => setCloseDialogOpen(false)} onConfirm={() => void complete()}><InterviewReview structure={snapshot.structure} values={values} showEmpty /></ConsultationCloseDialog>}
      <div className="sticky top-0 z-20 mt-4 flex flex-wrap justify-end gap-2 rounded-xl bg-[#f7faf8]/95 p-2 backdrop-blur"><button type="button" className="nuth-button" disabled={busy || saving} onClick={()=>void saveAll().then(ok=>{if(ok)setNotice("Avance de la consulta guardado.");})}><Save size={16}/>Guardar consulta</button><button type="button" className="nuth-button-secondary" disabled={busy || saving} onClick={() => { setReviewed(false); setError(""); setCloseDialogOpen(true); }}><ClipboardCheck size={16} />Revisar cierre de consulta</button></div>
      <nav className="consultation-step-nav" aria-label="Módulos de la consulta">
        {consultationSteps.map((step, index) => <button key={step.key} type="button" aria-current={module === step.key ? 'page' : undefined} disabled={busy} onClick={() => void goModule(step.key)}><span aria-hidden="true">{index + 1}</span>{step.label}</button>)}
        <Link to={`/app/diet-workshop?patientId=${patient.id}&consultationId=${consultation.id}`}><Salad size={15} />Taller de dietas</Link>
      </nav>
      {backupWarning && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">El respaldo local no está disponible en este navegador. Conserva esta pestaña abierta hasta confirmar el guardado.</p>}
      {saveError && <section aria-label="Estado del guardado" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-950"><p role="alert">{saveError}</p>{saveConflict && <details className="mt-3"><summary>Comparar los cambios antes de elegir</summary><dl className="mt-3 space-y-3">{autosave.differences().map(item => {const question=snapshot.structure.sections.flatMap(section=>section.questions).find(q=>q.question_key===item.key);return <div key={item.key}><dt className="font-semibold">{question?.label ?? 'Respuesta de la consulta'}</dt><dd>Tu borrador: {question ? formatAnswer(question,item.local) : String(item.local ?? '')}</dd><dd>En el servidor: {question ? formatAnswer(question,item.remote) : String(item.remote ?? '')}</dd></div>;})}</dl></details>}{saveConflict ? <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={saving || busy} className="nuth-button-secondary" onClick={() => {autosave.resolveConflict(true);void save();}}>Conservar mis cambios y sincronizar</button><button type="button" disabled={saving || busy} className="nuth-button-secondary" onClick={() => {autosave.resolveConflict(false);void save();}}>Usar la versión guardada en el servidor</button><p>La primera opción conserva tus campos modificados y toma del servidor los demás. La segunda reemplaza el borrador local por lo que está guardado.</p></div> : <button type="button" disabled={saving || busy} className="nuth-button-secondary mt-3" onClick={() => void save()}>Reintentar guardado</button>}</section>}
      {notice && <p role="status" className="mt-4 rounded-xl bg-[#eaf3ec] px-4 py-3 text-sm text-[#315e4f]">{notice}</p>}
      {error && <p role="alert" className="mt-4 rounded-xl bg-[#fbe9e5] px-4 py-3 text-sm text-[#963f32]">{error}</p>}
      {recallOpened && <section className="consultation-guided-workspace mt-6" hidden={module !== 'recall'} aria-label="Paso de recordatorio de 24 horas">
        <header className="consultation-guided-intro"><p className="nuth-eyebrow">02 · Registra el consumo</p><h2>Recordatorio de 24 horas</h2><p>Un día concreto, desde la primera comida hasta la última bebida.</p></header>
        <RecallCopilot key={`${consultation.id}:${snapshot.revision}:recall`} patientId={patient.id} consultationId={consultation.id} revision={snapshot.revision} active={module === 'recall'} before={save} onPendingChange={setRecallPending} navigationRef={recallNavigationRef} onNavigationChange={setRecallNavigation} />
        {recallSections.map(section => <details key={section.section_key} className="recall-supported-fields" open={showErrors && section.questions.some(question => matchesCondition(question.visibility_condition, values) && questionErrors(question, values[question.question_key]).length > 0)}><summary>{section.title === "Recordatorio de 24 horas" ? "Registro detallado del día y preguntas de apoyo" : section.title}</summary><p>{section.title === "Recordatorio de 24 horas" ? 'Aquí puedes registrar la fecha, horarios, preparación y posibles olvidos. Este registro complementa los alimentos confirmados arriba.' : section.description}</p>{renderQuestions(section.questions)}</details>)}
      </section>}
      {clinicalOpened && <div className="consultation-guided-workspace clinical-decision-workspace mt-6" hidden={module !== 'clinical'}>
        <header className="consultation-guided-intro" id="consultation-clinical-heading"><p className="nuth-eyebrow">05 · Revisa y acuerda</p><h2>De los datos a los siguientes pasos</h2><p>Estas secciones son opcionales. Puedes guardar el avance, continuar o cerrar la consulta sin completarlas.</p></header>
        <ConsultationGuide label="Pasos de la revisión clínica" steps={clinicalStepsWithProgress} active={clinicalStage} onChange={next => void goClinicalStage(next)} busy={busy} />
        <div hidden={clinicalStage !== 0}><ClinicalReview onReviewed={(message,all)=>reportCompletion(message,all?1:undefined)} consultationId={consultation.id} snapshot={snapshot} values={values} active={module === 'clinical' && clinicalStage === 0} before={saveForClinical} onStatusChange={status => updateClinicalProgress('review', status)} onOpenModule={next => void goModule(next)} /></div>
        <section hidden={clinicalStage !== 1} className="clinical-stage" aria-label="Diagnóstico PES">
          <header className="clinical-stage-heading"><div><p className="nuth-eyebrow">02 · Formula el diagnóstico</p><h2>Diagnóstico PES</h2><p>Completa el problema, su causa y la evidencia. Después, revisa y aprueba el enunciado.</p></div></header>
          <PesCopilot onCompleted={()=>reportCompletion("Diagnóstico PES aprobado. Paso completado.",2)} key={`${consultation.id}:${snapshot.revision}:pes`} patientId={patient.id} consultationId={consultation.id} revision={snapshot.revision} active={module === 'clinical' && clinicalStage === 1} before={saveForClinical} answers={values} onPendingChange={setPesPending} onStatusChange={status => updateClinicalProgress('pes', status)} onDiscardPes={discardPes} onPes={draft => {
            setAnswer('pes_problem', draft.problem); setAnswer('pes_etiology', draft.etiology); setAnswer('pes_evidence', draft.signsSymptoms.join('\n')); setAnswer('pes_statement', draft.pesStatement); setClinicalRefresh(value => value + 1);
          }} />
          {renderClinicalFields('diagnosis')}
        </section>
        <section hidden={clinicalStage !== 2} className="clinical-stage" aria-label="Objetivos acordados">
          <header className="clinical-stage-heading"><div><p className="nuth-eyebrow">03 · Acuerda el cambio</p><h2>Objetivos acordados</h2><p>Define qué quieren lograr, cómo lo medirán y cuándo revisarán el avance.</p></div></header>
          {clinicalObjectiveQuestions.map(question => <ClinicalObjective onReviewPes={()=>void goClinicalStage(1)} onCompleted={()=>{const all=clinicalObjectiveQuestions.every(item=>item.question_key===question.question_key||clinicalProgress[`objective:${item.question_key}`]==='approved');reportCompletion(all?"Objetivos acordados aprobados. Paso completado.":"Objetivos de esta tarjeta aprobados.",all?3:undefined);}} key={`${consultation.id}:${snapshot.revision}:${question.question_key}`} consultationId={consultation.id} revision={snapshot.revision} questionKey={question.question_key} contextVersion={clinicalRefresh} value={values[question.question_key]} before={saveForClinical} active={module === 'clinical' && clinicalStage === 2} patientId={patient.id} maxLength={typeof question.configuration.max_length === 'number' ? question.configuration.max_length : question.question_type === 'repeatable_group' ? 12000 : 2000} onStatusChange={status => updateClinicalProgress(`objective:${question.question_key}`, status)} onPendingChange={pending => setObjectivePending(current => current[question.question_key] === pending ? current : { ...current, [question.question_key]: pending })} onChangeText={(text, texts) => replaceObjectiveText(question, text, texts)} />)}
          <p className="clinical-stage-next"><ChevronRight size={16} />Después, elige las estrategias para llevar estos objetivos a la práctica.</p>
        </section>
        <section hidden={clinicalStage !== 3} className="clinical-stage" aria-label="Estrategia de intervención">
          <header className="clinical-stage-heading"><div><p className="nuth-eyebrow">04 · Define cómo se llevará a cabo</p><h2>Estrategia de intervención</h2><p>Organiza las acciones que llevarán los objetivos a la práctica.</p></div></header>
          <ClinicalInterventions onReviewPrerequisite={stage=>void goClinicalStage(stage)} onCompleted={all=>reportCompletion(all?"Estrategias aprobadas. Puedes continuar a indicaciones.":"Estrategia aprobada.")} onStatusChange={status=>updateClinicalProgress("strategies",status)} key={`${consultation.id}:${snapshot.revision}:strategies`} consultationId={consultation.id} patientId={patient.id} revision={snapshot.revision} before={saveForClinical} active={module === 'clinical' && clinicalStage === 3} onPendingChange={setStrategyPending} onChanged={() => setClinicalRefresh(value => value + 1)} workshopUrl={`/app/diet-workshop?patientId=${patient.id}&consultationId=${consultation.id}`} onInstructions={text => { setAnswer('first_actions', appendComposedText(valuesRef.current.first_actions, text)); setClinicalStage(4); }} />
        </section>
        <section hidden={clinicalStage !== 4} className="consultation-clinical-card" aria-label="Recomendaciones">
          <p className="nuth-eyebrow">05 · Deja claros los siguientes pasos</p><h2>Recomendaciones</h2>
          <p className="consultation-clinical-description">Deja indicaciones sencillas y revisa lo acordado antes de compartirlo.</p>
          <ClinicalFieldCards key={`${consultation.id}:${snapshot.revision}:recommendations:${clinicalRefresh}`} questions={recommendationQuestions} values={values} busy={busy} showErrors={showErrors} before={saveForClinical} onChange={setAnswer} ai={{patientId:patient.id,consultationId:consultation.id,revision:snapshot.revision}} />
          <button type="button" className="nuth-button mt-4" disabled={busy||saving||!hasRecommendations} onClick={()=>void completeClinicalStage('recommendations')}>Guardar y completar recomendaciones</button>
          <p className="consultation-guided-hint">Al cerrar la consulta, podrás copiar las indicaciones al Super Link, revisarlas y publicarlas para el paciente.</p>
        </section>
        <section hidden={clinicalStage!==5} className="clinical-stage" aria-label="Seguimiento">
          <header className="clinical-stage-heading"><div><p className="nuth-eyebrow">06 · Prepara la próxima revisión</p><h2>Seguimiento</h2><p>Confirma qué observarán, cuándo lo revisarán y si hace falta ajustar algo.</p></div></header>
          <ClinicalFollowUp key={`${consultation.id}:${snapshot.revision}:followup`} consultationId={consultation.id} revision={snapshot.revision} active={module==='clinical'&&clinicalStage===5} answers={values} onReady={receiveFollowup} onEdit={stage=>void goClinicalStage(stage)}/>
          {followupQuestions.length>0 && <ClinicalFieldCards questions={followupQuestions} values={values} busy={busy} showErrors={showErrors} before={saveForClinical} onChange={setAnswer} />}
          <button type="button" className="nuth-button mt-4" disabled={busy||saving||!hasFollowup} onClick={()=>void completeClinicalStage('followup')}>Completar revisión del seguimiento</button>
        </section>
        <ClinicalStepNotice completion={completion} onClose={()=>setCompletion(null)} onContinue={stage=>{setCompletion(null);if(stage===6)void goModule('evolution');else void goClinicalStage(stage);}}/>
      </div>}
      {measurementsOpened && (
        <div className="mt-6" hidden={module !== "measurements"}>
          <ConsultationMeasurements key={consultation.id} consultation={consultation} patient={patient} onPatientChange={setPatient} onPendingChange={setMeasurementsPending} />
        </div>
      )}
      {laboratoriesOpened && (
        <div className="mt-6" hidden={module !== "laboratories"}>
          <LaboratoryReports key={consultation.id} consultation={consultation} onPendingChange={setLaboratoriesPending} />
        </div>
      )}
      {module === "evolution" && (
        <div className="mt-6">
          <PatientEvolutionTable
            patientId={patient.id}
            currentConsultationId={consultation.id}
            onOpenConsultation={(targetConsultationId) => {
              if (targetConsultationId === consultation.id) return;
              navigate(`/app/patients/${patient.id}/consultations/${targetConsultationId}`);
            }}
          />
        </div>
      )}
      <div className="mt-5" hidden={module !== "interview"}>
        {consultation.consultation_type === "initial" &&
          snapshot.template_version >= 2 && (
            <p className="mt-3 text-xs leading-5 text-[#74817d]">
              Cuestionario de la consulta. No es necesario llenar todo:
              pregunta lo relevante y amplía sólo cuando corresponda.
            </p>
          )}
        {canUpgrade && (
          <div className="mt-4 rounded-2xl border border-[#e7d3ae] bg-[#fff9eb] p-4">
            <p className="text-sm font-semibold text-[#775527]">
              Hay una entrevista más completa disponible
            </p>
            <p className="mt-1 text-xs leading-5 text-[#8e744c]">
              Este borrador conserva la versión anterior. Actualizarlo no
              elimina respuestas ni cambia tu diseño personal.
            </p>
            <button
              type="button"
              disabled={busy || saving}
              onClick={() => void upgrade()}
              className="mt-3 nuth-button-secondary !text-xs"
            >
              Usar entrevista actualizada
            </button>
          </div>
        )}
        {snapshot.revision > 1 && (
          <div className="mt-4">
            <button
              type="button"
              className="text-xs font-semibold text-[#3d705d]"
              aria-expanded={showHistory}
              onClick={() => setShowHistory(!showHistory)}
            >
              Revisiones conservadas ({snapshot.revision - 1}){" "}
              {showHistory ? "−" : "+"}
            </button>
            {showHistory && (
              <SnapshotHistory consultation={consultation} historicalOnly />
            )}
          </div>
        )}
        <InterviewWorkspace templateName={snapshot.template_name} sections={sections} values={values} active={active} busy={busy} onSection={(index) => void goTo(index)} headingRef={heading} reviewLabel="Revisar entrevista">
            {reviewing ? (
              <div className="interview-review-card">
                <p className="mt-3 text-sm leading-6 text-[#718176]">
                  Esta síntesis organiza únicamente lo registrado. No completa
                  datos faltantes ni genera diagnósticos. Puedes volver a
                  cualquier sección antes de cerrar.
                </p>
                <div className="mt-5">
                  <InterviewReview
                    structure={{ ...snapshot.structure, sections }}
                    values={values}
                    onSection={(index) => void goTo(index)}
                    showEmpty
                  />
                </div>

              </div>
            ) : (
              <>
                <fieldset
                  disabled={busy}
                  className="interview-question-grid"
                >
                  {current?.questions
                    .filter((question) =>
                      matchesCondition(question.visibility_condition, values),
                    )
                    .map((question) => (
                      <InterviewQuestionCard key={question.question_key} question={question}>
                        {question.question_type === "long_text" && composeInterviewDraft(question.question_key, values) && (
                          <button
                            type="button"
                            className="mb-2 inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
                            onClick={() => setAnswer(question.question_key, appendComposedText(values[question.question_key], composeInterviewDraft(question.question_key, values)))}
                          >
                            <FileText size={15} aria-hidden="true" />
                            Redactar con datos registrados
                          </button>
                        )}
                        <QuestionField
                          question={question}
                          value={values[question.question_key]}
                          errors={
                            showErrors
                              ? questionErrors(
                                  question,
                                  values[question.question_key],
                                )
                              : []
                          }
                          onChange={(value) =>
                            setAnswer(question.question_key, value)
                          }
                        />
                      </InterviewQuestionCard>
                    ))}
                  {!current?.questions.length && (
                    <p className="text-sm text-[#74817d]">
                      Esta sección no tiene preguntas activas.
                    </p>
                  )}
                </fieldset>
              </>
            )}
        </InterviewWorkspace>
      </div>
      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-[#dfe5e1] bg-white/95 px-3 py-3 backdrop-blur lg:left-[250px]">
        <div className="interview-footer-inner">
          <button type="button" className="nuth-button-secondary !px-3 !text-xs sm:!text-sm" disabled={busy || (module === 'interview' && active === 0) || (module === 'recall' && recallNavigation?.busy)} onClick={() => void previousStep()}><ChevronLeft size={15} />Anterior</button>
          <div className="interview-next-step"><strong>{nextStepLabel()}</strong><span role="status">{saveError ? 'Pendiente de sincronizar' : saving ? 'Guardando… puedes continuar' : module === 'recall' && recallNavigation?.busy ? 'Procesando el recordatorio…' : measurementsPending && module === 'measurements' ? 'Guarda las mediciones para continuar' : laboratoriesPending && module === 'laboratories' ? 'Guarda los estudios para continuar' : module === 'recall' && recallNavigation?.open && recallNavigation.stage === 0 && recallNavigation.nextDisabled ? 'Calcula el consumo con IA o agrega un alimento manualmente para continuar' : recallPending && module === 'recall' ? 'Confirma el recordatorio antes del cierre' : dirty ? 'Cambios sin guardar' : 'Cambios guardados'}</span></div>
          <button type="button" className="nuth-button !px-3 !text-xs sm:!text-sm" disabled={busy || (module === 'measurements' && measurementsPending) || (module === 'laboratories' && laboratoriesPending) || (module === 'recall' && recallNavigation?.open && recallNavigation.nextDisabled)} onClick={() => void nextStep()}>{module === 'evolution' ? 'Revisar cierre de consulta' : module === 'recall' && recallNavigation?.open && recallNavigation.stage === 2 ? recallNavigation.saving ? 'Guardando…' : 'Confirmar recordatorio' : 'Siguiente'}<ChevronRight size={15} /></button>
        </div>
      </footer>
    </div></ConsultationDrafts></>
  );
}
