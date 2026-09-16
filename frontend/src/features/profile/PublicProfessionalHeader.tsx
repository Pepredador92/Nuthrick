import { BadgeCheck, Globe, Mail, MapPin, MessageCircle, Music2 } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import type { PublicProfileContent } from '@/src/types/domain';

type HeaderProfile = Pick<PublicProfileContent, 'name' | 'avatarUrl' | 'professionalTitle' | 'licenseNumber' | 'country' | 'careModalities' | 'contacts' | 'links'>;
type IconProps = Pick<SVGProps<SVGSVGElement>, 'className' | 'aria-hidden'> & { size?: number };
type ContactLink = { href: string; label: string; icon: ComponentType<IconProps>; whatsapp: boolean };
function Instagram({ size = 18, ...props }: IconProps) { return <svg {...props} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>; }
function Facebook({ size = 18, ...props }: IconProps) { return <svg {...props} width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M14 22v-9h3l.5-4H14V6.5c0-1 .4-1.5 1.7-1.5H18V1h-3c-3.3 0-5 2-5 5v3H7v4h3v9z"/></svg>; }
function Youtube({ size = 18, ...props }: IconProps) { return <svg {...props} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none"/></svg>; }
const modalities = { online: 'En línea', in_person: 'Presencial', hybrid: 'Híbrida' };
const icons = { whatsapp: MessageCircle, instagram: Instagram, facebook: Facebook, tiktok: Music2, youtube: Youtube, custom: Globe };

/** Only already-public contacts/links reach this presentation component. */
function contactLinks(profile: HeaderProfile): ContactLink[] {
  const contacts = (profile.contacts || []).map(contact => {
    const whatsapp = contact.type === 'phone';
    return {
      href: whatsapp ? `https://wa.me/${(contact.countryCode || '').replace(/\D/g, '')}${contact.value.replace(/\D/g, '')}` : `mailto:${encodeURIComponent(contact.value)}`,
      label: whatsapp ? `WhatsApp${contact.label ? ` · ${contact.label}` : ''}` : contact.label || 'Correo electrónico',
      icon: whatsapp ? MessageCircle : Mail,
      whatsapp,
    };
  });
  const links = profile.links.flatMap(link => {
    // Preserve custom destinations, but never turn executable schemes into links.
    try { if (!['https:', 'http:'].includes(new URL(link.url).protocol)) return []; } catch { return []; }
    return [{ href: link.url, label: link.title, icon: icons[link.type] || Globe, whatsapp: link.type === 'whatsapp' }];
  });
  const seen = new Set<string>();
  return [...contacts, ...links].filter(link => {
    const key = link.href.replace(/\/$/, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function PublicProfessionalHeader({ profile }: { profile: HeaderProfile }) {
  const links = contactLinks(profile);
  return <section aria-label="Presentación profesional" className="min-w-0 overflow-hidden rounded-[32px] border border-[#dce5de] bg-white shadow-[0_10px_35px_-24px_rgba(23,61,54,0.35)]">
    <div className="relative isolate overflow-hidden bg-[linear-gradient(135deg,#214e43_0%,#173d36_65%,#12332e_100%)] px-5 py-8 text-center text-white sm:px-8 sm:py-9">
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-32 -z-10 size-80 rounded-full border-[48px] border-white/[0.035]"/>
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-36 -left-24 -z-10 size-72 rounded-full border-[40px] border-[#efbd6b]/[0.035]"/>
      <p className="text-[10px] font-bold uppercase tracking-[.22em] text-[#efc583]">Perfil profesional</p>
      <div className="mx-auto mt-5 grid size-24 shrink-0 place-items-center overflow-hidden rounded-full bg-[#e4b272] text-3xl font-semibold text-[#17312c] shadow-lg ring-4 ring-white/15 ring-offset-4 ring-offset-[#21483e] sm:size-28">
        {profile.avatarUrl ? <img src={profile.avatarUrl} alt={`Foto de ${profile.name}`} className="size-full object-cover"/> : profile.name.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('')}
      </div>
      <h1 className="mx-auto mt-5 max-w-lg break-words text-3xl font-semibold leading-tight tracking-[-.035em] sm:text-4xl">{profile.name}</h1>
      {profile.professionalTitle && <p className="mx-auto mt-2 max-w-lg break-words text-base text-white/80">{profile.professionalTitle}</p>}
      {profile.licenseNumber && <p className="mt-3 flex min-w-0 items-center justify-center gap-1.5 text-xs text-white/65"><BadgeCheck size={14} className="shrink-0" aria-hidden="true"/><span className="min-w-0 break-words">Cédula profesional: {profile.licenseNumber}</span></p>}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        {profile.careModalities.map(item => <span key={item} className="rounded-full border border-white/10 bg-white/[0.08] px-3 py-1.5 text-xs text-white/85">{modalities[item]}</span>)}
        {profile.country && <span className="inline-flex max-w-full items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/[0.08] px-3 py-1.5 text-xs text-white/85"><MapPin size={12} className="shrink-0" aria-hidden="true"/><span className="min-w-0 break-words">{profile.country}</span></span>}
      </div>
    </div>
    {links.length > 0 && <nav aria-label="Contacto y redes sociales" className="flex flex-wrap items-center justify-center gap-2.5 px-4 py-5 sm:px-6">
      {links.map(({ href, label, icon: Icon, whatsapp }) => <a key={href} href={href} target={href.startsWith('mailto:') ? undefined : '_blank'} rel={href.startsWith('mailto:') ? undefined : 'noopener noreferrer'}
        className={`inline-flex min-h-11 min-w-0 max-w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-center text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#356454] ${whatsapp ? 'bg-[#16834c] text-white shadow-sm hover:bg-[#116b3d]' : 'border border-[#dce5de] bg-[#f8faf7] text-[#356454] hover:border-[#9cb9aa] hover:bg-[#edf4ef]'}`}>
        <Icon size={18} className="shrink-0" aria-hidden="true"/><span className="min-w-0 break-words [overflow-wrap:anywhere]">{label}</span>
      </a>)}
    </nav>}
  </section>;
}
