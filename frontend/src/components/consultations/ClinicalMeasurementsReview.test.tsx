import { render, screen, within } from '@testing-library/react';
import { expect, it } from 'vitest';
import { ClinicalMeasurementsReview } from './ClinicalMeasurementsReview';
it('shows current and previous measurements and keeps undated baseline separate', () => {
  render(<ClinicalMeasurementsReview facts={[
    { source: 'Antropometría · Grasa (%) · Equipo A', finding: '30 %', metric_code: 'body_fat_percentage_device', origin: 'measurement', numeric_value: 30, unit: '%', method: 'Equipo A', consultation_date: '2026-10-18' },
    { source: 'Historial · Grasa (%) · Equipo A', finding: '32 %', metric_code: 'body_fat_percentage_device', origin: 'measurement', numeric_value: 32, unit: '%', method: 'Equipo A', consultation_date: '2026-09-01' },
    { source: 'Dato de ficha · Estatura', finding: '170 cm · fecha de medición no registrada', metric_code: 'height', origin: 'baseline' },
  ]} />);
  const table = within(screen.getByRole('table'));
  expect(table.getByText('30 %')).toBeInTheDocument(); expect(table.getByText('32 %')).toBeInTheDocument(); expect(table.getByText('-2 puntos porcentuales')).toBeInTheDocument();
  expect(table.queryByText('Estatura')).not.toBeInTheDocument();
  expect(screen.getByText('170 cm · fecha de medición no registrada')).toBeInTheDocument();
});
