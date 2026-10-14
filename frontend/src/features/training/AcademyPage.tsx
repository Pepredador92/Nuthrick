import { useEffect, useState } from 'react';
import { BookOpen, GraduationCap, Play, RefreshCw } from 'lucide-react';
import { fetchTrainingVideos } from './api';
import type { TrainingVideo } from './model';
import { trainingThumbnail } from './model';
import { VideoModal } from './VideoModal';
import './training.css';

export function AcademyPage() {
  const [videos, setVideos] = useState<TrainingVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<TrainingVideo | null>(null);

  useEffect(() => {
    let active = true;
    fetchTrainingVideos().then(data => { if (active) { setVideos(data); setError(''); } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'No pudimos cargar los videos.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);

  return <div className="academy-page">
    <header className="academy-intro">
      <span className="academy-intro-icon"><GraduationCap size={30} /></span>
      <div><p className="academy-eyebrow">Tutoriales paso a paso</p><h1>Academia Nuthrick</h1>
        <p>Aprende a usar tu espacio, prepara tu consulta y conoce las herramientas de Nuthrick a tu ritmo.</p></div>
    </header>
    <div className="academy-section-heading"><div><h2>Aprende a usar Nuthrick</h2><p>Sigue el orden de los videos o ve directamente al tema que necesitas.</p></div>
      {!loading && !error && <span>{videos.length} {videos.length === 1 ? 'video' : 'videos'}</span>}
    </div>
    {loading ? <div className="academy-state" role="status">Cargando capacitación…</div>
      : error ? <div className="academy-state" role="alert"><p>{error}</p><button type="button" className="nuth-button-secondary" onClick={() => { setLoading(true); setAttempt(value => value + 1); }}><RefreshCw size={16} />Reintentar</button></div>
      : videos.length === 0 ? <div className="academy-state"><BookOpen size={32} /><h3>Pronto habrá nuevos tutoriales</h3><p>Aquí encontrarás los videos para aprender a usar Nuthrick.</p></div>
      : <ol className="academy-grid">{videos.map((video, index) => <li key={video.id}>
        <article className="academy-video">
          <button type="button" className="academy-video-play" aria-label={`Ver video: ${video.title}`} onClick={() => setSelected(video)}>
            <img src={trainingThumbnail(video.youtube_video_id)} alt="" loading="lazy" width="320" height="180" />
            <span className="academy-video-overlay"><span><Play size={22} fill="currentColor" />Ver video</span></span>
          </button>
          <div className="academy-video-copy"><span className="academy-lesson">Lección {String(index + 1).padStart(2, '0')}</span><h3>{video.title}</h3>{video.description && <p>{video.description}</p>}</div>
        </article>
      </li>)}</ol>}
    {selected && <VideoModal video={selected} onClose={() => setSelected(null)} />}
  </div>;
}
