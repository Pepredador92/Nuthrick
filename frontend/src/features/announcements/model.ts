export type AnnouncementFrequency = 'once' | 'session' | 'until_dismissed';
export type AnnouncementStatus = 'draft' | 'published' | 'paused';
export type Announcement = {
  id: string;
  title: string;
  body: string;
  media_path: string;
  media_mime: string;
  media_alt: string;
  cta_label: string;
  cta_url: string;
  status: AnnouncementStatus;
  frequency: AnnouncementFrequency;
  starts_at: string | null;
  ends_at: string | null;
  priority: number;
  revision: number;
  created_at: string;
  updated_at: string;
};
export type AnnouncementInput = Omit<Announcement, 'revision' | 'created_at' | 'updated_at'>;
export type AnnouncementMedia = Pick<Announcement, 'media_path' | 'media_mime'>;
export type AnnouncementContent = Pick<Announcement, 'title' | 'body' | 'media_mime' | 'media_alt' | 'cta_label' | 'cta_url'>;

export const MEDIA_BUCKET = 'platform-announcements';
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const mediaExtensions: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/webm': 'webm',
};
export const frequencyLabels: Record<AnnouncementFrequency, string> = {
  once: 'Una sola vez por usuario',
  session: 'Una vez por sesión',
  until_dismissed: 'Hasta que lo cierre',
};
export const frequencyHelp: Record<AnnouncementFrequency, string> = {
  once: 'Se considera visto al abrirse, aunque el usuario salga sin cerrarlo.',
  session: 'Vuelve a aparecer cuando el usuario inicia una nueva sesión. Recargar la página no lo repite.',
  until_dismissed: 'Vuelve a aparecer al entrar hasta que el usuario pulse Cerrar o el botón del anuncio.',
};

export function validAnnouncementUrl(value: string) {
  if (!value || value.length > 2048 || /[\s\\\u0000-\u001f\u007f]/.test(value)) return false;
  if (/^\/app(?:[/?#]|$)/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch { return false; }
}

export function announcementState(item: Pick<Announcement, 'status' | 'starts_at' | 'ends_at'>, now = Date.now()) {
  if (item.status === 'draft') return 'Borrador';
  if (item.status === 'paused') return 'Pausado';
  if (item.ends_at && Date.parse(item.ends_at) <= now) return 'Finalizado';
  if (item.starts_at && Date.parse(item.starts_at) > now) return 'Programado';
  return 'Activo';
}

export function announcementIsActive(item: Pick<Announcement, 'status' | 'starts_at' | 'ends_at'>, now = Date.now()) {
  return announcementState(item, now) === 'Activo';
}

export function localDateTime(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function validateMediaFile(file: Pick<File, 'type' | 'size'>) {
  if (!mediaExtensions[file.type]) throw new Error('Elige una imagen JPG, PNG o WEBP, o un video MP4 o WEBM.');
  const max = file.type.startsWith('video/') ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
  if (file.size < 1 || file.size > max) throw new Error(`El archivo debe pesar entre 1 byte y ${max === VIDEO_MAX_BYTES ? '50' : '5'} MB.`);
}

export async function verifyMediaFile(file: File) {
  validateMediaFile(file);
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  const valid = {
    'image/jpeg': bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
    'image/png': bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10',
    'image/webp': ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP',
    'video/mp4': ascii(4, 8) === 'ftyp',
    'video/webm': bytes.slice(0, 4).join(',') === '26,69,223,163',
  }[file.type];
  if (!valid) throw new Error('El contenido del archivo no coincide con su formato. Exporta de nuevo la imagen o el video.');
}
