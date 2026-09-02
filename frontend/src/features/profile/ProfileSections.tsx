import { ImagePlus, LoaderCircle, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Field, Input, Textarea } from '@/src/components/ui/FormField';
import { getSignedMediaUrl, removeProfessionalImage, uploadProfessionalImage } from '@/src/services/media';
import {
  addAvailabilitySlot,
  addEducation,
  addLink,
  addServiceImage,
  deleteAvailabilitySlot,
  deleteEducation,
  deleteLink,
  deleteServiceImage,
  replaceCatalogSelections,
  saveAvailability,
  saveBusiness,
  updateEducation,
  updateLink,
  updateProfile,
} from '@/src/services/profile';
import type { CareModality, LinkType, ProfileWorkspace } from '@/src/types/domain';
import { isValidEducationYear, isValidIanaTimezone, isValidUrl, normalizeSlug, slotsOverlap } from '@/src/lib/validation';

interface SectionProps { workspace: ProfileWorkspace; onSaved: (message: string) => Promise<void>; }

function SaveButton({ busy, label = 'Guardar cambios' }: { busy: boolean; label?: string }) {
  return <button disabled={busy} className="nuth-button">{busy ? <LoaderCircle className="animate-spin" size={17} /> : <Save size={17} />}{label}</button>;
}

export function AboutSection({ workspace, onSaved }: SectionProps) {
  const p = workspace.profile;
  const [values, setValues] = useState({ full_name: p.full_name, professional_title: p.professional_title ?? '', biography: p.biography ?? '', specialties: p.specialties.join(', '), spoken_languages: p.spoken_languages.join(', '), approximate_fee: p.approximate_fee?.toString() ?? '', currency: p.currency, license_number: p.license_number ?? '', care_modalities: p.care_modalities });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const toggleModality = (value: CareModality) => setValues((current) => ({ ...current, care_modalities: current.care_modalities.includes(value) ? current.care_modalities.filter((item) => item !== value) : [...current.care_modalities, value] }));
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { await updateProfile(workspace.profile.id, { full_name: values.full_name.trim(), professional_title: values.professional_title.trim() || null, biography: values.biography.trim() || null, specialties: values.specialties.split(',').map((item) => item.trim()).filter(Boolean), spoken_languages: values.spoken_languages.split(',').map((item) => item.trim()).filter(Boolean), approximate_fee: values.approximate_fee ? Number(values.approximate_fee) : null, currency: values.currency.toUpperCase(), license_number: values.license_number.trim() || null, care_modalities: values.care_modalities }); await onSaved('Tu información profesional quedó actualizada.'); } catch (caught) { setError(caught instanceof Error ? caught.message : 'No fue posible guardar.'); } finally { setBusy(false); } };
  return <form className="space-y-8" onSubmit={submit}><div className="grid gap-6 sm:grid-cols-2"><Field label="Nombre" name="full-name"><Input id="full-name" required maxLength={120} value={values.full_name} onChange={(e) => setValues({ ...values, full_name: e.target.value })} /></Field><Field label="Título profesional" name="professional-title"><Input id="professional-title" maxLength={160} value={values.professional_title} onChange={(e) => setValues({ ...values, professional_title: e.target.value })} /></Field></div><Field label="Biografía profesional" name="biography" hint="Cuenta brevemente cómo trabajas y a quién acompañas. Máximo 3,000 caracteres."><Textarea id="biography" maxLength={3000} value={values.biography} onChange={(e) => setValues({ ...values, biography: e.target.value })} /></Field><div className="grid gap-6 sm:grid-cols-2"><Field label="Especialidades" name="specialties" hint="Sepáralas con comas."><Input id="specialties" value={values.specialties} onChange={(e) => setValues({ ...values, specialties: e.target.value })} placeholder="Nutrición clínica, Salud digestiva" /></Field><Field label="Idiomas hablados" name="spoken-languages" hint="Sepáralos con comas."><Input id="spoken-languages" value={values.spoken_languages} onChange={(e) => setValues({ ...values, spoken_languages: e.target.value })} placeholder="Español, Inglés" /></Field></div><fieldset><legend className="text-sm font-semibold">Modalidad de atención</legend><div className="mt-3 flex flex-wrap gap-3">{([['in_person','Presencial'],['online','En línea'],['hybrid','Híbrida']] as Array<[CareModality,string]>).map(([value,label]) => <label key={value} className={`cursor-pointer rounded-full border px-4 py-2 text-sm ${values.care_modalities.includes(value) ? 'border-[#5d8978] bg-[#eaf2ed] text-[#315e50]' : 'border-[#dce3de] bg-white'}`}><input type="checkbox" className="sr-only" checked={values.care_modalities.includes(value)} onChange={() => toggleModality(value)} />{label}</label>)}</div></fieldset><div className="grid gap-6 sm:grid-cols-[1fr_120px_1fr]"><Field label="Costo aproximado" name="fee"><Input id="fee" type="number" min="0" step="0.01" value={values.approximate_fee} onChange={(e) => setValues({ ...values, approximate_fee: e.target.value })} /></Field><Field label="Moneda" name="currency"><Input id="currency" maxLength={3} value={values.currency} onChange={(e) => setValues({ ...values, currency: e.target.value })} /></Field><Field label="Cédula profesional" name="license"><Input id="license" maxLength={60} value={values.license_number} onChange={(e) => setValues({ ...values, license_number: e.target.value })} /></Field></div>{error && <p role="alert" className="text-sm text-[#984a39]">{error}</p>}<SaveButton busy={busy} /></form>;
}

export function ExtrasSection({ workspace, onSaved }: SectionProps) {
  const [conditionIds, setConditionIds] = useState(workspace.selectedConditionIds);
  const [populationIds, setPopulationIds] = useState(workspace.selectedPopulationIds);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [imageUrls, setImageUrls] = useState<Record<string,string>>({});
  useEffect(() => { let active = true; void Promise.all(workspace.images.map(async (image) => [image.id, await getSignedMediaUrl(image.storage_path)] as const)).then((pairs) => { if (active) setImageUrls(Object.fromEntries(pairs.filter((pair): pair is readonly [string,string] => Boolean(pair[1])))); }); return () => { active = false; }; }, [workspace.images]);
  const toggle = (ids: string[], id: string, setter: (next: string[]) => void) => setter(ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);
  const saveCatalogs = async () => { setBusy(true); setError(''); try { await Promise.all([replaceCatalogSelections('conditions', conditionIds), replaceCatalogSelections('populations', populationIds)]); await onSaved('Tus servicios y poblaciones quedaron actualizados.'); } catch (caught) { setError(caught instanceof Error ? caught.message : 'No fue posible guardar.'); } finally { setBusy(false); } };
  const upload = async (file?: File) => {
    if (!file) return;
    setBusy(true); setError('');
    let path = '';
    try {
      path = await uploadProfessionalImage(file, workspace.profile.storage_key, 'services');
      await addServiceImage({ storage_path: path, alt_text: 'Imagen de servicio', display_order: workspace.images.length });
      await onSaved('La imagen se agregó a tu galería.');
    } catch (caught) {
      if (path) await removeProfessionalImage(path).catch(() => undefined);
      setError(caught instanceof Error ? caught.message : 'No fue posible subir la imagen.');
    } finally { setBusy(false); }
  };
  const remove = async (id: string, path: string) => { setBusy(true); try { await deleteServiceImage(id); await removeProfessionalImage(path); await onSaved('La imagen se eliminó.'); } catch (caught) { setError(caught instanceof Error ? caught.message : 'No fue posible eliminarla.'); } finally { setBusy(false); } };
  return <div className="space-y-10"><section><div className="flex items-end justify-between gap-4"><div><h3 className="text-lg font-semibold">Galería de servicios</h3><p className="mt-1 text-sm text-[#74817d]">JPEG, PNG o WEBP de hasta 5 MB.</p></div><label className="nuth-button-secondary cursor-pointer"><ImagePlus size={17} />Subir imagen<input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" onChange={(e) => void upload(e.target.files?.[0])} /></label></div>{workspace.images.length ? <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">{workspace.images.map((image) => <figure key={image.id} className="group relative aspect-[4/3] overflow-hidden rounded-2xl bg-[#edf1ed]">{imageUrls[image.id] && <img src={imageUrls[image.id]} alt={image.alt_text ?? 'Servicio'} className="h-full w-full object-cover" />}<button type="button" onClick={() => void remove(image.id, image.storage_path)} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-[#963e34] shadow" aria-label="Eliminar imagen"><Trash2 size={15} /></button></figure>)}</div> : <div className="mt-5 rounded-2xl border border-dashed border-[#cfd9d2] p-8 text-center text-sm text-[#7c8984]">Aún no has agregado imágenes.</div>}</section><section><h3 className="text-lg font-semibold">Condiciones que tratas</h3><p className="mt-1 text-sm text-[#74817d]">Selecciona todas las que correspondan.</p><div className="mt-4 flex flex-wrap gap-2">{workspace.conditions.map((item) => <label key={item.id} className={`cursor-pointer rounded-full border px-3.5 py-2 text-sm ${conditionIds.includes(item.id) ? 'border-[#628b7b] bg-[#eaf2ed] text-[#315e50]' : 'border-[#dbe2dd] bg-white'}`}><input type="checkbox" className="sr-only" checked={conditionIds.includes(item.id)} onChange={() => toggle(conditionIds, item.id, setConditionIds)} />{item.name}</label>)}</div></section><section><h3 className="text-lg font-semibold">Poblaciones atendidas</h3><div className="mt-4 flex flex-wrap gap-2">{workspace.populations.map((item) => <label key={item.id} className={`cursor-pointer rounded-full border px-3.5 py-2 text-sm ${populationIds.includes(item.id) ? 'border-[#628b7b] bg-[#eaf2ed] text-[#315e50]' : 'border-[#dbe2dd] bg-white'}`}><input type="checkbox" className="sr-only" checked={populationIds.includes(item.id)} onChange={() => toggle(populationIds, item.id, setPopulationIds)} />{item.name}</label>)}</div></section>{error && <p role="alert" className="text-sm text-[#984a39]">{error}</p>}<button type="button" onClick={() => void saveCatalogs()} disabled={busy} className="nuth-button"><Save size={17} />Guardar selecciones</button></div>;
}

export function BusinessSection({ workspace, onSaved }: SectionProps) {
  const b = workspace.business;
  const [values, setValues] = useState({ establishment_name: b?.establishment_name ?? '', address: b?.address ?? '', establishment_type: b?.establishment_type ?? '', institution: b?.institution ?? '', legal_name: b?.legal_name ?? '', inactive_message: b?.inactive_message ?? '', logo_path: b?.logo_path ?? '' });
  const [busy, setBusy] = useState(false); const [error,setError]=useState(''); const [logoUrl,setLogoUrl]=useState<string | null>(null);
  useEffect(() => { void getSignedMediaUrl(values.logo_path).then(setLogoUrl); }, [values.logo_path]);
  const uploadLogo = async (file?: File) => {
    if (!file) return;
    setBusy(true); setError('');
    const old = values.logo_path;
    let path = '';
    try {
      path = await uploadProfessionalImage(file, workspace.profile.storage_key, 'logo');
      await saveBusiness({ professional_id: workspace.profile.id, logo_path: path });
      setValues((current) => ({ ...current, logo_path: path }));
      if (old) await removeProfessionalImage(old).catch(() => undefined);
      await onSaved('El logotipo quedó actualizado.');
    } catch (caught) {
      if (path) await removeProfessionalImage(path).catch(() => undefined);
      setError(caught instanceof Error ? caught.message : 'No fue posible subir el logotipo.');
    } finally { setBusy(false); }
  };
  const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); setError(''); try { await saveBusiness({ professional_id: workspace.profile.id, logo_path: values.logo_path || null, establishment_name: values.establishment_name.trim() || null, address: values.address.trim() || null, establishment_type: values.establishment_type.trim() || null, institution: values.institution.trim() || null, legal_name: values.legal_name.trim() || null, inactive_message: values.inactive_message.trim() || null }); await onSaved('Los datos de tu establecimiento quedaron actualizados.'); } catch (caught) { setError(caught instanceof Error ? caught.message : 'No fue posible guardar.'); } finally { setBusy(false); } };
  return <form className="space-y-7" onSubmit={submit}><div className="flex items-center gap-5"><div className="grid h-20 w-20 place-items-center overflow-hidden rounded-2xl bg-[#eef2ee] text-[#87948e]">{logoUrl ? <img src={logoUrl} alt="Logotipo" className="h-full w-full object-contain" /> : 'Logo'}</div><label className="nuth-button-secondary cursor-pointer"><ImagePlus size={17} />Cambiar logotipo<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void uploadLogo(e.target.files?.[0])} /></label></div><div className="grid gap-6 sm:grid-cols-2"><Field label="Nombre del establecimiento" name="establishment"><Input id="establishment" maxLength={160} value={values.establishment_name} onChange={(e) => setValues({...values, establishment_name:e.target.value})} /></Field><Field label="Tipo de establecimiento" name="type"><Input id="type" maxLength={100} value={values.establishment_type} onChange={(e) => setValues({...values, establishment_type:e.target.value})} placeholder="Consultorio privado" /></Field></div><Field label="Dirección" name="address"><Textarea id="address" maxLength={500} value={values.address} onChange={(e) => setValues({...values, address:e.target.value})} /></Field><div className="grid gap-6 sm:grid-cols-2"><Field label="Institución (opcional)" name="institution"><Input id="institution" value={values.institution} onChange={(e) => setValues({...values, institution:e.target.value})} /></Field><Field label="Razón social (opcional)" name="legal-name"><Input id="legal-name" value={values.legal_name} onChange={(e) => setValues({...values, legal_name:e.target.value})} /></Field></div><Field label="Mensaje cuando estés inactivo" name="inactive"><Textarea id="inactive" maxLength={800} value={values.inactive_message} onChange={(e) => setValues({...values, inactive_message:e.target.value})} /></Field>{error && <p role="alert" className="text-sm text-[#984a39]">{error}</p>}<SaveButton busy={busy} /></form>;
}

export function EducationSection({ workspace, onSaved }: SectionProps) {
  const currentYear = new Date().getFullYear();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [degree, setDegree] = useState('');
  const [institution, setInstitution] = useState('');
  const [year, setYear] = useState(currentYear.toString());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const resetForm = () => {
    setEditingId(null);
    setDegree('');
    setInstitution('');
    setYear(currentYear.toString());
    setError('');
  };

  const startEditing = (item: ProfileWorkspace['education'][number]) => {
    setEditingId(item.id);
    setDegree(item.degree);
    setInstitution(item.institution);
    setYear(item.graduation_year.toString());
    setError('');
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = Number(year);
    if (!isValidEducationYear(parsed, currentYear)) {
      return setError(`Usa un año entre 1940 y ${currentYear + 10}.`);
    }
    setBusy(true); setError('');
    try {
      if (editingId) {
        const current = workspace.education.find((item) => item.id === editingId);
        await updateEducation(editingId, {
          degree: degree.trim(),
          institution: institution.trim(),
          graduation_year: parsed,
          display_order: current?.display_order ?? 0,
        });
        await onSaved('La formación quedó actualizada.');
      } else {
        await addEducation({
          degree: degree.trim(),
          institution: institution.trim(),
          graduation_year: parsed,
          display_order: workspace.education.length,
        });
        await onSaved('La formación se agregó.');
      }
      resetForm();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No fue posible guardar la formación.');
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    setBusy(true); setError('');
    try {
      await deleteEducation(id);
      if (editingId === id) resetForm();
      await onSaved('La formación se eliminó.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No fue posible eliminarla.');
    } finally { setBusy(false); }
  };

  return <div><div className="space-y-3">{workspace.education.length ? workspace.education.map((item) => <article key={item.id} className="flex items-start justify-between gap-4 rounded-2xl border border-[#dfe5e1] p-5"><div><h3 className="font-semibold">{item.degree}</h3><p className="mt-1 text-sm text-[#6c7975]">{item.institution} · {item.graduation_year}</p></div><div className="flex gap-1"><button type="button" onClick={() => startEditing(item)} className="p-2 text-[#456d5f]" aria-label={`Editar ${item.degree}`}><Pencil size={17} /></button><button type="button" onClick={() => void remove(item.id)} className="p-2 text-[#9b493a]" aria-label={`Eliminar ${item.degree}`}><Trash2 size={17} /></button></div></article>) : <div className="rounded-2xl border border-dashed border-[#ced8d1] p-7 text-center text-sm text-[#7a8782]">Agrega tu primera formación académica.</div>}</div><form className="mt-8 rounded-2xl bg-[#f5f7f3] p-5" onSubmit={save}><div className="flex items-center justify-between gap-4"><h3 className="font-semibold">{editingId ? 'Editar formación' : 'Agregar formación'}</h3>{editingId && <button type="button" onClick={resetForm} className="text-sm font-semibold text-[#5c7169]">Cancelar</button>}</div><div className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr_120px]"><Field label="Grado" name="degree"><Input id="degree" required minLength={2} maxLength={160} value={degree} onChange={(e) => setDegree(e.target.value)} /></Field><Field label="Institución" name="institution"><Input id="institution" required minLength={2} maxLength={200} value={institution} onChange={(e) => setInstitution(e.target.value)} /></Field><Field label="Año" name="year"><Input id="year" type="number" min="1940" max={currentYear + 10} required value={year} onChange={(e) => setYear(e.target.value)} /></Field></div>{error && <p role="alert" className="mt-4 text-sm text-[#984a39]">{error}</p>}<button disabled={busy} className="nuth-button mt-5">{editingId ? <Save size={17} /> : <Plus size={17} />}{editingId ? 'Guardar cambios' : 'Agregar'}</button></form></div>;
}

export function LinksSection({ workspace, onSaved }: SectionProps) {
  const [type,setType]=useState<LinkType>('custom');const[title,setTitle]=useState('');const[url,setUrl]=useState('https://');const[busy,setBusy]=useState(false);const[error,setError]=useState('');
  const [slug,setSlug]=useState(workspace.profile.public_slug??normalizeSlug(workspace.profile.full_name));const[country,setCountry]=useState(workspace.profile.country??'');const[language,setLanguage]=useState(workspace.profile.language);const[isPublic,setIsPublic]=useState(workspace.profile.is_public);
  const savePublicSettings=async()=>{const normalized=normalizeSlug(slug);if(normalized.length<3)return setError('El slug debe tener al menos 3 caracteres.');setBusy(true);setError('');try{await updateProfile(workspace.profile.id,{public_slug:normalized,country:country.trim()||null,language,is_public:isPublic});setSlug(normalized);await onSaved(isPublic?'Tu página pública quedó actualizada.':'La página quedó en modo privado.');}catch(caught){setError(caught instanceof Error?caught.message:'No fue posible guardar el enlace público.');}finally{setBusy(false);}};
  const add=async(e:FormEvent)=>{e.preventDefault();if(!isValidUrl(url))return setError('Ingresa una URL completa que comience con https://');setBusy(true);try{await addLink({link_type:type,title:title.trim(),url:url.trim(),display_order:workspace.links.length,is_active:true});setTitle('');setUrl('https://');await onSaved('El enlace se agregó.');}catch(caught){setError(caught instanceof Error?caught.message:'No fue posible agregarlo.');}finally{setBusy(false);}};
  const remove=async(id:string)=>{setBusy(true);setError('');try{await deleteLink(id);await onSaved('El enlace se eliminó.');}catch(caught){setError(caught instanceof Error?caught.message:'No fue posible eliminar el enlace.');}finally{setBusy(false);}};
  const toggleActive=async(id:string,isActive:boolean)=>{setBusy(true);setError('');try{await updateLink(id,{is_active:!isActive});await onSaved(isActive?'El enlace quedó oculto.':'El enlace quedó visible.');}catch(caught){setError(caught instanceof Error?caught.message:'No fue posible actualizar el enlace.');}finally{setBusy(false);}};
  return <div><section className="rounded-2xl border border-[#dfe5e1] p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-semibold">Página pública</h3><p className="mt-1 text-sm text-[#74817d]">El slug es único y sólo se publicará la proyección segura de tu perfil.</p></div><label className="flex cursor-pointer items-center gap-3 rounded-full bg-[#f2f5f1] px-4 py-2 text-sm font-semibold"><input type="checkbox" checked={isPublic} onChange={(e)=>setIsPublic(e.target.checked)} />{isPublic?'Pública':'Privada'}</label></div><div className="mt-5 grid gap-5 sm:grid-cols-3"><Field label="Slug" name="public-slug"><Input id="public-slug" minLength={3} maxLength={80} value={slug} onChange={(e)=>setSlug(normalizeSlug(e.target.value))} /></Field><Field label="País" name="link-country"><Input id="link-country" value={country} onChange={(e)=>setCountry(e.target.value)} /></Field><Field label="Idioma" name="language"><select id="language" className="nuth-input" value={language} onChange={(e)=>setLanguage(e.target.value)}><option value="es">Español</option><option value="en">English</option></select></Field></div><button type="button" onClick={()=>void savePublicSettings()} disabled={busy} className="nuth-button mt-5"><Save size={17}/>Guardar página pública</button></section><div className="mt-8 space-y-3">{workspace.links.map((link)=><article key={link.id} className={`flex items-center justify-between gap-4 rounded-2xl border border-[#dfe5e1] p-4 ${link.is_active?'':'opacity-60'}`}><div className="min-w-0"><p className="font-semibold">{link.title}<span className="ml-2 rounded-full bg-[#eef2ee] px-2 py-0.5 text-[10px] font-medium uppercase text-[#71807a]">{link.link_type}</span>{!link.is_active&&<span className="ml-2 text-xs font-medium text-[#7c8984]">Oculto</span>}</p><a className="mt-1 block truncate text-sm text-[#557567] underline" href={link.url} target="_blank" rel="noreferrer">{link.url}</a></div><div className="flex items-center gap-1"><button type="button" onClick={()=>void toggleActive(link.id,link.is_active)} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-[#456d5f]" aria-label={`${link.is_active?'Ocultar':'Mostrar'} ${link.title}`}>{link.is_active?'Ocultar':'Mostrar'}</button><button type="button" onClick={()=>void remove(link.id)} className="p-2 text-[#984a39]" aria-label={`Eliminar ${link.title}`}><Trash2 size={17}/></button></div></article>)}</div><form className="mt-8 rounded-2xl bg-[#f5f7f3] p-5" onSubmit={add}><h3 className="font-semibold">Agregar enlace o red social</h3><div className="mt-5 grid gap-4 sm:grid-cols-[160px_1fr]"><Field label="Tipo" name="link-type"><select id="link-type" className="nuth-input" value={type} onChange={(e)=>setType(e.target.value as LinkType)}>{['custom','whatsapp','instagram','facebook','tiktok','youtube'].map((item)=><option key={item} value={item}>{item}</option>)}</select></Field><Field label="Título" name="link-title"><Input id="link-title" required maxLength={80} value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="Mi ebook" /></Field></div><div className="mt-4"><Field label="URL" name="link-url"><Input id="link-url" type="url" required value={url} onChange={(e)=>setUrl(e.target.value)} /></Field></div>{error&&<p role="alert" className="mt-4 text-sm text-[#984a39]">{error}</p>}<button disabled={busy} className="nuth-button mt-5"><Plus size={17}/>Agregar enlace</button></form></div>;
}

const weekdays=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
export function AvailabilitySection({ workspace,onSaved }:SectionProps){const settings=workspace.availability;const[duration,setDuration]=useState(settings?.default_duration_minutes??60);const[timezone,setTimezone]=useState(settings?.timezone??workspace.profile.timezone);const[horizon,setHorizon]=useState(settings?.booking_horizon_days??60);const[weekday,setWeekday]=useState(1);const[start,setStart]=useState('09:00');const[end,setEnd]=useState('13:00');const[busy,setBusy]=useState(false);const[error,setError]=useState('');
  const saveSettings=async()=>{setError('');if(!isValidIanaTimezone(timezone))return setError('Usa una zona horaria IANA válida, por ejemplo America/Mexico_City.');setBusy(true);try{await saveAvailability({default_duration_minutes:duration,timezone,booking_horizon_days:horizon});await onSaved('La configuración de disponibilidad quedó guardada.');}catch(caught){setError(caught instanceof Error?caught.message:'No fue posible guardar.');}finally{setBusy(false);}};
  const add=async(e:FormEvent)=>{e.preventDefault();if(slotsOverlap({weekday,start_time:start,end_time:end},workspace.slots))return setError('El rango es inválido o se superpone con otro del mismo día.');setBusy(true);try{await addAvailabilitySlot({weekday,start_time:start,end_time:end});await onSaved('El horario se agregó.');}catch(caught){setError(caught instanceof Error?caught.message:'No fue posible agregar el horario.');}finally{setBusy(false);}};
  const remove=async(id:string)=>{setBusy(true);try{await deleteAvailabilitySlot(id);await onSaved('El horario se eliminó.');}finally{setBusy(false);}};
  return <div className="space-y-9"><section><h3 className="text-lg font-semibold">Preferencias de cita</h3><div className="mt-5 grid gap-5 sm:grid-cols-3"><Field label="Duración" name="duration"><select id="duration" className="nuth-input" value={duration} onChange={(e)=>setDuration(Number(e.target.value))}>{[15,20,30,45,60,90,120].map((value)=><option key={value} value={value}>{value} minutos</option>)}</select></Field><Field label="Zona horaria" name="availability-timezone"><Input id="availability-timezone" value={timezone} onChange={(e)=>setTimezone(e.target.value)} /></Field><Field label="Horizonte de reserva" name="horizon" hint="En días, máximo 365."><Input id="horizon" type="number" min="1" max="365" value={horizon} onChange={(e)=>setHorizon(Number(e.target.value))} /></Field></div><button type="button" onClick={()=>void saveSettings()} disabled={busy} className="nuth-button mt-5"><Save size={17}/>Guardar preferencias</button></section><section><h3 className="text-lg font-semibold">Horarios semanales</h3><div className="mt-4 grid gap-5 sm:grid-cols-2">{weekdays.map((day,index)=><div key={day} className="rounded-2xl border border-[#dfe5e1] p-4"><p className="font-semibold">{day}</p><div className="mt-3 space-y-2">{workspace.slots.filter((slot)=>slot.weekday===index).map((slot)=><div key={slot.id} className="flex items-center justify-between rounded-xl bg-[#f2f5f1] px-3 py-2 text-sm"><span>{slot.start_time.slice(0,5)} – {slot.end_time.slice(0,5)}</span><button type="button" onClick={()=>void remove(slot.id)} className="text-[#994a3a]" aria-label="Eliminar horario"><X size={16}/></button></div>)}{!workspace.slots.some((slot)=>slot.weekday===index)&&<p className="text-xs text-[#94a09b]">Sin disponibilidad</p>}</div></div>)}</div><form className="mt-6 rounded-2xl bg-[#f5f7f3] p-5" onSubmit={add}><div className="grid gap-4 sm:grid-cols-3"><Field label="Día" name="weekday"><select id="weekday" className="nuth-input" value={weekday} onChange={(e)=>setWeekday(Number(e.target.value))}>{weekdays.map((day,index)=><option key={day} value={index}>{day}</option>)}</select></Field><Field label="Desde" name="start"><Input id="start" type="time" value={start} onChange={(e)=>setStart(e.target.value)} /></Field><Field label="Hasta" name="end"><Input id="end" type="time" value={end} onChange={(e)=>setEnd(e.target.value)} /></Field></div>{error&&<p role="alert" className="mt-4 text-sm text-[#984a39]">{error}</p>}<button disabled={busy} className="nuth-button mt-5"><Plus size={17}/>Agregar horario</button></form></section></div>;
}

export function PaymentsSection(){return <div className="grid min-h-72 place-items-center rounded-[28px] border border-dashed border-[#ccd7d0] bg-[#f8f9f6] text-center"><div><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#e9f1ec] text-2xl">$</span><h3 className="mt-5 text-2xl font-semibold">Pagos — Próximamente</h3><p className="mx-auto mt-3 max-w-md leading-7 text-[#6c7a75]">Esta sección está reservada para una fase futura. Aún no procesa cobros, comisiones ni suscripciones.</p></div></div>;}
