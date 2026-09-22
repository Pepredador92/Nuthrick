// Offline evidence extraction only. NEVER invokes a provider or writes a plan.
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {strict as assert} from 'node:assert';
const keys=['A','B','C','B-corrective'];
const reports=keys.map(k=>JSON.parse(readFileSync(`output/diet-phase3/real-${k}.json`,'utf8')));
const last=reports.at(-1),id=last.ledger.id;
assert.match(id,/^[a-f0-9-]{36}$/);
const row=JSON.parse(execFileSync('docker',['exec','supabase_db_Nuthrick','psql','-X','-U','postgres','-d','postgres','-At','-c',`select jsonb_build_object('snapshot',s.snapshot,'owner',g.professional_id) from private.ai_diet_snapshots s join private.ai_generations g on g.id=s.generation_id where g.id='${id}'`],{encoding:'utf8'}));
assert.equal(row.owner,'88888888-1111-4111-8111-111111111111');
const texts=last.response??[];
const message=last.providerStatus ? JSON.parse(readFileSync('output/diet-phase3/provider-B-corrective.json','utf8')).response : texts;
const output=JSON.parse(message.find(x=>x.type==='message').content.find(x=>x.type==='output_text').text);
const fixture={case:'B-corrective',generationId:id,requestedModel:last.requestedModel,returnedModel:last.returnedModel,usage:last.usage,latencyMs:last.latencyMs,
  cost:last.ledger.actual_cost,snapshot:row.snapshot,output};
const json=JSON.stringify(fixture,null,2);
for(const sentinel of ['SENTINELA IDENTIDAD','private@example.test','+525512345678','sk-proj-','GOCSPX-'])assert.ok(!json.includes(sentinel));
writeFileSync('supabase/functions/ai/fixtures/diet-real-calibration.json',json+'\n');
let totalNano=0n;
const summary=reports.map(r=>{
  const nano=BigInt(Math.round(r.ledger.actual_cost*1e9));totalNano+=nano;
  const v=r.response.data.output?.validation;
  return {case:r.case,generationId:r.ledger.id,requestedModel:r.requestedModel,returnedModel:r.returnedModel,usage:r.usage,
    latencyMs:r.latencyMs,cost:r.ledger.actual_cost,error:r.errorCode,validation:v?{status:v.status,totals:v.totals,differences:v.differences,requiresTargetReview:v.requiresTargetReview}:null,
    payloadBytes:r.payloadBytes,inputEstimate:r.inputEstimate,candidates:r.candidatesPerMeal};
});
const final={calls:4,cases:summary,totalPhase3:Number(totalNano)/1e9,prior:0.022356,accumulated:Number(totalNano+22356000n)/1e9};
writeFileSync('output/diet-phase3/summary.json',JSON.stringify(final,null,2)+'\n');
console.log(JSON.stringify(final,null,2));
