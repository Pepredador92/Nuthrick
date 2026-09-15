import { expect, it } from "vitest";
import { weeklyFixture } from "../../../tests/fixtures/weeklyMenu";
import { activeMenu, addFoodToMenu, addRecipeToMenu, createDietMenu, createFoodSnapshot, exchangeContributionForFood, removeMenuEntry } from "./model";
import { emptyIntent, recordPreviewEdit } from "./exploration";
import { menuSignature } from "./mesa";
import { preparationKey } from "./composition";
import { proposeDietMenu } from "./planner";
import { normalizeCatalogPortion, formatFoodQuantity, foodUnitLabels } from "./units";
import { commitOptionEdits, projectOptions, restoreOptionEdits } from "./options";
import type { Recipe } from "@/src/types/domain";
import audit from "../../../../docs/smae-candidate-decisions.json";

it("rejects a food inside new recipes but rejects a preparation without banning its ingredients", () => {
  const { foods, distribution } = weeklyFixture(); const fruit=foods[0];
  const recipe:Recipe={id:"A",owner_id:null,stable_code:null,name:"Fruta preparada",normalized_name:"fruta preparada",description:null,meal_types:["BREAKFAST"],servings:1,instructions:null,image_path:null,tags:[],substitution_notes:null,source:"TEST",source_version:"1",source_reference:null,is_custom:false,active:true,created_at:"",updated_at:"",items:[{id:"item",owner_id:null,recipe_id:"A",food_item_id:fruit.id,amount:1,unit:fruit.portion_unit,display_order:0,food_snapshot:createFoodSnapshot(fruit),exchange_contribution:exchangeContributionForFood(fruit,1),created_at:""}]};
  const base=createDietMenu(distribution);
  const withFood=addFoodToMenu(base,distribution,"breakfast",fruit,1,"entry");
  const intent=recordPreviewEdit(withFood,removeMenuEntry(withFood,distribution,"entry"),"breakfast",emptyIntent());
  const generated=proposeDietMenu({menu:base,distribution,foods,recipes:[recipe],mealTimeId:"breakfast",rejectedFoodIds:intent.rejectedFoodIds});
  expect(activeMenu(generated.menu).meal_menus[0].entries.flatMap(e=>e.food_snapshot?[e.food_snapshot.id]:e.recipe_snapshot!.items.map(i=>i.food_snapshot.id))).not.toContain(fruit.id);
  const withRecipe=addRecipeToMenu(base,distribution,"breakfast",recipe,1,"recipe-entry");
  const rejected=recordPreviewEdit(withRecipe,removeMenuEntry(withRecipe,distribution,"recipe-entry"),"breakfast",emptyIntent());
  expect(rejected.rejectedFoodIds).toEqual([]);
  const copy={...recipe,id:"copy",name:"Otro nombre",servings:2,items:recipe.items.map(i=>({...i,id:"new-item",amount:2}))};
  expect(preparationKey(copy)).toBe(preparationKey(recipe));
  const next=proposeDietMenu({menu:base,distribution,foods:[fruit],recipes:[copy],mealTimeId:"breakfast",rejectedPreparations:rejected.rejectedPreparations});
  expect(activeMenu(next.menu).meal_menus[0].entries[0].type).toBe("food");
  expect(menuSignature(withRecipe)).toBe(menuSignature(addRecipeToMenu(base,distribution,"breakfast",copy,1,"transient")));
});

it("applying and undoing one option preserves later edits to other meal times", () => {
  const {menu,distribution,foods}=weeklyFixture();
  const before=projectOptions(menu,distribution,{});
  const changedLunch=addFoodToMenu(before,distribution,"lunch",foods.find(f=>f.group_code==="VEGETABLES")!,0.5);
  expect(menuSignature(changedLunch,"breakfast")).toBe(menuSignature(before,"breakfast"));
  expect(menuSignature(changedLunch)).not.toBe(menuSignature(before));
  const root=commitOptionEdits(menu,changedLunch,distribution,{},"lunch");
  const previewBreakfast=addFoodToMenu(before,distribution,"breakfast",foods[0],0.5);
  const applied=commitOptionEdits(root,previewBreakfast,distribution,{},"breakfast");
  expect(applied.meal_options!.find(o=>o.id==="lunch-0")).toEqual(root.meal_options!.find(o=>o.id==="lunch-0"));
  const undone=restoreOptionEdits(applied,before,distribution,{},"breakfast");
  expect(undone.meal_options!.find(o=>o.id==="lunch-0")).toEqual(root.meal_options!.find(o=>o.id==="lunch-0"));
  expect(undone.meal_options!.find(o=>o.id==="breakfast-0")).toEqual(menu.meal_options!.find(o=>o.id==="breakfast-0"));
});

it("preserves rational thirds and halves as a distinct unit without inventing a conversion", () => {
  const {foods}=weeklyFixture();
  const original={...foods[0],portion_amount:0.333,portion_fraction:{numerator:1,denominator:3,original:"1/3 pieza"}};
  const normalized=normalizeCatalogPortion(original);
  expect(exchangeContributionForFood(normalized,1)).toEqual([{group_code:"FRUITS",portions:3}]);
  expect(original.portion_amount).toBe(.333);
  expect(formatFoodQuantity(normalized.portion_amount)).toBe("⅓");
  expect(foodUnitLabels.half).toBe("mitades");
  expect(exchangeContributionForFood({...foods[0],portion_unit:"half",portion_amount:15},15)[0].portions).toBe(1);
});

it("accounts for all 179 candidates once, including revised conflicts and verified additions", () => {
  expect(audit.candidates).toHaveLength(179);
  expect(new Set(audit.candidates.map(c=>c.candidate)).size).toBe(179);
  for (const [decision,count] of Object.entries(audit.counts)) expect(audit.candidates.filter(c=>c.decision===decision)).toHaveLength(count);
  expect(audit.candidates.find(c=>c.candidate===162)?.decision).toBe("conflicto");
  expect(audit.candidates.find(c=>c.candidate===88)?.decision).toBe("conflicto");
});
