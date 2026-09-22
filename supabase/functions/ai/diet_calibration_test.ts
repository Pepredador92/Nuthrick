// Replays the one successful real response offline. No network permissions.
import {strict as assert} from 'node:assert';
import recorded from './fixtures/diet-real-calibration.json' with {type:'json'};
import {verifyDietSnapshot,validateSnapshot,type DietSnapshot} from './diet.ts';

Deno.test('real B correction: original immutable snapshot, references, schema and totals',async()=>{
  const snapshot=await verifyDietSnapshot(recorded.snapshot as unknown as DietSnapshot);
  const result=validateSnapshot(recorded.output,snapshot);
  assert.equal(result.status,'valid');assert.deepEqual(result.issues,[]);
  assert.deepEqual(result.totals,{energy_kcal:1730,carbohydrate_g:233,protein_g:91,fat_g:47});
  assert.equal(result.requiresTargetReview,true);assert.equal(result.draft!.status,'editing');
  assert.equal(result.draft!.confirmed_at,null);
});
Deno.test('real B excludes all forbidden direct foods AND recipe ingredients',()=>{
  const excluded=Object.keys(recorded.snapshot.plan.diet_menu.food_preferences);
  const candidates=recorded.snapshot.prepared.manifest.meals.flatMap(m=>m.candidates);
  assert.ok(excluded.length>=2);
  for(const entry of candidates){
    const c=entry.candidate as {sourceId:string;type:string;recipe?:{items:Array<{food_item_id:string}>}};
    if(c.type==='food')assert.ok(!excluded.includes(c.sourceId));
    for(const item of c.recipe?.items??[])assert.ok(!excluded.includes(item.food_item_id));
  }
});
Deno.test('real accounting evidence agrees with configured rates and exact total',()=>{
  assert.equal(recorded.usage.total_tokens,recorded.usage.input_tokens+recorded.usage.output_tokens);
  assert.equal(recorded.cost,(recorded.usage.input_tokens*2+recorded.usage.output_tokens*12)/1e6);
  assert.equal(recorded.requestedModel,'gpt-5.6-terra');assert.equal(recorded.returnedModel,'gpt-5.6-terra');
});
