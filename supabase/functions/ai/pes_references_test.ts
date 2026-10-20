import { strict as assert } from 'node:assert';
import { runAIRequest, validOutput, type AIStore, type FeatureConfig, type Generation } from './core.ts';
import { pesSchema } from './clinical.ts';
import { normalizeReferencedPes, referencedPesContext } from './pes-references.ts';

const facts=[
  {source:'Entrevista · patrón',finding:'Refiere omitir comidas durante la jornada laboral.'},
  {source:'Entrevista · sueño',finding:'Duerme 5–6 horas.'},
  {source:'Entrevista · medicación',finding:'Tratamiento diario referido desde hace más de 1 año.'},
  {source:'Dato de ficha · Peso',finding:'100.00 kg; fecha de medición no registrada.'},
  {source:'Dato de ficha · Estatura',finding:'165.00 cm; fecha de medición no registrada.'},
];
const raw={problem:'Patrón alimentario irregular',etiology:'posible influencia de la jornada laboral',signsSymptoms:['Omisión de comidas referida durante el trabajo.'],
  pesStatement:'Texto que el servidor recompone',evidenceFactIds:['f1'],missingContext:[],uncertainties:[
    {text:'Sueño referido de 5–6 horas.',evidenceFactIds:['f2']},
    {text:'Tratamiento diario referido desde hace más de 1 año.',evidenceFactIds:['f3']},
    {text:'Peso de ficha de 100.00 kg y estatura de 165.00 cm sin fecha.',evidenceFactIds:['f4','f5']},
  ]};
const config:FeatureConfig={feature:'pes_diagnosis',enabled:true,provider:'openai',model:'test-model',prompt_version:'pes_diagnosis@8',max_input_tokens:8192,max_output_tokens:4096,timeout_ms:1000,reasoning_level:'low',temperature:null};
const request={feature:'pes_diagnosis',idempotencyKey:'reference-test',consultationId:'consultation',patientId:'patient',revision:1};
const result=(output:unknown)=>({status:'completed',output,usage:{input_tokens:20,output_tokens:10,cached_tokens:0},responseId:'test-response'});
function memoryStore() {
  const state={generation:null as Generation|null,refunds:0,settlements:[] as unknown[]};
  const store:AIStore={
    config:async()=>config,context:async()=>({context:{facts},stamp:'current'}),bindContext:async()=>{},
    reserve:async()=>{const created=!state.generation;state.generation??={id:'generation',status:'reserved',charged_credits:0};return{generation:state.generation,created};},
    claim:async()=>{state.generation!.status='running';return true;},
    settle:async(_id,status,usage)=>{state.settlements.push(usage);state.generation!.status=status;state.generation!.charged_credits=0.01;return state.generation!;},
    uncertain:async()=>{state.generation!.status='uncertain';},refundInvalidPes:async()=>{state.refunds++;return 0.01;},
  };
  return {store,state};
}
Deno.test('PES @8 delivers the same public draft with exact source evidence for supplementary findings',async()=>{
  const {store,state}=memoryStore();
  const delivered=await runAIRequest(request,store,{run:async input=>{
    assert.deepEqual((input.context as {facts:{id:string}[]}).facts.map(f=>f.id),['f1','f2','f3','f4','f5']);
    return result(raw);
  }});
  assert.equal(validOutput(pesSchema,delivered.output),true);
  const output=delivered.output as {evidence:typeof facts;uncertainties:string[];pesStatement:string};
  assert.deepEqual(output.evidence,facts);
  assert.deepEqual(output.uncertainties,raw.uncertainties.map(n=>n.text));
  assert.ok(!JSON.stringify(output).includes('evidenceFactIds'));
  assert.equal(state.refunds,0);assert.deepEqual(state.settlements,[result(raw).usage]);
});
Deno.test('an unverifiable supplementary note cannot block a supported PES or leak unsupported text',()=>{
  const output=normalizeReferencedPes({...raw,uncertainties:[...raw.uncertainties,{text:'Unsupported clinical claim 999.',evidenceFactIds:['f999']}]},referencedPesContext({facts}))!;
  assert.equal(validOutput(pesSchema,output),true);
  assert.ok(!JSON.stringify(output).includes('Unsupported clinical claim'));
  assert.match(output.uncertainties.at(-1)!,/no pudieron vincularse/);
  assert.equal(output.problem,raw.problem);
});
for(const [name,output] of [
  ['unknown primary reference',{...raw,evidenceFactIds:['f999']}],
  ['unsupported primary number',{...raw,signsSymptoms:['Pérdida del 99 %']}],
  ['wrong provider contract',{problem:'P',etiology:'E',signsSymptoms:['S'],pesStatement:'P relacionado con E, evidenciado por S.',evidence:[facts[0]],missingContext:[],uncertainties:[]}],
] as const) {
  Deno.test(`PES @8 refunds rejected ${name} once while retaining actual usage`,async()=>{
    const {store,state}=memoryStore();let calls=0;
    const provider={run:async()=>{calls++;return result(output);}};
    await assert.rejects(()=>runAIRequest(request,store,provider),/invalid_output_refunded/);
    assert.equal(state.generation!.status,'invalid_output');assert.equal(state.refunds,1);
    assert.deepEqual(state.settlements,[result(output).usage]);
    assert.equal((await runAIRequest(request,store,provider)).replay,true);
    assert.equal(calls,1);assert.equal(state.refunds,1);
  });
}
Deno.test('PES @8 never claims a refund when its confirmation fails',async()=>{
  const {store,state}=memoryStore();store.refundInvalidPes=async()=>{throw new Error('unavailable');};
  await assert.rejects(()=>runAIRequest(request,store,{run:async()=>result({})}),/invalid_output_refund_pending/);
  assert.equal(state.generation!.status,'invalid_output');assert.equal(state.settlements.length,1);
});
Deno.test('PES @8 refuses dispatch when no refund handler is configured',async()=>{
  const {store,state}=memoryStore();delete store.refundInvalidPes;let calls=0;
  await assert.rejects(()=>runAIRequest(request,store,{run:async()=>{calls++;return result(raw);}}),/configuration_required/);
  assert.equal(calls,0);assert.equal(state.generation,null);
});
