// Original A/C provider responses, replayed without network or database access.
import {strict as assert} from 'node:assert';
import recordings from './fixtures/diet-real-phase31.json' with {type:'json'};
import {verifyDietSnapshot,validateSnapshot,type DietSnapshot} from './diet.ts';

for(const r of recordings) {
  Deno.test(`real ${r.case}: immutable original snapshot, catalog recalculation and editable draft`,async()=>{
    const snapshot=await verifyDietSnapshot(r.snapshot as unknown as DietSnapshot);
    const before=JSON.stringify(snapshot);
    const v=validateSnapshot(r.output,snapshot);
    assert.equal(v.status,'valid');assert.deepEqual(v.issues,[]);
    assert.deepEqual(v.totals,{energy_kcal:1730,carbohydrate_g:233,protein_g:91,fat_g:47});
    assert.deepEqual(v.totals,r.validation.totals);assert.deepEqual(v.differences,r.validation.differences);
    assert.equal(v.requiresTargetReview,true);assert.equal(JSON.stringify(snapshot),before);
    assert.equal(r.planStatus,'draft');assert.equal(r.publishedVersions,0);
    assert.equal(r.appliedMenu.status,'editing');assert.equal(r.appliedMenu.confirmed_at,null);
    assert.equal(r.appliedMenu.week_plan,null);
    assert.ok(r.appliedMenu.meal_options.every(m=>m.status==='draft'&&m.confirmed_at===null));
    assert.equal(snapshot.hasManualMenu,false);
    const altered=structuredClone(r.snapshot);altered.sourceStamp='changed';
    await assert.rejects(()=>verifyDietSnapshot(altered as unknown as DietSnapshot),/snapshot_invalid/);
  });
  Deno.test(`real ${r.case}: every meal, candidate, portion, multiplier and converted unit belongs to its snapshot`,()=>{
    assert.equal(r.output.meal_options.length,r.snapshot.prepared.manifest.meals.length);
    for(const option of r.output.meal_options) {
      const meal=r.snapshot.prepared.manifest.meals.find(m=>m.ref===option.meal_ref)!;
      assert.ok(meal);
      const draft=r.appliedMenu.meal_options.find(m=>m.meal_time_id===meal.id)!;
      assert.ok(draft);assert.equal(draft.entries.length,option.entries.length);
      option.entries.forEach((entry,i)=>{
        const candidate=meal.candidates.find(c=>c.ref===entry.candidate_ref)!.candidate;
        assert.ok(candidate);assert.equal(entry.portion_ref,'base');
        assert.ok(candidate.multipliers.includes(entry.multiplier));
        assert.equal(draft.entries[i].source_id,candidate.sourceId);
        assert.equal(draft.entries[i].unit,candidate.unit);
        assert.ok(Math.abs(draft.entries[i].quantity-candidate.baseQuantity*entry.multiplier)<1e-9);
      });
    }
  });
  Deno.test(`real ${r.case}: usage cost, one charge and full release of reservation`,()=>{
    assert.equal(r.requestedModel,'gpt-5.6-terra');assert.equal(r.returnedModel,r.requestedModel);
    assert.equal(r.usage.total_tokens,r.usage.input_tokens+r.usage.output_tokens);
    assert.equal(r.usage.input_tokens_details.cached_tokens,0);
    assert.equal(r.cost,(r.usage.input_tokens*2+r.usage.output_tokens*12)/1e6);
    assert.deepEqual(r.credits.map(c=>c.type).sort(),['RELEASE','RESERVE','USAGE']);
    assert.equal(r.credits.reduce((sum,c)=>sum+c.reserved_purchased_delta,0),0);
    const usage=r.credits.find(c=>c.type==='USAGE')!;
    assert.equal(-usage.purchased_delta,Math.ceil(r.cost*100*1000)/1000);
  });
}
Deno.test('real C: unknown is not false/true; absent optional facts stay absent and no preferences are invented',()=>{
  const c=recordings.find(r=>r.case==='C')!;
  const payload=c.snapshot.prepared.payload;
  assert.deepEqual(payload.preferences.eating_pattern.fact,{state:'unknown',reason:'not_recalled'});
  assert.deepEqual(payload.preferences.foods.fact,{state:'unavailable',reason:'missing'});
  for(const item of Object.values(payload.routine))assert.deepEqual(item.fact,{state:'unavailable',reason:'missing'});
  assert.deepEqual(c.appliedMenu.food_preferences,{});
  // Output can only select catalog references, never rewrite patient facts.
  assert.deepEqual(Object.keys(c.output).sort(),['meal_options','schema_version']);
  for(const meal of c.output.meal_options)for(const entry of meal.entries)
    assert.deepEqual(Object.keys(entry).sort(),['candidate_ref','multiplier','portion_ref']);
});
