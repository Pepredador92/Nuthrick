import { supabase } from '@/src/lib/supabase';
import type { TrainingCatalog, TrainingVideo, TrainingVideoInput } from './model';

const messages: Record<string, string> = {
  admin_required: 'Esta cuenta no puede administrar la capacitación.',
  professional_required: 'Inicia sesión con tu cuenta profesional para ver la Academia.',
  stale_revision: 'El catálogo cambió en otra sesión. Actualízalo y revisa el orden antes de guardar de nuevo.',
  video_already_exists: 'Ese video ya está en la capacitación. Puedes editar su registro.',
  video_not_found: 'Este video ya no está en el catálogo. Actualiza la lista.',
  invalid_input: 'Revisa el título, la descripción y el enlace del video.',
  invalid_order: 'El orden no coincide con el catálogo actual. Actualiza la lista.',
};

export async function fetchTrainingVideos(): Promise<TrainingVideo[]> {
  const { data, error } = await supabase.rpc('training_catalog');
  if (error) throw new Error(messages[error.message] ?? 'No pudimos cargar los videos. Intenta de nuevo.');
  return data as TrainingVideo[];
}

async function adminTraining(action: string, data: Record<string, unknown> = {}): Promise<TrainingCatalog> {
  const result = await supabase.rpc('training_admin_api', { p_action: action, p_data: data });
  if (result.error) throw new Error(messages[result.error.message] ?? 'No pudimos guardar o consultar la capacitación. Intenta de nuevo.');
  return result.data as TrainingCatalog;
}

export const fetchTrainingCatalog = () => adminTraining('list');
export const saveTrainingVideo = (video: TrainingVideoInput, revision: number) => adminTraining('save', { ...video, expected_revision: revision });
export const deleteTrainingVideo = (id: string, revision: number) => adminTraining('delete', { id, expected_revision: revision });
export const reorderTrainingVideos = (ids: string[], revision: number) => adminTraining('reorder', { ids, expected_revision: revision });
