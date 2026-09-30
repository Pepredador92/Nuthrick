import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EntryDigest, upcomingReminders } from './EntryDigest';
import type { Appointment } from '@/src/services/appointments';
const mocks = vi.hoisted(() => ({ list: vi.fn(), markRead: vi.fn(), navigate: vi.fn(), user: 'professional-a' }));
vi.mock('@/src/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: mocks.user } }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('@/src/services/appointments', async importOriginal => ({ ...await importOriginal<object>(), listAppointments: mocks.list }));
vi.mock('@/src/features/notifications/useNotifications', () => ({ useNotifications: () => ({ items: [{ id: 'notice', title: 'Nueva solicitud', type: 'appointment_request', read_at: null }], loading: false, markRead: mocks.markRead }) }));
vi.mock('@/src/components/agenda/AppointmentCard', () => ({ AppointmentCard: ({ appointment }: { appointment: Appointment }) => <p>{appointment.contact_name}</p> }));
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); mocks.user = 'professional-a'; mocks.list.mockResolvedValue({ appointments: [] });
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
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
