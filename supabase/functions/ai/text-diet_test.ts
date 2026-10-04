import {strict as assert} from 'node:assert';
import fixtures from './fixtures/diet-phase3.json' with {type:'json'};
import {prepareTextDietSnapshot,textDietPreflight,validateTextDietOutput,verifyTextDietSnapshot,type TextDietSource} from './text-diet.ts';
import {textDietAdapter} from './text-diet-contract.ts';
import {DietRoutingProvider} from './diet.ts';
import {runAIRequest,parseRequest,validOutput,featureAdapter,type AIStore,type FeatureConfig,type ProviderInput} from './core.ts';
import type {TextDietGuidance} from '../_shared/text-diet.ts';

const guidance=(count:number):TextDietGuidance=>({version:1,dietCount:count,objective:'Organizar comidas prácticas',contextReviewed:true,restrictionsReviewed:true,restrictions:'Sin alergias confirmadas; conservar restricciones documentadas.',meals:[{name:'Desayuno',time:'08:00'},{name:'Comida',time:'14:00'},{name:'Cena',time:null}]});
const output=(count:number)=>({diets:Array.from({length:count},(_,i)=>({meals:['Desayuno','Comida','Cena'].map((_,j)=>({title:`Platillo ${i}-${j}`,ingredients:[`1 taza de ${['frijoles','lentejas','garbanzos','arroz','calabacitas','zanahoria','chayote'][i]}`,`${j+1} tortillas de maíz`],preparation:'Calentar y servir.'}))}))});
for(const n of [1,3,7])Deno.test(`text diet ${n}: full days, no catalog, clinical privacy, immutable contract`,async()=>{
 const f=structuredClone(fixtures.A);f.source.plan.exchange_prescription=null as never;f.source.plan.meal_distribution=null as never;f.source.catalog=undefined as never;
 const s=await prepareTextDietSnapshot(f,guidance(n),'Ingredientes de abarrotes');await verifyTextDietSnapshot(s);
 assert.ok(!JSON.stringify(s.payload).includes('candidate_ref'));
 for(const hidden of [...f.identifiers,f.source.plan.id,f.source.plan.patient_id])assert.ok(!JSON.stringify(s.payload).includes(hidden));
 assert.equal(s.payload.clinical.objective.fact.state,'known');assert.equal(s.payload.prescription.energy_kcal.fact.state,'known');
 const draft=validateTextDietOutput(output(n),s)!;assert.equal(draft.diets.length,n);assert.equal(draft.reviewed_at,null);
 assert.ok(draft.diets.every(d=>d.text.includes('Desayuno · 08:00')&&d.text.includes('Comida · 14:00')&&d.text.includes('Cena')));
 const tampered=structuredClone(s);tampered.payload.diet_count=2;await assert.rejects(()=>verifyTextDietSnapshot(tampered),/snapshot_invalid/);
 const incomplete=output(n);incomplete.diets.pop();assert.equal(validateTextDietOutput(incomplete,s),null);
 const missingMeal=output(n);missingMeal.diets[0].meals.pop();assert.equal(validateTextDietOutput(missingMeal,s),null);
});
Deno.test('text rejects repeated whole diets even when renamed, reordered or quantities changed',async()=>{
 const s=await prepareTextDietSnapshot(fixtures.A,guidance(3),'');const o=output(3);
 o.diets[1]=structuredClone(o.diets[0]);o.diets[1].meals.reverse();o.diets[1].meals.forEach(m=>{m.title='Otro nombre';m.ingredients=m.ingredients.map(x=>x.replace('1 taza','2 tazas'));});
 assert.equal(validateTextDietOutput(o,s),null);
 assert.ok(validOutput(textDietAdapter.schema,output(7)));
 assert.ok(!validOutput(textDietAdapter.schema,{...output(1),energy:2000}));
});
Deno.test('context review and restrictions required; client cannot replace server prescriptions',async()=>{
 const g=guidance(3);g.restrictionsReviewed=false;assert.equal((await textDietPreflight(fixtures.A,g,'')).eligible,false);
 await assert.rejects(()=>prepareTextDietSnapshot(fixtures.A,g,''),/text_restrictions_required/);
 const r={feature:'diet_draft',idempotencyKey:crypto.randomUUID(),planId:fixtures.A.source.plan.id,revision:1,textGuidance:guidance(3)};
 for(const field of ['model','owner','target_calories','catalog','payload'])assert.throws(()=>parseRequest({...r,[field]:'override'}));
 assert.throws(()=>parseRequest({...r,textGuidance:{...guidance(3),dietCount:8}}));
 assert.throws(()=>featureAdapter('diet_draft','diet_draft@3',true));
 assert.notDeepEqual(featureAdapter('diet_draft','diet_draft@4').schema,textDietAdapter.schema,'legacy sessions retain their schema');
});
Deno.test('new format uses strict real adapter path; retry does not dispatch or charge twice',async()=>{
 const g=guidance(7),snapshot=await prepareTextDietSnapshot(fixtures.A,g,'');
 const config:FeatureConfig={feature:'diet_draft',enabled:true,provider:'openai',model:'gpt-5.6-terra',prompt_version:'diet_draft@4',max_input_tokens:24000,max_output_tokens:16000,timeout_ms:90000,reasoning_level:'low',temperature:null};
 let reserves=0,dispatches=0,settles=0;const usage={input_tokens:100,output_tokens:3000,cached_tokens:0};
 const store:AIStore={config:async()=>config,context:async()=>({stamp:snapshot.sourceStamp,context:snapshot.payload}),bindContext:async()=>{},reserve:async()=>({created:++reserves===1,generation:{id:'synthetic',status:reserves===1?'reserved':'succeeded',charged_credits:0}}),claim:async()=>true,settle:async(_id,status,u)=>{assert.equal(status,'succeeded');assert.deepEqual(u,usage);settles++;return{id:'synthetic',status,charged_credits:5};},uncertain:async()=>{throw Error('unexpected uncertainty');},validateOutput:o=>!!validateTextDietOutput(o,snapshot)};
 const provider=new DietRoutingProvider({run:async(i:ProviderInput)=>{dispatches++;assert.deepEqual(i.schema,textDietAdapter.schema);assert.equal((i.context as {format:string}).format,'text_diet');assert.ok(!JSON.stringify(i.context).includes('candidate_ref'));return{status:'completed',output:output(7),usage,responseId:'synthetic'};}});
 const request={feature:'diet_draft',idempotencyKey:crypto.randomUUID(),planId:fixtures.A.source.plan.id,revision:1,textGuidance:g};
 await runAIRequest(request,store,provider);await runAIRequest(request,store,provider);assert.equal(dispatches,1);assert.equal(settles,1);
});
Deno.test('review preflight resolves dated interview facts and structured current objectives',async()=>{
 const f:TextDietSource=structuredClone(fixtures.A);f.source.answers={};f.source.consultation.objective=null as never;f.source.objectiveSuggestion=undefined;
 f.source.datedContext=[{date:'2026-10-03',current:true,facts:[{key:'next_objectives',value:[{objetivo:'Organizar comidas para llevar.',prioridad:'PRIVADO_NO_ENVIAR'}]}]},{date:'2026-08-01',current:false,facts:[]},{date:'2026-07-18',current:false,facts:[{key:'food_reactions_status',value:'No'},{key:'eating_preferences',value:['Omnívoro']},{key:'treatment_objective',value:'Objetivo anterior.'}]}];
 const g={...guidance(3),objective:'',contextReviewed:false,restrictions:'',restrictionsReviewed:false};
 const p=await textDietPreflight(f,g,'');
 assert.deepEqual(p.context.restrictions.reaction_status.fact,{state:'known',value:'No'});
 assert.equal(p.context.restrictions.reaction_status.origin.date,'2026-07-18');assert.equal(p.context.restrictions.reaction_status.origin.historical,true);
 assert.deepEqual(p.context.preferences.eating_pattern.fact,{state:'known',value:['Omnívoro']});
 assert.equal(p.context.clinical.objectiveSuggestion,'Organizar comidas para llevar.');
 assert.deepEqual(p.context.clinical.objectiveSuggestionOrigin,{date:'2026-10-03',historical:false});
 assert.ok(!p.eligible,'autofill does not grant professional confirmation');
 assert.deepEqual(f.source.answers,{},'source is not mutated');
 f.source.answers={food_reactions_status:{value:'Prefiere no responder',response_area:'patient_reported'}};
 assert.equal((await textDietPreflight(f,g,'')).context.restrictions.reaction_status.fact.state,'unknown','a current explicit unknown must not become a historical No');
 f.source.datedContext=[{date:'2026-10-03',current:true,facts:[]}];f.source.answers={};
 assert.equal((await textDietPreflight(f,g,'')).context.restrictions.reaction_status.fact.state,'unavailable','missing does not mean no allergies');
});
