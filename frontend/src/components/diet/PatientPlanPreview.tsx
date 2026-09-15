import { ChevronDown, Repeat2, Utensils } from "lucide-react";
import type { PatientPlanView } from "@/src/features/diet-review/model";
import { canSubstitute, type PatientIngredient } from "@/src/features/diet-review/preparation";
import { foodUnitLabels, formatFoodQuantity } from "@/src/features/menu/units";

function Ingredient({ item, reviewed }: { item: PatientIngredient; reviewed: boolean }) {
  return <li className="min-w-0 py-2.5">
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="min-w-0 break-words font-medium text-[#294b3f]">{item.name}</span>
      <span className="shrink-0 text-right tabular-nums text-[#53665d]">{formatFoodQuantity(item.amount)} {foodUnitLabels[item.unit]}</span>
    </div>
    {item.alternatives.length > 0 && <details className="mt-1.5 rounded-lg bg-[#f2f7f3] px-3 py-2 text-xs text-[#476555]">
      <summary className="cursor-pointer"><Repeat2 size={12} className="mr-1 inline" />Puedes sustituir por</summary>
      <p className="mt-2 text-[#65796c]">Elige una alternativa, en lugar del alimento original:</p>
      <ul className="mt-2 space-y-2">{item.alternatives.map(alternative => <li key={alternative.food.id} className="flex justify-between gap-3">
        <span className="min-w-0 break-words">{alternative.food.name}</span>
        <span className="shrink-0 font-semibold tabular-nums">{formatFoodQuantity(alternative.amount)} {foodUnitLabels[alternative.unit]}</span>
      </li>)}</ul>
    </details>}
    {reviewed && canSubstitute(item.food) && item.alternatives.length < 2 && <p className="mt-1 text-xs text-[#876b3d]">{item.alternatives.length === 0 ? "Sin alternativas compatibles disponibles." : "Solo hay una alternativa compatible disponible."} Consulta con tu nutriólogo antes de cambiarlo.</p>}
  </li>;
}

export function PatientPlanPreview({ value, historical = false }: { value: PatientPlanView; historical?: boolean }) {
  const legacy = historical && value.days.some(day => day.meals.some(meal => !meal.preparation.substitutionsReviewed && meal.preparation.ingredients.some(item => canSubstitute(item.food))));
  return <section className="min-w-0 rounded-2xl border border-[#d8e4dc] bg-[#fcfdfb] p-4 sm:p-5" aria-label="Vista para paciente">
    <p className="nuth-eyebrow">Vista para paciente</p>
    <h3 className="mt-1 break-words text-lg font-semibold text-[#173d36]">{value.title}</h3>
    <p className="mt-1 text-sm text-[#6d7d75]">{value.patientName} · {value.days.length} {value.days.length === 1 ? "día" : "días"}</p>
    {legacy && <p className="mt-3 rounded-lg bg-[#f5f1e9] p-3 text-xs leading-5 text-[#7b694b]">Esta versión se publicó sin sustituciones. Para incluirlas, revisa y publica una nueva versión desde el borrador.</p>}
    <div className="mt-4 space-y-3">{value.days.map(day => <details key={day.name} className="min-w-0 rounded-xl border border-[#e1e8e3] bg-white p-3" open={value.days.length === 1}>
      <summary className="cursor-pointer list-none font-semibold text-[#244b3e]">{day.name}<ChevronDown className="float-right mt-0.5" size={17} /></summary>
      <div className="mt-3 space-y-4">{day.meals.map((meal, index) => <article key={`${day.name}-${index}`} className="min-w-0 overflow-hidden rounded-xl border border-[#dce7df]">
        <header className="bg-[#edf4ef] px-3 py-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-[#52705c]"><Utensils size={13} />{meal.name}{meal.time && <span className="ml-auto font-normal">{meal.time}</span>}</p>
          <h4 className="mt-1 break-words text-sm font-semibold text-[#25463a]">{meal.preparation.title}</h4>
        </header>
        <div className="px-3 pb-3">
          {(["ingredient", "fruit", "drink"] as const).map(role => {
            const items = meal.preparation.ingredients.filter(item => item.role === role);
            if (!items.length) return null;
            return <section key={role} className="mt-3">
              <h5 className="text-[10px] font-bold uppercase tracking-wide text-[#7b8b80]">{role === "ingredient" ? "Ingredientes y cantidades" : role === "fruit" ? "Fruta · acompañamiento" : "Bebida"}</h5>
              <ul className="divide-y divide-[#edf1ed]">{items.map(item => <Ingredient key={item.key} item={item} reviewed={meal.preparation.substitutionsReviewed} />)}</ul>
            </section>;
          })}
          {meal.preparation.instructions.length > 0 && <details className="mt-3 border-t border-[#e6ece7] pt-3 text-xs text-[#607268]">
            <summary className="cursor-pointer font-semibold">Preparación e indicaciones</summary>
            {meal.preparation.instructions.map((instruction, i) => <div key={i} className="mt-2 whitespace-pre-line break-words leading-5">{meal.preparation.instructions.length > 1 && <p className="font-semibold">{instruction.title}</p>}<p>{instruction.text}</p></div>)}
          </details>}
        </div>
      </article>)}</div>
    </details>)}</div>
  </section>;
}
