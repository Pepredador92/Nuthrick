import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { PatientCombobox, type PatientOption } from './PatientCombobox';
import { listPatients } from '@/src/services/patients';
vi.mock('@/src/services/patients', () => ({ listPatients: vi.fn() }));
const patients = [{ id: '1', full_name: 'Diana Laura', email: 'diana@example.test' }, { id: '2', full_name: 'María Guadalupe' }];
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listPatients).mockImplementation(async filters => ({ rows: patients.filter(p => p.full_name.includes(filters?.search ?? '')) as Awaited<ReturnType<typeof listPatients>>['rows'], total: 2 }));
});
function Form() {
  const [value, setValue] = useState<PatientOption | null>(null);
  return <><PatientCombobox value={value} onChange={setValue}/><button disabled={!value}>Continuar</button></>;
}
it('filters names in one field, selects with the keyboard and clears the old patient when edited', async () => {
  render(<Form/>);
  const input = screen.getByRole('combobox', { name: 'Paciente' });
  fireEvent.change(input, { target: { value: 'Diana' } });
  await screen.findByRole('option', { name: /Diana Laura/ });
  expect(screen.queryByRole('option', { name: 'María Guadalupe' })).not.toBeInTheDocument();
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(input).toHaveValue('Diana Laura');
  expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled();
  fireEvent.change(input, { target: { value: 'María' } });
  expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  fireEvent.click(await screen.findByRole('option', { name: 'María Guadalupe' }));
  expect(input).toHaveValue('María Guadalupe');
});
it('opens the dropdown without typing, handles ArrowUp and closes with Escape without selecting', async () => {
  render(<Form/>);
  const input = screen.getByRole('combobox');
  fireEvent.focus(input);
  await screen.findByRole('option', { name: 'María Guadalupe' });
  fireEvent.keyDown(input, { key: 'ArrowUp' });
  expect(input).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'María Guadalupe' }).id);
  fireEvent.keyDown(input, { key: 'Escape' });
  expect(input).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getByRole('button')).toBeDisabled();
});
it('ignores a stale response so the displayed names always match the current search', async () => {
  let resolve!: (data: Awaited<ReturnType<typeof listPatients>>) => void;
  vi.mocked(listPatients).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  render(<Form/>);
  const input = screen.getByRole('combobox');
  fireEvent.focus(input);
  await waitFor(() => expect(listPatients).toHaveBeenCalledOnce());
  fireEvent.change(input, { target: { value: 'María' } });
  await screen.findByRole('option', { name: 'María Guadalupe' });
  resolve({ rows: patients as Awaited<ReturnType<typeof listPatients>>['rows'], total: 2 });
  await waitFor(() => expect(screen.queryByRole('option', { name: /Diana/ })).not.toBeInTheDocument());
});
