import { ChevronLeft, ChevronRight, Expand, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import type { PublicProfileContent } from '@/src/types/domain';

type GalleryPhoto = PublicProfileContent['gallery'][number];

function photoLabel(photo: GalleryPhoto, index: number) {
  return photo.alt?.trim() || `Imagen ${index + 1} de la galería`;
}

function GalleryImage({ src, alt, thumbnail = false }: { src?: string; alt: string; thumbnail?: boolean }) {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span className="public-gallery-unavailable">{thumbnail ? 'Imagen no disponible' : 'No pudimos cargar esta imagen.'}</span>
  ) : <img src={src} alt={alt} loading={thumbnail ? 'lazy' : 'eager'} decoding="async" draggable={false} onError={() => setFailed(true)} />;
}

function GalleryViewer({
  images, index, opener, onMove, onClose,
}: {
  images: GalleryPhoto[];
  index: number;
  opener: RefObject<HTMLButtonElement | null>;
  onMove: (direction: number) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const titleId = useId();
  const photo = images[index];
  const canMove = images.length > 1;

  useEffect(() => {
    const element = dialog.current;
    const returnTo = opener.current;
    element?.showModal();
    closeButton.current?.focus({ preventScroll: true });
    return () => {
      element?.close();
      returnTo?.focus({ preventScroll: true });
    };
  }, [opener]);

  return (
    <dialog
      ref={dialog}
      className="public-gallery-dialog"
      aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}
      onKeyDown={event => {
        if (!canMove || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
        event.preventDefault();
        onMove(event.key === 'ArrowRight' ? 1 : -1);
      }}
    >
      <div className="public-gallery-viewer">
        <header>
          <h2 id={titleId}>Galería de servicios</h2>
          <button ref={closeButton} type="button" className="public-gallery-control" aria-label="Cerrar galería" onClick={onClose}>
            <X size={21} aria-hidden="true" />
          </button>
        </header>
        <div
          className="public-gallery-stage"
          onTouchStart={event => {
            const touch = event.touches[0];
            touchStart.current = canMove && event.touches.length === 1 ? { x: touch.clientX, y: touch.clientY } : null;
          }}
          onTouchCancel={() => { touchStart.current = null; }}
          onTouchEnd={event => {
            const start = touchStart.current;
            touchStart.current = null;
            const end = event.changedTouches[0];
            if (!start || !end || event.touches.length) return;
            const dx = end.clientX - start.x;
            const dy = end.clientY - start.y;
            if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy) * 1.25) onMove(dx < 0 ? 1 : -1);
          }}
        >
          <GalleryImage key={photo.path} src={photo.url} alt={photoLabel(photo, index)} />
        </div>
        {canMove && <footer>
          <button type="button" className="public-gallery-control" aria-label="Imagen anterior" onClick={() => onMove(-1)}>
            <ChevronLeft size={22} aria-hidden="true" />
          </button>
          <span role="status" aria-atomic="true">{index + 1} de {images.length}<span className="sr-only"> · {photoLabel(photo, index)}</span></span>
          <button type="button" className="public-gallery-control" aria-label="Imagen siguiente" onClick={() => onMove(1)}>
            <ChevronRight size={22} aria-hidden="true" />
          </button>
        </footer>}
      </div>
    </dialog>
  );
}

export function PublicProfileGallery({ images }: { images: GalleryPhoto[] }) {
  const [index, setIndex] = useState<number | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);

  return (
    <>
      <div className="public-profile-gallery">
        {images.map((photo, position) => (
          <button
            key={photo.path}
            type="button"
            className="public-gallery-thumbnail"
            aria-label={`Ampliar imagen ${position + 1}: ${photo.alt?.trim() || 'Galería de servicios'}`}
            onClick={event => {
              opener.current = event.currentTarget;
              setIndex(position);
            }}
          >
            <GalleryImage src={photo.thumbnailUrl || photo.url} alt="" thumbnail />
            <span className="public-gallery-expand" aria-hidden="true"><Expand size={16} /></span>
          </button>
        ))}
      </div>
      {index !== null && images[index] && <GalleryViewer
        images={images}
        index={index}
        opener={opener}
        onMove={direction => setIndex(current => current === null ? null : (current + direction + images.length) % images.length)}
        onClose={() => setIndex(null)}
      />}
    </>
  );
}
