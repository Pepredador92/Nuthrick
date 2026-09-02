import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  LoaderCircle,
  Save,
  SlidersHorizontal,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ErrorState, LoadingState } from "@/src/components/ui/Status";
import { QuestionField } from "@/src/components/consultations/QuestionField";
import { InterviewReview } from "@/src/components/consultations/InterviewReview";
import { SnapshotHistory } from "@/src/components/consultations/SnapshotHistory";
import {
  consultationLabel,
  formatPatientDate,
} from "@/src/features/patients/patientUtils";
import {
  createSaveQueue,
  emptyValue,
  matchesCondition,
  questionErrors,
  sectionProgress,
} from "@/src/features/consultations/questionnaire";
import type { Answers } from "@/src/features/consultations/questionnaire";
import { getPatient, listConsultations } from "@/src/services/patients";
import {
  adoptTemplate,
  beginConsultation,
  ensureSnapshot,
  finishConsultation,
  listAnswers,
  loadActiveTemplate,
  loadSystemTemplate,
} from "@/src/services/consultations";
import { saveAnswers } from "@/src/services/consultations";
import type { LoadedTemplate } from "@/src/services/consultations";
import type {
  Consultation,
  ConsultationSnapshot,
  Patient,
} from "@/src/types/domain";

export function ConsultationPage() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [snapshot, setSnapshot] = useState<ConsultationSnapshot | null>(null);
  const [latest, setLatest] = useState<LoadedTemplate | null>(null);
  const [values, setValues] = useState<Answers>({});
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [savedEncoded, setSavedEncoded] = useState("{}");
  const valuesRef = useRef<Answers>({});
  const lastSaved = useRef("{}");
  const queue = useRef(createSaveQueue());
  const pending = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const closed = useRef(false);

  const load = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    setError("");
    try {
      const [loadedPatient, history] = await Promise.all([
        getPatient(patientId),
        listConsultations(patientId),
      ]);
      if (!loadedPatient)
        throw new Error(
          "No encontramos este paciente o no tienes autorización para verlo.",
        );
      const existingDraft = history.find((item) => item.status === "draft");
      const type: Consultation["consultation_type"] =
        existingDraft?.consultation_type ??
        (history.some((item) => item.status === "completed")
          ? "follow_up"
          : "initial");
      const [started, loadedTemplate, systemTemplate] = await Promise.all([
        existingDraft ?? beginConsultation(patientId, type),
        loadActiveTemplate(type),
        loadSystemTemplate(type),
      ]);
      const startedSnapshot = await ensureSnapshot(started, loadedTemplate);
      const answers = await listAnswers(started.id, startedSnapshot.revision);
      const nextValues = Object.fromEntries(
        answers.map((answer) => [answer.question_key, answer.value]),
      );
      const changedPersonal =
        startedSnapshot.template_id === loadedTemplate.template.id &&
        startedSnapshot.template_version < loadedTemplate.template.version;
      setLatest(changedPersonal ? loadedTemplate : systemTemplate);
      setPatient(loadedPatient);
      setConsultation(started);
      setSnapshot(startedSnapshot);
      setValues(nextValues);
      valuesRef.current = nextValues;
      lastSaved.current = JSON.stringify(nextValues);
      setSavedEncoded(lastSaved.current);
      closed.current = false;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo iniciar la consulta.",
      );
    } finally {
      setLoading(false);
    }
  }, [patientId]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!consultation || !snapshot || closed.current) return false;
    const captured = structuredClone(valuesRef.current);
    const encoded = JSON.stringify(captured);
    pending.current += 1;
    setSaving(true);
    try {
      await queue.current(async () => {
        if (encoded === lastSaved.current) return;
        await saveAnswers(consultation, snapshot, captured);
        lastSaved.current = encoded;
        setSavedEncoded(encoded);
      });
      setError("");
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo guardar. No cierres esta pantalla; puedes volver a intentarlo.",
      );
      return false;
    } finally {
      pending.current -= 1;
      setSaving(pending.current > 0);
    }
  }, [consultation, snapshot]);

  useEffect(() => {
    if (busy || loading || JSON.stringify(values) === lastSaved.current) return;
    const timer = window.setTimeout(() => {
      void save();
    }, 900);
    return () => window.clearTimeout(timer);
  }, [values, save, busy, loading]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (
        JSON.stringify(valuesRef.current) !== lastSaved.current ||
        pending.current
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    // Guard in-app links as well as browser refresh: a sidebar click must not lose the last keystroke.
    const leave = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element ? event.target.closest("a") : null;
      if (
        !anchor ||
        anchor.target === "_blank" ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.button !== 0
      )
        return;
      const url = new URL(anchor.href);
      if (
        url.origin !== window.location.origin ||
        closed.current ||
        (JSON.stringify(valuesRef.current) === lastSaved.current &&
          !pending.current)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      void save().then((ok) => {
        if (ok) navigate(url.pathname + url.search + url.hash);
      });
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", leave, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", leave, true);
    };
  }, [save, navigate]);

  const setAnswer = (key: string, value: unknown) => {
    const next = { ...valuesRef.current, [key]: value };
    valuesRef.current = next;
    setValues(next);
    setReviewed(false);
  };
  const sections = snapshot?.structure.sections ?? [];
  const reviewing = active === sections.length;
  const current = sections[active];
  const goTo = async (index: number) => {
    if (!(await save())) return;
    setActive(Math.max(0, Math.min(index, sections.length)));
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
    requestAnimationFrame(() =>
      heading.current?.focus({ preventScroll: true }),
    );
  };
  const upgrade = async () => {
    if (!consultation || !snapshot || !latest) return;
    if (
      !window.confirm(
        "¿Usar la entrevista actualizada en este borrador? Se conservará una revisión de todas las preguntas y respuestas anteriores. Solo se copiarán las respuestas compatibles. Tu plantilla personalizada no se modificará.",
      )
    )
      return;
    setBusy(true);
    try {
      if (!(await save())) return;
      const next = await adoptTemplate(consultation, latest, snapshot.revision);
      const answers = await listAnswers(consultation.id, next.revision);
      const nextValues = Object.fromEntries(
        answers.map((answer) => [answer.question_key, answer.value]),
      );
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
    if (!consultation || !snapshot || !reviewed) return;
    setShowErrors(true);
    const firstInvalid = sections.findIndex((section) =>
      section.questions.some(
        (q) =>
          matchesCondition(q.visibility_condition, valuesRef.current) &&
          questionErrors(q, valuesRef.current[q.question_key]).length,
      ),
    );
    if (firstInvalid >= 0) {
      setActive(firstInvalid);
      setError(
        "Revisa los campos señalados antes de cerrar. Los campos opcionales pueden quedar sin responder.",
      );
      return;
    }
    setBusy(true);
    try {
      if (!(await save())) return;
      const answered = sections
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
      closed.current = true;
      navigate("/app/patients/" + patientId);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo cerrar la entrevista.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingState label="Preparando entrevista…" />;
  if (!patient || !consultation || !snapshot)
    return (
      <ErrorState
        message={error || "No pudimos abrir la consulta."}
        onRetry={() => void load()}
      />
    );
  const canUpgrade =
    latest &&
    (latest.template.id === snapshot.template_id
      ? latest.template.version > snapshot.template_version
      : latest.template.is_system &&
        snapshot.template_version < latest.template.version);
  const progress = sections.map((section) => sectionProgress(section, values));
  const answered = progress.reduce((sum, item) => sum + item.answered, 0);
  const total = progress.reduce((sum, item) => sum + item.total, 0);
  const dirty = JSON.stringify(values) !== savedEncoded;
  return (
    <div className="mx-auto min-w-0 max-w-7xl pb-28 [overflow-wrap:anywhere]">
      <header className="rounded-[24px] bg-[#173d36] p-5 text-white sm:p-7">
        <Link
          to={"/app/patients/" + patient.id}
          className="inline-flex items-center gap-2 text-sm text-white/70"
        >
          <ArrowLeft size={16} />
          Volver a la ficha
        </Link>
        <div className="mt-5 flex flex-col gap-4 xl:flex-row xl:justify-between">
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
              <br />
              {formatPatientDate(consultation.consultation_date)}
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <Link
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-3 py-2.5 text-xs font-semibold"
              to={
                "/app/consultation-templates/" + consultation.consultation_type
              }
            >
              <SlidersHorizontal size={15} />
              Editar plantilla
            </Link>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2.5 text-xs font-semibold"
              disabled={busy || saving}
              onClick={() =>
                void save().then((ok) => {
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
      {consultation.consultation_type === "initial" &&
        snapshot.template_version >= 2 && (
          <p className="mt-3 text-xs leading-5 text-[#74817d]">
            Entrevista previa a la valoración · sin antropometría. No es
            necesario llenar todo: pregunta lo relevante y amplía solo cuando
            corresponda.
          </p>
        )}
      {canUpgrade && (
        <div className="mt-4 rounded-2xl border border-[#e7d3ae] bg-[#fff9eb] p-4">
          <p className="text-sm font-semibold text-[#775527]">
            Hay una entrevista más completa disponible
          </p>
          <p className="mt-1 text-xs leading-5 text-[#8e744c]">
            Este borrador conserva la versión anterior. Actualizarlo no elimina
            respuestas ni cambia tu plantilla personal.
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
      {notice && (
        <p
          role="status"
          className="mt-4 rounded-xl bg-[#eaf3ec] px-4 py-3 text-sm text-[#315e4f]"
        >
          {notice}
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="mt-4 rounded-xl bg-[#fbe9e5] px-4 py-3 text-sm text-[#963f32]"
        >
          {error}
        </div>
      )}
      <div className="mt-6 grid min-w-0 gap-5 xl:grid-cols-[225px_minmax(0,1fr)]">
        <aside className="min-w-0 xl:sticky xl:top-24 xl:h-fit">
          <div className="mb-4">
            <p className="text-xs font-semibold text-[#496758]">
              {answered} de {total} preguntas visibles con respuesta
            </p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#dfe8e1]">
              <div
                className="h-full rounded-full bg-[#709883]"
                style={{ width: (total ? (answered / total) * 100 : 0) + "%" }}
              />
            </div>
            <p className="mt-2 text-[10px] text-[#839188]">
              Orientativo; los campos opcionales no bloquean el cierre.
            </p>
          </div>
          <label
            className="text-xs font-semibold xl:hidden"
            htmlFor="interview-section"
          >
            Ir a una sección
          </label>
          <select
            id="interview-section"
            className="nuth-input mt-2 !min-w-0 xl:hidden"
            disabled={busy}
            value={active}
            onChange={(event) => void goTo(Number(event.target.value))}
          >
            {sections.map((section, index) => (
              <option key={section.section_key} value={index}>
                {index + 1}. {section.title}
              </option>
            ))}
            <option value={sections.length}>Revisar y cerrar</option>
          </select>
          <nav
            aria-label="Secciones de la entrevista"
            className="hidden space-y-1 xl:block"
          >
            {sections.map((section, index) => (
              <button
                type="button"
                key={section.section_key}
                disabled={busy}
                aria-current={active === index ? "step" : undefined}
                onClick={() => void goTo(index)}
                className={
                  "flex w-full items-start gap-2 rounded-xl px-3 py-2.5 text-left text-xs leading-5 " +
                  (active === index
                    ? "bg-[#dfebe2] font-semibold text-[#285647]"
                    : "text-[#687870] hover:bg-white")
                }
              >
                <span className="w-4 shrink-0 opacity-60">{index + 1}</span>
                <span className="flex-1">{section.title}</span>
                <span className="shrink-0 text-[10px] opacity-70">
                  {progress[index].answered}/{progress[index].total}
                </span>
              </button>
            ))}
            <button
              type="button"
              disabled={busy}
              onClick={() => void goTo(sections.length)}
              className={
                "mt-3 flex w-full items-center gap-2 rounded-xl px-3 py-3 text-xs font-semibold " +
                (reviewing ? "bg-[#dfebe2] text-[#285647]" : "text-[#3d705d]")
              }
            >
              <ClipboardCheck size={16} />
              Revisar y cerrar
            </button>
          </nav>
        </aside>
        <main className="min-w-0 rounded-[24px] border border-[#dfe5e1] bg-white p-4 sm:p-7">
          <p className="nuth-eyebrow">
            {reviewing
              ? "Antes de cerrar"
              : "Sección " + (active + 1) + " de " + sections.length}
          </p>
          <h2
            ref={heading}
            tabIndex={-1}
            className="mt-2 text-xl font-semibold text-[#173d36] outline-none sm:text-2xl"
          >
            {reviewing ? "Revisa lo conversado" : current?.title}
          </h2>
          {reviewing ? (
            <>
              <p className="mt-3 text-sm leading-6 text-[#718176]">
                Esta síntesis organiza únicamente lo registrado. No completa
                datos faltantes ni genera diagnósticos. Puedes volver a
                cualquier sección antes de cerrar.
              </p>
              <div className="mt-5">
                <InterviewReview
                  structure={snapshot.structure}
                  values={values}
                  onSection={(index) => void goTo(index)}
                  showEmpty
                />
              </div>
              <label className="mt-6 flex items-start gap-3 rounded-xl bg-[#edf5ef] p-4 text-sm leading-6 text-[#315e4f]">
                <input
                  type="checkbox"
                  className="mt-1.5 accent-[#315e4f]"
                  checked={reviewed}
                  disabled={busy}
                  onChange={(event) => setReviewed(event.target.checked)}
                />
                Revisé la información. Entiendo que al cerrar esta consulta
                quedará en el historial y no podré editar sus respuestas.
              </label>
            </>
          ) : (
            <>
              {current?.description && (
                <div className="mt-4 rounded-2xl bg-[#eff6f0] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[#527a61]">
                    Guión para acompañar la conversación
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#426650]">
                    {current.description}
                  </p>
                </div>
              )}
              <fieldset
                disabled={busy}
                className="mt-6 min-w-0 space-y-7 border-0 p-0"
              >
                {current?.questions
                  .filter((question) =>
                    matchesCondition(question.visibility_condition, values),
                  )
                  .map((question) => (
                    <QuestionField
                      key={question.question_key}
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
                  ))}
                {!current?.questions.length && (
                  <p className="text-sm text-[#74817d]">
                    Esta sección no tiene preguntas activas.
                  </p>
                )}
              </fieldset>
            </>
          )}
        </main>
      </div>
      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-[#dfe5e1] bg-white/95 px-3 py-3 backdrop-blur lg:left-[250px]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2">
          <button
            type="button"
            className="nuth-button-secondary !px-3 !text-xs sm:!text-sm"
            disabled={active === 0 || busy}
            onClick={() => void goTo(active - 1)}
          >
            <ChevronLeft size={15} />
            Anterior
          </button>
          <span
            role="status"
            className="hidden text-xs text-[#74817d] md:block"
          >
            {saving
              ? "Guardando…"
              : dirty
                ? "Cambios sin guardar"
                : "Cambios guardados"}
          </span>
          {reviewing ? (
            <button
              type="button"
              className="nuth-button !px-3 !text-xs sm:!text-sm"
              disabled={busy || !reviewed}
              onClick={() => void complete()}
            >
              {busy ? (
                <LoaderCircle className="animate-spin" size={15} />
              ) : (
                <Check size={15} />
              )}
              Cerrar entrevista
            </button>
          ) : (
            <button
              type="button"
              className="nuth-button !px-3 !text-xs sm:!text-sm"
              disabled={busy}
              onClick={() => void goTo(active + 1)}
            >
              {active === sections.length - 1 ? "Revisar resumen" : "Siguiente"}
              <ChevronRight size={15} />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
