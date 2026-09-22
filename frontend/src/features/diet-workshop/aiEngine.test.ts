import { describe, expect, it } from 'vitest';
import { buildWorkshopOptions, compactWorkshopOption } from './aiEngine';
import { exchangeCatalog } from '../exchanges/catalog';
import { activeMenu, calculateMenuStatus, createDietMenu } from '../menu/model';
import { createMealDistribution, calculateDistributionStatus } from '../meal-distribution/model';
import type { FoodItem, NutritionPlan } from '../../types/domain';

const foods = exchangeCatalog.flatMap((g,i)=>[0,1].map(variant=>({id:`00000000-0000-0000-0000-${String(i*2+variant+1).padStart(12,'0')}`,name:`Alimento ${i} ${variant}`,normalized_name:`alimento ${i} ${variant}`,group_code:g.groupCode,portion_amount:100,portion_unit:'g',active:true,attributes:{},aliases:[],source:'TEST',catalog_code:'NUTHRICK_MX_STARTER',use_count:0,source_version:'1',portion_description:'100 g'} as unknown as FoodItem)));
const plan = {target_calories:2000,macro_distribution:{macros:{CARBOHYDRATE:{grams:250},PROTEIN:{grams:100},FAT:{grams:60}}},meal_distribution:createMealDistribution()} as NutritionPlan;
describe('AI Workshop deterministic boundary',()=>{
  it('constructs full 2000 kcal proposals without changing targets or the draft',()=>{
    const before=JSON.stringify(plan),options=buildWorkshopOptions(plan,foods,[]);
    expect(options.length).toBeGreaterThan(0);
    expect(JSON.stringify(plan)).toBe(before);
    for(const o of options){expect(calculateDistributionStatus(o.meal_distribution.distribution,o.exchange_prescription).canConfirm).toBe(true);expect(calculateMenuStatus(o.diet_menu,o.meal_distribution).canConfirm).toBe(true);expect(o.exchange_prescription.target_snapshot.energy_kcal).toBe(2000);}
    expect(JSON.stringify(options.map(compactWorkshopOption))).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });
  it('never returns excluded or temporarily rejected foods and keeps rejection separate',()=>{
    const menu={...createDietMenu(plan.meal_distribution!),food_preferences:{[foods[0].id]:'exclude' as const}};
    const current={...plan,diet_menu:menu},before=JSON.stringify(current);
    const options=buildWorkshopOptions(current,foods,[],[foods[2].id]);
    expect(options.length).toBeGreaterThan(0);
    for(const o of options)for(const m of activeMenu(o.diet_menu).meal_menus)for(const e of m.entries)expect([foods[0].id,foods[2].id]).not.toContain(e.source_id);
    expect(JSON.stringify(current)).toBe(before);
  });
  it('fails safely when energy/macros or usable candidates are missing',()=>{
    expect(()=>buildWorkshopOptions({...plan,target_calories:null},foods,[])).toThrow('targets_required');
    expect(()=>buildWorkshopOptions(plan,[],[])).toThrow();
  });
});
