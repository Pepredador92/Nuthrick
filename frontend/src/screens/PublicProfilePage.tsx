import { ArrowDown, Building2, CalendarDays, ExternalLink, GraduationCap, Images, Languages, LoaderCircle, MapPin, Stethoscope, UserRound, UsersRound, type LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PublicBookingPanel } from './PublicBookingPage';
import { PublicProfessionalHeader } from '@/src/features/profile/PublicProfessionalHeader';
import { Logo } from '@/src/components/ui/Logo';
import { getPublicProfile } from '@/src/services/profile';
import { trackPublicProfileVisit } from '@/src/services/siteAnalytics';
import type { PublicProfileContent } from '@/src/types/domain';
import { ShowcaseBackdrop } from '@/src/components/ui/ShowcaseBackdrop';
import './PublicProfilePage.css';

const educationTypeLabels = { degree: 'Grado académico', course: 'Curso', training: 'Capacitación', diploma: 'Diplomado', specialty: 'Especialidad', masters: 'Maestría', doctorate: 'Doctorado' };

function mapUrl(location: { address: string; mapUrl?: string }) {
  return location.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location.address)}`;
}

function CardHeading({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return <div className="public-card-heading">
    <span className="public-card-icon"><Icon size={20} aria-hidden="true" /></span>
    <h2>{title}</h2>
  </div>;
}

function LocationLinks({ locations }: { locations: NonNullable<PublicProfileContent['locations']> }) {
  return <div className="public-location-links">{locations.map(location => <a
    key={`${location.name}-${location.address}`} href={mapUrl(location)} target="_blank" rel="noreferrer"
  >
    <MapPin size={18} aria-hidden="true" />
    <span><strong>{location.name}</strong><span>{location.address}</span></span>
    <ExternalLink size={15} aria-hidden="true" />
  </a>)}</div>;
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
          if (value) void trackPublicProfileVisit(value.slug);
        }
      }).catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : 'No fue posible abrir el perfil.');
      }).finally(() => {
        if (active) setLoading(false);
      });
    });
    return () => { active = false; };
  }, [slug]);

  if (loading || error || !profile) return <main className="public-profile-page public-profile-status">
    <ShowcaseBackdrop />
    <div className="public-profile-card" data-tone="mint">
      {loading ? <div role="status">
        <LoaderCircle className="mx-auto motion-safe:animate-spin" aria-hidden="true" />
        <p className="mt-3">Abriendo perfil…</p>
      </div> : <>
        <Logo />
        <h1 className="mt-6 text-3xl font-semibold">Perfil no disponible</h1>
        <p className="public-profile-muted mt-3">Este enlace no existe o el profesional aún no lo ha publicado.</p>
        <Link to="/" className="public-profile-booking-link mt-6">Conocer Nuthrick</Link>
      </>}
    </div>
  </main>;

  const fee = profile.approximateFee !== undefined ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: profile.currency ?? 'MXN', maximumFractionDigits: 2 }).format(profile.approximateFee) : null;
  const locations = profile.locations ?? profile.business?.locations ?? [];
  const business = profile.business;
  const hasBusinessIdentity = Boolean(business?.logoUrl || business?.name || business?.type);
  const hasBusinessDetails = hasBusinessIdentity || Boolean(business?.address && locations.length === 0);
  const hasLocationSection = hasBusinessDetails || locations.length > 0;
  const gallery = profile.gallery.filter(item => item.url);

  return <main className="public-profile-page">
    <ShowcaseBackdrop />
    <header className="public-profile-topbar">
      <div className="public-profile-topbar-inner">
        <div className="public-profile-brand"><Logo /><span>Perfil público</span></div>
        <Link to="/register" className="public-profile-powered">Impulsado por Nuthrick</Link>
      </div>
    </header>
    <div className="public-profile-container">
      <div className="public-profile-layout">
        <div className="public-profile-intro">
          <PublicProfessionalHeader profile={profile} />
          <nav aria-label="Secciones del perfil" className="public-profile-navigation">
            <a href="#agendar" className="public-profile-booking-link"><CalendarDays size={18} aria-hidden="true" />Reservar una cita<ArrowDown size={16} aria-hidden="true" /></a>
            {profile.biography && <a href="#sobre-mi">Sobre mí</a>}
            {profile.specialties.length > 0 && <a href="#especialidades">Especialidades</a>}
            {(profile.conditions.length > 0 || profile.populations.length > 0) && <a href="#enfoque">Enfoque</a>}
            {gallery.length > 0 && <a href="#galeria">Galería</a>}
            {hasLocationSection && <a href="#ubicaciones">Ubicaciones</a>}
            {profile.education.length > 0 && <a href="#educacion">Formación</a>}
            {profile.spokenLanguages.length > 0 && <a href="#idiomas">Idiomas</a>}
          </nav>
        </div>
        <aside id="agendar" tabIndex={-1} aria-label="Reservar una cita" className="public-profile-booking public-profile-card" data-tone="mint">
          <PublicBookingPanel key={slug} slug={slug} compact fee={fee} />
        </aside>
        <div className="public-profile-details">
          {profile.biography && <section id="sobre-mi" className="public-profile-card" data-tone="blue">
            <CardHeading icon={UserRound} title="Sobre mí" />
            <div className="public-card-body"><p className="public-profile-biography">{profile.biography}</p></div>
          </section>}
          {(profile.specialties.length > 0 || profile.spokenLanguages.length > 0) && <div className="public-profile-pair">
            {profile.specialties.length > 0 && <section id="especialidades" className="public-profile-card" data-tone="mint">
              <CardHeading icon={Stethoscope} title="Especialidades" />
              <div className="public-card-body"><div className="public-profile-tags">{profile.specialties.map(item => <span key={item}>{item}</span>)}</div></div>
            </section>}
            {profile.spokenLanguages.length > 0 && <section id="idiomas" className="public-profile-card" data-tone="violet">
              <CardHeading icon={Languages} title="Idiomas" />
              <div className="public-card-body"><div className="public-profile-tags">{profile.spokenLanguages.map(item => <span key={item}>{item}</span>)}</div></div>
            </section>}
          </div>}
          {(profile.conditions.length > 0 || profile.populations.length > 0) && <section id="enfoque" className="public-profile-card" data-tone="sage">
            <div className="public-profile-pair public-profile-focus">
              {profile.conditions.length > 0 && <div>
                <CardHeading icon={Stethoscope} title="Condiciones tratadas" />
                <div className="public-card-body"><ul className="public-profile-list">{profile.conditions.map(item => <li key={item}>{item}</li>)}</ul></div>
              </div>}
              {profile.populations.length > 0 && <div>
                <CardHeading icon={UsersRound} title="Poblaciones" />
                <div className="public-card-body"><ul className="public-profile-list">{profile.populations.map(item => <li key={item}>{item}</li>)}</ul></div>
              </div>}
            </div>
          </section>}
          {gallery.length > 0 && <section id="galeria" className="public-profile-card" data-tone="violet">
            <CardHeading icon={Images} title="Galería" />
            <div className="public-card-body"><div className="public-profile-gallery">{gallery.map(item => <img key={item.path} src={item.url} alt={item.alt ?? 'Servicio profesional'} loading="lazy" decoding="async" />)}</div></div>
          </section>}
          {hasLocationSection && <section id="ubicaciones" className="public-profile-card" data-tone="amber">
            {hasBusinessDetails ? <CardHeading icon={Building2} title="Establecimiento" /> : <CardHeading icon={MapPin} title="Ubicaciones" />}
            <div className="public-card-body">
              {business && hasBusinessIdentity && <div className="public-business-identity">
                {business.logoUrl && <img src={business.logoUrl} alt={`Logotipo de ${business.name ?? 'establecimiento'}`} />}
                {(business.name || business.type) && <div>{business.name && <p className="font-semibold">{business.name}</p>}{business.type && <p className="public-profile-muted text-sm">{business.type}</p>}</div>}
              </div>}
              {business?.address && locations.length === 0 && <p className="public-profile-muted public-business-address"><MapPin size={17} aria-hidden="true" />{business.address}</p>}
              {locations.length > 0 && <LocationLinks locations={locations} />}
            </div>
          </section>}
          {profile.education.length > 0 && <section id="educacion" className="public-profile-card" data-tone="blue">
            <CardHeading icon={GraduationCap} title="Formación" />
            <div className="public-card-body public-profile-education">{profile.education.map(item => <div key={`${item.degree}-${item.graduationYear}`}>
              <p className="font-semibold">{item.degree}</p>
              {item.educationType && <p className="public-education-type">{educationTypeLabels[item.educationType]}</p>}
              <p className="public-profile-muted mt-2 text-sm">{item.institution} · {item.graduationYear}</p>
            </div>)}</div>
          </section>}
        </div>
      </div>
    </div>
    <footer className="public-profile-footer">Perfil creado con <Link to="/" className="font-semibold">Nuthrick</Link></footer>
  </main>;
}
