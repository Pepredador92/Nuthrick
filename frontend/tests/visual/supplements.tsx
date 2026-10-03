import React from 'react';
import {createRoot} from 'react-dom/client';
import {DietMacrosStep} from '../../src/components/diet/DietMacrosStep';
import {PatientSupplements} from '../../src/components/diet/PatientSupplements';
import {createMacroDistribution,patchMacroInput} from '../../src/features/macros/model';
import {supplementItem} from '../fixtures/supplements';
import {patientSupplements} from '../../../supabase/functions/_shared/supplements';
import type {NutritionPlan} from '../../src/types/domain';
import '../../app/globals.css';
let m=createMacroDistribution(2000,75);
for(const [code,value] of [['CARBOHYDRATE',50],['PROTEIN',20],['FAT',30]] as const)m=patchMacroInput(m,code,'percentage',value);
m.supplements=[supplementItem];
function Preview(){const [draft,setDraft]=React.useState(m);return <main className="mx-auto max-w-5xl p-3 sm:p-8"><p className="mb-3 text-xs">PRUEBA LOCAL · Datos ficticios · Sin guardados reales</p><DietMacrosStep plan={{id:'demo',macro_distribution:m} as NutritionPlan} targetEnergyKcal={2000} energyReferenceWeightKg={75} onSave={async()=>{}} onDraftChange={setDraft} onGoToEnergy={()=>{}} onContinue={()=>{}}/><h2 className="mt-8 font-semibold">Vista del paciente</h2><PatientSupplements items={patientSupplements(draft.supplements)}/></main>;}
createRoot(document.getElementById('root')!).render(<Preview/>);
