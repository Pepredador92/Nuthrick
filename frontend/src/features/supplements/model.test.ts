import {describe,it,expect} from 'vitest';
import {isSupplementList, splitSupplementTargets, supplementTotals, supplementQuantityLabel, type SupplementItem} from '../../../../supabase/functions/_shared/supplements';
const item: SupplementItem = {id:'one',product:{id:'p',name:'Proteína',brand:'Marca',presentation:'Envase',serving_label:'2 scoops (60 g)',serving_grams:60,scoops_per_serving:2,energy_kcal:200,protein_g:40,carbohydrate_g:6,fat_g:2,source_url:null,label_url:null,verified_at:null},quantity:1,unit:'scoop',instructions:'Con el desayuno'};
describe('supplement prescription',()=>{
 it('converts grams, scoops and servings using the product label',()=>{
  expect(supplementTotals([item])).toEqual({energy_kcal:100,protein_g:20,carbohydrate_g:3,fat_g:1});
  expect(supplementTotals([{...item,quantity:30,unit:'g'}])).toEqual(supplementTotals([item]));
  expect(supplementTotals([{...item,quantity:.5,unit:'serving'}])).toEqual(supplementTotals([item]));
 });
 it('adds several supplements and subtracts only from food targets',()=>{
  const daily={energy_kcal:2000,protein_g:100,carbohydrate_g:250,fat_g:60};
  const copy=structuredClone(daily);
  expect(splitSupplementTargets(daily,[item,{...item,id:'two',quantity:2}]).food).toEqual({energy_kcal:1700,protein_g:40,carbohydrate_g:241,fat_g:57});
  expect(daily).toEqual(copy);
 });
 it('reports excess without negative food amounts and preserves decimal sums',()=>{
  const result=splitSupplementTargets({energy_kcal:50,protein_g:10,carbohydrate_g:2,fat_g:0},[item]);
  expect(result.food).toEqual({energy_kcal:0,protein_g:0,carbohydrate_g:0,fat_g:0});
  expect(result.excess.protein_g).toBe(10);
  const small={...item,product:{...item.product,protein_g:.1},unit:'serving' as const,quantity:3};
  expect(supplementTotals([small]).protein_g).toBe(.3);
 });
 it('rejects invalid values, duplicate identities and unknown conversions',()=>{
  for(const quantity of [0,-1,NaN,Infinity])expect(isSupplementList([{...item,quantity}])).toBe(false);
  expect(isSupplementList([item,item])).toBe(false);
  expect(isSupplementList([{...item,product:{...item.product,scoops_per_serving:null}}])).toBe(false);
  expect(isSupplementList([{...item,product:{...item.product,protein_g:null}}])).toBe(false);
 });
 it('supports older plans and explains the product measure to patients',()=>{
  expect(supplementTotals()).toEqual({energy_kcal:0,protein_g:0,carbohydrate_g:0,fat_g:0});
  expect(supplementQuantityLabel(item)).toBe('1 medida del producto al día (30 g)');
 });
});

import {foodTargetsFor} from './targets';
import {createMacroDistribution,patchMacroInput,reconcileMacroDistribution} from '../macros/model';
it('reconciles daily macros without erasing supplements and keeps food targets separate',()=>{
 let m=createMacroDistribution(2000,80);m=patchMacroInput(m,'PROTEIN','grams',100);m.supplements=[item];
 const next=reconcileMacroDistribution(m,2100,80);
 expect(next.supplements).toEqual([item]);expect(next.macros.PROTEIN.grams).toBe(100);
 expect(foodTargetsFor({target_calories:2100,macro_distribution:next}).protein_g).toBe(80);
});
