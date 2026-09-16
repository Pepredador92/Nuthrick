import { Building2, ExternalLink, GraduationCap, Languages, LoaderCircle, MapPin, Stethoscope, UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PublicBookingPanel } from './PublicBookingPage';
import { PublicProfessionalHeader } from '@/src/features/profile/PublicProfessionalHeader';
import { Logo } from '@/src/components/ui/Logo';
import { getPublicProfile } from '@/src/services/profile';
import type { PublicProfileContent } from '@/src/types/domain';

const educationTypeLabels = { degree: 'Grado académico', course: 'Curso', training: 'Capacitación', diploma: 'Diplomado', specialty: 'Especialidad', masters: 'Maestría', doctorate: 'Doctorado' };

function mapUrl(location: { address: string; mapUrl?: string }) {
  return location.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.address)}`;
}

export function PublicProfilePage() {
  const { slug = '' } = useParams();
  const [profile, setProfile] = useState<PublicProfileContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      setLoading(true);
      setError('');
      void getPublicProfile(slug).then((value) => {
        if (active) {
          setProfile(value);
          document.title = value ? `${value.name} | Nuthrick` : 'Perfil no encontrado | Nuthrick';
        }
      }).catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : 'No fue posible abrir el perfil.');
      }).finally(() => {
        if (active) setLoading(false);
      });
    });
    return () => { active = false; };
  }, [slug]);

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#f7f8f4]"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-[#527a6b]" /><p className="mt-4 text-sm text-[#687672]">Abriendo perfil…</p></div></main>;
  if (error || !profile) return <main className="grid min-h-screen place-items-center bg-[#f7f8f4] p-6 text-center"><div><Logo /><h1 className="mt-10 text-3xl font-semibold">Perfil no disponible</h1><p className="mt-3 text-[#687672]">Este enlace no existe o el profesional aún no lo ha publicado.</p><Link to="/" className="nuth-button mt-7">Conocer Nuthrick</Link></div></main>;

  const fee = profile.approximateFee !== undefined ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: profile.currency ?? 'MXN', maximumFractionDigits: 2 }).format(profile.approximateFee) : null;
  const locations = profile.locations ?? profile.business?.locations ?? [];

  return <main className="min-h-screen overflow-x-hidden bg-[#f7f8f4] text-[#17312c]">
    <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-6 sm:px-8"><Logo /><Link to="/register" className="min-w-0 text-right text-sm font-semibold text-[#496e61]">¿Eres nutriólogo? Crea tu perfil</Link></header>
    <div className="mx-auto w-full max-w-7xl min-w-0 px-5 pb-20 pt-8 sm:px-8">
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,400px)]">
      <div className="min-w-0">
      <PublicProfessionalHeader profile={profile}/>
      </div>
      <aside id="agendar" aria-label="Reservar una cita" className="min-w-0 scroll-mt-5 rounded-3xl border border-[#dfe5e1] bg-white p-5 shadow-sm sm:p-6 lg:sticky lg:top-5 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:max-h-[calc(100dvh-2.5rem)] lg:overflow-y-auto">
        <PublicBookingPanel key={slug} slug={slug} compact fee={fee}/>
      </aside>
      <div className="grid min-w-0 gap-6 lg:col-start-1">
        <div className="min-w-0 space-y-6">
          {profile.biography && <section className="nuth-public-card"><p className="nuth-eyebrow">Sobre mí</p><p className="mt-4 whitespace-pre-line text-lg leading-8 text-[#596963]">{profile.biography}</p></section>}
          {profile.specialties.length > 0 && <section className="nuth-public-card"><div className="flex items-center gap-3"><Stethoscope className="text-[#477363]" size={21} /><h2 className="text-xl font-semibold">Especialidades</h2></div><div className="mt-5 flex flex-wrap gap-2">{profile.specialties.map((item) => <span key={item} className="rounded-full bg-[#edf4ef] px-4 py-2 text-sm text-[#3d6657]">{item}</span>)}</div></section>}
          {(profile.conditions.length > 0 || profile.populations.length > 0) && <section className="nuth-public-card"><div className="grid gap-8 sm:grid-cols-2">{profile.conditions.length > 0 && <div><div className="flex items-center gap-2"><Stethoscope size={18} /><h2 className="font-semibold">Condiciones tratadas</h2></div><ul className="mt-4 space-y-2 text-sm text-[#65736e]">{profile.conditions.map((item) => <li key={item}>• {item}</li>)}</ul></div>}{profile.populations.length > 0 && <div><div className="flex items-center gap-2"><UsersRound size={18} /><h2 className="font-semibold">Poblaciones</h2></div><ul className="mt-4 space-y-2 text-sm text-[#65736e]">{profile.populations.map((item) => <li key={item}>• {item}</li>)}</ul></div>}</div></section>}
          {profile.gallery.some((item) => item.url) && <section className="nuth-public-card"><h2 className="text-xl font-semibold">Galería</h2><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">{profile.gallery.filter((item) => item.url).map((item) => <img key={item.path} src={item.url} alt={item.alt ?? 'Servicio profesional'} className="aspect-[4/3] w-full rounded-2xl object-cover" />)}</div></section>}
        </div>
        <aside className="min-w-0 space-y-6">
          {profile.business && Object.values(profile.business).some(Boolean) && <section className="nuth-public-card">{profile.business.logoUrl && <img src={profile.business.logoUrl} alt={`Logotipo de ${profile.business.name ?? 'establecimiento'}`} className="mb-5 h-16 max-w-40 object-contain" />}<div className="flex items-center gap-2"><Building2 size={19} /><h2 className="text-lg font-semibold">Establecimiento</h2></div>{profile.business.name && <p className="mt-4 font-semibold">{profile.business.name}</p>}{profile.business.type && <p className="mt-1 text-sm text-[#6b7974]">{profile.business.type}</p>}{profile.business.address && locations.length === 0 && <p className="mt-4 flex gap-2 text-sm leading-6 text-[#6b7974]"><MapPin className="mt-0.5 shrink-0" size={16} />{profile.business.address}</p>}{locations.length > 0 && <div className="mt-5 space-y-2">{locations.map((location) => <a key={`${location.name}-${location.address}`} href={mapUrl(location)} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-xl bg-[#edf4ef] px-4 py-3 text-sm font-semibold text-[#356454] transition hover:bg-[#e1eee5]"><span className="flex min-w-0 items-center gap-2"><MapPin className="shrink-0" size={17} /><span className="min-w-0"><span className="block truncate">{location.name}</span><span className="mt-0.5 block truncate text-xs font-normal text-[#6b7974]">{location.address}</span></span></span><ExternalLink className="shrink-0" size={15} /></a>)}</div>}</section>}
          {!profile.business && locations.length > 0 && <section className="nuth-public-card"><div className="flex items-center gap-2"><MapPin size={19} /><h2 className="text-lg font-semibold">Ubicaciones</h2></div><div className="mt-5 space-y-2">{locations.map((location) => <a key={`${location.name}-${location.address}`} href={mapUrl(location)} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-xl bg-[#edf4ef] px-4 py-3 text-sm font-semibold text-[#356454]"><span className="flex min-w-0 items-center gap-2"><MapPin className="shrink-0" size={17} /><span className="min-w-0"><span className="block truncate">{location.name}</span><span className="mt-0.5 block truncate text-xs font-normal text-[#6b7974]">{location.address}</span></span></span><ExternalLink className="shrink-0" size={15} /></a>)}</div></section>}
          {profile.education.length > 0 && <section className="nuth-public-card"><div className="flex items-center gap-2"><GraduationCap size={19} /><h2 className="text-lg font-semibold">Educación</h2></div><div className="mt-5 space-y-4">{profile.education.map((item) => <div key={`${item.degree}-${item.graduationYear}`}><p className="text-sm font-semibold">{item.degree}</p>{item.educationType && <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#4c7163]">{educationTypeLabels[item.educationType]}</p>}<p className="mt-1 text-xs text-[#73807b]">{item.institution} · {item.graduationYear}</p></div>)}</div></section>}
          {profile.spokenLanguages.length > 0 && <section className="nuth-public-card"><div className="flex items-center gap-2"><Languages size={19} /><h2 className="text-lg font-semibold">Idiomas</h2></div><p className="mt-3 text-sm text-[#687672]">{profile.spokenLanguages.join(' · ')}</p></section>}
        </aside>
      </div>
      </div>
    </div>
    <footer className="border-t border-[#dde4df] py-8 text-center text-xs text-[#7b8883]">Perfil creado con <Link to="/" className="font-semibold text-[#3f6759]">Nuthrick</Link></footer>
  </main>;
}
