import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,describe,it,expect,vi} from 'vitest';
import {TextDietAI} from './TextDietAI';
import {TextDietEditor} from './TextDietReview';
import {uxFixture} from '../../../tests/fixtures/dietCopilotUX';
import {AIRequestError} from '../../services/ai';
import type {TextDietTransport} from '../../services/textDietAI';
import type {TextDiet} from '../../../../supabase/functions/_shared/text-diet';
beforeEach(()=>sessionStorage.clear());
function mount(){
 const f=uxFixture(),plan=f.input.source.plan;plan.exchange_prescription=null;plan.meal_distribution=null;plan.diet_menu=null;
 const onApplied=vi.fn();let saved=plan;
 const transport:TextDietTransport={preflight:vi.fn(async(p,g,n)=>{const r=await f.transport.preflight(p,n);return{...r,context:r.context!,eligible:true,reasons:[],contextToken:JSON.stringify([g,n])};}),
 generate:vi.fn(async(p,g)=>{const textDraft:TextDiet={schema_version:1,requested_count:g.dietCount,meals:g.meals,reviewed_at:null,prescription:{target_calories:p.target_calories,macro_distribution:p.macro_distribution},diets:Array.from({length:g.dietCount},(_,i)=>({id:`diet-${i}`,title:`Dieta ${i+1}`,text:`Desayuno ${i+1}\n• 2 tortillas\n• Ingrediente que quitar`}))};saved={...p,text_diet:textDraft};return{generationId:'synthetic',textDraft};}),
 apply:vi.fn(async()=>saved),recover:vi.fn(async()=>({generationId:'synthetic',textDraft:saved.text_diet!})),status:vi.fn(async()=>null),discard:vi.fn(async()=>{})};
 const view=render(<TextDietAI plan={plan} before={async()=>plan} onApplied={onApplied} transport={transport}/>);return{plan,transport,onApplied,...view};
}
async function summary(n=3){fireEvent.click(screen.getByRole('button',{name:'Generar con IA'}));await screen.findByLabelText('Objetivo de las dietas');fireEvent.change(screen.getByLabelText('Objetivo de las dietas'),{target:{value:'Organizar comidas accesibles'}});fireEvent.change(screen.getByLabelText('Alergias y restricciones revisadas'),{target:{value:'Sin alergias confirmadas'}});fireEvent.click(screen.getByRole('checkbox',{name:/Revisé alergias/}));fireEvent.click(screen.getByRole('checkbox',{name:/Revisé el contexto/}));fireEvent.click(screen.getByRole('button',{name:'Continuar'}));fireEvent.change(screen.getByLabelText('Dietas completas diferentes'),{target:{value:String(n)}});fireEvent.click(screen.getByRole('button',{name:'Continuar'}));fireEvent.click(screen.getByRole('button',{name:'Continuar'}));await waitFor(()=>expect(screen.getByRole('button',{name:`Generar ${n} dietas`})).toBeEnabled());}
describe('text diet workflow',()=>{
 for(const n of [1,3,7])it(`sends ${n} complete diets and opens review only after saving`,async()=>{const f=mount();await summary(n);fireEvent.click(screen.getByRole('button',{name:`Generar ${n} dietas`}));await waitFor(()=>expect(f.onApplied).toHaveBeenCalled());expect(f.transport.generate).toHaveBeenCalledTimes(1);expect(f.onApplied.mock.calls[0][0].text_diet.diets).toHaveLength(n);expect(f.onApplied.mock.calls[0][0].text_diet.reviewed_at).toBeNull();});
 it('recovers a saved generation after reload without another paid request',async()=>{
 const f=mount();vi.mocked(f.transport.apply).mockRejectedValue(new AIRequestError('draft_save_failed'));await summary();fireEvent.click(screen.getByRole('button',{name:'Generar 3 dietas'}));await screen.findByText(/Se generaron 3 dietas/);const proposal=await vi.mocked(f.transport.generate).mock.results[0].value;f.unmount();
 const r=mount();vi.mocked(r.transport.status).mockResolvedValue({generationId:'synthetic',status:'succeeded',chargedCredits:5,errorCode:null});vi.mocked(r.transport.recover).mockResolvedValue(proposal);vi.mocked(r.transport.apply).mockResolvedValue({...r.plan,text_diet:proposal.textDraft});fireEvent.click(screen.getByRole('button',{name:'Generar con IA'}));await waitFor(()=>expect(screen.getByRole('button',{name:'Consultar solicitud pendiente'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'Consultar solicitud pendiente'}));fireEvent.click(await screen.findByRole('button',{name:'Guardar y revisar dietas'}));await waitFor(()=>expect(r.onApplied).toHaveBeenCalled());expect(r.transport.generate).not.toHaveBeenCalled();
 });
 it('saves deletions between pages, requires every diet reviewed and preserves approved text',async()=>{
 const f=mount();await summary();fireEvent.click(screen.getByRole('button',{name:'Generar 3 dietas'}));await waitFor(()=>expect(f.onApplied).toHaveBeenCalled());const plan=f.onApplied.mock.calls[0][0];f.unmount();
 const save=vi.fn(async(d:TextDiet)=>({...plan,text_diet:d})),close=vi.fn();render(<TextDietEditor plan={plan} onSave={save} onClose={close}/>);
 expect(screen.getByRole('button',{name:'Aprobar 3 dietas'})).toBeDisabled();fireEvent.change(screen.getByLabelText('Contenido editable'),{target:{value:'Desayuno revisado\n• 2 tortillas'}});fireEvent.click(screen.getByRole('checkbox',{name:/Revisé esta dieta/}));fireEvent.click(screen.getByRole('button',{name:'Siguiente dieta'}));await waitFor(()=>expect(screen.getByLabelText('Contenido editable')).toHaveValue('Desayuno 2\n• 2 tortillas\n• Ingrediente que quitar'));
 fireEvent.click(screen.getByRole('button',{name:'Anterior'}));await waitFor(()=>expect(screen.getByLabelText('Contenido editable')).toHaveValue('Desayuno revisado\n• 2 tortillas'));expect(save.mock.calls[0][0].reviewed_at).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'Siguiente dieta'}));await waitFor(()=>expect(screen.getByLabelText('Contenido editable')).toHaveValue('Desayuno 2\n• 2 tortillas\n• Ingrediente que quitar'));fireEvent.click(screen.getByRole('checkbox',{name:/Revisé esta dieta/}));fireEvent.click(screen.getByRole('button',{name:'Siguiente dieta'}));await waitFor(()=>expect(screen.getByLabelText('Contenido editable')).toHaveValue('Desayuno 3\n• 2 tortillas\n• Ingrediente que quitar'));fireEvent.click(screen.getByRole('checkbox',{name:/Revisé esta dieta/}));fireEvent.click(screen.getByRole('button',{name:'Aprobar 3 dietas'}));await waitFor(()=>expect(close).toHaveBeenCalled());const approved=save.mock.calls.at(-1)![0];expect(approved.reviewed_at).toBeTruthy();expect(approved.diets[0].text).toBe('Desayuno revisado\n• 2 tortillas');
 });
});
it('prefills the recorded goal and dated restrictions, keeps review explicit, and can advance with optional preferences absent',async()=>{
 const f=mount(),fixture=uxFixture();const c=(await fixture.transport.preflight(fixture.input.source.plan,'')).context!;
 c.clinical.objective.fact={state:'unavailable',reason:'missing'};c.clinical.objectiveSuggestion='Organizar comidas para llevar.';c.clinical.objectiveSuggestionOrigin={date:'2026-10-03',historical:false};
 c.restrictions.reaction_status.fact={state:'known',value:'No'};Object.assign(c.restrictions.reaction_status.origin,{date:'2026-07-18',historical:true});
 c.restrictions.reactions.fact={state:'unavailable',reason:'missing'};c.preferences.foods.fact={state:'unavailable',reason:'missing'};c.preferences.eating_pattern.fact={state:'known',value:['Omnívoro']};
 vi.mocked(f.transport.preflight).mockResolvedValue({eligible:false,contextToken:'fixture',reasons:[{code:'context_review_required'},{code:'text_restrictions_required'}],context:c});
 fireEvent.click(screen.getByRole('button',{name:'Generar con IA'}));await waitFor(()=>expect(screen.getByLabelText('Objetivo de las dietas')).toHaveValue('Organizar comidas para llevar.'));
 expect((screen.getByLabelText('Alergias y restricciones revisadas') as HTMLTextAreaElement).value).toContain('Antecedente del 18/07/2026');
 expect(screen.getByRole('checkbox',{name:/Revisé alergias/})).not.toBeChecked();expect(screen.getByText('Sin preferencias específicas registradas',{exact:false})).toBeInTheDocument();
 fireEvent.click(screen.getByRole('checkbox',{name:/Revisé alergias/}));fireEvent.click(screen.getByRole('checkbox',{name:/Revisé el contexto/}));fireEvent.click(screen.getByRole('button',{name:'Continuar'}));expect(screen.getByLabelText('Dietas completas diferentes')).toBeInTheDocument();expect(f.transport.generate).not.toHaveBeenCalled();
});
it('identifies empty required text even when both checkboxes are selected; never invents negative allergy data',async()=>{
 const f=mount(),fixture=uxFixture(),c=(await fixture.transport.preflight(fixture.input.source.plan,'')).context!;
 c.clinical.objective.fact={state:'unavailable',reason:'missing'};delete c.clinical.objectiveSuggestion;
 c.restrictions.reaction_status.fact={state:'unavailable',reason:'missing'};c.restrictions.reactions.fact={state:'unavailable',reason:'missing'};
 vi.mocked(f.transport.preflight).mockResolvedValue({eligible:false,contextToken:'fixture',reasons:[],context:c});
 fireEvent.click(screen.getByRole('button',{name:'Generar con IA'}));await screen.findByLabelText('Objetivo de las dietas');
 expect(screen.getByLabelText('Alergias y restricciones revisadas')).toHaveValue('');
 fireEvent.click(screen.getByRole('checkbox',{name:/Revisé alergias/}));fireEvent.click(screen.getByRole('checkbox',{name:/Revisé el contexto/}));fireEvent.click(screen.getByRole('button',{name:'Continuar'}));
 expect(screen.getByRole('alert')).toHaveTextContent('Escribe el objetivo de las dietas. Completa el resumen de alergias y restricciones revisadas.');
 expect(screen.getByLabelText('Objetivo de las dietas')).toHaveFocus();expect(screen.getByLabelText('Objetivo de las dietas')).toHaveAttribute('aria-invalid','true');expect(f.transport.generate).not.toHaveBeenCalled();
});
