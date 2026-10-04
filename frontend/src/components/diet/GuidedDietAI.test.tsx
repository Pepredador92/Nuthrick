import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import {GuidedDietAI} from './GuidedDietAI';
import {uxFixture} from '../../../tests/fixtures/dietCopilotUX';
import {AIRequestError} from '../../services/ai';
import type {WorkshopTransport,WorkshopProposal} from '../../services/dietWorkshopAI';

beforeEach(()=>sessionStorage.clear());
function mount(){
 const f=uxFixture(),plan=f.input.source.plan;plan.exchange_prescription=null;plan.meal_distribution=null;plan.diet_menu=null;
 const onApplied=vi.fn(),preflight=vi.fn(f.transport.preflight);
 // Stable server projection, simulating the guided preflight boundary separately tested in domain/Edge.
 const source=uxFixture();
 const transport:WorkshopTransport={...f.transport,preflight:async(_p,i,g)=>{const r=await source.transport.preflight(source.input.source.plan,i);return {...r,eligible:!!g,contextToken:JSON.stringify(g),reasons:g?[]:[{code:'exchanges_unconfirmed'}]};},
 generate:vi.fn(async()=>({generationId:'fixture',hasManualMenu:false,validation:{status:'valid',totals:{energy_kcal:2000,protein_g:100,carbohydrate_g:250,fat_g:66.7},differences:{energy_kcal:0,protein_g:0,carbohydrate_g:0,fat_g:0},issues:[]}} as WorkshopProposal)),
 decide:vi.fn(async()=>plan),status:vi.fn(async()=>null)};
 preflight.mockImplementation(transport.preflight);transport.preflight=preflight;
 const {unmount}=render(<GuidedDietAI plan={plan} before={async()=>plan} onApplied={onApplied} transport={transport}/>);
 return {plan,transport,onApplied,unmount};
}
async function summary(){fireEvent.click(screen.getByRole('button',{name:'Generar con IA'}));await screen.findByLabelText('Objetivo de esta dieta');fireEvent.click(screen.getByRole('checkbox',{name:/Revisé el contexto/}));fireEvent.click(screen.getByRole('button',{name:'Continuar'}));fireEvent.click(screen.getByRole('button',{name:'Continuar'}));fireEvent.change(screen.getByLabelText('Presupuesto disponible'),{target:{value:'Económico'}});fireEvent.click(screen.getByRole('button',{name:'Continuar'}));await screen.findByRole('button',{name:'Confirmar y generar'});await waitFor(()=>expect(screen.getByRole('button',{name:'Confirmar y generar'})).toBeEnabled());}
describe('guided diet wizard',()=>{
 it('keeps a generated proposal recoverable after a save failure and reload, without generating twice',async()=>{
  const f=mount();vi.mocked(f.transport.decide).mockRejectedValue(new AIRequestError('draft_save_failed'));
  await summary();fireEvent.click(screen.getByRole('button',{name:'Confirmar y generar'}));
  await screen.findByText(/La propuesta está conservada/);
  expect(f.onApplied).not.toHaveBeenCalled();expect(f.transport.generate).toHaveBeenCalledTimes(1);
  const savedProposal=await vi.mocked(f.transport.generate).mock.results[0].value;
  const key=`guided-diet-pending:${f.plan.id}`;expect(sessionStorage.getItem(key)).toBeTruthy();f.unmount();
  const reloaded=mount();vi.mocked(reloaded.transport.status).mockResolvedValue({generationId:savedProposal.generationId,status:'succeeded',chargedCredits:1,errorCode:null});
  reloaded.transport.recover=vi.fn(async()=>savedProposal);
  fireEvent.click(screen.getByRole('button',{name:'Generar con IA'}));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Consultar solicitud pendiente'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button',{name:'Consultar solicitud pendiente'}));
  const save=await screen.findByRole('button',{name:'Guardar borrador y revisar en Menú'});fireEvent.click(save);
  await waitFor(()=>expect(reloaded.onApplied).toHaveBeenCalledWith(reloaded.plan));
  expect(reloaded.transport.generate).not.toHaveBeenCalled();expect(reloaded.transport.decide).toHaveBeenCalledWith(savedProposal,true,false,true);expect(sessionStorage.getItem(key)).toBeNull();
 });
 it('retains edited choices across screens, generates once and returns the complete draft',async()=>{const f=mount();await summary();fireEvent.click(screen.getByRole('button',{name:'Atrás'}));expect(screen.getByLabelText('Presupuesto disponible')).toHaveValue('Económico');fireEvent.click(screen.getByRole('button',{name:'Continuar'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Confirmar y generar'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'Confirmar y generar'}));await waitFor(()=>expect(f.onApplied).toHaveBeenCalledWith(f.plan));expect(f.transport.generate).toHaveBeenCalledTimes(1);expect(f.transport.generate).toHaveBeenCalledWith(f.plan,'Presupuesto: Económico',expect.any(String),expect.objectContaining({contextReviewed:true,meals:expect.any(Array)}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument();});
 it('requires review of actual differences before changing any step',async()=>{const f=mount();vi.mocked(f.transport.generate).mockResolvedValue({generationId:'fixture',hasManualMenu:false,validation:{status:'needs_adjustment',issues:[{code:'portion_difference',path:'m1'}],requiresTargetReview:true}});await summary();fireEvent.click(screen.getByRole('button',{name:'Confirmar y generar'}));await screen.findByRole('button',{name:'Guardar borrador y revisar en Menú'});expect(f.transport.decide).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Guardar borrador y revisar en Menú'}));await waitFor(()=>expect(f.onApplied).toHaveBeenCalled());expect(f.transport.decide).toHaveBeenCalledWith(expect.anything(),true,false,true);});
 it('does not repeat uncertain generations and recovers the saved result',async()=>{const f=mount();vi.mocked(f.transport.generate).mockRejectedValue(new AIRequestError('provider_outcome_unknown'));await summary();fireEvent.click(screen.getByRole('button',{name:'Confirmar y generar'}));await screen.findByRole('button',{name:'Consultar solicitud pendiente'});expect(f.onApplied).not.toHaveBeenCalled();expect(screen.queryByRole('button',{name:'Confirmar y generar'})).not.toBeInTheDocument();vi.mocked(f.transport.status).mockResolvedValue({generationId:'recovered',status:'succeeded',chargedCredits:1,errorCode:null});f.transport.recover=vi.fn(async()=>({generationId:'recovered',hasManualMenu:false,validation:{status:'valid' as const,issues:[]}}));fireEvent.click(screen.getByRole('button',{name:'Consultar solicitud pendiente'}));await screen.findByRole('button',{name:'Guardar borrador y revisar en Menú'});expect(f.transport.generate).toHaveBeenCalledTimes(1);});
 it('rejects duplicate names before any paid generation',async()=>{const f=mount();fireEvent.click(screen.getByRole('button',{name:'Generar con IA'}));await screen.findByLabelText('Objetivo de esta dieta');fireEvent.click(screen.getByRole('checkbox',{name:/Revisé el contexto/}));fireEvent.click(screen.getByRole('button',{name:'Continuar'}));fireEvent.change(screen.getByLabelText('Nombre del tiempo 2'),{target:{value:'Desayuno'}});fireEvent.click(screen.getByRole('button',{name:'Continuar'}));expect(screen.getByRole('alert')).toHaveTextContent('Revisa los nombres');expect(f.transport.generate).not.toHaveBeenCalled();});
});
