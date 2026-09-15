import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, Eye, FileCheck2, History, LoaderCircle, Sparkles } from "lucide-react";
import { patientPlanViewFromDraft, patientPlanViewFromVersion, prepareSingleDayForReview, validateNutritionPlanForPublication, type PublicationIssue } from "@/src/features/diet-review/model";
import { withPatientSubstitutions } from "@/src/features/diet-review/preparation";
import { PatientPlanPreview as PatientPreview } from "./PatientPlanPreview";
import { listFoodItems } from "@/src/services/foodCatalog";
import type { Consultation, FoodItem, NutritionPlan, NutritionPlanVersion, Patient } from "@/src/types/domain";

type Step = "energy" | "macros" | "equivalents" | "meals" | "menu";

function IssueRow({ issue, onCorrect }: { issue: PublicationIssue; onCorrect: (issue: PublicationIssue) => void }) {
  return <li className="flex flex-col gap-3 rounded-xl border border-[#f0d3ca] bg-[#fff8f5] p-3 sm:flex-row sm:items-center sm:justify-between">
    <p className="flex items-start gap-2 text-sm text-[#7d4035]"><AlertCircle className="mt-0.5 shrink-0" size={16} />{issue.message}</p>
    {issue.step && <button type="button" className="nuth-button-secondary shrink-0 !px-3 !py-2 !text-xs" onClick={() => onCorrect(issue)}>Corregir <ArrowRight size={14} /></button>}
  </li>;
}

export function DietPlanReviewStep({
  plan,
  patient,
  consultation,
  versions,
  publishing,
  onCorrect,
  onPrepareSingleDay,
  onPublish,
}: {
  plan: NutritionPlan;
  patient: Patient | null;
  consultation: Consultation | null;
  versions: NutritionPlanVersion[];
  publishing: boolean;
  onCorrect: (step: Step, day?: string, mealTimeId?: string) => void;
  onPrepareSingleDay: (menu: NonNullable<NutritionPlan["diet_menu"]>) => void;
  onPublish: (foods: FoodItem[]) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [openedVersion, setOpenedVersion] = useState<NutritionPlanVersion | null>(null);
  const [foods, setFoods] = useState<FoodItem[] | null>(null);
  const [catalogError, setCatalogError] = useState("");
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    listFoodItems().then(value => { if (active) { setFoods(value); setCatalogError(""); } })
      .catch(() => { if (active) setCatalogError("No pudimos preparar las sustituciones. Intenta cargar el catálogo nuevamente."); });
    return () => { active = false; };
  }, [catalogAttempt]);
  const validation = useMemo(() => validateNutritionPlanForPublication(plan), [plan]);
  const preview = useMemo(() => patientPlanViewFromDraft({ ...plan, diet_menu: plan.diet_menu && foods ? withPatientSubstitutions(plan.diet_menu, foods) : plan.diet_menu }, patient?.full_name || "Paciente"), [plan, patient?.full_name, foods]);
  const preparedSingleDay = plan.diet_menu && plan.meal_distribution ? prepareSingleDayForReview(plan.diet_menu, plan.meal_distribution) : null;
  const currentVersion = versions.find((version) => version.id === plan.current_version_id) ?? null;

  return <section className="rounded-[28px] border border-[#dce6de] bg-white p-4 text-[#173d36] sm:p-7">
    <header className="flex flex-col gap-4 border-b border-[#e2e9e4] pb-5 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <p className="nuth-eyebrow">Paso 6 · Revisión</p>
        <h1 className="mt-2 text-2xl font-semibold">Listo para revisar</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6c7b74]">Comprueba el calendario que verá el paciente. Esta pantalla no regenera comidas ni modifica cantidades.</p>
      </div>
      <div className={`rounded-xl px-3 py-2 text-xs font-semibold ${validation.canPublish ? "bg-[#e9f4ec] text-[#2d624d]" : "bg-[#fff3e8] text-[#8a5a22]"}`}>
        {validation.canPublish ? <span className="flex items-center gap-2"><CheckCircle2 size={15} /> Revisión lista</span> : <span className="flex items-center gap-2"><AlertCircle size={15} /> {validation.errors.length} pendientes</span>}
      </div>
    </header>

    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-xl bg-[#f5f8f5] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[#819087]">Plan</p><p className="mt-1 truncate text-sm font-semibold">{plan.title}</p></div>
      <div className="rounded-xl bg-[#f5f8f5] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[#819087]">Paciente</p><p className="mt-1 truncate text-sm font-semibold">{patient?.full_name || "Sin asignar"}</p></div>
      <div className="rounded-xl bg-[#f5f8f5] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[#819087]">Consulta</p><p className="mt-1 truncate text-sm font-semibold">{consultation ? new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date(consultation.consultation_date)) : "Sin consulta"}</p></div>
      <div className="rounded-xl bg-[#f5f8f5] p-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[#819087]">Versión vigente</p><p className="mt-1 text-sm font-semibold">{currentVersion ? `v${currentVersion.version_number}` : "Aún no publicada"}</p></div>
    </div>

    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
      <div className="space-y-5">
        <section aria-labelledby="review-pending-title"><div className="flex items-center justify-between"><div><p className="nuth-eyebrow">1 · Pendientes por resolver</p><h2 id="review-pending-title" className="mt-1 text-lg font-semibold">Antes de publicar</h2></div></div>
          {validation.errors.length ? <ul className="mt-3 space-y-2">{validation.errors.map((issue, index) => <IssueRow key={`${issue.code}-${index}`} issue={issue} onCorrect={(target) => target.step && onCorrect(target.step, target.day, target.mealTimeId)} />)}</ul> : <div className="mt-3 rounded-xl bg-[#edf7f0] p-4 text-sm text-[#326149]"><CheckCircle2 className="mr-2 inline" size={16} />El calendario aplicado y la prescripción están listos para revisión final.</div>}
          {validation.warnings.length > 0 && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">Opciones con diferencias de porciones</p><p className="mt-1 text-xs">Puedes publicar con las cantidades confirmadas.</p><ul className="mt-2 space-y-2 text-xs">{validation.warnings.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}</ul></div>}
          {!plan.diet_menu?.week_plan && preparedSingleDay ? <button type="button" className="nuth-button mt-3 !text-sm" onClick={() => onPrepareSingleDay(preparedSingleDay)}><Sparkles size={16} />Preparar día único para revisión</button> : null}
        </section>
        <section><p className="nuth-eyebrow">2 · Calendario y menú</p><h2 className="mt-1 text-lg font-semibold">Comidas aplicadas</h2>
          {preview.days.length ? <div className="mt-3 space-y-2">{preview.days.map((day) => <details key={day.name} className="rounded-xl border border-[#dfe7e1]" open={preview.days.length === 1}><summary className="cursor-pointer px-4 py-3 font-semibold">{day.name}<span className="ml-2 text-xs font-normal text-[#708078]">{day.meals.length} tiempos</span></summary><div className="border-t border-[#e8ede9] p-4">{day.meals.map((meal) => <div className="mb-3 last:mb-0" key={`${day.name}-${meal.name}`}><p className="text-sm font-semibold text-[#315d4d]">{meal.name}</p><p className="mt-1 text-sm text-[#63746c]">{meal.entries.map((entry) => entry.name_snapshot).join(" · ") || "Sin elementos"}</p></div>)}</div></details>)}</div> : <p className="mt-3 rounded-xl bg-[#f8faf8] p-4 text-sm text-[#708078]">Todavía no hay un calendario aplicado.</p>}
        </section>
        <section className="rounded-xl border border-[#e1e8e3] p-4"><p className="nuth-eyebrow">3 · Prescripción</p><div className="mt-2 grid gap-3 sm:grid-cols-3"><p className="text-sm"><span className="block text-xs text-[#7a8881]">Energía</span><strong>{plan.target_calories ?? "—"}{plan.target_calories ? " kcal" : ""}</strong></p><p className="text-sm"><span className="block text-xs text-[#7a8881]">Equivalentes</span><strong>{plan.exchange_prescription?.status === "ready" ? "Confirmados" : "Pendientes"}</strong></p><p className="text-sm"><span className="block text-xs text-[#7a8881]">Tiempos</span><strong>{plan.meal_distribution?.meal_times.length ?? 0}</strong></p></div></section>
      </div>
      <div className="space-y-5">
        {catalogError ? <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{catalogError}<button type="button" className="ml-2 underline" onClick={() => setCatalogAttempt(value => value + 1)}>Reintentar</button></p> : !foods ? <p className="text-sm text-[#60736a]">Preparando sustituciones…</p> : <p className="text-xs leading-5 text-[#60736a]">Revisa las sustituciones antes de publicar. Conservan el subgrupo y los equivalentes del catálogo; no se agregan a la comida.</p>}
        <PatientPreview value={preview} />
        <section className="rounded-2xl border border-[#dfe7e1] p-4"><p className="nuth-eyebrow">5 · Publicación e historial</p><h2 className="mt-1 text-lg font-semibold">Conservar versión</h2><p className="mt-2 text-sm leading-6 text-[#6b7a73]">Publicar crea una versión clínica inmutable. El borrador seguirá disponible para futuras ediciones.</p>
          <button type="button" disabled={!validation.canPublish || publishing || !foods} className="nuth-button mt-4 w-full justify-center" onClick={() => setConfirming(true)}>{publishing ? <LoaderCircle className="animate-spin" size={16} /> : <FileCheck2 size={16} />}Publicar versión</button>
          {validation.info.map((issue) => <p key={issue.code} className="mt-3 text-xs leading-5 text-[#60736a]">{issue.message}</p>)}
          <div className="mt-5 border-t border-[#e6ece7] pt-4"><p className="flex items-center gap-2 text-sm font-semibold"><History size={16} />Historial</p>{versions.length ? <ul className="mt-3 space-y-2">{versions.map((version) => <li key={version.id} className="flex items-center justify-between gap-2 rounded-xl bg-[#f6f8f6] p-3 text-sm"><span><strong>v{version.version_number}</strong>{version.id === plan.current_version_id ? <span className="ml-2 text-xs font-semibold text-[#397258]">Vigente</span> : null}<span className="mt-0.5 block text-xs text-[#74827b]">{new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" }).format(new Date(version.published_at))}</span></span><button type="button" className="nuth-button-secondary !px-3 !py-2 !text-xs" onClick={() => setOpenedVersion(version)}><Eye size={14} />Ver</button></li>)}</ul> : <p className="mt-3 text-sm text-[#708078]">Aún no hay versiones publicadas.</p>}</div>
        </section>
      </div>
    </div>
    {confirming && <div role="dialog" aria-modal="true" aria-label="Confirmar publicación" className="fixed inset-0 z-50 grid place-items-center bg-[#18382d]/35 p-4"><div className="w-full max-w-md rounded-[24px] bg-white p-6 shadow-xl"><p className="nuth-eyebrow">Confirmar publicación</p><h2 className="mt-2 text-xl font-semibold">¿Publicar esta versión?</h2><p className="mt-3 text-sm leading-6 text-[#687871]">Se conservará para {patient?.full_name || "el paciente"} con {preview.days.length} {preview.days.length === 1 ? "día" : "días"}, incluyendo las sustituciones revisadas. No se enviará ni compartirá todavía.</p><div className="mt-5 flex justify-end gap-2"><button type="button" className="nuth-button-secondary" onClick={() => setConfirming(false)}>Cancelar</button><button type="button" className="nuth-button" onClick={() => { setConfirming(false); if (foods) onPublish(foods); }}>Publicar versión</button></div></div></div>}
    {openedVersion && <div role="dialog" aria-modal="true" aria-label={`Versión ${openedVersion.version_number}`} className="fixed inset-0 z-50 overflow-y-auto bg-[#18382d]/35 p-4"><div className="mx-auto my-6 w-full max-w-3xl rounded-[24px] bg-white p-5 shadow-xl sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="nuth-eyebrow">Versión histórica</p><h2 className="mt-1 text-xl font-semibold">v{openedVersion.version_number}</h2></div><button type="button" className="nuth-button-secondary !px-3 !py-2 !text-xs" onClick={() => setOpenedVersion(null)}>Cerrar</button></div><div className="mt-5"><PatientPreview historical value={patientPlanViewFromVersion(openedVersion.snapshot)} /></div></div></div>}
  </section>;
}
