import { Check, Image as ImageIcon, LoaderCircle, Move, X, ZoomIn } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

const VIEWPORT_SIZE = 280;
const OUTPUT_SIZE = 800;

interface Point { x: number; y: number; }

interface ImageCropperProps {
  file: File;
  onCancel: () => void;
  onConfirm: (file: File) => Promise<boolean | void>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function ImageCropper({ file, onCancel, onConfirm }: ImageCropperProps) {
  const imageUrl = useMemo(() => URL.createObjectURL(file), [file]);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dragStart = useRef<{ pointer: Point; offset: Point } | null>(null);

  useEffect(() => {
    const nextImage = new Image();
    nextImage.onload = () => setImage(nextImage);
    nextImage.onerror = () => setError('No fue posible abrir esta imagen.');
    nextImage.src = imageUrl;
    return () => URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  const metrics = useMemo(() => {
    if (!image) return null;
    const baseScale = Math.max(VIEWPORT_SIZE / image.naturalWidth, VIEWPORT_SIZE / image.naturalHeight);
    const scale = baseScale * zoom;
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    return { scale, width, height, centerX: (VIEWPORT_SIZE - width) / 2, centerY: (VIEWPORT_SIZE - height) / 2 };
  }, [image, zoom]);

  const clampOffset = (next: Point, nextMetrics = metrics): Point => {
    if (!nextMetrics) return next;
    const horizontal = Math.max(0, (nextMetrics.width - VIEWPORT_SIZE) / 2);
    const vertical = Math.max(0, (nextMetrics.height - VIEWPORT_SIZE) / 2);
    return { x: clamp(next.x, -horizontal, horizontal), y: clamp(next.y, -vertical, vertical) };
  };

  const changeZoom = (value: number) => {
    setZoom(value);
    setOffset((current) => clampOffset(current, image ? (() => {
      const baseScale = Math.max(VIEWPORT_SIZE / image.naturalWidth, VIEWPORT_SIZE / image.naturalHeight);
      const scale = baseScale * value;
      return { scale, width: image.naturalWidth * scale, height: image.naturalHeight * scale, centerX: 0, centerY: 0 };
    })() : null));
  };

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!metrics || busy) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = { pointer: { x: event.clientX, y: event.clientY }, offset };
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current || !metrics) return;
    setOffset(clampOffset({
      x: dragStart.current.offset.x + event.clientX - dragStart.current.pointer.x,
      y: dragStart.current.offset.y + event.clientY - dragStart.current.pointer.y,
    }));
  };

  const stopDrag = () => { dragStart.current = null; };

  const createCroppedFile = async (): Promise<File> => {
    if (!image || !metrics) throw new Error('La imagen todavía no está lista.');
    const sourceSize = VIEWPORT_SIZE / metrics.scale;
    const centerX = (VIEWPORT_SIZE / 2 - metrics.centerX - offset.x) / metrics.scale;
    const centerY = (VIEWPORT_SIZE / 2 - metrics.centerY - offset.y) / metrics.scale;
    const sx = clamp(centerX - sourceSize / 2, 0, image.naturalWidth - sourceSize);
    const sy = clamp(centerY - sourceSize / 2, 0, image.naturalHeight - sourceSize);
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No fue posible preparar el recorte.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, sx, sy, sourceSize, sourceSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('No fue posible exportar el recorte.')), 'image/jpeg', 0.92);
    });
    return new File([blob], `avatar-${Date.now()}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  };

  const confirm = async () => {
    setBusy(true); setError('');
    try {
      const cropped = await createCroppedFile();
      const saved = await onConfirm(cropped);
      if (saved === false) setError('No fue posible guardar la foto.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No fue posible preparar la foto.');
    } finally { setBusy(false); }
  };

  return <div className="fixed inset-0 z-[70] grid place-items-center bg-[#17312c]/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="avatar-crop-title"><div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="nuth-eyebrow">Ajustar foto</p><h2 id="avatar-crop-title" className="mt-2 text-2xl font-semibold">Encuadra tu miniatura</h2><p className="mt-2 text-sm leading-6 text-[#6d7b76]">Arrastra la imagen y usa el zoom. Este recorte cuadrado se verá igual en tu perfil y en tu página pública.</p></div><button type="button" onClick={onCancel} disabled={busy} className="rounded-xl p-2 text-[#73807b] hover:bg-[#f2f5f1]" aria-label="Cancelar ajuste"><X size={19} /></button></div><div className="mt-6 flex justify-center"><div className="relative h-[280px] w-[280px] touch-none overflow-hidden rounded-[30px] bg-[#edf1ed] shadow-inner" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag} role="application" aria-label="Área de recorte; arrastra para encuadrar"><div className="pointer-events-none absolute inset-0 z-10 rounded-[30px] ring-2 ring-white/90 ring-inset" />{image && metrics ? <img src={imageUrl} alt="Vista previa de la foto" draggable={false} className="pointer-events-none absolute max-w-none select-none" style={{ width: metrics.width, height: metrics.height, left: metrics.centerX + offset.x, top: metrics.centerY + offset.y }} /> : <div className="grid h-full place-items-center text-[#80908a]"><ImageIcon className="animate-pulse" size={28} /></div>}</div></div><div className="mt-6 rounded-2xl bg-[#f4f6f2] p-4"><div className="flex items-center gap-2 text-sm font-semibold text-[#365b4f]"><ZoomIn size={17} />Zoom</div><input id="avatar-zoom" className="mt-3 w-full accent-[#477363]" type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => changeZoom(Number(event.target.value))} aria-label="Zoom de la foto" /><div className="mt-1 flex items-center justify-between text-xs text-[#84918c]"><span>Más imagen</span><span>{zoom.toFixed(1)}×</span><span>Más detalle</span></div></div><p className="mt-4 flex items-center gap-2 text-xs text-[#788680]"><Move size={15} />Arrastra dentro del recuadro para elegir el área.</p>{error && <p role="alert" className="mt-4 text-sm text-[#984a39]">{error}</p>}<div className="mt-6 flex justify-end gap-3"><button type="button" onClick={onCancel} disabled={busy} className="nuth-button-secondary">Cancelar</button><button type="button" onClick={() => void confirm()} disabled={busy || !image} className="nuth-button">{busy ? <LoaderCircle className="animate-spin" size={17} /> : <Check size={17} />}Guardar recorte</button></div></div></div>;
}
