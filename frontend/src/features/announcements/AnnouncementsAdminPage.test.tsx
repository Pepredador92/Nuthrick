import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { AnnouncementsAdminPage } from './AnnouncementsAdminPage';
import type { Announcement } from './model';

const api = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn(), upload: vi.fn(), remove: vi.fn(), status: vi.fn(), delete: vi.fn(), media: vi.fn() }));
vi.mock('./api', () => ({ fetchAdminAnnouncements: api.list, saveAnnouncement: api.save, uploadAnnouncementMedia: api.upload, removeAnnouncementMedia: api.remove, setAnnouncementStatus: api.status, deleteAnnouncement: api.delete, announcementMediaUrl: api.media }));
const draft: Announcement = { id: 'a', title: 'Novedad', body: '', media_path: '', media_mime: '', media_alt: '', cta_label: '', cta_url: '', status: 'draft', frequency: 'once', starts_at: null, ends_at: null, priority: 0, revision: 1, created_at: '2026-10-18T12:00:00Z', updated_at: '2026-10-18T12:00:00Z' };
beforeEach(() => {
  vi.clearAllMocks(); api.list.mockResolvedValue([]); api.save.mockResolvedValue([]); api.remove.mockResolvedValue(undefined); api.media.mockResolvedValue(''); api.status.mockResolvedValue([]);
  api.upload.mockResolvedValue({ media_path: 'new/image.png', media_mime: 'image/png' });
  URL.createObjectURL = vi.fn(() => 'blob:local-image'); URL.revokeObjectURL = vi.fn();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
const mount = () => render(<MemoryRouter><AnnouncementsAdminPage /></MemoryRouter>);
async function create() {
  mount(); await screen.findByText('Tu próximo aviso tiene su espacio');
  fireEvent.click(screen.getByRole('button', { name: 'Crear mi primer anuncio' }));
  fireEvent.change(screen.getByLabelText('Título del anuncio'), { target: { value: 'Nuevo evento' } });
}
it('saves a draft without media but requires media to publish', async () => {
  await create();
  fireEvent.click(screen.getByRole('button', { name: 'Publicar anuncio' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Agrega una imagen o un video');
  expect(api.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
  await waitFor(() => expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ title: 'Nuevo evento', status: 'draft', media_path: '' }), 0));
  expect(api.upload).not.toHaveBeenCalled();
});
it('uploads before publishing and removes an unused upload if saving fails', async () => {
  await create(); api.save.mockRejectedValueOnce(new Error('El anuncio cambió en otra sesión.'));
  fireEvent.change(screen.getByLabelText('Imagen o video'), { target: { files: [new File(['png'], 'aviso.png', { type: 'image/png' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Publicar anuncio' }));
  await waitFor(() => expect(api.remove).toHaveBeenCalledWith('new/image.png'));
  expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'published', media_path: 'new/image.png' }), 0);
  expect(screen.getByRole('alert')).toHaveTextContent('El anuncio cambió');
  expect(screen.getByLabelText('Título del anuncio')).toHaveValue('Nuevo evento');
});
it('validates CTA destinations and date order without uploading', async () => {
  await create();
  fireEvent.change(screen.getByLabelText(/Texto del botón/), { target: { value: 'Ver más' } });
  fireEvent.change(screen.getByLabelText('Enlace del botón'), { target: { value: 'javascript:alert(1)' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('enlace HTTPS');
  fireEvent.change(screen.getByLabelText('Enlace del botón'), { target: { value: '/app/academy' } });
  fireEvent.change(screen.getByLabelText(/Inicio/), { target: { value: '2026-11-02T12:00' } });
  fireEvent.change(screen.getByLabelText(/Fin/), { target: { value: '2026-11-01T12:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('posterior');
  expect(api.save).not.toHaveBeenCalled(); expect(api.upload).not.toHaveBeenCalled();
});
it('previews without publishing or following the announcement link', async () => {
  await create();
  fireEvent.click(screen.getByRole('button', { name: 'Abrir como lo verá el usuario' }));
  expect(await screen.findByRole('dialog')).toHaveTextContent('Nuevo evento');
  expect(api.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar anuncio' }));
  expect(screen.getByLabelText('Título del anuncio')).toHaveValue('Nuevo evento');
});
it('preserves the revision when editing and exposes pause for a published announcement', async () => {
  api.list.mockResolvedValue([{ ...draft, status: 'published', media_path: 'a/image.png', media_mime: 'image/png' }]);
  mount(); await screen.findByText('Novedad');
  fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
  fireEvent.change(screen.getByLabelText('Título del anuncio'), { target: { value: 'Novedad actualizada' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ id: 'a', status: 'published' }), 1));
});
