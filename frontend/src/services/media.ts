import { supabase } from "@/src/lib/supabase";
import { validateImage } from "@/src/lib/validation";
import { prepareGalleryImage } from "@/src/lib/galleryImage";
import type { MediaCategory } from "@/src/types/domain";

const BUCKET = "professional-media";
const PATIENT_BUCKET = "patient-progress";

async function uploadProfessionalMedia(path: string, image: Blob) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, image, {
    contentType: image.type,
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
}

export async function uploadProfessionalImage(
  file: File,
  storageKey: string,
  category: MediaCategory,
): Promise<string> {
  const validationError = validateImage(file);
  if (validationError) throw new Error(validationError);

  const extension =
    file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const path = `${storageKey}/${category}/${category}-${crypto.randomUUID()}.${extension}`;
  await uploadProfessionalMedia(path, file);
  return path;
}

export function serviceThumbnailPath(path: string): string | null {
  const normalized = /^([a-f0-9-]{36}\/services\/services-[a-f0-9-]{36})-full\.(webp|png)$/.exec(path);
  return normalized ? `${normalized[1]}-thumb.${normalized[2]}` : null;
}

export async function uploadServiceGalleryImage(file: File, storageKey: string): Promise<string> {
  const { full, thumbnail } = await prepareGalleryImage(file);
  const extension = full.type === "image/webp" ? "webp" : "png";
  const base = `${storageKey}/services/services-${crypto.randomUUID()}`;
  const path = `${base}-full.${extension}`;
  const results = await Promise.allSettled([
    uploadProfessionalMedia(path, full),
    uploadProfessionalMedia(`${base}-thumb.${extension}`, thumbnail),
  ]);
  const failure = results.find(result => result.status === "rejected");
  if (failure) {
    await removeServiceGalleryImage(path).catch(() => undefined);
    throw failure.reason;
  }
  return path;
}

export async function removeServiceGalleryImage(path: string): Promise<void> {
  const thumbnail = serviceThumbnailPath(path);
  const { error } = await supabase.storage.from(BUCKET).remove(thumbnail ? [path, thumbnail] : [path]);
  if (error) throw error;
}

export async function removeProfessionalImage(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw error;
}

export async function getSignedMediaUrl(
  path?: string | null,
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}

export async function getSignedMediaUrls(
  paths: string[],
): Promise<Map<string, string>> {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  if (!uniquePaths.length) return new Map();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(uniquePaths, 3600);
  if (error) return new Map();
  return new Map(
    data.flatMap((item) =>
      item.signedUrl ? [[item.path ?? "", item.signedUrl] as const] : [],
    ),
  );
}

export async function uploadPatientProgressPhoto(
  file: File,
  patientId: string,
  professionalId: string,
): Promise<string> {
  const validationError = validateImage(file);
  if (validationError) throw new Error(validationError);
  const extension =
    file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const path = `${professionalId}/patients/${patientId}/progress-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from(PATIENT_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });
  if (error) throw error;
  return path;
}

export async function getSignedPatientPhotoUrl(
  path: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(PATIENT_BUCKET)
    .createSignedUrl(path, 3600);
  return error ? null : data.signedUrl;
}
