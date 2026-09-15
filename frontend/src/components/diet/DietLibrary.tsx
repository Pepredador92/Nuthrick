import { useEffect, useRef, useState, type ReactNode } from "react";
import { BookOpen, Copy, Archive, X, Library, Save, Undo2 } from "lucide-react";
import type { NutritionPlan, ExchangeTargetSnapshot } from "@/src/types/domain";
import {
  compareLibrary,
  currentTargets,
  editLibraryTexts,
  libraryDays,
  libraryKind,
  libraryNutrition,
  libraryPreview,
  libraryReady,
  libraryRestrictions,
  libraryTexts,
  makeLibraryContent,
  type DietLibraryItem,
  type LibraryContent,
} from "@/src/features/diet-library/model";
import {
  archiveDietLibrary,
  listDietLibrary,
  saveDietLibrary,
  dietLibraryRecovery,
} from "@/src/services/dietLibrary";
import { PatientPlanPreview } from "./PatientPlanPreview";
import { dayName } from "@/src/features/menu/week";

function LibraryDialog({
  title,
  children,
  close,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
      className="fixed inset-0 m-auto max-h-[92dvh] w-[min(1100px,96vw)] max-w-none overflow-y-auto rounded-3xl border border-[#dbe6de] bg-[#f7faf7] p-4 text-[#24463b] shadow-2xl backdrop:bg-[#123c32]/50 sm:p-6"
      aria-label={title}
    >
      <header className="mb-5 flex items-start justify-between gap-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        <button
          type="button"
          aria-label="Cerrar biblioteca"
          disabled={busy}
          className="rounded-lg p-2 hover:bg-white"
          onClick={close}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
const number = (value: number) =>
  Number.isFinite(value)
    ? value.toLocaleString("es-MX", { maximumFractionDigits: 1 })
    : "—";
const fields: [keyof ExchangeTargetSnapshot, string, string][] = [
  ["energy_kcal", "Energía", "kcal"],
  ["protein_g", "Proteína", "g"],
  ["carbohydrate_g", "Carbohidratos", "g"],
  ["fat_g", "Grasa", "g"],
];
function NutritionComparison({
  content,
  target,
}: {
  content: LibraryContent;
  target: ExchangeTargetSnapshot | null;
}) {
  const rows = target
    ? compareLibrary(content, target).days
    : libraryNutrition(content).map((d) => ({ ...d, differences: null }));
  return (
    <div
      className="my-4 min-w-0 overflow-x-auto rounded-xl border border-[#dce6df] bg-white"
      tabIndex={0}
      aria-label="Comparación nutricional por día"
    >
      <table className="w-full min-w-[550px] text-left text-xs">
        <thead>
          <tr>
            <th className="p-3">Día</th>
            {fields.map(([k, label, unit]) => (
              <th key={k} className="p-3">
                {label} · {unit}
                {target && (
                  <small className="mt-1 block font-normal">
                    Objetivo {number(target[k])}
                  </small>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.day} className="border-t border-[#e6ece7]">
              <th className="p-3">{dayName(d.day)}</th>
              {fields.map(([k]) => (
                <td key={k} className="p-3">
                  {d.totals ? number(d.totals[k]) : "Sin verificar"}
                  {d.differences && (
                    <small className="mt-1 block text-[#64786d]">
                      Δ {d.differences[k] > 0 ? "+" : ""}
                      {number(d.differences[k])}
                    </small>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <p className="p-3 text-sm">
          Sin días aplicados. Puedes guardarla como pendiente.
        </p>
      )}
    </div>
  );
}

export function DietLibrary({
  plan,
  suggestions = false,
  capture,
  onApply,
  onRestore,
  onEdit,
  editingSource,
  onSaved,
}: {
  plan?: NutritionPlan;
  suggestions?: boolean;
  capture?: () => Promise<NutritionPlan>;
  onApply?: (item: DietLibraryItem, token: string) => Promise<void>;
  onRestore?: (token: string) => Promise<void>;
  onEdit?: (item: DietLibraryItem) => Promise<void>;
  editingSource?: { id: string; revision: number };
  onSaved?: (item: DietLibraryItem) => void;
}) {
  const [items, setItems] = useState<DietLibraryItem[]>([]);
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState("mine");
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<DietLibraryItem | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState<LibraryContent | null>(null);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<DietLibraryItem | null>(null);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [reviewed, setReviewed] = useState(false);
  const [recovery, setRecovery] = useState<string | null>(null);
  const operation = useRef<string | null>(null);
  const target = plan ? currentTargets(plan) : null;
  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await listDietLibrary());
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No pudimos cargar la biblioteca.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (suggestions) {
      let active = true;
      listDietLibrary()
        .then((v) => {
          if (active) setItems(v);
        })
        .catch(() => {
          if (active)
            setError(
              "No pudimos cargar las sugerencias. Abre Mi biblioteca para intentar de nuevo.",
            );
        });
      return () => {
        active = false;
      };
    }
  }, [suggestions]);
  const planId = plan?.id;
  useEffect(() => {
    if (!planId) return;
    let active = true;
    dietLibraryRecovery(planId)
      .then((v) => {
        if (active) setRecovery(v);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [planId, plan?.draft_revision]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No pudimos completar la operación.",
      );
    } finally {
      setBusy(false);
    }
  };
  const startSave = (
    content: LibraryContent,
    item: DietLibraryItem | null = null,
  ) => {
    setSaving(content);
    setEditing(item);
    setName(item?.name ?? `${libraryKind(libraryDays(content))} reutilizable`);
    setTexts({});
    setReviewed(false);
    operation.current = crypto.randomUUID();
    setSelected(null);
    setOpen(true);
  };
  const captureLibrary = async () => {
    const saved = await capture!();
    const latest = await listDietLibrary();
    setItems(latest);
    const source = latest.find(
      (i) => i.owner_id && i.id === editingSource?.id && !i.archived,
    );
    startSave(
      makeLibraryContent(saved),
      source && editingSource
        ? { ...source, revision: editingSource.revision }
        : null,
    );
  };
  const inspect = (item: DietLibraryItem) => {
    setSelected(item);
    setConfirm(false);
    operation.current = crypto.randomUUID();
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setSaving(null);
    setSelected(null);
    setConfirm(false);
    setError("");
  };
  const shortlist = target
    ? items
        .filter(
          (i) =>
            !i.archived &&
            libraryReady(i.content) &&
            Number.isFinite(compareLibrary(i.content, target).worst) &&
            !libraryRestrictions(i.content, plan?.diet_menu?.food_preferences)
              .excluded.length,
        )
        .sort((a, b) => {
          const x = compareLibrary(a.content, target),
            y = compareLibrary(b.content, target);
          return (
            x.worst - y.worst || x.mean - y.mean || a.name.localeCompare(b.name)
          );
        })
        .slice(0, 3)
    : [];
  const shown = items.filter(
    (i) =>
      (scope === "mine" ? !!i.owner_id : !i.owner_id) &&
      i.archived === showArchived &&
      (kind === "all" ||
        (kind === "diet"
          ? libraryDays(i.content) === 1
          : libraryDays(i.content) > 1)) &&
      i.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const restrictions = selected
    ? libraryRestrictions(selected.content, plan?.diet_menu?.food_preferences)
    : null;
  const card = (item: DietLibraryItem) => {
    const nutrition = libraryNutrition(item.content);
    const values = nutrition.flatMap((d) =>
      d.totals ? [d.totals.energy_kcal] : [],
    );
    const count = libraryDays(item.content);
    return (
      <article
        key={item.id}
        className="min-w-0 rounded-2xl border border-[#dce6df] bg-white p-4"
      >
        <p className="text-xs text-[#6b7f73]">
          {item.owner_id ? "Mi biblioteca" : "Nuthrick"} · {count}{" "}
          {count === 1 ? "día" : "días"} ·{" "}
          {libraryReady(item.content) ? libraryKind(count) : "Pendiente"}
        </p>
        <h3 className="mt-1 break-words font-semibold">{item.name}</h3>
        <p className="mt-2 line-clamp-2 text-xs text-[#64786d]">
          {item.content.distribution.meal_times
            .map((m) => m.display_name)
            .join(" · ")}
        </p>
        {values.length === count && count > 0 && (
          <p className="mt-2 text-sm font-medium">
            {number(Math.min(...values))}
            {Math.max(...values) !== Math.min(...values)
              ? `–${number(Math.max(...values))}`
              : ""}{" "}
            kcal / día
          </p>
        )}
        {target && libraryReady(item.content) && (
          <p className="mt-1 text-xs text-[#64786d]">
            Diferencia media del día más distante:{" "}
            {number(compareLibrary(item.content, target).worst * 100)} %
          </p>
        )}
        <button
          className="nuth-button-secondary mt-4 !px-3 !py-2"
          onClick={() => inspect(item)}
        >
          <BookOpen size={15} />
          {count > 1 ? "Ver plan" : "Ver dieta"}
        </button>
      </article>
    );
  };
  return (
    <section
      className="min-w-0 rounded-2xl border border-[#dfe6e1] bg-white p-4 sm:p-5"
      aria-label="Biblioteca de dietas y planes"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">
            {suggestions && target
              ? "Dietas y planes que se acercan a tu objetivo"
              : "Biblioteca de dietas y planes"}
          </h2>
          <p className="mt-1 text-xs text-[#6b7f73]">
            Reutiliza una base o continúa desde cero.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="nuth-button-secondary !px-3 !py-2"
            onClick={() => {
              setOpen(true);
              void refresh();
            }}
          >
            <Library size={16} />
            Mi biblioteca
          </button>
          {capture && (
            <button
              className="nuth-button-secondary !px-3 !py-2"
              disabled={busy}
              onClick={() => void run(captureLibrary)}
            >
              <Save size={16} />
              Guardar en biblioteca
            </button>
          )}
        </div>
      </div>
      {suggestions && target && (
        <>
          <p className="mt-3 text-xs text-[#6b7f73]">
            Comparación numérica, no aprobación clínica. Revisa cada día,
            ingredientes y porciones.
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {shortlist.map(card)}
          </div>
          {!shortlist.length && (
            <p className="mt-3 text-sm text-[#6b7f73]">
              Aún no hay bases completas verificables para comparar. Puedes
              explorar la biblioteca o seguir con tu plan.
            </p>
          )}
        </>
      )}
      {recovery && onRestore && (
        <button
          className="nuth-button-secondary mt-3 !py-2"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await onRestore(recovery);
              setRecovery(null);
              setNotice("Trabajo anterior recuperado.");
            })
          }
        >
          <Undo2 size={16} />
          Recuperar menú anterior
        </button>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm text-[#35684e]">
          {notice}
        </p>
      )}
      {error && !open && (
        <p role="alert" className="mt-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {open && (
        <LibraryDialog
          title={
            saving
              ? "Guardar base reutilizable"
              : selected
                ? selected.name
                : "Biblioteca de dietas y planes"
          }
          close={close}
          busy={busy}
        >
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800"
            >
              {error}
            </p>
          )}
          {saving ? (
            <div className="space-y-4">
              <label className="block text-sm">
                Nombre
                <input
                  className="nuth-input mt-1"
                  value={name}
                  maxLength={120}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <p className="text-sm">
                {libraryReady(saving)
                  ? "Base completa para comparar."
                  : "Se guardará como pendiente y no aparecerá en las sugerencias."}{" "}
                No se guardan datos del expediente. Revisa también los textos:
                podrían contener información personal.
              </p>
              <label className="block text-sm">
                Destino
                <select
                  className="nuth-input mt-1"
                  value={editing?.id ?? ""}
                  onChange={(e) =>
                    setEditing(
                      items.find((i) => i.id === e.target.value) ?? null,
                    )
                  }
                >
                  <option value="">Crear una copia nueva</option>
                  {items
                    .filter((i) => i.owner_id && !i.archived)
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        Actualizar: {i.name}
                      </option>
                    ))}
                </select>
              </label>
              {editing && (
                <p className="text-sm text-amber-800">
                  Reemplazarás únicamente esta base personal. No cambiarán los
                  borradores ni las versiones clínicas que la usaron.
                </p>
              )}
              <details className="rounded-xl border border-[#dce6df] bg-white p-3">
                <summary className="cursor-pointer font-semibold">
                  Revisar y editar textos reutilizables
                </summary>
                <div className="mt-3 space-y-2">
                  {libraryTexts(saving).map((text, i) => (
                    <label key={i} className="block text-xs text-[#64786d]">
                      Texto {i + 1}
                      <textarea
                        className="nuth-input mt-1 !text-sm"
                        value={texts[text] ?? text}
                        onChange={(e) => {
                          setTexts({ ...texts, [text]: e.target.value });
                          setReviewed(false);
                        }}
                      />
                    </label>
                  ))}
                </div>
              </details>
              <NutritionComparison content={saving} target={null} />
              <PatientPlanPreview
                value={libraryPreview({
                  name,
                  content: editLibraryTexts(saving, texts),
                })}
              />
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                Revisé nombre, ingredientes e indicaciones y no contienen datos
                personales del paciente.
              </label>
              <button
                className="nuth-button"
                disabled={busy || !reviewed || !name.trim()}
                onClick={() =>
                  void run(async () => {
                    const saved = await saveDietLibrary(
                      editing?.id ?? operation.current!,
                      name,
                      editLibraryTexts(saving, texts),
                      editing?.revision,
                    );
                    onSaved?.(saved);
                    await refresh();
                    close();
                    setNotice("Base guardada en tu biblioteca privada.");
                  })
                }
              >
                {busy
                  ? "Guardando…"
                  : editing
                    ? "Actualizar base"
                    : "Guardar copia privada"}
              </button>
            </div>
          ) : selected ? (
            <div>
              <p className="text-sm">
                {selected.owner_id ? "Mi biblioteca" : "Biblioteca de Nuthrick"}{" "}
                · {libraryDays(selected.content)}{" "}
                {libraryDays(selected.content) === 1 ? "día" : "días"} ·{" "}
                {libraryReady(selected.content) ? "Completa" : "Pendiente"}
              </p>
              <NutritionComparison content={selected.content} target={target} />
              {target && (
                <p className="mb-4 text-xs text-[#64786d]">
                  Orden: menor diferencia relativa de energía y gramos de los
                  tres macros, priorizando el día más distante. Las alternativas
                  no se suman. Ninguna coincidencia certifica adecuación
                  clínica.
                </p>
              )}
              {restrictions &&
                (restrictions.excluded.length > 0 ||
                  restrictions.avoided.length > 0) && (
                  <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                    Excluidos:{" "}
                    {restrictions.excluded.join(", ") || "ninguno registrado"}.
                    Prefiere evitar:{" "}
                    {restrictions.avoided.join(", ") || "ninguno registrado"}.
                  </p>
                )}
              <p className="mb-4 text-xs text-[#64786d]">
                Solo se cotejan preferencias registradas. Las alergias y
                restricciones no verificadas requieren revisión profesional.
              </p>
              <PatientPlanPreview value={libraryPreview(selected)} />
              {confirm ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                  <h3 className="font-semibold">
                    Usar una copia en este borrador
                  </h3>
                  <p className="mt-2">
                    Reemplazará equivalentes, tiempos, opciones y calendario.
                    Mantendrá paciente, consulta, energía y macros. Se guardará
                    el menú anterior para recuperarlo mientras no hagas nuevos
                    cambios.
                  </p>
                  <p className="mt-2">
                    Las cantidades no se escalan. Deberás revisar
                    compatibilidad, confirmar las opciones y revisar nuevamente
                    las sustituciones. No se publica nada.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      className="nuth-button"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await onApply!(selected, operation.current!);
                          close();
                          setNotice(
                            "Copia aplicada. Revisa equivalentes y confirma nuevamente las opciones.",
                          );
                        })
                      }
                    >
                      Guardar respaldo y usar base
                    </button>
                    <button
                      className="nuth-button-secondary"
                      disabled={busy}
                      onClick={() => setConfirm(false)}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  {onApply && (
                    <button
                      className="nuth-button"
                      disabled={
                        busy ||
                        !target ||
                        selected.archived ||
                        !!restrictions?.excluded.length
                      }
                      onClick={() => setConfirm(true)}
                    >
                      Usar como base
                    </button>
                  )}
                  <button
                    className="nuth-button-secondary"
                    onClick={() => startSave(structuredClone(selected.content))}
                  >
                    <Copy size={16} />
                    Crear copia
                  </button>
                  {selected.owner_id && (
                    <>
                      {onEdit && !selected.archived && (
                        <button
                          className="nuth-button-secondary"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              await onEdit(selected);
                              close();
                            })
                          }
                        >
                          Editar en Taller
                        </button>
                      )}
                      <button
                        className="nuth-button-secondary"
                        onClick={() =>
                          startSave(structuredClone(selected.content), selected)
                        }
                      >
                        Editar textos
                      </button>
                      <button
                        className="nuth-button-secondary"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            await archiveDietLibrary(
                              selected,
                              !selected.archived,
                            );
                            setSelected(null);
                            await refresh();
                          })
                        }
                      >
                        <Archive size={16} />
                        {selected.archived ? "Restaurar base" : "Archivar"}
                      </button>
                    </>
                  )}
                </div>
              )}
              {!target && (
                <p className="mt-3 text-sm">
                  Para usarla, abre un borrador y completa Energía y Macros.
                  Para editar cantidades, úsala como base y luego actualiza su
                  copia en Mi biblioteca.
                </p>
              )}
            </div>
          ) : (
            <>
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="Origen"
              >
                <button
                  className={
                    scope === "mine" ? "nuth-button" : "nuth-button-secondary"
                  }
                  onClick={() => setScope("mine")}
                >
                  Mi biblioteca
                </button>
                <button
                  className={
                    scope === "system" ? "nuth-button" : "nuth-button-secondary"
                  }
                  onClick={() => setScope("system")}
                >
                  Biblioteca de Nuthrick
                </button>
              </div>
              <div className="my-4 flex flex-wrap gap-3">
                <input
                  aria-label="Buscar en biblioteca"
                  placeholder="Buscar por nombre"
                  className="nuth-input min-w-0 flex-1"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <select
                  aria-label="Tipo de base"
                  className="nuth-input !w-auto"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                >
                  <option value="all">Todos</option>
                  <option value="diet">Dietas · 1 día</option>
                  <option value="plan">Planes · 2–7 días</option>
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                  />
                  Archivadas
                </label>
              </div>
              {loading ? (
                <p>Cargando biblioteca…</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {shown.map(card)}
                </div>
              )}
              {!loading && !shown.length && (
                <p className="py-8 text-center text-sm text-[#64786d]">
                  {scope === "mine"
                    ? "Aún no hay bases en esta selección. Guarda un borrador para reutilizarlo."
                    : "No hay bases de Nuthrick publicadas en esta selección. Tu contenido privado nunca se comparte aquí."}
                </p>
              )}
              <button
                className="nuth-button-secondary mt-4"
                onClick={() => void refresh()}
                disabled={loading}
              >
                Actualizar biblioteca
              </button>
            </>
          )}
        </LibraryDialog>
      )}
    </section>
  );
}
