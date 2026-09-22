import {strict as assert} from 'node:assert';
import {buildDietWorkshopClinicalContext,sanitizeWorkshopValue,signWorkshop,verifyWorkshop,workshopAdapter,type WorkshopSource} from './workshop.ts';
import {validOutput,parseRequest,runAIRequest,type AIStore,type FeatureConfig,AIError} from './core.ts';
const source={plan:{target_calories:2000,macro_distribution:{macros:{CARBOHYDRATE:{grams:250},PROTEIN:{grams:100},FAT:{grams:60}}}},identifiers:['Nombre Paciente','paciente@example.com','5551234567'],facts:{daily_schedule:'Nombre Paciente come en casa; email paciente@example.com; teléfono 5551234567; dirección: calle ficticia'},goal:'Mantener hábitos',approvedPes:'PES aprobado',recall:[{food:'Frijoles'}],anthropometry:[{value:70,unit:'kg'}],labs:[{numeric_value:90,unit:'mg/dL'}],foods:[],recipes:[],stamp:'internal'} as WorkshopSource;
for(const omitted of [null,'goal','approvedPes','recall','labs','anthropometry'] as const)Deno.test(`compact context supports optional ${omitted}`,()=>{
 const input={...source};if(omitted==='labs'||omitted==='anthropometry')input[omitted]=[];else if(omitted)delete input[omitted];
 const context=JSON.stringify(buildDietWorkshopClinicalContext(input));
 assert(!/Nombre Paciente|paciente@example.com|5551234567|calle ficticia|internal/.test(context));assert(context.includes('2000'));
});
Deno.test('sanitization preserves nested candidate food quantities without identifiers',()=>{
 const value={candidates:[{meals:[{foods:[{name:'Frijoles Nombre Paciente',quantity:1,unit:'taza'}]}]}]};
 assert.deepEqual(sanitizeWorkshopValue(value,source.identifiers),{candidates:[{meals:[{foods:[{name:'Frijoles [dato omitido]',quantity:1,unit:'taza'}]}]}]});
});
Deno.test('signed preview rejects tampering and expiration',async()=>{
 const token=await signWorkshop({owner:'test',expires:Date.now()+10000},'fixture-key');
 assert.equal((await verifyWorkshop(token.payload,token.signature,'fixture-key')).owner,'test');
 await assert.rejects(()=>verifyWorkshop(token.payload+' ',token.signature,'fixture-key'));
 const expired=await signWorkshop({expires:0},'fixture-key');await assert.rejects(()=>verifyWorkshop(expired.payload,expired.signature,'fixture-key'));
});
Deno.test('output cannot invent catalog IDs or an arbitrary plan',()=>{
 assert(validOutput(workshopAdapter.schema,{option:0,summary:'Propuesta',warnings:[],assumptions:[]}));
 assert(!validOutput(workshopAdapter.schema,{option:5,summary:'Propuesta',warnings:[],assumptions:[]}));
 assert(!validOutput(workshopAdapter.schema,{option:0,summary:'',warnings:[],assumptions:[],foodItemId:'invented'}));
 assert.throws(()=>parseRequest({feature:'diet_workshop',idempotencyKey:crypto.randomUUID(),planId:'foreign'}));
});
Deno.test('disabled workshop does not reserve or call provider',async()=>{
 const never=()=>{throw new Error('must not reserve');};
 const store:AIStore={config:()=>Promise.resolve({enabled:false} as FeatureConfig),reserve:never,claim:never,settle:never,uncertain:never};
 await assert.rejects(()=>runAIRequest({feature:'diet_workshop',idempotencyKey:crypto.randomUUID()},store,{run:()=>{throw new Error('must not call');}}),AIError);
});
