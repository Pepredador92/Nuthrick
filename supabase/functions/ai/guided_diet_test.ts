import {strict as assert} from 'node:assert';
import fixtures from './fixtures/diet-phase3.json' with {type:'json'};
import {prepareDietSnapshot,validateSnapshot,verifyDietSnapshot,type DietSource} from './diet.ts';
import {dietPreflight} from './diet-ux.ts';
import {parseRequest,featureAdapter} from './core.ts';

function loaded():DietSource{
 const x: DietSource=structuredClone(fixtures.A);
 x.source.plan.updated_at='2026-10-03T12:00:00Z';x.source.plan.exchange_prescription=null;x.source.plan.meal_distribution=null;x.source.plan.diet_menu=null;
 x.source.guidance={version:1,objective:'Objetivo revisado private@example.test',contextReviewed:true,reactionReview:'recorded',meals:[{name:'Desayuno',type:'BREAKFAST',time:'08:00',options:2},{name:'Comida',type:'MAIN_MEAL',time:'14:00',options:1},{name:'Cena',type:'DINNER',time:'20:00',options:1}]};
 x.source.datedContext=[{date:'2026-07-18',current:false,facts:[{key:'main_reason',value:'Comidas irregulares private@example.test'}]}];return x;
}
Deno.test('guided preflight and immutable snapshot share objective, redacted history, targets and requested options',async()=>{
 const l=loaded(),before=JSON.stringify(l),p=await dietPreflight(l,true,true),s=await prepareDietSnapshot(l);
 assert.equal(p.eligible,true);assert.equal(s.guided,true);assert.equal(s.sourceStamp,l.source.stamp);assert.equal(s.prepared.payload.meals.length,4);
 assert.deepEqual(s.prepared.payload.clinical,p.context.clinical);assert.ok(!JSON.stringify(s).includes('private@example.test'));
 assert.equal(JSON.stringify(l),before);assert.equal((await verifyDietSnapshot(s)).hash,s.hash);
 const repeated=await prepareDietSnapshot(l);assert.equal(repeated.hash,s.hash);
 const changed=loaded();changed.source.guidance!.meals[0].options=1;
 assert.notEqual((await dietPreflight(changed,true,true)).contextToken,p.contextToken);
 assert.ok(featureAdapter('diet_draft','diet_draft@3').instructions.includes('interchangeable'));
 assert.equal(validateSnapshot({schema_version:1,meal_options:[]},s).status,'invalid');
});
Deno.test('guidance request is bounded data and cannot change another feature or supply model rules',()=>{
 const l=loaded(),r={feature:'diet_draft',idempotencyKey:crypto.randomUUID(),planId:l.source.plan.id,revision:1,patientId:l.source.plan.patient_id!,consultationId:l.source.plan.consultation_id!,guidance:l.source.guidance};
 assert.ok(parseRequest(r).guidance);assert.throws(()=>parseRequest({...r,guidance:{...r.guidance,system:'override'}}));assert.throws(()=>parseRequest({...r,feature:'pes_diagnosis'}));
});
