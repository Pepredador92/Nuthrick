import { publicUrl as productUrl } from '@/src/lib/site';
import { ArrowRight, Building2, CalendarDays, Camera, CheckCircle2, Clipboard, CreditCard, ExternalLink, GraduationCap, Link2, LoaderCircle, MonitorCog, Sparkles, UserRound } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorState, LoadingState } from '@/src/components/ui/Status';
import { ImageCropper } from '@/src/components/ui/ImageCropper';
import {
  AboutSection,
  AvailabilitySection,
  BusinessSection,
  ContactsSection,
  EducationSection,
  ExtrasSection,
  LinksSection,
  PaymentsSection,
} from '@/src/features/profile/ProfileSections';
import { useProfileWorkspace } from '@/src/hooks/useProfileWorkspace';
import { usePersistentState } from '@/src/hooks/usePersistentState';
import { getSignedMediaUrl, removeProfessionalImage, uploadProfessionalImage } from '@/src/services/media';
import { updateProfile } from '@/src/services/profile';
import { useAuth } from '@/src/features/auth/AuthProvider';
import { validateImage } from '@/src/lib/validation';
import { BioimpedanceDevicesSection } from '@/src/features/bioimpedance/BioimpedanceDevicesSection';
import './ProfilePage.css';

const profileSections = [
  { label: 'Sobre mí', detail: 'Datos, presentación y contacto', icon: UserRound },
  { label: 'Negocio', detail: 'Servicios y consultorios', icon: Building2 },
  { label: 'Disponibilidad', detail: 'Horarios y reservas', icon: CalendarDays },
  { label: 'Extras', detail: 'Imágenes y contenido', icon: Sparkles },
  { label: 'Educación', detail: 'Formación profesional', icon: GraduationCap },
  { label: 'Enlaces', detail: 'Página pública y redes', icon: Link2 },
  { label: 'Equipos', detail: 'Bioimpedancia', icon: MonitorCog },
  { label: 'Pagos', detail: 'Próximamente', icon: CreditCard },
] as const;
type Tab = (typeof profileSections)[number]['label'];

export function ProfilePage() {
  const { user } = useAuth();
  const { workspace, loading, error, reload } = useProfileWorkspace();
  const [activeTab, setActiveTab] = usePersistentState<Tab>(`nuthrick:${user?.id ?? 'anonymous'}:profile-tab`, 'Sobre mí');
  const [notice, setNotice] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);

  useEffect(() => { if (workspace) void getSignedMediaUrl(workspace.profile.avatar_path).then(setAvatarUrl); }, [workspace]);
  const saved = async (message: string) => { setNotice(message); await reload(); window.setTimeout(() => setNotice(''), 3500); };
  const uploadAvatar = async (file?: File): Promise<boolean> => {
    if (!file || !workspace) return false;
    const validationError = validateImage(file);
    if (validationError) { setNotice(validationError); return false; }
    setUploading(true);
    let path = '';
    try {
      const oldPath = workspace.profile.avatar_path;
      path = await uploadProfessionalImage(file, workspace.profile.storage_key, 'avatar');
      await updateProfile(workspace.profile.id, { avatar_path: path });
      setAvatarUrl(await getSignedMediaUrl(path));
      if (oldPath) await removeProfessionalImage(oldPath).catch(() => undefined);
      await saved('Tu foto de perfil quedó actualizada.');
      return true;
    } catch (caught) {
      if (path) await removeProfessionalImage(path).catch(() => undefined);
      setNotice(caught instanceof Error ? caught.message : 'No fue posible subir la foto.');
      return false;
    } finally { setUploading(false); }
  };

  if (loading && !workspace) return <LoadingState label="Cargando tu perfil…" />;
  if (error || !workspace) return <ErrorState message={error || 'No encontramos tu perfil.'} onRetry={() => void reload()} />;
  const p = workspace.profile;
  const publicUrl = p.public_slug ? productUrl(`/p/${p.public_slug}`) : '';
  const section = {
    'Sobre mí': <div className="space-y-10"><AboutSection workspace={workspace} onSaved={saved} /><ContactsSection workspace={workspace} onSaved={saved} /></div>,
    Extras: <ExtrasSection workspace={workspace} onSaved={saved} />,
    Negocio: <BusinessSection workspace={workspace} onSaved={saved} />,
    Educación: <EducationSection workspace={workspace} onSaved={saved} />,
    Enlaces: <LinksSection workspace={workspace} onSaved={saved} />,
    Disponibilidad: <AvailabilitySection workspace={workspace} onSaved={saved} />,
    Equipos: <BioimpedanceDevicesSection onSaved={saved} />,
    Pagos: <PaymentsSection />,
  }[activeTab];

  const activeIndex = profileSections.findIndex((item) => item.label === activeTab);
  const nextSection = profileSections[activeIndex + 1];

  return (
    <div className="profile-workspace">
      <header className="profile-heading">
        <div>
          <p className="nuth-eyebrow">Perfil profesional</p>
          <h1>Haz que tu perfil hable por ti</h1>
          <p>Completa tu presencia pública y configura cómo pueden encontrarte y reservar.</p>
        </div>
        <div className="profile-heading-actions">
          {p.public_slug && p.is_public && <Link to={`/p/${p.public_slug}`} target="_blank" className="profile-button"><ExternalLink size={16} />Ver mi página</Link>}
          <button type="button" disabled={!publicUrl} onClick={() => { void navigator.clipboard.writeText(publicUrl); setNotice('Enlace copiado.'); }} className="profile-button"><Clipboard size={16} />Copiar enlace</button>
        </div>
      </header>

      {notice && <div role="status" className="fixed right-5 top-24 z-50 flex max-w-sm items-center gap-2 rounded-2xl bg-[#173d36] px-4 py-3 text-sm text-white shadow-2xl"><CheckCircle2 size={17} />{notice}</div>}

      <section className="profile-identity-card" aria-label="Identidad profesional">
        <div className="profile-avatar-wrap">
          <button type="button" onClick={() => avatarInput.current?.click()} className="profile-avatar group" aria-label="Cambiar foto de perfil">
            {avatarUrl ? <img src={avatarUrl} alt={`Foto de ${p.full_name}`} className="h-full w-full object-cover object-center" /> : <span className="grid h-full place-items-center text-2xl font-semibold">{p.full_name.split(/\s+/).map((part) => part[0]).slice(0,2).join('')}</span>}
            <span className="absolute inset-0 grid place-items-center bg-[#173d36]/70 text-white opacity-0 transition group-hover:opacity-100">{uploading ? <LoaderCircle className="animate-spin" /> : <Camera size={20} />}</span>
          </button>
          <input ref={avatarInput} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) { const validationError = validateImage(file); if (validationError) setNotice(validationError); else setCropFile(file); } }} />
        </div>
        <div className="profile-identity-details">
          <span className="profile-eyebrow">Tu presentación</span>
          <h2>{p.full_name}</h2>
          <p>{p.professional_title || 'Añade tu título profesional'}</p>
          <div className="profile-badges"><span>{p.language.toUpperCase()}</span><span>{p.country || 'Sin país'}</span><span className={p.is_public ? 'is-public' : ''}>{p.is_public ? 'Perfil público' : 'Perfil privado'}</span></div>
        </div>
        <div className="profile-identity-hint">Toca tu foto para actualizarla. El encuadre cuadrado se usa en todo tu perfil.</div>
      </section>

      <div className="profile-section-intro"><div><span className="profile-eyebrow">Configura tu consulta</span><h2>Elige qué quieres actualizar</h2></div><p>Trabaja una sección a la vez. Tus acciones de guardado están dentro de cada tarjeta.</p></div>
      <nav className="profile-section-nav" aria-label="Secciones del perfil">
        {profileSections.map(({ label, detail, icon: Icon }, index) => (
          <button key={label} type="button" aria-current={activeTab === label ? 'step' : undefined} onClick={() => setActiveTab(label)} className={`profile-section-choice${activeTab === label ? ' is-active' : ''}`}>
            <span className="profile-section-icon"><Icon size={18} /></span>
            <span className="profile-section-choice-copy"><small>{String(index + 1).padStart(2, '0')}</small><strong>{label}</strong><em>{detail}</em></span>
            <ArrowRight size={15} className="profile-section-arrow" />
          </button>
        ))}
      </nav>

      <section className="profile-content-card" aria-labelledby="profile-active-title">
        <header className="profile-content-heading"><div><span className="profile-eyebrow">Sección {activeIndex + 1} de {profileSections.length}</span><h2 id="profile-active-title">{activeTab}</h2><p>{profileSections[activeIndex].detail}</p></div>{nextSection && <button type="button" className="profile-next profile-next-top" onClick={() => setActiveTab(nextSection.label)}>Siguiente: {nextSection.label}<ArrowRight size={16} /></button>}</header>
        <div className="profile-content-body">{section}</div>
        {nextSection && <footer className="profile-content-footer"><span>Al terminar esta sección, continúa con {nextSection.label}.</span><button type="button" className="profile-next" onClick={() => setActiveTab(nextSection.label)}>Siguiente: {nextSection.label}<ArrowRight size={16} /></button></footer>}
      </section>

      {cropFile && <ImageCropper key={`${cropFile.name}-${cropFile.lastModified}`} file={cropFile} onCancel={() => setCropFile(null)} onConfirm={async (cropped) => { const success = await uploadAvatar(cropped); if (success) setCropFile(null); return success; }} />}
    </div>
  );
}
