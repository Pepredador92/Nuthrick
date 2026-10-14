import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import type { TrainingVideo } from './model';
import { youtubeEmbedUrl } from './model';
import './training.css';

export function VideoModal({ video, onClose }: { video: Pick<TrainingVideo, 'title' | 'description' | 'youtube_video_id'>; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = dialogRef.current!;
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    closeRef.current?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  return <dialog ref={dialogRef} className="academy-modal" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="academy-modal-content">
      <header className="academy-modal-header">
        <div><p className="academy-eyebrow">Capacitación Nuthrick</p><h2 id={titleId}>{video.title}</h2></div>
        <button ref={closeRef} type="button" className="academy-icon-button" aria-label="Cerrar video" onClick={onClose}><X size={22} /></button>
      </header>
      <div className="academy-player">
        <iframe title={`Video: ${video.title}`} src={youtubeEmbedUrl(video.youtube_video_id)}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin" />
      </div>
      <div className="academy-modal-footer">
        {video.description && <p>{video.description}</p>}
        <small>Si la reproducción no comienza, pulsa el botón de reproducir del video.</small>
      </div>
    </div>
  </dialog>;
}
