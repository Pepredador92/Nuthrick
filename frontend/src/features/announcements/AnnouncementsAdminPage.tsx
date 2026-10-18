import { useEffect, useRef, useState } from 'react';
import { CalendarClock, Eye, ImagePlus, Megaphone, Pencil, Play, Plus, RefreshCw, Trash2, Upload, X } from 'lucide-react';
import { announcementMediaUrl, deleteAnnouncement, fetchAdminAnnouncements, removeAnnouncementMedia, saveAnnouncement, setAnnouncementStatus, uploadAnnouncementMedia } from './api';
import { AnnouncementMedia, AnnouncementModal } from './AnnouncementModal';
import { announcementState, frequencyHelp, frequencyLabels, localDateTime, validAnnouncementUrl, validateMediaFile, type Announcement, type AnnouncementInput } from './model';
import './announcements.css';

type Editor = AnnouncementInput & { revision: number };
const emptyEditor = (): Editor => ({ id: crypto.randomUUID(), title: '', body: '', media_path: '', media_mime: '', media_alt: '', cta_label: '', cta_url: '', status: 'draft', frequency: 'once', starts_at: null, ends_at: null, priority: 0, revision: 0 });
const message = (error: unknown) => error instanceof Error ? error.message : 'No pudimos guardar el anuncio. Intenta de nuevo.';
const dateLabel = (value: string | null, fallback: string) => value ? new Date(value).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : fallback;

function useMediaUrl(path: string) {
  const [result, setResult] = useState({ path: '', url: '' });
  useEffect(() => {
    if (!path) return;
    let active = true;
    void announcementMediaUrl(path).then(url => { if (active) setResult({ path, url }); }, () => { if (active) setResult({ path, url: '' }); });
    return () => { active = false; };
  }, [path]);
  return result.path === path ? result.url : '';
}

function AnnouncementThumbnail({ item }: { item: Announcement }) {
  const url = useMediaUrl(item.media_path);
  return <div className="announcement-thumb">{url && item.media_mime.startsWith('image/') ? <img src={url} alt="" loading="lazy" /> : item.media_mime.startsWith('video/') ? <Play size={24} /> : <ImagePlus size={24} />}</div>;
}

export function AnnouncementsAdminPage() {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [localUrl, setLocalUrl] = useState('');
  const [preview, setPreview] = useState<{ item: AnnouncementInput; url: string } | null>(null);
  const [now, setNow] = useState(Date.now);
  const titleRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const mutationLock = useRef(false);
  const persistedUrl = useMediaUrl(editor?.media_path ?? '');
  const mediaUrl = file ? localUrl : persistedUrl;

  useEffect(() => {
    let active = true;
    void fetchAdminAnnouncements().then(result => { if (active) { setItems(result); setError(''); } }, e => { if (active) setError(message(e)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => {
    return () => { if (localUrl) URL.revokeObjectURL(localUrl); };
  }, [localUrl]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const change = <K extends keyof Editor>(key: K, value: Editor[K]) => setEditor(current => current ? { ...current, [key]: value } : null);
  const openEditor = (item?: Announcement) => {
    setEditor(item ? { ...item } : emptyEditor()); setFile(null); setError(''); setNotice('');
    requestAnimationFrame(() => { editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); titleRef.current?.focus({ preventScroll: true }); });
  };
  const selectFile = (selected?: File) => {
    if (!selected) return;
    try { validateMediaFile(selected); setLocalUrl(URL.createObjectURL(selected)); setFile(selected); change('media_mime', selected.type); setError(''); }
    catch (e) { setError(message(e)); }
  };
  const refresh = () => { setLoading(true); setAttempt(value => value + 1); };
  const save = async (status: Announcement['status']) => {
    if (!editor || mutationLock.current) return;
    if (!editor.title.trim()) { setError('Escribe un título para el anuncio.'); titleRef.current?.focus(); return; }
    if ((editor.cta_label.trim() || editor.cta_url.trim()) && (!editor.cta_label.trim() || !validAnnouncementUrl(editor.cta_url.trim()))) {
      setError('El botón necesita un texto y un enlace HTTPS o una ruta de Nuthrick, como /app/academy.'); return;
    }
    if (editor.starts_at && editor.ends_at && Date.parse(editor.ends_at) <= Date.parse(editor.starts_at)) { setError('La fecha de fin debe ser posterior a la fecha de inicio.'); return; }
    if (status === 'published' && !file && !editor.media_path) { setError('Agrega una imagen o un video antes de publicar.'); return; }
    mutationLock.current = true; setBusy(true); setError(''); setNotice('');
    let uploaded = '';
    let committed = false;
    try {
      const media = file ? await uploadAnnouncementMedia(editor.id, file) : { media_path: editor.media_path, media_mime: editor.media_mime };
      uploaded = file ? media.media_path : '';
      const result = await saveAnnouncement({ ...editor, ...media, status, title: editor.title.trim(), body: editor.body.trim(), media_alt: editor.media_alt.trim(), cta_label: editor.cta_label.trim(), cta_url: editor.cta_url.trim() }, editor.revision);
      committed = true;
      setItems(result); setEditor(null); setFile(null);
      setNotice(status === 'published' ? editor.starts_at && Date.parse(editor.starts_at) > Date.now() ? 'Anuncio programado. Se mostrará a partir de la fecha elegida.' : 'Anuncio publicado. Los usuarios lo verán al entrar, después de sus recordatorios.' : status === 'paused' ? 'Cambios guardados. El anuncio continúa pausado.' : 'Borrador guardado. Puedes seguir editándolo antes de publicar.');
      if (uploaded && editor.media_path) void removeAnnouncementMedia(editor.media_path);
    } catch (e) {
      setError(message(e));
      if (uploaded && !committed) void removeAnnouncementMedia(uploaded);
    } finally { mutationLock.current = false; setBusy(false); }
  };
  const toggle = async (item: Announcement) => {
    if (mutationLock.current) return;
    mutationLock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const status = item.status === 'published' ? 'paused' : 'published';
      const result = await setAnnouncementStatus(item, status);
      setItems(result);
      if (editor?.id === item.id) setEditor(null);
      setNotice(status === 'paused' ? 'Anuncio pausado.' : 'Anuncio publicado con las fechas configuradas.');
    } catch (e) { setError(message(e)); }
    finally { mutationLock.current = false; setBusy(false); }
  };
  const remove = async (item: Announcement) => {
    if (mutationLock.current || !window.confirm(`¿Eliminar el anuncio «${item.title}»? Dejará de mostrarse a los usuarios.`)) return;
    mutationLock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      setItems(await deleteAnnouncement(item));
      if (editor?.id === item.id) { setEditor(null); setFile(null); }
      setNotice('Anuncio eliminado.'); void removeAnnouncementMedia(item.media_path);
    } catch (e) { setError(message(e)); }
    finally { mutationLock.current = false; setBusy(false); }
  };
  const view = async (item: Announcement) => {
    try { setPreview({ item, url: await announcementMediaUrl(item.media_path) }); }
    catch (e) { setError(message(e)); }
  };
  const counts = { active: 0, scheduled: 0, draft: 0 };
  for (const item of items ?? []) {
    const state = announcementState(item, now);
    if (state === 'Activo') counts.active++;
    if (state === 'Programado') counts.scheduled++;
    if (state === 'Borrador') counts.draft++;
  }

  return <div className="announcements-admin">
    <header className="admin-heading"><div><p className="admin-eyebrow">Comunicación con tus usuarios</p><h1>Anuncios y avisos</h1><p className="admin-description">Comparte novedades con una imagen o un video. Tus usuarios las verán al entrar a Nuthrick, después de sus mensajes y recordatorios.</p></div><button type="button" className="admin-button" disabled={loading || busy || !items} onClick={() => openEditor()}><Plus size={17} />Crear anuncio</button></header>
    <div className="announcement-summary"><div><Megaphone size={20} /><span><strong>{loading ? '—' : counts.active}</strong>Activos</span></div><div><CalendarClock size={20} /><span><strong>{loading ? '—' : counts.scheduled}</strong>Programados</span></div><div><Pencil size={20} /><span><strong>{loading ? '—' : counts.draft}</strong>Borradores</span></div></div>
    {error && <div className="announcement-feedback is-error" role="alert"><p>{error}</p><button type="button" className="admin-button secondary" disabled={loading || busy} onClick={refresh}><RefreshCw size={15} />Actualizar lista</button></div>}
    {notice && <p className="announcement-feedback" role="status">{notice}</p>}
    {editor && <section ref={editorRef} className="admin-card announcement-editor">
      <div className="announcement-section-heading"><div><p className="admin-eyebrow">Para todos los usuarios</p><h2>{editor.revision ? 'Editar anuncio' : 'Dale vida a tu próximo aviso'}</h2></div><button type="button" className="announcement-close" aria-label="Cerrar editor" disabled={busy} onClick={() => { setEditor(null); setFile(null); }}><X size={20} /></button></div>
      <div className="announcement-editor-grid"><form onSubmit={event => { event.preventDefault(); const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null; void save(submitter?.value === 'published' ? 'published' : editor.status); }}>
        <fieldset disabled={loading || busy}>
          <label htmlFor="announcement-title">Título del anuncio</label><input id="announcement-title" ref={titleRef} className="nuth-input" required maxLength={160} value={editor.title} onChange={e => change('title', e.target.value)} placeholder="Una novedad que vale la pena compartir" />
          <label htmlFor="announcement-file">Imagen o video</label><label className="announcement-upload" htmlFor="announcement-file"><Upload size={25} /><strong>{file?.name || (editor.media_path ? 'Cambiar imagen o video' : 'Selecciona tu archivo')}</strong><span>JPG, PNG o WEBP · hasta 5 MB<br />MP4 o WEBM · hasta 50 MB</span><input id="announcement-file" type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={e => { selectFile(e.target.files?.[0]); e.target.value = ''; }} /></label>
          <p className="announcement-help">La imagen se mostrará completa. Para video, recomendamos MP4 con codificación H.264 y texto o subtítulos integrados.</p>
          <label htmlFor="announcement-alt">Descripción de la imagen o el video</label><input id="announcement-alt" className="nuth-input" maxLength={500} value={editor.media_alt} onChange={e => change('media_alt', e.target.value)} placeholder="Describe la información visual para quien no pueda verla" />
          <label htmlFor="announcement-body">Mensaje <span>(opcional)</span></label><textarea id="announcement-body" className="nuth-input" rows={4} maxLength={2000} value={editor.body} onChange={e => change('body', e.target.value)} placeholder="Acompaña tu anuncio con los detalles importantes." />
          <div className="announcement-fields"><div><label htmlFor="announcement-cta">Texto del botón <span>(opcional)</span></label><input id="announcement-cta" className="nuth-input" maxLength={60} value={editor.cta_label} onChange={e => change('cta_label', e.target.value)} placeholder="Conocer más" /></div><div><label htmlFor="announcement-url">Enlace del botón</label><input id="announcement-url" className="nuth-input" maxLength={2048} value={editor.cta_url} onChange={e => change('cta_url', e.target.value)} placeholder="/app/academy o https://…" /></div></div>
          <div className="announcement-form-divider"><CalendarClock size={17} /><h3>Cuándo y cómo se muestra</h3></div>
          <div className="announcement-fields"><div><label htmlFor="announcement-start">Inicio <span>(opcional)</span></label><input id="announcement-start" className="nuth-input" type="datetime-local" value={localDateTime(editor.starts_at)} onChange={e => change('starts_at', e.target.value ? new Date(e.target.value).toISOString() : null)} /></div><div><label htmlFor="announcement-end">Fin <span>(opcional)</span></label><input id="announcement-end" className="nuth-input" type="datetime-local" value={localDateTime(editor.ends_at)} onChange={e => change('ends_at', e.target.value ? new Date(e.target.value).toISOString() : null)} /></div></div>
          <p className="announcement-help">Horario de {Intl.DateTimeFormat().resolvedOptions().timeZone}. Sin fechas, se muestra desde su publicación hasta que lo pauses.</p>
          <label htmlFor="announcement-frequency">Frecuencia por usuario</label><select id="announcement-frequency" className="nuth-input" value={editor.frequency} onChange={e => change('frequency', e.target.value as Editor['frequency'])}>{Object.entries(frequencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><p className="announcement-help">{frequencyHelp[editor.frequency]}</p>
          <label htmlFor="announcement-priority">Prioridad</label><input id="announcement-priority" className="nuth-input" type="number" min={0} max={100} step={1} value={editor.priority} onChange={e => change('priority', Number(e.target.value))} /><p className="announcement-help">De 0 a 100. Si hay varios anuncios, el de mayor prioridad aparece primero. Editar un anuncio conserva quién ya lo vio o cerró; crea uno nuevo para volver a comunicarlo.</p>
          <div className="announcement-form-actions"><button type="submit" className="admin-button secondary" value="save">{busy ? 'Guardando…' : editor.status === 'draft' ? 'Guardar borrador' : 'Guardar cambios'}</button>{editor.status !== 'published' && <button type="submit" className="admin-button" value="published">{busy ? 'Guardando…' : editor.starts_at && Date.parse(editor.starts_at) > now ? 'Programar anuncio' : 'Publicar anuncio'}</button>}</div>
        </fieldset>
      </form><aside className="announcement-preview"><div className="announcement-preview-heading"><span><Eye size={16} />Vista previa</span><small>Imagen completa · video con controles</small></div><div className="announcement-preview-card"><div className="announcement-media"><AnnouncementMedia item={editor} url={mediaUrl} placeholder /></div><div className="announcement-preview-copy"><span>NOVEDADES DE NUTHRICK</span><h3>{editor.title || 'Tu próximo anuncio empieza aquí'}</h3><p>{editor.body || 'Un espacio para compartir novedades, eventos y avisos con tu comunidad.'}</p>{editor.cta_label && <span className="announcement-preview-cta">{editor.cta_label} ↗</span>}</div></div><button type="button" className="admin-button secondary" onClick={() => setPreview({ item: editor, url: mediaUrl })}><Eye size={16} />Abrir como lo verá el usuario</button></aside></div>
    </section>}
    <section className="admin-card announcement-list"><div className="announcement-section-heading"><div><h2>Tus anuncios</h2><p>Todos los usuarios · se muestran de uno en uno</p></div><button type="button" className="announcement-close" aria-label="Actualizar anuncios" disabled={loading || busy} onClick={refresh}><RefreshCw size={18} /></button></div>
      {loading ? <p role="status" className="announcement-empty">Cargando anuncios…</p> : !items ? <p className="announcement-empty">Actualiza la lista para continuar.</p> : !items.length ? <div className="announcement-empty"><span className="announcement-empty-icon"><Megaphone size={30} /></span><h3>Tu próximo aviso tiene su espacio</h3><p>Agrega una imagen o un video y decide cuándo compartirlo.</p><button type="button" className="admin-button" onClick={() => openEditor()}><Plus size={16} />Crear mi primer anuncio</button></div> : <ul className="announcement-rows">{items.map(item => { const state = announcementState(item, now); return <li key={item.id}><AnnouncementThumbnail item={item} /><div className="announcement-row-copy"><div className="announcement-row-title"><h3>{item.title}</h3><span className={`announcement-badge ${state === 'Activo' ? 'is-active' : state === 'Programado' ? 'is-scheduled' : ''}`}>{state}</span></div>{item.body && <p>{item.body}</p>}<small>{frequencyLabels[item.frequency]} · Prioridad {item.priority}</small><small><CalendarClock size={13} />{dateLabel(item.starts_at, 'Desde su publicación')} → {dateLabel(item.ends_at, 'Sin fecha de fin')}</small><div className="announcement-row-actions"><button type="button" disabled={busy} onClick={() => void view(item)}><Eye size={14} />Ver anuncio</button><button type="button" disabled={busy} onClick={() => openEditor(item)}><Pencil size={14} />Editar</button><button type="button" disabled={busy || !item.media_path} onClick={() => void toggle(item)}>{item.status === 'published' ? 'Pausar' : 'Publicar'}</button><button type="button" className="announcement-delete" disabled={busy} onClick={() => void remove(item)}><Trash2 size={14} />Eliminar</button></div></div></li>; })}</ul>}
    </section>
    {preview && <AnnouncementModal item={preview.item} mediaUrl={preview.url} preview onClose={() => setPreview(null)} />}
  </div>;
}
