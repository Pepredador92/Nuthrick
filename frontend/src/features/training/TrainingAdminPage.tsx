import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil, Play, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { deleteTrainingVideo, fetchTrainingCatalog, reorderTrainingVideos, saveTrainingVideo } from './api';
import type { TrainingCatalog, TrainingVideo } from './model';
import { parseYoutubeVideoId, trainingThumbnail, youtubeVideoUrl } from './model';
import { VideoModal } from './VideoModal';
import './training.css';

type VideoForm = { id?: string; title: string; description: string; url: string; published: boolean };
const emptyForm = (): VideoForm => ({ title: '', description: '', url: '', published: false });

export function TrainingAdminPage() {
  const [catalog, setCatalog] = useState<TrainingCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState<VideoForm>(emptyForm);
  const [preview, setPreview] = useState<Pick<TrainingVideo, 'title' | 'description' | 'youtube_video_id'> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const titleRef = useRef<HTMLInputElement>(null);
  const parsedId = parseYoutubeVideoId(form.url);

  useEffect(() => {
    let active = true;
    fetchTrainingCatalog().then(data => { if (active) { setCatalog(data); setError(''); } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'No pudimos cargar la capacitación.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);

  const mutate = async (operation: () => Promise<TrainingCatalog>, message: string) => {
    setBusy(true); setError(''); setNotice('');
    try { setCatalog(await operation()); setNotice(message); return true; }
    catch (e) { setError(e instanceof Error ? e.message : 'No pudimos guardar el cambio.'); return false; }
    finally { setBusy(false); }
  };
  const refresh = () => { setLoading(true); setAttempt(value => value + 1); };
  const edit = (video: TrainingVideo) => {
    setForm({ id: video.id, title: video.title, description: video.description, url: youtubeVideoUrl(video.youtube_video_id), published: video.published });
    setNotice(''); setError(''); titleRef.current?.focus();
  };
  const move = (index: number, direction: -1 | 1) => {
    if (!catalog) return;
    const ids = catalog.videos.map(video => video.id);
    [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
    void mutate(() => reorderTrainingVideos(ids, catalog.revision), 'Orden actualizado en Capacitación Nuthrick.');
  };
  const toggle = async (video: TrainingVideo) => {
    if (!catalog) return;
    const saved = await mutate(() => saveTrainingVideo({ id: video.id, title: video.title, description: video.description, youtube_video_id: video.youtube_video_id, published: !video.published }, catalog.revision), video.published ? 'Video oculto para los profesionales.' : 'Video publicado en Capacitación Nuthrick.');
    if (saved && form.id === video.id) setForm(current => ({ ...current, published: !video.published }));
  };
  const remove = async (video: TrainingVideo) => {
    if (!catalog || !window.confirm(`¿Eliminar «${video.title}» de la capacitación? El video seguirá en YouTube.`)) return;
    if (await mutate(() => deleteTrainingVideo(video.id, catalog.revision), 'Video eliminado de la capacitación.') && form.id === video.id) setForm(emptyForm());
  };

  return <div className="training-admin">
    <header className="admin-heading"><div><p className="admin-eyebrow">Capacitación Nuthrick</p><h1>Capacitación</h1><p className="admin-description">Agrega tutoriales y organiza el orden en que los nutriólogos los verán. Puedes revisar cada video antes de publicarlo.</p></div></header>
    {error && <div className="training-feedback" role="alert"><p>{error}</p><button type="button" className="admin-button secondary" disabled={loading || busy} onClick={refresh}><RefreshCw size={15} />Actualizar catálogo</button></div>}
    {notice && <p className="training-feedback" role="status">{notice}</p>}
    <div className="training-workspace">
      <section className="admin-card training-editor">
        <h2>{form.id ? 'Editar video' : 'Agregar video'}</h2>
        <form onSubmit={async event => {
          event.preventDefault();
          if (!catalog || !parsedId) { setError('Introduce un enlace válido a un video de YouTube.'); return; }
          if (await mutate(() => saveTrainingVideo({ ...(form.id ? { id: form.id } : {}), title: form.title.trim(), description: form.description.trim(), youtube_video_id: parsedId, published: form.published }, catalog.revision), 'Video guardado.')) setForm(emptyForm());
        }}>
          <fieldset disabled={loading || busy || !catalog}>
            <label htmlFor="training-title">Título</label>
            <input ref={titleRef} id="training-title" className="nuth-input" required maxLength={160} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="Por ejemplo: Crea tu primera consulta" />
            <label htmlFor="training-url">Enlace de YouTube</label>
            <input id="training-url" className="nuth-input" required maxLength={2048} value={form.url} onChange={event => setForm({ ...form, url: event.target.value })} placeholder="https://www.youtube.com/watch?v=…" aria-describedby="training-url-help" />
            <p id="training-url-help" className="training-help">Pega el enlace a un video individual. Una playlist por sí sola no identifica el video.</p>
            <label htmlFor="training-description">Descripción breve</label>
            <textarea id="training-description" className="nuth-input" rows={4} maxLength={1000} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="¿Qué aprenderá el nutriólogo con este video?" />
            <label className="training-publish"><input type="checkbox" checked={form.published} onChange={event => setForm({ ...form, published: event.target.checked })} />Visible en Capacitación Nuthrick</label>
            <p className="training-help">El video debe permitir su reproducción en otros sitios desde la configuración de YouTube.</p>
            <div className="training-form-actions">
              <button type="submit" className="admin-button">{busy ? 'Guardando…' : form.id ? 'Guardar cambios' : 'Agregar video'}</button>
              <button type="button" className="admin-button secondary" disabled={!parsedId} onClick={() => { if (parsedId) setPreview({ title: form.title.trim() || 'Vista previa del video', description: form.description, youtube_video_id: parsedId }); }}><Play size={15} />Vista previa</button>
              {form.id && <button type="button" className="admin-button secondary" onClick={() => setForm(emptyForm())}>Cancelar edición</button>}
            </div>
          </fieldset>
        </form>
      </section>
      <section className="admin-card training-list">
        <div className="training-list-heading"><div><h2>Videos de capacitación</h2>{catalog && <p>{catalog.videos.filter(video => video.published).length} publicados · {catalog.videos.length} en total</p>}</div>
          {form.id && <button type="button" className="admin-button secondary" disabled={busy} onClick={() => { setForm(emptyForm()); titleRef.current?.focus(); }}><Plus size={15} />Nuevo video</button>}
        </div>
        {loading ? <p role="status">Cargando catálogo…</p> : !catalog ? <p>Actualiza el catálogo para continuar.</p> : catalog.videos.length === 0 ? <p>Agrega tu primer video usando el formulario.</p> : <ol className="training-rows">{catalog.videos.map((video, index) => <li key={video.id} className={form.id === video.id ? 'is-editing' : ''}>
          <div className="training-order"><span>{String(index + 1).padStart(2, '0')}</span>
            <button type="button" className="academy-icon-button" disabled={busy || loading || index === 0} aria-label={`Subir ${video.title}`} onClick={() => move(index, -1)}><ArrowUp size={16} /></button>
            <button type="button" className="academy-icon-button" disabled={busy || loading || index === catalog.videos.length - 1} aria-label={`Bajar ${video.title}`} onClick={() => move(index, 1)}><ArrowDown size={16} /></button>
          </div>
          <div className="training-row-content"><div className="training-row-summary"><img src={trainingThumbnail(video.youtube_video_id)} alt="" width="120" height="68" loading="lazy" /><div><h3>{video.title}</h3><span className={`training-badge${video.published ? ' is-published' : ''}`}>{video.published ? 'Publicado' : 'Oculto'}</span></div></div>
            {video.description && <p>{video.description}</p>}
            <div className="training-row-actions">
              <button type="button" disabled={busy || loading} onClick={() => setPreview(video)}><Play size={14} />Ver video</button>
              <button type="button" disabled={busy || loading} onClick={() => edit(video)}><Pencil size={14} />Editar</button>
              <button type="button" disabled={busy || loading} onClick={() => void toggle(video)}>{video.published ? <EyeOff size={14} /> : <Eye size={14} />}{video.published ? 'Ocultar' : 'Publicar'}</button>
              <button type="button" className="training-delete" disabled={busy || loading} onClick={() => void remove(video)}><Trash2 size={14} />Eliminar</button>
            </div>
          </div>
        </li>)}</ol>}
      </section>
    </div>
    {preview && <VideoModal video={preview} onClose={() => setPreview(null)} />}
  </div>;
}
