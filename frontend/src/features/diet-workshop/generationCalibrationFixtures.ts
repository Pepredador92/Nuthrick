/** Local synthetic calibration data; never imported by the application. */
import { fixtureFood, fixtureRecipe, generationFixture } from './generationFixtures';
import { createMacroDistribution, patchMacroInput } from '../macros/model';
import { createExchangePrescription, setExchangePortions, confirmExchangePrescription } from '../exchanges/model';
import { createMealDistribution, createMealTime, setDistributedPortions, confirmMealDistribution } from '../meal-distribution/model';
import { createDietMenu } from '../menu/model';
import type { ExchangeGroupCode, FoodUnitCode } from '../../types/domain';

export function dietCalibrationFixture(kind: 'A'|'B'|'C') {
  const input=generationFixture(), n={A:1,B:2,C:3}[kind];
  const owner='88888888-1111-4111-8111-111111111111';
  const patient=`88888888-2222-4222-8222-${String(n).padStart(12,'0')}`;
  const consultation=`88888888-3333-4333-8333-${String(n).padStart(12,'0')}`;
  const planId=`88888888-4444-4444-8444-${String(n).padStart(12,'0')}`;
  const targets={energy_kcal:1750,carbohydrate_g:218.75,protein_g:87.5,fat_g:58.3};
  let macros=createMacroDistribution(1750,null);
  for(const [code,value] of [['CARBOHYDRATE',50],['PROTEIN',20],['FAT',30]] as const) macros=patchMacroInput(macros,code,'percentage',value);
  targets.fat_g=macros.macros.FAT.grams!;
  const groups: Array<[ExchangeGroupCode,string,FoodUnitCode,number]>=[
    ['CEREALS_NO_FAT','Tortilla de maíz','tortilla',1],['AOA_LOW_FAT','Pollo cocido','g',30],
    ['FRUITS','Manzana','piece',1],['VEGETABLES','Calabacita','cup',1],['LEGUMES','Frijoles cocidos','cup',0.5],
    ['MILK_SKIM','Leche descremada','cup',1],['FATS_NO_PROTEIN','Aceite de oliva','teaspoon',1],
  ];
  const foods=groups.flatMap(([group,name,unit,amount],i)=>[0,1].map(j=>({...fixtureFood(`88888888-5555-4555-8555-${String(i*2+j+1).padStart(12,'0')}`),
    owner_id:owner, name:j?`${name} alternativa`:name,normalized_name:j?`${name} alternativa`:name,group_code:group,portion_unit:unit,portion_amount:amount,portion_description:`${amount} ${unit}`})));
  const rows: Array<Partial<Record<ExchangeGroupCode,number>>>=[
    {CEREALS_NO_FAT:2,AOA_LOW_FAT:1,FRUITS:1,MILK_SKIM:1,FATS_NO_PROTEIN:1},
    {CEREALS_NO_FAT:3,AOA_LOW_FAT:3,VEGETABLES:2,LEGUMES:1,FATS_NO_PROTEIN:2},
    {CEREALS_NO_FAT:3,AOA_LOW_FAT:2,VEGETABLES:2,LEGUMES:1,FATS_NO_PROTEIN:2,FRUITS:2},
  ];
  let exchange=createExchangePrescription(targets);
  for(const [group] of groups) exchange=setExchangePortions(exchange,targets,group,rows.reduce((sum,row)=>sum+(row[group]??0),0));
  exchange=confirmExchangePrescription(exchange,targets);
  let meals={...createMealDistribution(),meal_times:['Desayuno','Comida','Cena'].map((name,i)=>createMealTime(name,i,null,`meal-${i+1}`))};
  rows.forEach((row,i)=>{for(const [group,amount] of Object.entries(row)) meals=setDistributedPortions(meals,group as ExchangeGroupCode,`meal-${i+1}`,amount);});
  meals=confirmMealDistribution(meals,exchange);
  const recipes=[fixtureRecipe(foods[0],'88888888-6666-4666-8666-000000000001')];
  recipes[0].owner_id=owner; recipes[0].name='Tortillas calientes'; recipes[0].normalized_name='tortillas calientes'; recipes[0].meal_types=['BREAKFAST','MAIN_MEAL','DINNER'];
  recipes[0].items![0].id='88888888-7777-4777-8777-000000000001';
  recipes[0].items![0].owner_id=owner;
  input.source.plan={...input.source.plan,id:planId,professional_id:owner,patient_id:patient,consultation_id:consultation,
    title:`PRUEBA LOCAL FASE 3 ${kind} NO PUBLICAR`,target_calories:1750,macro_distribution:macros,exchange_prescription:exchange,
    meal_distribution:meals,diet_menu:createDietMenu(meals)};
  input.source.consultation={...input.source.consultation!,id:consultation,professional_id:owner,patient_id:patient};
  input.source.catalog={foods,recipes};
  if(kind==='A') input.source.answers.cooking_time={value:'30 minutos',response_area:'patient_reported'};
  if(kind==='B') input.source.plan.diet_menu!.food_preferences={[foods[0].id]:'exclude',[foods[2].id]:'exclude'};
  if(kind==='C') input.source.answers.eating_preferences={value:['No sabe / no recuerda'],response_area:'patient_reported'};
  return {source:input.source,identifiers:['SENTINELA IDENTIDAD','private@example.test','5512345678']};
}
