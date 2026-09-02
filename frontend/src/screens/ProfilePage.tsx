import { Camera, CheckCircle2, Clipboard, ExternalLink, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorState, LoadingState } from '@/src/components/ui/Status';
import {
  AboutSection,
  AvailabilitySection,
  BusinessSection,
  EducationSection,
  ExtrasSection,
  LinksSection,
  PaymentsSection,
} from '@/src/features/profile/ProfileSections';
import { useProfileWorkspace } from '@/src/hooks/useProfileWorkspace';
import { getSignedMediaUrl, removeProfessionalImage, uploadProfessionalImage } from '@/src/services/media';
import { updateProfile } from '@/src/services/profile';

const tabs = ['Sobre mí', 'Extras', 'Negocio', 'Educación', 'Enlaces', 'Disponibilidad', 'Pagos'] as const;
type Tab = (typeof tabs)[number];

export function ProfilePage() {
  const { workspace, loading, error, reload } = useProfileWorkspace();
  const [activeTab, setActiveTab] = useState<Tab>('Sobre mí');
  const [notice, setNotice] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);

  useEffect(() => { if (workspace) void getSignedMediaUrl(workspace.profile.avatar_path).then(setAvatarUrl); }, [workspace]);
  const saved = async (message: string) => { setNotice(message); await reload(); window.setTimeout(() => setNotice(''), 3500); };
  const uploadAvatar = async (file?: File) => {
    if (!file || !workspace) return;
    setUploading(true);
    let path = '';
    try {
      const oldPath = workspace.profile.avatar_path;
      path = await uploadProfessionalImage(file, workspace.profile.storage_key, 'avatar');
      await updateProfile(workspace.profile.id, { avatar_path: path });
      if (oldPath) await removeProfessionalImage(oldPath).catch(() => undefined);
      await saved('Tu foto de perfil quedó actualizada.');
    } catch (caught) {
      if (path) await removeProfessionalImage(path).catch(() => undefined);
      setNotice(caught instanceof Error ? caught.message : 'No fue posible subir la foto.');
    } finally { setUploading(false); }
  };

  if (loading && !workspace) return <LoadingState label="Cargando tu perfil…" />;
  if (error || !workspace) return <ErrorState message={error || 'No encontramos tu perfil.'} onRetry={() => void reload()} />;
  const p = workspace.profile;
  const publicUrl = p.public_slug ? `${window.location.origin}/p/${p.public_slug}` : '';
  const section = {
    'Sobre mí': <AboutSection workspace={workspace} onSaved={saved} />,
    Extras: <ExtrasSection workspace={workspace} onSaved={saved} />,
    Negocio: <BusinessSection workspace={workspace} onSaved={saved} />,
    Educación: <EducationSection workspace={workspace} onSaved={saved} />,
    Enlaces: <LinksSection workspace={workspace} onSaved={saved} />,
    Disponibilidad: <AvailabilitySection workspace={workspace} onSaved={saved} />,
    Pagos: <PaymentsSection />,
  }[activeTab];

  return <div><div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between"><div><p className="nuth-eyebrow">Perfil profesional</p><h1 className="mt-3 text-4xl font-semibold tracking-[-.04em]">Haz que tu perfil hable por ti</h1><p className="mt-3 text-[#687672]">Administra tus datos privados y lo que deseas mostrar públicamente.</p></div><div className="flex flex-wrap gap-3">{p.public_slug && <Link to={`/p/${p.public_slug}`} target="_blank" className="nuth-button-secondary">Ver mi página <ExternalLink size={16} /></Link>}<button type="button" disabled={!publicUrl} onClick={() => { void navigator.clipboard.writeText(publicUrl); setNotice('Enlace copiado.'); }} className="nuth-button-secondary"><Clipboard size={16} />Copiar enlace</button></div></div>{notice && <div role="status" className="fixed right-5 top-24 z-50 flex max-w-sm items-center gap-2 rounded-2xl bg-[#173d36] px-4 py-3 text-sm text-white shadow-2xl"><CheckCircle2 size={17} />{notice}</div>}<section className="mt-9 rounded-[28px] border border-[#dfe5e1] bg-white p-6 shadow-sm sm:p-8"><div className="flex flex-col gap-6 sm:flex-row sm:items-center"><button type="button" onClick={() => avatarInput.current?.click()} className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-[26px] bg-[#e9b676]" aria-label="Cambiar foto de perfil">{avatarUrl ? <img src={avatarUrl} alt={`Foto de ${p.full_name}`} className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-2xl font-semibold">{p.full_name.split(/\s+/).map((part) => part[0]).slice(0,2).join('')}</span>}<span className="absolute inset-0 grid place-items-center bg-[#173d36]/70 text-white opacity-0 transition group-hover:opacity-100">{uploading ? <LoaderCircle className="animate-spin" /> : <Camera size={20} />}</span></button><input ref={avatarInput} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" onChange={(event) => void uploadAvatar(event.target.files?.[0])} /><div className="min-w-0 flex-1"><p className="truncate text-2xl font-semibold">{p.full_name}</p><p className="mt-1 text-[#74817d]">{p.professional_title || 'Añade tu título profesional'}</p><div className="mt-3 flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-[#f1f4f0] px-3 py-1">{p.language.toUpperCase()}</span><span className="rounded-full bg-[#f1f4f0] px-3 py-1">{p.country || 'Sin país'}</span><span className={`rounded-full px-3 py-1 ${p.is_public ? 'bg-[#e8f2ec] text-[#39705d]' : 'bg-[#f2f3f1] text-[#7a8782]'}`}>{p.is_public ? 'Perfil público' : 'Perfil privado'}</span></div></div></div></section><div className="mt-7 overflow-x-auto"><div className="flex min-w-max gap-2 border-b border-[#dce3de]">{tabs.map((tab) => <button key={tab} type="button" onClick={() => setActiveTab(tab)} className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${activeTab === tab ? 'border-[#c77d3c] text-[#173d36]' : 'border-transparent text-[#7a8782] hover:text-[#42554e]'}`}>{tab}{tab === 'Pagos' && <span className="ml-2 rounded-full bg-[#f2eadb] px-2 py-0.5 text-[9px] text-[#8e692f]">Pronto</span>}</button>)}</div></div><section className="mt-7 rounded-[28px] border border-[#dfe5e1] bg-white p-6 shadow-sm sm:p-8 lg:p-10">{section}</section></div>;
}
