import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { EntryAnnouncements } from './EntryAnnouncements';
import type { Announcement } from './model';
import type { ProfessionalNotification } from '@/src/features/notifications/model';

const mocks = vi.hoisted(() => ({
  user: 'professional-a', notifications: [] as ProfessionalNotification[], appointments: vi.fn(), list: vi.fn(), media: vi.fn(), record: vi.fn(),
}));
vi.mock('@/src/features/auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: mocks.user } }) }));
vi.mock('@/src/features/notifications/useNotifications', () => ({ useNotifications: () => ({ items: mocks.notifications, loading: false, markRead: vi.fn() }) }));
vi.mock('@/src/services/appointments', async original => ({ ...await original<object>(), listAppointments: mocks.appointments }));
vi.mock('./api', () => ({ fetchEntryAnnouncements: mocks.list, announcementMediaUrl: mocks.media, recordAnnouncement: mocks.record }));
const item = (id = 'a', extra: Partial<Announcement> = {}): Announcement => ({
  id, title: `Anuncio ${id}`, body: 'Tenemos una novedad para ti.', media_path: `${id}/image.png`, media_mime: 'image/png', media_alt: 'Novedad de Nuthrick', cta_label: '', cta_url: '',
  status: 'published', frequency: 'once', starts_at: null, ends_at: null, priority: 0, revision: 1, created_at: '2026-10-18T12:00:00Z', updated_at: '2026-10-18T12:00:00Z', ...extra,
});
const mount = () => render(<MemoryRouter><EntryAnnouncements /></MemoryRouter>);
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); mocks.user = 'professional-a'; mocks.notifications = [];
  mocks.appointments.mockResolvedValue({ appointments: [] }); mocks.list.mockResolvedValue([item()]); mocks.media.mockResolvedValue('https://example.test/image.png'); mocks.record.mockResolvedValue(true);
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
  HTMLMediaElement.prototype.pause = vi.fn();
});

it('waits for reminders, then opens the announcement and records only actual display and dismissal', async () => {
  mocks.notifications = [{ id: 'notice', title: 'Solicitud de cita', type: 'appointment_request', read_at: null } as ProfessionalNotification];
  mount();
  expect(await screen.findByRole('dialog')).toHaveTextContent('Tu agenda necesita una mirada');
  expect(mocks.list).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Revisar después' }));
  expect(await screen.findByRole('heading', { name: 'Anuncio a' })).toBeInTheDocument();
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  await waitFor(() => expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), 'seen'));
  expect(mocks.record).not.toHaveBeenCalledWith(expect.anything(), 'dismiss');
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar anuncio' }));
  expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), 'dismiss');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('shows announcements one at a time and supports Escape, video controls and safe CTA links', async () => {
  mocks.list.mockResolvedValue([item(), item('b', { media_mime: 'video/mp4', cta_label: 'Ver capacitación', cta_url: '/app/academy' })]);
  mount();
  await screen.findByRole('heading', { name: 'Anuncio a' });
  fireEvent.click(screen.getByRole('button', { name: 'Siguiente anuncio' }));
  await screen.findByRole('heading', { name: 'Anuncio b' });
  const video = screen.getByLabelText('Novedad de Nuthrick') as HTMLVideoElement;
  expect(video.controls).toBe(true); expect(video.autoplay).toBe(false); expect(video.muted).toBe(true);
  expect(screen.getByRole('link', { name: 'Ver capacitación' })).toHaveAttribute('href', '/app/academy');
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(video.pause).toHaveBeenCalled();
});
it('yields to consent dialogs and resumes the same announcement without dismissing or recounting it', async () => {
  const view = mount();
  await screen.findByRole('heading', { name: 'Anuncio a' });
  const blocker = document.createElement('section'); blocker.setAttribute('role', 'dialog'); blocker.setAttribute('aria-modal', 'true');
  await act(async () => { document.body.appendChild(blocker); });
  expect(screen.queryByRole('heading', { name: 'Anuncio a' })).not.toBeInTheDocument();
  expect(mocks.record).not.toHaveBeenCalledWith(expect.anything(), 'dismiss');
  await act(async () => { blocker.remove(); });
  await screen.findByRole('heading', { name: 'Anuncio a' });
  expect(mocks.record).toHaveBeenCalledTimes(1);
  view.unmount();
});
it('ignores a delayed response from a previous account and remains usable when media fails', async () => {
  let resolveOld: (items: Announcement[]) => void = () => {};
  mocks.list.mockImplementationOnce(() => new Promise<Announcement[]>(resolve => { resolveOld = resolve; }));
  const view = mount();
  await waitFor(() => expect(mocks.list).toHaveBeenCalledTimes(1));
  mocks.user = 'professional-b'; mocks.list.mockResolvedValue([item('b')]); mocks.media.mockRejectedValue(new Error('offline'));
  view.rerender(<MemoryRouter><EntryAnnouncements /></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Anuncio b' });
  await act(async () => resolveOld([item('old-account')]));
  expect(screen.queryByRole('heading', { name: 'Anuncio old-account' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar anuncio' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('skips an expired or concurrently claimed announcement and proceeds with the next one', async () => {
  mocks.list.mockResolvedValue([item('expired', { ends_at: '2000-01-01T00:00:00Z' }), item('claimed'), item('next')]);
  mocks.record.mockImplementation(async (value: Announcement) => value.id !== 'claimed');
  mount();
  await screen.findByRole('heading', { name: 'Anuncio next' });
  expect(mocks.record).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'expired' }), expect.anything());
});
it('lets the user follow the action without opening another announcement over the destination', async () => {
  mocks.list.mockResolvedValue([item('a', { cta_label: 'Abrir capacitación', cta_url: '/app/academy' }), item('b')]);
  mount();
  fireEvent.click(await screen.findByRole('link', { name: 'Abrir capacitación' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), 'dismiss');
  expect(mocks.record).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }), expect.anything());
});
