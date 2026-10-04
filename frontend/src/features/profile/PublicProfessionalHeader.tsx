import { BadgeCheck, Globe, Mail, MapPin, MessageCircle, Music2 } from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import type { PublicProfileContent } from '@/src/types/domain';
import './PublicProfessionalHeader.css';

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
  return <section aria-label="Presentación profesional" className="public-professional-card">
    <div className="public-professional-identity">
      <div aria-hidden="true" className="public-professional-orbit"/>
      <p className="public-professional-eyebrow">Perfil profesional</p>
      <div className="public-professional-portrait">
        {profile.avatarUrl ? <img src={profile.avatarUrl} alt={`Foto de ${profile.name}`} className="size-full object-cover"/> : <span className="public-professional-initials">{profile.name.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('')}</span>}
      </div>
      <h1>{profile.name}</h1>
      {profile.professionalTitle && <p className="public-professional-title">{profile.professionalTitle}</p>}
      {profile.licenseNumber && <p className="public-professional-license"><BadgeCheck size={14} aria-hidden="true"/><span>Cédula profesional: {profile.licenseNumber}</span></p>}
      <div className="public-professional-badges">
        {profile.careModalities.map(item => <span key={item}>{modalities[item]}</span>)}
        {profile.country && <span><MapPin size={12} aria-hidden="true"/>{profile.country}</span>}
      </div>
    </div>
    {links.length > 0 && <nav aria-label="Contacto y redes sociales" className="public-professional-contacts">
      {links.map(({ href, label, icon: Icon, whatsapp }) => <a key={href} href={href} target={href.startsWith('mailto:') ? undefined : '_blank'} rel={href.startsWith('mailto:') ? undefined : 'noopener noreferrer'}
        className={`public-professional-contact${whatsapp ? ' is-whatsapp' : ''}`}>
        <Icon size={18} className="shrink-0" aria-hidden="true"/><span className="min-w-0 break-words [overflow-wrap:anywhere]">{label}</span>
      </a>)}
    </nav>}
  </section>;
}
