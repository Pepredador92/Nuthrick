import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EntryDigest, upcomingReminders } from './EntryDigest';
import type { Appointment } from '@/src/services/appointments';
import type { ProfessionalNotification } from '@/src/features/notifications/model';
const mocks = vi.hoisted(() => ({ list: vi.fn(), markRead: vi.fn(), navigate: vi.fn(), user: 'professional-a', items: [] as ProfessionalNotification[] }));
vi.mock('@/src/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: mocks.user } }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('@/src/services/appointments', async importOriginal => ({ ...await importOriginal<object>(), listAppointments: mocks.list }));
vi.mock('@/src/features/notifications/useNotifications', () => ({ useNotifications: () => ({ items: mocks.items, loading: false, markRead: mocks.markRead }) }));
vi.mock('@/src/components/agenda/AppointmentCard', () => ({ AppointmentCard: ({ appointment }: { appointment: Appointment }) => <p>{appointment.contact_name}</p> }));
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); mocks.user = 'professional-a'; mocks.list.mockResolvedValue({ appointments: [] });
  mocks.items = [{ id: 'notice', title: 'Nueva solicitud', type: 'appointment_request', read_at: null } as ProfessionalNotification];
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
const message = (id: string, read_at: string | null = null): ProfessionalNotification => ({
  id, professional_id: 'professional-a', type: 'portal_message', actor_name: 'Paciente de prueba',
  resource_type: 'patient', resource_id: 'patient-1', title: 'Nuevo mensaje de Paciente de prueba',
  metadata: {}, created_at: new Date().toISOString(), read_at,
});
it('opens new messages after dismissing the agenda and does not repeat a dismissed message', async () => {
  const view = render(<EntryDigest />);
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByText('Revisar después'));
  mocks.items = [message('message-1')]; view.rerender(<EntryDigest />);
  expect(await screen.findByRole('dialog')).toHaveTextContent('Recibiste un mensaje nuevo');
  expect(screen.getByRole('dialog')).toHaveTextContent('Paciente de prueba');
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
  expect(mocks.markRead).not.toHaveBeenCalled();
  view.rerender(<EntryDigest />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  mocks.items = [message('message-1'), message('message-2')]; view.rerender(<EntryDigest />);
  expect(await screen.findByRole('dialog')).toHaveTextContent('Recibiste un mensaje nuevo');
  expect(screen.getAllByRole('button', { name: 'Abrir conversación' })).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Abrir conversación' }));
  expect(mocks.markRead).toHaveBeenCalledWith('message-2');
  expect(mocks.navigate).toHaveBeenCalledWith('/app/patients/patient-1/portal?tab=chat');
});
it('persists dismissed message IDs across remounts and keeps accounts isolated', async () => {
  mocks.items = [message('message-1')];
  const view = render(<EntryDigest />);
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
  view.unmount();
  const next = render(<EntryDigest />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  mocks.user = 'professional-b'; next.rerender(<EntryDigest />);
  expect(await screen.findByRole('dialog')).toHaveTextContent('Recibiste un mensaje nuevo');
});
it('ignores read messages and can alert without waiting for the agenda request', async () => {
  mocks.list.mockReturnValue(new Promise(() => {}));
  mocks.items = [message('read', new Date().toISOString())];
  const view = render(<EntryDigest />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  mocks.items.push(message('unread')); view.rerender(<EntryDigest />);
  expect(await screen.findByRole('dialog')).toHaveTextContent('Recibiste un mensaje nuevo');
});
afterEach(cleanup);
it('shows only future, active appointments within 48 hours, in chronological order', () => {
  const now = Date.now();
  const item = (id: string, hours: number, status = 'confirmed') => ({ id, starts_at: new Date(now + hours * 3600000).toISOString(), status } as Appointment);
  expect(upcomingReminders([item('late', 48), item('early', 1), item('expired', -1), item('far', 49), item('cancelled', 1, 'cancelled')], now).map(a => a.id)).toEqual(['early', 'late']);
});
it('snoozes this entry without marking notices read and does not reopen on navigation', async () => {
  const view = render(<EntryDigest />);
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByText('Revisar después'));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(mocks.markRead).not.toHaveBeenCalled();
  view.unmount(); render(<EntryDigest />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('opens the selected notice and isolates dismissal between accounts', async () => {
  const view = render(<EntryDigest />);
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByText('Nueva solicitud'));
  expect(mocks.markRead).toHaveBeenCalledWith('notice');
  expect(mocks.navigate).toHaveBeenCalledWith('/app/agenda');
  mocks.user = 'professional-b'; view.rerender(<EntryDigest />);
  await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
});
