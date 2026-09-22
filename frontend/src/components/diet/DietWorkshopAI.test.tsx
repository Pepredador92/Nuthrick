import {beforeEach,expect,it,vi} from 'vitest';
import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {DietWorkshopAI} from './DietWorkshopAI';
import type {NutritionPlan} from '@/src/types/domain';
const mocks=vi.hoisted(()=>({status:vi.fn(),generate:vi.fn(),decide:vi.fn()}));
vi.mock('@/src/services/dietWorkshopAI',()=>({workshopAIStatus:mocks.status,decideWorkshop:mocks.decide}));
vi.mock('@/src/services/ai',()=>({runAIRequest:mocks.generate,getAIGenerationStatus:vi.fn(),AIRequestError:class extends Error{code='provider_outcome_unknown';}}));
const plan={id:'test',target_calories:2000,macro_distribution:{complete:true},draft_revision:1,patient_id:null} as NutritionPlan;
const preview={payload:'signed',signature:'verified',menuSignature:'different',summary:'Propuesta completa',warnings:[],assumptions:[],goal:'Mejorar hábitos',patch:{exchange_prescription:{groups:[]},meal_distribution:{meal_times:[]},diet_menu:{menus:[{id:'one',meal_menus:[]}],active_menu_id:'one'}}};
beforeEach(()=>{vi.clearAllMocks();sessionStorage.clear();mocks.status.mockResolvedValue({enabled:true});mocks.generate.mockResolvedValue({generationId:'g',status:'succeeded',output:preview});mocks.decide.mockResolvedValue({...plan,status:'draft'});HTMLDialogElement.prototype.showModal=vi.fn();HTMLDialogElement.prototype.close=vi.fn();});
it('disabled AI never blocks manual workshop or dispatches',async()=>{
 mocks.status.mockResolvedValue({enabled:false});render(<DietWorkshopAI plan={plan} before={vi.fn()} onApplied={vi.fn()}/>);
 expect(await screen.findByText('Asistente de IA no disponible.')).toBeInTheDocument();expect(screen.getByRole('button',{name:'Crear propuesta con IA'})).toBeDisabled();expect(mocks.generate).not.toHaveBeenCalled();
});
async function open(){await waitFor(()=>expect(screen.getByRole('button',{name:'Crear propuesta con IA'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'Crear propuesta con IA'}));}
it('double click generates once and discarding does not apply anything',async()=>{
 const before=vi.fn(async()=>plan),onApplied=vi.fn();render(<DietWorkshopAI plan={plan} before={before} onApplied={onApplied}/>);await open();
 const generate=screen.getByText('Generar propuesta');fireEvent.click(generate);fireEvent.click(generate);await screen.findByText('Propuesta completa');
 expect(mocks.generate).toHaveBeenCalledTimes(1);expect(onApplied).not.toHaveBeenCalled();fireEvent.click(screen.getByText('Descartar'));
 await waitFor(()=>expect(mocks.decide).toHaveBeenCalledWith(preview,false));expect(onApplied).not.toHaveBeenCalled();
});
it('applies only after explicit action using the signed preview',async()=>{
 const onApplied=vi.fn();render(<DietWorkshopAI plan={plan} before={async()=>plan} onApplied={onApplied}/>);await open();fireEvent.click(screen.getByText('Generar propuesta'));await screen.findByText('Propuesta completa');
 expect(mocks.decide).not.toHaveBeenCalled();fireEvent.click(screen.getByText('Aplicar propuesta'));await waitFor(()=>expect(onApplied).toHaveBeenCalledWith(expect.objectContaining({status:'draft'})));expect(mocks.decide).toHaveBeenCalledWith(preview,true);
});
