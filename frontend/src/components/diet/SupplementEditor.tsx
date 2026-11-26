import { useState } from "react";
import { Leaf, Pencil, Plus } from "lucide-react";
import {
  splitSupplementTargets, supplementQuantityLabel, type SupplementItem, type SupplementNutrition,
} from "../../../../supabase/functions/_shared/supplements";
import { SupplementPlanDialog } from "./SupplementPlanDialog";

const format = (value: number) => value.toLocaleString("es-MX", { maximumFractionDigits: 2 });

export function SupplementEditor({ items, tags = [], daily, onChange, appearance = "default", showSummary = true }: {
  items: SupplementItem[];
  tags?: string[];
  daily: SupplementNutrition;
  onChange: (items: SupplementItem[], tags: string[]) => void;
  appearance?: "default" | "night";
  showSummary?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const split = splitSupplementTargets(daily, items);
  return <section className={`supplement-editor ${appearance === "night" ? "macros-supplements" : ""} mt-5 rounded-2xl border border-[#b9d8c6] bg-[#edf6ee] p-4 sm:p-5`} aria-label="Suplementación del día">
    <div className="supplement-heading flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="flex items-center gap-2 font-semibold text-[#245641]"><Leaf size={19}/> Suplementación</h2>
        <p className="mt-1 text-xs leading-5 text-[#547064]">El aporte diario de los suplementos se descuenta de la meta destinada a alimentos.</p>
      </div>
      <button type="button" className="nuth-button-secondary" onClick={() => setOpen(true)}><Plus size={16}/> Agregar suplemento</button>
    </div>
    {!!tags.length && <ul className="mt-3 flex flex-wrap gap-2" aria-label="Etiquetas de suplementación">
      {tags.map(tag => <li key={tag} className="rounded-lg border border-[var(--nuth-line)] px-2 py-1 text-xs">{tag}</li>)}
    </ul>}
    {items.length > 0 && <div className="mt-4 space-y-2">
      {items.map(item => <article key={item.id} className="supplement-item rounded-xl border border-[#d1e4d7] bg-white px-3 py-2.5">
        <h3 className="text-sm font-semibold text-[#245641] [overflow-wrap:anywhere]">{item.product.name}</h3>
        <p className="text-xs text-[#547064] [overflow-wrap:anywhere]">{[item.product.brand, item.product.presentation, supplementQuantityLabel(item)].filter(Boolean).join(" · ")}</p>
      </article>)}
      <button type="button" className="nuth-button-secondary" onClick={() => setOpen(true)}><Pencil size={15}/> Editar suplementos</button>
    </div>}
    {showSummary && items.length > 0 && <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[380px] text-right text-xs">
        <caption className="mb-2 text-left font-semibold text-[#245641]">Distribución de la meta diaria</caption>
        <thead><tr><th className="p-2 text-left">Aporte</th><th>kcal</th><th>Carbohidratos</th><th>Proteína</th><th>Grasas</th></tr></thead>
        <tbody>{([["Meta diaria", split.daily], ["Suplementos", split.supplements], ["Para alimentos", split.food]] as const).map(([label, value]) =>
          <tr key={label} className="border-t border-[#d1e4d7]"><th className="p-2 text-left">{label}</th>
            <td>{format(value.energy_kcal)}</td><td>{format(value.carbohydrate_g)} g</td><td>{format(value.protein_g)} g</td><td>{format(value.fat_g)} g</td>
          </tr>)}</tbody>
      </table>
    </div>}
    {Object.values(split.excess).some(value => value > 0) && <p role="status" className="supplement-warning mt-3 rounded-lg bg-[#fff3d8] p-3 text-xs text-[#755525]">
      Los suplementos superan alguna meta diaria. Revisa la cantidad o ajusta tu meta.
    </p>}
    {items.some(item => item.product.nutrition_status === "unverified") && <p className="supplement-warning mt-3 rounded-lg bg-[#fff3d8] p-3 text-xs text-[#755525]">
      Aporte por verificar en algunos suplementos. Solo se descontaron los valores capturados.
    </p>}
    {open && <SupplementPlanDialog items={items} initialTags={tags} appearance={appearance} onClose={() => setOpen(false)} onSave={(next, nextTags) => {
      onChange(next, nextTags);
      setOpen(false);
    }}/>}
  </section>;
}
