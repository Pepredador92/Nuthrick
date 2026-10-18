import { describe, expect, it } from 'vitest';
import { canApprovePes, composePesStatement, pesFromAnswers, unsupportedPesNumbers, updatePesParts } from './clinicalCopilot';
import { clinicalMeasurementRows } from './clinicalMeasurements';
import type { ClinicalMeasurementFact } from './clinicalCopilot';
const draft = { problem: 'Ingesta oral insuficiente', etiology: 'disminución del apetito documentada', signsSymptoms: ['Consumo de 1200 kcal en el día evaluado'], pesStatement: '', evidence: [], missingContext: [], uncertainties: [] };
describe('coherent PES statement', () => {
  it('composes P, E and S and updates the statement when a component changes', () => {
    const next = updatePesParts(draft, {});
    expect(next.pesStatement).toBe('Ingesta oral insuficiente relacionado con disminución del apetito documentada, evidenciado por Consumo de 1200 kcal en el día evaluado.');
    expect(canApprovePes(next)).toBe(true);
    expect(canApprovePes({ ...next, etiology: 'otra causa' })).toBe(false);
    expect(updatePesParts(next, { etiology: 'otra causa' }).pesStatement).toContain('relacionado con otra causa,');
    expect(composePesStatement({ ...draft, etiology: ' ' })).toBe('');
  });
  it('preserves saved statements for explicit review instead of rewriting history on load', () => {
    expect(pesFromAnswers({ pes_problem: 'P', pes_etiology: 'E', pes_evidence: 'S', pes_statement: 'Texto histórico' }).pesStatement).toBe('Texto histórico');
  });
  it('detects numerical claims absent from the cited evidence without deriving thresholds', () => {
    expect(unsupportedPesNumbers(draft, [{ finding: '1200 kcal' }])).toEqual([]);
    expect(unsupportedPesNumbers({ ...draft, signsSymptoms: ['Pérdida de 7,5 % en 30 días'] }, [{ finding: 'Peso 80 kg' }])).toEqual(['7.5', '30']);
    expect(unsupportedPesNumbers({ ...draft, signsSymptoms: ['Grasa 27,5 %'] }, [{ finding: '27.5 %' }])).toEqual([]);
  });
});
describe('measurement comparison', () => {
  const fact = (source: string, value: number, method = 'Equipo A', unit = '%'): ClinicalMeasurementFact => ({ source, finding: `${value} ${unit}`, metric_code: 'body_fat_percentage_device', origin: 'measurement', numeric_value: value, unit, method, consultation_date: source.startsWith('Historial') ? '2026-09-01' : '2026-10-18' });
  it('uses stable codes despite labels and compares only matching units and methods', () => {
    const rows = clinicalMeasurementRows([fact('Historial · Grasa (%)', 32), fact('Antropometría · Grasa corporal', 30), fact('Historial · Grasa (%)', 31, 'Equipo B')]);
    expect(rows).toHaveLength(2);
    expect(rows.find(row => row.method === 'Equipo A')?.change).toBe(-2);
    expect(rows.find(row => row.method === 'Equipo B')?.change).toBeNull();
    expect(clinicalMeasurementRows([fact('Historial · Grasa (%)', 32, 'Equipo A', 'kg'), fact('Antropometría · Grasa (%)', 30)])).toHaveLength(2);
  });
  it('keeps conflicting readings visible and does not choose an arbitrary delta', () => {
    const rows = clinicalMeasurementRows([fact('Historial · Grasa (%)', 32), fact('Historial · Grasa (%)', 33), fact('Antropometría · Grasa (%)', 30)]);
    expect(rows[0].previous).toHaveLength(2); expect(rows[0].change).toBeNull();
  });
});
