import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DietEnergyStep } from './DietEnergyStep';
import { calculatePlanEnergy, createPlanEnergyCalculation } from '@/src/features/diet-energy/model';
import type { NutritionPlan } from '@/src/types/domain';

const reference = { weightKg: 72, heightCm: 165, ageYears: 35, equationSex: 'female' as const };
function mount() {
  const onDraftChange = vi.fn();
  render(<DietEnergyStep plan={{ id: 'plan', target_calories: null, energy_calculation: null } as NutritionPlan} reference={reference} referenceLoading={false} onSave={async () => {}} onDraftChange={onDraftChange} onContinue={vi.fn()} />);
  return onDraftChange;
}

describe('Energy cards', () => {
  it('uses the existing GET calculation and restores a reference override', () => {
    const changed = mount();
    fireEvent.change(screen.getByLabelText('Peso'), { target: { value: '80.5' } });
    expect(changed.mock.lastCall?.[0].inputs.weight_kg.value).toBe(80.5);
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar peso' }));
    expect(screen.getByLabelText('Peso')).toHaveValue(72);
    fireEvent.click(screen.getByRole('button', { name: /Usar GET/ }));
    const expected = Math.round(calculatePlanEnergy(createPlanEnergyCalculation(reference)).results.total_kcal!);
    expect(screen.getByLabelText('Objetivo prescrito (kcal/día)')).toHaveValue(expected);
    expect(changed.mock.lastCall?.[0].prescribed_target_kcal).toBe(expected);
    expect(screen.getByRole('button', { name: 'Continuar a macronutrientes' })).toBeEnabled();
  });

  it('keeps manual and measured capture available in the method card', () => {
    const changed = mount();
    fireEvent.change(screen.getByLabelText('Método', { exact: true }), { target: { value: 'MEASURED_INDIRECT_CALORIMETRY' } });
    fireEvent.change(screen.getByLabelText('Gasto medido (kcal/día)'), { target: { value: '1400' } });
    expect(changed.mock.lastCall?.[0].results.basal_kcal).toBe(1400);
    fireEvent.change(screen.getByLabelText('Método', { exact: true }), { target: { value: 'MANUAL_ENERGY_TARGET' } });
    expect(screen.queryByLabelText('Gasto medido (kcal/día)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Método de actividad')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Objetivo prescrito (kcal/día)'), { target: { value: '1800' } });
    expect(changed.mock.lastCall?.[0]).toEqual(expect.objectContaining({ mode: 'manual', prescribed_target_kcal: 1800 }));
    expect(changed.mock.lastCall?.[0].results.total_kcal).toBeNull();
  });

  it('keeps PAL separate from the ETA checkbox', () => {
    const changed = mount();
    fireEvent.change(screen.getByLabelText('Método de actividad'), { target: { value: 'PAL_FAO_WHO_UNU' } });
    expect(screen.queryByRole('checkbox', { name: 'Incluir ETA' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('PAL utilizado'), { target: { value: '1.7' } });
    expect(changed.mock.lastCall?.[0].eta.enabled).toBe(false);
    expect(changed.mock.lastCall?.[0].results.eta_integrated).toBe(true);
  });
});
