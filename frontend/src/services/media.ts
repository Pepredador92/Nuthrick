import { supabase } from '@/src/lib/supabase';
import { validateImage } from '@/src/lib/validation';
import type { MediaCategory } from '@/src/types/domain';

const BUCKET = 'professional-media';

export async function uploadProfessionalImage(
  file: File,
  storageKey: string,
  category: MediaCategory,
): Promise<string> {
  const validationError = validateImage(file);
  if (validationError) throw new Error(validationError);

  const extension = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
  const path = `${storageKey}/${category}/${category}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function removeProfessionalImage(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

export async function getSignedMediaUrl(path?: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}

export async function getSignedMediaUrls(paths: string[]): Promise<Map<string, string>> {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  if (!uniquePaths.length) return new Map();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(uniquePaths, 3600);
  if (error) return new Map();
  return new Map(data.flatMap((item) => item.signedUrl ? [[item.path ?? '', item.signedUrl] as const] : []));
}
