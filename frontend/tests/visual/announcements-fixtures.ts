import type { Announcement, AnnouncementInput } from '../../src/features/announcements/model';
let items: Announcement[] = [
  { id: '20000000-0000-0000-0000-000000000001', title: 'Tu próxima consulta, con más claridad', body: 'Conoce las herramientas de Nuthrick para organizar tus cálculos, revisar resultados y dedicar más tiempo a tus pacientes.\nEncuentra los tutoriales en Capacitación Nuthrick.', media_path: '/images/landing/nuthrick-calculos.png', media_mime: 'image/png', media_alt: 'Herramientas de cálculo de Nuthrick', cta_label: 'Explorar capacitación', cta_url: '/app/academy', status: 'published', frequency: 'once', starts_at: null, ends_at: null, priority: 50, revision: 1, created_at: '2026-10-18T12:00:00Z', updated_at: '2026-10-18T12:00:00Z' },
  { id: '20000000-0000-0000-0000-000000000002', title: 'Un espacio para seguir aprendiendo', body: 'Prepara tu próximo aviso con una imagen o un video para toda la comunidad.', media_path: '/og.png', media_mime: 'image/png', media_alt: 'Nuthrick, tu espacio profesional', cta_label: '', cta_url: '', status: 'draft', frequency: 'until_dismissed', starts_at: null, ends_at: null, priority: 0, revision: 1, created_at: '2026-10-17T12:00:00Z', updated_at: '2026-10-17T12:00:00Z' },
];
export const fetchAdminAnnouncements = async () => structuredClone(items);
export const announcementMediaUrl = async (path: string) => path;
export const removeAnnouncementMedia = async () => {};
export const uploadAnnouncementMedia = async (_id: string, file: File) => ({ media_path: URL.createObjectURL(file), media_mime: file.type });
export const saveAnnouncement = async (input: AnnouncementInput) => {
  const existing = items.find(item => item.id === input.id);
  const value = { ...input, revision: (existing?.revision ?? 0) + 1, created_at: existing?.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString() };
  items = [value, ...items.filter(item => item.id !== input.id)]; return structuredClone(items);
};
export const setAnnouncementStatus = async (item: Announcement, status: Announcement['status']) => saveAnnouncement({ ...item, status });
export const deleteAnnouncement = async (item: Announcement) => { items = items.filter(value => value.id !== item.id); return structuredClone(items); };
