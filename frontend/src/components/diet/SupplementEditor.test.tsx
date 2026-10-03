import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {beforeAll,describe,it,expect,vi} from 'vitest';
import {SupplementEditor} from './SupplementEditor';
import {DietMacrosStep} from './DietMacrosStep';
import {supplementItem,supplementProduct} from '../../../tests/fixtures/supplements';
import {createMacroDistribution,patchMacroInput} from '@/src/features/macros/model';
import type {NutritionPlan} from '@/src/types/domain';
const api=vi.hoisted(()=>({list:vi.fn(),save:vi.fn(),archive:vi.fn()}));
vi.mock('@/src/services/supplements',()=>({listSupplements:api.list,saveCustomSupplement:api.save,archiveCustomSupplement:api.archive}));
beforeAll(()=>{HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};});
const daily={energy_kcal:2000,protein_g:100,carbohydrate_g:250,fat_g:60};
describe('SupplementEditor',()=>{
 it('searches catalog and selects an independent snapshot',async()=>{
  api.list.mockResolvedValue([supplementProduct]);const change=vi.fn();
  render(<SupplementEditor items={[]} daily={daily} onChange={change}/>);
  fireEvent.click(screen.getByRole('button',{name:'Agregar suplemento'}));
  await screen.findByText(supplementProduct.name);
  fireEvent.change(screen.getByLabelText('Buscar suplemento'),{target:{value:'INEXISTENTE'}});
  expect(screen.queryByRole('button',{name:`Agregar ${supplementProduct.name}`})).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Buscar suplemento'),{target:{value:'proteina'}});
  fireEvent.click(screen.getByRole('button',{name:`Agregar ${supplementProduct.name}`}));
  const selected=change.mock.calls[0][0][0];expect(selected.product).toMatchObject({protein_g:25,name:supplementProduct.name});
  expect(selected.product).not.toBe(supplementProduct);expect(selected.quantity).toBe(1);
 });
 it('normalizes comma quantities and preserves servings across unit changes',()=>{
  const change=vi.fn();render(<SupplementEditor items={[supplementItem]} daily={daily} onChange={change}/>);
  const input=screen.getByLabelText(`Cantidad diaria de ${supplementProduct.name}`);
  fireEvent.change(input,{target:{value:'1,5'}});fireEvent.blur(input);
  expect(change).toHaveBeenLastCalledWith([{...supplementItem,quantity:1.5}]);
  fireEvent.change(screen.getByLabelText(`Unidad de ${supplementProduct.name}`),{target:{value:'g'}});
  expect(change).toHaveBeenLastCalledWith([{...supplementItem,unit:'g',quantity:30}]);
 });
 it('creates a private manual product then offers it in the library',async()=>{
  api.list.mockResolvedValue([]);api.save.mockResolvedValue({...supplementProduct,owner_id:'me'});
  render(<SupplementEditor items={[]} daily={daily} onChange={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'Agregar suplemento'}));
  fireEvent.click(await screen.findByRole('button',{name:'Crear suplemento'}));
  for(const [label,value] of [['Nombre','Suplemento propio'],['Descripción de una porción','1 cápsula'],['Energía por porción (kcal)','0'],['Proteína por porción (g)','0'],['Carbohidratos por porción (g)','0'],['Grasas por porción (g)','0']])fireEvent.change(screen.getByLabelText(label),{target:{value}});
  fireEvent.click(screen.getByRole('button',{name:'Guardar en mi biblioteca'}));
  await waitFor(()=>expect(api.save).toHaveBeenCalledWith(expect.objectContaining({name:'Suplemento propio',protein_g:0,serving_grams:null}),undefined));
  expect(await screen.findByRole('button',{name:`Agregar ${supplementProduct.name}`})).toBeEnabled();
 });
 it('uses the existing macro autosave and restores the saved supplement',async()=>{
  let macros=createMacroDistribution(2000,80);macros=patchMacroInput(macros,'PROTEIN','grams',100);macros.supplements=[supplementItem];
  const save=vi.fn().mockResolvedValue(undefined),draft=vi.fn();
  const plan={id:'p',macro_distribution:macros} as NutritionPlan;
  const props={plan,targetEnergyKcal:2000,energyReferenceWeightKg:80,onSave:save,onDraftChange:draft,onGoToEnergy:vi.fn(),onContinue:vi.fn()};
  const view=render(<DietMacrosStep {...props}/>);
  fireEvent.change(screen.getByLabelText(`Indicaciones de ${supplementProduct.name}`),{target:{value:'Con la comida.'}});
  expect(draft).toHaveBeenLastCalledWith(expect.objectContaining({supplements:[expect.objectContaining({instructions:'Con la comida.'})]}));
  await waitFor(()=>expect(save).toHaveBeenCalled(),{timeout:2000});
  view.unmount();render(<DietMacrosStep {...props} plan={{...plan,macro_distribution:save.mock.calls[0][0]}}/>);
  expect(screen.getByLabelText(`Indicaciones de ${supplementProduct.name}`)).toHaveValue('Con la comida.');
  expect(within(screen.getByRole('table')).getByText('75 g')).toBeInTheDocument();
 });
});
