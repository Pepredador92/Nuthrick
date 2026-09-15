import { useEffect, useMemo, useRef, useState } from "react";
import { Apple, BookOpen, ChefHat, Check, ChevronDown, GlassWater, Heart, LayoutList, LockKeyhole, Plus, ShoppingBasket, Sparkles, Trash2, Utensils, X } from "lucide-react";
import { getExchangeGroup } from "@/src/features/exchanges/catalog";
import { activeMenu, addFoodToMenu, addRecipeToMenu, calculateMenuStatus, confirmDietMenu, createDietMenu, expandMenuEntriesToRecipeItems, MENU_COMPARISON_TOLERANCE, sameMealDistribution, reconcileDietMenu, replaceFoodMenuEntry, replaceMenuEntriesWithRecipe, replaceRecipeMenuEntry, removeMenuEntry, updateMenuEntryQuantity } from "@/src/features/menu/model";
import { isFoodRestricted, menuAlternatives, type MenuPlanningMode, type MenuProposal } from "@/src/features/menu/planner";
import { dayObservations, entryRole, exchangeNutrition, isDrink, isVerifiedWater, menuDifferences, menuRestrictions, MESA_COPY, withPreservedContent, recipeFromEntry, recipeHasKnownContributions, ROLE_LABELS, starterDrinks } from "@/src/features/menu/mesa";
import { createCustomFood, createCustomRecipe, type CustomFoodInput, type CustomRecipeInput, type RecipeDraftItem, listFoodItems, listRecipes } from "@/src/services/foodCatalog";
import type { DietMenu, DietMenuEntry, ExchangeGroupCode, FoodItem, NutritionPlan, Recipe } from "@/src/types/domain";
import { AutosaveFeedback } from "./AutosaveFeedback";
import { WorkshopStepFooter } from "./WorkshopStepFooter";
import { useChangeAutosave } from "./useChangeAutosave";
import { ProposalNavigation, useProposalExplorer, useProposalSetting } from "./useProposalExplorer";
import { BrowserPanel, CustomFoodForm, FoodExchangeSelector, MealNeeds, RecipeAdjustPanel, RecipeForm } from "./MenuEditors";

type Props = { plan: NutritionPlan; onSave: (menu: DietMenu) => Promise<void>; onDraftChange?: (menu: DietMenu) => void; onGoToMeals: () => void; catalog?: { foods: FoodItem[]; recipes: Recipe[] }; recipeWriter?: (input: CustomRecipeInput) => Promise<Recipe> };
const format = (n: number) => Number(n.toFixed(6)).toLocaleString("es-MX", { maximumFractionDigits: 6 });
const units = { g: "g", ml: "ml", piece: "pieza", cup: "taza", tablespoon: "cucharada", teaspoon: "cucharadita", slice: "rebanada", tortilla: "tortilla", glass: "vaso", serving: "porción", unit: "unidad", recipe_serving: "porción" };
type Panel = "food" | "recipe" | "drink" | "adjust" | "new_food" | "new_recipe" | "selection" | "preferences" | null;

function EditorDialog({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal?.(); return () => dialog?.close?.(); }, []);
  return <dialog ref={ref} aria-label={title} onCancel={onClose} className="m-auto max-h-[90dvh] w-[min(820px,calc(100vw-24px))] overflow-auto rounded-3xl border border-[#d4e2d8] bg-white p-4 text-[#173d36] shadow-xl backdrop:bg-[#173d36]/35 sm:p-6" open={typeof HTMLDialogElement === "undefined" || !HTMLDialogElement.prototype.showModal}>
    <div className="mb-4 flex items-center justify-between gap-4"><h2 className="font-semibold">{title}</h2><button type="button" aria-label="Cerrar panel" className="rounded-lg p-2 hover:bg-[#edf4ee]" onClick={onClose}><X size={20}/></button></div>{children}
  </dialog>;
}

export function DietMenuStep(props: Props) {
  return <MenuWorkspace key={props.plan.id} {...props}/>;
}

function MenuWorkspace({ plan, onSave, onDraftChange, onGoToMeals, catalog, recipeWriter = createCustomRecipe }: Props) {
  const distribution = plan.meal_distribution;
  const initial = useMemo(() => distribution ? reconcileDietMenu(plan.diet_menu ?? createDietMenu(distribution), distribution) : null, [distribution, plan.diet_menu]);
  const [draft, setDraft] = useState(initial);
  const [activeMealId, setActiveMealId] = useState(distribution?.meal_times[0]?.id ?? "");
  const [foods, setFoods] = useState(catalog?.foods ?? []);
  const [recipes, setRecipes] = useState(catalog?.recipes ?? []);
  const [loading, setLoading] = useState(!catalog);
  const [classic, setClassic] = useProposalSetting("mesa:view", false);
  const [fixedEntries, setFixedEntries] = useProposalSetting<string[]>(`mesa:${plan.id}:entries`, []);
  const [fixedMeals, setFixedMeals] = useProposalSetting<string[]>(`mesa:${plan.id}:meals`, []);
  const [lockedSeed, setLockedSeed] = useProposalSetting<DietMenu|null>(`mesa:${plan.id}:lockedSeed`,null);
  const [panel, setPanel] = useState<Panel>(null);
  const [groupFilter, setGroupFilter] = useState<ExchangeGroupCode | "all">("all");
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [editingEntry, setEditingEntry] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [recipeSeed, setRecipeSeed] = useState<RecipeDraftItem[]>([]);
  const [kind, setKind] = useState<"recipe" | "drink">("recipe");
  const [savedRecipe, setSavedRecipe] = useState<{ recipe: Recipe; entries: string[]; meal: string; preview: boolean } | null>(null);
  const [libraryNotice, setLibraryNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reviewDay, setReviewDay] = useState(false);
  const [preferenceSearch, setPreferenceSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [needsOpen, setNeedsOpen] = useState(false);
  useEffect(()=>{const media=window.matchMedia?.("(min-width:1280px)");if(!media)return;const sync=()=>setNeedsOpen(media.matches);sync();media.addEventListener("change",sync);return()=>media.removeEventListener("change",sync);},[]);
  const allRecipes = useMemo(() => [...recipes, ...starterDrinks(foods)], [recipes, foods]);
  // Additive library saves are independent of the open preview. Source/constraint changes invalidate it.
  const context = JSON.stringify([distribution, draft?.food_preferences, loading]);
  const explorer = useProposalExplorer<MenuProposal, DietMenu>(`mesa:${plan.id}:history`, context, p=>JSON.stringify(activeMenu(p.menu).meal_menus.map(m=>[m.meal_time_id,m.entries.map(e=>[e.source_id,e.quantity,e.recipe_snapshot?.items])])));
  const proposal = explorer.proposal;
  const working = proposal?.menu ?? draft;
  const autosave = useChangeAutosave({ initialValue: initial, onSave: async value => { if(value) await onSave(value); }, onDraftChange: value => { if(value) onDraftChange?.(value); } });
  useEffect(() => {
    if(catalog) return;
    let live = true;
    void Promise.all([listFoodItems(),listRecipes()]).then(([f,r])=>{ if(live) {setFoods(f);setRecipes(r);} }).catch(()=>{if(live)setError("No pudimos cargar la despensa. Recarga para volver a intentar; tu menú permanece intacto.");}).finally(()=>{if(live)setLoading(false);});
    return () => {live=false;};
  },[catalog]);
  if (!distribution || !distribution.distribution.some(r=>r.portions>0) || !working || !draft) return <section className="rounded-3xl bg-white p-6"><h1 className="text-2xl font-semibold">{MESA_COPY.name}</h1><p className="my-4">Distribuye primero los equivalentes entre tiempos de comida.</p><button className="nuth-button" onClick={onGoToMeals}>Ir a Tiempos de comida</button></section>;
  const meal = distribution.meal_times.find(m=>m.id===activeMealId) ?? distribution.meal_times[0];
  const variant = activeMenu(working);
  const entries = variant.meal_menus.find(m=>m.meal_time_id===meal.id)?.entries ?? [];
  const status = calculateMenuStatus(working,distribution);
  const rows = status.rows.filter(r=>r.meal_time_id===meal.id);
  const remaining = rows.filter(r=>r.remaining>0).map(r=>({group_code:r.group_code,portions:r.remaining}));
  const sourceNeedsReview = distribution.status !== "ready" || Boolean(draft.source_meal_distribution_snapshot && !sameMealDistribution(draft.source_meal_distribution_snapshot, distribution));
  const restrictions = menuRestrictions(draft);
  const allowedFoods = foods.filter(f=>!isFoodRestricted(f,restrictions));
  const usedFoodIds = variant.meal_menus.flatMap(m=>m.entries.flatMap(e=>e.food_snapshot?[e.source_id]:e.recipe_snapshot?.items.map(i=>i.food_snapshot.id)??[]));
  const diffs = menuDifferences(working,distribution,meal.id);
  const dayDiffs = menuDifferences(working,distribution);
  const observations = dayObservations({...working,food_preferences:draft.food_preferences});
  const preserve = (id:string, wholeMeal=false) => {
    setLockedSeed(working);
    if(wholeMeal)setFixedMeals(toggle(fixedMeals,id));else setFixedEntries(toggle(fixedEntries,id));
    if(proposal)explorer.restart(proposal);else explorer.invalidate();
  };
  const toggle = (values: string[], id: string) => values.includes(id)?values.filter(v=>v!==id):[...values,id];
  const saveDraft = (next: DietMenu, immediate = true) => {setDraft(next);autosave.change(next,{immediate});};
  const change = (next: DietMenu, immediate = true) => {
    setError("");
    if(fixedEntries.length||fixedMeals.length)setLockedSeed(next);
    if(proposal) explorer.edit({...proposal,menu:next});
    else { explorer.invalidate(); saveDraft(next,immediate); }
  };
  const closePanel = () => {setPanel(null);setEditingEntry(null);};
  const openPantry = (mode: "food"|"recipe"|"drink", group: ExchangeGroupCode|"all" = "all") => {setGroupFilter(group);setPanel(mode);};
  const safeRecipe = (recipe: Recipe) => recipeHasKnownContributions(recipe) && !recipe.items.some(i=>isFoodRestricted(i.food_snapshot,restrictions));
  const addFood = (food: FoodItem, quantity: number) => {if(isFoodRestricted(food,restrictions))return;change(addFoodToMenu(working,distribution,meal.id,food,quantity));setPanel(null);};
  const incorporateRecipe = (recipe: Recipe) => {
    if(!safeRecipe(recipe)) {setError("Revisa los ingredientes y las restricciones de esta preparación.");return;}
    change(editingEntry?replaceRecipeMenuEntry(working,distribution,editingEntry,recipe):addRecipeToMenu(working,distribution,meal.id,recipe));
    closePanel();
  };
  const exchangeFood = (entry: DietMenuEntry, replacement: FoodItem) => {
    if(isFoodRestricted(replacement,restrictions))return;
    const next = replaceFoodMenuEntry(working,distribution,entry.id,replacement);
    const after = activeMenu(next).meal_menus.flatMap(m=>m.entries).find(e=>e.id===entry.id);
    const delta=(after?.exchange_contributions.reduce((n,c)=>n+c.portions,0)??0)-entry.exchange_contributions.reduce((n,c)=>n+c.portions,0);
    change(next);setNotice(delta===0?"Intercambio con el mismo aporte en equivalentes.":`Cantidad práctica recalculada: diferencia ${delta>0?"+":""}${format(delta)} eq. Revisa Por completar.`);
  };
  const buildProposal = (mealId: string|null, mode: MenuPlanningMode = "complete") => {
    setPanel(null);
    explorer.generate(()=>{
      const base=withPreservedContent(draft,lockedSeed,fixedEntries,fixedMeals);
      const conflicts=activeMenu(base).meal_menus.flatMap(m=>m.entries.filter(e=>fixedMeals.includes(m.meal_time_id)||fixedEntries.includes(e.id))).filter(e=>(e.food_snapshot?[e.food_snapshot]:e.recipe_snapshot?.items.map(i=>i.food_snapshot)??[]).some(f=>isFoodRestricted(f,restrictions)));
      if(conflicts.length)throw new Error(`Libera o cambia los elementos conservados que contienen alimentos excluidos: ${conflicts.map(e=>e.name_snapshot).join(", ")}.`);
      return menuAlternatives({menu:base,distribution,foods:allowedFoods,recipes:allRecipes,restrictions,mealTimeId:mealId,mode,fixedEntryIds:fixedEntries,fixedMealIds:fixedMeals});
    });
  };
  const createRecipe = async (name: string, items: RecipeDraftItem[], description: string, instructions: string, substitutions: string, servings: number) => {
    if(items.some(i=>isFoodRestricted(i.food,restrictions))) {setError("La selección incluye alimentos excluidos. Revísala antes de guardar.");return;}
    setBusy(true);setError("");
    try {
      const recipe = await recipeWriter({name,items,description,instructions,substitution_notes:substitutions,servings,kind,meal_types:[meal.meal_type]});
      setRecipes(current=>[recipe,...current]);setLibraryNotice(`“${recipe.name}” se guardó en tu biblioteca. Descartar el menú no elimina esta preparación.`);
      setSavedRecipe({recipe,entries:selectedIds,meal:meal.id,preview:Boolean(proposal)});setPanel(null);
    } catch(cause) {setError(cause instanceof Error?cause.message:"No pudimos guardar la preparación.");} finally {setBusy(false);}
  };
  const saveCopy = async (name:string, recipe:Recipe) => {
    setBusy(true);
    try {
      const copy=await recipeWriter({name,items:expandMenuEntriesToRecipeItems([activeMenu(addRecipeToMenu(createDietMenu(distribution),distribution,meal.id,recipe,recipe.servings)).meal_menus.find(m=>m.meal_time_id===meal.id)!.entries[0]],foods),servings:recipe.servings,kind:isDrink(recipe)?"drink":"recipe",instructions:recipe.instructions??"",substitution_notes:recipe.substitution_notes??"",meal_types:recipe.meal_types});
      setRecipes(current=>[copy,...current]);setLibraryNotice(`“${copy.name}” se guardó en tu biblioteca.`);incorporateRecipe(copy);
    } catch(cause) {setError(cause instanceof Error?cause.message:"No pudimos guardar la copia.");} finally {setBusy(false);}
  };
  const saveFood = async(input:CustomFoodInput) => {setBusy(true);try {const food=await createCustomFood(input);setFoods(current=>[food,...current]);addFood(food,input.portion_amount);}catch(cause){setError(cause instanceof Error?cause.message:"No pudimos guardar.");}finally{setBusy(false);}};
  const apply = () => {explorer.apply(draft,next=>saveDraft(reconcileDietMenu(next.menu,distribution)));setPanel(null);setNotice("Propuesta aplicada al borrador. La revisión profesional sigue pendiente.");};
  const beginRecipe = (drink = false) => {setKind(drink?"drink":"recipe");setSelectedIds([]);setRecipeSeed([]);setPanel("selection");};
  const pantry = <BrowserPanel key={`${panel}-${groupFilter}`} mode={panel==="drink"?"drink":panel==="recipe"?"recipe":"food"} foods={foods} recipes={allRecipes} required={remaining} groupCode={groupFilter} mealType={meal.meal_type} restrictions={restrictions} usedFoodIds={usedFoodIds} busy={busy} onClose={closePanel} onFood={addFood} onRecipe={recipe=>{setSelectedRecipe(recipe);setEditingEntry(null);setPanel("adjust");}} onNewFood={()=>setPanel("new_food")} onNewRecipe={()=>{setKind(panel==="drink"?"drink":"recipe");setSelectedIds([]);setRecipeSeed([]);setPanel("new_recipe");}}/>;
  const isPantry = panel==="food"||panel==="recipe"||panel==="drink";
  const roleIcon = (role: string) => role==="drink"?<GlassWater size={18}/>:role==="fruit"?<Apple size={18}/>:role==="main"?<ChefHat size={18}/>:<Utensils size={18}/>;
  const entryCard = (entry: DietMenuEntry) => {
    const role=entryRole(entry);
    const nutrition=exchangeNutrition(entry);
    return <article key={entry.id} className={classic?"rounded-xl border border-[#e1e8e2] bg-white p-3":"rounded-2xl border border-[#e0e8e0] bg-white p-4 shadow-[0_3px_12px_rgba(23,61,54,.035)]"}>
      <div className="flex min-w-0 items-start gap-3">
        {!classic&&<span className={`shrink-0 rounded-xl p-2.5 ${role==="drink"?"bg-sky-50 text-sky-700":role==="fruit"?"bg-rose-50 text-rose-600":role==="main"?"bg-amber-50 text-amber-700":"bg-emerald-50 text-emerald-700"}`}>{roleIcon(role)}</span>}
        <div className="min-w-0 flex-1"><h3 className="break-words font-semibold text-[#244f40]">{entry.name_snapshot}</h3><p className="mt-1 text-sm text-[#697b71]">{format(entry.quantity)} {units[entry.unit]}{entry.recipe_snapshot?` · de un rendimiento de ${format(entry.recipe_snapshot.servings)}`:""}</p></div>
        <button aria-label={`Conservar ${entry.name_snapshot}`} aria-pressed={fixedEntries.includes(entry.id)} className={`rounded-lg p-2 ${fixedEntries.includes(entry.id)?"bg-[#e4efe7] text-[#315f49]":"text-[#85928b]"}`} onClick={()=>preserve(entry.id)}><LockKeyhole size={16}/></button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-[#64766b]">Cantidad<input aria-label={`Cantidad de ${entry.name_snapshot}`} type="number" min=".001" step=".5" className="nuth-input !w-24 !py-2" value={entry.quantity} onChange={e=>change(updateMenuEntryQuantity(working,distribution,entry.id,Number(e.target.value)),false)}/><span>{units[entry.unit]}</span></label>
        {entry.food_snapshot?<FoodExchangeSelector food={entry.food_snapshot} foods={allowedFoods} onSelect={food=>exchangeFood(entry,food)}/>:<button className="nuth-button-secondary !px-3 !py-2 !text-xs" aria-label={`Editar receta ${entry.name_snapshot}`} onClick={()=>{const recipe=recipeFromEntry(entry);if(recipe){setSelectedRecipe(recipe);setEditingEntry(entry.id);setPanel("adjust");}}}><BookOpen size={14}/>Revisar preparación</button>}
        <button className="ml-auto rounded-lg p-2 text-[#aa5546]" aria-label={`Eliminar ${entry.name_snapshot}`} onClick={()=>change(removeMenuEntry(working,distribution,entry.id))}><Trash2 size={16}/></button>
      </div>
      <details className="mt-3 text-xs text-[#708177]"><summary className="cursor-pointer py-1">Ingredientes, equivalentes y presentación</summary><div className="mt-2 space-y-2">
        <label className="flex flex-wrap items-center gap-2">Presentar como<select aria-label={`Rol de ${entry.name_snapshot}`} className="nuth-input !w-auto !py-1" value={role} onChange={e=>{const menus=working.menus.map(v=>v.id!==working.active_menu_id?v:{...v,meal_menus:v.meal_menus.map(m=>({...m,entries:m.entries.map(i=>i.id===entry.id?{...i,culinary_role:e.target.value as DietMenuEntry["culinary_role"]}:i)}))});change({...working,menus,status:"editing",confirmed_at:null});}}>{Object.entries(ROLE_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        <p>Aporte estimado por equivalentes: {format(nutrition.kcal)} kcal · CHO {format(nutrition.cho)} g · proteína {format(nutrition.protein)} g · grasa {format(nutrition.fat)} g. No representa análisis directo del alimento.</p><p>{entry.exchange_contributions.map(c=>`${format(c.portions)} ${getExchangeGroup(c.group_code).shortName}`).join(" · ")||"Sin equivalentes registrados. El agua natural no completa grupos."}</p>
        {entry.recipe_snapshot?.items.map((item,index)=><p key={index}>{format(Number(item.amount)*entry.quantity/entry.recipe_snapshot!.servings)} {units[item.unit]} · {item.food_snapshot.name} · cantidad para este tiempo</p>)}
        {entry.recipe_snapshot?.instructions&&<p className="whitespace-pre-wrap">{entry.recipe_snapshot.instructions}</p>}
        {entry.recipe_snapshot?.substitution_notes&&<p>{entry.recipe_snapshot.substitution_notes}</p>}
      </div></details>
    </article>;
  };
  return <section className="min-w-0 rounded-[28px] border border-[#dce6de] bg-[#fbfcf8] p-4 text-[#173d36] sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e1e8df] pb-5">
      <div className="flex items-center gap-3"><span className="rounded-2xl bg-[#173d36] p-3 text-[#efbd6b]"><Utensils size={24}/></span><div><p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#5b7c6b]">Paso 5 · Menú</p><h1 className="mt-1 text-xl font-semibold sm:text-2xl">{MESA_COPY.name}</h1><p className="mt-1 text-xs text-[#748377]">{MESA_COPY.subtitle}</p></div></div>
      <button className="nuth-button-secondary !px-3 !py-2 !text-xs" aria-pressed={classic} onClick={()=>setClassic(!classic)}><LayoutList size={16}/>{classic?"Volver a la mesa":"Vista clásica"}</button>
    </header>
    <div className="my-4 flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-2"><button className="nuth-button-secondary !px-3 !py-2 !text-xs" onClick={()=>setPanel("preferences")}><Heart size={14}/>Preferencias del paciente</button><button className="nuth-button-secondary !px-3 !py-2 !text-xs" aria-expanded={reviewDay} onClick={()=>setReviewDay(!reviewDay)}><LayoutList size={14}/>Ver el día</button></div><button disabled={loading||busy} className="nuth-button !px-3 !py-2 !text-xs" aria-label="Proponer alimentos y recetas para todos los tiempos pendientes" onClick={()=>buildProposal(null)}><Sparkles size={14}/>Proponer día</button></div>
    <div role="tablist" aria-label="Tiempos del menú" onKeyDown={event=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;event.preventDefault();const times=distribution.meal_times;const current=times.findIndex(m=>m.id===meal.id);const index=event.key==="Home"?0:event.key==="End"?times.length-1:(current+(event.key==="ArrowRight"?1:-1)+times.length)%times.length;setActiveMealId(times[index].id);(event.currentTarget.querySelectorAll("button")[index] as HTMLButtonElement)?.focus();setPanel(null);}} className="mb-5 flex gap-2 overflow-x-auto pb-2">{distribution.meal_times.map(m=>{const rs=status.rows.filter(r=>r.meal_time_id===m.id);const covered=rs.length>0&&rs.every(r=>r.state==="complete");return <button key={m.id} role="tab" tabIndex={m.id===meal.id?0:-1} aria-selected={m.id===meal.id} className={`shrink-0 rounded-2xl border px-4 py-3 text-left ${m.id===meal.id?"border-[#173d36] bg-[#173d36] text-white":"border-[#dce6de] bg-white text-[#587061]"}`} onClick={()=>{setActiveMealId(m.id);setPanel(null);}}><span className="block text-sm font-semibold">{m.display_name}{covered&&<Check aria-label="Equivalentes cubiertos" className="ml-2 inline" size={14}/>}</span><span className="text-[11px] opacity-75">{m.time||"Sin horario"} · {rs.filter(r=>r.state==="complete").length}/{rs.length} grupos cubiertos{rs.some(r=>r.state==="excess")?" · Exceso":""}</span></button>;})}</div>
    {sourceNeedsReview&&<p className="mb-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Revisa el menú con la distribución vigente. Tus alimentos se conservan; la revisión anterior no confirma esta prescripción.</p>}
    {error&&<p role="alert" className="my-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice&&<p role="status" className="my-3 rounded-xl bg-[#edf4ef] p-3 text-xs">{notice}</p>}
    {libraryNotice&&<p role="status" className="my-3 rounded-xl bg-sky-50 p-3 text-xs text-sky-800">{libraryNotice}</p>}
    {explorer.message&&<p role="status" className="my-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{explorer.message}</p>}
    {proposal&&<div className="mb-4 rounded-2xl border border-[#b6cfc1] bg-[#edf5ef] p-4"><p className="text-[10px] font-bold uppercase tracking-widest">Vista previa editable</p><h2 className="mt-1 font-semibold">{proposal.mealTimeId?`Propuesta para ${distribution.meal_times.find(m=>m.id===proposal.mealTimeId)?.display_name}`:"Propuesta del día"}</h2><p className="mt-1 text-xs">Edita en la mesa. Nada del menú se guarda hasta aplicar.</p><ProposalNavigation count={explorer.count} index={explorer.index} onNavigate={direction=>{explorer.navigate(direction);setPanel(null);}}/><div className="flex flex-wrap gap-2"><button className="nuth-button" aria-label="Aplicar propuesta" onClick={apply}>Aplicar</button><button className="nuth-button-secondary" onClick={()=>{explorer.discard();setLockedSeed(draft);setFixedEntries(fixedEntries.filter(id=>activeMenu(draft).meal_menus.some(m=>m.entries.some(e=>e.id===id))));setPanel(null);}}>Descartar</button><button className="nuth-button-secondary" onClick={()=>buildProposal(proposal.mealTimeId,proposal.mode)}>Otra propuesta</button></div></div>}
    {!proposal&&explorer.canUndo&&<button className="nuth-button-secondary mb-4" onClick={()=>explorer.undo(previous=>{saveDraft(previous);setLockedSeed(previous);setNotice("Se recuperó el menú anterior a la aplicación.");})}>Deshacer aplicación</button>}
    {!proposal&&explorer.count>0&&<button className="ml-2 mb-4 text-xs underline" onClick={()=>explorer.navigate(0)}>Recuperar propuestas</button>}
    <div className={classic?"grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_290px]":"grid min-w-0 gap-4 xl:grid-cols-[210px_minmax(0,1fr)_270px]"}>
      <aside className={classic?"order-2 min-w-0":"min-w-0"}>
        <details open={needsOpen} onToggle={e=>setNeedsOpen(e.currentTarget.open)} className="rounded-2xl border border-[#dfe7df] bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">{MESA_COPY.needs}<ChevronDown size={15} className="float-right"/></summary><div className="mt-3"><MealNeeds rows={rows} onSelect={code=>openPantry("food",code)}/></div><details className="mt-3 text-[11px] leading-5 text-[#6b7e70]"><summary className="cursor-pointer">Diferencias reales</summary><p>±{MENU_COMPARISON_TOLERANCE} eq por grupo es una tolerancia de comparación, no una valoración clínica.</p><p>Tiempo: faltan {format(diffs.missing)} · exceden {format(diffs.excess)} eq, sin compensar entre grupos.</p>{diffs.groups.map(d=><p key={d.name}>{d.name}: {d.delta>0?"+":""}{format(d.delta)} eq</p>)}<p>Día: faltan {format(dayDiffs.missing)} · exceden {format(dayDiffs.excess)} eq.</p></details></details>
      </aside>
      <main className="min-w-0"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">{MESA_COPY.menu}</h2><p className="text-xs text-[#7a8b7e]">{meal.display_name} · cantidades para este tiempo</p></div><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={fixedMeals.includes(meal.id)} onChange={()=>preserve(meal.id,true)}/>Conservar tiempo</label></div>
        <div className="mb-4 flex flex-wrap gap-2"><button disabled={loading||busy||fixedMeals.includes(meal.id)} className="nuth-button-secondary !px-3 !py-2 !text-xs" aria-label="Proponer alimentos y recetas para este tiempo de comida" onClick={()=>buildProposal(meal.id)}><Sparkles size={14}/>Proponer tiempo</button>{entries.length>0&&<button disabled={fixedMeals.includes(meal.id)} className="rounded-lg px-2 py-2 text-xs text-[#627969] underline underline-offset-4" onClick={()=>buildProposal(meal.id,"replace")}>Reorganizar este tiempo</button>}</div>
        {classic?<div className="space-y-3">{entries.map(entryCard)}</div>:Object.entries(ROLE_LABELS).map(([role,label])=>{const list=entries.filter(e=>entryRole(e)===role);return list.length?<section key={role} className="mb-5"><h3 className="mb-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#849184]">{label}</h3><div className="space-y-3">{list.map(entryCard)}</div></section>:null;})}
        {!entries.length&&<div className="rounded-2xl border border-dashed border-[#c9d9cc] bg-[#f1f6ee] p-8 text-center"><ChefHat size={30} className="mx-auto text-[#74997a]"/><h3 className="mt-3 font-semibold">¿Qué servimos en {meal.display_name.toLocaleLowerCase("es-MX")}?</h3><p className="mt-2 text-sm text-[#768876]">Elige en la despensa o explora una propuesta.</p></div>}
        <div className="mt-4 flex flex-wrap gap-2"><button className="nuth-button-secondary !text-xs" aria-label="Agregar alimento" onClick={()=>openPantry("food")}><Plus size={15}/>Alimento</button><button className="nuth-button-secondary !text-xs" aria-label="Agregar receta" onClick={()=>openPantry("recipe")}><ChefHat size={15}/>Receta</button><button className="nuth-button-secondary !text-xs" aria-label="Agregar bebida" onClick={()=>openPantry("drink")}><GlassWater size={15}/>Bebida</button></div>
        {entries.length>0&&<button className="mt-4 text-xs font-semibold text-[#47765b] underline underline-offset-4" onClick={()=>beginRecipe()}>Crear receta</button>}
        {rows.some(r=>r.state!=="complete")&&<p className="mt-5 text-xs leading-5 text-[#8b7752]">Si no encuentras una preparación práctica, <button className="underline" onClick={onGoToMeals}>revisa Tiempos</button>. Conservaremos tu menú.</p>}
      </main>
      <aside className={`min-w-0 ${classic?"lg:col-span-2":""}`}>
        <div className="rounded-2xl border border-[#dce5dc] bg-[#f1f5ec] p-4"><div className="flex items-center gap-2"><ShoppingBasket size={18}/><h2 className="font-semibold">{MESA_COPY.pantry}</h2></div><p className="mt-1 text-xs leading-5 text-[#7b8a76]">Alimentos y preparaciones para este tiempo.</p><div className="mt-3 flex flex-wrap gap-2"><button className="rounded-xl bg-white px-3 py-2 text-xs" onClick={()=>openPantry("food")}>Alimentos</button><button className="rounded-xl bg-white px-3 py-2 text-xs" onClick={()=>openPantry("recipe")}>Recetas</button><button className="rounded-xl bg-white px-3 py-2 text-xs" onClick={()=>openPantry("drink")}>Bebidas</button></div><button className="mt-4 text-xs underline" onClick={()=>beginRecipe(true)}>Crear bebida personal</button></div>
        {loading&&<p role="status" className="mt-3 text-xs">Cargando despensa…</p>}
      </aside>
    </div>
    {reviewDay&&<section className="mt-5 rounded-2xl border border-[#dce5dc] bg-white p-4"><h2 className="font-semibold">El día en la mesa</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{distribution.meal_times.map(m=><div className="rounded-xl bg-[#f5f7f0] p-3" key={m.id}><h3 className="text-sm font-semibold">{m.display_name}</h3>{variant.meal_menus.find(v=>v.meal_time_id===m.id)?.entries.map(e=><p className="mt-2 text-xs" key={e.id}>{e.name_snapshot} · {format(e.quantity)} {units[e.unit]} · {ROLE_LABELS[entryRole(e)]}</p>)}{status.rows.filter(r=>r.meal_time_id===m.id&&r.state!=="complete").map(r=><p key={r.group_code} className="mt-2 text-xs text-[#9d663e]">{getExchangeGroup(r.group_code).shortName}: {r.remaining>0?"faltan":"exceden"} {format(Math.abs(r.remaining))} eq</p>)}</div>)}</div>{observations.map(message=><p key={message} className="mt-3 text-xs text-[#856b44]">{message}</p>)}<p className="mt-3 text-xs text-[#7b887e]">Revisión del profesional: estas observaciones no califican el sabor, la saciedad ni la calidad clínica.</p></section>}
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#dce5dc] pt-5"><div><p className="text-sm font-semibold">{status.canConfirm?"Equivalentes del día cubiertos":"Menú por completar"}</p><p className="mt-1 text-xs text-[#7c8b7d]">{status.pending} grupos pendientes · {status.excess} con exceso · Revisión profesional {draft.status==="ready"&&!sourceNeedsReview?"registrada":"pendiente"}</p></div><button className="nuth-button" disabled={distribution.status!=="ready"||!status.canConfirm||Boolean(proposal)||observations.some(s=>s.includes(": excluido"))} onClick={()=>{const next=confirmDietMenu(working,distribution);saveDraft(next);}}>Confirmar menú</button></div>
    <div className="mt-3 flex justify-end gap-3"><AutosaveFeedback status={autosave.status}/>{autosave.status==="error"&&<button className="text-sm underline" onClick={()=>void autosave.saveNow()}>Reintentar guardado</button>}</div>
    <div className="[&_footer]:static"><WorkshopStepFooter onPrevious={onGoToMeals} finalStep/></div>
    {panel&&<EditorDialog title={isPantry?"Despensa":panel==="preferences"?"Preferencias explícitas":panel==="selection"?"Selecciona qué forma la preparación":"Preparación"} onClose={closePanel}>
      {isPantry&&pantry}
      {panel==="new_food"&&<CustomFoodForm busy={busy} initialGroup={groupFilter==="all"?"VEGETABLES":groupFilter} onCancel={closePanel} onCreate={input=>void saveFood(input)}/>}
      {panel==="adjust"&&selectedRecipe&&<>{isVerifiedWater(selectedRecipe)?<div><p>Agua potable sin ingredientes añadidos. Una porción de 240 ml; no completa equivalentes.</p><button className="nuth-button mt-4" onClick={()=>incorporateRecipe(selectedRecipe)}>Agregar al menú</button></div>:<RecipeAdjustPanel key={editingEntry??selectedRecipe.id} recipe={selectedRecipe} foods={allowedFoods} pending={editingEntry?calculateMenuStatus(removeMenuEntry(working,distribution,editingEntry),distribution).rows.filter(r=>r.meal_time_id===meal.id&&r.remaining>0).map(r=>({group_code:r.group_code,portions:r.remaining})):remaining} previewServings={editingEntry?entries.find(e=>e.id===editingEntry)?.quantity??1:1} mealType={meal.meal_type} busy={busy} onCancel={closePanel} onUse={incorporateRecipe} onSaveCopy={(name,recipe)=>void saveCopy(name,recipe)}/>}</>}
      {panel==="selection"&&<div><p className="mb-4 text-sm">Elige qué ingredientes pertenecen a la {kind==="drink"?"bebida":"receta"}. Lo demás permanecerá separado.</p>{entries.filter(e=>e.recipe_snapshot?.items.length||e.food_snapshot).map(e=><label className="my-3 flex items-center gap-3 rounded-xl bg-[#f5f8f2] p-3 text-sm" key={e.id}><input type="checkbox" checked={selectedIds.includes(e.id)} onChange={()=>setSelectedIds(toggle(selectedIds,e.id))}/>{e.name_snapshot} · {format(e.quantity)} {units[e.unit]}</label>)}<div className="mt-4 flex flex-wrap gap-2"><button className="nuth-button" disabled={!selectedIds.length} onClick={()=>{setRecipeSeed(expandMenuEntriesToRecipeItems(entries.filter(e=>selectedIds.includes(e.id)),foods));setPanel("new_recipe");}}>Continuar con selección</button><button className="nuth-button-secondary" onClick={()=>{setSelectedIds([]);setRecipeSeed([]);setPanel("new_recipe");}}>Crear desde cero</button></div></div>}
      {panel==="new_recipe"&&<RecipeForm foods={allowedFoods} busy={busy} kind={kind} initialItems={recipeSeed} onCancel={closePanel} onCreate={(...args)=>void createRecipe(...args)}/>}
      {panel==="preferences"&&<div><p className="text-sm text-[#6b7c6e]">Condiciones registradas por el profesional para este plan. Sin información no significa que le guste. No se interpretan notas libres.</p><input aria-label="Buscar preferencias" className="nuth-input my-4" placeholder="Buscar alimento" value={preferenceSearch} onChange={e=>setPreferenceSearch(e.target.value)}/><div className="max-h-96 space-y-2 overflow-auto">{foods.filter(f=>f.name.toLocaleLowerCase("es-MX").includes(preferenceSearch.toLocaleLowerCase("es-MX"))).map(f=><label key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f5f7f0] p-3 text-sm"><span>{f.name}</span><select aria-label={`Preferencia de ${f.name}`} className="nuth-input !w-auto !py-2" value={draft.food_preferences?.[f.id]??"unknown"} onChange={e=>{const food_preferences={...draft.food_preferences};if(e.target.value==="unknown")delete food_preferences[f.id];else food_preferences[f.id]=e.target.value as "like"|"avoid"|"exclude";explorer.invalidate();saveDraft({...draft,food_preferences,status:"editing",confirmed_at:null});}}><option value="unknown">Sin información</option><option value="like">Le gusta</option><option value="avoid">Prefiere evitar</option><option value="exclude">Excluido</option></select></label>)}</div><p className="mt-4 text-xs">Las exclusiones se respetan al proponer, agregar e intercambiar. Si ya existe un alimento excluido, se señala en Ver el día; no se elimina automáticamente.</p></div>}
    </EditorDialog>}
    {savedRecipe&&<EditorDialog title="Preparación guardada" onClose={()=>setSavedRecipe(null)}><h3 className="font-semibold">¿Usar “{savedRecipe.recipe.name}” en el menú?</h3><p className="mt-2 text-sm">Ya está en tu biblioteca. Usarla reemplaza únicamente los elementos seleccionados; no duplica sus ingredientes.</p>{savedRecipe.preview&&!proposal&&<p role="alert" className="mt-3 text-sm text-amber-800">La propuesta ya no está vigente. Puedes agregar esta preparación desde la despensa al abrir una nueva exploración.</p>}<div className="mt-4 flex gap-2"><button className="nuth-button-secondary" onClick={()=>setSavedRecipe(null)}>No</button><button className="nuth-button" disabled={savedRecipe.preview&&!proposal} onClick={()=>{const next=savedRecipe.entries.length?replaceMenuEntriesWithRecipe(working,distribution,savedRecipe.meal,savedRecipe.entries,savedRecipe.recipe):addRecipeToMenu(working,distribution,savedRecipe.meal,savedRecipe.recipe);change(next);setSavedRecipe(null);}}>Sí</button></div></EditorDialog>}
  </section>;
}
