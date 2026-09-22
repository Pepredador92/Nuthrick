import {beforeEach,expect,it,vi} from 'vitest';
import {workshopTransport} from './dietWorkshopAI';
import {uxFixture} from '../../tests/fixtures/dietCopilotUX';
import {AIRequestError} from './ai';
const mocks=vi.hoisted(()=>({invoke:vi.fn(),run:vi.fn()}));
vi.mock('@/src/lib/supabase',()=>({supabase:{functions:{invoke:mocks.invoke}}}));
vi.mock('./ai',async original=>({...await original<typeof import('./ai')>(),runAIRequest:mocks.run}));
beforeEach(()=>vi.clearAllMocks());
it('uses the existing diet_draft endpoint, key, revision and instructions only',async()=>{
  const f=uxFixture(),plan=f.input.source.plan;mocks.run.mockResolvedValue({generationId:'g',status:'succeeded',output:{validation:{status:'valid',issues:[]},hasManualMenu:true,kcal:999999}});
  const result=await workshopTransport.generate(plan,'Para llevar','same-key');
  expect(mocks.run).toHaveBeenCalledWith({feature:'diet_draft',idempotencyKey:'same-key',planId:plan.id,revision:1,patientId:plan.patient_id,consultationId:plan.consultation_id,narrative:'Para llevar'});
  expect(result).not.toHaveProperty('kcal');expect(result.validation.status).toBe('valid');
});
it('preflight is read-only and never dispatches generation',async()=>{
  mocks.invoke.mockResolvedValue({data:{eligible:false,reasons:[{code:'feature_disabled'}]},error:null});await workshopTransport.preflight(uxFixture().input.source.plan,'');
  expect(mocks.invoke.mock.calls[0][0]).toBe('ai');expect(mocks.invoke.mock.calls[0][1].body.action).toBe('diet_preflight');expect(mocks.run).not.toHaveBeenCalled();
});
it('invalid provider output is a blocked preview, never an apply-anyway response',async()=>{
  mocks.run.mockRejectedValue(new AIRequestError('invalid_output'));const result=await workshopTransport.generate(uxFixture().input.source.plan,'','key');expect(result.validation.status).toBe('invalid');await workshopTransport.decide(result,false,false,false);expect(mocks.invoke).not.toHaveBeenCalled();
});
it('apply sends only decision flags and generation reference; discard never publishes',async()=>{
  const p={generationId:'g',hasManualMenu:true,validation:{status:'valid' as const,issues:[]}};
  mocks.invoke.mockResolvedValue({data:{ok:true,plan:{status:'draft'}},error:null});await workshopTransport.decide(p,true,true,true);
  expect(mocks.invoke).toHaveBeenCalledWith('ai',{body:{action:'apply_diet_draft',generationId:'g',replaceExisting:true,acceptDifferences:true}});
  await workshopTransport.decide(p,false,false,false);expect(mocks.invoke.mock.calls[1][1].body.action).toBe('discard_diet_draft');
});
it('maps stale server error without exposing raw messages',async()=>{
  mocks.invoke.mockResolvedValue({data:{error:'context_changed'},error:null});await expect(workshopTransport.decide({generationId:'g',hasManualMenu:false,validation:{status:'valid',issues:[]}},true,false,true)).rejects.toMatchObject({code:'context_changed'});
});
it('discard then generate requests a server-owned alternative; a new revision drops it',async()=>{
  const plan={...uxFixture().input.source.plan,id:'alternative-test'};
  mocks.run.mockResolvedValue({generationId:'previous',status:'succeeded',output:{validation:{status:'valid',issues:[]}}});
  const proposal=await workshopTransport.generate(plan,'','first');
  mocks.invoke.mockResolvedValue({data:{ok:true},error:null});
  await workshopTransport.decide(proposal,false,false,false);
  await workshopTransport.generate(plan,'','second');
  expect(mocks.run.mock.lastCall?.[0]).toMatchObject({previousProposalId:'previous',idempotencyKey:'second'});
  await workshopTransport.generate({...plan,draft_revision:2},'','third');
  expect(mocks.run.mock.lastCall?.[0]).not.toHaveProperty('previousProposalId');
});
