import { useMemo, useState } from "react";
import { ChevronRight, Plus, Search, Trash2, X, Check, AlertTriangle, Circle } from "lucide-react";
import { exchangeCatalog, getExchangeGroup } from "@/src/features/exchanges/catalog";
import { adjustRecipeIngredients, calculateMenuStatus, createFoodSnapshot, exchangeContributionForFood, initialFoodAmount, practicalFoodQuantity, recipeIngredientsChanged, replaceRecipeIngredient, scoreRecipeCompatibility, type RecipeCompatibilityRestriction } from "@/src/features/menu/model";
import { generateRecipeName } from "@/src/features/menu/recipeName";
import { foodMatchesSearch, recipeMatchesSearch, type CustomFoodInput, type RecipeDraftItem } from "@/src/services/foodCatalog";
import type { ExchangeGroupCode, FoodItem, FoodUnitCode, MealType, Recipe } from "@/src/types/domain";
import { isDrink, isVerifiedWater, recipeHasKnownContributions } from "@/src/features/menu/mesa";
import { isFoodRestricted } from "@/src/features/menu/planner";
import { foodUnitLabels, formatFoodQuantity } from "@/src/features/menu/units";
const unitLabels = foodUnitLabels;
const emptyFood: CustomFoodInput = {
  name: "", group_code: "VEGETABLES", portion_amount: 1, portion_unit: "g", portion_description: "",
};
const format = formatFoodQuantity;

type FoodCatalogFilter = "all" | "vegetables" | "fruits" | "cereals" | "legumes" | "aoa" | "milk" | "fats";
type RecipeCatalogFilter = "all" | "best" | Extract<MealType, "BREAKFAST" | "MAIN_MEAL" | "DINNER">;

const foodCatalogFilters: Array<{ id: FoodCatalogFilter; label: string; groups: ExchangeGroupCode[] }> = [
  { id: "all", label: "Todos", groups: [] },
  { id: "vegetables", label: "Verduras", groups: ["VEGETABLES"] },
  { id: "fruits", label: "Frutas", groups: ["FRUITS"] },
  { id: "cereals", label: "Cereales", groups: ["CEREALS_NO_FAT", "CEREALS_WITH_FAT"] },
  { id: "legumes", label: "Leguminosas", groups: ["LEGUMES"] },
  { id: "aoa", label: "AOA", groups: ["AOA_VERY_LOW_FAT", "AOA_LOW_FAT", "AOA_MODERATE_FAT", "AOA_HIGH_FAT"] },
  { id: "milk", label: "Leches", groups: ["MILK_SKIM", "MILK_SEMI_SKIM", "MILK_WHOLE", "MILK_WITH_SUGAR"] },
  { id: "fats", label: "Grasas", groups: ["FATS_NO_PROTEIN", "FATS_WITH_PROTEIN"] },
];
const recipeCatalogFilters: Array<{ id: RecipeCatalogFilter; label: string }> = [
  { id: "all", label: "Todas" },
  { id: "best", label: "Mejor ajuste" },
  { id: "BREAKFAST", label: "Desayuno" },
  { id: "MAIN_MEAL", label: "Comida" },
  { id: "DINNER", label: "Cena" },
];

function initialFoodFilter(groupCode: ExchangeGroupCode | "all"): FoodCatalogFilter {
  return foodCatalogFilters.find((filter) => filter.groups.includes(groupCode as ExchangeGroupCode))?.id ?? "all";
}

export function MealNeeds({ rows, onSelect }: {
  rows: ReturnType<typeof calculateMenuStatus>["rows"];
  onSelect: (code: ExchangeGroupCode) => void;
}) {
  if (!rows.length) return <p className="rounded-xl bg-[#f4f7f4] p-4 text-sm text-[#6b7b73]">Este tiempo no tiene equivalentes asignados.</p>;
  return <div className="space-y-2">{rows.map((row) => {
    const group = getExchangeGroup(row.group_code);
    return <button key={row.group_code} type="button" onClick={() => onSelect(row.group_code)} className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left ${row.state === "complete" ? "border-[#d8e7dc] bg-[#f1f7f2]" : row.state === "excess" ? "border-[#efc9c1] bg-[#fff4f1]" : "border-[#eadbb7] bg-[#fffbef]"}`}>
      {row.state === "complete" ? <Check size={17} className="shrink-0" /> : row.state === "excess" ? <AlertTriangle size={17} className="shrink-0" /> : <Circle size={15} className="shrink-0" />}<span className="min-w-0"><span className="block text-sm font-semibold text-[#315449]">{group.shortName}</span><span className={`text-xs ${row.state === "excess" ? "text-[#a64a3d]" : "text-[#718078]"}`}>{row.state === "complete" ? "Cubierto" : row.state === "excess" ? `Excede ${format(-row.remaining)}` : `Falta ${format(row.remaining)}`}</span></span>
      <span className="shrink-0 text-xs font-semibold text-[#52675e]">{format(row.used)} / {format(row.portions)}</span>
    </button>;
  })}</div>;
}

export function CustomFoodForm({ initialGroup, busy, onCancel, onCreate }: {
  initialGroup: ExchangeGroupCode;
  busy: boolean;
  onCancel: () => void;
  onCreate: (food: CustomFoodInput) => void;
}) {
  const [form, setForm] = useState<CustomFoodInput>({ ...emptyFood, group_code: initialGroup });
  const valid = form.name.trim() && form.portion_description.trim() && form.portion_amount > 0;
  return <div className="rounded-2xl border border-[#cfdcd4] bg-[#f9fbf8] p-4">
    <div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-[#24463b]">Alimento personalizado</h3><p className="mt-1 text-xs text-[#718078]">Quedará identificado como dato creado por ti.</p></div><button type="button" aria-label="Cerrar alimento personalizado" onClick={onCancel}><X size={18} /></button></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-xs font-semibold text-[#52675e] sm:col-span-2">Nombre<input className="nuth-input mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
      <label className="text-xs font-semibold text-[#52675e]">Grupo<select className="nuth-input mt-1" value={form.group_code} onChange={(e) => setForm({ ...form, group_code: e.target.value as ExchangeGroupCode })}>{exchangeCatalog.map((group) => <option key={group.groupCode} value={group.groupCode}>{group.groupName}</option>)}</select></label>
      <label className="text-xs font-semibold text-[#52675e]">Unidad<select className="nuth-input mt-1" value={form.portion_unit} onChange={(e) => setForm({ ...form, portion_unit: e.target.value as FoodUnitCode })}>{Object.entries(unitLabels).filter(([code]) => code !== "recipe_serving").map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
      <label className="text-xs font-semibold text-[#52675e]">Cantidad equivalente<input type="number" min="0.001" step="0.5" className="nuth-input mt-1" value={form.portion_amount} onChange={(e) => setForm({ ...form, portion_amount: Number(e.target.value) })} /></label>
      <label className="text-xs font-semibold text-[#52675e]">Descripción para el paciente<input className="nuth-input mt-1" placeholder="Ej. ½ taza" value={form.portion_description} onChange={(e) => setForm({ ...form, portion_description: e.target.value })} /></label>
    </div>
    <details className="mt-3 text-sm text-[#65756d]"><summary className="cursor-pointer font-semibold">Nutrición y atributos opcionales</summary><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{(["energy_kcal", "carbohydrate_g", "protein_g", "fat_g", "fiber_g", "sodium_mg"] as const).map((key) => <label key={key} className="text-xs">{{ energy_kcal: "kcal", carbohydrate_g: "CHO g", protein_g: "Proteína g", fat_g: "Grasa g", fiber_g: "Fibra g", sodium_mg: "Sodio mg" }[key]}<input type="number" min="0" step="0.1" className="nuth-input mt-1" value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value === "" ? null : Number(e.target.value) })} /></label>)}</div><div className="mt-3 grid gap-2 sm:grid-cols-2">{(["gluten", "lactose"] as const).map((attribute) => <label key={attribute} className="text-xs font-semibold text-[#52675e]">{attribute === "gluten" ? "Gluten" : "Lactosa"}<select className="nuth-input mt-1" value={form.attributes?.[attribute] ?? "unknown"} onChange={(e) => setForm({ ...form, attributes: { ...form.attributes, [attribute]: e.target.value as "unknown" | "contains" | "free" } })}><option value="unknown">Sin verificar</option><option value="contains">Contiene</option><option value="free">Libre</option></select></label>)}</div><p className="mt-2 text-xs">Los atributos se registran por alimento; no se excluye un grupo completo.</p></details>
    <div className="mt-4 flex justify-end gap-2"><button type="button" className="nuth-button-secondary" onClick={onCancel}>Cancelar</button><button type="button" className="nuth-button" disabled={!valid || busy} onClick={() => onCreate(form)}>Guardar alimento</button></div>
  </div>;
}

export function BrowserPanel({ mode, foods, recipes, groupCode, required, mealType, busy, restrictions = {}, usedFoodIds = [], onClose, onFood, onRecipe, onNewFood, onNewRecipe }: {
  mode: "food" | "recipe" | "drink";
  restrictions?: RecipeCompatibilityRestriction;
  usedFoodIds?: string[];
  foods: FoodItem[];
  recipes: Recipe[];
  groupCode: ExchangeGroupCode | "all";
  required: Array<{ group_code: ExchangeGroupCode; portions: number }>;
  mealType: MealType;
  busy: boolean;
  onClose: () => void;
  onFood: (food: FoodItem, amount: number) => void;
  onRecipe: (recipe: Recipe) => void;
  onNewFood: () => void;
  onNewRecipe: () => void;
}) {
  const [search, setSearch] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const pendingGroup = required.find(row => row.group_code === groupCode);
  const foodAmount = (food: FoodItem) => quantities[food.id] ?? initialFoodAmount(food, pendingGroup);
  const [foodFilter, setFoodFilter] = useState<FoodCatalogFilter>(() => initialFoodFilter(groupCode));
  const [exactGroup, setExactGroup] = useState<ExchangeGroupCode | null>(() => groupCode === "all" ? null : groupCode);
  const [recipeFilter, setRecipeFilter] = useState<RecipeCatalogFilter>("all");
  const selectedFoodGroups = exactGroup ? [exactGroup] : foodCatalogFilters.find((filter) => filter.id === foodFilter)?.groups ?? [];
  const mismatch = (food: FoodItem) => {
    const need = required.find(r=>r.group_code===food.group_code)?.portions ?? 1;
    return Math.abs(practicalFoodQuantity(need*Number(food.portion_amount),food.portion_unit)/Number(food.portion_amount)-need);
  };
  const visibleFoods = foods.filter((food) => food.active && !isFoodRestricted(food, restrictions) && (!selectedFoodGroups.length || selectedFoodGroups.includes(food.group_code)) && (foodMatchesSearch(food, search) || getExchangeGroup(food.group_code).groupName.toLocaleLowerCase("es-MX").includes(search.toLocaleLowerCase("es-MX"))))
    .sort((a,b) => Number(required.some(r=>r.group_code===b.group_code && r.portions>0.1))-Number(required.some(r=>r.group_code===a.group_code && r.portions>0.1))
      || Math.floor(mismatch(a)*10)-Math.floor(mismatch(b)*10)
      || Number(restrictions.avoidedFoodIds?.includes(a.id) ?? false)-Number(restrictions.avoidedFoodIds?.includes(b.id) ?? false)
      || Number(restrictions.likedFoodIds?.includes(b.id) ?? false)-Number(restrictions.likedFoodIds?.includes(a.id) ?? false)
      || Number(usedFoodIds.includes(a.id))-Number(usedFoodIds.includes(b.id))
      || b.use_count-a.use_count || a.name.localeCompare(b.name,"es-MX"));
  const visibleRecipes = recipes
    .filter((recipe) => isDrink(recipe) === (mode === "drink") && recipeHasKnownContributions(recipe) && ((recipeFilter === "all" || recipeFilter === "best") || recipe.meal_types.includes(recipeFilter)) && recipeMatchesSearch(recipe, search))
    .map((recipe) => ({ recipe, match: scoreRecipeCompatibility({ pendingExchanges: required, recipe, mealType, restrictions }) }))
    .filter(({match}) => !match.blocked)
    .filter(({ match }) => recipeFilter !== "best" || (!match.blocked && match.covered > 0 && match.excess <= 0.5 && match.label !== "Poco compatible"))
    .sort((a, b) => b.match.score - a.match.score || a.recipe.name.localeCompare(b.recipe.name, "es-MX"));
  const recommendedRecipes = visibleRecipes.filter(({ match }) => !match.blocked && match.covered > 0 && match.excess <= 0.5 && match.label !== "Poco compatible");
  const otherRecipes = visibleRecipes.filter(({ recipe }) => !recommendedRecipes.some((candidate) => candidate.recipe.id === recipe.id));
  const recipeCard = ({ recipe, match }: (typeof visibleRecipes)[number]) => isVerifiedWater(recipe) ? <div key={recipe.id} className="rounded-xl border border-[#dce7ec] bg-sky-50/30 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold">{recipe.name}</p><p className="mt-2 text-xs text-[#526b78]">Bebida opcional · sin aporte en equivalentes. No completa ni modifica los grupos pendientes.</p></div><button type="button" className="nuth-button !px-3 !py-2" onClick={()=>onRecipe(recipe)}>Revisar</button></div></div> : <div key={recipe.id} className="rounded-xl border border-[#e0e7e2] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-[#315449]">{recipe.name}</p><p className="mt-1 text-xs font-semibold text-[#477363]">{match.label}</p><p className="mt-1 text-xs text-[#718078]">Cubre {format(match.covered)} de {format(match.covered + match.missing)} equivalentes · {recipe.items.length} ingredientes</p><div className="mt-2 flex flex-wrap gap-1">{match.coveredGroups.slice(0, 3).map((code) => <span key={code} className="rounded-full bg-[#edf5ef] px-2 py-0.5 text-[10px] font-semibold text-[#35624e]">✓ {getExchangeGroup(code).shortName}</span>)}{match.missingGroups.slice(0, 2).map((item) => <span key={item.group_code} className="rounded-full bg-[#fff7e7] px-2 py-0.5 text-[10px] font-semibold text-[#8a692d]">Falta {format(item.portions)} {getExchangeGroup(item.group_code).shortName}</span>)}</div><span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${recipe.is_custom ? "bg-[#f2eee3] text-[#75623d]" : "bg-[#e8f3eb] text-[#35624e]"}`}>{recipe.is_custom ? "Personal" : "Receta Nuthrick"}</span>{match.excess > 0 && <p className="mt-1 text-xs text-[#a64a3d]">Excede {format(match.excess)} equivalentes.</p>}</div><button type="button" className="nuth-button !px-3 !py-2" onClick={() => onRecipe(recipe)}>Revisar</button></div></div>;
  return <div className="rounded-2xl border border-[#bfd1c6] bg-white p-4 shadow-[0_18px_45px_rgba(23,61,54,.12)]">
    <div className="flex items-center justify-between"><div><h3 className="font-semibold text-[#24463b]">{mode === "food" ? exactGroup ? `Alimentos · ${getExchangeGroup(exactGroup).shortName}` : "Agregar alimento" : mode === "drink" ? "Bebidas" : "Agregar receta"}</h3><p className="mt-1 text-xs text-[#718078]">Catálogo base de Nuthrick y contenido creado por ti</p></div><button type="button" aria-label="Cerrar buscador" onClick={onClose}><X size={19} /></button></div>
    <label className="relative mt-4 block"><Search className="absolute left-3 top-3 text-[#829087]" size={16} /><input className="nuth-input !pl-9" placeholder={mode === "food" ? "Buscar alimento" : "Buscar receta"} value={search} onChange={(e) => setSearch(e.target.value)} /></label>
    <div aria-label={mode === "food" ? "Filtros de alimentos" : "Filtros de recetas"} className="mt-3 flex gap-2 overflow-x-auto pb-1">
      {mode === "food" ? exactGroup ? <button type="button" className="shrink-0 rounded-full bg-[#f1f5f1] px-3 py-1.5 text-xs font-semibold text-[#52675e]" onClick={() => { setExactGroup(null); setFoodFilter("all"); }}>Ver otros grupos</button> : foodCatalogFilters.map((filter) => <button key={filter.id} type="button" aria-pressed={foodFilter === filter.id} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${foodFilter === filter.id ? "bg-[#173d36] text-white" : "bg-[#f1f5f1] text-[#52675e]"}`} onClick={() => setFoodFilter(filter.id)}>{filter.label}</button>) : recipeCatalogFilters.map((filter) => <button key={filter.id} type="button" aria-pressed={recipeFilter === filter.id} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${recipeFilter === filter.id ? "bg-[#173d36] text-white" : "bg-[#f1f5f1] text-[#52675e]"}`} onClick={() => setRecipeFilter(filter.id)}>{filter.label}</button>)}
    </div>
    <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
      {mode === "food" ? visibleFoods.map((food) => <div key={food.id} className="rounded-xl border border-[#e0e7e2] p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-[#315449]">{food.name}</p><p className="mt-1 text-xs text-[#477363]">{required.some(r => r.group_code === food.group_code && r.portions > .1) ? `Cubre ${getExchangeGroup(food.group_code).shortName.toLocaleLowerCase("es-MX")} pendientes` : usedFoodIds.includes(food.id) ? "Usa ingredientes ya presentes en el día" : "Opción general editable"}{restrictions.avoidedFoodIds?.includes(food.id) ? " · Prefiere evitar" : restrictions.likedFoodIds?.includes(food.id) ? " · Le gusta" : ""}</p><p className="mt-1 text-xs text-[#718078]">1 equivalente · {food.portion_description} · {getExchangeGroup(food.group_code).shortName}</p><span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${food.is_custom ? "bg-[#f2eee3] text-[#75623d]" : "bg-[#e8f3eb] text-[#35624e]"}`}>{food.is_custom ? "Personalizado" : "Catálogo Nuthrick"}</span></div><div className="flex shrink-0 items-center gap-2"><input aria-label={`Cantidad de ${food.name}`} type="number" min="0.001" step="0.5" className="nuth-input !w-20 !py-2" value={foodAmount(food)} onChange={(e) => setQuantities({ ...quantities, [food.id]: Number(e.target.value) })} /><button type="button" className="nuth-button !px-3 !py-2" onClick={() => onFood(food, foodAmount(food))}>Agregar</button></div></div></div>) : <>{recommendedRecipes.length > 0 && <div><p className="mb-2 text-[11px] font-bold uppercase tracking-[.12em] text-[#477363]">Recomendadas</p><div className="space-y-2">{recommendedRecipes.map(recipeCard)}</div></div>}{otherRecipes.length > 0 && <div className="pt-2"><p className="mb-2 text-[11px] font-bold uppercase tracking-[.12em] text-[#7b8781]">{mode==="drink"?"Otras bebidas":"Otras recetas"}</p><div className="space-y-2">{otherRecipes.map(recipeCard)}</div></div>}</>}
      {((mode === "food" && !visibleFoods.length) || (mode !== "food" && !visibleRecipes.length)) && <p className="rounded-xl bg-[#f7f9f7] p-4 text-center text-sm text-[#718078]">No hay resultados todavía.</p>}
    </div>
    <button type="button" className="nuth-button-secondary mt-3 w-full justify-center" disabled={busy} onClick={mode === "food" ? onNewFood : onNewRecipe}><Plus size={15} /> {mode === "food" ? "Agregar alimento personalizado" : mode === "drink" ? "Crear bebida" : "Crear receta"}</button>
  </div>;
}

/** The same exact-group selector is used by proposed foods and recipe ingredients. */
export function FoodExchangeSelector({ food, foods, onSelect, className = "" }: {
  food: Pick<FoodItem, "id" | "name" | "group_code">;
  foods: FoodItem[];
  onSelect: (food: FoodItem) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const alternatives = foods
    .filter((candidate) => candidate.active && candidate.group_code === food.group_code)
    .sort((a, b) => a.name.localeCompare(b.name, "es-MX"));

  return <div className={`relative min-w-0 ${className}`}>
    <button type="button" aria-label={`Intercambiar ${food.name}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="-mx-1 flex min-w-0 cursor-pointer items-center gap-1 rounded-lg px-1 py-0.5 text-left text-sm font-semibold text-[#315449] transition-colors hover:bg-[#edf5ef] hover:text-[#173d36] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#79a792]">
      <span className="truncate">{food.name}</span><ChevronRight size={15} className="shrink-0 text-[#789087]" />
    </button>
    {open && <div role="listbox" aria-label={`Alternativas para ${food.name}`} className="absolute left-0 top-[calc(100%+.4rem)] z-30 max-h-56 min-w-56 overflow-y-auto rounded-xl border border-[#bfd1c6] bg-white p-2 shadow-[0_14px_32px_rgba(23,61,54,.16)]">
      <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[.1em] text-[#54776a]">Intercambiar {getExchangeGroup(food.group_code).shortName}</p>
      {alternatives.map((candidate) => <button key={candidate.id} type="button" role="option" aria-selected={candidate.id === food.id} className={`block w-full rounded-lg px-2 py-2 text-left text-sm ${candidate.id === food.id ? "bg-[#edf5ef] font-semibold text-[#315449]" : "text-[#52675e] hover:bg-[#f5f8f5]"}`} onClick={() => { onSelect(candidate); setOpen(false); }}>{candidate.name}<span className="ml-2 text-[11px] text-[#7b8982]">{candidate.portion_description}</span></button>)}
      {!alternatives.length && <p className="px-2 py-3 text-xs text-[#718078]">No hay alternativas de este grupo.</p>}
    </div>}
  </div>;
}

export function RecipeForm({ foods, busy, initialItems = [], submitLabel = "Guardar en mi biblioteca", kind = "recipe", context = "Los ingredientes corresponden al rendimiento total. Guardar en biblioteca no modifica el menú.", onCancel, onCreate }: {
  foods: FoodItem[];
  busy: boolean;
  initialItems?: RecipeDraftItem[];
  submitLabel?: string;
  context?: string;
  kind?: "recipe" | "drink";
  onCancel: () => void;
  onCreate: (name: string, items: RecipeDraftItem[], description: string, instructions: string, substitutions: string, servings: number) => void;
}) {
  const [manualName, setManualName] = useState("");
  const [nameMode, setNameMode] = useState<"auto" | "manual">("auto");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [substitutions, setSubstitutions] = useState("");
  const [foodId, setFoodId] = useState(foods[0]?.id ?? "");
  const [amount, setAmount] = useState(Number(foods[0]?.portion_amount ?? 1));
  const [items, setItems] = useState<RecipeDraftItem[]>(initialItems);
  const [servings, setServings] = useState(1);
  const selected = foods.find((food) => food.id === foodId);
  const autoName = useMemo(() => generateRecipeName(items.map((item) => item.food)), [items]);
  const name = nameMode === "manual" ? manualName : autoName;
  return <div className="rounded-2xl border border-[#cfdcd4] bg-[#f9fbf8] p-4"><div className="flex items-center justify-between gap-3"><div><h3 className="font-semibold text-[#24463b]">Crear receta</h3><p className="mt-1 max-w-2xl text-xs leading-5 text-[#718078]">{context}</p></div><button type="button" aria-label="Cerrar receta" onClick={onCancel}><X size={18} /></button></div>
    <p className="mt-2 text-xs text-[#52675e]">{kind === "drink" ? "Bebida personal · opcional" : "Receta personal"}</p>
    <label className="mt-4 block text-xs font-semibold text-[#52675e]">Nombre<input className="nuth-input mt-1" value={name} onChange={(e) => { setManualName(e.target.value); setNameMode("manual"); }} /></label>
    <label className="mt-3 block text-xs font-semibold text-[#52675e]">Rendimiento (porciones)<input type="number" min="0.001" step="1" className="nuth-input mt-1" value={servings} onChange={e=>setServings(Number(e.target.value))}/></label>
    <label className="mt-3 block text-xs font-semibold text-[#52675e]">Descripción opcional<input className="nuth-input mt-1" placeholder="Ej. Desayuno rápido con fruta" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_110px_auto]"><select aria-label="Alimento de la receta" className="nuth-input" value={foodId} onChange={(e) => { const food = foods.find((item) => item.id === e.target.value); setFoodId(e.target.value); setAmount(Number(food?.portion_amount ?? 1)); }}>{foods.map((food) => <option key={food.id} value={food.id}>{food.name}</option>)}</select><input aria-label="Cantidad del ingrediente" type="number" min="0.001" step="0.5" className="nuth-input" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /><button type="button" className="nuth-button-secondary justify-center" disabled={!selected || amount <= 0} onClick={() => selected && setItems([...items, { food: selected, amount }])}>Añadir</button></div>
    <div className="mt-3 space-y-2">{items.map((item, index) => <div key={`${item.food.id}-${index}`} className="rounded-xl bg-white p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span>{format(item.amount)} {unitLabels[item.food.portion_unit]} · {item.food.name}</span><button type="button" aria-label={`Quitar ${item.food.name}`} onClick={() => setItems(items.filter((_,current)=>current!==index))}><Trash2 size={15}/></button></div><div className="mt-2 flex flex-wrap gap-2"><input aria-label={`Cantidad de ingrediente ${item.food.name}`} type="number" min=".001" step=".5" className="nuth-input !w-24 !py-2" value={item.amount} onChange={e=>setItems(items.map((it,i)=>i===index?{...it,amount:Number(e.target.value)}:it))}/><FoodExchangeSelector food={item.food} foods={foods} onSelect={replacement=>setItems(items.map((it,i)=>i===index?{food:replacement,amount:practicalFoodQuantity(it.amount/Number(it.food.portion_amount)*Number(replacement.portion_amount),replacement.portion_unit)}:it))}/></div><p className="mt-2 text-xs text-[#718078]">{format(item.amount/Number(item.food.portion_amount))} eq · {getExchangeGroup(item.food.group_code).shortName} · {format(item.amount/Math.max(servings,.001))} {unitLabels[item.food.portion_unit]} por ración</p></div>)}</div>
    <label className="mt-3 block text-xs font-semibold text-[#52675e]">Instrucciones opcionales<textarea className="nuth-input mt-1 min-h-24 resize-y" placeholder="Preparación que podrá ver el paciente en una fase posterior" value={instructions} onChange={(e) => setInstructions(e.target.value)} /></label>
    <label className="mt-3 block text-xs font-semibold text-[#52675e]">Sustituciones opcionales<textarea className="nuth-input mt-1 min-h-16 resize-y" placeholder="Ej. Puede usarse tortilla en lugar de pan" value={substitutions} onChange={(e) => setSubstitutions(e.target.value)} /></label>
    {!foods.length && <p className="mt-3 rounded-xl bg-[#fff5e5] p-3 text-sm text-[#765827]">Crea primero un alimento personalizado para componer la receta.</p>}
    <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" className="nuth-button-secondary" onClick={onCancel}>Cancelar</button><button type="button" className="nuth-button" disabled={!name.trim() || !items.length || items.some(item=>!Number.isFinite(item.amount)||item.amount<=0) || !Number.isFinite(servings) || servings <= 0 || busy} onClick={() => onCreate(name, items, description, instructions, substitutions, servings)}>{submitLabel}</button></div>
  </div>;
}

export function RecipeAdjustPanel({ recipe, foods, pending, mealType, busy, previewServings = 1, onCancel, onUse, onSaveCopy }: {
  recipe: Recipe;
  foods: FoodItem[];
  pending: Array<{ group_code: ExchangeGroupCode; portions: number }>;
  mealType: MealType;
  busy: boolean;
  previewServings?: number;
  onCancel: () => void;
  onUse: (recipe: Recipe) => void;
  onSaveCopy: (name: string, recipe: Recipe) => void;
}) {
  const [working, setWorking] = useState(recipe);
  const [amounts, setAmounts] = useState<Record<string, number>>(() => Object.fromEntries(recipe.items.map((item) => [item.id, Number(item.amount)])));
  const [newIngredient, setNewIngredient] = useState("");
  const [askCopy, setAskCopy] = useState(false);
  const [copyName, setCopyName] = useState(`${recipe.name} — copia`);
  const adjusted = useMemo(() => adjustRecipeIngredients(working, amounts), [amounts, working]);
  const changed = recipeIngredientsChanged(recipe, adjusted);
  const match = useMemo(() => scoreRecipeCompatibility({ pendingExchanges: pending, recipe: { ...adjusted, servings: Number(adjusted.servings) / previewServings }, mealType }), [adjusted, mealType, pending, previewServings]);
  const valid = adjusted.name.trim() && adjusted.items.length > 0 && adjusted.items.every((item) => Number.isFinite(amounts[item.id]) && amounts[item.id] > 0);

  return <div className="rounded-2xl border border-[#bfd1c6] bg-[#f9fbf8] p-4 shadow-[0_18px_45px_rgba(23,61,54,.12)]">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[.12em] text-[#477363]">Agregar receta</p><h3 className="mt-1 font-semibold text-[#24463b]">{recipe.name}</h3><p className="mt-1 text-xs text-[#718078]">Revisa las cantidades antes de incorporarla al plan.</p></div><button type="button" aria-label="Cerrar ajuste de receta" onClick={onCancel}><X size={19} /></button></div>
    <p className="mt-3 text-xs">Cantidades del rendimiento total: {working.servings} porciones. En este tiempo: {previewServings} porciones.</p><p className="mt-1 text-xs">Los intercambios se redondean a medidas prácticas; Consume y Por completar muestran el aporte real resultante.</p><div className="mt-4 space-y-2">{adjusted.items.map((item) => <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_75px_auto] items-center gap-2 rounded-xl bg-white px-3 py-2"><div className="min-w-0"><FoodExchangeSelector food={{ id: item.food_item_id ?? item.food_snapshot.id, name: item.food_snapshot.name, group_code: item.food_snapshot.group_code }} foods={foods} onSelect={(replacement) => {
      const next = replaceRecipeIngredient(adjusted, item.id, replacement);
      const nextItem = next.items.find((candidate) => candidate.id === item.id);
      setWorking(next);
      if (nextItem) setAmounts((current) => ({ ...current, [item.id]: Number(nextItem.amount) }));
    }} /><span className="mt-0.5 block text-[11px] font-normal text-[#78867f]">{format(item.exchange_contribution[0]?.portions ?? 0)} {getExchangeGroup(item.food_snapshot.group_code).shortName}</span></div><input aria-label={`Cantidad de ${item.food_snapshot.name}`} type="number" min="0.001" step="0.5" className="nuth-input !py-2" value={amounts[item.id]} onChange={(event) => setAmounts({ ...amounts, [item.id]: Number(event.target.value) })} /><div className="flex flex-col items-center gap-1"><span className="text-xs text-[#718078]">{unitLabels[item.unit]}</span><button type="button" aria-label={`Quitar ingrediente ${item.food_snapshot.name}`} className="p-1 text-[#aa5546]" onClick={()=>setWorking({...adjusted,items:adjusted.items.filter(i=>i.id!==item.id)})}><Trash2 size={14}/></button></div></div>)}</div>
    <div className="mt-3 flex flex-wrap gap-2"><select aria-label="Nuevo ingrediente de la preparación" className="nuth-input min-w-0 flex-1" value={newIngredient} onChange={e=>setNewIngredient(e.target.value)}><option value="">Selecciona un ingrediente</option>{foods.map(food=><option value={food.id} key={food.id}>{food.name}</option>)}</select><button type="button" className="nuth-button-secondary !text-xs" disabled={!newIngredient} onClick={()=>{const food=foods.find(f=>f.id===newIngredient);if(!food)return;const id=crypto.randomUUID();const amount=Number(food.portion_amount);setWorking({...adjusted,items:[...adjusted.items,{id,owner_id:null,recipe_id:recipe.id,food_item_id:food.id,amount,unit:food.portion_unit,display_order:adjusted.items.length,food_snapshot:createFoodSnapshot(food),exchange_contribution:exchangeContributionForFood(food,amount),created_at:""}]});setAmounts({...amounts,[id]:amount});setNewIngredient("");}}>Agregar ingrediente</button></div>
    <div className="mt-4 grid gap-3 rounded-xl border border-[#dce7df] bg-white p-3 sm:grid-cols-2"><div><p className="text-[11px] font-bold uppercase tracking-[.1em] text-[#718078]">Consume</p><p className="mt-1 text-xs leading-5 text-[#52675e]">{match.contributions.map((item) => `${format(item.portions)} ${getExchangeGroup(item.group_code).shortName}`).join(" · ") || "Sin equivalentes"}</p></div><div><p className="text-[11px] font-bold uppercase tracking-[.1em] text-[#718078]">Después de agregar</p><p className={`mt-1 text-xs font-semibold ${match.excess > 0 ? "text-[#a64a3d]" : "text-[#35624e]"}`}>{match.label} · faltan {format(match.missing)} · excede {format(match.excess)}</p></div></div>
    <details className="mt-4 text-sm"><summary className="cursor-pointer">Nombre, preparación y notas</summary><label className="mt-3 block text-xs">Nombre de la preparación<input className="nuth-input mt-1" value={working.name} onChange={e=>setWorking({...working,name:e.target.value})}/></label><label className="mt-3 block text-xs">Preparación<textarea className="nuth-input mt-1" value={working.instructions??""} onChange={e=>setWorking({...working,instructions:e.target.value})}/></label><label className="mt-3 block text-xs">Sustituciones o notas<textarea className="nuth-input mt-1" value={working.substitution_notes??""} onChange={e=>setWorking({...working,substitution_notes:e.target.value})}/></label></details>
    {askCopy && changed ? <div className="mt-4 rounded-xl bg-[#fff7e7] p-3"><p className="text-sm font-semibold text-[#6d572c]">¿Guardar estos ajustes como una nueva receta?</p><p className="mt-1 text-xs text-[#806d49]">La receta de la biblioteca permanecerá intacta.</p><input aria-label="Nombre de la copia" className="nuth-input mt-3" value={copyName} onChange={(event) => setCopyName(event.target.value)} /><div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" className="nuth-button-secondary" disabled={!valid} onClick={() => onUse(adjusted)}>No, sólo este plan</button><button type="button" className="nuth-button" disabled={!valid || !copyName.trim() || busy} onClick={() => onSaveCopy(copyName.trim(), adjusted)}>Guardar copia</button></div></div> : <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" className="nuth-button-secondary" onClick={onCancel}>Cancelar</button><button type="button" className="nuth-button" disabled={!valid || busy} onClick={() => changed ? setAskCopy(true) : onUse(adjusted)}>Agregar al menú</button></div>}
  </div>;
}
