import { beforeEach, expect, it, vi } from 'vitest';
import { removeServiceGalleryImage, serviceThumbnailPath, uploadServiceGalleryImage } from './media';

const storage = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn(), prepare: vi.fn() }));
vi.mock('@/src/lib/supabase', () => ({ supabase: { storage: { from: () => storage } } }));
vi.mock('@/src/lib/galleryImage', () => ({ prepareGalleryImage: storage.prepare }));

const owner = 'ab5496b8-1c3a-45a6-86b4-355a6cfbd259';
const full = new Blob(['full'], { type: 'image/webp' });
const thumbnail = new Blob(['thumbnail'], { type: 'image/webp' });
const original = new File(['source'], 'fachada.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  vi.resetAllMocks();
  storage.prepare.mockResolvedValue({ full, thumbnail });
  storage.upload.mockResolvedValue({ error: null });
  storage.remove.mockResolvedValue({ error: null });
});

it('uploads the two normalized versions using their actual media type', async () => {
  const path = await uploadServiceGalleryImage(original, owner);
  expect(path).toMatch(new RegExp(`^${owner}/services/services-[a-f0-9-]{36}-full[.]webp$`));
  expect(storage.prepare).toHaveBeenCalledWith(original);
  expect(storage.upload).toHaveBeenNthCalledWith(1, path, full, expect.objectContaining({ contentType: 'image/webp', upsert: false }));
  expect(storage.upload).toHaveBeenNthCalledWith(2, serviceThumbnailPath(path), thumbnail, expect.objectContaining({ contentType: 'image/webp' }));
});

it('cleans the pair when either storage upload fails', async () => {
  storage.upload.mockResolvedValueOnce({ error: new Error('Falló el archivo grande') });
  await expect(uploadServiceGalleryImage(original, owner)).rejects.toThrow('Falló el archivo grande');
  const path = storage.upload.mock.calls[0][0];
  expect(storage.remove).toHaveBeenCalledExactlyOnceWith([path, serviceThumbnailPath(path)]);
});

it('removes a legacy photo by its exact path', async () => {
  const path = `${owner}/services/services-292a85d2-83d6-4a9b-90ed-5e023892b6cb.jpg`;
  expect(serviceThumbnailPath(path)).toBeNull();
  await removeServiceGalleryImage(path);
  expect(storage.remove).toHaveBeenCalledExactlyOnceWith([path]);
});
