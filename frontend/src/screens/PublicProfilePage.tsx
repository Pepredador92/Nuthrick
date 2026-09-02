import { BadgeCheck, Building2, CalendarDays, ExternalLink, GraduationCap, Languages, LoaderCircle, Mail, MapPin, MessageCircle, Stethoscope, UsersRound, WalletCards } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Logo } from '@/src/components/ui/Logo';
import { getPublicProfile } from '@/src/services/profile';
import type { PublicProfileContent } from '@/src/types/domain';

const modalityLabels = { online: 'En línea', in_person: 'Presencial', hybrid: 'Híbrida' };
const weekdayLabels = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const educationTypeLabels = { degree: 'Grado académico', course: 'Curso', training: 'Capacitación', diploma: 'Diplomado', specialty: 'Especialidad', masters: 'Maestría', doctorate: 'Doctorado' };

function whatsappUrl(contact: { countryCode?: string; value: string }) {
  const countryCode = (contact.countryCode ?? '').replace(/\D/g, '');
  const number = contact.value.replace(/\D/g, '');
  return `https://wa.me/${countryCode}${number}`;
}

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

  const modalities = profile.careModalities.map((item) => modalityLabels[item]);
  const groupedSlots = profile.availability?.weeklySlots.reduce<Record<number, Array<{ startTime: string; endTime: string }>>>((groups, slot) => ({ ...groups, [slot.weekday]: [...(groups[slot.weekday] ?? []), slot] }), {}) ?? {};
  const fee = profile.approximateFee !== undefined ? new Intl.NumberFormat('es-MX', { style: 'currency', currency: profile.currency ?? 'MXN', maximumFractionDigits: 2 }).format(profile.approximateFee) : null;
  const contacts = profile.contacts ?? [];
  const locations = profile.locations ?? profile.business?.locations ?? [];

  return <main className="min-h-screen overflow-x-hidden bg-[#f7f8f4] text-[#17312c]">
    <header className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 sm:px-8"><Logo /><Link to="/register" className="min-w-0 text-right text-sm font-semibold text-[#496e61]">¿Eres nutriólogo? Crea tu perfil</Link></header>
    <div className="mx-auto w-full max-w-6xl min-w-0 px-5 pb-20 pt-8 sm:px-8">
      <section className="relative max-w-full overflow-hidden rounded-[36px] bg-[#173d36] px-6 py-12 text-white sm:px-12 sm:py-16"><div className="absolute -right-20 -top-20 h-80 w-80 rounded-full border-[70px] border-white/5" /><div className="relative flex min-w-0 flex-col gap-8 md:flex-row md:items-center"><div className="grid h-32 w-32 shrink-0 place-items-center overflow-hidden rounded-[32px] bg-[#e4b272] text-4xl font-semibold text-[#17312c] shadow-xl">{profile.avatarUrl ? <img src={profile.avatarUrl} alt={`Foto de ${profile.name}`} className="h-full w-full object-cover" /> : profile.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('')}</div><div className="min-w-0"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#efbd6b]">Perfil profesional</p><h1 className="mt-3 break-words text-4xl font-semibold tracking-[-.04em] sm:text-5xl">{profile.name}</h1>{profile.professionalTitle && <p className="mt-3 break-words text-lg text-white/65">{profile.professionalTitle}</p>}{profile.licenseNumber && <p className="mt-2 flex min-w-0 gap-2 text-sm text-white/60"><BadgeCheck className="shrink-0" size={15} /><span className="min-w-0 break-words">Cédula profesional: {profile.licenseNumber}</span></p>}<div className="mt-5 flex flex-wrap gap-2">{modalities.map((item) => <span key={item} className="rounded-full bg-white/10 px-3 py-1.5 text-xs">{item}</span>)}{profile.country && <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs"><MapPin size={12} />{profile.country}</span>}</div></div></div></section>
      {contacts.length > 0 || profile.availability ? <section className="mt-5 rounded-3xl border border-[#dfe5e1] bg-white p-4 shadow-sm sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap"><div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap">{contacts.map((contact) => contact.type === 'phone' ? <a key={`top-${contact.type}-${contact.value}`} href={whatsappUrl(contact)} target="_blank" rel="noreferrer" className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1fb857] sm:w-auto"><MessageCircle size={20} />WhatsApp{contact.label ? ` · ${contact.label}` : ''}</a> : <a key={`top-${contact.type}-${contact.value}`} href={`mailto:${encodeURIComponent(contact.value)}`} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#edf4ef] px-4 py-3 text-sm font-semibold text-[#356454] transition hover:bg-[#e1eee5] sm:w-auto"><Mail size={19} />{contact.label || 'Correo electrónico'}</a>)}</div><button type="button" disabled className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#e4e8e5] px-5 py-3 text-sm font-semibold text-[#7c8984] sm:w-auto"><CalendarDays size={19} />Agendar cita <span className="text-xs font-normal">(próximamente)</span></button></div></section> : null}
      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)]">
        <div className="min-w-0 space-y-6">
          {profile.biography && <section className="nuth-public-card"><p className="nuth-eyebrow">Sobre mí</p><p className="mt-4 whitespace-pre-line text-lg leading-8 text-[#596963]">{profile.biography}</p></section>}
          {profile.specialties.length > 0 && <section className="nuth-public-card"><div className="flex items-center gap-3"><Stethoscope className="text-[#477363]" size={21} /><h2 className="text-xl font-semibold">Especialidades</h2></div><div className="mt-5 flex flex-wrap gap-2">{profile.specialties.map((item) => <span key={item} className="rounded-full bg-[#edf4ef] px-4 py-2 text-sm text-[#3d6657]">{item}</span>)}</div></section>}
          {(profile.conditions.length > 0 || profile.populations.length > 0) && <section className="nuth-public-card"><div className="grid gap-8 sm:grid-cols-2">{profile.conditions.length > 0 && <div><div className="flex items-center gap-2"><Stethoscope size={18} /><h2 className="font-semibold">Condiciones tratadas</h2></div><ul className="mt-4 space-y-2 text-sm text-[#65736e]">{profile.conditions.map((item) => <li key={item}>• {item}</li>)}</ul></div>}{profile.populations.length > 0 && <div><div className="flex items-center gap-2"><UsersRound size={18} /><h2 className="font-semibold">Poblaciones</h2></div><ul className="mt-4 space-y-2 text-sm text-[#65736e]">{profile.populations.map((item) => <li key={item}>• {item}</li>)}</ul></div>}</div></section>}
          {profile.gallery.some((item) => item.url) && <section className="nuth-public-card"><h2 className="text-xl font-semibold">Galería</h2><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">{profile.gallery.filter((item) => item.url).map((item) => <img key={item.path} src={item.url} alt={item.alt ?? 'Servicio profesional'} className="aspect-[4/3] w-full rounded-2xl object-cover" />)}</div></section>}
        </div>
        <aside className="min-w-0 space-y-6">
          {fee && <section className="nuth-public-card"><div className="flex items-center gap-2"><WalletCards size={19} /><h2 className="text-lg font-semibold">Consulta</h2></div><p className="mt-4 text-sm text-[#687672]">Costo aproximado</p><p className="mt-1 text-2xl font-semibold">{fee}</p></section>}
          {profile.business && Object.values(profile.business).some(Boolean) && <section className="nuth-public-card">{profile.business.logoUrl && <img src={profile.business.logoUrl} alt={`Logotipo de ${profile.business.name ?? 'establecimiento'}`} className="mb-5 h-16 max-w-40 object-contain" />}<div className="flex items-center gap-2"><Building2 size={19} /><h2 className="text-lg font-semibold">Establecimiento</h2></div>{profile.business.name && <p className="mt-4 font-semibold">{profile.business.name}</p>}{profile.business.type && <p className="mt-1 text-sm text-[#6b7974]">{profile.business.type}</p>}{profile.business.address && locations.length === 0 && <p className="mt-4 flex gap-2 text-sm leading-6 text-[#6b7974]"><MapPin className="mt-0.5 shrink-0" size={16} />{profile.business.address}</p>}{locations.length > 0 && <div className="mt-5 space-y-2">{locations.map((location) => <a key={`${location.name}-${location.address}`} href={mapUrl(location)} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-xl bg-[#edf4ef] px-4 py-3 text-sm font-semibold text-[#356454] transition hover:bg-[#e1eee5]"><span className="flex min-w-0 items-center gap-2"><MapPin className="shrink-0" size={17} /><span className="min-w-0"><span className="block truncate">{location.name}</span><span className="mt-0.5 block truncate text-xs font-normal text-[#6b7974]">{location.address}</span></span></span><ExternalLink className="shrink-0" size={15} /></a>)}</div>}</section>}
          {!profile.business && locations.length > 0 && <section className="nuth-public-card"><div className="flex items-center gap-2"><MapPin size={19} /><h2 className="text-lg font-semibold">Ubicaciones</h2></div><div className="mt-5 space-y-2">{locations.map((location) => <a key={`${location.name}-${location.address}`} href={mapUrl(location)} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-xl bg-[#edf4ef] px-4 py-3 text-sm font-semibold text-[#356454]"><span className="flex min-w-0 items-center gap-2"><MapPin className="shrink-0" size={17} /><span className="min-w-0"><span className="block truncate">{location.name}</span><span className="mt-0.5 block truncate text-xs font-normal text-[#6b7974]">{location.address}</span></span></span><ExternalLink className="shrink-0" size={15} /></a>)}</div></section>}
          {profile.education.length > 0 && <section className="nuth-public-card"><div className="flex items-center gap-2"><GraduationCap size={19} /><h2 className="text-lg font-semibold">Educación</h2></div><div className="mt-5 space-y-4">{profile.education.map((item) => <div key={`${item.degree}-${item.graduationYear}`}><p className="text-sm font-semibold">{item.degree}</p>{item.educationType && <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#4c7163]">{educationTypeLabels[item.educationType]}</p>}<p className="mt-1 text-xs text-[#73807b]">{item.institution} · {item.graduationYear}</p></div>)}</div></section>}
          {profile.spokenLanguages.length > 0 && <section className="nuth-public-card"><div className="flex items-center gap-2"><Languages size={19} /><h2 className="text-lg font-semibold">Idiomas</h2></div><p className="mt-3 text-sm text-[#687672]">{profile.spokenLanguages.join(' · ')}</p></section>}
          {Object.keys(groupedSlots).length > 0 && <section className="nuth-public-card"><div className="flex items-center gap-2"><CalendarDays size={19} /><h2 className="text-lg font-semibold">Disponibilidad</h2></div><div className="mt-5 space-y-3">{Object.entries(groupedSlots).map(([day, slots]) => <div key={day} className="flex justify-between gap-4 text-sm"><span className="font-semibold">{weekdayLabels[Number(day)]}</span><span className="text-right text-[#687672]">{slots.map((slot) => `${slot.startTime.slice(0, 5)}–${slot.endTime.slice(0, 5)}`).join(', ')}</span></div>)}</div><button disabled className="mt-6 w-full rounded-xl bg-[#e4e8e5] py-3 text-sm font-semibold text-[#7c8984]">Agendar — Próximamente</button></section>}
          {profile.links.length > 0 && <section className="nuth-public-card"><h2 className="text-lg font-semibold">Enlaces</h2><div className="mt-4 grid gap-2">{profile.links.map((link) => <a key={`${link.type}-${link.url}`} href={link.url} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-xl bg-[#f2f5f1] px-4 py-3 text-sm font-semibold">{link.title}<ExternalLink size={15} /></a>)}</div></section>}
        </aside>
      </div>
    </div>
    <footer className="border-t border-[#dde4df] py-8 text-center text-xs text-[#7b8883]">Perfil creado con <Link to="/" className="font-semibold text-[#3f6759]">Nuthrick</Link></footer>
  </main>;
}
