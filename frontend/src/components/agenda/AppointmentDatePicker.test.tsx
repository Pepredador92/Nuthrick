import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AppointmentDatePicker } from './AppointmentDatePicker';
import { agendaApi } from '@/src/services/agenda';
vi.mock('@/src/services/agenda', () => ({ agendaApi: vi.fn() }));
const slot = { start: '2099-10-01T16:00:00Z', end: '2099-10-01T17:00:00Z' };
const data = { day: '2099-10-01', today: '2099-10-01', lastDay: '2099-11-30', timezone: 'America/Mexico_City', weekdays: [4], slots: [slot], connectionError: false };
const option = { modality: 'online', location_id: null, label: 'En línea' };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(agendaApi).mockResolvedValue(data); });
it('navigates from December into January and selects a date in the next year', async () => {
  const initial = { ...data, day: '2026-12-15', today: '2026-12-15', lastDay: '2027-12-15', weekdays: [1, 2, 3, 4, 5], slots: [] };
  const januarySlot = { start: '2027-01-04T16:00:00Z', end: '2027-01-04T17:00:00Z' };
  vi.mocked(agendaApi).mockResolvedValueOnce(initial)
    .mockResolvedValueOnce({ ...initial, day: '2027-01-04', slots: [januarySlot] });
  const change = vi.fn();
  render(<AppointmentDatePicker option={option} value="" onChange={change}/>);
  fireEvent.click(await screen.findByRole('button', { name: 'Mes siguiente' }));
  fireEvent.click(screen.getByRole('button', { name: '4 de enero de 2027, horario configurado' }));
  fireEvent.click(await screen.findByRole('button', { name: /10:00/ }));
  expect(change).toHaveBeenLastCalledWith(januarySlot.start);
});
it('marks configured days, disables other days and chooses the exact UTC instant', async () => {
  const change = vi.fn(); render(<AppointmentDatePicker option={option} value="" onChange={change}/>);
  const hour = await screen.findByRole('button', { name: /10:00/ });
  expect(screen.getByRole('button', { name: '1 de octubre de 2099, horario configurado' })).toBeEnabled();
  expect(screen.getByRole('button', { name: '2 de octubre de 2099, sin horario' })).toBeDisabled();
  fireEvent.click(hour); expect(change).toHaveBeenCalledWith(slot.start);
  fireEvent.click(screen.getByRole('button', { name: '8 de octubre de 2099, horario configurado' }));
  expect(change).toHaveBeenLastCalledWith('');
  expect(agendaApi).toHaveBeenLastCalledWith('appointment_availability', { day: '2099-10-08', modality: 'online', locationId: null }, true);
});
it('does not offer hours when Google could not be checked, and allows retrying', async () => {
  vi.mocked(agendaApi).mockResolvedValueOnce({ ...data, slots: [], connectionError: true });
  render(<AppointmentDatePicker option={option} value="" onChange={vi.fn()}/>);
  await screen.findByText(/No pudimos comprobar Google/);
  expect(screen.queryByRole('button', { name: /10:00/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar horarios' }));
  await screen.findByRole('button', { name: /10:00/ });
});
