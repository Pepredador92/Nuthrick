import { publicUrl as productUrl } from '@/src/lib/site';
import { ArrowLeft, ArrowRight, Building2, CalendarDays, Camera, ChevronRight, Clipboard, CreditCard, ExternalLink, GraduationCap, Info, Link2, LoaderCircle, MonitorCog, Sparkles, UserRound } from 'lucide-react';
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
  { label: 'Sobre mí', detail: 'Datos, presentación y contacto', icon: UserRound, tone: 'teal' },
  { label: 'Negocio', detail: 'Establecimiento y consultorios', icon: Building2, tone: 'violet' },
  { label: 'Disponibilidad', detail: 'Horarios y reservas', icon: CalendarDays, tone: 'amber' },
  { label: 'Extras', detail: 'Galería, condiciones y poblaciones', icon: Sparkles, tone: 'sage' },
  { label: 'Educación', detail: 'Formación profesional', icon: GraduationCap, tone: 'violet' },
  { label: 'Enlaces', detail: 'Página pública y redes', icon: Link2, tone: 'teal' },
  { label: 'Equipos', detail: 'Bioimpedancia', icon: MonitorCog, tone: 'blue' },
  { label: 'Pagos', detail: 'Próximamente', icon: CreditCard, tone: 'amber' },
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
  const sectionHeading = useRef<HTMLHeadingElement>(null);

  function openSection(label: Tab, focusHeading = false) {
    setActiveTab(label);
    if (focusHeading) requestAnimationFrame(() => {
      sectionHeading.current?.focus({ preventScroll: true });
      sectionHeading.current?.scrollIntoView?.({ block: 'start' });
    });
  }

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
  const activeIndex = Math.max(0, profileSections.findIndex(item => item.label === activeTab));
  const currentSection = profileSections[activeIndex];
  const previousSection = profileSections[activeIndex - 1];
  const nextSection = profileSections[activeIndex + 1];
  const ActiveIcon = currentSection.icon;
  const section = {
    'Sobre mí': <div className="profile-section-stack"><AboutSection workspace={workspace} onSaved={saved} /><ContactsSection workspace={workspace} onSaved={saved} /></div>,
    Extras: <ExtrasSection workspace={workspace} onSaved={saved} />,
    Negocio: <BusinessSection workspace={workspace} onSaved={saved} />,
    Educación: <EducationSection workspace={workspace} onSaved={saved} />,
    Enlaces: <LinksSection workspace={workspace} onSaved={saved} />,
    Disponibilidad: <AvailabilitySection workspace={workspace} onSaved={saved} />,
    Equipos: <BioimpedanceDevicesSection onSaved={saved} />,
    Pagos: <PaymentsSection />,
  }[currentSection.label];

  return (
    <div className="profile-workspace">
      <header className="profile-heading">
        <div>
          <h1>Perfil profesional</h1>
          <p>Edita tu presentación y configura tus servicios, horarios y reservas.</p>
        </div>
        <div className="profile-heading-actions">
          {p.public_slug && p.is_public && <Link to={`/p/${p.public_slug}`} target="_blank" rel="noreferrer" className="profile-button profile-button-primary"><ExternalLink size={16} aria-hidden="true" />Ver mi página</Link>}
          <button type="button" disabled={!publicUrl} onClick={async () => {
            try {
              await navigator.clipboard.writeText(publicUrl);
              setNotice('Enlace copiado.');
            } catch { setNotice('No pudimos copiar el enlace.'); }
          }} className="profile-button"><Clipboard size={16} aria-hidden="true" />Copiar enlace</button>
        </div>
      </header>

      {notice && <div role="status" className="profile-notice"><Info size={17} aria-hidden="true" />{notice}</div>}

      <section className="profile-identity-card" aria-label="Identidad profesional">
        <div className="profile-avatar-wrap">
          <button type="button" disabled={uploading} onClick={() => avatarInput.current?.click()} className="profile-avatar" aria-label="Cambiar foto de perfil">
            {avatarUrl ? <img src={avatarUrl} alt="" className="profile-avatar-image" /> : <span className="profile-avatar-initials" aria-hidden="true">{p.full_name.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('')}</span>}
            <span className="profile-avatar-camera" aria-hidden="true">{uploading ? <LoaderCircle className="animate-spin" size={16} /> : <Camera size={16} />}</span>
          </button>
          <input ref={avatarInput} type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) { const validationError = validateImage(file); if (validationError) setNotice(validationError); else setCropFile(file); } }} />
        </div>
        <div className="profile-identity-details">
          <h2>{p.full_name}</h2>
          <p>{p.professional_title || 'Añade tu título profesional'}</p>
          <div className="profile-badges"><span className={p.is_public ? 'is-public' : ''}>{p.is_public ? 'Perfil público' : 'Perfil privado'}</span><span>{p.language.toUpperCase()}</span><span>{p.country || 'Sin país'}</span></div>
        </div>
      </section>

      <div className="profile-layout">
        <nav className="profile-section-nav" aria-label="Secciones del perfil">
          <h2 className="profile-nav-title">Secciones</h2>
          <div className="profile-nav-options">
            {profileSections.map(({ label, detail, icon: Icon, tone }) => (
              <button key={label} type="button" aria-current={currentSection.label === label ? 'step' : undefined} onClick={() => openSection(label)} className="profile-section-choice" data-tone={tone}>
                <span className="profile-section-icon"><Icon size={17} aria-hidden="true" /></span>
                <span className="profile-section-choice-copy"><strong>{label}</strong><small>{detail}</small></span>
                <ChevronRight size={14} className="profile-section-arrow" aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="profile-nav-select">
            <label htmlFor="profile-section-picker">Ir a una sección</label>
            <select id="profile-section-picker" className="nuth-input" value={currentSection.label} onChange={event => openSection(event.target.value as Tab, true)}>
              {profileSections.map(({ label }) => <option key={label} value={label}>{label}</option>)}
            </select>
          </div>
        </nav>

        <section className="profile-content-card" aria-labelledby="profile-active-title">
          <header className="profile-content-heading" data-tone={currentSection.tone}>
            <span className="profile-section-icon"><ActiveIcon size={22} aria-hidden="true" /></span>
            <div>
              <span className="profile-eyebrow">Sección {activeIndex + 1} de {profileSections.length}</span>
              <h2 id="profile-active-title" ref={sectionHeading} tabIndex={-1}>{currentSection.label}</h2>
              <p>{currentSection.detail}</p>
            </div>
          </header>
          <div className="profile-content-body">{section}</div>
          <footer className="profile-content-footer">
            {previousSection && <button type="button" className="profile-button profile-previous" onClick={() => openSection(previousSection.label, true)}><ArrowLeft size={16} aria-hidden="true" />Anterior: {previousSection.label}</button>}
            {nextSection && <button type="button" className="profile-button profile-next" onClick={() => openSection(nextSection.label, true)}>Siguiente: {nextSection.label}<ArrowRight size={16} aria-hidden="true" /></button>}
          </footer>
        </section>
      </div>

      {cropFile && <ImageCropper key={`${cropFile.name}-${cropFile.lastModified}`} file={cropFile} onCancel={() => setCropFile(null)} onConfirm={async (cropped) => { const success = await uploadAvatar(cropped); if (success) setCropFile(null); return success; }} />}
    </div>
  );
}
