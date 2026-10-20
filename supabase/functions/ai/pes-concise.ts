import { pesPriorityPrefix, pesPriorityPendingPrefix, unsupportedPesNumbers } from '../_shared/pes.ts';
import { normalizeReferencedPes } from './pes-references.ts';

const topics = {
  intake: 'Ingesta y conducta alimentaria', anthropometry: 'Antropometría y composición corporal',
  laboratory: 'Estudios de laboratorio', medical: 'Antecedentes médicos', medication: 'Medicación',
  sleep: 'Sueño', activity: 'Actividad física', psychosocial: 'Contexto y emociones',
  symptoms: 'Síntomas', history: 'Evolución e historial', other: 'Otros hallazgos',
};
type Fact = {id:string;source:string;finding:string};
type Note = {text:string;evidenceFactIds:string[]};
type ConcisePes = {
  problem:string;etiology:string;signsSymptoms:string[];evidenceFactIds:string[];missingContext:string[];
  priority:Note;uncertainties:(Note & {topic:keyof typeof topics})[];
};
const ids = (maxItems:number) => ({type:'array',maxItems,items:{type:'string',pattern:'^f[1-9][0-9]{0,2}$'}});
const shortText = (maxLength:number) => ({type:'string',maxLength});
const object = (properties:Record<string,unknown>) => ({type:'object',additionalProperties:false,required:Object.keys(properties),properties});

/** Smaller components keep the composed statement below the existing 2000
 * character limit without truncating measurements or rewriting clinical claims. */
export const concisePesSchema = object({
  problem:{...shortText(160),description:'Nombre breve del problema nutricional prioritario.'},
  etiology:{...shortText(400),description:'Sintagma causal en minúscula, sin el conector relacionado con; conserva la incertidumbre cuando sea una hipótesis.'},
  signsSymptoms:{type:'array',maxItems:4,items:{...shortText(240),description:'Frase nominal breve en minúscula que encaja después de evidenciado por. Distingue lo referido de lo medido.'}},
  evidenceFactIds:ids(12),
  priority:object({text:shortText(450),evidenceFactIds:ids(3)}),
  missingContext:{type:'array',maxItems:3,items:shortText(400)},
  uncertainties:{type:'array',maxItems:5,items:object({
    topic:{type:'string',enum:Object.keys(topics)},text:shortText(450),evidenceFactIds:{...ids(3),minItems:1},
  })},
});
// Formatting only: preserve clinical content, acronyms and proper names.
const fragment = (value:string) => value.trim().replace(/^(Posibles?|Barreras?|Limitaciones?|Dificultades?|Omisión|Episodios|Ingesta|Consumo|Reconocimiento|Alimentación|Horarios?|Ventana|Tiempo|Organización|Disminución|Aumento|Pérdida|Ausencia|Presencia|Restricción|Alteración|Reporte|Referencia)\b/u, word => word.toLocaleLowerCase('es'));

export function normalizeConcisePes(output:unknown, context:unknown) {
  const raw=output as ConcisePes;
  const parts={...raw,etiology:fragment(raw.etiology),signsSymptoms:raw.signsSymptoms.map(fragment)};
  const draft=normalizeReferencedPes({...parts,pesStatement:'',uncertainties:[]},context);
  if (!draft) return null;
  const facts=(context as {facts:Fact[]}).facts;
  const evidence=new Map(draft.evidence.map(f=>[JSON.stringify([f.source,f.finding]),f]));
  const resolve=(note:Note)=>note.evidenceFactIds.map(id=>facts.find(f=>f.id===id));
  const supported=(note:Note, sources:(Fact|undefined)[])=>sources.length>0 && sources.every(Boolean) && !unsupportedPesNumbers(
    {problem:note.text,etiology:'',signsSymptoms:[]},
    (sources as Fact[]).map(f=>({finding:`${f.source} ${f.finding}`})),
  ).length;
  const addEvidence=(sources:(Fact|undefined)[])=>sources.forEach(f=>{
    if(f)evidence.set(JSON.stringify([f.source,f.finding]),{source:f.source,finding:f.finding});
  });
  const notes:string[]=[];
  const prioritySources=resolve(raw.priority);
  if(raw.priority.text.trim() && supported(raw.priority,prioritySources)) {
    notes.push(pesPriorityPrefix+raw.priority.text.trim());addEvidence(prioritySources);
  } else if(draft.problem.trim()) {
    notes.push(pesPriorityPendingPrefix+'Confirma qué evidencia hace prioritario este problema frente a los otros hallazgos de la consulta. La justificación generada no pudo verificarse.');
  }
  for(const note of raw.uncertainties) {
    const sources=resolve(note);
    if(note.text.trim() && supported(note,sources)) {
      notes.push(`${topics[note.topic]}: ${note.text.trim()}`);addEvidence(sources);
    } else {
      const labels=[...new Set(sources.filter((f):f is Fact=>!!f).map(f=>f.source).filter(source=>source.length<=200))];
      // Never return the unverified interpretation. The area is allowlisted and
      // source labels come from the server, so the review request is actionable.
      notes.push(`Revisión pendiente · ${topics[note.topic]}: se omitió una interpretación porque sus referencias no permitieron comprobarla.${labels.length?` Revisa las fuentes: ${labels.join('; ')}.`:' Contrasta esta área con las fuentes de la revisión clínica.'}`);
      addEvidence(sources);
    }
  }
  return {...draft,uncertainties:[...new Set(notes)],evidence:[...evidence.values()]};
}

export const concisePesInstructions = `
SÍNTESIS CLÍNICA PES
Elabora un borrador nutricional a partir de facts. Evalúa la pertinencia y las relaciones entre los datos; devuelve solo el JSON solicitado, sin narrar tu proceso interno. El sistema construye el enunciado con los componentes ya depurados, sin una segunda generación ni nuevos datos. No devuelvas pesStatement.

COBERTURA Y ELECCIÓN DEL PROBLEMA
Examina todas las categorías presentes: entrevista, ingesta y conducta, recordatorio confirmado, antropometría, composición corporal, cálculos, laboratorios, síntomas, antecedentes médicos, medicación, actividad, sueño, contexto social e historial fechado. Distingue datos referidos, medidos, calculados, hipótesis y antecedentes. Prioriza la consulta actual y contrasta cambios solo cuando existan datos comparables y fechados. Una ficha sin fecha no es una medición actual. Con entrevista histórica o ausente señala las confirmaciones que afectan al diagnóstico. No uses un PES previo como prueba ni te ancles a él.

Compara los problemas sustentados y elige UNO prioritario por evidencia directa, relevancia clínica y posibilidad de intervención y seguimiento. No elijas automáticamente un problema conductual ni la cifra más alta. Un IMC o grasa corporal no demuestra exceso actual de ingesta ni su causa; dos comidas al día por sí solas no demuestran un patrón problemático; un recordatorio de un día no establece hábitos. Los antecedentes y medicamentos no sustituyen un diagnóstico nutricional ni prueban causalidad. No conviertas una sospecha médica en enfermedad confirmada ni clasifiques gravedad desde un dato aislado. Usa terminología estandarizada solo cuando esté disponible y corresponda; no inventes códigos ni afirmes validación terminológica.

COMPONENTES Y REDACCIÓN
problem es un nombre breve y preciso del problema sustentado, sin etiquetas estigmatizantes. etiology describe un factor documentado sobre el que pueda orientarse la intervención; no uses el propio problema, su manifestación, una medición o un diagnóstico médico como explicación automática. Distingue la existencia de un factor de la confirmación de su relación causal. Si la evidencia solo permite una hipótesis, conserva explícitamente esa incertidumbre y señala qué vínculo confirmar. Si ni siquiera permite una hipótesis, deja etiology vacío y expresa la pregunta concreta en missingContext. Si no existe problema sustentado, deja P, E, S y priority.text vacíos; no fabriques un diagnóstico.

El PES final debe ser una sola oración clínica integrada, orientativamente de 70–110 palabras cuando el caso lo permita. No necesitas llegar a ese tamaño: prima la evidencia pertinente. problem es un nombre breve. etiology es UN factor central o conjunto estrechamente relacionado; usa «posibles barreras de ...» si el vínculo es hipotético, evitando «posible influencia de» y las cadenas de causas especulativas. No añadas «relacionado con» al campo.

Devuelve de una a cuatro frases nominales en signsSymptoms; sintetiza y agrupa hallazgos relacionados. Deben encajar gramaticalmente después de «evidenciado por». Evita iniciar con verbos como «Refiere», «Realiza», «Presenta» o «Reconoce». Prefiere «omisión de comidas referida», «ingesta rápida referida», «episodios referidos de ...» o «peso medido de ...», solo si constan. Conserva la distinción referido/medido y las frecuencias o magnitudes pertinentes. No copies el detalle de la jornada, horarios exactos, transporte o compra en S si ya explican E y no miden el problema; conserva esos detalles en las fuentes. No elimines signos esenciales para acortar ni inventes frecuencias. Empieza E y cada signo en minúscula salvo siglas o nombres propios. No impongas un problema conductual: la evidencia decide.

Cada signo debe demostrar el problema elegido y ayudar a evaluar su evolución, no simplemente coexistir con él. No uses el deseo de perder peso como síntoma. No inventes cantidades, causas, síntomas, emociones, mecanismos, capacidad ni diagnósticos. Conserva valores, unidades, método y fechas pertinentes; no calcules cambios, umbrales ni conversiones. Una actividad cotidiana sedentaria y ejercicio programado pueden coexistir; señala contradicciones solo si los registros son incompatibles.

priority contiene una justificación clínica breve, de una o dos frases, con evidenceFactIds. Explica qué evidencia directa respalda el problema elegido y por qué merece prioridad frente a otros hallazgos relevantes; puede señalar que un indicador no explica por sí solo la causa, sin desestimar su importancia. Incluye un indicador de seguimiento documentado cuando exista. Es una conclusión clínica verificable, no un relato de tus pasos internos. No fabriques problemas alternativos, códigos, gravedad ni relaciones causales. Si no hay problema sustentado, deja priority.text vacío y explica la carencia concreta en missingContext.

Cita los facts por id: evidenceFactIds para P/E/S y referencias propias para priority y cada nota. El servidor incorpora source y finding literalmente. uncertainties recoge solo otros hallazgos relevantes o incertidumbres concretas, una nota breve por tema; topic debe corresponder a su contenido. Evita repetir S y advertencias genéricas. Separa medicación, sueño o mediciones en notas distintas si harían falta más de tres fuentes. Conserva los valores, unidades y fechas que importen para interpretarlos, sin rellenar todo el expediente. Todas las cifras y datos de cada nota deben estar sustentados por sus propias referencias. missingContext conserva hasta tres preguntas que puedan cambiar el diagnóstico, su causa o su seguimiento; no solicites estudios por rutina.

No dejes una medición pertinente únicamente en las referencias si debe integrar S. Si una medición importante no respalda el problema elegido, recógela como otro hallazgo para revisión en su propio dominio. Evita llenar las notas con datos normales o avisos repetidos sobre causalidad. No afirmes que consideraste un dato ausente. No propongas objetivos, tratamiento ni indicaciones. Devuelve solo el JSON del esquema. La aprobación sigue correspondiendo al profesional.
`;
