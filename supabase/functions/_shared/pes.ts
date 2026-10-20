/** Shared composition rules. Clinical interpretation remains a professional decision. */
export type PesParts = { problem: string; etiology: string; signsSymptoms: string[]; pesStatement: string };
const phrase = (value: string) => value.trim().replace(/[.;\s]+$/u, '');
export function composePesStatement(parts: Pick<PesParts, 'problem' | 'etiology' | 'signsSymptoms'>) {
  const problem = phrase(parts.problem), etiology = phrase(parts.etiology);
  const signs = parts.signsSymptoms.map(phrase).filter(Boolean);
  return problem && etiology && signs.length ? `${problem} relacionado con ${etiology}, evidenciado por ${signs.join('; ')}.` : '';
}
export function pesStatementMatches(parts: PesParts) {
  return parts.pesStatement.trim() === composePesStatement(parts);
}
const numbers = (text: string) => [...text.matchAll(/\d+(?:[.,]\d+)?/g)].map(match => Number(match[0].replace(',', '.')).toString());
export function unsupportedPesNumbers(parts: Pick<PesParts, 'problem' | 'etiology' | 'signsSymptoms'>, evidence: { finding: string }[]) {
  const available = new Set(evidence.flatMap(item => numbers(item.finding)));
  return [...new Set(numbers([parts.problem, parts.etiology, ...parts.signsSymptoms].join(' ')).filter(value => !available.has(value)))];
}
export type ClinicalMeasurementFact = {
  source: string; finding: string;
  metric_code?: string; origin?: 'measurement' | 'calculation' | 'laboratory' | 'baseline';
  numeric_value?: number | null; unit?: string | null; recorded_at?: string | null;
  consultation_date?: string; method?: string;
};
