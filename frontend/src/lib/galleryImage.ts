import { validateImage } from './validation';

const FULL_SIDE = 1920;
const THUMBNAIL_SIDE = 480;
const FULL_BYTES = 850 * 1024;
const THUMBNAIL_BYTES = 96 * 1024;
const preparationError = 'No pudimos preparar esta imagen. Prueba con otro archivo JPG, PNG o WebP.';

export async function prepareGalleryImage(file: File): Promise<{ full: Blob; thumbnail: Blob }> {
  const validationError = validateImage(file);
  if (validationError) throw new Error(validationError);

  const source = new Image();
  const canvas = document.createElement('canvas');
  const sourceUrl = URL.createObjectURL(file);
  try {
    source.src = sourceUrl;
    await source.decode();
    const longest = Math.max(source.naturalWidth, source.naturalHeight);
    const context = canvas.getContext('2d');
    if (!context || !longest) throw new Error(preparationError);

    const encode = async (side: number, type: string, quality: number): Promise<Blob> => {
      const scale = side / longest;
      canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
      context.imageSmoothingQuality = 'high';
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      return new Promise((resolve, reject) => {
        canvas.toBlob(blob => blob?.size ? resolve(blob) : reject(new Error(preparationError)), type, quality);
      });
    };

    async function fit(maxSide: number, maxBytes: number, type: string, quality: number): Promise<Blob> {
      let side = Math.min(longest, maxSide);
      let blob = await encode(side, type, quality);
      if (blob.size > maxBytes && blob.type === 'image/webp' && quality > 0.79) {
        quality = 0.79;
        blob = await encode(side, blob.type, quality);
      }
      while (blob.size > maxBytes && side > 1) {
        side = Math.max(1, Math.floor(side * 0.8));
        blob = await encode(side, blob.type, quality);
      }
      if (blob.size > maxBytes) throw new Error(preparationError);
      return blob;
    }

    const full = await fit(FULL_SIDE, FULL_BYTES, 'image/webp', 0.88);
    const thumbnail = await fit(THUMBNAIL_SIDE, THUMBNAIL_BYTES, full.type, 0.78);
    return { full, thumbnail };
  } catch {
    throw new Error(preparationError);
  } finally {
    URL.revokeObjectURL(sourceUrl);
    canvas.width = 0;
    canvas.height = 0;
  }
}
