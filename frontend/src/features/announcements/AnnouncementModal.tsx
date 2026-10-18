import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, ImageOff, Megaphone, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { validAnnouncementUrl, type AnnouncementContent } from './model';
import './announcements.css';

export function AnnouncementMedia({ item, url, placeholder = false }: { item: Pick<AnnouncementContent, 'title' | 'media_mime' | 'media_alt'>; url: string; placeholder?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url || failedUrl === url) return <div className="announcement-media-fallback"><ImageOff size={28} /><span>{!url && placeholder ? 'Tu imagen o video aparecerá aquí' : 'El archivo no está disponible. Puedes consultar el aviso a continuación.'}</span></div>;
  return item.media_mime.startsWith('video/')
    ? <video key={url} src={url} controls muted playsInline preload="metadata" aria-label={item.media_alt || item.title} onError={() => setFailedUrl(url)} />
    : <img src={url} alt={item.media_alt || item.title} onError={() => setFailedUrl(url)} />;
}

export function AnnouncementModal({ item, mediaUrl, onClose, onAction, onShown, preview = false, position }: {
  item: AnnouncementContent; mediaUrl: string; onClose: () => void; onAction?: () => void; onShown?: () => void;
  preview?: boolean; position?: { current: number; total: number };
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const shown = useRef(onShown);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = dialogRef.current!;
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    closeRef.current?.focus();
    document.body.style.overflow = 'hidden';
    shown.current?.();
    return () => {
      dialog.querySelector('video')?.pause();
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  const showCta = item.cta_label && validAnnouncementUrl(item.cta_url);
  const buttonContent = <>{item.cta_label}<ArrowUpRight size={17} /></>;
  return <dialog ref={dialogRef} data-announcement-dialog className="announcement-modal" aria-labelledby={titleId} aria-describedby={item.body ? descriptionId : undefined}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], video[controls], [tabindex="0"]')];
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
    <div className="announcement-modal-content">
      <header className="announcement-modal-top"><span><Megaphone size={15} />{preview ? 'Vista previa · así lo verá el usuario' : 'Novedades de Nuthrick'}</span><button ref={closeRef} type="button" onClick={onClose} className="announcement-close" aria-label="Cerrar anuncio"><X size={21} /></button></header>
      <div className="announcement-media"><AnnouncementMedia item={item} url={mediaUrl} placeholder={preview} /></div>
      <div className="announcement-copy"><h2 id={titleId}>{item.title || 'Título de tu anuncio'}</h2>{item.body && <p id={descriptionId}>{item.body}</p>}
        <footer><span className="announcement-pagination">{position && position.total > 1 ? `${position.current} de ${position.total} anuncios` : 'Nuthrick · Tu espacio profesional'}</span><div className="announcement-actions">
          <button type="button" className="nuth-button-secondary" onClick={onClose}>{position && position.current < position.total ? 'Siguiente anuncio' : 'Cerrar'}</button>
          {showCta && (preview ? <button type="button" className="nuth-button" disabled>{buttonContent}</button> : item.cta_url.startsWith('/app') ? <Link className="nuth-button" to={item.cta_url} onClick={onAction ?? onClose}>{buttonContent}</Link> : <a className="nuth-button" href={item.cta_url} target="_blank" rel="noopener noreferrer" onClick={onAction ?? onClose}>{buttonContent}</a>)}
        </div></footer>
      </div>
    </div>
  </dialog>;
}
