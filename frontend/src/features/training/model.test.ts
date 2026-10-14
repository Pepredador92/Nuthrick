import { describe, expect, it } from 'vitest';
import { parseYoutubeVideoId, youtubeEmbedUrl } from './model';

describe('YouTube training links', () => {
  it.each([
    'https://www.youtube.com/watch?v=PuIO8UgjOrM&list=PLBuZvLPXwzIs',
    'https://youtu.be/PuIO8UgjOrM?t=10',
    'https://m.youtube.com/watch?v=PuIO8UgjOrM',
    'youtube.com/shorts/PuIO8UgjOrM',
    'https://www.youtube.com/live/PuIO8UgjOrM',
    'https://www.youtube-nocookie.com/embed/PuIO8UgjOrM',
    ' PuIO8UgjOrM ',
  ])('extracts only the video ID from %s', url => expect(parseYoutubeVideoId(url)).toBe('PuIO8UgjOrM'));

  it.each([
    'https://youtube.com/playlist?list=PLBuZvLPXwzIs',
    'https://youtube.com.evil.test/watch?v=PuIO8UgjOrM',
    'https://youtube.com@evil.test/watch?v=PuIO8UgjOrM',
    'https://user@youtube.com/watch?v=PuIO8UgjOrM',
    'javascript:alert(1)',
    'https://youtu.be/PuIO8UgjOrM/extra',
    'https://youtube.com/watch?v=invalid',
    'https://youtube.com:8443/watch?v=PuIO8UgjOrM',
    '',
  ])('rejects unsupported or unsafe URLs: %s', url => expect(parseYoutubeVideoId(url)).toBeNull());

  it('builds an embed from a validated ID and never from arbitrary URLs', () => {
    expect(youtubeEmbedUrl('PuIO8UgjOrM')).toBe('https://www.youtube-nocookie.com/embed/PuIO8UgjOrM?autoplay=1&playsinline=1&rel=0');
    expect(() => youtubeEmbedUrl('https://evil.test')).toThrow();
  });
});
