export type TrainingVideo = {
  id: string;
  title: string;
  description: string;
  youtube_video_id: string;
  display_order: number;
  published: boolean;
  updated_at: string;
};
export type TrainingCatalog = { revision: number; videos: TrainingVideo[] };
export type TrainingVideoInput = Pick<TrainingVideo, 'title' | 'description' | 'youtube_video_id' | 'published'> & { id?: string };

const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;

/** Only extract a video ID; never use an administrator's URL as an iframe src. */
export function parseYoutubeVideoId(input: string): string | null {
  const value = input.trim();
  if (videoIdPattern.test(value)) return value;
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    let id: string | null = null;
    if (host === 'youtu.be' || host === 'www.youtu.be') {
      if (/^\/[^/]+\/?$/.test(url.pathname)) id = url.pathname.split('/')[1];
    } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(host)) {
      if (url.pathname === '/watch' && !host.includes('nocookie')) id = url.searchParams.get('v');
      else if (/^\/(embed|shorts|live)\/[^/]+\/?$/.test(url.pathname)) id = url.pathname.split('/')[2];
    }
    return id && videoIdPattern.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function youtubeVideoUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
}

export function youtubeEmbedUrl(id: string): string {
  if (!videoIdPattern.test(id)) throw new Error('Video de YouTube inválido.');
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0`;
}

export function trainingThumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
}
