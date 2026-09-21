import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Archive,
  Check,
  ChevronRight,
  FilePenLine,
  MoreHorizontal,
  UserRound,
} from "lucide-react";
import type { NutritionPlan } from "@/src/types/domain";
import { deleteDietDraft, updateDietPlan } from "@/src/services/dietPlans";
import { formatPatientDate } from "@/src/features/patients/patientUtils";

export const canDeleteDraft = (p: NutritionPlan) =>
  p.status === "draft" &&
  !p.current_version_id &&
  !p.has_published_versions &&
  !p.published_version_number;
export function PlanOrganization({
  plans,
  onChange,
  onCreate,
}: {
  plans: NutritionPlan[];
  onChange: (plans: NutritionPlan[]) => void;
  onCreate: () => void;
}) {
  const [filter, setFilter] = useState("drafts");
  const [relation, setRelation] = useState("all");
  const [action, setAction] = useState<{
    plan: NutritionPlan;
    kind: "rename" | "delete";
  } | null>(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const matches = (p: NutritionPlan, key: string) =>
    key === "all" ||
    (key === "archived"
      ? p.status === "archived"
      : key === "published"
        ? p.status !== "archived" && !canDeleteDraft(p)
        : canDeleteDraft(p));
  const visible = plans
    .filter(
      (p) =>
        matches(p, filter) &&
        (relation === "all" ||
          (relation === "assigned" ? !!p.patient_id : !p.patient_id)),
    )
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const open = (plan: NutritionPlan, kind: "rename" | "delete") => {
    setAction({ plan, kind });
    setTitle(plan.title);
    setError("");
    dialog.current?.showModal();
  };
  const submit = async () => {
    if (!action || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (action.kind === "delete") {
        await deleteDietDraft(action.plan.id, action.plan.draft_revision ?? 1);
        onChange(plans.filter((p) => p.id !== action.plan.id));
        setNotice("Borrador eliminado.");
      } else {
        const updated = await updateDietPlan(
          action.plan.id,
          { title },
          action.plan.draft_revision ?? 1,
        );
        onChange(
          plans.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)),
        );
        setNotice("Nombre actualizado.");
      }
      dialog.current?.close();
      setAction(null);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos completar la acción.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return (
    <section className="mx-auto max-w-5xl" aria-label="Mis planes">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Mis planes</h2>
        <a
          className="text-sm font-semibold text-[#3d705d]"
          href="#diet-library"
        >
          Mi biblioteca
        </a>
      </div>
      <div
        className="mt-4 flex flex-wrap gap-2"
        role="group"
        aria-label="Estado del plan"
      >
        {[
          ["drafts", "Borradores"],
          ["published", "Publicados"],
          ["archived", "Archivados"],
          ["all", "Todos"],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-pressed={filter === key}
            onClick={() => setFilter(key)}
            className={`rounded-full border px-3 py-2 text-sm ${filter === key ? "border-[#315e4f] bg-[#edf4ee] text-[#24463b]" : "border-[#dfe6e1] bg-white text-[#607269]"}`}
          >
            {label}{" "}
            <span className="ml-1 tabular-nums">
              {plans.filter((p) => matches(p, key)).length}
            </span>
          </button>
        ))}
      </div>
      <div
        className="mt-3 flex flex-wrap gap-3 text-xs"
        role="group"
        aria-label="Relación del plan"
      >
        {[
          ["all", "Todos los destinos"],
          ["assigned", "Asignados"],
          ["free", "Libres"],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-pressed={relation === key}
            onClick={() => setRelation(key)}
            className={`py-2 ${relation === key ? "font-bold underline underline-offset-4" : "text-[#607269]"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {notice && (
        <p role="status" className="mt-3 text-sm text-[#315e4f]">
          {notice}
        </p>
      )}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {visible.map((plan) => (
          <article
            key={plan.id}
            className={`min-w-0 rounded-2xl border border-l-4 bg-white p-5 ${plan.patient_id ? "border-[#dfe6e1] border-l-[#8fab9a]" : "border-[#dfe6e1] border-l-[#a6b5d2]"}`}
          >
            <div className="flex items-start gap-2">
              <Link
                to={`/app/diet-workshop/${plan.id}`}
                className="min-w-0 flex-1 font-semibold text-[#24463b] [overflow-wrap:anywhere]"
              >
                {plan.title}
              </Link>
              <details className="relative shrink-0">
                <summary
                  aria-label={`Acciones de ${plan.title}`}
                  className="grid h-10 w-10 cursor-pointer list-none place-items-center rounded-xl hover:bg-[#f3f6f3]"
                >
                  <MoreHorizontal size={20} />
                </summary>
                <div className="absolute right-0 z-10 grid min-w-44 gap-1 rounded-xl border bg-white p-2 text-sm shadow-lg">
                  <Link
                    className="rounded-lg p-2 hover:bg-[#f3f6f3]"
                    to={`/app/diet-workshop/${plan.id}`}
                  >
                    Abrir
                  </Link>
                  <button
                    className="rounded-lg p-2 text-left hover:bg-[#f3f6f3]"
                    onClick={() => open(plan, "rename")}
                  >
                    Renombrar
                  </button>
                  {plan.patient_id && (
                    <Link
                      className="rounded-lg p-2 hover:bg-[#f3f6f3]"
                      to={`/app/patients/${plan.patient_id}`}
                    >
                      Ver paciente
                    </Link>
                  )}
                  {canDeleteDraft(plan) && (
                    <button
                      className="rounded-lg p-2 text-left text-[#963f32] hover:bg-[#fbe9e5]"
                      onClick={() => open(plan, "delete")}
                    >
                      Eliminar borrador
                    </button>
                  )}
                </div>
              </details>
            </div>
            <p className="mt-1 text-xs text-[#607269]">
              Actualizado {formatPatientDate(plan.updated_at)}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span
                className={`inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1.5 ${plan.patient_id ? "bg-[#edf5ef] text-[#315e4f]" : "bg-[#eef1f8] text-[#495c80]"}`}
              >
                <UserRound size={13} className="shrink-0" />
                <span className="break-words">
                  {plan.patient_id
                    ? `Paciente asignado · ${plan.patient_name || "Paciente"}`
                    : "Plan libre"}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#f3f5f2] px-2 py-1.5 text-[#52665a]">
                {plan.status === "archived" ? (
                  <Archive size={13} />
                ) : canDeleteDraft(plan) ? (
                  <FilePenLine size={13} />
                ) : (
                  <Check size={13} />
                )}
                {plan.status === "archived"
                  ? "Archivado"
                  : canDeleteDraft(plan)
                    ? "Borrador"
                    : `Publicado${plan.published_version_number ? ` · v${plan.published_version_number}` : ""}`}
              </span>
            </div>
            <Link
              className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-[#3d705d]"
              to={`/app/diet-workshop/${plan.id}`}
            >
              Abrir plan <ChevronRight size={14} />
            </Link>
          </article>
        ))}
      </div>
      {!visible.length && (
        <div className="mt-4 rounded-2xl border border-dashed border-[#cdd9d1] bg-white p-8 text-center">
          <p className="text-sm text-[#607269]">
            {filter === "drafts" && relation === "all"
              ? "No tienes borradores pendientes."
              : "No hay planes en esta selección."}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <button onClick={onCreate} className="nuth-button">
              Nuevo plan
            </button>
            <a href="#diet-library" className="nuth-button-secondary">
              Mi biblioteca
            </a>
          </div>
        </div>
      )}
      <dialog
        ref={dialog}
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
        className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-[440px] rounded-2xl border border-[#dfe6e1] bg-white p-6 text-[#173d36] shadow-xl backdrop:bg-black/30"
        aria-labelledby="plan-action-title"
      >
        <h2 id="plan-action-title" className="text-xl font-semibold">
          {action?.kind === "delete" ? "Eliminar borrador" : "Renombrar plan"}
        </h2>
        {action?.kind === "delete" ? (
          <>
            <p className="mt-3 text-sm">
              {action.plan.patient_id
                ? `El borrador está asignado a ${action.plan.patient_name || "este paciente"}, pero aún no ha sido publicado.`
                : "Este plan todavía no ha sido publicado."}
            </p>
            <p className="mt-3 text-sm text-[#607269]">
              Esta acción eliminará el borrador y no se puede deshacer.
            </p>
          </>
        ) : (
          <label className="mt-4 block text-sm">
            Nombre del plan
            <input
              className="nuth-input mt-2"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-[#963f32]">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            autoFocus
            disabled={busy}
            className="nuth-button-secondary"
            onClick={() => dialog.current?.close()}
          >
            Cancelar
          </button>
          <button
            disabled={busy || !title.trim()}
            className="nuth-button"
            onClick={() => void submit()}
          >
            {busy
              ? "Procesando…"
              : action?.kind === "delete"
                ? "Eliminar"
                : "Guardar nombre"}
          </button>
        </div>
      </dialog>
    </section>
  );
}
