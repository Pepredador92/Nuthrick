import type { ClinicalSource } from './clinical.ts';

/** Synthetic evaluation cases, independent of patient records and credit ledgers. */
export const pesSynthesisCases: Record<string, { purpose: string; source: ClinicalSource }> = {
  behavioral: {
    purpose: 'Prioritize supported eating behaviors, distinguish causal hypotheses, retain adiposity as an additional finding, avoid invented emotions and routine laboratory requirements.',
    source: { stamp: 'synthetic-behavioral', facts: [
      { source: 'Entrevista · usual pattern', finding: 'Habitualmente realiza desayuno y comida; refiere omitir comidas para compensar lo consumido previamente.' },
      { source: 'Entrevista · eating speed', finding: 'Refiere comer rápidamente y en ocasiones continuar hasta sentir plenitud incómoda.' },
      { source: 'Entrevista · hunger recognition', finding: 'Refiere reconocer solo a veces hambre y saciedad.' },
      { source: 'Entrevista · schedule constraints', finding: 'Horarios laborales variables y tiempo limitado para organizar las comidas. No se ha confirmado su relación causal con las omisiones.' },
      { source: 'Entrevista · stress level', finding: 'No se ha explorado estrés, culpa ni ansiedad.' },
      { source: 'Entrevista · daily activity', finding: 'Trabajo principalmente sentado; realiza ejercicio moderado 3 días por semana durante 45 minutos.' },
      { source: 'Antropometría · Peso', finding: '96 kg · consulta 2026-10-01', metric_code: 'weight', origin: 'measurement', numeric_value: 96, unit: 'kg', consultation_date: '2026-10-01' },
      { source: 'Antropometría · Estatura', finding: '170 cm · consulta 2026-10-01', metric_code: 'height', origin: 'measurement', numeric_value: 170, unit: 'cm', consultation_date: '2026-10-01' },
      { source: 'Cálculo registrado · IMC', finding: '33.2 kg/m² · consulta 2026-10-01', metric_code: 'bmi', origin: 'calculation', numeric_value: 33.2, unit: 'kg/m²', consultation_date: '2026-10-01' },
      { source: 'Antropometría · Grasa corporal', finding: '41 % · método de bioimpedancia registrado · consulta 2026-10-01', metric_code: 'body_fat_percentage_device', origin: 'measurement', numeric_value: 41, unit: '%', method: 'Bioimpedancia', consultation_date: '2026-10-01' },
    ] },
  },
  anthropometry_only: {
    purpose: 'An isolated BMI and body-fat measurement cannot establish current excess energy intake or its etiology.',
    source: { stamp: 'synthetic-anthropometry', facts: [
      { source: 'Cálculo registrado · IMC', finding: '33.2 kg/m² · consulta 2026-10-01', metric_code: 'bmi', origin: 'calculation', consultation_date: '2026-10-01' },
      { source: 'Antropometría · Grasa corporal', finding: '41 % · método de bioimpedancia registrado · consulta 2026-10-01', metric_code: 'body_fat_percentage_device', origin: 'measurement', consultation_date: '2026-10-01' },
    ] },
  },
  intake: {
    purpose: 'Select an intake problem when direct current intake evidence and a documented barrier are stronger than an old behavioral diagnosis.',
    source: { stamp: 'synthetic-intake', facts: [
      { source: 'Entrevista · general symptoms', finding: 'Refiere dolor al masticar desde hace 3 semanas y menor consumo de alimentos sólidos por ese dolor.' },
      { source: 'Entrevista · usual pattern', finding: 'Mantiene sus horarios habituales; niega omisiones compensatorias y dificultades de organización alimentaria actuales.' },
      { source: 'Entrevista · professional notes', finding: 'El profesional documentó consumo habitual aproximado del 60 % del requerimiento estimado durante 3 semanas, mediante registro alimentario revisado de 7 días.' },
      { source: 'Antropometría · Peso', finding: '62 kg · consulta 2026-10-01', metric_code: 'weight', origin: 'measurement', consultation_date: '2026-10-01' },
      { source: 'PES previo aprobado · 2026-06-01 · pes statement', finding: 'Se registró previamente un patrón alimentario desorganizado relacionado con horarios laborales.' },
    ] },
  },
};
