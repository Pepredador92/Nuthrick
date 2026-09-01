import { ArrowRight, Check, LoaderCircle } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Field, Input } from '@/src/components/ui/FormField';
import { Logo } from '@/src/components/ui/Logo';
import { useAuth } from '@/src/features/auth/AuthProvider';
import { updateProfile } from '@/src/services/profile';

const timezones = ['America/Mexico_City', 'America/Cancun', 'America/Tijuana', 'America/Bogota', 'America/Lima', 'America/Santiago', 'America/Argentina/Buenos_Aires', 'Europe/Madrid'];

export function OnboardingPage() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(profile?.full_name ?? user?.user_metadata.full_name ?? '');
  const [title, setTitle] = useState(profile?.professional_title ?? 'Nutrióloga/o');
  const [country, setCountry] = useState(profile?.country ?? 'México');
  const [timezone, setTimezone] = useState(profile?.timezone ?? 'America/Mexico_City');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      await updateProfile({ full_name: name.trim(), professional_title: title.trim(), country: country.trim(), timezone, onboarding_completed: true });
      await refreshProfile(); navigate('/app', { replace: true });
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No fue posible guardar tu perfil.'); } finally { setBusy(false); }
  };

  return (
    <main className="min-h-screen bg-[#f7f8f4] px-5 py-6 sm:px-8"><div className="mx-auto max-w-6xl"><Logo /><div className="mt-10 grid overflow-hidden rounded-[32px] border border-[#dfe6e1] bg-white shadow-[0_30px_90px_rgba(25,60,52,.08)] lg:grid-cols-[.78fr_1.22fr]"><aside className="bg-[#173d36] p-8 text-white sm:p-12"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#efbd6b]">Primer paso</p><h1 className="mt-5 text-4xl font-semibold tracking-[-.04em]">Dale forma a tu espacio profesional</h1><p className="mt-5 leading-7 text-white/65">Sólo necesitamos lo esencial. El resto podrás completarlo con calma desde tu perfil.</p><div className="mt-10 space-y-4">{['Tu cuenta ya está protegida', 'Podrás editar estos datos después', 'No pediremos información clínica'].map((item) => <p key={item} className="flex items-center gap-3 text-sm"><span className="grid h-6 w-6 place-items-center rounded-full bg-white/10"><Check size={14} /></span>{item}</p>)}</div></aside><section className="p-8 sm:p-12"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-[#507264]">Configuración inicial</p><h2 className="mt-2 text-3xl font-semibold tracking-[-.03em]">Cuéntanos sobre ti</h2></div><span className="rounded-full bg-[#edf4ef] px-3 py-1 text-xs font-semibold text-[#4b7163]">1 de 1</span></div><form className="mt-9 grid gap-6 sm:grid-cols-2" onSubmit={submit}><Field label="Nombre" name="name"><Input id="name" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></Field><Field label="Título profesional" name="title"><Input id="title" required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} /></Field><Field label="País" name="country"><Input id="country" required maxLength={80} value={country} onChange={(event) => setCountry(event.target.value)} /></Field><Field label="Zona horaria" name="timezone"><select id="timezone" className="nuth-input" value={timezone} onChange={(event) => setTimezone(event.target.value)}>{timezones.map((zone) => <option key={zone}>{zone}</option>)}</select></Field>{error && <p role="alert" className="sm:col-span-2 rounded-xl bg-[#fff1ed] p-3 text-sm text-[#934938]">{error}</p>}<div className="sm:col-span-2 flex justify-end"><button disabled={busy} className="nuth-button px-6 py-3.5">{busy ? <LoaderCircle className="animate-spin" size={17} /> : <>Entrar a Nuthrick <ArrowRight size={17} /></>}</button></div></form></section></div></div></main>
  );
}
