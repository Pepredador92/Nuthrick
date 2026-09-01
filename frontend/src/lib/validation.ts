export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function normalizeSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function isValidIanaTimezone(value: string): boolean {
  if (!value.includes('/')) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function isValidEducationYear(value: number, currentYear = new Date().getFullYear()): boolean {
  return Number.isInteger(value) && value >= 1940 && value <= currentYear + 10;
}

export function minutesFromTime(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function slotsOverlap(
  candidate: { weekday: number; start_time: string; end_time: string },
  existing: Array<{ id?: string; weekday: number; start_time: string; end_time: string }>,
  ignoredId?: string,
): boolean {
  const start = minutesFromTime(candidate.start_time);
  const end = minutesFromTime(candidate.end_time);
  if (end <= start) return true;

  return existing.some((slot) =>
    slot.id !== ignoredId
    && slot.weekday === candidate.weekday
    && start < minutesFromTime(slot.end_time)
    && end > minutesFromTime(slot.start_time),
  );
}

export function validateImage(file: File): string | null {
  if (!IMAGE_MIME_TYPES.includes(file.type as (typeof IMAGE_MIME_TYPES)[number])) {
    return 'Usa una imagen JPEG, PNG o WEBP.';
  }
  if (file.size > MAX_IMAGE_BYTES) return 'La imagen no debe superar 5 MB.';
  return null;
}
