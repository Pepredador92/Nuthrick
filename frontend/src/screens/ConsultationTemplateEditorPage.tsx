import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Archive,
  Copy,
  Eye,
  LoaderCircle,
  Plus,
  RotateCcw,
  Save,
  Star,
  Trash2,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { ErrorState, LoadingState } from "@/src/components/ui/Status";
import { Input, Textarea } from "@/src/components/ui/FormField";
import { QuestionField } from "@/src/components/consultations/QuestionField";
import {
  matchesCondition,
  repeatableFields,
  stringList,
  templateQuestionErrors,
} from "@/src/features/consultations/questionnaire";
import {
  archiveTemplate,
  createPersonalTemplateCopy,
  deleteTemplate,
  listAvailableTemplates,
  loadSystemTemplate,
  restoreTemplate,
  restoreSystemTemplate,
  saveTemplate,
  setDefaultTemplate,
} from "@/src/services/consultations";
import type { LoadedTemplate } from "@/src/services/consultations";
import type {
  Consultation,
  ConsultationQuestionType,
  ConsultationTemplateQuestion,
} from "@/src/types/domain";

const types: Array<[ConsultationQuestionType, string]> = [
  ["select", "Una opción"],
  ["multi_select", "Varias opciones"],
  ["boolean", "Sí / no"],
  ["short_text", "Respuesta breve"],
  ["long_text", "Nota libre"],
  ["number", "Número"],
  ["date", "Fecha"],
  ["time", "Hora"],
  ["repeatable_group", "Lista de registros"],
];
const newKey = (prefix: string) =>
  prefix + "-" + crypto.randomUUID().replaceAll("-", "").slice(0, 16);

export function ConsultationTemplateEditorPage() {
  const rawType = useParams().consultationType;
  const type: Consultation["consultation_type"] =
    rawType === "follow_up" ? "follow_up" : "initial";
  const [loaded, setLoaded] = useState<LoadedTemplate | null>(null);
  const [templates, setTemplates] = useState<LoadedTemplate[]>([]);
  const [system, setSystem] = useState<LoadedTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [active, setActive] = useState(0);
  const [preview, setPreview] = useState(false);
  const [overview, setOverview] = useState(true);
  const [previewValues, setPreviewValues] = useState<Record<string, unknown>>(
    {},
  );
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const markDirty = () => {
    setDirty(true);
    dirtyRef.current = true;
    setNotice("");
  };
  const load = useCallback(
    async (preferredId?: string) => {
      setLoading(true);
      setError("");
      try {
        const [available, latest] = await Promise.all([
          listAvailableTemplates(type, false, true),
          loadSystemTemplate(type, true),
        ]);
        const template =
          available.find((item) => item.template.id === preferredId) ??
          available.find(
            (item) => item.template.is_default && item.template.is_active,
          ) ??
          available.find(
            (item) => !item.template.is_system && item.template.is_active,
          ) ??
          available.find(
            (item) => item.template.is_system && item.template.is_active,
          ) ??
          available[0] ??
          latest;
        setTemplates(available);
        setLoaded(template);
        setSystem(latest);
        setPreview(template.template.is_system);
        setActive(0);
        setOverview(true);
        setDirty(false);
        dirtyRef.current = false;
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "No se pudo cargar el diseño.",
        );
      } finally {
        setLoading(false);
      }
    },
    [type],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const leave = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element ? event.target.closest("a") : null;
      if (
        anchor &&
        anchor.target !== "_blank" &&
        dirtyRef.current &&
        !window.confirm(
          "Hay cambios sin guardar en el diseño. ¿Salir sin guardarlos?",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", leave, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      document.removeEventListener("click", leave, true);
    };
  }, []);
  const mutate = (next: LoadedTemplate) => {
    setLoaded(next);
    markDirty();
  };
  const editQuestion = (
    id: string,
    patch: Partial<ConsultationTemplateQuestion>,
  ) => {
    const target = loaded?.questions.find((q) => q.id === id);
    if (
      target &&
      dependencyMessage(target) &&
      (patch.configuration ||
        patch.question_type ||
        patch.response_area ||
        patch.is_active === false)
    )
      return;
    if (loaded)
      mutate({
        ...loaded,
        questions: loaded.questions.map((q) =>
          q.id === id ? { ...q, ...patch } : q,
        ),
      });
  };
  const copy = async (source: LoadedTemplate) => {
    if (
      dirty &&
      !window.confirm(
        "¿Descartar los cambios sin guardar y crear una copia de esta versión?",
      )
    )
      return;
    setSaving(true);
    setError("");
    try {
      const copied = await createPersonalTemplateCopy(
        source,
        newKey("personal-" + type),
      );
      setLoaded(copied);
      setTemplates(await listAvailableTemplates(type, false, true));
      setPreview(false);
      setOverview(false);
      setActive(0);
      setDirty(false);
      dirtyRef.current = false;
      setNotice(
        "Copia personal lista. Puedes editar guiones, preguntas y opciones. Las consultas existentes no cambian automáticamente.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo crear la copia.",
      );
    } finally {
      setSaving(false);
    }
  };
  const save = async () => {
    if (!loaded) return;
    if (
      loaded.template.name.trim().length < 2 ||
      (loaded.template.description?.length ?? 0) > 600 ||
      (loaded.template.estimated_duration_minutes !== null &&
        (loaded.template.estimated_duration_minutes < 5 ||
          loaded.template.estimated_duration_minutes > 480))
    ) {
      setError(
        "El nombre debe tener entre 2 y 120 caracteres, la descripción hasta 600 y la duración entre 5 y 480 minutos.",
      );
      return;
    }
    const questionIssues = templateQuestionErrors(loaded.questions);
    if (questionIssues.length) {
      setError(questionIssues[0]);
      return;
    }
    const invalid =
      loaded.sections.some(
        (s) => s.title.trim().length < 2 || (s.description?.length ?? 0) > 600,
      ) ||
      loaded.questions.some(
        (q) =>
          q.label.trim().length < 2 ||
          (["select", "multi_select"].includes(q.question_type) &&
            stringList(q.configuration.options).filter((v) => v.trim()).length <
              2),
      );
    if (invalid) {
      setError(
        "Usa títulos de al menos 2 caracteres y al menos 2 opciones por pregunta de selección. Los guiones admiten hasta 600 caracteres.",
      );
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await saveTemplate(loaded);
      setLoaded(saved);
      setTemplates(await listAvailableTemplates(type, false, true));
      setDirty(false);
      dirtyRef.current = false;
      setNotice(
        "Diseño guardado. Las consultas nuevas usarán esta versión; los borradores pueden actualizarse de forma explícita.",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };
  const selectTemplate = (template: LoadedTemplate) => {
    if (
      dirty &&
      !window.confirm("¿Descartar los cambios sin guardar y abrir otro diseño?")
    )
      return;
    setLoaded(template);
    setActive(0);
    setOverview(true);
    setPreview(template.template.is_system);
    setPreviewValues({});
    setDirty(false);
    dirtyRef.current = false;
    setError("");
    setNotice("");
  };
  const makeDefault = async () => {
    if (!loaded || loaded.template.is_system) return;
    setSaving(true);
    try {
      await setDefaultTemplate(loaded.template.id);
      await load(loaded.template.id);
      setNotice("Diseño establecido como predeterminado.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo actualizar.",
      );
    } finally {
      setSaving(false);
    }
  };
  const setArchived = async (archived: boolean) => {
    if (!loaded || loaded.template.is_system) return;
    if (
      archived &&
      !window.confirm(
        "¿Archivar este diseño? Dejará de aparecer al crear consultas nuevas.",
      )
    )
      return;
    setSaving(true);
    try {
      if (archived) await archiveTemplate(loaded.template.id);
      else await restoreTemplate(loaded.template.id);
      await load(archived ? undefined : loaded.template.id);
      setNotice(archived ? "Diseño archivado." : "Diseño reactivado.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo actualizar.",
      );
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!loaded || loaded.template.is_system) return;
    if (
      !window.confirm(
        `¿Eliminar definitivamente “${loaded.template.name}”? Las consultas históricas conservarán su cuestionario y sus respuestas.`,
      )
    )
      return;
    setSaving(true);
    setError("");
    try {
      await deleteTemplate(loaded.template.id);
      await load();
      setNotice("Diseño eliminado. El historial clínico no fue modificado.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo eliminar.");
    } finally {
      setSaving(false);
    }
  };
  const restore = async () => {
    if (
      !window.confirm(
        "¿Usar el diseño predeterminado para las consultas nuevas? La copia personal y las consultas anteriores se conservarán.",
      )
    )
      return;
    setSaving(true);
    try {
      await restoreSystemTemplate(type);
      await load();
      setNotice("Las nuevas consultas usarán el diseño predeterminado.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo cambiar el diseño.",
      );
    } finally {
      setSaving(false);
    }
  };
  if (loading) return <LoadingState label="Cargando diseños de consulta…" />;
  if (!loaded)
    return (
      <ErrorState
        message={error || "No encontramos el diseño."}
        onRetry={() => void load()}
      />
    );
  const readonly = loaded.template.is_system;
  const section = loaded.sections[active];
  const questions = loaded.questions
    .filter((q) => q.section_id === section?.id)
    .sort((a, b) => a.display_order - b.display_order);
  const move = (kind: "section" | "question", index: number, delta: number) => {
    const items = kind === "section" ? loaded.sections : questions;
    const first = items[index],
      second = items[index + delta];
    if (!first || !second) return;
    const updated = items
      .map((item) =>
        item.id === first.id
          ? { ...item, display_order: second.display_order }
          : item.id === second.id
            ? { ...item, display_order: first.display_order }
            : item,
      )
      .sort((a, b) => a.display_order - b.display_order);
    if (kind === "section") {
      mutate({ ...loaded, sections: updated as LoadedTemplate["sections"] });
      setActive(index + delta);
    } else
      mutate({
        ...loaded,
        questions: loaded.questions.map(
          (q) =>
            (updated.find(
              (item) => item.id === q.id,
            ) as ConsultationTemplateQuestion) ?? q,
        ),
      });
  };
  const addSection = () => {
    const now = new Date().toISOString();
    mutate({
      ...loaded,
      sections: [
        ...loaded.sections,
        {
          id: crypto.randomUUID(),
          template_id: loaded.template.id,
          section_key: newKey("section"),
          title: "Nueva sección",
          description: "",
          display_order:
            Math.max(-1, ...loaded.sections.map((s) => s.display_order)) + 1,
          is_active: true,
          created_at: now,
          updated_at: now,
        },
      ],
    });
    setActive(loaded.sections.length);
  };
  const addQuestion = () => {
    if (!section) return;
    const now = new Date().toISOString();
    mutate({
      ...loaded,
      questions: [
        ...loaded.questions,
        {
          id: crypto.randomUUID(),
          section_id: section.id,
          question_key: newKey("question"),
          label: "Nueva pregunta",
          help_text: null,
          question_type: "select",
          response_area: "patient_reported",
          is_required: false,
          is_active: true,
          display_order:
            Math.max(-1, ...questions.map((q) => q.display_order)) + 1,
          configuration: { options: ["Sí", "No", "No sabe / no recuerda"] },
          visibility_condition: null,
          created_at: now,
          updated_at: now,
        },
      ],
    });
  };
  const removeQuestion = (question: ConsultationTemplateQuestion) => {
    if (dependencyMessage(question)) return;
    if (!window.confirm(`¿Quitar “${question.label}” de esta entrevista?`))
      return;
    const remainingInSection = loaded.questions
      .filter(
        (q) => q.section_id === question.section_id && q.id !== question.id,
      )
      .sort((a, b) => a.display_order - b.display_order)
      .map((q, index) => ({ ...q, display_order: index }));
    const reordered = new Map(remainingInSection.map((q) => [q.id, q]));
    mutate({
      ...loaded,
      questions: loaded.questions
        .filter((q) => q.id !== question.id)
        .map((q) => reordered.get(q.id) ?? q),
    });
    setNotice(
      "Pregunta quitada de la entrevista. Guarda los cambios para aplicarlo.",
    );
  };
  function dependencyMessage(
    question: ConsultationTemplateQuestion,
  ): string | null {
    if (question.question_key === "life_stage")
      return "Esta respuesta se utiliza como contexto para interpretar resultados antropométricos. Conserva sus opciones y tipo de respuesta.";
    if (["objectives", "next_objectives"].includes(question.question_key))
      return "Esta pregunta alimenta el objetivo que puedes compartir en el Superlink. Conserva su estructura; puedes cambiar el texto.";
    const references = (value: unknown): boolean => {
      if (!value || typeof value !== "object") return false;
      return Object.entries(value).some(([key, item]) =>
        key === "question_key"
          ? item === question.question_key
          : references(item),
      );
    };
    if (
      loaded?.questions.some(
        (q) => q.id !== question.id && references(q.visibility_condition),
      )
    )
      return "Otras preguntas dependen de esta respuesta. Se conserva para que puedan mostrarse correctamente.";
    return null;
  }
  return (
    <div className="mx-auto min-w-0 max-w-6xl pb-24 [overflow-wrap:anywhere]">
      <header className="rounded-[24px] bg-[#173d36] p-5 text-white sm:p-7">
        <p className="text-xs text-white/60">
          Guiones y cuestionarios de consulta
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Diseño de consulta</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">
          Organiza tu consulta a tu manera.
        </p>
        <nav aria-label="Tipo de diseño" className="mt-5 flex flex-wrap gap-2">
          {(["initial", "follow_up"] as const).map((item) => (
            <Link
              key={item}
              to={"/app/consultation-templates/" + item}
              className={
                "rounded-xl px-4 py-2 text-sm font-semibold " +
                (type === item
                  ? "bg-[#efbd6b] text-[#173d36]"
                  : "border border-white/20 text-white/70")
              }
            >
              {item === "initial" ? "Entrevista inicial" : "Seguimiento"}
            </Link>
          ))}
        </nav>
      </header>
      {overview && notice && <p role="status" className="mt-4 rounded-xl bg-[#edf5ef] p-4 text-sm text-[#315e4f]">{notice}</p>}
      {overview && error && <p role="alert" className="mt-4 rounded-xl bg-[#fbe9e5] p-4 text-sm text-[#963f32]">{error}</p>}
      {overview && (
        <section
          className="mt-5 rounded-2xl border border-[#dfe5e1] bg-white p-5 sm:p-7"
          aria-label="Tu consulta"
        >
          <p className="nuth-eyebrow">Tu consulta</p>
          <h2 className="mt-2 text-2xl font-semibold">
            {loaded.template.name}
          </h2>
          <p className="mt-2 text-sm text-[#607269]">
            {loaded.sections.filter((s) => s.is_active).length} secciones ·{" "}
            {
              loaded.questions.filter(
                (q) =>
                  q.is_active &&
                  loaded.sections.some(
                    (s) => s.id === q.section_id && s.is_active,
                  ),
              ).length
            }{" "}
            preguntas
            {loaded.template.is_default
              ? " · Diseño predeterminado"
              : readonly
                ? " · Recomendado por Nuthrick"
                : " · Diseño personal"}
          </p>
          <ol className="mt-5 grid gap-2 sm:grid-cols-2">
            {loaded.sections.map((s, index) => (
              <li key={s.id}>
                <button
                  className="flex w-full items-start gap-3 rounded-xl border border-[#e3e9e4] p-4 text-left hover:bg-[#f4f7f3]"
                  onClick={() => {
                    setActive(index);
                    setPreview(readonly);
                    setOverview(false);
                  }}
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#edf4ee] text-sm font-semibold">
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">
                      {s.title}
                      {!s.is_active && " · Desactivada"}
                    </span>
                    <span className="mt-1 block text-xs text-[#607269]">
                      {
                        loaded.questions.filter(
                          (q) => q.section_id === s.id && q.is_active,
                        ).length
                      }{" "}
                      preguntas
                    </span>
                    {s.description && (
                      <span className="mt-1 line-clamp-2 block text-xs text-[#74817d]">
                        {s.description}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              className="nuth-button"
              disabled={saving}
              onClick={() => {
                if (readonly) void copy(loaded);
                else {
                  setPreview(false);
                  setOverview(false);
                }
              }}
            >
              Personalizar consulta
            </button>
            <button
              className="nuth-button-secondary"
              onClick={() => {
                setPreview(true);
                setOverview(false);
                setPreviewValues({});
                setActive(0);
              }}
            >
              <Eye size={16} />
              Vista previa
            </button>
          </div>
          <p className="mt-3 text-xs text-[#74817d]">
            Los cambios no modifican consultas anteriores.
            {readonly && " Al personalizar se crea una copia propia."}
          </p>
        </section>
      )}
      <details className="mt-5 rounded-2xl border border-[#dfe5e1] bg-white p-4 sm:p-5">
        <summary className="cursor-pointer font-semibold">
          Otros diseños y variantes · {templates.length}
        </summary>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="mt-4 text-lg font-semibold">Diseños disponibles</h2>
            <p className="mt-1 text-sm text-[#74817d]">
              Selecciona uno para editarlo o crea otro a partir de la base de
              Nuthrick.
            </p>
          </div>
          {system && (
            <button
              type="button"
              className="nuth-button-secondary shrink-0"
              disabled={saving}
              onClick={() => void copy(system)}
            >
              <Plus size={16} />
              Crear nueva desde la base
            </button>
          )}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((item) => (
            <button
              key={item.template.id}
              type="button"
              onClick={() => selectTemplate(item)}
              className={
                "min-w-0 rounded-xl border p-4 text-left transition " +
                (loaded.template.id === item.template.id
                  ? "border-[#315e4f] bg-[#edf4ee]"
                  : "border-[#dfe5e1] hover:border-[#709883]") +
                (item.template.is_active ? "" : " opacity-60")
              }
            >
              <span className="block font-semibold">{item.template.name}</span>
              {item.template.description && (
                <span className="mt-1 line-clamp-2 block text-xs leading-5 text-[#63786c]">
                  {item.template.description}
                </span>
              )}
              <span className="mt-3 flex flex-wrap gap-1 text-[10px] text-[#74817d]">
                {item.template.estimated_duration_minutes && (
                  <span>{item.template.estimated_duration_minutes} min</span>
                )}
                {item.template.is_default && (
                  <span className="rounded-full bg-white px-2 py-0.5 font-semibold">
                    Predeterminado
                  </span>
                )}
                {item.template.is_system && <span>Base Nuthrick</span>}
                {!item.template.is_active && <span>Archivada</span>}
              </span>
            </button>
          ))}
        </div>
      </details>
      {!overview && (
        <>
          <button
            className="mt-5 text-sm font-semibold text-[#3d705d]"
            onClick={() => setOverview(true)}
          >
            Volver al diseño completo
          </button>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">{loaded.template.name}</h2>
              <p className="mt-1 text-xs text-[#74817d]">
                {readonly ? "Base Nuthrick" : "Personal"} ·{" "}
                {loaded.sections.filter((s) => s.is_active).length} secciones
                activas
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {readonly ? (
                <button
                  type="button"
                  className="nuth-button-secondary"
                  disabled={saving}
                  onClick={() => void copy(loaded)}
                >
                  <Copy size={16} />
                  Personalizar consulta
                </button>
              ) : (
                <>
                  {!loaded.template.is_default && loaded.template.is_active && (
                    <button
                      type="button"
                      className="nuth-button-secondary"
                      disabled={saving || dirty}
                      onClick={() => void makeDefault()}
                    >
                      <Star size={16} />
                      Hacer predeterminado
                    </button>
                  )}
                  <button
                    type="button"
                    className="nuth-button-secondary"
                    disabled={saving || dirty}
                    onClick={() => void copy(loaded)}
                  >
                    <Copy size={16} />
                    Duplicar diseño
                  </button>
                  <button
                    type="button"
                    className="nuth-button-secondary"
                    disabled={saving || dirty}
                    onClick={() => void setArchived(loaded.template.is_active)}
                  >
                    {loaded.template.is_active ? (
                      <Archive size={16} />
                    ) : (
                      <RotateCcw size={16} />
                    )}
                    {loaded.template.is_active ? "Archivar" : "Reactivar"}
                  </button>
                  <button
                    type="button"
                    className="nuth-button-secondary text-red-700"
                    disabled={saving || dirty}
                    onClick={() => void remove()}
                  >
                    <Trash2 size={16} />
                    Eliminar
                  </button>
                  <button
                    type="button"
                    className="nuth-button-secondary"
                    onClick={() => {
                      setPreview(!preview);
                      setPreviewValues({});
                    }}
                  >
                    <Eye size={16} />
                    {preview ? "Volver a editar" : "Vista previa"}
                  </button>
                  <button
                    type="button"
                    className="nuth-button"
                    disabled={saving || !dirty}
                    onClick={() => void save()}
                  >
                    {saving ? (
                      <LoaderCircle className="animate-spin" size={16} />
                    ) : (
                      <Save size={16} />
                    )}
                    Guardar cambios
                  </button>
                </>
              )}
            </div>
          </div>
          {!readonly &&
            system &&
            loaded.template.source_template_id !== system.template.id && (
              <div className="mt-4 rounded-xl bg-[#fff6e5] p-4 text-sm text-[#7b5d30]">
                Hay un diseño recomendado más reciente. Tu copia no se ha
                sobrescrito.
                <button
                  type="button"
                  disabled={saving}
                  className="ml-2 font-semibold underline"
                  onClick={() => void copy(system)}
                >
                  Crear copia de la nueva versión
                </button>
              </div>
            )}
          <p className="mt-3 text-xs leading-5 text-[#74817d]">
            {preview
              ? "Vista de prueba: estas respuestas no se guardan en ningún expediente."
              : "Los cambios se guardan juntos. Las preguntas desactivadas se conservan y pueden reactivarse."}
          </p>
          {notice && (
            <p
              role="status"
              className="mt-4 rounded-xl bg-[#edf5ef] p-4 text-sm text-[#315e4f]"
            >
              {notice}
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="mt-4 rounded-xl bg-[#fbe9e5] p-4 text-sm text-[#963f32]"
            >
              {error}
            </p>
          )}
          {!readonly && !preview && (
            <section className="mt-5 rounded-2xl border border-[#dfe5e1] bg-white p-4 sm:p-6">
              <h3 className="text-lg font-semibold">Información del diseño</h3>
              <div className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
                <label className="block min-w-0 text-sm font-semibold">
                  Nombre
                  <Input
                    className="mt-2"
                    maxLength={120}
                    value={loaded.template.name}
                    onChange={(event) =>
                      mutate({
                        ...loaded,
                        template: {
                          ...loaded.template,
                          name: event.target.value,
                        },
                      })
                    }
                  />
                </label>
                <label className="block min-w-0 text-sm font-semibold">
                  Duración aproximada en minutos · opcional
                  <Input
                    className="mt-2"
                    type="number"
                    min={5}
                    max={480}
                    value={loaded.template.estimated_duration_minutes ?? ""}
                    onChange={(event) =>
                      mutate({
                        ...loaded,
                        template: {
                          ...loaded.template,
                          estimated_duration_minutes: event.target.value
                            ? Number(event.target.value)
                            : null,
                        },
                      })
                    }
                  />
                </label>
                <label className="block min-w-0 text-sm font-semibold sm:col-span-2">
                  Descripción · opcional
                  <Textarea
                    className="mt-2"
                    maxLength={600}
                    value={loaded.template.description ?? ""}
                    onChange={(event) =>
                      mutate({
                        ...loaded,
                        template: {
                          ...loaded.template,
                          description: event.target.value,
                        },
                      })
                    }
                  />
                  <span className="mt-1 block text-xs font-normal text-[#74817d]">
                    {(loaded.template.description ?? "").length}/600 · Se
                    mostrará al elegir diseño para una consulta nueva.
                  </span>
                </label>
              </div>
            </section>
          )}
          <div className="mt-6 grid min-w-0 gap-5 xl:grid-cols-[225px_minmax(0,1fr)]">
            <aside className="min-w-0">
              <label
                htmlFor="template-section"
                className="text-xs font-semibold"
              >
                Sección del diseño
              </label>
              <select
                id="template-section"
                className="nuth-input mt-2 !min-w-0"
                value={active}
                onChange={(event) => setActive(Number(event.target.value))}
              >
                {loaded.sections.map((s, index) => (
                  <option key={s.id} value={index}>
                    {index + 1}. {s.title}
                    {s.is_active ? "" : " (desactivada)"}
                  </option>
                ))}
              </select>
              <nav
                aria-label="Secciones del diseño"
                className="mt-4 hidden space-y-1 xl:block"
              >
                {loaded.sections.map((s, index) => (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => setActive(index)}
                    className={
                      "w-full rounded-xl px-3 py-2.5 text-left text-xs leading-5 " +
                      (index === active
                        ? "bg-[#dfebe2] font-semibold text-[#285647]"
                        : "text-[#687870]")
                    }
                  >
                    {index + 1}. {s.title}
                    {!s.is_active && " · desactivada"}
                  </button>
                ))}
              </nav>
              {!readonly && !preview && (
                <button
                  type="button"
                  className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#3d705d]"
                  disabled={saving}
                  onClick={addSection}
                >
                  <Plus size={15} />
                  Agregar sección
                </button>
              )}
            </aside>
            {section && (
              <section className="min-w-0 rounded-[24px] border border-[#dfe5e1] bg-white p-4 sm:p-6">
                <fieldset disabled={saving} className="min-w-0 border-0 p-0">
                  {preview ? (
                    <>
                      <h3 className="text-xl font-semibold">{section.title}</h3>
                      {!section.is_active && (
                        <p className="mt-2 text-xs text-[#9b493a]">
                          Sección desactivada: no aparecerá en consultas nuevas.
                        </p>
                      )}
                      <div className="mt-4 rounded-xl bg-[#eff6f0] p-4 text-sm leading-6 text-[#426650]">
                        {section.description}
                      </div>
                      <div className="mt-6 space-y-7">
                        {questions
                          .filter(
                            (q) =>
                              q.is_active &&
                              matchesCondition(
                                q.visibility_condition,
                                previewValues,
                              ),
                          )
                          .map((q) => (
                            <QuestionField
                              key={q.id}
                              question={q}
                              value={previewValues[q.question_key]}
                              onChange={(value) =>
                                setPreviewValues((current) => ({
                                  ...current,
                                  [q.question_key]: value,
                                }))
                              }
                            />
                          ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <label
                        htmlFor="section-title"
                        className="text-xs font-semibold"
                      >
                        Título de sección
                      </label>
                      <Input
                        id="section-title"
                        className="mt-2"
                        maxLength={120}
                        value={section.title}
                        onChange={(event) =>
                          mutate({
                            ...loaded,
                            sections: loaded.sections.map((s) =>
                              s.id === section.id
                                ? { ...s, title: event.target.value }
                                : s,
                            ),
                          })
                        }
                      />
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          className="nuth-button-secondary !p-2"
                          aria-label="Subir sección"
                          disabled={active === 0}
                          onClick={() => move("section", active, -1)}
                        >
                          <ArrowUp size={15} />
                        </button>
                        <button
                          type="button"
                          className="nuth-button-secondary !p-2"
                          aria-label="Bajar sección"
                          disabled={active === loaded.sections.length - 1}
                          onClick={() => move("section", active, 1)}
                        >
                          <ArrowDown size={15} />
                        </button>
                        <label className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={section.is_active}
                            disabled={loaded.questions.some(
                              (q) =>
                                q.section_id === section.id &&
                                Boolean(dependencyMessage(q)),
                            )}
                            onChange={(event) =>
                              mutate({
                                ...loaded,
                                sections: loaded.sections.map((s) =>
                                  s.id === section.id
                                    ? { ...s, is_active: event.target.checked }
                                    : s,
                                ),
                              })
                            }
                          />
                          Sección activa
                        </label>
                      </div>
                      <label
                        htmlFor="section-script"
                        className="mt-5 block text-xs font-semibold text-[#477360]"
                      >
                        Guión para la conversación ·{" "}
                        {(section.description ?? "").length}/600
                      </label>
                      <Textarea
                        id="section-script"
                        className="mt-2"
                        maxLength={600}
                        value={section.description ?? ""}
                        onChange={(event) =>
                          mutate({
                            ...loaded,
                            sections: loaded.sections.map((s) =>
                              s.id === section.id
                                ? { ...s, description: event.target.value }
                                : s,
                            ),
                          })
                        }
                      />
                      <div className="mt-6 space-y-3">
                        {questions.map((q, index) => (
                          <details
                            key={q.id}
                            className={
                              "min-w-0 rounded-xl border border-[#e0e7e1] p-4 " +
                              (q.is_active ? "" : "bg-[#f4f5f1]")
                            }
                          >
                            <summary className="cursor-pointer text-sm font-semibold leading-6">
                              {index + 1}. {q.label}
                              <span className="ml-2 text-[10px] font-normal text-[#819087]">
                                {
                                  types.find(
                                    ([key]) => key === q.question_type,
                                  )?.[1]
                                }
                                {!q.is_active && " · desactivada"}
                              </span>
                            </summary>
                            <div className="mt-4 space-y-4">
                              {dependencyMessage(q) && (
                                <p className="rounded-xl bg-[#edf5ef] p-3 text-xs text-[#315e4f]">
                                  {dependencyMessage(q)}
                                </p>
                              )}
                              <label className="block text-xs font-semibold">
                                Pregunta
                                <Input
                                  className="mt-1.5"
                                  maxLength={500}
                                  value={q.label}
                                  onChange={(event) =>
                                    editQuestion(q.id, {
                                      label: event.target.value,
                                    })
                                  }
                                />
                              </label>
                              <fieldset
                                disabled={Boolean(dependencyMessage(q))}
                                className="space-y-4"
                              >
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <label className="block text-xs font-semibold">
                                    Tipo de respuesta
                                    <select
                                      className="nuth-input mt-1.5"
                                      value={q.question_type}
                                      disabled={
                                        q.configuration.widget ===
                                        "frequency_grid"
                                      }
                                      onChange={(event) => {
                                        const nextType = event.target
                                          .value as ConsultationQuestionType;
                                        editQuestion(q.id, {
                                          question_type: nextType,
                                          configuration: {
                                            ...q.configuration,
                                            ...(nextType === "select" ||
                                            nextType === "multi_select"
                                              ? {
                                                  options: stringList(
                                                    q.configuration.options,
                                                  ).length
                                                    ? q.configuration.options
                                                    : [
                                                        "Sí",
                                                        "No",
                                                        "No sabe / no recuerda",
                                                      ],
                                                }
                                              : {}),
                                            ...(nextType ===
                                              "repeatable_group" &&
                                            !q.configuration.fields
                                              ? {
                                                  fields: [
                                                    {
                                                      key: "name",
                                                      label: "Nombre",
                                                      type: "text",
                                                      required: true,
                                                    },
                                                  ],
                                                }
                                              : {}),
                                          },
                                        });
                                      }}
                                    >
                                      {types.map(([key, label]) => (
                                        <option key={key} value={key}>
                                          {label}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="block text-xs font-semibold">
                                    Origen de la información
                                    <select
                                      className="nuth-input mt-1.5"
                                      value={q.response_area}
                                      onChange={(event) =>
                                        editQuestion(q.id, {
                                          response_area: event.target
                                            .value as ConsultationTemplateQuestion["response_area"],
                                        })
                                      }
                                    >
                                      <option value="patient_reported">
                                        Referido por el paciente
                                      </option>
                                      <option value="professional_assessment">
                                        Criterio profesional
                                      </option>
                                    </select>
                                  </label>
                                </div>
                                {(q.question_type === "select" ||
                                  q.question_type === "multi_select" ||
                                  q.configuration.widget ===
                                    "frequency_grid") && (
                                  <label className="block text-xs font-semibold">
                                    Opciones · una por línea
                                    <Textarea
                                      className="mt-1.5"
                                      value={stringList(
                                        q.configuration.options,
                                      ).join("\n")}
                                      onChange={(event) =>
                                        editQuestion(q.id, {
                                          configuration: {
                                            ...q.configuration,
                                            options:
                                              event.target.value.split("\n"),
                                          },
                                        })
                                      }
                                    />
                                  </label>
                                )}
                                {q.question_type === "multi_select" && (
                                  <div>
                                    <p className="text-xs font-semibold">
                                      Opciones excluyentes
                                    </p>
                                    <p className="mt-1 text-xs leading-5 text-[#74817d]">
                                      Al elegir una, se quitan las demás (por
                                      ejemplo, “ninguno”).
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-3">
                                      {stringList(q.configuration.options)
                                        .filter(Boolean)
                                        .map((option, optionIndex) => (
                                          <label
                                            key={optionIndex}
                                            className="flex items-center gap-1.5 text-xs"
                                          >
                                            <input
                                              type="checkbox"
                                              checked={stringList(
                                                q.configuration
                                                  .exclusive_options,
                                              ).includes(option)}
                                              onChange={(event) =>
                                                editQuestion(q.id, {
                                                  configuration: {
                                                    ...q.configuration,
                                                    exclusive_options: event
                                                      .target.checked
                                                      ? [
                                                          ...stringList(
                                                            q.configuration
                                                              .exclusive_options,
                                                          ),
                                                          option,
                                                        ]
                                                      : stringList(
                                                          q.configuration
                                                            .exclusive_options,
                                                        ).filter(
                                                          (item) =>
                                                            item !== option,
                                                        ),
                                                  },
                                                })
                                              }
                                            />
                                            {option}
                                          </label>
                                        ))}
                                    </div>
                                  </div>
                                )}
                                {q.question_type === "repeatable_group" &&
                                  q.configuration.widget !==
                                    "frequency_grid" && (
                                    <div className="space-y-3">
                                      <p className="text-xs font-semibold">
                                        Campos de cada registro
                                      </p>
                                      {repeatableFields(q.configuration).map(
                                        (field, fieldIndex, fields) => (
                                          <div
                                            key={field.key}
                                            className="min-w-0 rounded-xl bg-[#f3f7f3] p-3"
                                          >
                                            <div className="grid gap-2 sm:grid-cols-2">
                                              <label className="text-xs">
                                                Etiqueta
                                                <Input
                                                  className="mt-1"
                                                  value={field.label}
                                                  onChange={(event) =>
                                                    editQuestion(q.id, {
                                                      configuration: {
                                                        ...q.configuration,
                                                        fields: fields.map(
                                                          (item, i) =>
                                                            i === fieldIndex
                                                              ? {
                                                                  ...item,
                                                                  label:
                                                                    event.target
                                                                      .value,
                                                                }
                                                              : item,
                                                        ),
                                                      },
                                                    })
                                                  }
                                                />
                                              </label>
                                              <label className="text-xs">
                                                Respuesta
                                                <select
                                                  className="nuth-input mt-1"
                                                  value={field.type}
                                                  onChange={(event) =>
                                                    editQuestion(q.id, {
                                                      configuration: {
                                                        ...q.configuration,
                                                        fields: fields.map(
                                                          (item, i) =>
                                                            i === fieldIndex
                                                              ? {
                                                                  ...item,
                                                                  type: event
                                                                    .target
                                                                    .value,
                                                                }
                                                              : item,
                                                        ),
                                                      },
                                                    })
                                                  }
                                                >
                                                  {[
                                                    ["text", "Texto breve"],
                                                    ["select", "Opciones"],
                                                    ["number", "Número"],
                                                    ["date", "Fecha"],
                                                    ["time", "Hora"],
                                                  ].map(([key, label]) => (
                                                    <option
                                                      key={key}
                                                      value={key}
                                                    >
                                                      {label}
                                                    </option>
                                                  ))}
                                                </select>
                                              </label>
                                            </div>
                                            {field.type === "select" && (
                                              <label className="mt-2 block text-xs">
                                                Opciones, una por línea
                                                <Textarea
                                                  className="mt-1"
                                                  value={(
                                                    field.options ?? []
                                                  ).join("\n")}
                                                  onChange={(event) =>
                                                    editQuestion(q.id, {
                                                      configuration: {
                                                        ...q.configuration,
                                                        fields: fields.map(
                                                          (item, i) =>
                                                            i === fieldIndex
                                                              ? {
                                                                  ...item,
                                                                  options:
                                                                    event.target.value.split(
                                                                      "\n",
                                                                    ),
                                                                }
                                                              : item,
                                                        ),
                                                      },
                                                    })
                                                  }
                                                />
                                              </label>
                                            )}
                                            <label className="mt-2 flex items-center gap-2 text-xs">
                                              <input
                                                type="checkbox"
                                                checked={field.detail ?? false}
                                                onChange={(event) =>
                                                  editQuestion(q.id, {
                                                    configuration: {
                                                      ...q.configuration,
                                                      fields: fields.map(
                                                        (item, i) =>
                                                          i === fieldIndex
                                                            ? {
                                                                ...item,
                                                                detail:
                                                                  event.target
                                                                    .checked,
                                                              }
                                                            : item,
                                                      ),
                                                    },
                                                  })
                                                }
                                              />
                                              Mostrar en “Completar detalles”
                                            </label>
                                          </div>
                                        ),
                                      )}
                                      <button
                                        type="button"
                                        className="text-xs font-semibold text-[#3d705d]"
                                        onClick={() =>
                                          editQuestion(q.id, {
                                            configuration: {
                                              ...q.configuration,
                                              fields: [
                                                ...repeatableFields(
                                                  q.configuration,
                                                ),
                                                {
                                                  key: newKey("field"),
                                                  label: "Nuevo campo",
                                                  type: "text",
                                                },
                                              ],
                                            },
                                          })
                                        }
                                      >
                                        + Agregar campo al registro
                                      </button>
                                    </div>
                                  )}
                              </fieldset>
                              <label className="block text-xs font-semibold">
                                Ayuda breve (opcional)
                                <Textarea
                                  className="mt-1.5 !min-h-20"
                                  maxLength={1200}
                                  value={q.help_text ?? ""}
                                  onChange={(event) =>
                                    editQuestion(q.id, {
                                      help_text: event.target.value || null,
                                    })
                                  }
                                />
                              </label>
                              {q.visibility_condition && (
                                <p className="rounded-xl bg-[#edf5ef] p-3 text-xs leading-5 text-[#527560]">
                                  Pregunta condicional: aparece según respuestas
                                  previas. Puedes comprobarla en “Probar
                                  entrevista”. Su condición se conserva al
                                  editar las opciones.
                                </p>
                              )}
                              <div className="flex flex-wrap items-center gap-4">
                                <label className="flex items-center gap-2 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={q.is_active}
                                    disabled={Boolean(dependencyMessage(q))}
                                    onChange={(event) =>
                                      editQuestion(q.id, {
                                        is_active: event.target.checked,
                                      })
                                    }
                                  />
                                  Activa
                                </label>
                                <button
                                  type="button"
                                  className="inline-flex items-center rounded-lg border border-red-100 p-2 text-red-700 transition hover:bg-red-50"
                                  aria-label={"Quitar pregunta " + (index + 1)}
                                  title={
                                    dependencyMessage(q) || "Quitar pregunta"
                                  }
                                  disabled={Boolean(dependencyMessage(q))}
                                  onClick={() => removeQuestion(q)}
                                >
                                  <Trash2 size={14} />
                                </button>
                                <label className="flex items-center gap-2 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={q.is_required}
                                    onChange={(event) =>
                                      editQuestion(q.id, {
                                        is_required: event.target.checked,
                                      })
                                    }
                                  />
                                  Obligatoria
                                </label>
                                <button
                                  type="button"
                                  className="rounded-lg border p-2"
                                  aria-label={"Subir pregunta " + (index + 1)}
                                  disabled={index === 0}
                                  onClick={() => move("question", index, -1)}
                                >
                                  <ArrowUp size={14} />
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg border p-2"
                                  aria-label={"Bajar pregunta " + (index + 1)}
                                  disabled={index === questions.length - 1}
                                  onClick={() => move("question", index, 1)}
                                >
                                  <ArrowDown size={14} />
                                </button>
                              </div>
                            </div>
                          </details>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#3d705d]"
                        onClick={addQuestion}
                      >
                        <Plus size={16} />
                        Agregar pregunta con opciones
                      </button>
                    </>
                  )}
                </fieldset>
              </section>
            )}
          </div>
          {!readonly && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-[#74817d]">
                {dirty
                  ? "Hay cambios pendientes de guardar."
                  : "Sin cambios pendientes."}
              </p>
              <button
                type="button"
                disabled={saving}
                className="text-xs font-semibold text-[#3d705d] underline"
                onClick={() => void restore()}
              >
                Restaurar diseño recomendado
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
