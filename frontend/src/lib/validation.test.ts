import { describe, expect, it } from 'vitest';
import {
  isValidEducationYear,
  isValidIanaTimezone,
  isValidUrl,
  MAX_IMAGE_BYTES,
  normalizeSlug,
  slotsOverlap,
  validateImage,
} from './validation';

describe('normalizeSlug', () => {
  it('normalizes accents, whitespace and punctuation', () => {
    expect(normalizeSlug('  José Olmedo — Nutrición ')).toBe('jose-olmedo-nutricion');
  });

  it('does not leave leading or trailing separators', () => {
    expect(normalizeSlug('---Mi perfil---')).toBe('mi-perfil');
  });
});

describe('education year validation', () => {
  it('accepts a plausible year and rejects distant values', () => {
    expect(isValidEducationYear(2024, 2026)).toBe(true);
    expect(isValidEducationYear(2120, 2026)).toBe(false);
  });
});

describe('availability overlap', () => {
  const slots = [{ id: 'a', weekday: 1, start_time: '09:00', end_time: '13:00' }];

  it('detects overlaps on the same weekday', () => {
    expect(slotsOverlap({ weekday: 1, start_time: '12:30', end_time: '14:00' }, slots)).toBe(true);
  });

  it('allows adjacent or different-day slots', () => {
    expect(slotsOverlap({ weekday: 1, start_time: '13:00', end_time: '14:00' }, slots)).toBe(false);
    expect(slotsOverlap({ weekday: 2, start_time: '12:30', end_time: '14:00' }, slots)).toBe(false);
  });

  it('rejects ranges whose end is not after the start', () => {
    expect(slotsOverlap({ weekday: 1, start_time: '14:00', end_time: '10:00' }, [])).toBe(true);
  });

  it('can ignore the record currently being edited', () => {
    expect(slotsOverlap({ weekday: 1, start_time: '09:00', end_time: '13:00' }, slots, 'a')).toBe(false);
  });
});

describe('URL and image validation', () => {
  it('only accepts complete HTTP or HTTPS URLs', () => {
    expect(isValidUrl('https://nuthrick.example/perfil')).toBe(true);
    expect(isValidUrl('javascript:alert(1)')).toBe(false);
    expect(isValidUrl('instagram.com/perfil')).toBe(false);
  });

  it('accepts supported images and rejects arbitrary files', () => {
    expect(validateImage(new File(['image'], 'profile.webp', { type: 'image/webp' }))).toBeNull();
    expect(validateImage(new File(['script'], 'payload.svg', { type: 'image/svg+xml' }))).toMatch(/JPEG, PNG o WEBP/);
  });

  it('rejects supported image types above the size limit', () => {
    const oversized = new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], 'large.png', { type: 'image/png' });
    expect(validateImage(oversized)).toMatch(/5 MB/);
  });
});

describe('IANA timezone validation', () => {
  it('accepts named IANA zones and rejects GMT offsets or unknown names', () => {
    expect(isValidIanaTimezone('America/Mexico_City')).toBe(true);
    expect(isValidIanaTimezone('GMT-6')).toBe(false);
    expect(isValidIanaTimezone('America/Not_A_Zone')).toBe(false);
  });
});
