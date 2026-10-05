import {strict as assert} from 'node:assert';
import {projectPlanDocumentContext, type DocumentContextRows} from './plan-document-context.ts';
import {birthDateDetails} from './plan-document.ts';
const owner='11111111-1111-4111-8111-111111111111',patientId='22222222-2222-4222-8222-222222222222',consultationId='33333333-3333-4333-8333-333333333333',planId='44444444-4444-4444-8444-444444444444';
const raw={publishedAt:'2026-10-04T20:00:00Z',versionNumber:3,snapshot:{plan:{id:planId},professional:{id:owner},patient:{id:patientId},consultation:{id:consultationId,date:'2026-10-03T12:00:00Z'}}};
const scope={patient_id:patientId,professional_id:owner,consultation_id:consultationId};
function rows():DocumentContextRows{return {
 patient:{id:patientId,professional_id:owner,birth_date:'1981-07-13',equation_sex:'female'},
 consultation:{...scope,id:consultationId,consultation_type:'follow_up',sequence_number:2,status:'completed',completed_at:'2026-10-03T20:00:00Z'},
 revision:{...scope,revision:2,created_at:'2026-10-03T12:00:00Z',clinical_records:{pes:{approved_at:'2026-10-03T19:00:00Z'},objective:{approved_at:'2026-10-03T19:00:00Z',content:'Objetivo aprobado'},privateNote:'PRIVATE'}},
 answers:[{...scope,revision:2,question_key:'pes_statement',value:'PES aprobado',updated_at:'2026-10-03T19:00:00Z'},{...scope,revision:2,question_key:'first_actions',value:'Acción acordada',updated_at:'2026-10-03T19:00:00Z'}],
};}
Deno.test('document binds approved clinical fields to owner, patient, consultation and publication date',()=>{
 const context=projectPlanDocumentContext(raw,rows());
 assert.equal(context.pes,'PES aprobado');assert.equal(context.objective,'Objetivo aprobado');assert.equal(context.instructions,'Acción acordada');assert.equal(context.sex,'Femenino');assert.ok(!JSON.stringify(context).includes('PRIVATE'));
 const wrong=rows();wrong.consultation!.patient_id=owner;assert.equal(projectPlanDocumentContext(raw,wrong).pes,undefined);
 const wrongAnswer=rows();wrongAnswer.answers![0].revision=3;assert.equal(projectPlanDocumentContext(raw,wrongAnswer).pes,undefined);
 const later=rows();later.answers![0].updated_at='2026-10-05T12:00:00Z';assert.equal(projectPlanDocumentContext(raw,later).pes,undefined);
 const draft=rows();draft.revision!.clinical_records={pes:{approved_at:'2026-10-05T12:00:00Z'}};assert.equal(projectPlanDocumentContext(raw,draft).pes,undefined);
});
Deno.test('current shared guidance cannot be attached to an older version or a different consultation',()=>{
 const data=rows();data.portal={enabled:true,publishedAt:'2026-10-05T10:00:00Z',shared:{goal:'Meta compartida',instructions:'Indicación compartida',goalSource:{consultationId}}};data.sharedPlan=raw;
 assert.equal(projectPlanDocumentContext(raw,data).instructions,'Indicación compartida');
 data.sharedPlan={...raw,versionNumber:4};assert.equal(projectPlanDocumentContext(raw,data).instructions,'Acción acordada');
 data.sharedPlan=raw;data.portal={...data.portal,enabled:false};assert.equal(projectPlanDocumentContext(raw,data).instructions,'Acción acordada');
 data.portal={enabled:true,shared:{instructions:'AJENA',goalSource:{consultationId:owner}}};assert.notEqual(projectPlanDocumentContext(raw,data).instructions,'AJENA');
});
Deno.test('birth date keeps its calendar day and age is measured on the consultation date',()=>{
 assert.equal(birthDateDetails('1981-07-13','2026-07-12T12:00:00Z'),'13 de julio de 1981 · 44 años');
 assert.equal(birthDateDetails('1981-07-13','2026-07-13T12:00:00Z'),'13 de julio de 1981 · 45 años');
 assert.equal(birthDateDetails('1981-02-30','2026-07-13T12:00:00Z'),undefined);
 assert.deepEqual(projectPlanDocumentContext({snapshot:{}},rows()),{});
});
