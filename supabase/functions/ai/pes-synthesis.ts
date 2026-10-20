import { unsupportedPesNumbers } from '../_shared/pes.ts';

/** PES @7: clinical synthesis with traceable evidence and a concise output.
 * The response is a draft; professional approval remains a separate operation.
 * Keep the existing JSON contract and a single provider request. */
export const pesSynthesisInstructions = `
Elabora un borrador de diagnóstico nutricional PES mediante una síntesis clínica de facts. Evalúa relaciones y relevancia; devuelve únicamente el JSON solicitado, sin narrar tu proceso de razonamiento.

COBERTURA Y PRIORIZACIÓN
Examina todas las categorías presentes: entrevista, conducta e ingesta, antropometría, composición corporal, cálculos registrados, laboratorios, síntomas, antecedentes médicos, medicación, actividad, sueño, contexto social, recordatorio confirmado e historial fechado. Distingue hallazgos observados, datos referidos, hipótesis y antecedentes. Prioriza la consulta actual; usa la consulta inicial y los seguimientos disponibles para contrastar cambios documentados. Una ficha sin fecha no es una medición actual; un antecedente no confirma su vigencia. Con interviewOrigin historical o missing señala únicamente las confirmaciones que afecten al diagnóstico. No te ancles a un PES preliminar ni lo uses como prueba: los PES históricos aprobados son valoraciones previas que deben contrastarse con los hechos actuales.

Compara los problemas nutricionales que la evidencia realmente permite considerar y elige UN problema prioritario, específico y abordable mediante intervención nutricional. Valora sustento directo, relevancia clínica y posibilidad de seguimiento; no elijas automáticamente un problema conductual ni el hallazgo con la cifra más alta. Un IMC o porcentaje de grasa no demuestra exceso ACTUAL de ingesta energética ni su causa. Dos comidas al día, por sí solas, tampoco demuestran un patrón problemático. Un recordatorio de un día no establece hábitos. La enfermedad médica y los medicamentos aportan contexto; no sustituyen un diagnóstico nutricional ni demuestran causalidad.

P, E Y S
problem: nombre breve y preciso del problema sustentado. Usa terminología estandarizada del Proceso de Atención Nutricia solo cuando esté disponible y corresponda al caso; no inventes códigos NCPT ni afirmes una validación terminológica inexistente. Evita etiquetas estigmatizantes y descripciones circulares.
etiology: factor o barrera concreta sobre la que pueda orientarse la intervención. No reutilices el problema o sus signos como su propia causa: omitir comidas es una manifestación de la irregularidad alimentaria, no su explicación. Diferencia la existencia documentada del factor de la confirmación de su relación causal. Cuando facts permita una hipótesis plausible pero el vínculo no esté confirmado, escribe «posible influencia de ...» y señala en uncertainties qué relación confirmar. No conviertas coexistencia en causalidad. No inventes estrés, culpa, ansiedad, restricciones, mecanismos ni diagnósticos. Si no hay un factor sustentado siquiera como hipótesis, deja etiology y pesStatement vacíos e indica qué falta preguntar. No escribas «relacionado con» al inicio de etiology: el sistema agrega ese enlace.
signsSymptoms: síntesis de los hallazgos que demuestran el problema elegido y permiten evaluar su evolución. Agrupa los datos relacionados en pocas frases clínicas, evitando copiar una lista de respuestas. Distingue lo referido de lo medido. Conserva cifras, unidades, frecuencia, temporalidad y método cuando estén documentados y sean pertinentes; no calcules cambios ni conviertas unidades. No uses el deseo de perder peso como síntoma. Los datos que se incluyan deben respaldar este problema, no solo coexistir con él.

TRAZABILIDAD Y OTROS HALLAZGOS
Cada evidence copia literalmente source y finding de un fact disponible. Cita el sustento de P, E y S, de las hipótesis y de los otros hallazgos relevantes. TODAS las cifras clínicas de P, E, S y uncertainties deben figurar en evidence. Incluye también los facts de los otros hallazgos dentro de evidence: mencionarlos únicamente en uncertainties no los respalda. Antes de devolver el JSON comprueba esta cobertura. No afirmes que consideraste un dato ausente. No interpretes una sospecha médica «en estudio» como enfermedad confirmada, ni clasifiques gravedad desde un dato aislado.
Evalúa también los hallazgos que no explican el PES principal. Si son relevantes para otro problema o requieren valoración profesional, recógelos brevemente en uncertainties como «Otro hallazgo: ...», con su valor y unidad si existen y evidencia literal. Así pueden conservarse mediciones de adiposidad u otros indicadores sin presentarlos como prueba de un problema conductual. No llenes este campo con todos los datos normales ni con avisos generales. No repitas en cada hallazgo la advertencia de que no demuestra causalidad; conserva la nota factual y la duda específica, si existe.

REDACCIÓN Y CONSISTENCIA
Usa español clínico claro, integrado y conciso. Mantén P, E y S separados; no repitas los conectores dentro de los campos. pesStatement debe representar exactamente esos componentes: «P relacionado con E, evidenciado por S». El sistema recompone este enunciado; no introduzcas allí hallazgos nuevos ni elimines signos seleccionados. Mantén los signos en conjunto por debajo de 1500 caracteres y el enunciado por debajo de 2000.
missingContext contiene solo preguntas concretas cuya respuesta pueda cambiar el problema, la etiología o su seguimiento; no exijas laboratorios, recordatorio o calorías por rutina si el PES elegido no los necesita. uncertainties contiene dudas reales del caso y otros hallazgos relevantes, sin repetir missingContext. Evita advertencias genéricas sobre IA, aprobación o ausencia de causalidad ya explicada. Una ocupación sedentaria y ejercicio programado pueden coexistir: señala contradicciones solo si los registros son incompatibles. Como orientación, usa hasta tres preguntas y hasta cinco notas breves; permite arrays vacíos.
Si no existe evidencia suficiente para un problema nutricional, conserva vacíos P, E, S y el enunciado, y expresa la carencia concreta sin fabricar un diagnóstico. La aprobación y la intervención corresponden al profesional.
`;

/** Called only after JSON-schema validation. Notes containing measurements must
 * have the same literal source support required for numbers in P, E and S. */
export function pesSynthesisEvidenceValid(output: unknown) {
  const value = output as { uncertainties: string[]; evidence: { source?: string; finding: string }[] };
  // Historical dates can belong to the exact source label, not the finding.
  const evidence = value.evidence.map(item => ({finding:`${item.source ?? ''} ${item.finding}`}));
  return unsupportedPesNumbers({problem:'',etiology:'',signsSymptoms:value.uncertainties},evidence).length === 0;
}
