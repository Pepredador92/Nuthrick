import { describe, expect, it } from "vitest";
import { activeMenu, addFoodToMenu, addRecipeToMenu, calculateMenuStatus, createDietMenu, createFoodSnapshot, exchangeContributionForFood, replaceFoodMenuEntry, replaceMenuEntriesWithRecipe } from "./model";
import { dayObservations, menuDifferences, menuSignature, recipeFromEntry, recipeHasKnownContributions, starterDrinks, withPreservedContent } from "./mesa";
import { menuAlternatives, proposeDietMenu, adjustRecipeToPending } from "./planner";
import type { FoodItem, MealDistribution, Recipe } from "@/src/types/domain";

const fruit: FoodItem = { id:"papaya",name:"Papaya",stable_code:"MX_PAPAYA",normalized_name:"papaya",owner_id:null,catalog_code:"TEST",aliases:[],brand:null,category:null,exchange_system_code:"TEST",exchange_catalog_version:"1",group_code:"FRUITS",portion_amount:1,portion_unit:"cup",portion_description:"1 taza",alternate_portions:[],edible_grams:null,energy_kcal:null,carbohydrate_g:null,protein_g:null,fat_g:null,fiber_g:null,sodium_mg:null,attributes:{},source:"FIXTURE",source_version:"1",source_reference:null,is_custom:false,use_count:0,active:true,created_at:"",updated_at:"" };
const milk: FoodItem = {...fruit,id:"milk",stable_code:"MX_SKIM_MILK",name:"Leche",group_code:"MILK_SKIM",attributes:{lactose:"contains"}};
const apple: FoodItem = {...fruit,id:"apple",stable_code:"apple",name:"Manzana",normalized_name:"manzana",portion_unit:"piece"};
const distribution: MealDistribution={schema_version:1,source_exchange_snapshot:null,meal_times:[{id:"a",meal_type:"BREAKFAST",display_name:"Desayuno",time:"08:00",display_order:0},{id:"b",meal_type:"DINNER",display_name:"Cena",time:"20:00",display_order:1}],distribution:[{meal_time_id:"a",group_code:"FRUITS",portions:1},{meal_time_id:"b",group_code:"FRUITS",portions:1}],derived_meal_totals:[],status:"ready",confirmed_at:null,updated_at:""};
const asRecipe=(food:FoodItem,servings=1):Recipe=>({...starterDrinks([])[0],id:"recipe",name:"Fruta preparada",source:"FIXTURE",tags:[],servings,items:[{id:"i",recipe_id:"recipe",owner_id:null,food_item_id:food.id,amount:2,unit:food.portion_unit,display_order:0,food_snapshot:createFoodSnapshot(food),exchange_contribution:exchangeContributionForFood(food,2),created_at:""}]});

describe("a la Mesa shared model",()=>{
  it("shows an unprescribed group against zero and preserves small accumulated differences",()=>{
    let menu=addFoodToMenu(createDietMenu(distribution),distribution,"a",milk,1);
    menu=addFoodToMenu(menu,distribution,"a",fruit,.94);
    menu=addFoodToMenu(menu,distribution,"b",fruit,.94);
    expect(calculateMenuStatus(menu,distribution).rows.find(r=>r.group_code==="MILK_SKIM")).toMatchObject({portions:0,used:1,remaining:-1,state:"excess"});
    expect(menuDifferences(menu,distribution)).toMatchObject({missing:.12,excess:1});
    expect(calculateMenuStatus(menu,distribution).canConfirm).toBe(false);
  });
  it("keeps same-group exchanges honest after practical rounding",()=>{
    const awkward={...apple,portion_amount:.67,portion_unit:"cup" as const};
    const menu=addFoodToMenu(createDietMenu(distribution),distribution,"a",fruit,1,"a-food");
    const changed=replaceFoodMenuEntry(menu,distribution,"a-food",awkward);
    expect(activeMenu(changed).meal_menus[0].entries[0]).toMatchObject({quantity:.75});
    expect(calculateMenuStatus(changed,distribution).rows[0].state).toBe("excess");
    expect(activeMenu(menu).meal_menus[0].entries[0].quantity).toBe(1);
  });
  it("includes sub-tolerance unprescribed contributions in the accumulated differences",()=>{
    let menu=addFoodToMenu(createDietMenu(distribution),distribution,"a",milk,.06);
    menu=addFoodToMenu(menu,distribution,"b",milk,.06);
    expect(menuDifferences(menu,distribution)).toMatchObject({excess:.12});
  });
  it("converts a chosen batch at yield 2 without duplicating or halving its contributions",()=>{
    let menu=addFoodToMenu(createDietMenu(distribution),distribution,"a",fruit,2,"fruit-entry");
    menu=addFoodToMenu(menu,distribution,"a",milk,1,"side");
    const result=replaceMenuEntriesWithRecipe(menu,distribution,"a",["fruit-entry"],asRecipe(fruit,2));
    const entries=activeMenu(result).meal_menus[0].entries;
    expect(entries).toHaveLength(2);
    expect(entries.find(e=>e.type==="recipe")).toMatchObject({quantity:2,exchange_contributions:[{group_code:"FRUITS",portions:2}]});
    expect(entries.find(e=>e.id==="side")).toEqual(activeMenu(menu).meal_menus[0].entries[1]);
  });
  it("uses zero only for verified plain water; nutrient drinks consume shared inventory",()=>{
    const drinks=starterDrinks([milk,fruit]);
    expect(drinks).toHaveLength(3);
    const water=addRecipeToMenu(createDietMenu(distribution),distribution,"a",drinks[0]);
    expect(calculateMenuStatus(water,distribution).pending).toBe(2);
    expect(recipeHasKnownContributions({...drinks[0],id:"unknown",source:"CUSTOM"})).toBe(false);
    expect(recipeHasKnownContributions({...drinks[2],items:[{...drinks[2].items[0],exchange_contribution:[]}]})).toBe(false);
    const smoothie=addRecipeToMenu(water,distribution,"a",drinks[2]);
    expect(activeMenu(smoothie).meal_menus[0].entries[1].exchange_contributions).toEqual([{group_code:"MILK_SKIM",portions:1},{group_code:"FRUITS",portions:1}]);
    expect(recipeFromEntry(activeMenu(water).meal_menus[0].entries[0])?.source).toBe("CDC_PLAIN_WATER");
  });
  it("never automatically adds beverages and keeps snapshots independent of catalog edits",()=>{
    const beverage=starterDrinks([milk,fruit])[2];
    const menu=addRecipeToMenu(createDietMenu(distribution),distribution,"a",beverage);
    beverage.items[0].amount=99;
    expect(activeMenu(menu).meal_menus[0].entries[0].recipe_snapshot?.items[0].amount).toBe(1);
    expect(proposeDietMenu({menu:createDietMenu(distribution),distribution,foods:[fruit],recipes:starterDrinks([milk,fruit])}).meals.flatMap(m=>m.addedEntries).every(e=>e.type==="food")).toBe(true);
  });
  it("generates distinct repeatable alternatives with exclusions and preserved proposal content",()=>{
    const base=createDietMenu(distribution);
    const input={menu:base,distribution,foods:[fruit,apple],recipes:[]};
    const options=menuAlternatives(input);
    expect(options.length).toBeGreaterThan(1);
    expect(options.map(p=>menuSignature(p.menu))).toEqual(menuAlternatives(input).map(p=>menuSignature(p.menu)));
    expect(new Set(options.map(p=>menuSignature(p.menu))).size).toBe(options.length);
    const selected=activeMenu(options[0].menu).meal_menus[0].entries[0];
    const fixed=withPreservedContent(base,options[0].menu,[selected.id],[]);
    const next=proposeDietMenu({...input,menu:fixed,mode:"replace",fixedEntryIds:[selected.id]});
    expect(activeMenu(next.menu).meal_menus[0].entries.find(e=>e.id===selected.id)).toEqual(selected);
    const restricted=menuAlternatives({...input,restrictions:{excludedFoodIds:["papaya"]}});
    expect(restricted.every(p=>activeMenu(p.menu).meal_menus.flatMap(m=>m.entries).every(e=>e.source_id!=="papaya"))).toBe(true);
  });
  it("does not rescale recipe ingredients independently or force different ingredients in each time",()=>{
    const recipe=asRecipe(fruit);recipe.items.push({...recipe.items[0],id:"milk-i",food_snapshot:createFoodSnapshot(milk),exchange_contribution:exchangeContributionForFood(milk,1),amount:1});
    const changed=adjustRecipeToPending(recipe,[{group_code:"FRUITS",portions:4},{group_code:"MILK_SKIM",portions:.5}]);
    expect(changed.items[0].amount/recipe.items[0].amount).toBe(changed.items[1].amount/recipe.items[1].amount);
    let menu=addFoodToMenu(createDietMenu(distribution),distribution,"a",fruit,1);
    menu=addFoodToMenu(menu,distribution,"b",fruit,1);
    expect(dayObservations(menu)).toContain("Papaya aparece en 2 tiempos. Puedes conservar esta repetición.");
  });
});
