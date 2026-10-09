import { useEffect, useId, useRef, useState } from "react";
import { Plus, ShoppingBasket, Trash2 } from "lucide-react";
import type { TextDiet } from "../../../../supabase/functions/_shared/text-diet";
import {
  grocerySourceKey,
  patientGroceries,
  type GrocerySchedule,
} from "../../../../supabase/functions/_shared/groceries";
import {
  groceryCategories,
  groupGroceries,
  type GroceryCategory,
} from "../../../../supabase/functions/_shared/grocery-categories";
import {
  compileGroceries,
  groceryItems,
  validGroceryRows,
  type GroceryDraftRow,
} from "@/src/features/groceries/compile";

export function GroceryPublicationDialog({
  draft,
  onClose,
  onPublish,
}: {
  draft: TextDiet;
  onClose: () => void;
  onPublish: (draft: TextDiet) => Promise<boolean | void> | void;
}) {
  const id = useId(),
    dialog = useRef<HTMLDialogElement>(null),
    lock = useRef(false);
  const previous = patientGroceries(draft.shopping_list, draft.diets);
  const [include, setInclude] = useState(!!previous),
    [schedule, setSchedule] = useState<GrocerySchedule>(
      () =>
        previous?.schedule ??
        draft.diets.map((d) => ({ diet_id: d.id, title: d.title, days: 1 })),
    );
  const [rows, setRows] = useState<GroceryDraftRow[] | null>(() =>
    previous
      ? previous.items.map((item) => ({
          ...item,
          source: "Lista revisada de este borrador",
          needsReview: false,
        }))
      : null,
  );
  const [reviewed, setReviewed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const days = schedule.reduce((total, row) => total + row.days, 0),
    validDays =
      schedule.every(
        (row) => Number.isInteger(row.days) && row.days >= 0 && row.days <= 31,
      ) &&
      days > 0 &&
      days <= 31;
  const groups = groupGroceries(
    (rows ?? []).map((row, index) => ({ ...row, index })),
  );
  function calculate(next: GrocerySchedule) {
    const total = next.reduce((sum, row) => sum + row.days, 0);
    setRows(
      next.every(
        (row) => Number.isInteger(row.days) && row.days >= 0 && row.days <= 31,
      ) &&
        total > 0 &&
        total <= 31
        ? compileGroceries(draft.diets, next)
        : null,
    );
    setReviewed(false);
  }
  const ready =
    !include ||
    (validDays && rows !== null && validGroceryRows(rows) && reviewed);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal?.();
    return () => {
      if (node?.open) node.close?.();
    };
  }, []);
  function changeRow(index: number, patch: Partial<GroceryDraftRow>) {
    setRows((old) =>
      old!.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
    setReviewed(false);
  }
  async function publish() {
    if (lock.current || !ready) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const base = { ...draft };
      delete base.shopping_list;
      const now = new Date().toISOString();
      const unchanged =
        include &&
        draft.shopping_list &&
        JSON.stringify([
          draft.shopping_list.schedule,
          draft.shopping_list.items,
        ]) === JSON.stringify([schedule, groceryItems(rows!)]);
      const next: TextDiet = unchanged
        ? draft
        : include
          ? {
              ...base,
              reviewed_at: now,
              shopping_list: {
                schema_version: 1,
                source_key: grocerySourceKey(draft.diets),
                schedule,
                items: groceryItems(rows!),
                reviewed_at: now,
              },
            }
          : {
              ...base,
              reviewed_at: draft.shopping_list ? now : draft.reviewed_at,
            };
      const result = await onPublish(next);
      if (result === false)
        setError(
          "No se pudo publicar. Tu lista sigue aquí; revisa el aviso del taller y vuelve a intentar.",
        );
      else onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos publicar. Conservamos tu lista para reintentar.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      open={
        typeof HTMLDialogElement === "undefined" ||
        !HTMLDialogElement.prototype.showModal
      }
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto max-h-[92dvh] w-[min(760px,calc(100vw-24px))] overflow-auto rounded-3xl border border-[#d4e2d8] bg-white p-5 text-[#173d36] shadow-xl backdrop:bg-[#102d2b]/50 sm:p-7"
    >
      <p className="nuth-eyebrow">Último paso · Publicación</p>
      <h2 id={`${id}-title`} className="mt-2 text-xl font-semibold">
        Publicar {draft.diets.length} dietas revisadas
      </h2>
      <p className="mt-3 text-sm">
        El plan conservará tus indicaciones aprobadas. Después podrás
        compartirlo con el paciente.
      </p>
      <fieldset disabled={busy} className="mt-5 min-w-0 space-y-4">
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#b9d8d1] bg-[#edf5f0] p-4">
          <input
            type="checkbox"
            className="mt-1"
            checked={include}
            onChange={(e) => {
              setInclude(e.target.checked);
              if (e.target.checked && rows === null) calculate(schedule);
              setReviewed(false);
            }}
          />
          <span>
            <strong className="flex items-center gap-2">
              <ShoppingBasket size={19} />
              Incluir carrito del súper
            </strong>
            <span className="mt-1 block text-sm">
              Alimentos y cantidades para los días que elijas. Se incluirá en el
              Super Link y en el PDF.
            </span>
          </span>
        </label>
        {include && (
          <>
            <section className="rounded-2xl border border-[#dce6de] p-4">
              <h3 className="font-semibold">
                1. Elige cuántos días usarás cada dieta
              </h3>
              <p className="mt-2 text-sm text-[#687870]">
                Para una persona. Cada dieta representa un día completo; usa 0
                si no la incluirás en esta compra.
              </p>
              <div className="mt-3 space-y-2">
                {schedule.map((row, i) => (
                  <label
                    key={row.diet_id}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span>{row.title}</span>
                    <span className="flex items-center gap-2">
                      <input
                        aria-label={`Días de ${row.title}`}
                        type="number"
                        min={0}
                        max={31}
                        step={1}
                        className="nuth-input !w-20"
                        value={row.days}
                        onChange={(e) => {
                          const next = schedule.map((v, j) =>
                            j === i
                              ? { ...v, days: Number(e.target.value) }
                              : v,
                          );
                          setSchedule(next);
                          calculate(next);
                        }}
                      />
                      días
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-3 text-sm font-semibold">Total: {days} días</p>
              {!validDays && (
                <p role="alert" className="text-sm">
                  Elige entre 1 y 31 días en total.
                </p>
              )}
              <button
                type="button"
                className="nuth-button-secondary mt-3"
                disabled={!validDays}
                onClick={() => {
                  setRows(compileGroceries(draft.diets, schedule));
                  setReviewed(false);
                }}
              >
                {rows
                  ? "Volver a calcular desde las dietas"
                  : "Preparar lista de compras"}
              </button>
              <p className="mt-2 text-xs text-[#687870]">
                Las cantidades se calculan automáticamente. Cambiar los días o
                recalcular reemplaza los ajustes manuales de la lista.
              </p>
            </section>
            {rows && (
              <section className="rounded-2xl border border-[#dce6de] p-4">
                <h3 className="font-semibold">
                  2. Revisa los alimentos y las cantidades totales
                </h3>
                <p className="mt-2 text-sm text-[#687870]">
                  Las cantidades conservan el estado indicado (crudo o cocido).
                  No se convierten a peso de compra ni a tamaños de envase. Los
                  productos están agrupados para facilitar la compra. Puedes
                  ajustar cantidades y categoría antes de publicar.
                </p>
                <div className="mt-4 space-y-5">
                  {groups.map((group) => (
                    <section key={group.id} aria-label={group.label}>
                      <h4 className="mb-2 flex items-center justify-between text-sm font-semibold">
                        <span>{group.label}</span>
                        <span className="text-xs font-normal">
                          {group.items.length}{" "}
                          {group.items.length === 1 ? "producto" : "productos"}
                        </span>
                      </h4>
                      <div className="space-y-3">
                        {group.items.map(({ index: i, ...row }) => (
                          <div key={i} className="rounded-xl bg-[#f4f7f5] p-3">
                            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_90px_100px_auto]">
                              <label className="col-span-3 text-xs sm:col-span-1">
                                Alimento
                                <input
                                  aria-label={`Alimento ${i + 1}`}
                                  className="nuth-input mt-1"
                                  maxLength={180}
                                  value={row.name}
                                  onChange={(e) =>
                                    changeRow(i, { name: e.target.value })
                                  }
                                />
                              </label>
                              <label className="text-xs">
                                Cantidad total
                                <input
                                  aria-label={`Cantidad ${i + 1}`}
                                  className="nuth-input mt-1"
                                  type="number"
                                  min={0.001}
                                  max={1000000}
                                  step="any"
                                  value={row.quantity ?? ""}
                                  onChange={(e) =>
                                    changeRow(i, {
                                      quantity:
                                        e.target.value === ""
                                          ? null
                                          : Number(e.target.value),
                                    })
                                  }
                                />
                              </label>
                              <label className="text-xs">
                                Unidad
                                <input
                                  aria-label={`Unidad ${i + 1}`}
                                  className="nuth-input mt-1"
                                  value={row.unit}
                                  maxLength={40}
                                  placeholder="g, taza, pieza…"
                                  onChange={(e) =>
                                    changeRow(i, { unit: e.target.value })
                                  }
                                />
                              </label>
                              <button
                                type="button"
                                className="self-end p-3"
                                aria-label={`Quitar alimento ${i + 1}`}
                                onClick={() => {
                                  setRows((old) =>
                                    old!.filter((_, j) => j !== i),
                                  );
                                  setReviewed(false);
                                }}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                            <label className="mt-2 block text-xs">
                              Categoría
                              <select
                                aria-label={`Categoría ${i + 1}`}
                                className="nuth-input mt-1 !w-full sm:!w-64"
                                value={row.category ?? group.id}
                                onChange={(e) =>
                                  changeRow(i, {
                                    category: e.target.value as GroceryCategory,
                                  })
                                }
                              >
                                {groceryCategories.map((category) => (
                                  <option key={category.id} value={category.id}>
                                    {category.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {row.needsReview && (
                              <p className="mt-2 text-xs font-semibold text-[#926431]">
                                Confirma el alimento, su cantidad y unidad con
                                el texto aprobado.
                              </p>
                            )}
                            <details className="mt-2 text-xs">
                              <summary>Ver origen en la dieta</summary>
                              <p className="mt-2 whitespace-pre-wrap break-words">
                                {row.source}
                              </p>
                            </details>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
                <button
                  type="button"
                  className="nuth-button-secondary mt-3"
                  disabled={rows.length >= 400}
                  onClick={() => {
                    setRows((old) => [
                      ...old!,
                      {
                        name: "",
                        quantity: null,
                        unit: "",
                        category: "other",
                        source: "Agregado durante la revisión",
                        needsReview: true,
                      },
                    ]);
                    setReviewed(false);
                  }}
                >
                  <Plus size={16} />
                  Agregar alimento
                </button>
                {!validGroceryRows(rows) && (
                  <p className="mt-3 text-sm" role="alert">
                    Completa nombre, cantidad mayor a cero y unidad de cada
                    alimento.
                  </p>
                )}
                <label className="mt-4 flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={reviewed}
                    disabled={!validGroceryRows(rows)}
                    onChange={(e) => setReviewed(e.target.checked)}
                  />
                  Revisé la lista, sus cantidades y que incluya los ingredientes
                  necesarios para los días seleccionados.
                </label>
              </section>
            )}
          </>
        )}
      </fieldset>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      )}
      <footer className="sticky -bottom-5 mt-5 flex flex-wrap justify-end gap-2 border-t border-[#dce6de] bg-white py-4 sm:-bottom-7">
        <button
          type="button"
          className="nuth-button-secondary"
          disabled={busy}
          onClick={onClose}
        >
          Volver
        </button>
        <button
          type="button"
          className="nuth-button"
          disabled={busy || !ready}
          onClick={() => void publish()}
        >
          {busy ? "Publicando…" : "Confirmar publicación"}
        </button>
      </footer>
    </dialog>
  );
}
