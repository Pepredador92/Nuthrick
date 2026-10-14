import type { TrainingCatalog, TrainingVideoInput } from '../../src/features/training/model';

// Offline preview of the real pages. These edits never call Supabase.
const videos = [
  ['Nw6ZwFHWoqI', '¿Dónde está cada cosa en Nuthrick?', 'Ubica el Dashboard, los expedientes, el Taller de dietas, la agenda, los mensajes y tus créditos de IA.'],
  ['ZcKpeXfjSdc', 'Completa tu perfil profesional en Nuthrick', 'Personaliza tu fotografía, biografía, especialidades, modalidades de atención y medios de contacto.'],
  ['rnzven3_7zs', 'Configura tu negocio y consultorios en Nuthrick', 'Agrega la identidad de tu negocio, tus consultorios, enlaces de ubicación y fotografías de servicios.'],
  ['VNuT6T7Or_s', 'Configura tus horarios disponibles en Nuthrick', 'Define la duración de las consultas, zona horaria, anticipación y horarios semanales de atención.'],
  ['PuIO8UgjOrM', '¿Cómo agenda una cita un paciente en Nuthrick?', 'Conoce cómo tus pacientes eligen un horario, verifican su correo y solicitan una cita desde tu página pública.'],
].map(([youtube_video_id, title, description], index) => ({ id: String(index + 1), title, description, youtube_video_id, display_order: index + 1, published: true, updated_at: '2026-10-14' }));
const catalog: TrainingCatalog = { revision: 1, videos };
const snapshot = () => structuredClone(catalog);
export async function fetchTrainingVideos() { return snapshot().videos.filter(video => video.published); }
export async function fetchTrainingCatalog() { return snapshot(); }
export async function saveTrainingVideo(input: TrainingVideoInput) {
  const found = catalog.videos.find(video => video.id === input.id);
  if (catalog.videos.some(video => video.youtube_video_id === input.youtube_video_id && video.id !== input.id)) throw new Error('Ese video ya está en la capacitación.');
  if (found) Object.assign(found, input);
  else catalog.videos.push({ ...input, id: crypto.randomUUID(), display_order: catalog.videos.length + 1, updated_at: new Date().toISOString() });
  catalog.revision += 1;
  return snapshot();
}
export async function reorderTrainingVideos(ids: string[]) {
  catalog.videos = ids.map((id, index) => ({ ...catalog.videos.find(video => video.id === id)!, display_order: index + 1 }));
  catalog.revision += 1;
  return snapshot();
}
export async function deleteTrainingVideo(id: string) {
  catalog.videos = catalog.videos.filter(video => video.id !== id).map((video, index) => ({ ...video, display_order: index + 1 }));
  catalog.revision += 1;
  return snapshot();
}
