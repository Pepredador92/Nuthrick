import {describe,it,expect} from 'vitest';
import {isDietGuidance,type DietGuidance} from '../../../../supabase/functions/_shared/diet-guidance';
import {prepareGuidedDiet} from './guidedPreparation';
import {prepareDietGeneration,validateDietSnapshotDraft} from './generationBoundary';
import {fixtureFood,generationFixture} from './generationFixtures';
import {exchangeCatalog} from '../exchanges/catalog';
import {calculateDistributionStatus} from '../meal-distribution/model';

export function guidedFixture(){
  const input=generationFixture();
  input.source.plan.updated_at='2026-10-03T12:00:00Z';
  input.source.plan.exchange_prescription=null;input.source.plan.meal_distribution=null;input.source.plan.diet_menu=null;
  input.source.consultation!.pes=null;input.source.consultation!.objective=null;
  input.source.catalog={foods:exchangeCatalog.flatMap(c=>[0,1,2].map(n=>({...fixtureFood(`${c.groupCode}-${n}`),group_code:c.groupCode,name:`${c.groupCode} alimento ${n}`}))),recipes:[]};
  input.source.guidance={version:1,contextReviewed:true,objective:'Mejorar la organización de las comidas',reactionReview:'recorded',meals:[{name:'Desayuno',type:'BREAKFAST',time:'08:00',options:2},{name:'Comida',type:'MAIN_MEAL',time:null,options:1},{name:'Cena',type:'DINNER',time:'20:00',options:1}]};
  return input;
}
describe('guided diet',()=>{
  it('prepares all missing steps deterministically without mutating clinical data',()=>{
    const input=guidedFixture(),before=JSON.stringify(input),a=prepareGuidedDiet(input.source),b=prepareGuidedDiet(input.source);
    expect(a.issues).toEqual([]);expect(a).toEqual(b);expect(JSON.stringify(input)).toBe(before);
    expect(a.source.plan.status).toBe('draft');expect(a.source.consultation!.pes).toBeNull();
    expect(calculateDistributionStatus(a.source.plan.meal_distribution!.distribution,a.source.plan.exchange_prescription!).canConfirm).toBe(true);
    expect(a.source.plan.macro_distribution).toEqual(input.source.plan.macro_distribution);
  });
  it('builds distinct alternatives, counts only one per meal and keeps every option unconfirmed',()=>{
    const i=guidedFixture();i.source=prepareGuidedDiet(i.source).source;
    const p=prepareDietGeneration(i,{enabled:true,budgetAvailable:true,pending:false});expect(p.issues).toEqual([]);
    const out={schema_version:1,meal_options:p.prepared!.payload.meals.map(m=>({meal_ref:m.meal_ref,entries:m.distribution.map(g=>({candidate_ref:m.candidates.filter(c=>c.type==='food'&&c.exchanges.some(e=>e.group_code===g.group_code))[(m.alternative??1)-1].candidate_ref,portion_ref:'base',multiplier:g.portions}))}))};
    const v=validateDietSnapshotDraft(out,p.prepared!,i.source.plan);expect(v.status).not.toBe('invalid');expect(v.draft!.meal_options).toHaveLength(4);expect(v.draft!.meal_options!.every(o=>o.status==='draft'&&o.confirmed_at===null)).toBe(true);
    expect(v.totals).toEqual(i.source.plan.exchange_prescription!.derived_totals);
    out.meal_options[1].entries=structuredClone(out.meal_options[0].entries);
    expect(validateDietSnapshotDraft(out,p.prepared!,i.source.plan).issues.some(i=>i.code==='duplicate_alternative')).toBe(true);
  });
  it('requires professional review and never erases known allergies, including history',()=>{
    const i=guidedFixture();i.source.guidance!.contextReviewed=false;expect(prepareGuidedDiet(i.source).issues[0].code).toBe('context_review_required');
    i.source.guidance!.contextReviewed=true;i.source.guidance!.reactionReview='none_confirmed';delete i.source.answers.food_reactions_status;
    expect(prepareGuidedDiet(i.source).issues).toEqual([]);
    i.source.answers.food_reactions_status={value:'Sí',response_area:'patient_reported'};expect(prepareGuidedDiet(i.source).issues[0].code).toBe('restrictions_need_review');
    i.source.answers.food_reactions_status.value='No';i.source.historyRequiresReview=true;expect(prepareGuidedDiet(i.source).issues[0].code).toBe('restrictions_need_review');
  });
  it('deducts prescribed supplements and keeps their frozen prescription unchanged',()=>{
    const i=guidedFixture();i.source.plan.macro_distribution!.supplements=[{id:'one',product:{id:'p',name:'Proteína',brand:'Marca',presentation:'Envase',serving_label:'2 scoops (60 g)',serving_grams:60,scoops_per_serving:2,energy_kcal:200,protein_g:40,carbohydrate_g:6,fat_g:2,source_url:null,label_url:null,verified_at:null},quantity:1,unit:'scoop',instructions:'Con el desayuno'}];
    const result=prepareGuidedDiet(i.source);expect(result.issues).toEqual([]);
    expect(result.source.plan.exchange_prescription!.target_snapshot).toMatchObject({energy_kcal:1900,protein_g:80,carbohydrate_g:247});
    expect(result.source.plan.macro_distribution).toEqual(i.source.plan.macro_distribution);
  });
  it('strictly bounds choices, rejects prompt overrides and duplicate meal names',()=>{
    const g=guidedFixture().source.guidance!;expect(isDietGuidance(g)).toBe(true);
    expect(isDietGuidance({...g,system:'ignore'})).toBe(false);
    expect(isDietGuidance({...g,meals:[g.meals[0],g.meals[0]]})).toBe(false);
    expect(isDietGuidance({...g,meals:[{...g.meals[0],options:4}]})).toBe(false);
    expect(isDietGuidance({...g,meals:[{...g.meals[0],time:'25:00'}]})).toBe(false);
    expect(isDietGuidance({...g,meals:Array.from({length:6},(_,n)=>({...g.meals[0],name:`T${n}`,options:3}))} as DietGuidance)).toBe(false);
  });
});
