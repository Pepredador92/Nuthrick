import type { PatientPlanView } from "@/src/features/diet-review/model";
import { canSubstitute, type PatientPreparation } from "@/src/features/diet-review/preparation";
import { foodUnitLabels, formatFoodQuantity } from "@/src/features/menu/units";

function Substitutions({ preparation }: { preparation: PatientPreparation }) {
  const important = preparation.ingredients.filter(item => canSubstitute(item.food));
  const available = important.filter(item => item.alternatives.length > 0);
  const incomplete = preparation.substitutionsReviewed ? important.filter(item => item.alternatives.length < 2) : [];
  if (!available.length && !incomplete.length) return null;
  return <div aria-label="Sustituciones" className="mt-3 border-t border-[#e6ece7] pt-2 text-xs leading-5 text-[#526b5e]">
    {available.length > 0 && <>
      <p><strong className="font-semibold">Puedes sustituir</strong> · Elige una alternativa en lugar del alimento original.</p>
      {available.map(item => <p key={item.key} className="mt-1 break-words">
        <strong className="font-semibold">{item.name}:</strong>{" "}
        {item.alternatives.map((alternative, index) => <span key={alternative.food.id}>
          {index > 0 ? " o " : ""}{formatFoodQuantity(alternative.amount)} {foodUnitLabels[alternative.unit]} de {alternative.food.name}
        </span>)}.
      </p>)}
    </>}
    {incomplete.length > 0 && <p className="mt-1 text-[#876b3d]">Sin dos alternativas validadas para: {incomplete.map(item => item.name).join(", ")}. Mantén estos alimentos salvo indicación de tu nutriólogo.</p>}
  </div>;
}

export function PatientPlanPreview({ value, historical = false }: { value: PatientPlanView; historical?: boolean }) {
  const legacy = historical && value.days.some(day => day.meals.some(meal => !meal.preparation.substitutionsReviewed && meal.preparation.ingredients.some(item => canSubstitute(item.food))));
  return <section className="min-w-0 rounded-2xl border border-[#d8e4dc] bg-white p-4 sm:p-5" aria-label="Vista para paciente">
    <p className="nuth-eyebrow">Vista para paciente</p>
    <h3 className="mt-1 break-words text-lg font-semibold text-[#173d36]">{value.title}</h3>
    <p className="mt-1 text-sm text-[#6d7d75]">{value.patientName} · {value.days.length} {value.days.length === 1 ? "día" : "días"}</p>
    {legacy && <p className="mt-3 text-xs leading-5 text-[#7b694b]">Esta versión se publicó sin sustituciones. Para incluirlas, revisa y publica una nueva versión desde el borrador.</p>}
    <div className="mt-4 space-y-5">{value.days.map(day => <section key={day.name} aria-label={day.name} className="min-w-0 border-t border-[#e6ece7] pt-3">
      <h4 className="text-sm font-semibold text-[#244b3e]">{day.name}</h4>
      <div className="mt-3 space-y-5">{day.meals.map((meal, index) => <article key={`${day.name}-${index}`} className="min-w-0 break-words border-l-2 border-[#9eb8a9] pl-3">
        <p className="text-xs font-semibold text-[#52705c]">{meal.name}{meal.time && <span className="ml-2 font-normal">{meal.time}</span>}</p>
        <h5 className="mt-1.5 text-sm font-medium text-[#25463a]">{meal.preparation.title}</h5>
        <ul aria-label={`Ingredientes de ${meal.name}`} className="mt-1.5 list-disc space-y-0.5 pl-4 text-[13px] leading-5 text-[#53665d]">
          {meal.preparation.ingredients.map(item => <li key={item.key}>
            {formatFoodQuantity(item.amount)} {foodUnitLabels[item.unit]} · {item.name}
          </li>)}
        </ul>
        {meal.preparation.instructions.length > 0 && <div aria-label="Preparación" className="mt-3 space-y-1 text-[13px] leading-5 text-[#607268]">
          {meal.preparation.instructions.map((instruction, i) => <p key={i} className="whitespace-pre-line">{instruction.text}</p>)}
        </div>}
        <Substitutions preparation={meal.preparation} />
      </article>)}</div>
    </section>)}</div>
  </section>;
}
