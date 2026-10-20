import { composePesStatement, unsupportedPesNumbers } from '../_shared/pes.ts';

type Fact = { id: string; source: string; finding: string };
type Context = { facts: Fact[]; [key: string]: unknown };
type ReferencedPes = {
  problem: string; etiology: string; signsSymptoms: string[]; pesStatement: string;
  evidenceFactIds: string[]; missingContext: string[];
  uncertainties: { text: string; evidenceFactIds: string[] }[];
};
const ids = (maxItems: number) => ({type:'array',maxItems,items:{type:'string',pattern:'^f[1-9][0-9]{0,2}$'}});

/** Provider references server-owned facts; the browser still receives the PES
 * contract with literal source/finding evidence and plain-text notes. */
export function referencedPesSchema(schema: { properties: Record<string,unknown> }) {
  const { evidence: _evidence, uncertainties: _uncertainties, ...properties } = schema.properties;
  return {type:'object',additionalProperties:false,required:[...Object.keys(properties),'evidenceFactIds','uncertainties'],properties:{...properties,
    evidenceFactIds:ids(15),
    uncertainties:{type:'array',maxItems:5,items:{type:'object',additionalProperties:false,required:['text','evidenceFactIds'],properties:{
      text:{type:'string',maxLength:2000},evidenceFactIds:{...ids(3),minItems:1},
    }}},
  }};
}
export function referencedPesContext(context: unknown): Context {
  const source=context as Context;
  return {...source,facts:source.facts.map((fact,index)=>({...fact,id:`f${index+1}`}))};
}
const numericEvidence = (facts: Fact[]) => facts.map(f=>({finding:`${f.source} ${f.finding}`}));

export function normalizeReferencedPes(output: unknown, context: unknown) {
  const value=output as ReferencedPes;
  const facts=(context as Context).facts;
  const resolve=(references:string[])=>references.map(id=>facts.find(f=>f.id===id));
  const primary=resolve(value.evidenceFactIds);
  if(primary.some(f=>!f)) return null;
  const evidence=primary as Fact[];
  // A main diagnosis with unsupported numbers remains invalid. Optional notes
  // never invalidate an otherwise usable PES: omit an unverified note and make
  // that review gap explicit, without returning its unsupported clinical text.
  if(unsupportedPesNumbers(value,numericEvidence(evidence)).length) return null;
  const uncertainties:string[]=[];
  let omitted=false;
  for(const note of value.uncertainties) {
    const supported=resolve(note.evidenceFactIds);
    if(supported.some(f=>!f) || unsupportedPesNumbers({problem:'',etiology:'',signsSymptoms:[note.text]},numericEvidence(supported as Fact[])).length) {
      omitted=true;continue;
    }
    uncertainties.push(note.text);
    evidence.push(...supported as Fact[]);
  }
  if(omitted) uncertainties.push('Algunos hallazgos adicionales no pudieron vincularse a sus fuentes. Contrástalos con los datos de la revisión clínica.');
  return {problem:value.problem,etiology:value.etiology,signsSymptoms:value.signsSymptoms,
    pesStatement:composePesStatement(value),missingContext:value.missingContext,uncertainties,
    evidence:[...new Map(evidence.map(f=>[f.id,{source:f.source,finding:f.finding}])).values()],
  };
}
export const pesReferenceInstructions = `
REFERENCIAS DE ESTA VERSIÓN
Cada fact tiene un id estable como f1. En evidenceFactIds incluye los ids que sustentan P, E y S. Cada nota de uncertainties es un objeto {text, evidenceFactIds}: cita allí los ids de TODOS los datos usados en esa nota, incluidos fechas, cantidades, duración del sueño, medicación y ficha. Usa hasta tres fuentes por nota y divide o sintetiza si hace falta. Una pregunta sin respuesta pertenece a missingContext, no requiere inventar una fuente. No copies ni reescribas source o finding; el servidor los incorpora literalmente a partir de los ids. Conserva las cifras y unidades de las fuentes. Usa exclusivamente ids existentes. Estas reglas sustituyen las instrucciones anteriores sobre escribir objetos evidence y arrays de texto en uncertainties; el resto de las reglas clínicas se conserva.
`;
