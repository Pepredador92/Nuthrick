import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AcademyPage } from './AcademyPage';
import { TrainingAdminPage } from './TrainingAdminPage';
import { fetchTrainingCatalog, fetchTrainingVideos, reorderTrainingVideos, saveTrainingVideo, deleteTrainingVideo } from './api';
import type { TrainingCatalog, TrainingVideo } from './model';

vi.mock('./api', () => ({ fetchTrainingCatalog: vi.fn(), fetchTrainingVideos: vi.fn(), reorderTrainingVideos: vi.fn(), saveTrainingVideo: vi.fn(), deleteTrainingVideo: vi.fn() }));
const videos: TrainingVideo[] = [
  { id: 'first', title: 'Conoce tu espacio', description: 'Encuentra tus herramientas.', youtube_video_id: 'Nw6ZwFHWoqI', display_order: 1, published: true, updated_at: '2026-10-14' },
  { id: 'second', title: 'Completa tu perfil', description: 'Presenta tu práctica.', youtube_video_id: 'ZcKpeXfjSdc', display_order: 2, published: false, updated_at: '2026-10-14' },
];
const catalog: TrainingCatalog = { revision: 5, videos };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchTrainingVideos).mockResolvedValue(videos.filter(video => video.published));
  vi.mocked(fetchTrainingCatalog).mockResolvedValue(structuredClone(catalog));
  // jsdom does not implement native dialog interaction; browser QA covers it.
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});

describe('Capacitación Nuthrick', () => {
  it('loads YouTube only after selecting a video and stops it on close', async () => {
    const { container } = render(<AcademyPage />);
    const play = await screen.findByRole('button', { name: 'Ver video: Conoce tu espacio' });
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.queryByText('Completa tu perfil')).not.toBeInTheDocument();
    play.focus();
    fireEvent.click(play);
    const dialog = screen.getByRole('dialog');
    const iframe = within(dialog).getByTitle('Video: Conoce tu espacio');
    expect(iframe).toHaveAttribute('src', expect.stringContaining('youtube-nocookie.com/embed/Nw6ZwFHWoqI'));
    expect(iframe).toHaveAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    expect(within(dialog).getByRole('button', { name: 'Cerrar video' })).toHaveFocus();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar video' }));
    expect(container.querySelector('iframe')).toBeNull();
    expect(play).toHaveFocus();
    expect(document.body.style.overflow).toBe('');
  });

  it('preserves server order and can retry a failed request', async () => {
    vi.mocked(fetchTrainingVideos).mockRejectedValueOnce(new Error('Fallo temporal')).mockResolvedValueOnce([...videos].reverse());
    render(<AcademyPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Fallo temporal');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByRole('button', { name: 'Ver video: Completa tu perfil' });
    expect(screen.getAllByRole('button', { name: /Ver video:/ }).map(button => button.getAttribute('aria-label'))).toEqual(['Ver video: Completa tu perfil', 'Ver video: Conoce tu espacio']);
  });

  it('handles an empty catalog', async () => {
    vi.mocked(fetchTrainingVideos).mockResolvedValue([]);
    render(<AcademyPage />);
    expect(await screen.findByText('Pronto habrá nuevos tutoriales')).toBeInTheDocument();
  });
});

describe('training administration', () => {
  it('saves a normalized video ID and explicit publication status', async () => {
    vi.mocked(saveTrainingVideo).mockResolvedValue({ ...catalog, revision: 6 });
    render(<TrainingAdminPage />);
    await screen.findByText('1 publicados · 2 en total');
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: ' Nueva consulta ' } });
    fireEvent.change(screen.getByLabelText('Enlace de YouTube'), { target: { value: 'https://youtu.be/PuIO8UgjOrM?si=example' } });
    fireEvent.change(screen.getByLabelText('Descripción breve'), { target: { value: ' Aprende a consultar. ' } });
    fireEvent.click(screen.getByLabelText('Visible en Capacitación Nuthrick'));
    fireEvent.click(screen.getByRole('button', { name: 'Agregar video' }));
    await waitFor(() => expect(saveTrainingVideo).toHaveBeenCalledWith({ title: 'Nueva consulta', description: 'Aprende a consultar.', youtube_video_id: 'PuIO8UgjOrM', published: true }, 5));
    expect(await screen.findByRole('status')).toHaveTextContent('Video guardado.');
  });

  it('rejects a playlist link without sending a mutation', async () => {
    render(<TrainingAdminPage />);
    await screen.findByText('1 publicados · 2 en total');
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Una playlist' } });
    fireEvent.change(screen.getByLabelText('Enlace de YouTube'), { target: { value: 'https://youtube.com/playlist?list=PLBuZvLPXwzIs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar video' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('enlace válido');
    expect(saveTrainingVideo).not.toHaveBeenCalled();
  });

  it('reorders the full catalog, including hidden videos, without publishing them', async () => {
    vi.mocked(reorderTrainingVideos).mockResolvedValue({ revision: 6, videos: [...videos].reverse() });
    render(<TrainingAdminPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Subir Completa tu perfil' }));
    await waitFor(() => expect(reorderTrainingVideos).toHaveBeenCalledWith(['second', 'first'], 5));
    expect(await screen.findByRole('status')).toHaveTextContent('Orden actualizado');
    expect(screen.getAllByRole('heading', { level: 3 }).map(heading => heading.textContent)).toEqual(['Completa tu perfil', 'Conoce tu espacio']);
    expect(screen.getByText('Oculto')).toBeInTheDocument();
  });

  it('keeps typed edits after a stale revision and lets the admin reload the catalog', async () => {
    vi.mocked(saveTrainingVideo).mockRejectedValue(new Error('El catálogo cambió en otra sesión.'));
    render(<TrainingAdminPage />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Editar' }))[0]);
    fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Edición pendiente' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('otra sesión');
    expect(screen.getByLabelText('Título')).toHaveValue('Edición pendiente');
    vi.mocked(fetchTrainingCatalog).mockResolvedValue({ ...catalog, revision: 7 });
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar catálogo' }));
    await waitFor(() => expect(fetchTrainingCatalog).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Título')).toHaveValue('Edición pendiente');
  });

  it('hides a published video and cancels deletion without removing it', async () => {
    vi.mocked(saveTrainingVideo).mockResolvedValue({ revision: 6, videos: videos.map(video => ({ ...video, published: false })) });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<TrainingAdminPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ocultar' }));
    await waitFor(() => expect(saveTrainingVideo).toHaveBeenCalledWith(expect.objectContaining({ id: 'first', published: false }), 5));
    await screen.findByText('0 publicados · 2 en total');
    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[0]);
    expect(confirm).toHaveBeenCalledOnce();
    expect(deleteTrainingVideo).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});
