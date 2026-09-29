import { useEffect, useState } from 'react';
import { fetchSiteAnalytics, type SiteAnalytics } from './api';

const dayLabel = (day: string) => new Intl.DateTimeFormat('es-MX', {day: 'numeric', month: 'short', timeZone: 'UTC'}).format(new Date(`${day.slice(0,10)}T12:00:00Z`));
export function SiteVisitStats() {
  const [stats, setStats] = useState<SiteAnalytics | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void fetchSiteAnalytics().then(value => { if (active) setStats(value); }).catch(() => { if (active) setError('No pudimos cargar las visitas públicas. Actualiza la página para reintentar.'); });
    return () => { active = false; };
  }, []);
  const max = Math.max(1, ...stats?.daily.map(day => day.pageviews) ?? []);
  return <section className="admin-card" aria-label="Visitas públicas">
    <h2>Visitas a Nuthrick</h2>
    <p className="admin-note">Páginas públicas · Zona horaria: Ciudad de México</p>
    {error ? <p role="alert" className="admin-note">{error}</p> : !stats ? <p role="status" className="admin-note">Cargando visitas…</p> : <>
      <div className="admin-metrics mt-4">
        <div className="admin-metric"><p>Visitas desde la activación</p><strong>{stats.total.toLocaleString('es-MX')}</strong></div>
        <div className="admin-metric"><p>Visitas · últimos {stats.days} días</p><strong>{stats.pageviews.toLocaleString('es-MX')}</strong></div>
        <div className="admin-metric"><p>Sesiones · últimos {stats.days} días</p><strong>{stats.visitors.toLocaleString('es-MX')}</strong></div>
      </div>
      {stats.total === 0 && <p className="admin-note mt-4">Aún no hay visitas registradas. El conteo comienza al activar esta función.</p>}
      <h3 className="mt-5 font-semibold">Visitas por día</h3>
      <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto text-sm" aria-label="Visitas por día">
        {[...stats.daily].reverse().map(day => <li key={day.day} className="grid grid-cols-[4rem_1fr_auto] items-center gap-3">
          <span>{dayLabel(day.day)}</span><div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-[#edf1ed]"><div className="h-full rounded-full bg-[#3b8170]" style={{width: `${day.pageviews / max * 100}%`}}/></div><span>{day.pageviews} visitas · {day.visitors} sesiones</span>
        </li>)}
      </ul>
      <p className="admin-note mt-4">Se cuenta una visita por sesión, página y día. Una sesión puede abrir varias páginas y no equivale a una persona única. No incluye fichas, Super Link ni enlaces de confirmación.</p>
    </>}
  </section>;
}
