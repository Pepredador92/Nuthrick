import { strict as assert } from 'node:assert';
import { type AIStore, type FeatureConfig, runAIRequest, validOutput } from './core.ts';
import {
  normalizeObjectiveProposals,
  normalizedObjectiveProposalsSchema,
  objectiveProposalsSchema,
} from './objective-proposals.ts';

const context = {
  approvedPes: {
    etiology: 'Dificultad para organizar las comidas durante el trabajo.',
    signsSymptoms: 'Omisión de comidas durante la jornada laboral.',
  },
  facts: [
    {id:'f1',source:'PES actual aprobado · Etiología',finding:'Dificultad para organizar las comidas durante el trabajo.'},
    {id:'f2',source:'PES actual aprobado · Signos y síntomas',finding:'Omisión de comidas durante la jornada laboral.'},
    {id:'f3',source:'Entrevista · objectives',finding:'Meta acordada: 75 kg; revisar en 4 semanas'},
  ],
};
const proposal = {
  outcome: 'Reconocer qué situaciones del trabajo dificultan tus comidas para que podamos elegir juntos un cambio que se adapte a tus horarios y a los recursos con los que cuentas.',
  indicator: 'En un registro sencillo, anota si pudiste realizar tus comidas, qué situación facilitó o dificultó comer y qué alternativa te resultó posible en ese momento.',
  target: 'Lleva a la revisión un registro de varios días de trabajo que permita reconocer qué situaciones dificultan tus comidas y conversar sobre un cambio posible.',
  timeframe: 'Proponemos revisar el registro a los 7–14 días y reevaluar el objetivo en 2–4 semanas, ajustando el plazo contigo.',
  monitoring: 'Revisaremos juntos tus anotaciones y las dificultades que encontraste para decidir qué cambio puedes probar, sin dar por hecho que ya se modificó tu alimentación ni atribuirte hábitos que no has descrito.',
  feasibility: '',
  signFactId: 'f2', baselineFactId: 'f2', evidenceFactIds: ['f1','f2'],
};

Deno.test('complete objectives beyond the former field caps survive schema and normalization without clipping', () => {
  const output = {objectives:[proposal]};
  assert(proposal.indicator.length > 140);
  assert(proposal.timeframe.length > 80);
  assert(proposal.monitoring.length > 180);
  assert.equal(validOutput(objectiveProposalsSchema,output),true);
  const normalized = normalizeObjectiveProposals(output,context)!;
  assert.equal(validOutput(normalizedObjectiveProposalsSchema,normalized),true);
  for(const field of ['outcome','indicator','target','timeframe','monitoring'] as const) {
    assert.equal(normalized.objectives[0][field],proposal[field]);
  }
  assert.equal(normalized.objectives[0].etiology,context.approvedPes.etiology);
  assert.equal(normalized.objectives[0].sign,context.approvedPes.signsSymptoms);
});

Deno.test('valid JSON containing a cut sentence or ellipsis is not accepted as a complete objective', () => {
  for(const field of ['outcome','indicator','target','timeframe','monitoring','feasibility'] as const) {
    for(const cut of ['Revisaremos el registro a los 7–14 días y reevaluaremos el objetivo en 2–4 s; el','Anota qué ocurrió y...','Anota qué ocurrió…']) {
      assert.equal(validOutput(objectiveProposalsSchema,{objectives:[{...proposal,[field]:cut}]}),false,field);
    }
  }
});

Deno.test('punctuation does not turn a documented clinical target into a new prescription', () => {
  const output = {objectives:[{...proposal,target:'75 kg.',timeframe:'4 semanas.',evidenceFactIds:['f1','f2','f3']}]};
  assert.equal(validOutput(objectiveProposalsSchema,output),true);
  const normalized = normalizeObjectiveProposals(output,context)!;
  assert.equal(normalized.objectives[0].target,'75 kg.');
  assert.equal(normalized.objectives[0].targetOrigin,'documented');
  assert.equal(normalized.objectives[0].timeframeOrigin,'documented');
  assert.equal(normalizeObjectiveProposals({objectives:[{...output.objectives[0],target:'70 kg.'}]},context),null);
});

Deno.test('fields exceeding persistence capacity are rejected rather than shortened', () => {
  assert.equal(validOutput(objectiveProposalsSchema,{objectives:[{...proposal,monitoring:'Anota '.repeat(80)+'lo que ocurrió.'}]}),false);
});

Deno.test('objective generation retains actual usage and refunds an unfinished draft without applying it', async () => {
  const config:FeatureConfig = {feature:'consultation_support',enabled:true,provider:'openai',model:'test-model',prompt_version:'consultation_support@6',max_input_tokens:8000,max_output_tokens:2000,timeout_ms:1000,reasoning_level:null,temperature:null};
  const usage = {input_tokens:900,output_tokens:420,cached_tokens:0};
  for(const unfinished of [false,true]) {
    let refunded = false;
    const settlements:{status:string;usage:unknown}[] = [];
    const recorded:boolean[] = [];
    const store:AIStore = {
      config:()=>Promise.resolve(config),
      context:()=>Promise.resolve({context,stamp:'synthetic'}),
      bindContext:()=>Promise.resolve(),
      reserve:()=>Promise.resolve({created:true,generation:{id:'synthetic-generation',status:'reserved',charged_credits:0}}),
      claim:()=>Promise.resolve(true),
      settle:(_id,status,actual)=>{settlements.push({status,usage:actual});return Promise.resolve({id:'synthetic-generation',status,charged_credits:0});},
      uncertain:()=>Promise.resolve(),
      recordResult:(_id,_result,valid)=>{recorded.push(valid);return Promise.resolve();},
      refundInvalidObjectives:()=>{refunded=true;return Promise.resolve(1);},
    };
    const output = {objectives:[{...proposal,...(unfinished?{timeframe:'Revisaremos a los 7–14 días y reevaluaremos en'}:{})}]};
    const generate = ()=>runAIRequest({feature:'consultation_support',revision:1,idempotencyKey:'00000000-0000-4000-8000-000000000001'},store,{run:()=>Promise.resolve({status:'completed',responseId:'synthetic-response',usage,output})});
    if(unfinished) await assert.rejects(generate,/objective_output_invalid_refunded/);
    else assert.equal((await generate()).status,'succeeded');
    assert.deepEqual(recorded,[!unfinished]);
    assert.deepEqual(settlements,[{status:unfinished?'invalid_output':'succeeded',usage}]);
    assert.equal(refunded,unfinished);
  }
});
