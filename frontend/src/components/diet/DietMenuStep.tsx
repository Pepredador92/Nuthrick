import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Apple, Check, ChefHat, ChevronRight, Pencil, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import { exchangeCatalog, getExchangeGroup } from "@/src/features/exchanges/catalog";
import {
  activeMenu,
  addFoodToMenu,
  addRecipeToMenu,
  adjustRecipeIngredients,
  calculateMenuStatus,
  confirmDietMenu,
  createDietMenu,
  reconcileDietMenu,
  recipeIngredientsChanged,
  replaceFoodEntriesWithRecipe,
  replaceFoodMenuEntry,
  replaceRecipeIngredient,
  removeMenuEntry,
  sameMealDistribution,
  scoreRecipeCompatibility,
  replaceRecipeMenuEntry,
  updateMenuEntryQuantity,
  updateRecipeMenuEntryIngredients,
} from "@/src/features/menu/model";
import { proposeDietMenu, type MenuPlanningMode, type MenuProposal, type MenuProposalMeal } from "@/src/features/menu/planner";
import { generateRecipeName } from "@/src/features/menu/recipeName";
import {
  createCustomFood,
  createCustomRecipe,
  foodMatchesSearch,
  listFoodItems,
  listRecipes,
  recipeMatchesSearch,
  type CustomFoodInput,
  type RecipeDraftItem,
} from "@/src/services/foodCatalog";
import type { DietMenu, DietMenuEntry, ExchangeGroupCode, FoodItem, FoodUnitCode, MealType, NutritionPlan, Recipe } from "@/src/types/domain";
import { WorkshopStepFooter } from "./WorkshopStepFooter";
import { AutosaveFeedback } from "./AutosaveFeedback";
import { useChangeAutosave } from "./useChangeAutosave";

type Props = {
  plan: NutritionPlan;
  onSave: (menu: DietMenu) => Promise<void>;
  onDraftChange?: (menu: DietMenu) => void;
  onGoToMeals: () => void;
  catalog?: { foods: FoodItem[]; recipes: Recipe[] };
};

type ProposalRecipeDraft = { mealTimeId: string; entries: DietMenuEntry[] };
type CreatedProposalRecipe = ProposalRecipeDraft & { recipe: Recipe };
type ProposalRecipeEdit = { mealTimeId: string; entryId: string; recipe: Recipe };

const unitLabels: Record<FoodUnitCode | "recipe_serving", string> = {
  g: "g", ml: "ml", piece: "pieza", cup: "taza", tablespoon: "cucharada",
  teaspoon: "cucharadita", slice: "rebanada", tortilla: "tortilla", glass: "vaso",
  serving: "porción", unit: "unidad", recipe_serving: "porción",
};
const emptyFood: CustomFoodInput = {
  name: "", group_code: "VEGETABLES", portion_amount: 1, portion_unit: "g", portion_description: "",
};
const format = (value: number) => Number(value.toFixed(3)).toLocaleString("es-MX");

function recipeFromMenuSnapshot(recipe: Recipe, entry: DietMenuEntry) {
  if (!entry.recipe_snapshot) return recipe;
  return {
    ...recipe,
    name: entry.name_snapshot,
    items: recipe.items.map((item, index) => {
      const snapshot = entry.recipe_snapshot?.items[index];
      return snapshot ? { ...item, ...snapshot, food_item_id: snapshot.food_snapshot.id } : item;
    }),
  };
}

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

function MealNeeds({ rows, onSelect }: {
  rows: ReturnType<typeof calculateMenuStatus>["rows"];
  onSelect: (code: ExchangeGroupCode) => void;
}) {
  if (!rows.length) return <p className="rounded-xl bg-[#f4f7f4] p-4 text-sm text-[#6b7b73]">Este tiempo no tiene equivalentes asignados.</p>;
  return <div className="space-y-2">{rows.map((row) => {
    const group = getExchangeGroup(row.group_code);
    return <button key={row.group_code} type="button" onClick={() => onSelect(row.group_code)} className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left ${row.state === "complete" ? "border-[#d8e7dc] bg-[#f1f7f2]" : row.state === "excess" ? "border-[#efc9c1] bg-[#fff4f1]" : "border-[#eadbb7] bg-[#fffbef]"}`}>
      <span className="min-w-0"><span className="block truncate text-sm font-semibold text-[#315449]">{group.shortName}</span><span className={`text-xs ${row.state === "excess" ? "text-[#a64a3d]" : "text-[#718078]"}`}>{row.state === "complete" ? "Completo" : row.state === "excess" ? `Excede ${format(-row.remaining)}` : `Falta ${format(row.remaining)}`}</span></span>
      <span className="shrink-0 text-xs font-semibold text-[#52675e]">{format(row.used)} / {format(row.portions)}</span>
    </button>;
  })}</div>;
}

function CustomFoodForm({ initialGroup, busy, onCancel, onCreate }: {
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

function BrowserPanel({ mode, foods, recipes, groupCode, required, mealType, busy, onClose, onFood, onRecipe, onNewFood, onNewRecipe }: {
  mode: "food" | "recipe";
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
  const [foodFilter, setFoodFilter] = useState<FoodCatalogFilter>(() => initialFoodFilter(groupCode));
  const [exactGroup, setExactGroup] = useState<ExchangeGroupCode | null>(() => groupCode === "all" ? null : groupCode);
  const [recipeFilter, setRecipeFilter] = useState<RecipeCatalogFilter>("all");
  const selectedFoodGroups = exactGroup ? [exactGroup] : foodCatalogFilters.find((filter) => filter.id === foodFilter)?.groups ?? [];
  const visibleFoods = foods.filter((food) => (!selectedFoodGroups.length || selectedFoodGroups.includes(food.group_code)) && foodMatchesSearch(food, search));
  const visibleRecipes = recipes
    .filter((recipe) => ((recipeFilter === "all" || recipeFilter === "best") || recipe.meal_types.includes(recipeFilter)) && recipeMatchesSearch(recipe, search))
    .map((recipe) => ({ recipe, match: scoreRecipeCompatibility({ pendingExchanges: required, recipe, mealType }) }))
    .filter(({ match }) => recipeFilter !== "best" || (!match.blocked && match.covered > 0 && match.excess <= 0.5 && match.label !== "Poco compatible"))
    .sort((a, b) => b.match.score - a.match.score || a.recipe.name.localeCompare(b.recipe.name, "es-MX"));
  const recommendedRecipes = visibleRecipes.filter(({ match }) => !match.blocked && match.covered > 0 && match.excess <= 0.5 && match.label !== "Poco compatible");
  const otherRecipes = visibleRecipes.filter(({ recipe }) => !recommendedRecipes.some((candidate) => candidate.recipe.id === recipe.id));
  const recipeCard = ({ recipe, match }: (typeof visibleRecipes)[number]) => <div key={recipe.id} className="rounded-xl border border-[#e0e7e2] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-sm font-semibold text-[#315449]">{recipe.name}</p><p className="mt-1 text-xs font-semibold text-[#477363]">{match.label}</p><p className="mt-1 text-xs text-[#718078]">Cubre {format(match.covered)} de {format(match.covered + match.missing)} equivalentes · {recipe.items.length} ingredientes</p><div className="mt-2 flex flex-wrap gap-1">{match.coveredGroups.slice(0, 3).map((code) => <span key={code} className="rounded-full bg-[#edf5ef] px-2 py-0.5 text-[10px] font-semibold text-[#35624e]">✓ {getExchangeGroup(code).shortName}</span>)}{match.missingGroups.slice(0, 2).map((item) => <span key={item.group_code} className="rounded-full bg-[#fff7e7] px-2 py-0.5 text-[10px] font-semibold text-[#8a692d]">Falta {format(item.portions)} {getExchangeGroup(item.group_code).shortName}</span>)}</div><span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${recipe.is_custom ? "bg-[#f2eee3] text-[#75623d]" : "bg-[#e8f3eb] text-[#35624e]"}`}>{recipe.is_custom ? "Personal" : "Receta Nuthrick"}</span>{match.excess > 0 && <p className="mt-1 text-xs text-[#a64a3d]">Excede {format(match.excess)} equivalentes.</p>}</div><button type="button" className="nuth-button !px-3 !py-2" onClick={() => onRecipe(recipe)}>Revisar</button></div></div>;
  return <div className="rounded-2xl border border-[#bfd1c6] bg-white p-4 shadow-[0_18px_45px_rgba(23,61,54,.12)]">
    <div className="flex items-center justify-between"><div><h3 className="font-semibold text-[#24463b]">{mode === "food" ? exactGroup ? `Alimentos · ${getExchangeGroup(exactGroup).shortName}` : "Agregar alimento" : "Agregar receta"}</h3><p className="mt-1 text-xs text-[#718078]">Catálogo base de Nuthrick y contenido creado por ti</p></div><button type="button" aria-label="Cerrar buscador" onClick={onClose}><X size={19} /></button></div>
    <label className="relative mt-4 block"><Search className="absolute left-3 top-3 text-[#829087]" size={16} /><input className="nuth-input !pl-9" placeholder={mode === "food" ? "Buscar alimento" : "Buscar receta"} value={search} onChange={(e) => setSearch(e.target.value)} /></label>
    <div aria-label={mode === "food" ? "Filtros de alimentos" : "Filtros de recetas"} className="mt-3 flex gap-2 overflow-x-auto pb-1">
      {mode === "food" ? exactGroup ? <button type="button" className="shrink-0 rounded-full bg-[#f1f5f1] px-3 py-1.5 text-xs font-semibold text-[#52675e]" onClick={() => { setExactGroup(null); setFoodFilter("all"); }}>Ver otros grupos</button> : foodCatalogFilters.map((filter) => <button key={filter.id} type="button" aria-pressed={foodFilter === filter.id} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${foodFilter === filter.id ? "bg-[#173d36] text-white" : "bg-[#f1f5f1] text-[#52675e]"}`} onClick={() => setFoodFilter(filter.id)}>{filter.label}</button>) : recipeCatalogFilters.map((filter) => <button key={filter.id} type="button" aria-pressed={recipeFilter === filter.id} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${recipeFilter === filter.id ? "bg-[#173d36] text-white" : "bg-[#f1f5f1] text-[#52675e]"}`} onClick={() => setRecipeFilter(filter.id)}>{filter.label}</button>)}
    </div>
    <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
      {mode === "food" ? visibleFoods.map((food) => <div key={food.id} className="rounded-xl border border-[#e0e7e2] p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-[#315449]">{food.name}</p><p className="mt-1 text-xs text-[#718078]">1 equivalente · {food.portion_description} · {getExchangeGroup(food.group_code).shortName}</p><span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${food.is_custom ? "bg-[#f2eee3] text-[#75623d]" : "bg-[#e8f3eb] text-[#35624e]"}`}>{food.is_custom ? "Personalizado" : "Catálogo Nuthrick"}</span></div><div className="flex shrink-0 items-center gap-2"><input aria-label={`Cantidad de ${food.name}`} type="number" min="0.001" step="0.5" className="nuth-input !w-20 !py-2" value={quantities[food.id] ?? food.portion_amount} onChange={(e) => setQuantities({ ...quantities, [food.id]: Number(e.target.value) })} /><button type="button" className="nuth-button !px-3 !py-2" onClick={() => onFood(food, quantities[food.id] ?? Number(food.portion_amount))}>Agregar</button></div></div></div>) : <>{recommendedRecipes.length > 0 && <div><p className="mb-2 text-[11px] font-bold uppercase tracking-[.12em] text-[#477363]">Recomendadas</p><div className="space-y-2">{recommendedRecipes.map(recipeCard)}</div></div>}{otherRecipes.length > 0 && <div className="pt-2"><p className="mb-2 text-[11px] font-bold uppercase tracking-[.12em] text-[#7b8781]">Otras recetas</p><div className="space-y-2">{otherRecipes.map(recipeCard)}</div></div>}</>}
      {((mode === "food" && !visibleFoods.length) || (mode === "recipe" && !visibleRecipes.length)) && <p className="rounded-xl bg-[#f7f9f7] p-4 text-center text-sm text-[#718078]">No hay resultados todavía.</p>}
    </div>
    <button type="button" className="nuth-button-secondary mt-3 w-full justify-center" disabled={busy} onClick={mode === "food" ? onNewFood : onNewRecipe}><Plus size={15} /> {mode === "food" ? "Agregar alimento personalizado" : "Crear receta"}</button>
  </div>;
}

/** The same exact-group selector is used by proposed foods and recipe ingredients. */
function FoodExchangeSelector({ food, foods, onSelect, className = "" }: {
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
    <button type="button" aria-label={`Intercambiar ${food.name}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)} className="flex min-w-0 items-center gap-1 text-left text-sm font-semibold text-[#315449] hover:text-[#173d36]">
      <span className="truncate">{food.name}</span><ChevronRight size={15} className="shrink-0 text-[#789087]" />
    </button>
    {open && <div role="listbox" aria-label={`Alternativas para ${food.name}`} className="absolute left-0 top-[calc(100%+.4rem)] z-30 max-h-56 min-w-56 overflow-y-auto rounded-xl border border-[#bfd1c6] bg-white p-2 shadow-[0_14px_32px_rgba(23,61,54,.16)]">
      <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[.1em] text-[#54776a]">Intercambiar {getExchangeGroup(food.group_code).shortName}</p>
      {alternatives.map((candidate) => <button key={candidate.id} type="button" role="option" aria-selected={candidate.id === food.id} className={`block w-full rounded-lg px-2 py-2 text-left text-sm ${candidate.id === food.id ? "bg-[#edf5ef] font-semibold text-[#315449]" : "text-[#52675e] hover:bg-[#f5f8f5]"}`} onClick={() => { onSelect(candidate); setOpen(false); }}>{candidate.name}<span className="ml-2 text-[11px] text-[#7b8982]">{candidate.portion_description}</span></button>)}
      {!alternatives.length && <p className="px-2 py-3 text-xs text-[#718078]">No hay alternativas de este grupo.</p>}
    </div>}
  </div>;
}

function RecipeForm({ foods, busy, initialItems = [], submitLabel = "Guardar y usar", onCancel, onCreate }: {
  foods: FoodItem[];
  busy: boolean;
  initialItems?: RecipeDraftItem[];
  submitLabel?: string;
  onCancel: () => void;
  onCreate: (name: string, items: RecipeDraftItem[], description: string, instructions: string, substitutions: string) => void;
}) {
  const [manualName, setManualName] = useState("");
  const [nameMode, setNameMode] = useState<"auto" | "manual">("auto");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [substitutions, setSubstitutions] = useState("");
  const [foodId, setFoodId] = useState(foods[0]?.id ?? "");
  const [amount, setAmount] = useState(Number(foods[0]?.portion_amount ?? 1));
  const [items, setItems] = useState<RecipeDraftItem[]>(initialItems);
  const selected = foods.find((food) => food.id === foodId);
  const autoName = useMemo(() => generateRecipeName(items.map((item) => item.food)), [items]);
  const name = nameMode === "manual" ? manualName : autoName;
  return <div className="rounded-2xl border border-[#cfdcd4] bg-[#f9fbf8] p-4"><div className="flex items-center justify-between"><div><h3 className="font-semibold text-[#24463b]">Crear receta</h3><p className="mt-1 text-xs text-[#718078]">Se guardará para reutilizarla con otros pacientes.</p></div><button type="button" aria-label="Cerrar receta" onClick={onCancel}><X size={18} /></button></div>
    <label className="mt-4 block text-xs font-semibold text-[#52675e]">Nombre<input className="nuth-input mt-1" value={name} onChange={(e) => { setManualName(e.target.value); setNameMode("manual"); }} /></label>
    <label className="mt-3 block text-xs font-semibold text-[#52675e]">Descripción opcional<input className="nuth-input mt-1" placeholder="Ej. Desayuno rápido con fruta" value={description} onChange={(e) => setDescription(e.target.value)} /></label>
    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_110px_auto]"><select aria-label="Alimento de la receta" className="nuth-input" value={foodId} onChange={(e) => { const food = foods.find((item) => item.id === e.target.value); setFoodId(e.target.value); setAmount(Number(food?.portion_amount ?? 1)); }}>{foods.map((food) => <option key={food.id} value={food.id}>{food.name}</option>)}</select><input aria-label="Cantidad del ingrediente" type="number" min="0.001" step="0.5" className="nuth-input" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /><button type="button" className="nuth-button-secondary justify-center" disabled={!selected || amount <= 0} onClick={() => selected && setItems([...items, { food: selected, amount }])}>Añadir</button></div>
    <div className="mt-3 space-y-2">{items.map((item, index) => <div key={`${item.food.id}-${index}`} className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm"><span>{format(item.amount)} {unitLabels[item.food.portion_unit]} · {item.food.name}<span className="ml-2 text-xs text-[#718078]">{format(item.amount / Number(item.food.portion_amount))} {getExchangeGroup(item.food.group_code).shortName}</span></span><button type="button" aria-label={`Quitar ${item.food.name}`} onClick={() => setItems(items.filter((_, current) => current !== index))}><Trash2 size={15} /></button></div>)}</div>
    <label className="mt-3 block text-xs font-semibold text-[#52675e]">Instrucciones opcionales<textarea className="nuth-input mt-1 min-h-24 resize-y" placeholder="Preparación que podrá ver el paciente en una fase posterior" value={instructions} onChange={(e) => setInstructions(e.target.value)} /></label>
    <label className="mt-3 block text-xs font-semibold text-[#52675e]">Sustituciones opcionales<textarea className="nuth-input mt-1 min-h-16 resize-y" placeholder="Ej. Puede usarse tortilla en lugar de pan" value={substitutions} onChange={(e) => setSubstitutions(e.target.value)} /></label>
    {!foods.length && <p className="mt-3 rounded-xl bg-[#fff5e5] p-3 text-sm text-[#765827]">Crea primero un alimento personalizado para componer la receta.</p>}
    <div className="mt-4 flex justify-end gap-2"><button type="button" className="nuth-button-secondary" onClick={onCancel}>Cancelar</button><button type="button" className="nuth-button" disabled={!name.trim() || !items.length || busy} onClick={() => onCreate(name, items, description, instructions, substitutions)}>{submitLabel}</button></div>
  </div>;
}

function RecipeAdjustPanel({ recipe, foods, pending, mealType, busy, onCancel, onUse, onSaveCopy }: {
  recipe: Recipe;
  foods: FoodItem[];
  pending: Array<{ group_code: ExchangeGroupCode; portions: number }>;
  mealType: MealType;
  busy: boolean;
  onCancel: () => void;
  onUse: (recipe: Recipe) => void;
  onSaveCopy: (name: string, recipe: Recipe) => void;
}) {
  const [working, setWorking] = useState(recipe);
  const [amounts, setAmounts] = useState<Record<string, number>>(() => Object.fromEntries(recipe.items.map((item) => [item.id, Number(item.amount)])));
  const [askCopy, setAskCopy] = useState(false);
  const [copyName, setCopyName] = useState(`${recipe.name} — copia`);
  const adjusted = useMemo(() => adjustRecipeIngredients(working, amounts), [amounts, working]);
  const changed = recipeIngredientsChanged(recipe, adjusted);
  const match = useMemo(() => scoreRecipeCompatibility({ pendingExchanges: pending, recipe: adjusted, mealType }), [adjusted, mealType, pending]);
  const valid = recipe.items.every((item) => Number.isFinite(amounts[item.id]) && amounts[item.id] > 0);

  return <div className="rounded-2xl border border-[#bfd1c6] bg-[#f9fbf8] p-4 shadow-[0_18px_45px_rgba(23,61,54,.12)]">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[.12em] text-[#477363]">Agregar receta</p><h3 className="mt-1 font-semibold text-[#24463b]">{recipe.name}</h3><p className="mt-1 text-xs text-[#718078]">Revisa las cantidades antes de incorporarla al plan.</p></div><button type="button" aria-label="Cerrar ajuste de receta" onClick={onCancel}><X size={19} /></button></div>
    <div className="mt-4 space-y-2">{adjusted.items.map((item) => <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_90px_auto] items-center gap-2 rounded-xl bg-white px-3 py-2"><div className="min-w-0"><FoodExchangeSelector food={{ id: item.food_item_id ?? item.food_snapshot.id, name: item.food_snapshot.name, group_code: item.food_snapshot.group_code }} foods={foods} onSelect={(replacement) => {
      const next = replaceRecipeIngredient(adjusted, item.id, replacement);
      const nextItem = next.items.find((candidate) => candidate.id === item.id);
      setWorking(next);
      if (nextItem) setAmounts((current) => ({ ...current, [item.id]: Number(nextItem.amount) }));
    }} /><span className="mt-0.5 block text-[11px] font-normal text-[#78867f]">{format(item.exchange_contribution[0]?.portions ?? 0)} {getExchangeGroup(item.food_snapshot.group_code).shortName}</span></div><input aria-label={`Cantidad de ${item.food_snapshot.name}`} type="number" min="0.001" step="0.5" className="nuth-input !py-2" value={amounts[item.id]} onChange={(event) => setAmounts({ ...amounts, [item.id]: Number(event.target.value) })} /><span className="text-xs text-[#718078]">{unitLabels[item.unit]}</span></div>)}</div>
    <div className="mt-4 grid gap-3 rounded-xl border border-[#dce7df] bg-white p-3 sm:grid-cols-2"><div><p className="text-[11px] font-bold uppercase tracking-[.1em] text-[#718078]">Consume</p><p className="mt-1 text-xs leading-5 text-[#52675e]">{match.contributions.map((item) => `${format(item.portions)} ${getExchangeGroup(item.group_code).shortName}`).join(" · ") || "Sin equivalentes"}</p></div><div><p className="text-[11px] font-bold uppercase tracking-[.1em] text-[#718078]">Después de agregar</p><p className={`mt-1 text-xs font-semibold ${match.excess > 0 ? "text-[#a64a3d]" : "text-[#35624e]"}`}>{match.label} · faltan {format(match.missing)} · excede {format(match.excess)}</p></div></div>
    {askCopy && changed ? <div className="mt-4 rounded-xl bg-[#fff7e7] p-3"><p className="text-sm font-semibold text-[#6d572c]">¿Guardar estos ajustes como una nueva receta?</p><p className="mt-1 text-xs text-[#806d49]">La receta de Nuthrick permanecerá intacta.</p><input aria-label="Nombre de la copia" className="nuth-input mt-3" value={copyName} onChange={(event) => setCopyName(event.target.value)} /><div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" className="nuth-button-secondary" onClick={() => onUse(adjusted)}>No, sólo este plan</button><button type="button" className="nuth-button" disabled={!copyName.trim() || busy} onClick={() => onSaveCopy(copyName.trim(), adjusted)}>Guardar copia</button></div></div> : <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" className="nuth-button-secondary" onClick={onCancel}>Cancelar</button><button type="button" className="nuth-button" disabled={!valid || busy} onClick={() => changed ? setAskCopy(true) : onUse(adjusted)}>Agregar al menú</button></div>}
  </div>;
}

function ProposalRecipeEditor({ entry, recipe, foods, onCancel, onChange }: {
  entry: DietMenuEntry;
  recipe: Recipe;
  foods: FoodItem[];
  onCancel: () => void;
  onChange: (recipe: Recipe) => void;
}) {
  const [working, setWorking] = useState(recipe);
  const [amounts, setAmounts] = useState<Record<string, number>>(() => Object.fromEntries(recipe.items.map((item) => [item.id, Number(item.amount)])));
  const update = (next: Recipe, nextAmounts = amounts) => {
    setWorking(next);
    setAmounts(nextAmounts);
    onChange(adjustRecipeIngredients(next, nextAmounts));
  };
  const adjusted = adjustRecipeIngredients(working, amounts);
  return <div className="mt-4 rounded-2xl border border-[#bfd1c6] bg-[#f9fbf8] p-4">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[.12em] text-[#477363]">Vista previa · receta</p><h3 className="mt-1 font-semibold text-[#24463b]">{entry.name_snapshot}</h3><p className="mt-1 text-xs text-[#718078]">Estos cambios pertenecen sólo a esta propuesta.</p></div><button type="button" aria-label="Cerrar receta de la propuesta" onClick={onCancel}><X size={18} /></button></div>
    <div className="mt-4 space-y-2">{adjusted.items.map((item) => <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_90px_auto] items-center gap-2 rounded-xl bg-white px-3 py-2"><div className="min-w-0"><FoodExchangeSelector food={{ id: item.food_item_id ?? item.food_snapshot.id, name: item.food_snapshot.name, group_code: item.food_snapshot.group_code }} foods={foods} onSelect={(replacement) => {
      const next = replaceRecipeIngredient(adjusted, item.id, replacement);
      const nextItem = next.items.find((candidate) => candidate.id === item.id);
      update(next, { ...amounts, [item.id]: Number(nextItem?.amount ?? item.amount) });
    }} /><span className="mt-0.5 block text-[11px] text-[#78867f]">{format(item.exchange_contribution[0]?.portions ?? 0)} {getExchangeGroup(item.food_snapshot.group_code).shortName}</span></div><input aria-label={`Cantidad de ${item.food_snapshot.name} en propuesta`} type="number" min="0.001" step="0.5" className="nuth-input !py-2" value={amounts[item.id]} onChange={(event) => update(working, { ...amounts, [item.id]: Number(event.target.value) })} /><span className="text-xs text-[#718078]">{unitLabels[item.unit]}</span></div>)}</div>
    <div className="mt-4 flex justify-end"><button type="button" className="nuth-button-secondary" onClick={onCancel}>Listo</button></div>
  </div>;
}

function MenuProposalPanel({ proposal, mode, canReplace, foods, onMode, onApply, onDiscard, onCreateRecipe, onExchangeFood, onEditRecipe }: {
  proposal: MenuProposal;
  mode: MenuPlanningMode;
  canReplace: boolean;
  foods: FoodItem[];
  onMode: (mode: MenuPlanningMode) => void;
  onApply: () => void;
  onDiscard: () => void;
  onCreateRecipe: (meal: MenuProposalMeal) => void;
  onExchangeFood: (entryId: string, food: FoodItem) => void;
  onEditRecipe: (entry: DietMenuEntry, meal: MenuProposalMeal) => void;
}) {
  const complete = proposal.meals.filter((meal) => meal.complete).length;
  const pending = proposal.meals.length - complete;
  const isDay = proposal.mealTimeId === null;
  return <div className="rounded-2xl border border-[#bfd1c6] bg-[#f9fbf8] p-4 shadow-[0_18px_45px_rgba(23,61,54,.12)]">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-[.12em] text-[#477363]">Vista previa editable</p><h3 className="mt-1 font-semibold text-[#24463b]">{isDay ? "Propuesta del día" : `Propuesta para ${proposal.meals[0]?.mealName ?? "este tiempo"}`}</h3><p className="mt-1 text-xs text-[#718078]">{complete} tiempos completos{pending ? ` · ${pending} con pendiente` : ""}. Pulsa un alimento para intercambiarlo; nada se guarda hasta aplicar.</p></div><button type="button" aria-label="Descartar propuesta" onClick={onDiscard}><X size={19} /></button></div>
    {canReplace && <div className="mt-3 flex w-fit rounded-xl bg-[#edf2ee] p-1"><button type="button" aria-pressed={mode === "complete"} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${mode === "complete" ? "bg-white text-[#24463b] shadow-sm" : "text-[#718078]"}`} onClick={() => onMode("complete")}>Completar pendientes</button><button type="button" aria-pressed={mode === "replace"} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${mode === "replace" ? "bg-white text-[#24463b] shadow-sm" : "text-[#718078]"}`} onClick={() => onMode("replace")}>Rehacer tiempo</button></div>}
    <div className="mt-4 grid min-w-0 gap-3">{proposal.meals.map((meal) => {
      const individualFoods = meal.addedEntries.filter((entry) => entry.type === "food");
      const coverage = [...meal.addedEntries.flatMap((entry) => entry.exchange_contributions.map((item) => item.group_code))];
      return <section key={meal.mealTimeId} className="min-w-0 rounded-xl border border-[#dce7df] bg-white p-3">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm font-semibold text-[#315449]">{meal.mealName}</h4>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${meal.complete ? "bg-[#e7f3e9] text-[#35624e]" : "bg-[#fff3dc] text-[#8a692d]"}`}>{meal.complete ? "Completo" : "Propuesta parcial"}</span>
        </div>
        <div className="mt-3 divide-y divide-[#edf1ee]">{meal.addedEntries.map((entry) => <div key={entry.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 py-2.5">
          {entry.type === "food" && entry.food_snapshot
            ? <FoodExchangeSelector food={{ id: entry.source_id, name: entry.name_snapshot, group_code: entry.food_snapshot.group_code }} foods={foods} onSelect={(replacement) => onExchangeFood(entry.id, replacement)} />
            : <button type="button" className="min-w-0 text-left text-sm font-semibold text-[#315449] hover:text-[#173d36]" onClick={() => onEditRecipe(entry, meal)}><span className="block break-words">{entry.name_snapshot}</span><span className="mt-0.5 block text-[11px] font-normal text-[#718078]">Editar receta</span></button>}
          <p className="shrink-0 whitespace-nowrap text-right text-sm text-[#52675e]">{entry.type === "recipe" ? `${format(entry.quantity)} porción` : `${format(entry.quantity)} ${unitLabels[entry.unit]}`}</p>
          <p className="col-span-2 min-w-0 break-words text-[11px] leading-4 text-[#78867f]">{entry.exchange_contributions.map((item) => `${getExchangeGroup(item.group_code).shortName} · ${format(item.portions)} eq`).join(" · ")}</p>
        </div>)}{!meal.addedEntries.length && <p className="py-2 text-xs text-[#718078]">No necesita cambios.</p>}</div>
        {individualFoods.length >= 2 && <button type="button" className="mt-3 text-xs font-semibold text-[#3d705d]" onClick={() => onCreateRecipe(meal)}><Plus size={13} className="mr-1 inline" />Crear receta</button>}
        <div className="mt-3 border-t border-[#edf1ee] pt-3"><p className="text-[10px] font-bold uppercase tracking-[.1em] text-[#718078]">Cobertura</p><div className="mt-2 flex flex-wrap gap-1">{[...new Set(coverage)].map((code) => <span key={code} className="rounded-full bg-[#edf5ef] px-2 py-0.5 text-[10px] font-semibold text-[#35624e]">✓ {getExchangeGroup(code).shortName}</span>)}</div>{meal.pending.length > 0 && <p className="mt-2 break-words text-xs text-[#8a692d]">Falta: {meal.pending.map((item) => `${format(item.portions)} ${getExchangeGroup(item.group_code).shortName}`).join(" · ")}</p>}{meal.excess.length > 0 && <p className="mt-2 break-words text-xs text-[#a64a3d]">Excede: {meal.excess.map((item) => `${format(item.portions)} ${getExchangeGroup(item.group_code).shortName}`).join(" · ")}</p>}</div>
      </section>;
    })}</div>
    <div className="mt-4 flex justify-end gap-2"><button type="button" className="nuth-button-secondary" onClick={onDiscard}>Descartar</button><button type="button" aria-label="Aplicar propuesta" className="nuth-button" onClick={onApply}>Aplicar</button></div>
  </div>;
}

function UseCreatedRecipePanel({ recipe, onKeepFoods, onUseRecipe }: { recipe: Recipe; onKeepFoods: () => void; onUseRecipe: () => void }) {
  return <div className="rounded-2xl border border-[#bfd1c6] bg-[#f9fbf8] p-4">
    <p className="text-[11px] font-bold uppercase tracking-[.12em] text-[#477363]">Receta guardada</p>
    <h3 className="mt-1 font-semibold text-[#24463b]">¿Usar “{recipe.name}” en el menú?</h3>
    <p className="mt-1 text-xs leading-5 text-[#718078]">La receta conserva los mismos ingredientes y equivalentes de la propuesta.</p>
    <div className="mt-4 flex justify-end gap-2"><button type="button" className="nuth-button-secondary" onClick={onKeepFoods}>No</button><button type="button" className="nuth-button" onClick={onUseRecipe}>Sí</button></div>
  </div>;
}

export function DietMenuStep({ plan, onSave, onDraftChange, onGoToMeals, catalog }: Props) {
  const distribution = plan.meal_distribution;
  const initial = useMemo(() => distribution ? reconcileDietMenu(plan.diet_menu ?? createDietMenu(distribution), distribution) : null, [distribution, plan.diet_menu]);
  const [draft, setDraft] = useState(initial);
  const [activeMealId, setActiveMealId] = useState(distribution?.meal_times[0]?.id ?? "");
  const [foods, setFoods] = useState<FoodItem[]>(catalog?.foods ?? []);
  const [recipes, setRecipes] = useState<Recipe[]>(catalog?.recipes ?? []);
  const [panel, setPanel] = useState<"food" | "recipe" | "recipe_adjust" | "new_food" | "new_recipe" | "proposal_recipe" | "proposal_recipe_use" | "proposal_recipe_adjust" | null>(null);
  const [groupFilter, setGroupFilter] = useState<ExchangeGroupCode | "all">("all");
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [editingRecipeEntryId, setEditingRecipeEntryId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<MenuProposal | null>(null);
  const [proposalMode, setProposalMode] = useState<MenuPlanningMode>("complete");
  const [proposalRecipeDraft, setProposalRecipeDraft] = useState<ProposalRecipeDraft | null>(null);
  const [createdProposalRecipe, setCreatedProposalRecipe] = useState<CreatedProposalRecipe | null>(null);
  const [proposalRecipeEdit, setProposalRecipeEdit] = useState<ProposalRecipeEdit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const autosave = useChangeAutosave({ initialValue: initial, onSave: async (value) => { if (value) await onSave(value); }, onDraftChange: (value) => { if (value) onDraftChange?.(value); } });
  const saveState = autosave.status;

  useEffect(() => { if (catalog) return; void Promise.all([listFoodItems(), listRecipes()]).then(([nextFoods, nextRecipes]) => { setFoods(nextFoods); setRecipes(nextRecipes); }).catch((cause) => setError(cause instanceof Error ? cause.message : "No pudimos cargar alimentos y recetas.")); }, [catalog]);

  if (!distribution || !distribution.distribution.some((item) => item.portions > 0)) return <section className="rounded-[24px] border border-[#dfe6e1] bg-white p-5 sm:p-7"><p className="nuth-eyebrow">Paso 5</p><h1 className="mt-2 text-2xl font-semibold text-[#173d36]">Menú</h1><div className="mt-5 rounded-2xl bg-[#fff6e6] p-5 text-sm leading-6 text-[#765827]"><p className="font-semibold">Distribuye primero los equivalentes entre tiempos de comida.</p><p className="mt-1">El menú utiliza esa distribución; no agrega equivalentes nuevos.</p><button type="button" className="nuth-button mt-4" onClick={onGoToMeals}>Ir a Tiempos de comida</button></div></section>;
  if (!draft) return null;

  const meal = distribution.meal_times.find((item) => item.id === activeMealId) ?? distribution.meal_times[0];
  const variant = activeMenu(draft);
  const entries = variant?.meal_menus.find((item) => item.meal_time_id === meal.id)?.entries ?? [];
  const status = calculateMenuStatus(draft, distribution);
  const completedMeals = distribution.meal_times.filter((item) => {
    const rows = status.rows.filter((row) => row.meal_time_id === item.id);
    return rows.length > 0 && rows.every((row) => row.state === "complete");
  }).length;
  const mealRows = status.rows.filter((row) => row.meal_time_id === meal.id);
  const requiredRemaining = mealRows.filter((row) => row.remaining > 0).map((row) => ({ group_code: row.group_code, portions: row.remaining }));
  const distributionChanged = draft.source_meal_distribution_snapshot !== null && !sameMealDistribution(draft.source_meal_distribution_snapshot, distribution);
  const change = (next: DietMenu, immediate = false) => { setDraft(next); autosave.change(next, { immediate }); setError(""); };
  const open = (mode: "food" | "recipe", group: ExchangeGroupCode | "all" = "all") => { setGroupFilter(group); setPanel(mode); };
  const addFood = (food: FoodItem, amount: number) => { change(addFoodToMenu(draft, distribution, meal.id, food, amount), true); setPanel(null); };
  const addRecipe = (recipe: Recipe, servings = 1) => { change(addRecipeToMenu(draft, distribution, meal.id, recipe, servings), true); setPanel(null); setSelectedRecipe(null); };
  const useAdjustedRecipe = (recipe: Recipe) => {
    if (editingRecipeEntryId) change(updateRecipeMenuEntryIngredients(draft, distribution, editingRecipeEntryId, recipe.items), true);
    else addRecipe(recipe);
    setPanel(null);
    setSelectedRecipe(null);
    setEditingRecipeEntryId(null);
  };

  const saveCustomFood = async (input: CustomFoodInput) => { setBusy(true); try { const food = await createCustomFood(input); setFoods([food, ...foods]); addFood(food, input.portion_amount); } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos guardar el alimento."); } finally { setBusy(false); } };
  const saveRecipe = async (name: string, items: RecipeDraftItem[], description: string, instructions: string, substitutions: string) => { setBusy(true); try { const recipe = await createCustomRecipe({ name, items, meal_types: [meal.meal_type], description, instructions, substitution_notes: substitutions }); setRecipes([recipe, ...recipes]); addRecipe(recipe, 1); } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos guardar la receta."); } finally { setBusy(false); } };
  const saveRecipeCopy = async (name: string, adjusted: Recipe) => {
    const items = adjusted.items.map((item) => ({ food: foods.find((food) => food.id === item.food_item_id) ?? foods.find((food) => food.id === item.food_snapshot.id), amount: Number(item.amount) }));
    if (items.some((item) => !item.food)) { setError("No pudimos relacionar todos los ingredientes con el catálogo actual."); return; }
    setBusy(true);
    try {
      const copy = await createCustomRecipe({
        name,
        items: items as RecipeDraftItem[],
        meal_types: adjusted.meal_types,
        description: adjusted.description ?? undefined,
        instructions: adjusted.instructions ?? undefined,
        substitution_notes: adjusted.substitution_notes ?? undefined,
      });
      setRecipes([copy, ...recipes]);
      if (editingRecipeEntryId) change(replaceRecipeMenuEntry(draft, distribution, editingRecipeEntryId, copy));
      else addRecipe(copy);
      setPanel(null);
      setSelectedRecipe(null);
      setEditingRecipeEntryId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No pudimos guardar la copia de la receta.");
    } finally { setBusy(false); }
  };
  const buildProposal = (mealTimeId: string | null, mode: MenuPlanningMode = "complete") => {
    setProposalMode(mode);
    setProposal(proposeDietMenu({ menu: draft, distribution, foods, recipes, mealTimeId, mode }));
    setPanel(null);
  };
  const updateProposalMenu = (nextMenu: DietMenu) => setProposal((current) => {
    if (!current) return current;
    const nextStatus = calculateMenuStatus(nextMenu, distribution);
    const meals = current.meals.map((proposalMeal) => {
      const nextEntries = activeMenu(nextMenu).meal_menus.find((candidate) => candidate.meal_time_id === proposalMeal.mealTimeId)?.entries ?? [];
      const rows = nextStatus.rows.filter((row) => row.meal_time_id === proposalMeal.mealTimeId);
      return {
        ...proposalMeal,
        addedEntries: proposalMeal.addedEntries.map((entry) => nextEntries.find((candidate) => candidate.id === entry.id) ?? entry),
        pending: rows.filter((row) => row.remaining > 0.000001).map((row) => ({ group_code: row.group_code, portions: row.remaining })),
        excess: rows.filter((row) => row.remaining < -0.000001).map((row) => ({ group_code: row.group_code, portions: -row.remaining })),
        complete: rows.length > 0 && rows.every((row) => row.state === "complete"),
      };
    });
    return { ...current, menu: nextMenu, meals, exact: meals.every((item) => item.complete) };
  });
  const exchangeProposedFood = (entryId: string, replacement: FoodItem) => {
    if (!proposal) return;
    updateProposalMenu(replaceFoodMenuEntry(proposal.menu, distribution, entryId, replacement));
  };
  const editProposedRecipe = (entry: DietMenuEntry, proposalMeal: MenuProposalMeal) => {
    if (entry.type !== "recipe" || !entry.recipe_snapshot) return;
    const base = recipes.find((candidate) => candidate.id === entry.source_id);
    if (!base) { setError("No pudimos abrir esta receta para editarla en la propuesta."); return; }
    setProposalRecipeEdit({ mealTimeId: proposalMeal.mealTimeId, entryId: entry.id, recipe: recipeFromMenuSnapshot(base, entry) });
    setPanel("proposal_recipe_adjust");
  };
  const startProposalRecipe = (proposalMeal: MenuProposalMeal) => {
    const individualFoods = proposalMeal.addedEntries.filter((entry) => entry.type === "food" && entry.food_snapshot);
    if (individualFoods.length < 2) return;
    setProposalRecipeDraft({ mealTimeId: proposalMeal.mealTimeId, entries: individualFoods });
    setPanel("proposal_recipe");
  };
  const proposalRecipeItems = proposalRecipeDraft?.entries.flatMap((entry) => {
    const food = foods.find((candidate) => candidate.id === entry.source_id || candidate.id === entry.food_snapshot?.id);
    return food ? [{ food, amount: entry.quantity }] : [];
  }) ?? [];
  const saveProposalRecipe = async (name: string, items: RecipeDraftItem[], description: string, instructions: string, substitutions: string) => {
    if (!proposalRecipeDraft) return;
    const proposalMeal = distribution.meal_times.find((candidate) => candidate.id === proposalRecipeDraft.mealTimeId);
    setBusy(true);
    try {
      const recipe = await createCustomRecipe({ name, items, meal_types: proposalMeal ? [proposalMeal.meal_type] : [], description, instructions, substitution_notes: substitutions });
      setRecipes((current) => [recipe, ...current]);
      setCreatedProposalRecipe({ ...proposalRecipeDraft, recipe });
      setPanel("proposal_recipe_use");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos guardar la receta."); }
    finally { setBusy(false); }
  };
  const finishProposalRecipe = (useRecipe: boolean) => {
    if (useRecipe && proposal && createdProposalRecipe) {
      const entryIds = createdProposalRecipe.entries.map((entry) => entry.id);
      const nextMenu = replaceFoodEntriesWithRecipe(proposal.menu, distribution, createdProposalRecipe.mealTimeId, entryIds, createdProposalRecipe.recipe);
      const nextRecipeEntry = activeMenu(nextMenu).meal_menus.find((candidate) => candidate.meal_time_id === createdProposalRecipe.mealTimeId)?.entries.find((entry) => entry.type === "recipe" && entry.source_id === createdProposalRecipe.recipe.id);
      setProposal({ ...proposal, menu: nextMenu, meals: proposal.meals.map((proposalMeal) => proposalMeal.mealTimeId !== createdProposalRecipe.mealTimeId ? proposalMeal : { ...proposalMeal, addedEntries: [...proposalMeal.addedEntries.filter((entry) => !entryIds.includes(entry.id)), ...(nextRecipeEntry ? [nextRecipeEntry] : [])] }) });
    }
    setPanel(null);
    setProposalRecipeDraft(null);
    setCreatedProposalRecipe(null);
  };
  const confirm = async () => { const confirmed = confirmDietMenu(draft, distribution); if (confirmed === draft) return; setDraft(confirmed); try { await autosave.saveNow(confirmed); } catch (cause) { setError(cause instanceof Error ? cause.message : "No pudimos confirmar el menú."); } };
  const proposalRecipeEntry = proposalRecipeEdit && proposal
    ? activeMenu(proposal.menu).meal_menus.find((candidate) => candidate.meal_time_id === proposalRecipeEdit.mealTimeId)?.entries.find((entry) => entry.id === proposalRecipeEdit.entryId)
    : null;

  return <section className="min-w-0 overflow-hidden rounded-[24px] border border-[#dfe6e1] bg-white p-4 sm:p-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="nuth-eyebrow">Paso 5</p><h1 aria-label="Construcción del menú" className="mt-2 text-2xl font-semibold text-[#173d36]">Menú</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#718078]">{completedMeals} de {distribution.meal_times.length} tiempos completos · convierte las porciones en alimentos y platillos.</p></div><div className="flex flex-wrap items-center gap-2"><button type="button" aria-label="Proponer alimentos y recetas para todos los tiempos pendientes" className="nuth-button" onClick={() => buildProposal(null)}><Sparkles size={15} /> Proponer día</button><span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${draft.status === "ready" ? "bg-[#e6f2e8] text-[#35624e]" : "bg-[#f5efe1] text-[#79643b]"}`}>{draft.status === "ready" ? "Listo" : entries.length ? "En edición" : "Sin iniciar"}</span></div></div>
    <p className="mt-1 text-right text-xs text-[#718078]">Completa tus tiempos con alimentos y recetas compatibles.</p>
    {distribution.status !== "ready" && <p className="mt-4 rounded-xl bg-[#f7f3e9] px-4 py-3 text-sm text-[#725f35]">La distribución por tiempos todavía está en edición.</p>}
    {distributionChanged && <p className="mt-4 rounded-xl bg-[#fff2df] px-4 py-3 text-sm font-medium text-[#805d24]">La distribución de equivalentes cambió. Revisa nuevamente el menú.</p>}
    {error && <p role="alert" className="mt-4 rounded-xl bg-[#fbe9e5] px-4 py-3 text-sm text-[#963f32]">{error}</p>}

    <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-[190px_minmax(0,1fr)_230px]">
      <aside className="min-w-0 overflow-hidden rounded-2xl bg-[#f5f8f5] p-3"><p className="px-2 text-[11px] font-bold uppercase tracking-[.12em] text-[#6f7f77]">Tiempos</p><div className="mt-2 flex max-w-full gap-2 overflow-x-auto lg:block lg:space-y-2 lg:overflow-visible">{distribution.meal_times.map((item) => { const rows = status.rows.filter((row) => row.meal_time_id === item.id); const issues = rows.filter((row) => row.state !== "complete").length; return <button key={item.id} type="button" onClick={() => { setActiveMealId(item.id); setPanel(null); setProposal(null); }} className={`min-w-36 rounded-xl px-3 py-3 text-left lg:min-w-0 lg:w-full ${item.id === meal.id ? "bg-[#173d36] text-white" : "bg-white text-[#315449]"}`}><span className="block truncate text-sm font-semibold">{item.display_name}</span><span className={`mt-1 block text-xs ${item.id === meal.id ? "text-white/65" : "text-[#7a8881]"}`}>{item.time || "Sin hora"} · {issues ? `${issues} por completar` : "Completo"}</span></button>; })}</div></aside>

      <main className="min-w-0 rounded-2xl border border-[#e0e7e2] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.12em] text-[#477363]">{meal.time || "Hora abierta"}</p><h2 className="mt-1 text-xl font-semibold text-[#24463b]">{meal.display_name}</h2></div><div className="flex flex-wrap gap-2"><button type="button" aria-label="Proponer alimentos y recetas para este tiempo de comida" className="nuth-button-secondary !px-3 !py-2" onClick={() => buildProposal(meal.id)}><Sparkles size={15} /> Proponer tiempo</button><button type="button" aria-label="Agregar alimento" className="nuth-button-secondary !px-3 !py-2" onClick={() => open("food")}><Apple size={15} /> Alimento</button><button type="button" aria-label="Agregar receta" className="nuth-button-secondary !px-3 !py-2" onClick={() => open("recipe")}><ChefHat size={15} /> Receta</button></div></div>
        <div className="mt-4 space-y-2">{entries.map((entry) => <div key={entry.id} className="rounded-xl bg-[#f8faf8] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#315449]">{entry.name_snapshot}</p><p className="mt-1 text-xs text-[#718078]">{entry.type === "recipe" ? "Receta" : entry.food_snapshot?.is_custom ? "Alimento personalizado" : "Alimento de catálogo"} · {entry.exchange_contributions.map((item) => `${format(item.portions)} ${getExchangeGroup(item.group_code).shortName}`).join(" · ")}</p></div><div className="flex shrink-0 items-center gap-2"><input aria-label={`Cantidad de ${entry.name_snapshot}`} type="number" min="0.001" step="0.5" className="nuth-input !w-20 !py-2" value={entry.quantity} onChange={(e) => change(updateMenuEntryQuantity(draft, distribution, entry.id, Number(e.target.value)))} /><span className="hidden text-xs text-[#718078] sm:inline">{unitLabels[entry.unit]}</span>{entry.type === "recipe" && recipes.some((recipe) => recipe.id === entry.source_id) && <button type="button" aria-label={`Editar receta ${entry.name_snapshot}`} onClick={() => { const base = recipes.find((candidate) => candidate.id === entry.source_id) ?? null; setSelectedRecipe(base ? recipeFromMenuSnapshot(base, entry) : null); setEditingRecipeEntryId(entry.id); setPanel("recipe_adjust"); }}><Pencil size={15} className="text-[#477363]" /></button>}<button type="button" aria-label={`Eliminar ${entry.name_snapshot}`} onClick={() => change(removeMenuEntry(draft, distribution, entry.id), true)}><Trash2 size={16} className="text-[#a64a3d]" /></button></div></div></div>)}{!entries.length && <div className="rounded-xl border border-dashed border-[#ccd8d1] p-7 text-center"><ChefHat className="mx-auto text-[#789087]" size={22} /><p className="mt-3 font-semibold text-[#355c4e]">Construye este tiempo</p><p className="mt-1 text-sm text-[#74817d]">Agrega alimentos individuales, recetas o una combinación.</p></div>}</div>
        {proposal && <div className="mt-4"><MenuProposalPanel proposal={proposal} mode={proposalMode} canReplace={Boolean(proposal.mealTimeId && entries.length)} foods={foods} onMode={(mode) => buildProposal(proposal.mealTimeId, mode)} onApply={() => { change(proposal.menu, true); setProposal(null); }} onDiscard={() => setProposal(null)} onCreateRecipe={startProposalRecipe} onExchangeFood={exchangeProposedFood} onEditRecipe={editProposedRecipe} /></div>}
        {panel === "food" || panel === "recipe" ? <div className="mt-4"><BrowserPanel key={`${panel}-${groupFilter}`} mode={panel} foods={foods} recipes={recipes} groupCode={groupFilter} required={requiredRemaining} mealType={meal.meal_type} busy={busy} onClose={() => setPanel(null)} onFood={addFood} onRecipe={(recipe) => { setSelectedRecipe(recipe); setEditingRecipeEntryId(null); setPanel("recipe_adjust"); }} onNewFood={() => setPanel("new_food")} onNewRecipe={() => setPanel("new_recipe")} /></div> : null}
        {panel === "recipe_adjust" && selectedRecipe && <div className="mt-4"><RecipeAdjustPanel key={`${selectedRecipe.id}-${editingRecipeEntryId ?? "new"}`} recipe={selectedRecipe} foods={foods} pending={requiredRemaining} mealType={meal.meal_type} busy={busy} onCancel={() => { setPanel("recipe"); setEditingRecipeEntryId(null); }} onUse={useAdjustedRecipe} onSaveCopy={(name, recipe) => void saveRecipeCopy(name, recipe)} /></div>}
        {panel === "new_food" && <div className="mt-4"><CustomFoodForm initialGroup={groupFilter === "all" ? (requiredRemaining[0]?.group_code ?? "VEGETABLES") : groupFilter} busy={busy} onCancel={() => setPanel("food")} onCreate={(input) => void saveCustomFood(input)} /></div>}
        {panel === "new_recipe" && <div className="mt-4"><RecipeForm foods={foods} busy={busy} onCancel={() => setPanel("recipe")} onCreate={(name, items, description, instructions, substitutions) => void saveRecipe(name, items, description, instructions, substitutions)} /></div>}
        {panel === "proposal_recipe" && proposalRecipeDraft && <div className="mt-4"><RecipeForm foods={foods} busy={busy} initialItems={proposalRecipeItems} submitLabel="Guardar" onCancel={() => { setPanel(null); setProposalRecipeDraft(null); }} onCreate={(...values) => void saveProposalRecipe(...values)} /></div>}
        {panel === "proposal_recipe_use" && createdProposalRecipe && <div className="mt-4"><UseCreatedRecipePanel recipe={createdProposalRecipe.recipe} onKeepFoods={() => finishProposalRecipe(false)} onUseRecipe={() => finishProposalRecipe(true)} /></div>}
        {panel === "proposal_recipe_adjust" && proposalRecipeEdit && proposalRecipeEntry && <ProposalRecipeEditor key={proposalRecipeEdit.entryId} entry={proposalRecipeEntry} recipe={proposalRecipeEdit.recipe} foods={foods} onCancel={() => { setPanel(null); setProposalRecipeEdit(null); }} onChange={(nextRecipe) => { if (!proposal) return; updateProposalMenu(updateRecipeMenuEntryIngredients(proposal.menu, distribution, proposalRecipeEdit.entryId, nextRecipe.items)); setProposalRecipeEdit((current) => current ? { ...current, recipe: nextRecipe } : current); }} />}
      </main>

      <aside className="min-w-0 rounded-2xl border border-[#e0e7e2] p-4"><div className="flex items-center gap-2"><AlertTriangle size={16} className="text-[#b68437]" /><h2 className="font-semibold text-[#315449]">Pendientes</h2></div><p className="mt-1 text-xs leading-5 text-[#718078]">Pulsa un faltante para buscar ese grupo.</p><div className="mt-3"><MealNeeds rows={mealRows} onSelect={(code) => open("food", code)} /></div></aside>
    </div>

    <div className="mt-5 flex flex-col gap-4 rounded-2xl bg-[#173d36] p-4 text-white sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.12em] text-[#efbd6b]">Resumen del menú</p><p className="mt-1 text-sm text-white/75">{status.complete} completos · {status.pending} pendientes · {status.excess} con exceso</p></div><div className="flex flex-col items-stretch gap-2 sm:items-end"><button type="button" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#efbd6b] px-4 py-2.5 text-sm font-semibold text-[#173d36] disabled:cursor-not-allowed disabled:opacity-50" disabled={!status.canConfirm} onClick={() => void confirm()}><Check size={16} /> {draft.status === "ready" ? "Confirmar nuevamente" : "Confirmar menú"}</button>{!status.canConfirm && <span className="text-xs text-white/60">Completa faltantes y corrige excesos.</span>}</div></div>
    <div className="mt-3 flex min-h-5 justify-end"><AutosaveFeedback status={saveState} /></div>
    <WorkshopStepFooter onPrevious={onGoToMeals} nextHint="Revisión estará disponible después." finalStep />
  </section>;
}
