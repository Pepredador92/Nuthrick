import { strict as assert } from "node:assert";
import recorded from "./fixtures/pes-real-calibration-20260922.json" with { type: "json" };
import { clinicalEvidenceValid, pesSchema } from "./clinical.ts";
import { validOutput } from "./core.ts";

Deno.test('complete PES response contract: required fields, nulls, arrays, bounds and unknowns', () => {
  const base=recorded.A.output;
  for(const field of Object.keys(base)) {
    const missing={...base} as Record<string,unknown>;delete missing[field];
    assert.equal(validOutput(pesSchema,missing),false,field+' missing');
    assert.equal(validOutput(pesSchema,{...base,[field]:null}),false,field+' null');
  }
  for(const [field,limit] of [['problem',500],['etiology',1500],['pesStatement',2000]] as const) {
    assert.equal(validOutput(pesSchema,{...base,[field]:'x'.repeat(limit)}),true);
    assert.equal(validOutput(pesSchema,{...base,[field]:'x'.repeat(limit+1)}),false);
    assert.equal(validOutput(pesSchema,{...base,[field]:42}),false);
  }
  for(const field of ['signsSymptoms','missingContext','uncertainties']) {
    assert.equal(validOutput(pesSchema,{...base,[field]:Array(30).fill('x')}),true);
    for(const value of [Array(31).fill('x'),[null],[42],['x'.repeat(2001)],'not array']) assert.equal(validOutput(pesSchema,{...base,[field]:value}),false);
  }
  for(const evidence of [[{source:'x'}],[{source:'x',finding:'y',extra:true}],Array(31).fill({source:'x',finding:'y'})]) assert.equal(validOutput(pesSchema,{...base,evidence}),false);
  assert.equal(validOutput(pesSchema,{...base,unknown:true}),false);
  assert.equal(validOutput(pesSchema,recorded.B.output),true,'empty diagnostic strings allowed only as draft abstention');
});

// Recorded real responses are regression data, never live calls or clinical truth.
for (const [name, report] of Object.entries(recorded)) {
  Deno.test(`real calibration ${name}: parser/schema and exact evidence provenance`, () => {
    assert.equal(report.responseModel, "gpt-5.6-terra");
    assert.equal(validOutput(pesSchema, report.output), true);
    assert.equal(clinicalEvidenceValid("pes_diagnosis", report.output, report.exactInput.context), true);
    assert.equal(report.input_tokens + report.output_tokens, report.total_tokens);
  });
}
Deno.test("real A keeps work schedule and skipped breakfast as its support", () => {
  const a = recorded.A.output;
  assert.match(a.etiology, /trabajo temprano/);
  assert.match(a.pesStatement, /desayuno/);
  assert.ok(a.signsSymptoms.every(s => recorded.A.exactInput.context.facts.some(f => f.finding === s)));
});
for (const name of ["B", "C"] as const) {
  Deno.test(`real ${name}: informative abstention instead of invented PES`, () => {
    const result = recorded[name].output;
    assert.equal(result.problem, "");
    assert.equal(result.etiology, "");
    assert.equal(result.pesStatement, "");
    assert.deepEqual(result.signsSymptoms, []);
    assert.ok(result.missingContext.length > 0);
    assert.ok(result.uncertainties.length > 0);
  });
}
Deno.test("real C preserves unquantified foods and does not invent fasting or convert laboratory units", () => {
  assert.equal(recorded.C.output.evidence[0].finding, recorded.C.exactInput.context.facts[3].finding);
  assert.match(recorded.C.output.uncertainties.join(" "), /sin condición de ayuno/);
  assert.doesNotMatch(JSON.stringify(recorded.C.output), /mg\/dL|diabetes|hiperglucemia|\d+\s*(?:kcal|gramos)/i);
});
