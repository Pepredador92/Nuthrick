import { sanitizePortalContent } from './portal-content.ts';

for (const key of ['objectives', 'treatment_objective', 'next_objectives']) {
  Deno.test(`explicit sharing accepts ${key} with consultation provenance`, () => {
    const result = sanitizePortalContent({
      goal: 'Objetivo acordado', instructions: '', results: [], consultations: [],
      goalSource: { consultationId: '00000000-0000-0000-0000-000000000001', revision: 1, questionKey: key },
      privateClinicalData: 'never forward',
    });
    if (result.goalSource?.questionKey !== key || 'privateClinicalData' in result) throw new Error('Invalid patient DTO');
  });
}
Deno.test('sharing rejects unrelated clinical answers', () => {
  try {
    sanitizePortalContent({
      goal: 'Clinical content', instructions: '', results: [], consultations: [],
      goalSource: { consultationId: '00000000-0000-0000-0000-000000000001', revision: 1, questionKey: 'pes_statement' },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'invalid_input') return;
    throw error;
  }
  throw new Error('Unrelated clinical answer accepted');
});

Deno.test('sharing preserves only the safe progress presentation fields', () => {
  const result = sanitizePortalContent({
    goal: '', instructions: '', consultations: [],
    results: [{
      id: 'bmi', label: 'IMC', unit: 'kg/m²', method: 'IMC', conceptCode: 'bmi', visualization: 'line',
      points: [{ consultationId: '00000000-0000-0000-0000-000000000001', date: '2026-09-01', value: '33.9', classificationLabel: 'Obesidad grado I' }],
      presentation: {
        classification: {
          label: 'Obesidad grado I', origin: 'Clasificación registrada', source: 'OMS · 2000', consultationId: '00000000-0000-0000-0000-000000000001', marker: 70, low: 10, high: 45,
          rules: [{ id: 'one', label: 'Obesidad grado I', lower: 30, upper: 35 }],
        },
      },
    }],
  });
  if (result.results[0].presentation?.classification?.label !== 'Obesidad grado I' || result.results[0].points[0].classificationLabel !== 'Obesidad grado I') throw new Error('Progress presentation was not preserved');
});

Deno.test('structured sharing preserves approved text and only explicit patient fields', async()=>{
 const {sharedObjectiveLabels,sharedStrategyLabels}=await import('../_shared/clinical-guidance.ts');
 const source={consultationId:'00000000-0000-0000-0000-000000000001',revision:2,approvedAt:'2026-10-20T16:00:00Z'};
 const objective={...Object.fromEntries(Object.keys(sharedObjectiveLabels).map(k=>[k,` ${k} · texto aprobado\nsegunda línea `])),source:{...source,questionKey:'treatment_objective',goalIndex:0},etiology:'PRIVATE',evidence:[{finding:'PRIVATE'}]};
 const strategy={...Object.fromEntries(Object.keys(sharedStrategyLabels).map(k=>[k,`${k} revisado`])),route:'oral',source:{...source,strategyId:'00000000-0000-0000-0000-000000000002',version:1},referenceNotes:'PRIVATE',execution:{executor:'PRIVATE'}};
 const content=sanitizePortalContent({goal:'',instructions:'',results:[],consultations:[],objectives:[objective],strategies:[strategy]});
 if(content.objectives?.[0].outcome!==' outcome · texto aprobado\nsegunda línea '||content.strategies?.[0].frequency!=='frequency revisado')throw new Error('Approved detail was changed');
 if(JSON.stringify(content).includes('PRIVATE'))throw new Error('Private fields leaked');
 for(const invalid of [{...objective,source:{...objective.source,goalIndex:3}},{...objective,target:'x'.repeat(401)}]){
  let rejected=false;try{sanitizePortalContent({goal:'',instructions:'',results:[],consultations:[],objectives:[invalid]});}catch{rejected=true;}
  if(!rejected)throw new Error('Invalid structured field accepted');
 }
});
