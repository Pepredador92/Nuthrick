import { strict as assert } from 'node:assert';
import { buildPesClinicalContext, clinicalAdapter, clinicalEvidenceValid, normalizePesOutput, pesClinicalStructureValid, pesSchema } from './clinical.ts';
import { validOutput } from './core.ts';
import { pesSynthesisCases } from './pes-synthesis-fixtures.ts';
import { pesSynthesisEvidenceValid } from './pes-synthesis.ts';
import recorded from './fixtures/pes-synthesis-calibration-20261020.json' with { type: 'json' };

// Actual provider outputs on synthetic records. These validate the response
// contract and provenance; they are not clinical ground truth or proof of accuracy.
for (const [name, report] of Object.entries(recorded.cases)) {
  Deno.test(`PES @7 real synthetic ${name}: schema, literal evidence and all measured claims`, () => {
    const context = buildPesClinicalContext(pesSynthesisCases[name].source);
    const output = normalizePesOutput(report.output);
    assert.equal(validOutput(pesSchema,output),true);
    assert.equal(clinicalEvidenceValid('pes_diagnosis',output,context),true);
    assert.equal(pesClinicalStructureValid(output),true);
    assert.equal(pesSynthesisEvidenceValid(output),true);
  });
}

Deno.test('PES @7 keeps the existing output contract and comprehensive source coverage', () => {
  const adapter = clinicalAdapter('pes_diagnosis','pes_diagnosis@7')!;
  assert.deepEqual(adapter.schema,pesSchema);
  assert.notEqual(adapter.instructions,clinicalAdapter('pes_diagnosis','pes_diagnosis@6')!.instructions);
  for (const scenario of Object.values(pesSynthesisCases)) {
    const context = buildPesClinicalContext(scenario.source);
    assert.equal(context.facts.length,scenario.source.facts.length);
    for (const fact of scenario.source.facts) assert.ok(context.facts.some(value => value.source===fact.source && value.finding===fact.finding));
  }
});
Deno.test('PES @7 supports a concise hypothesis and leaves unrelated measured findings outside S with their provenance', () => {
  const context = buildPesClinicalContext(pesSynthesisCases.behavioral.source);
  const output = normalizePesOutput({problem:'Patrón alimentario desorganizado',etiology:'posible influencia de barreras de horario y organización',
    signsSymptoms:['Omisión compensatoria de comidas y alimentación rápida con plenitud incómoda referida.'],pesStatement:'Texto divergente',
    evidence:[context.facts[0],context.facts[1],context.facts[3],context.facts[9]].map(({source,finding}) => ({source,finding})),missingContext:[],
    uncertainties:['Confirmar la relación entre las barreras de horario y las omisiones.','Otro hallazgo: grasa corporal de 41 % por bioimpedancia registrada en la consulta del 2026-10-01.']});
  assert.equal(validOutput(pesSchema,output),true);
  assert.equal(clinicalEvidenceValid('pes_diagnosis',output,context),true);
  assert.equal(pesClinicalStructureValid(output),true);
  assert.equal(pesSynthesisEvidenceValid(output),true);
  assert.ok((output as {pesStatement:string}).pesStatement.includes('posible influencia'));
  assert.ok(!(output as {pesStatement:string}).pesStatement.includes('41 %'));
});
Deno.test('PES @7 rejects measured claims in other findings without their own cited support', () => {
  const evidence = [{finding:'Horarios laborales variables.'}];
  assert.equal(pesSynthesisEvidenceValid({uncertainties:['Otro hallazgo: grasa corporal de 41 %.'],evidence}),false);
  assert.equal(pesSynthesisEvidenceValid({uncertainties:['Otro hallazgo: grasa corporal de 41 %.'],evidence:[...evidence,{finding:'41 % · Bioimpedancia'}]}),true);
  assert.equal(pesSynthesisEvidenceValid({uncertainties:['El PES previo del 2026-06-01 requiere contraste.'],evidence:[{source:'PES previo aprobado · 2026-06-01 · pes statement',finding:'Patrón alimentario registrado.'}]}),true);
});
Deno.test('PES @7 preserves partial drafts when isolated anthropometry has no supported etiology', () => {
  const context = buildPesClinicalContext(pesSynthesisCases.anthropometry_only.source);
  const output=normalizePesOutput({problem:'Hallazgo antropométrico por valorar',etiology:'',signsSymptoms:['IMC registrado de 33.2 kg/m².'],pesStatement:'Diagnóstico completo inventado',
    evidence:[{source:context.facts[0].source,finding:context.facts[0].finding}],missingContext:['Explorar alimentación habitual y factores relacionados.'],uncertainties:[]});
  assert.equal(validOutput(pesSchema,output),true);
  assert.equal(clinicalEvidenceValid('pes_diagnosis',output,context),true);
  assert.equal(pesClinicalStructureValid(output),true);
  assert.equal((output as {pesStatement:string}).pesStatement,'');
});
