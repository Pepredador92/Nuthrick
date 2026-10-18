import { supabase } from '@/src/lib/supabase';
import { MEDIA_BUCKET, mediaExtensions, verifyMediaFile, type Announcement, type AnnouncementInput, type AnnouncementMedia } from './model';

const messages: Record<string, string> = {
  admin_required: 'Esta cuenta no puede administrar anuncios.',
  professional_required: 'Inicia sesión con una cuenta profesional.',
  stale_revision: 'Este anuncio cambió en otra sesión. Actualiza la lista y vuelve a abrirlo con Editar para revisar los cambios.',
  announcement_not_found: 'Este anuncio ya no existe. Actualiza la lista.',
  invalid_input: 'Revisa el contenido, las fechas y el botón del anuncio.',
  invalid_media: 'Sube una imagen de hasta 5 MB o un video de hasta 50 MB antes de publicar.',
};
async function adminApi(action: string, data: Record<string, unknown> = {}): Promise<Announcement[]> {
  const result = await supabase.rpc('announcements_admin_api', { p_action: action, p_data: data });
  if (result.error) throw new Error(messages[result.error.message] ?? 'No pudimos consultar o guardar los anuncios. Intenta de nuevo.');
  return result.data as Announcement[];
}
export const fetchAdminAnnouncements = () => adminApi('list');
export const saveAnnouncement = (item: AnnouncementInput, revision: number) => adminApi('save', { ...item, expected_revision: revision });
export const setAnnouncementStatus = (item: Announcement, status: Announcement['status']) => adminApi('status', { id: item.id, status, expected_revision: item.revision });
export const deleteAnnouncement = (item: Announcement) => adminApi('delete', { id: item.id, expected_revision: item.revision });

export async function uploadAnnouncementMedia(id: string, file: File): Promise<AnnouncementMedia> {
  await verifyMediaFile(file);
  const path = `${id}/${crypto.randomUUID()}.${mediaExtensions[file.type]}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false });
  if (error) throw new Error('No pudimos subir el archivo. Revisa tu conexión e intenta de nuevo.');
  return { media_path: path, media_mime: file.type };
}
export async function removeAnnouncementMedia(path: string) {
  if (path) await supabase.storage.from(MEDIA_BUCKET).remove([path]);
}
export async function announcementMediaUrl(path: string): Promise<string> {
  if (!path) return '';
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) throw new Error('No pudimos cargar el archivo del anuncio.');
  return data.signedUrl;
}
export async function fetchEntryAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase.rpc('my_announcements', { p_action: 'list', p_data: {} });
  if (error) throw new Error('No pudimos consultar los anuncios.');
  return data as Announcement[];
}
export async function recordAnnouncement(item: Announcement, event: 'seen' | 'dismiss'): Promise<boolean> {
  const { data, error } = await supabase.rpc('my_announcements', { p_action: event, p_data: { id: item.id, revision: item.revision } });
  if (error) throw new Error('No pudimos guardar el estado del anuncio.');
  return data === true;
}
