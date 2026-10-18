import { describe, expect, it } from 'vitest';
import { announcementState, localDateTime, validAnnouncementUrl, validateMediaFile, verifyMediaFile } from './model';

describe('announcement scheduling and links', () => {
  it('respects publication, scheduling and the exact expiration boundary', () => {
    const now = Date.parse('2026-10-18T18:00:00Z');
    const published = { status: 'published' as const, starts_at: '2026-10-18T18:00:00Z', ends_at: null };
    expect(announcementState(published, now)).toBe('Activo');
    expect(announcementState({ ...published, starts_at: '2026-10-18T18:01:00Z' }, now)).toBe('Programado');
    expect(announcementState({ ...published, ends_at: '2026-10-18T18:00:00Z' }, now)).toBe('Finalizado');
    expect(announcementState({ ...published, status: 'paused' }, now)).toBe('Pausado');
    expect(announcementState({ ...published, status: 'draft' }, now)).toBe('Borrador');
    expect(new Date(localDateTime(published.starts_at)).getTime()).toBe(now);
  });
  it('allows HTTPS and application links while rejecting unsafe destinations', () => {
    for (const url of ['/app', '/app/academy', '/app?tab=updates', 'https://nuthrick.com/evento']) expect(validAnnouncementUrl(url), url).toBe(true);
    for (const url of ['', '//evil.test', '/application', 'javascript:alert(1)', 'data:text/html,test', 'https://user:pass@evil.test', 'https://test.com\n', '/app\\evil.test', 'http://test.com']) expect(validAnnouncementUrl(url), url).toBe(false);
  });
});
describe('uploaded announcement media', () => {
  it('rejects unsupported or excessive files before uploading', () => {
    expect(() => validateMediaFile({ type: 'image/svg+xml', size: 100 })).toThrow(/JPG/);
    expect(() => validateMediaFile({ type: 'image/png', size: 5 * 1024 * 1024 + 1 })).toThrow(/5 MB/);
    expect(() => validateMediaFile({ type: 'video/mp4', size: 50 * 1024 * 1024 + 1 })).toThrow(/50 MB/);
    expect(() => validateMediaFile({ type: 'video/mp4', size: 50 * 1024 * 1024 })).not.toThrow();
    expect(() => validateMediaFile({ type: 'image/png', size: 0 })).toThrow();
  });
  it('checks file signatures, including a renamed unsupported file', async () => {
    const file = (type: string, bytes: number[]) => ({ type, size: bytes.length, slice: () => ({ arrayBuffer: async () => new Uint8Array(bytes).buffer }) }) as unknown as File;
    await expect(verifyMediaFile(file('image/png', [137, 80, 78, 71, 13, 10, 26, 10]))).resolves.toBeUndefined();
    await expect(verifyMediaFile(file('image/png', [60, 115, 118, 103, 62]))).rejects.toThrow(/no coincide/);
    await expect(verifyMediaFile(file('video/mp4', [0, 0, 0, 16, 102, 116, 121, 112]))).resolves.toBeUndefined();
  });
});
