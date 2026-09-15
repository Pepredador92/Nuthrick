import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { DietMenuStep } from "@/src/components/diet/DietMenuStep";
import { addFoodToMenu, createDietMenu, createFoodSnapshot, exchangeContributionForFood } from "@/src/features/menu/model";
import type { FoodItem, MealDistribution, NutritionPlan, Recipe } from "@/src/types/domain";
import type { CustomRecipeInput } from "@/src/services/foodCatalog";
import "../../app/globals.css";
import { weeklyFixture } from "../fixtures/weeklyMenu";

const meals = [
  { id: "breakfast", meal_type: "BREAKFAST" as const, display_name: "Desayuno", time: "08:00", display_order: 0 },
  { id: "snack", meal_type: "SNACK" as const, display_name: "Colación", time: "11:30", display_order: 1 },
  { id: "lunch", meal_type: "MAIN_MEAL" as const, display_name: "Comida", time: "15:00", display_order: 2 },
  { id: "dinner", meal_type: "DINNER" as const, display_name: "Cena", time: "20:00", display_order: 3 },
];
const mealDistribution: MealDistribution = {
  schema_version: 1, source_exchange_snapshot: null, meal_times: meals,
  distribution: [
    { meal_time_id: "breakfast", group_code: "FRUITS", portions: 1 },
    { meal_time_id: "breakfast", group_code: "CEREALS_NO_FAT", portions: 2 },
    { meal_time_id: "breakfast", group_code: "MILK_SKIM", portions: 1 },
    { meal_time_id: "breakfast", group_code: "AOA_MODERATE_FAT", portions: 2 },
    { meal_time_id: "breakfast", group_code: "LEGUMES", portions: 1 },
    { meal_time_id: "lunch", group_code: "VEGETABLES", portions: 2 },
  ], derived_meal_totals: [], status: "ready", confirmed_at: "2026-09-10T09:00:00Z", updated_at: "2026-09-10T09:00:00Z",
};
const papaya: FoodItem = {
  id: "papaya", owner_id: "visual", stable_code: null, catalog_code: null, name: "Papaya preparada", normalized_name: "papaya preparada", aliases: [], brand: null, category: null,
  exchange_system_code: "SMAE_NOM037_2012", exchange_catalog_version: "1.0.0", group_code: "FRUITS",
  portion_amount: 1, portion_unit: "cup", portion_description: "1 taza", alternate_portions: [], edible_grams: null,
  energy_kcal: null, carbohydrate_g: null, protein_g: null, fat_g: null, fiber_g: null, sodium_mg: null,
  attributes: { gluten: "free", lactose: "free" }, source: "PROFESSIONAL_CUSTOM", source_version: "1", source_reference: null, is_custom: true,
  use_count: 2, active: true, created_at: "2026-09-10T09:00:00Z", updated_at: "2026-09-10T09:00:00Z",
};
let menu = createDietMenu(mealDistribution, () => "main");
menu = addFoodToMenu(menu, mealDistribution, "breakfast", papaya, 1, "entry-papaya");
const plan: NutritionPlan = {
  id: "visual", professional_id: "visual", patient_id: null, consultation_id: null, title: "Plan visual", assigned_at: "2026-09-10",
  review_date: null, plan_type: null, category: null, target_calories: 1800, energy_calculation: null, macro_distribution: null,
  exchange_prescription: null, meal_distribution: mealDistribution, diet_menu: menu, status: "draft", created_at: "", updated_at: "",
};

const sampleFoods: FoodItem[] = [
  {...papaya,stable_code:"MX_PAPAYA"},
  {...papaya,id:"apple",name:"Manzana",normalized_name:"manzana",portion_unit:"piece",portion_description:"1 pieza"},
  {...papaya,id:"milk",stable_code:"MX_SKIM_MILK",name:"Leche descremada",normalized_name:"leche descremada",group_code:"MILK_SKIM",portion_amount:1,portion_description:"1 taza (240 ml)",attributes:{lactose:"contains"}},
  {...papaya,id:"tortilla",name:"Tortilla de maíz",normalized_name:"tortilla de maiz",group_code:"CEREALS_NO_FAT",portion_unit:"tortilla",portion_description:"1 tortilla"},
  {...papaya,id:"bread",name:"Pan integral",normalized_name:"pan integral",group_code:"CEREALS_NO_FAT",portion_unit:"slice",portion_description:"1 rebanada"},
  {...papaya,id:"egg",name:"Huevo cocido",normalized_name:"huevo cocido",group_code:"AOA_MODERATE_FAT",portion_unit:"piece",portion_description:"1 pieza",attributes:{egg:"contains"}},
  {...papaya,id:"beans",name:"Frijoles cocidos",normalized_name:"frijoles cocidos",group_code:"LEGUMES",portion_amount:.5,portion_unit:"cup",portion_description:"½ taza"},
  {...papaya,id:"veg",name:"Nopales cocidos",normalized_name:"nopales cocidos",group_code:"VEGETABLES",portion_amount:1,portion_unit:"cup",portion_description:"1 taza"},
];
async function fakeRecipe(input: CustomRecipeInput):Promise<Recipe> {
  const id=crypto.randomUUID();
  return {id,owner_id:"visual",stable_code:null,name:input.name,normalized_name:input.name.toLocaleLowerCase("es-MX"),servings:input.servings??1,instructions:input.instructions??null,substitution_notes:input.substitution_notes??null,description:input.description??null,meal_types:input.meal_types??[],image_path:null,tags:input.kind==="drink"?["nuthrick:drink"]:[],source:"FICTITIOUS_BROWSER_TEST",source_version:"1",source_reference:null,is_custom:true,active:true,created_at:"",updated_at:"",items:input.items.map((item,index)=>({id:`${id}-${index}`,owner_id:"visual",recipe_id:id,food_item_id:item.food.id,amount:item.amount,unit:item.food.portion_unit,display_order:index,food_snapshot:createFoodSnapshot(item.food),exchange_contribution:exchangeContributionForFood(item.food,item.amount),created_at:""}))};
}
function Harness(){
  const [saves,setSaves]=useState(0);
  const [librarySaves,setLibrarySaves]=useState(0);
  const [weekly] = useState(() => weeklyFixture());
  const weeklyMode = new URLSearchParams(window.location.search).has("weekly");
  if (new URLSearchParams(window.location.search).has("exploration")) {
    const distribution:MealDistribution={...mealDistribution,distribution:mealDistribution.distribution.filter(r=>r.meal_time_id==="lunch"||["FRUITS","CEREALS_NO_FAT","AOA_MODERATE_FAT"].includes(r.group_code)).map(r=>r.group_code==="AOA_MODERATE_FAT"?{...r,portions:1}:r)};
    const foods:FoodItem[]=[{...papaya,id:"guava",name:"Guayaba",portion_unit:"piece",use_count:100},{...papaya,id:"apple",name:"Manzana",portion_unit:"piece",use_count:50},{...papaya,id:"pear",name:"Pera",portion_unit:"piece",use_count:0},...sampleFoods.filter(f=>f.id==="egg"||f.id==="tortilla"||f.id==="veg")];
    return <main className="mx-auto min-h-screen max-w-[1440px] bg-[#f7f8f4] p-3 sm:p-8"><p role="status">Caso ficticio · Guardados de menú: {saves}.</p><DietMenuStep plan={{...plan,id:"exploration-visual",diet_menu:null,meal_distribution:distribution}} catalog={{foods,recipes:[]}} onSave={async()=>setSaves(n=>n+1)} onGoToMeals={()=>undefined}/></main>;
  }
  if (weeklyMode) return <main className="mx-auto min-h-screen max-w-[1440px] bg-[#f7f8f4] p-3 sm:p-8"><p className="mb-4 text-xs" role="status">Caso ficticio · distribución simplificada para probar la interfaz; no es una dieta. Guardados de menú: {saves}.</p><DietMenuStep plan={{...plan,id:"weekly-visual",diet_menu:weekly.menu,meal_distribution:weekly.distribution}} catalog={{foods:weekly.foods,recipes:[]}} onSave={async()=>setSaves(n=>n+1)} onGoToMeals={()=>undefined}/></main>;
  return <main className="mx-auto min-h-screen max-w-[1440px] bg-[#f7f8f4] p-3 sm:p-8"><p className="mb-4 text-xs" role="status">Caso ficticio · sin conexión de guardado. Guardados de menú: {saves}. Biblioteca: {librarySaves}.</p><DietMenuStep plan={plan} catalog={{foods:sampleFoods,recipes:[]}} recipeWriter={async input=>{setLibrarySaves(n=>n+1);return fakeRecipe(input);}} onSave={async()=>{setSaves(n=>n+1);}} onGoToMeals={()=>undefined}/></main>;
}
createRoot(document.getElementById("root")!).render(<Harness/>);
