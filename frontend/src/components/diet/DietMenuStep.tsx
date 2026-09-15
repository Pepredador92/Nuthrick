import { useEffect, useMemo, useRef, useState } from "react";
import { Apple, BookOpen, ChefHat, ChevronDown, GlassWater, Heart, LayoutList, LockKeyhole, Plus, ShoppingBasket, Sparkles, Trash2, Utensils, X } from "lucide-react";
import { getExchangeGroup } from "@/src/features/exchanges/catalog";
import { activeMenu, addFoodToMenu, addRecipeToMenu, calculateMenuStatus, createDietMenu, expandMenuEntriesToRecipeItems, MENU_COMPARISON_TOLERANCE, reconcileDietMenu, replaceFoodMenuEntry, replaceMenuEntriesWithRecipe, replaceRecipeMenuEntry, removeMenuEntry, updateMenuEntryQuantity } from "@/src/features/menu/model";
import { isFoodRestricted, menuAlternatives, type MenuPlanningMode, type MenuProposal } from "@/src/features/menu/planner";
import { dayObservations, entryRole, exchangeNutrition, isDrink, isVerifiedWater, menuDifferences, menuRestrictions, MESA_COPY, withPreservedContent, recipeFromEntry, recipeHasKnownContributions, ROLE_LABELS, starterDrinks } from "@/src/features/menu/mesa";
import { createCustomFood, createCustomRecipe, type CustomFoodInput, type CustomRecipeInput, type RecipeDraftItem, listFoodItems, listRecipes } from "@/src/services/foodCatalog";
import type { DietMenu, DietMenuEntry, ExchangeGroupCode, FoodItem, NutritionPlan, Recipe, MealOption, WeekDayCode } from "@/src/types/domain";
import { commitOptionEdits, confirmOption, ensureOptionBank, MAX_MEAL_OPTIONS, newMealOption, optionCanConfirm, optionIsEligible, projectOptions, restoreOptionEdits, saveOptionBank } from "@/src/features/menu/options";
import { assignment, dayName, usedDays } from "@/src/features/menu/week";
import { MenuWeekPlanner } from "./MenuWeekPlanner";
import { foodUnitLabels, formatFoodQuantity } from "@/src/features/menu/units";
import { menuSignature } from "@/src/features/menu/mesa";
import { emptyIntent, keepIntentEntries, recordPreviewEdit, type ExplorationIntent } from "@/src/features/menu/exploration";
import { AutosaveFeedback } from "./AutosaveFeedback";
import { WorkshopStepFooter } from "./WorkshopStepFooter";
import { useChangeAutosave } from "./useChangeAutosave";
import { ProposalNavigation, useProposalExplorer, useProposalSetting } from "./useProposalExplorer";
import { BrowserPanel, CustomFoodForm, FoodExchangeSelector, MealNeeds, RecipeAdjustPanel, RecipeForm } from "./MenuEditors";

type Props = { plan: NutritionPlan; onSave: (menu: DietMenu) => Promise<void>; onDraftChange?: (menu: DietMenu) => void; onGoToMeals: () => void; catalog?: { foods: FoodItem[]; recipes: Recipe[] }; recipeWriter?: (input: CustomRecipeInput) => Promise<Recipe> };
const format = formatFoodQuantity;
const units = foodUnitLabels;
type Panel = "food" | "recipe" | "drink" | "adjust" | "new_food" | "new_recipe" | "selection" | "preferences" | null;

function EditorDialog({ children, onClose, title }: { children: React.ReactNode; onClose: () => void; title: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const opener = document.activeElement;
    const dialog = ref.current;
    dialog?.showModal?.();
    return () => { dialog?.close?.(); if (opener instanceof HTMLElement && opener.isConnected) opener.focus(); };
  }, []);
  return <dialog ref={ref} aria-label={title} onCancel={onClose} className="m-auto max-h-[90dvh] w-[min(820px,calc(100vw-24px))] overflow-auto rounded-3xl border border-[#d4e2d8] bg-white p-4 text-[#173d36] shadow-xl backdrop:bg-[#173d36]/35 sm:p-6" open={typeof HTMLDialogElement === "undefined" || !HTMLDialogElement.prototype.showModal}>
    <div className="mb-4 flex items-center justify-between gap-4"><h2 className="font-semibold">{title}</h2><button type="button" aria-label="Cerrar panel" className="rounded-lg p-2 hover:bg-[#edf4ee]" onClick={onClose}><X size={20}/></button></div>{children}
  </dialog>;
}

export function DietMenuStep(props: Props) {
  return <MenuWorkspace key={props.plan.id} {...props}/>;
}

function MenuWorkspace({ plan, onSave, onDraftChange, onGoToMeals, catalog, recipeWriter = createCustomRecipe }: Props) {
  const distribution = plan.meal_distribution;
  const initial = useMemo(() => distribution ? ensureOptionBank(plan.diet_menu ?? createDietMenu(distribution), distribution) : null, [distribution, plan.diet_menu]);
  const [draft, setDraft] = useState(initial);
  const [optionSelection, setOptionSelection] = useState<Record<string, string>>({});
  const [view, setView] = useState<"options" | "week">("options");
  const [deleted, setDeleted] = useState<{ option: MealOption; index: number } | null>(null);
  const [dayVariant, setDayVariant] = useState<{ day: WeekDayCode; optionId: string } | null>(null);
  const [activeMealId, setActiveMealId] = useState(distribution?.meal_times[0]?.id ?? "");
  const activeOptionId = optionSelection[activeMealId] ?? draft?.meal_options?.find(o => o.meal_time_id === activeMealId)?.id ?? "empty";
  const explorationKey = `mesa:${plan.id}:${activeMealId}:${activeOptionId}`;
  const [foods, setFoods] = useState(catalog?.foods ?? []);
  const [recipes, setRecipes] = useState(catalog?.recipes ?? []);
  const [addedCatalogIds, setAddedCatalogIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(!catalog);
  const [classic, setClassic] = useProposalSetting("mesa:view", false);
  const [fixedEntries, setFixedEntries] = useProposalSetting<string[]>(`${explorationKey}:entries`, []);
  const [fixedMeals, setFixedMeals] = useProposalSetting<string[]>(`${explorationKey}:meals`, []);
  const [lockedSeed, setLockedSeed] = useProposalSetting<DietMenu|null>(`${explorationKey}:lockedSeed`,null);
  const [panel, setPanel] = useState<Panel>(null);
  const [groupFilter, setGroupFilter] = useState<ExchangeGroupCode | "all">("all");
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [editingEntry, setEditingEntry] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [recipeSeed, setRecipeSeed] = useState<RecipeDraftItem[]>([]);
  const [kind, setKind] = useState<"recipe" | "drink">("recipe");
  const [savedRecipe, setSavedRecipe] = useState<{ recipe: Recipe; entries: string[]; meal: string; preview: boolean; editingEntry?: string | null } | null>(null);
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
  const context = JSON.stringify([distribution, draft?.food_preferences, loading, foods.filter(f=>!addedCatalogIds.includes(f.id)).map(f => [f.id,f.updated_at,f.active,f.group_code,f.portion_amount,f.portion_unit,f.attributes]), recipes.filter(r=>!addedCatalogIds.includes(r.id)).map(r=>[r.id,r.updated_at,r.items])]);
  const explorer = useProposalExplorer<MenuProposal, DietMenu>(`${explorationKey}:history`, context, p=>menuSignature(p.menu,activeMealId));
  const [intentState, setIntentState] = useProposalSetting<{ context: string; value: ExplorationIntent; undo: ExplorationIntent | null }>(`${explorationKey}:intent`, {context,value:emptyIntent(),undo:null});
  const intent = intentState.context === context ? intentState.value : emptyIntent();
  const proposal = explorer.proposal;
  const projected = draft && distribution ? projectOptions(draft, distribution, optionSelection) : null;
  const working = projected && proposal ? withPreservedContent(projected, proposal.menu, [], [activeMealId]) : projected;
  const autosave = useChangeAutosave({ initialValue: initial, onSave: async value => { if(value) await onSave(value); }, onDraftChange: value => { if(value) onDraftChange?.(value); } });
  useEffect(() => {
    if(catalog) return;
    let live = true;
    void Promise.all([listFoodItems(),listRecipes()]).then(([f,r])=>{ if(live) {setFoods(f);setRecipes(r);} }).catch(()=>{if(live)setError("No pudimos cargar la despensa. Recarga para volver a intentar; tu menú permanece intacto.");}).finally(()=>{if(live)setLoading(false);});
    return () => {live=false;};
  },[catalog]);
  if (!distribution || !distribution.distribution.some(r=>r.portions>0) || !working || !draft) return <section className="rounded-3xl bg-white p-6"><h1 className="text-2xl font-semibold">{MESA_COPY.name}</h1><p className="my-4">Distribuye primero los equivalentes entre tiempos de comida.</p><button className="nuth-button" onClick={onGoToMeals}>Ir a Tiempos de comida</button></section>;
  const meal = distribution.meal_times.find(m=>m.id===activeMealId) ?? distribution.meal_times[0];
  const mealOptions = (draft.meal_options ?? []).filter(o => o.meal_time_id === meal.id);
  const selectedOption = mealOptions.find(o => o.id === optionSelection[meal.id]) ?? mealOptions[0];
  const affectedDays = selectedOption ? usedDays(draft, selectedOption.id) : [];
  const variant = activeMenu(working);
  const entries = variant.meal_menus.find(m=>m.meal_time_id===meal.id)?.entries ?? [];
  const status = calculateMenuStatus(working,distribution);
  const rows = status.rows.filter(r=>r.meal_time_id===meal.id);
  const remaining = rows.filter(r=>r.remaining>0).map(r=>({group_code:r.group_code,portions:r.remaining}));
  const sourceNeedsReview = distribution.status !== "ready" || Boolean(selectedOption?.status === "confirmed" && !optionIsEligible(draft, distribution, selectedOption));
  const restrictions = menuRestrictions(draft);
  const allowedFoods = foods.filter(f=>!isFoodRestricted(f,restrictions));
  const usedFoodIds = variant.meal_menus.flatMap(m=>m.entries.flatMap(e=>e.food_snapshot?[e.source_id]:e.recipe_snapshot?.items.map(i=>i.food_snapshot.id)??[]));
  const diffs = menuDifferences(working,distribution,meal.id);
  const dayDiffs = menuDifferences(working,distribution);
  const observations = dayObservations({...working,food_preferences:draft.food_preferences});
  const preserve = (id:string, wholeMeal=false) => {
    setLockedSeed(working);
    if(wholeMeal)setFixedMeals(toggle(fixedMeals,id));else setFixedEntries(toggle(fixedEntries,id));
  };
  const toggle = (values: string[], id: string) => values.includes(id)?values.filter(v=>v!==id):[...values,id];
  const persistRoot = (next: DietMenu, immediate = true) => {setDraft(next);autosave.change(next,{immediate});};
  const saveDraft = (next: DietMenu, immediate = true) => persistRoot(commitOptionEdits(draft, next, distribution, optionSelection, meal.id), immediate);
  const selectOption = (option: MealOption) => { setOptionSelection(current => ({...current, [option.meal_time_id]: option.id})); setActiveMealId(option.meal_time_id); setPanel(null); setView("options"); };
  const addOption = (copy?: MealOption, day?: WeekDayCode) => {
    try { const option = newMealOption(draft, copy?.meal_time_id ?? meal.id, day ? `${copy!.name} · ${dayName(day)}` : copy ? `${copy.name} · copia` : `${meal.display_name} · opción ${mealOptions.length + 1}`, copy);
      persistRoot(saveOptionBank(draft, distribution, [...draft.meal_options ?? [], option])); selectOption(option); if(day) setDayVariant({day, optionId:option.id});
    } catch(cause) {setError(cause instanceof Error ? cause.message : "No pudimos crear la opción.");}
  };
  const change = (next: DietMenu, immediate = true) => {
    setError("");
    if(fixedEntries.length||fixedMeals.length)setLockedSeed(next);
    if(proposal) { setIntentState({context,value:recordPreviewEdit(working,next,meal.id,intent),undo:structuredClone(intent)}); explorer.edit({...proposal,menu:next}); }
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
    if (!proposal || mode === "replace") setIntentState({context,value:{...intent,preservedIds:mode === "replace" ? [...fixedEntries] : entries.map(e=>e.id)},undo:null});
    explorer.generate(()=>{
      const previewBase = proposal && mode === "complete" ? keepIntentEntries(proposal.menu, meal.id, [...intent.preservedIds,...fixedEntries]) : proposal?.menu ?? projected!;
      const base=withPreservedContent(previewBase,lockedSeed,fixedEntries,fixedMeals);
      const conflicts=activeMenu(base).meal_menus.flatMap(m=>m.entries.filter(e=>fixedMeals.includes(m.meal_time_id)||fixedEntries.includes(e.id))).filter(e=>(e.food_snapshot?[e.food_snapshot]:e.recipe_snapshot?.items.map(i=>i.food_snapshot)??[]).some(f=>isFoodRestricted(f,restrictions)));
      if(conflicts.length)throw new Error(`Libera o cambia los elementos conservados que contienen alimentos excluidos: ${conflicts.map(e=>e.name_snapshot).join(", ")}.`);
      if (proposal && mode === "complete" && calculateMenuStatus(base,distribution).rows.filter(r=>r.meal_time_id===meal.id).every(r=>r.state==="complete")) throw new Error("Conservaste la composición completa. Usa Reorganizar para explorar otra comida.");
      return menuAlternatives({menu:base,distribution,foods:allowedFoods,recipes:allRecipes,restrictions,mealTimeId:mealId,mode,fixedEntryIds:fixedEntries,fixedMealIds:fixedMeals,rejectedFoodIds:intent.rejectedFoodIds,rejectedPreparations:intent.rejectedPreparations});
    });
  };
  const createRecipe = async (name: string, items: RecipeDraftItem[], description: string, instructions: string, substitutions: string, servings: number) => {
    if(items.some(i=>isFoodRestricted(i.food,restrictions))) {setError("La selección incluye alimentos excluidos. Revísala antes de guardar.");return;}
    setBusy(true);setError("");
    try {
      const recipe = await recipeWriter({name,items,description,instructions,substitution_notes:substitutions,servings,kind,meal_types:[meal.meal_type]});
      setAddedCatalogIds(ids=>[...ids,recipe.id]);setRecipes(current=>[recipe,...current]);setLibraryNotice(`“${recipe.name}” se guardó en tu biblioteca. Descartar el menú no elimina esta preparación.`);
      setSavedRecipe({recipe,entries:selectedIds,meal:meal.id,preview:Boolean(proposal)});setPanel(null);
    } catch(cause) {setError(cause instanceof Error?cause.message:"No pudimos guardar la preparación.");} finally {setBusy(false);}
  };
  const saveCopy = async (name:string, recipe:Recipe) => {
    setBusy(true);
    try {
      const copy=await recipeWriter({name,items:expandMenuEntriesToRecipeItems([activeMenu(addRecipeToMenu(createDietMenu(distribution),distribution,meal.id,recipe,recipe.servings)).meal_menus.find(m=>m.meal_time_id===meal.id)!.entries[0]],foods),servings:recipe.servings,kind:isDrink(recipe)?"drink":"recipe",instructions:recipe.instructions??"",substitution_notes:recipe.substitution_notes??"",meal_types:recipe.meal_types});
      setAddedCatalogIds(ids=>[...ids,copy.id]);setRecipes(current=>[copy,...current]);setLibraryNotice(`“${copy.name}” se guardó en tu biblioteca. Descartar el menú no elimina esta preparación.`);setSavedRecipe({recipe:copy,entries:[],meal:meal.id,preview:Boolean(proposal),editingEntry});setPanel(null);
    } catch(cause) {setError(cause instanceof Error?cause.message:"No pudimos guardar la copia.");} finally {setBusy(false);}
  };
  const saveFood = async(input:CustomFoodInput) => {setBusy(true);try {const food=await createCustomFood(input);setAddedCatalogIds(ids=>[...ids,food.id]);setFoods(current=>[food,...current]);addFood(food,input.portion_amount);}catch(cause){setError(cause instanceof Error?cause.message:"No pudimos guardar.");}finally{setBusy(false);}};
  const apply = () => {explorer.apply(projected!,next=>saveDraft(reconcileDietMenu(next.menu,distribution)));setPanel(null);setNotice("Propuesta aplicada al borrador. La revisión profesional sigue pendiente.");};
  const beginRecipe = (drink = false) => {setKind(drink?"drink":"recipe");setSelectedIds([]);setRecipeSeed([]);setPanel("selection");};
  const pantry = <BrowserPanel key={`${panel}-${groupFilter}`} mode={panel==="drink"?"drink":panel==="recipe"?"recipe":"food"} foods={foods} recipes={allRecipes} required={remaining} groupCode={groupFilter} mealType={meal.meal_type} restrictions={restrictions} usedFoodIds={usedFoodIds} busy={busy} onClose={closePanel} onFood={addFood} onRecipe={recipe=>{setSelectedRecipe(recipe);setEditingEntry(null);setPanel("adjust");}} onNewFood={()=>setPanel("new_food")} onNewRecipe={()=>{setKind(panel==="drink"?"drink":"recipe");setSelectedIds([]);setRecipeSeed([]);setPanel("new_recipe");}}/>;
  const isPantry = panel==="food"||panel==="recipe"||panel==="drink";
  const excessRow = rows.find(r=>r.state==="excess");
  const pendingRow = rows.find(r=>r.state==="pending");
  const reviewExcess = (code = excessRow?.group_code) => {
    const row = rows.find(r=>r.group_code===code);
    const contributor = entries.find(e=>e.exchange_contributions.some(c=>c.group_code===code));
    if (!contributor) return;
    const article = document.getElementById(`menu-entry-${contributor.id}`);
    const details = article?.querySelector("details");
    if (details) details.open = true;
    article?.querySelector<HTMLInputElement>("input[type=number]")?.focus();
    setNotice(`${getExchangeGroup(row!.group_code).shortName}: exceden ${format(-row!.remaining)} eq. Revisa ${contributor.name_snapshot}.`);
  };
  const optionConfirmed = selectedOption && optionIsEligible(draft,distribution,selectedOption);
  const portionDifferences = rows.filter(r => r.state !== "complete");
  const primaryLabel = !entries.length ? "Proponer" : optionConfirmed ? "Agregar otra opción" : excessRow ? "Revisar exceso" : pendingRow ? `Completar ${getExchangeGroup(pendingRow.group_code).shortName.toLocaleLowerCase("es-MX")}` : "Confirmar opción";
  const confirmationBlocked = primaryLabel === "Confirmar opción" && !optionCanConfirm(draft,distribution,selectedOption);
  const nextPendingTime = distribution.meal_times.find(m=>m.id!==meal.id && (draft.meal_options??[]).some(o=>o.meal_time_id===m.id&&!optionIsEligible(draft,distribution,o)));
  const primaryAction = () => {
    if (!entries.length) buildProposal(meal.id);
    else if (optionConfirmed) addOption();
    else if (excessRow) reviewExcess();
    else if (pendingRow) openPantry("food",pendingRow.group_code);
    else if (optionIsEligible(draft,distribution,selectedOption)) addOption();
    else persistRoot(confirmOption(draft,distribution,selectedOption.id));
  };
  const roleIcon = (role: string) => role==="drink"?<GlassWater size={18}/>:role==="fruit"?<Apple size={18}/>:role==="main"?<ChefHat size={18}/>:<Utensils size={18}/>;
  const entryCard = (entry: DietMenuEntry) => {
    const role=entryRole(entry);
    const nutrition=exchangeNutrition(entry);
    return <article id={`menu-entry-${entry.id}`} key={entry.id} className={classic?"rounded-xl border border-[#e1e8e2] bg-white p-3":"rounded-2xl border border-[#e0e8e0] bg-white p-4 shadow-[0_3px_12px_rgba(23,61,54,.035)]"}>
      <div className="flex min-w-0 items-start gap-3">
        {!classic&&<span className={`shrink-0 rounded-xl p-2.5 ${role==="drink"?"bg-sky-50 text-sky-700":role==="fruit"?"bg-rose-50 text-rose-600":role==="main"?"bg-amber-50 text-amber-700":"bg-emerald-50 text-emerald-700"}`}>{roleIcon(role)}</span>}
        <div className="min-w-0 flex-1"><h3 className="break-words font-semibold text-[#244f40]">{entry.name_snapshot}</h3><p className="mt-1 text-sm text-[#697b71]">{format(entry.quantity)} {units[entry.unit]}{entry.recipe_snapshot?` · de un rendimiento de ${format(entry.recipe_snapshot.servings)}`:""}</p></div>
        <button aria-label={`Conservar ${entry.name_snapshot}`} aria-pressed={fixedEntries.includes(entry.id)} className={`rounded-lg p-2 ${fixedEntries.includes(entry.id)?"bg-[#e4efe7] text-[#315f49]":"text-[#85928b]"}`} onClick={()=>preserve(entry.id)}><LockKeyhole size={16}/></button>
      </div>
      <details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-[#47765b]">Revisar o ajustar</summary><div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-[#64766b]">Cantidad<input aria-label={`Cantidad de ${entry.name_snapshot}`} type="number" min=".001" step=".5" className="nuth-input !w-24 !py-2" value={entry.quantity} onChange={e=>change(updateMenuEntryQuantity(working,distribution,entry.id,Number(e.target.value)),false)}/><span>{units[entry.unit]}</span></label>
        {entry.food_snapshot?<FoodExchangeSelector food={entry.food_snapshot} foods={allowedFoods} onSelect={food=>exchangeFood(entry,food)}/>:<button className="nuth-button-secondary !px-3 !py-2 !text-xs" aria-label={`Editar receta ${entry.name_snapshot}`} onClick={()=>{const recipe=recipeFromEntry(entry);if(recipe){setSelectedRecipe(recipe);setEditingEntry(entry.id);setPanel("adjust");}}}><BookOpen size={14}/>Revisar preparación</button>}
        <button className="ml-auto rounded-lg p-2 text-[#aa5546]" aria-label={`Eliminar ${entry.name_snapshot}`} onClick={()=>change(removeMenuEntry(working,distribution,entry.id))}><Trash2 size={16}/></button>
      </div></details>
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
    <div className="my-4 flex flex-wrap items-center justify-between gap-3"><nav className="flex flex-wrap gap-2" aria-label="Secciones de la mesa"><button className={view==="options"?"nuth-button":"nuth-button-secondary"} aria-pressed={view==="options"} onClick={()=>setView("options")}>Opciones por tiempo</button><button className={view==="week"?"nuth-button":"nuth-button-secondary"} aria-pressed={view==="week"} disabled={Boolean(proposal)||busy} onClick={()=>setView("week")}>Plan por días</button></nav><button className="nuth-button-secondary !px-3 !py-2 !text-xs" onClick={()=>setPanel("preferences")}><Heart size={14}/>Preferencias del paciente</button></div>
    {error&&!panel&&<p role="alert" className="my-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {view==="week"&&<MenuWeekPlanner planId={plan.id} menu={draft} distribution={distribution} onChange={persistRoot} onEditMeal={id=>{setActiveMealId(id);setView("options");}} onVariant={(option,day)=>addOption(option,day)}/>}
    {view==="options"&&<>
    <div role="tablist" aria-label="Tiempos del menú" onKeyDown={event=>{if(busy)return;if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key))return;event.preventDefault();const times=distribution.meal_times;const current=times.findIndex(m=>m.id===meal.id);const index=event.key==="Home"?0:event.key==="End"?times.length-1:(current+(event.key==="ArrowRight"?1:-1)+times.length)%times.length;setActiveMealId(times[index].id);(event.currentTarget.querySelectorAll("button")[index] as HTMLButtonElement)?.focus();setPanel(null);}} className="mb-5 flex gap-2 overflow-x-auto pb-2">{distribution.meal_times.map(m=>{return <button key={m.id} disabled={busy} role="tab" tabIndex={m.id===meal.id?0:-1} aria-selected={m.id===meal.id} className={`shrink-0 rounded-2xl border px-4 py-3 text-left ${m.id===meal.id?"border-[#173d36] bg-[#173d36] text-white":"border-[#dce6de] bg-white text-[#587061]"}`} onClick={()=>{setActiveMealId(m.id);setPanel(null);}}><span className="block text-sm font-semibold">{m.display_name}</span><span className="text-[11px] opacity-75">{(draft.meal_options??[]).filter(o=>o.meal_time_id===m.id).length} opciones · {(draft.meal_options??[]).filter(o=>o.meal_time_id===m.id&&optionIsEligible(draft,distribution,o)).length} confirmadas · {(draft.meal_options??[]).filter(o=>o.meal_time_id===m.id&&!optionIsEligible(draft,distribution,o)).length} por completar</span></button>;})}</div>
    <section aria-label="Opciones de este tiempo" className="mb-5 rounded-2xl border border-[#dce6de] bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{meal.display_name} · {mealOptions.length} {mealOptions.length===1?"opción":"opciones"}</h2><span className="text-xs text-[#708475]">Hasta 7 · alternativas independientes</span></div>
      <div className="flex gap-2 overflow-x-auto pb-2">{mealOptions.map(o=><button key={o.id} disabled={busy} aria-pressed={o.id===selectedOption?.id} className={`w-52 shrink-0 rounded-xl border p-3 text-left ${o.id===selectedOption?.id?"border-[#37614d] bg-[#edf5ef]":"border-[#dce6de] bg-white"}`} onClick={()=>selectOption(o)}><strong className="block break-words text-sm">{o.name}</strong><span className="mt-1 block truncate text-xs text-[#738578]">{o.entries.map(e=>e.name_snapshot).join(" · ")||"Por preparar"}</span><span className="mt-2 block text-xs font-semibold">{optionIsEligible(draft,distribution,o)?"Confirmada":o.status==="confirmed"?"Revisar prescripción":"Borrador"}</span></button>)}</div>
      {selectedOption&&<div className="mt-3 flex flex-wrap items-end gap-2"><label className="w-full min-w-0 text-xs sm:w-auto sm:flex-1">Nombre de la opción<input aria-label="Nombre de la opción" maxLength={120} disabled={Boolean(proposal)||busy} className="nuth-input mt-1" value={selectedOption.name} onChange={e=>persistRoot(saveOptionBank(draft,distribution,draft.meal_options!.map(o=>o.id===selectedOption.id?{...o,name:e.target.value,revision:o.revision+1}:o)),false)}/></label><button className="nuth-button-secondary !text-xs" disabled={mealOptions.length>=MAX_MEAL_OPTIONS||Boolean(proposal)||busy} onClick={()=>addOption(selectedOption)}>Duplicar opción</button><button className="nuth-button-secondary !text-xs" disabled={Boolean(proposal)||busy} onClick={()=>{setDeleted({option:structuredClone(selectedOption),index:draft.meal_options!.findIndex(o=>o.id===selectedOption.id)});persistRoot(saveOptionBank(draft,distribution,draft.meal_options!.filter(o=>o.id!==selectedOption.id)));setOptionSelection(current=>({...current,[meal.id]:mealOptions.find(o=>o.id!==selectedOption.id)?.id??""}));explorer.invalidate();setFixedEntries([]);setFixedMeals([]);setLockedSeed(null);}}>Eliminar opción</button></div>}
      <div className="mt-3 flex flex-wrap gap-2"><button className="nuth-button-secondary !text-xs" onClick={()=>setReviewDay(!reviewDay)}>Comparar opciones activas</button>{(!selectedOption||!optionIsEligible(draft,distribution,selectedOption))&&<button className="nuth-button-secondary !text-xs" disabled={mealOptions.length>=MAX_MEAL_OPTIONS||Boolean(proposal)||busy} onClick={()=>addOption()}><Plus size={14}/>{selectedOption&&optionIsEligible(draft,distribution,selectedOption)?`Agregar otra opción de ${meal.display_name.toLocaleLowerCase("es-MX")}`:"Agregar opción"}</button>}{deleted&&<button className="nuth-button-secondary !text-xs" disabled={Boolean(proposal)||(draft.meal_options??[]).filter(o=>o.meal_time_id===deleted.option.meal_time_id).length>=MAX_MEAL_OPTIONS} onClick={()=>{const bank=[...draft.meal_options??[]];bank.splice(deleted.index,0,deleted.option);persistRoot(saveOptionBank(draft,distribution,bank));selectOption(deleted.option);setDeleted(null);}}>Deshacer eliminación de opción</button>}</div>
      {affectedDays.length>0&&<p className="mt-3 text-xs text-[#7b765a]">Usada en {affectedDays.map(dayName).join(", ")}. Editar el banco no cambia esas comidas: conservan su versión aplicada. Puedes actualizarlas explícitamente desde Plan por días.</p>}
      {dayVariant&&selectedOption&&dayVariant.optionId===selectedOption.id&&<div className="mt-3 rounded-xl bg-sky-50 p-3 text-xs">Variante independiente para {dayName(dayVariant.day)}. Confírmala antes de asignarla.<button className="nuth-button-secondary mt-2 !text-xs" disabled={!selectedOption||!optionIsEligible(draft,distribution,selectedOption)} onClick={()=>{persistRoot({...draft,week_plan:draft.week_plan?{...draft.week_plan,days:draft.week_plan.days.map(d=>d.day!==dayVariant.day?d:{...d,assignments:d.assignments.map(a=>a.meal_time_id===meal.id?assignment(selectedOption,a.fixed):a)})}:null});setDayVariant(null);setView("week");}}>Usar variante en {dayName(dayVariant.day)}</button></div>}
    </section>
    {sourceNeedsReview&&<p className="mb-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Revisa esta opción con la distribución vigente. Sus alimentos se conservan; la confirmación anterior no aplica a esta prescripción.</p>}

    {!proposal && entries.length > 0 && portionDifferences.length > 0 && <section aria-label="Diferencias de porciones" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <p className="font-semibold">{optionConfirmed ? "Confirmada con diferencias" : "Las porciones difieren de la distribución"}</p>
      <p className="mt-1 text-xs leading-5">{optionConfirmed ? "Conservamos las cantidades que elegiste." : "Puedes confirmar esta opción con las cantidades actuales según tu criterio profesional."}</p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">{portionDifferences.map(row => <li key={row.group_code}>{getExchangeGroup(row.group_code).shortName}: {format(row.used)} de {format(row.portions)} eq · {row.remaining > 0 ? "faltan" : "exceden"} {format(Math.abs(row.remaining))}</li>)}</ul>
      {!optionConfirmed && <button type="button" disabled={loading || busy || !optionCanConfirm(draft, distribution, selectedOption)} className="nuth-button mt-3 !text-xs" onClick={() => {
        persistRoot(confirmOption(draft, distribution, selectedOption.id));
        setNotice("Opción confirmada con diferencias. Ya puedes incluirla en el plan por días.");
      }}>Confirmar con estas porciones</button>}
    </section>}

    {notice&&<p role="status" className="my-3 rounded-xl bg-[#edf4ef] p-3 text-xs">{notice}</p>}
    {libraryNotice&&<p role="status" className="my-3 rounded-xl bg-sky-50 p-3 text-xs text-sky-800">{libraryNotice}</p>}
    {explorer.message&&<p role="status" className="my-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">{explorer.message}</p>}
    {proposal&&<div className="mb-3 flex flex-wrap items-center gap-3 text-xs">{explorer.canUndoEdit&&<button className="underline" onClick={()=>{explorer.undoEdit(previous=>setLockedSeed(previous.menu));if(intentState.undo)setIntentState({context,value:intentState.undo,undo:null});}}>Deshacer edición de propuesta</button>}{(intent.rejectedFoodIds.length+intent.rejectedPreparations.length)>0&&<><span>{intent.rejectedFoodIds.length+intent.rejectedPreparations.length} alternativas descartadas en esta exploración</span><button className="underline" onClick={()=>setIntentState({context,value:{...intent,rejectedFoodIds:[],rejectedPreparations:[]},undo:null})}>Restablecer alternativas</button></>}</div>}
    {proposal&&<div className="mb-4 rounded-2xl border border-[#b6cfc1] bg-[#edf5ef] p-4"><p className="text-[10px] font-bold uppercase tracking-widest">Vista previa editable</p><h2 className="mt-1 font-semibold">{proposal.mealTimeId?`Propuesta para ${distribution.meal_times.find(m=>m.id===proposal.mealTimeId)?.display_name}`:"Propuesta del día"}</h2><p className="mt-1 text-xs">Edita en la mesa. Nada del menú se guarda hasta aplicar.</p><ProposalNavigation count={explorer.count} index={explorer.index} onNavigate={direction=>{explorer.navigate(direction);setPanel(null);}}/><div className="flex flex-wrap gap-2"><button className="nuth-button" aria-label="Aplicar propuesta" onClick={apply}>Aplicar</button><button className="nuth-button-secondary" onClick={()=>{explorer.discard();setLockedSeed(projected);setFixedEntries(fixedEntries.filter(id=>activeMenu(projected!).meal_menus.some(m=>m.entries.some(e=>e.id===id))));setPanel(null);}}>Descartar</button><button className="nuth-button-secondary" onClick={()=>buildProposal(meal.id,"complete")}>Otra propuesta</button></div></div>}
    {!proposal&&explorer.canUndo&&<button className="nuth-button-secondary mb-4" onClick={()=>explorer.undo(previous=>{persistRoot(restoreOptionEdits(draft,previous,distribution,optionSelection,meal.id));setLockedSeed(previous);setNotice("Se recuperó el menú anterior a la aplicación.");})}>Deshacer aplicación</button>}
    {!proposal&&explorer.count>0&&<button className="ml-2 mb-4 text-xs underline" onClick={()=>explorer.navigate(0)}>Recuperar propuestas</button>}
    {selectedOption&&<><div className={classic?"grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_290px]":"grid min-w-0 gap-4 xl:grid-cols-[210px_minmax(0,1fr)_270px]"}>
      <aside className={classic?"order-2 min-w-0":"min-w-0"}>
        <details open={needsOpen} onToggle={e=>setNeedsOpen(e.currentTarget.open)} className="rounded-2xl border border-[#dfe7df] bg-white p-4"><summary className="cursor-pointer text-sm font-semibold">{MESA_COPY.needs}<ChevronDown size={15} className="float-right"/></summary><div className="mt-3"><MealNeeds rows={rows} onSelect={code=>rows.find(r=>r.group_code===code)?.state==="excess"?reviewExcess(code):openPantry("food",code)}/></div><details className="mt-3 text-[11px] leading-5 text-[#6b7e70]"><summary className="cursor-pointer">Diferencias reales</summary><p>±{MENU_COMPARISON_TOLERANCE} eq por grupo es una tolerancia de comparación, no una valoración clínica.</p><p>Tiempo: faltan {format(diffs.missing)} · exceden {format(diffs.excess)} eq, sin compensar entre grupos.</p>{diffs.groups.map(d=><p key={d.name}>{d.name}: {d.delta>0?"+":""}{format(d.delta)} eq</p>)}<p>Día: faltan {format(dayDiffs.missing)} · exceden {format(dayDiffs.excess)} eq.</p></details></details>
      </aside>
      <main className="min-w-0"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">{MESA_COPY.menu}</h2><p className="text-xs text-[#7a8b7e]">{meal.display_name} · Opción {mealOptions.findIndex(o=>o.id===selectedOption.id)+1}: {selectedOption.name}</p></div><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={fixedMeals.includes(meal.id)} onChange={()=>preserve(meal.id,true)}/>Conservar tiempo</label></div>
        <div className="mb-4 flex flex-wrap gap-2">{!proposal&&<button disabled={loading||busy||confirmationBlocked||(!entries.length&&fixedMeals.includes(meal.id))||(selectedOption&&optionIsEligible(draft,distribution,selectedOption)&&mealOptions.length>=MAX_MEAL_OPTIONS)} className="nuth-button !px-4 !py-2 !text-sm" aria-label={!entries.length?"Proponer opción":primaryLabel==="Agregar otra opción"?`Agregar otra opción de ${meal.display_name.toLocaleLowerCase("es-MX")}`:primaryLabel} onClick={primaryAction}>{!entries.length&&<Sparkles size={14}/>} {primaryLabel}</button>}{!proposal&&primaryLabel==="Agregar otra opción"&&nextPendingTime&&<button className="text-xs underline" onClick={()=>{setActiveMealId(nextPendingTime.id);setPanel(null);}}>Siguiente pendiente: {nextPendingTime.display_name}</button>}{entries.length>0&&<><button disabled={loading||busy||fixedMeals.includes(meal.id)} className="nuth-button-secondary !px-3 !py-2 !text-xs" aria-label="Proponer opción" onClick={()=>buildProposal(meal.id)}>Completar con propuesta</button><button disabled={fixedMeals.includes(meal.id)} className="rounded-lg px-2 py-2 text-xs text-[#627969] underline underline-offset-4" onClick={()=>buildProposal(meal.id,"replace")}>Reorganizar</button></>}</div>
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
    {reviewDay&&<section className="mt-5 rounded-2xl border border-[#dce5dc] bg-white p-4"><h2 className="font-semibold">Comparación de las opciones activas</h2><div className="mt-3 grid gap-3 sm:grid-cols-2">{distribution.meal_times.map(m=><div className="rounded-xl bg-[#f5f7f0] p-3" key={m.id}><h3 className="text-sm font-semibold">{m.display_name}</h3>{variant.meal_menus.find(v=>v.meal_time_id===m.id)?.entries.map(e=><p className="mt-2 text-xs" key={e.id}>{e.name_snapshot} · {format(e.quantity)} {units[e.unit]} · {ROLE_LABELS[entryRole(e)]}</p>)}{status.rows.filter(r=>r.meal_time_id===m.id&&r.state!=="complete").map(r=><p key={r.group_code} className="mt-2 text-xs text-[#9d663e]">{getExchangeGroup(r.group_code).shortName}: {r.remaining>0?"faltan":"exceden"} {format(Math.abs(r.remaining))} eq</p>)}</div>)}</div>{observations.map(message=><p key={message} className="mt-3 text-xs text-[#856b44]">{message}</p>)}<p className="mt-3 text-xs text-[#7b887e]">Revisión del profesional: estas observaciones no califican el sabor, la saciedad ni la calidad clínica.</p></section>}
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#dce5dc] pt-5"><div><p className="text-sm font-semibold">{optionConfirmed&&portionDifferences.length?"Confirmada con diferencias":rows.every(r=>r.state==="complete")&&entries.length?"Equivalentes de esta opción cubiertos":"Opción por completar"}</p><p className="mt-1 text-xs text-[#7c8b7d]">{rows.filter(r=>r.state==="pending").length} grupos por debajo · {rows.filter(r=>r.state==="excess").length} por encima de la distribución</p></div></div></>}
    </>}
    <div className="mt-3 flex justify-end gap-3"><AutosaveFeedback status={autosave.status}/>{autosave.status==="error"&&<button className="text-sm underline" onClick={()=>void autosave.saveNow()}>Reintentar guardado</button>}</div>
    <div className="[&_footer]:static"><WorkshopStepFooter onPrevious={onGoToMeals} finalStep/></div>
    {panel&&<EditorDialog title={isPantry?"Despensa":panel==="preferences"?"Preferencias explícitas":panel==="selection"?"Selecciona qué forma la preparación":"Preparación"} onClose={closePanel}>
      {error&&<p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {isPantry&&pantry}
      {panel==="new_food"&&<CustomFoodForm busy={busy} initialGroup={groupFilter==="all"?"VEGETABLES":groupFilter} onCancel={closePanel} onCreate={input=>void saveFood(input)}/>}
      {panel==="adjust"&&selectedRecipe&&<>{isVerifiedWater(selectedRecipe)?<div><p>Agua potable sin ingredientes añadidos. Una porción de 240 ml; no completa equivalentes.</p><button className="nuth-button mt-4" onClick={()=>incorporateRecipe(selectedRecipe)}>Agregar al menú</button></div>:<RecipeAdjustPanel key={editingEntry??selectedRecipe.id} recipe={selectedRecipe} foods={allowedFoods} pending={editingEntry?calculateMenuStatus(removeMenuEntry(working,distribution,editingEntry),distribution).rows.filter(r=>r.meal_time_id===meal.id&&r.remaining>0).map(r=>({group_code:r.group_code,portions:r.remaining})):remaining} previewServings={editingEntry?entries.find(e=>e.id===editingEntry)?.quantity??1:1} mealType={meal.meal_type} busy={busy} onCancel={closePanel} onUse={incorporateRecipe} onSaveCopy={(name,recipe)=>void saveCopy(name,recipe)}/>}</>}
      {panel==="selection"&&<div><p className="mb-4 text-sm">Elige qué ingredientes pertenecen a la {kind==="drink"?"bebida":"receta"}. Lo demás permanecerá separado.</p>{entries.filter(e=>e.recipe_snapshot?.items.length||e.food_snapshot).map(e=><label className="my-3 flex items-center gap-3 rounded-xl bg-[#f5f8f2] p-3 text-sm" key={e.id}><input type="checkbox" checked={selectedIds.includes(e.id)} onChange={()=>setSelectedIds(toggle(selectedIds,e.id))}/>{e.name_snapshot} · {format(e.quantity)} {units[e.unit]}</label>)}<div className="mt-4 flex flex-wrap gap-2"><button className="nuth-button" disabled={!selectedIds.length} onClick={()=>{setRecipeSeed(expandMenuEntriesToRecipeItems(entries.filter(e=>selectedIds.includes(e.id)),foods));setPanel("new_recipe");}}>Continuar con selección</button><button className="nuth-button-secondary" onClick={()=>{setSelectedIds([]);setRecipeSeed([]);setPanel("new_recipe");}}>Crear desde cero</button></div></div>}
      {panel==="new_recipe"&&<RecipeForm foods={allowedFoods} busy={busy} kind={kind} initialItems={recipeSeed} onCancel={closePanel} onCreate={(...args)=>void createRecipe(...args)}/>}
      {panel==="preferences"&&<div><p className="text-sm text-[#6b7c6e]">Condiciones registradas por el profesional para este plan. Sin información no significa que le guste. No se interpretan notas libres.</p><input aria-label="Buscar preferencias" className="nuth-input my-4" placeholder="Buscar alimento" value={preferenceSearch} onChange={e=>setPreferenceSearch(e.target.value)}/><div className="max-h-96 space-y-2 overflow-auto">{foods.filter(f=>f.name.toLocaleLowerCase("es-MX").includes(preferenceSearch.toLocaleLowerCase("es-MX"))).map(f=><label key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f5f7f0] p-3 text-sm"><span>{f.name}</span><select aria-label={`Preferencia de ${f.name}`} className="nuth-input !w-auto !py-2" value={draft.food_preferences?.[f.id]??"unknown"} onChange={e=>{const food_preferences={...draft.food_preferences};if(e.target.value==="unknown")delete food_preferences[f.id];else food_preferences[f.id]=e.target.value as "like"|"avoid"|"exclude";explorer.invalidate();persistRoot({...draft,food_preferences,status:"editing",confirmed_at:null});}}><option value="unknown">Sin información</option><option value="like">Le gusta</option><option value="avoid">Prefiere evitar</option><option value="exclude">Excluido</option></select></label>)}</div><p className="mt-4 text-xs">Las exclusiones se respetan al proponer, agregar e intercambiar. Si ya existe un alimento excluido, se señala en Ver el día; no se elimina automáticamente.</p></div>}
    </EditorDialog>}
    {savedRecipe&&<EditorDialog title="Preparación guardada" onClose={()=>setSavedRecipe(null)}><h3 className="font-semibold">¿Usar “{savedRecipe.recipe.name}” en el menú?</h3><p className="mt-2 text-sm">Ya está en tu biblioteca. Usarla reemplaza únicamente los elementos seleccionados; no duplica sus ingredientes.</p>{savedRecipe.preview&&!proposal&&<p role="alert" className="mt-3 text-sm text-amber-800">La propuesta ya no está vigente. Puedes agregar esta preparación desde la despensa al abrir una nueva exploración.</p>}<div className="mt-4 flex gap-2"><button className="nuth-button-secondary" onClick={()=>setSavedRecipe(null)}>No</button><button className="nuth-button" disabled={savedRecipe.preview&&!proposal} onClick={()=>{const next=savedRecipe.editingEntry?replaceRecipeMenuEntry(working,distribution,savedRecipe.editingEntry,savedRecipe.recipe):savedRecipe.entries.length?replaceMenuEntriesWithRecipe(working,distribution,savedRecipe.meal,savedRecipe.entries,savedRecipe.recipe):addRecipeToMenu(working,distribution,savedRecipe.meal,savedRecipe.recipe);change(next);setSavedRecipe(null);}}>Sí</button></div></EditorDialog>}
  </section>;
}
