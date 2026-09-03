import { ImagePlus, LoaderCircle, Mail, MapPin, MessageCircle, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { Field, Input, Textarea } from '@/src/components/ui/FormField';
import { usePersistentState } from '@/src/hooks/usePersistentState';
import { getSignedMediaUrl, removeProfessionalImage, uploadProfessionalImage } from '@/src/services/media';
import {
  addAvailabilitySlot,
  addContact,
  addEducation,
  addLink,
  addLocation,
  addServiceImage,
  deleteAvailabilitySlot,
  deleteContact,
  deleteEducation,
  deleteLink,
  deleteLocation,
  deleteServiceImage,
  replaceCatalogSelections,
  saveAvailability,
  saveBusiness,
  updateLocation,
  updateEducation,
  updateLink,
  updateProfile,
} from '@/src/services/profile';
import type { CareModality, ContactType, EducationType, LinkType, ProfileWorkspace } from '@/src/types/domain';
import { isValidEducationYear, isValidIanaTimezone, isValidUrl, normalizeSlug, slotsOverlap } from '@/src/lib/validation';

interface SectionProps { workspace: ProfileWorkspace; onSaved: (message: string) => Promise<void>; }

function SaveButton({ busy, label = 'Guardar cambios' }: { busy: boolean; label?: string }) {
  return <button disabled={busy} className="nuth-button">{busy ? <LoaderCircle className="animate-spin" size={17} /> : <Save size={17} />}{label}</button>;
}

export function AboutSection({ workspace, onSaved }: SectionProps) {
  const p = workspace.profile;
  const [values, setValues, clearDraft] = usePersistentState(`nuthrick:${p.id}:about`, { full_name: p.full_name, professional_title: p.professional_title ?? '', biography: p.biography ?? '', specialties: p.specialties.join(', '), spoken_languages: p.spoken_languages.join(', '), approximate_fee: p.approximate_fee?.toString() ?? '', currency: p.currency, license_number: p.license_number ?? '', care_modalities: p.care_modalities });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const toggleModality = (value: CareModality) => setValues((current) => ({ ...current, care_modalities: current.care_modalities.includes(value) ? current.care_modalities.filter((item) => item !== value) : [...current.care_modalities, value] }));
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { await updateProfile(workspace.profile.id, { full_name: values.full_name.trim(), professional_title: values.professional_title.trim() || null, biography: values.biography.trim() || null, specialties: values.specialties.split(',').map((item) => item.trim()).filter(Boolean), spoken_languages: values.spoken_languages.split(',').map((item) => item.trim()).filter(Boolean), approximate_fee: values.approximate_fee ? Number(values.approximate_fee) : null, currency: values.currency.toUpperCase(), license_number: values.license_number.trim() || null, care_modalities: values.care_modalities }); clearDraft(); await onSaved('Tu información profesional quedó actualizada.'); } catch (caught) { setError(caught instanceof Error ? caught.message : 'No fue posible guardar.'); } finally { setBusy(false); } };
  return <form className="space-y-8" onSubmit={submit}><div className="grid gap-6 sm:grid-cols-2"><Field label="Nombre" name="full-name"><Input id="full-name" required maxLength={120} value={values.full_name} onChange={(e) => setValues({ ...values, full_name: e.target.value })} /></Field><Field label="Título profesional" name="professional-title"><Input id="professional-title" maxLength={160} value={values.professional_title} onChange={(e) => setValues({ ...values, professional_title: e.target.value })} /></Field></div><Field label="Biografía profesional" name="biography" hint="Cuenta brevemente cómo trabajas y a quién acompañas. Máximo 3,000 caracteres."><Textarea id="biography" maxLength={3000} value={values.biography} onChange={(e) => setValues({ ...values, biography: e.target.value })} /></Field><div className="grid gap-6 sm:grid-cols-2"><Field label="Especialidades" name="specialties" hint="Sepáralas con comas."><Input id="specialties" value={values.specialties} onChange={(e) => setValues({ ...values, specialties: e.target.value })} placeholder="Nutrición clínica, Salud digestiva" /></Field><Field label="Idiomas hablados" name="spoken-languages" hint="Sepáralos con comas."><Input id="spoken-languages" value={values.spoken_languages} onChange={(e) => setValues({ ...values, spoken_languages: e.target.value })} placeholder="Español, Inglés" /></Field></div><fieldset><legend className="text-sm font-semibold">Modalidad de atención</legend><div className="mt-3 flex flex-wrap gap-3">{([['in_person','Presencial'],['online','En línea'],['hybrid','Híbrida']] as Array<[CareModality,string]>).map(([value,label]) => <label key={value} className={`cursor-pointer rounded-full border px-4 py-2 text-sm ${values.care_modalities.includes(value) ? 'border-[#5d8978] bg-[#eaf2ed] text-[#315e50]' : 'border-[#dce3de] bg-white'}`}><input type="checkbox" className="sr-only" checked={values.care_modalities.includes(value)} onChange={() => toggleModality(value)} />{label}</label>)}</div></fieldset><div className="grid gap-6 sm:grid-cols-[1fr_120px_1fr]"><Field label="Costo aproximado" name="fee"><Input id="fee" type="number" min="0" step="0.01" value={values.approximate_fee} onChange={(e) => setValues({ ...values, approximate_fee: e.target.value })} /></Field><Field label="Moneda" name="currency"><Input id="currency" maxLength={3} value={values.currency} onChange={(e) => setValues({ ...values, currency: e.target.value })} /></Field><Field label="Cédula profesional" name="license"><Input id="license" maxLength={60} value={values.license_number} onChange={(e) => setValues({ ...values, license_number: e.target.value })} /></Field></div>{error && <p role="alert" className="text-sm text-[#984a39]">{error}</p>}<SaveButton busy={busy} /></form>;
}

const countryCodes = [
  ['+52', 'México (+52)'],
  ['+1', 'Estados Unidos / Canadá (+1)'],
  ['+34', 'España (+34)'],
  ['+54', 'Argentina (+54)'],
  ['+56', 'Chile (+56)'],
  ['+57', 'Colombia (+57)'],
  ['+51', 'Perú (+51)'],
  ['+506', 'Costa Rica (+506)'],
  ['+507', 'Panamá (+507)'],
  ['+593', 'Ecuador (+593)'],
] as const;

export function ContactsSection({ workspace, onSaved }: SectionProps) {
  const [draft, setDraft, clearDraft] = usePersistentState(`nuthrick:${workspace.profile.id}:contacts`, { contactType: 'phone' as ContactType, label: 'WhatsApp', countryCode: '+52', value: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { contactType, label, countryCode, value } = draft;

  const add = async (event: FormEvent) => {
    event.preventDefault();
    const cleanValue = contactType === 'phone' ? value.replace(/\D/g, '') : value.trim().toLowerCase();
    if (contactType === 'phone' && (countryCode.trim() === '' || !/^\+[1-9]\d{0,3}$/.test(countryCode.trim()) || cleanValue.length < 7 || cleanValue.length > 15)) {
      return setError('Escribe una lada válida (por ejemplo +52) y un número de 7 a 15 dígitos.');
    }
    if (contactType === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanValue)) return setError('Escribe un correo electrónico válido.');
    setBusy(true); setError('');
    try {
      await addContact({ contact_type: contactType, label: label.trim() || null, country_code: contactType === 'phone' ? countryCode.trim() : null, contact_value: cleanValue, is_whatsapp: contactType === 'phone', display_order: workspace.contacts.length });
      clearDraft();
      setDraft({ contactType, label: contactType === 'phone' ? 'WhatsApp' : 'Correo', countryCode: '+52', value: '' });
      await onSaved('El contacto quedó guardado.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No fue posible guardar el contacto.'); } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    setBusy(true); setError('');
    try { await deleteContact(id); await onSaved('El contacto se eliminó.'); } catch (caught) { setError(caught instanceof Error ? caught.message : 'No fue posible eliminarlo.'); } finally { setBusy(false); }
  };

  return <section className="border-t border-[#e3e9e4] pt-8"><div><h3 className="text-lg font-semibold">Datos de contacto</h3><p className="mt-1 text-sm text-[#74817d]">Agrega un WhatsApp o correo para que puedan encontrarte fácilmente desde tu página pública.</p></div><div className="mt-5 space-y-3">{workspace.contacts.length ? workspace.contacts.map((contact) => <article key={contact.id} className="flex items-center justify-between gap-4 rounded-2xl border border-[#dfe5e1] p-4"><div className="flex min-w-0 items-center gap-3">{contact.contact_type === 'phone' ? <MessageCircle className="shrink-0 text-[#25a85a]" size={19} /> : <Mail className="shrink-0 text-[#52796a]" size={19} />}<div className="min-w-0"><p className="font-semibold">{contact.label || (contact.contact_type === 'phone' ? 'WhatsApp' : 'Correo')}</p><p className="truncate text-sm text-[#6d7b76]">{contact.country_code ? `${contact.country_code} ` : ''}{contact.contact_value}</p></div></div><button type="button" onClick={() => void remove(contact.id)} className="p-2 text-[#984a39]" aria-label={`Eliminar ${contact.label || contact.contact_value}`}><Trash2 size={17} /></button></article>) : <div className="rounded-2xl border border-dashed border-[#ced8d1] p-6 text-center text-sm text-[#7a8782]">Todavía no agregas datos de contacto.</div>}</div><form className="mt-6 rounded-2xl bg-[#f5f7f3] p-5" onSubmit={add}><div className="grid gap-4 sm:grid-cols-[170px_1fr]"> <Field label="Tipo" name="contact-type"><select id="contact-type" className="nuth-input" value={contactType} onChange={(event) => setDraft((current) => ({ ...current, contactType: event.target.value as ContactType, label: event.target.value === 'phone' ? 'WhatsApp' : 'Correo', value: '' }))}><option value="phone">Teléfono / WhatsApp</option><option value="email">Correo electrónico</option></select></Field><Field label="Etiqueta (opcional)" name="contact-label"><Input id="contact-label" maxLength={80} value={label} onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))} placeholder={contactType === 'phone' ? 'WhatsApp' : 'Correo profesional'} /></Field></div>{contactType === 'phone' ? <div className="mt-4 grid gap-4 sm:grid-cols-[190px_1fr]"><Field label="Lada del país" name="country-code" hint="Ejemplo para México: +52"><select id="country-code" className="nuth-input" value={countryCode} onChange={(event) => setDraft((current) => ({ ...current, countryCode: event.target.value }))}>{countryCodes.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></Field><Field label="Número" name="phone-number"><Input id="phone-number" type="tel" inputMode="numeric" maxLength={15} required value={value} onChange={(event) => setDraft((current) => ({ ...current, value: event.target.value }))} placeholder="4921234567" /></Field></div> : <div className="mt-4"><Field label="Correo electrónico" name="email-value"><Input id="email-value" type="email" required value={value} onChange={(event) => setDraft((current) => ({ ...current, value: event.target.value }))} placeholder="hola@tudominio.com" /></Field></div>}{error && <p role="alert" className="mt-4 text-sm text-[#984a39]">{error}</p>}<button type="submit" disabled={busy} className="nuth-button mt-5">{busy ? <LoaderCircle className="animate-spin" size={17} /> : <Plus size={17} />}Agregar contacto</button></form></section>;
}

export function ExtrasSection({ workspace, onSaved }: SectionProps) {
  const [conditionIds, setConditionIds, clearConditionDraft] = usePersistentState(`nuthrick:${workspace.profile.id}:condition-ids`, workspace.selectedConditionIds);
  const [customLabels, setCustomLabels, clearCustomConditionDraft] = usePersistentState(`nuthrick:${workspace.profile.id}:custom-conditions`, workspace.customConditionLabels);
  const [populationIds, setPopulationIds, clearPopulationDraft] = usePersistentState(`nuthrick:${workspace.profile.id}:population-ids`, workspace.selectedPopulationIds);
  const [conditionSearch, setConditionSearch, clearConditionSearchDraft] = usePersistentState(`nuthrick:${workspace.profile.id}:condition-search`, '');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [imageUrls, setImageUrls] = useState<Record<string,string>>({});
  useEffect(() => { let active = true; void Promise.all(workspace.images.map(async (image) => [image.id, await getSignedMediaUrl(image.storage_path)] as const)).then((pairs) => { if (active) setImageUrls(Object.fromEntries(pairs.filter((pair): pair is readonly [string,string] => Boolean(pair[1])))); }); return () => { active = false; }; }, [workspace.images]);
  const toggle = (ids: string[], id: string, setter: (next: string[]) => void) => setter(ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);
  const normalizedSearch = conditionSearch.trim().toLocaleLowerCase();
  const suggestions = normalizedSearch ? workspace.conditions.filter((item) => !conditionIds.includes(item.id) && item.name.toLocaleLowerCase().includes(normalizedSearch)).slice(0, 8) : [];
  const addCondition = (rawValue: string) => {
    const label = rawValue.trim().replace(/\s+/g, ' ').replace(/[;,]+$/, '').slice(0, 80);
    if (label.length < 2) return;
    const catalogMatch = workspace.conditions.find((item) => item.name.toLocaleLowerCase() === label.toLocaleLowerCase());
    if (catalogMatch) setConditionIds((current) => current.includes(catalogMatch.id) ? current : [...current, catalogMatch.id]);
    else if (!customLabels.some((item) => item.toLocaleLowerCase() === label.toLocaleLowerCase())) setCustomLabels((current) => [...current, label]);
    setConditionSearch('');
  };
  const saveCatalogs = async () => { setBusy(true); setError(''); try { await Promise.all([replaceCatalogSelections('conditions', conditionIds), replaceCatalogSelections('populations', populationIds), updateProfile(workspace.profile.id, { custom_conditions: customLabels })]); clearConditionDraft(); clearCustomConditionDraft(); clearPopulationDraft(); clearConditionSearchDraft(); await onSaved('Tus condiciones y poblaciones quedaron actualizadas.'); } catch (caught) { setError(caught instanceof Error ? caught.message : 'No fue posible guardar.'); } finally { setBusy(false); } };
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
  return <div className="space-y-10"><section><div className="flex items-end justify-between gap-4"><div><h3 className="text-lg font-semibold">Galería de servicios</h3><p className="mt-1 text-sm text-[#74817d]">JPEG, PNG o WEBP de hasta 5 MB.</p></div><label className="nuth-button-secondary cursor-pointer"><ImagePlus size={17} />Subir imagen<input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" onChange={(e) => void upload(e.target.files?.[0])} /></label></div>{workspace.images.length ? <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">{workspace.images.map((image) => <figure key={image.id} className="group relative aspect-[4/3] overflow-hidden rounded-2xl bg-[#edf1ed]">{imageUrls[image.id] && <img src={imageUrls[image.id]} alt={image.alt_text ?? 'Servicio'} className="h-full w-full object-cover" />}<button type="button" onClick={() => void remove(image.id, image.storage_path)} className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-[#963e34] shadow" aria-label="Eliminar imagen"><Trash2 size={15} /></button></figure>)}</div> : <div className="mt-5 rounded-2xl border border-dashed border-[#cfd9d2] p-8 text-center text-sm text-[#7c8984]">Aún no has agregado imágenes.</div>}</section><section><h3 className="text-lg font-semibold">Condiciones que tratas</h3><p className="mt-1 text-sm text-[#74817d]">Escribe para buscar o agrega una etiqueta propia.</p><div className="relative mt-4"><Input id="condition-search" value={conditionSearch} onChange={(event) => setConditionSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addCondition(conditionSearch); } }} placeholder="Ej. SOP, migraña, alimentación intuitiva" aria-label="Buscar o agregar condición" />{(conditionSearch || suggestions.length > 0) && <div className="absolute z-10 mt-2 w-full rounded-2xl border border-[#dfe5e1] bg-white p-2 shadow-xl">{suggestions.map((item) => <button key={item.id} type="button" onClick={() => { setConditionIds((current) => [...current, item.id]); setConditionSearch(''); }} className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-[#edf4ef]">{item.name}</button>)}{conditionSearch.trim().length > 1 && <button type="button" onClick={() => addCondition(conditionSearch)} className="block w-full rounded-xl border-t border-[#edf0ed] px-3 py-2 text-left text-sm font-semibold text-[#3e6b5b]">Agregar “{conditionSearch.trim()}”</button>}</div>}</div><div className="mt-4 flex flex-wrap gap-2">{workspace.conditions.filter((item) => conditionIds.includes(item.id)).map((item) => <span key={item.id} className="inline-flex items-center gap-1 rounded-full bg-[#eaf2ed] px-3 py-1.5 text-sm text-[#315e50]">{item.name}<button type="button" onClick={() => setConditionIds((current) => current.filter((id) => id !== item.id))} aria-label={`Quitar ${item.name}`}>×</button></span>)}{customLabels.map((label) => <span key={label} className="inline-flex items-center gap-1 rounded-full bg-[#f5ebdd] px-3 py-1.5 text-sm text-[#805a2c]">{label}<button type="button" onClick={() => setCustomLabels((current) => current.filter((item) => item !== label))} aria-label={`Quitar ${label}`}>×</button></span>)}</div></section><section><h3 className="text-lg font-semibold">Poblaciones atendidas</h3><div className="mt-4 flex flex-wrap gap-2">{workspace.populations.map((item) => <label key={item.id} className={`cursor-pointer rounded-full border px-3.5 py-2 text-sm ${populationIds.includes(item.id) ? 'border-[#628b7b] bg-[#eaf2ed] text-[#315e50]' : 'border-[#dbe2dd] bg-white'}`}><input type="checkbox" className="sr-only" checked={populationIds.includes(item.id)} onChange={() => toggle(populationIds, item.id, setPopulationIds)} />{item.name}</label>)}</div></section>{error && <p role="alert" className="text-sm text-[#984a39]">{error}</p>}<button type="button" onClick={() => void saveCatalogs()} disabled={busy} className="nuth-button"><Save size={17} />Guardar cambios</button></div>;
}

export function BusinessSection({ workspace, onSaved }: SectionProps) {
  const b = workspace.business;
  const [values, setValues, clearDraft] = usePersistentState(`nuthrick:${workspace.profile.id}:business`, { establishment_name: b?.establishment_name ?? '', address: b?.address ?? '', establishment_type: b?.establishment_type ?? '', institution: b?.institution ?? '', legal_name: b?.legal_name ?? '', inactive_message: b?.inactive_message ?? '', logo_path: b?.logo_path ?? '' });
  const [locationDraft, setLocationDraft, clearLocationDraft] = usePersistentState(`nuthrick:${workspace.profile.id}:location`, { name: '', address: '', map_url: '' });
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
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
      setLogoUrl(await getSignedMediaUrl(path));
      clearDraft();
      if (old) await removeProfessionalImage(old).catch(() => undefined);
      await onSaved('El logotipo quedó actualizado.');
    } catch (caught) {
      if (path) await removeProfessionalImage(path).catch(() => undefined);
      setError(caught instanceof Error ? caught.message : 'No fue posible subir el logotipo.');
    } finally { setBusy(false); }
  };
  const submit = async (e: FormEvent) => { e.preventDefault(); setBusy(true); setError(''); try { await saveBusiness({ professional_id: workspace.profile.id, logo_path: values.logo_path || null, establishment_name: values.establishment_name.trim() || null, address: values.address.trim() || null, establishment_type: values.establishment_type.trim() || null, institution: values.institution.trim() || null, legal_name: values.legal_name.trim() || null, inactive_message: values.inactive_message.trim() || null }); clearDraft(); await onSaved('Los datos de tu establecimiento quedaron actualizados.'); } catch (caught) { setError(caught instanceof Error ? caught.message : 'No fue posible guardar.'); } finally { setBusy(false); } };
  const saveLocation = async () => {
    if (locationDraft.address.trim().length < 3) return setError('Escribe la dirección del consultorio o negocio.');
    if (locationDraft.map_url.trim() && !isValidUrl(locationDraft.map_url.trim())) return setError('El enlace de ubicación debe comenzar con https:// o http://.');
    setBusy(true); setError('');
    try {
      const payload = { name: locationDraft.name.trim() || 'Consultorio', address: locationDraft.address.trim(), map_url: locationDraft.map_url.trim() || null, display_order: editingLocationId ? workspace.locations.find((location) => location.id === editingLocationId)?.display_order ?? 0 : workspace.locations.length, is_active: true };
      if (editingLocationId) await updateLocation(editingLocationId, payload);
      else await addLocation(payload);
      clearLocationDraft(); setLocationDraft({ name: '', address: '', map_url: '' }); setEditingLocationId(null); await onSaved(editingLocationId ? 'La ubicación quedó actualizada.' : 'La ubicación se agregó.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No fue posible guardar la ubicación.'); } finally { setBusy(false); }
  };
  const editLocation = (location: ProfileWorkspace['locations'][number]) => { setEditingLocationId(location.id); setLocationDraft({ name: location.name, address: location.address, map_url: location.map_url ?? '' }); setError(''); };
  const removeLocation = async (id: string) => { setBusy(true); setError(''); try { await deleteLocation(id); if (editingLocationId === id) { setEditingLocationId(null); clearLocationDraft(); setLocationDraft({ name: '', address: '', map_url: '' }); } await onSaved('La ubicación se eliminó.'); } catch (caught) { setError(caught instanceof Error ? caught.message : 'No fue posible eliminar la ubicación.'); } finally { setBusy(false); } };
  return <div className="space-y-7"><form className="space-y-7" onSubmit={submit}><div className="flex items-center gap-5"><div className="grid h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-[#eef2ee] text-[#87948e]">{logoUrl ? <img src={logoUrl} alt="Logotipo" className="h-full w-full object-contain" /> : 'Logo'}</div><label className="nuth-button-secondary cursor-pointer"><ImagePlus size={17} />Cambiar logotipo<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => void uploadLogo(e.target.files?.[0])} /></label></div><div className="grid gap-6 sm:grid-cols-2"><Field label="Nombre del establecimiento" name="establishment"><Input id="establishment" maxLength={160} value={values.establishment_name} onChange={(e) => setValues({...values, establishment_name:e.target.value})} /></Field><Field label="Tipo de establecimiento" name="type"><Input id="type" maxLength={100} value={values.establishment_type} onChange={(e) => setValues({...values, establishment_type:e.target.value})} placeholder="Consultorio privado" /></Field></div><Field label="Dirección principal" name="address" hint="También puedes agregar varias ubicaciones abajo."><Textarea id="address" maxLength={500} value={values.address} onChange={(e) => setValues({...values, address:e.target.value})} /></Field><div className="grid gap-6 sm:grid-cols-2"><Field label="Institución (opcional)" name="institution"><Input id="institution" value={values.institution} onChange={(e) => setValues({...values, institution:e.target.value})} /></Field><Field label="Razón social (opcional)" name="legal-name"><Input id="legal-name" value={values.legal_name} onChange={(e) => setValues({...values, legal_name:e.target.value})} /></Field></div><Field label="Mensaje cuando estés inactivo" name="inactive"><Textarea id="inactive" maxLength={800} value={values.inactive_message} onChange={(e) => setValues({...values, inactive_message:e.target.value})} /></Field><SaveButton busy={busy} /></form><form className="border-t border-[#e3e9e4] pt-7" onSubmit={(event) => { event.preventDefault(); void saveLocation(); }}><div><h3 className="text-lg font-semibold">Ubicaciones</h3><p className="mt-1 text-sm text-[#74817d]">Agrega uno o varios consultorios. Cada ubicación tendrá su propio botón de mapa en tu página pública.</p></div><div className="mt-5 space-y-3">{workspace.locations.length ? workspace.locations.map((location) => <article key={location.id} className="flex items-start justify-between gap-4 rounded-2xl border border-[#dfe5e1] p-4"><div className="flex min-w-0 items-start gap-3"><MapPin className="mt-0.5 shrink-0 text-[#52796a]" size={19}/><div className="min-w-0"><p className="font-semibold">{location.name}</p><p className="mt-1 text-sm text-[#6d7b76]">{location.address}</p>{location.map_url && <a href={location.map_url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-[#52796a] underline">Abrir enlace guardado</a>}</div></div><div className="flex shrink-0 gap-1"><button type="button" onClick={() => editLocation(location)} className="p-2 text-[#456d5f]" aria-label={`Editar ${location.name}`}><Pencil size={17}/></button><button type="button" onClick={() => void removeLocation(location.id)} disabled={busy} className="p-2 text-[#984a39]" aria-label={`Eliminar ${location.name}`}><Trash2 size={17}/></button></div></article>) : <div className="rounded-2xl border border-dashed border-[#ced8d1] p-6 text-center text-sm text-[#7a8782]">Agrega tu primera ubicación.</div>}</div><div className="mt-5 rounded-2xl bg-[#f5f7f3] p-5"><div className="flex items-center justify-between gap-4"><h4 className="font-semibold">{editingLocationId ? 'Editar ubicación' : 'Agregar ubicación'}</h4>{editingLocationId && <button type="button" onClick={() => { setEditingLocationId(null); clearLocationDraft(); setLocationDraft({ name: '', address: '', map_url: '' }); }} className="text-sm font-semibold text-[#5c7169]">Cancelar</button>}</div><div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Nombre" name="location-name"><Input id="location-name" maxLength={120} value={locationDraft.name} onChange={(e) => setLocationDraft((current) => ({ ...current, name: e.target.value }))} placeholder="Consultorio Centro" /></Field><Field label="Dirección" name="location-address"><Input id="location-address" required maxLength={500} value={locationDraft.address} onChange={(e) => setLocationDraft((current) => ({ ...current, address: e.target.value }))} placeholder="Calle, número, colonia, ciudad" /></Field></div><div className="mt-4"><Field label="Enlace de mapa (opcional)" name="location-map" hint="Si lo dejas vacío, generaremos un enlace de Google Maps con la dirección."><Input id="location-map" type="url" maxLength={1000} value={locationDraft.map_url} onChange={(e) => setLocationDraft((current) => ({ ...current, map_url: e.target.value }))} placeholder="https://maps.google.com/..." /></Field></div><button type="submit" disabled={busy} className="nuth-button mt-5">{editingLocationId ? <Save size={17}/> : <Plus size={17}/>} {editingLocationId ? 'Guardar ubicación' : 'Agregar ubicación'}</button></div></form>{error && <p role="alert" className="text-sm text-[#984a39]">{error}</p>}</div>;
}

export function EducationSection({ workspace, onSaved }: SectionProps) {
  const currentYear = new Date().getFullYear();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft, clearDraft] = usePersistentState(`nuthrick:${workspace.profile.id}:education`, { degree: '', educationType: 'degree' as EducationType, institution: '', year: currentYear.toString() });
  const { degree, educationType, institution, year } = draft;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const resetForm = () => {
    setEditingId(null);
    setDraft({ degree: '', educationType: 'degree', institution: '', year: currentYear.toString() });
    setError('');
  };

  const startEditing = (item: ProfileWorkspace['education'][number]) => {
    setEditingId(item.id);
    setDraft({ degree: item.degree, educationType: item.education_type, institution: item.institution, year: item.graduation_year.toString() });
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
          education_type: educationType,
          institution: institution.trim(),
          graduation_year: parsed,
          display_order: current?.display_order ?? 0,
        });
        await onSaved('La formación quedó actualizada.');
      } else {
        await addEducation({
          degree: degree.trim(),
          education_type: educationType,
          institution: institution.trim(),
          graduation_year: parsed,
          display_order: workspace.education.length,
        });
        await onSaved('La formación se agregó.');
      }
      clearDraft();
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

  return <div><div className="space-y-3">{workspace.education.length ? workspace.education.map((item) => <article key={item.id} className="flex items-start justify-between gap-4 rounded-2xl border border-[#dfe5e1] p-5"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{item.degree}</h3><span className="rounded-full bg-[#edf4ef] px-2 py-1 text-[10px] font-semibold uppercase text-[#4b7163]">{educationTypeLabels[item.education_type]}</span></div><p className="mt-1 text-sm text-[#6c7975]">{item.institution} · {item.graduation_year}</p></div><div className="flex gap-1"><button type="button" onClick={() => startEditing(item)} className="p-2 text-[#456d5f]" aria-label={`Editar ${item.degree}`}><Pencil size={17} /></button><button type="button" onClick={() => void remove(item.id)} className="p-2 text-[#9b493a]" aria-label={`Eliminar ${item.degree}`}><Trash2 size={17} /></button></div></article>) : <div className="rounded-2xl border border-dashed border-[#ced8d1] p-7 text-center text-sm text-[#7a8782]">Agrega tu primera formación académica.</div>}</div><form className="mt-8 rounded-2xl bg-[#f5f7f3] p-5" onSubmit={save}><div className="flex items-center justify-between gap-4"><h3 className="font-semibold">{editingId ? 'Editar formación' : 'Agregar formación'}</h3>{editingId && <button type="button" onClick={resetForm} className="text-sm font-semibold text-[#5c7169]">Cancelar</button>}</div><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-[180px_1fr_1fr_120px]"><Field label="Tipo" name="education-type"><select id="education-type" className="nuth-input" value={educationType} onChange={(e) => setDraft((current) => ({ ...current, educationType: e.target.value as EducationType }))}>{[['degree','Grado académico'],['course','Curso'],['training','Capacitación'],['diploma','Diplomado'],['specialty','Especialidad'],['masters','Maestría'],['doctorate','Doctorado']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Nombre" name="degree"><Input id="degree" required minLength={2} maxLength={160} value={degree} onChange={(e) => setDraft((current) => ({ ...current, degree: e.target.value }))} placeholder="Ej. Nutrición clínica" /></Field><Field label="Institución" name="institution"><Input id="institution" required minLength={2} maxLength={200} value={institution} onChange={(e) => setDraft((current) => ({ ...current, institution: e.target.value }))} /></Field><Field label="Año" name="year"><Input id="year" type="number" min="1940" max={currentYear + 10} required value={year} onChange={(e) => setDraft((current) => ({ ...current, year: e.target.value }))} /></Field></div>{error && <p role="alert" className="mt-4 text-sm text-[#984a39]">{error}</p>}<button disabled={busy} className="nuth-button mt-5">{editingId ? <Save size={17} /> : <Plus size={17} />}{editingId ? 'Guardar cambios' : 'Agregar'}</button></form></div>;
}

export function LinksSection({ workspace, onSaved }: SectionProps) {
  const [draft, setDraft, clearDraft] = usePersistentState(`nuthrick:${workspace.profile.id}:links`, { type: 'custom' as LinkType, title: '', url: 'https://', slug: workspace.profile.public_slug??normalizeSlug(workspace.profile.full_name), country: workspace.profile.country??'', language: workspace.profile.language, isPublic: workspace.profile.is_public });
  const { type, title, url, slug, country, language, isPublic } = draft;
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const savePublicSettings=async()=>{const normalized=normalizeSlug(slug);if(normalized.length<3)return setError('El slug debe tener al menos 3 caracteres.');setBusy(true);setError('');try{await updateProfile(workspace.profile.id,{public_slug:normalized,country:country.trim()||null,language,is_public:isPublic});clearDraft();await onSaved(isPublic?'Tu página pública quedó actualizada.':'La página quedó en modo privado.');}catch(caught){setError(caught instanceof Error?caught.message:'No fue posible guardar el enlace público.');}finally{setBusy(false);}};
  const add=async(e:FormEvent)=>{e.preventDefault();if(!isValidUrl(url))return setError('Ingresa una URL completa que comience con https://');setBusy(true);try{await addLink({link_type:type,title:title.trim(),url:url.trim(),display_order:workspace.links.length,is_active:true});setDraft((current)=>({...current,title:'',url:'https://'}));await onSaved('El enlace se agregó.');}catch(caught){setError(caught instanceof Error?caught.message:'No fue posible agregarlo.');}finally{setBusy(false);}};
  const remove=async(id:string)=>{setBusy(true);setError('');try{await deleteLink(id);await onSaved('El enlace se eliminó.');}catch(caught){setError(caught instanceof Error?caught.message:'No fue posible eliminar el enlace.');}finally{setBusy(false);}};
  const toggleActive=async(id:string,isActive:boolean)=>{setBusy(true);setError('');try{await updateLink(id,{is_active:!isActive});await onSaved(isActive?'El enlace quedó oculto.':'El enlace quedó visible.');}catch(caught){setError(caught instanceof Error?caught.message:'No fue posible actualizar el enlace.');}finally{setBusy(false);}};
  return <div><section className="rounded-2xl border border-[#dfe5e1] p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-semibold">Página pública</h3><p className="mt-1 text-sm text-[#74817d]">Elige qué mostrar y publica tu perfil cuando esté listo.</p></div><label className="flex cursor-pointer items-center gap-3 rounded-full bg-[#f2f5f1] px-4 py-2 text-sm font-semibold"><input type="checkbox" checked={isPublic} onChange={(e)=>setDraft((current)=>({...current,isPublic:e.target.checked}))} />{isPublic?'Pública':'Privada'}</label></div><div className="mt-5 grid gap-5 sm:grid-cols-3"><Field label="Slug" name="public-slug"><Input id="public-slug" minLength={3} maxLength={80} value={slug} onChange={(e)=>setDraft((current)=>({...current,slug:normalizeSlug(e.target.value)}))} /></Field><Field label="País" name="link-country"><Input id="link-country" value={country} onChange={(e)=>setDraft((current)=>({...current,country:e.target.value}))} /></Field><Field label="Idioma" name="language"><select id="language" className="nuth-input" value={language} onChange={(e)=>setDraft((current)=>({...current,language:e.target.value}))}><option value="es">Español</option><option value="en">English</option></select></Field></div><button type="button" onClick={()=>void savePublicSettings()} disabled={busy} className="nuth-button mt-5"><Save size={17}/>{isPublic?'Publicar página':'Guardar página privada'}</button></section><div className="mt-8 space-y-3">{workspace.links.map((link)=><article key={link.id} className={`flex items-center justify-between gap-4 rounded-2xl border border-[#dfe5e1] p-4 ${link.is_active?'':'opacity-60'}`}><div className="min-w-0"><p className="font-semibold">{link.title}<span className="ml-2 rounded-full bg-[#eef2ee] px-2 py-0.5 text-[10px] font-medium uppercase text-[#71807a]">{link.link_type}</span>{!link.is_active&&<span className="ml-2 text-xs font-medium text-[#7c8984]">Oculto</span>}</p><a className="mt-1 block truncate text-sm text-[#557567] underline" href={link.url} target="_blank" rel="noreferrer">{link.url}</a></div><div className="flex items-center gap-1"><button type="button" onClick={()=>void toggleActive(link.id,link.is_active)} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-[#456d5f]" aria-label={`${link.is_active?'Ocultar':'Mostrar'} ${link.title}`}>{link.is_active?'Ocultar':'Mostrar'}</button><button type="button" onClick={()=>void remove(link.id)} className="p-2 text-[#984a39]" aria-label={`Eliminar ${link.title}`}><Trash2 size={17}/></button></div></article>)}</div><form className="mt-8 rounded-2xl bg-[#f5f7f3] p-5" onSubmit={add}><h3 className="font-semibold">Agregar enlace o red social</h3><div className="mt-5 grid gap-4 sm:grid-cols-[160px_1fr]"><Field label="Tipo" name="link-type"><select id="link-type" className="nuth-input" value={type} onChange={(e)=>setDraft((current)=>({...current,type:e.target.value as LinkType}))}>{['custom','whatsapp','instagram','facebook','tiktok','youtube'].map((item)=><option key={item} value={item}>{item}</option>)}</select></Field><Field label="Título" name="link-title"><Input id="link-title" required maxLength={80} value={title} onChange={(e)=>setDraft((current)=>({...current,title:e.target.value}))} placeholder="Mi ebook" /></Field></div><div className="mt-4"><Field label="URL" name="link-url"><Input id="link-url" type="url" required value={url} onChange={(e)=>setDraft((current)=>({...current,url:e.target.value}))} /></Field></div>{error&&<p role="alert" className="mt-4 text-sm text-[#984a39]">{error}</p>}<button disabled={busy} className="nuth-button mt-5"><Plus size={17}/>Agregar enlace</button></form></div>;
}

const weekdays=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
const educationTypeLabels: Record<EducationType, string> = { degree: 'Grado académico', course: 'Curso', training: 'Capacitación', diploma: 'Diplomado', specialty: 'Especialidad', masters: 'Maestría', doctorate: 'Doctorado' };
export function AvailabilitySection({ workspace,onSaved }:SectionProps){const settings=workspace.availability;const[settingsDraft,setSettingsDraft,clearSettingsDraft]=usePersistentState(`nuthrick:${workspace.profile.id}:availability-settings`,{duration:settings?.default_duration_minutes??60,timezone:settings?.timezone??workspace.profile.timezone,horizon:settings?.booking_horizon_days??60});const[slotDraft,setSlotDraft]=usePersistentState(`nuthrick:${workspace.profile.id}:availability-slot`,{weekday:1,start:'09:00',end:'13:00'});const{duration,timezone,horizon}=settingsDraft;const{weekday,start,end}=slotDraft;const[busy,setBusy]=useState(false);const[error,setError]=useState('');
  const saveSettings=async()=>{setError('');if(!isValidIanaTimezone(timezone))return setError('Usa una zona horaria IANA válida, por ejemplo America/Mexico_City.');setBusy(true);try{await saveAvailability({default_duration_minutes:duration,timezone,booking_horizon_days:horizon});clearSettingsDraft();await onSaved('La configuración de disponibilidad quedó guardada.');}catch(caught){setError(caught instanceof Error?caught.message:'No fue posible guardar.');}finally{setBusy(false);}};
  const add=async(e:FormEvent)=>{e.preventDefault();if(slotsOverlap({weekday,start_time:start,end_time:end},workspace.slots))return setError('El rango es inválido o se superpone con otro del mismo día.');setBusy(true);try{await addAvailabilitySlot({weekday,start_time:start,end_time:end});await onSaved('El horario se agregó.');}catch(caught){setError(caught instanceof Error?caught.message:'No fue posible agregar el horario.');}finally{setBusy(false);}};
  const remove=async(id:string)=>{setBusy(true);try{await deleteAvailabilitySlot(id);await onSaved('El horario se eliminó.');}finally{setBusy(false);}};
  return <div className="space-y-9"><section><h3 className="text-lg font-semibold">Preferencias de cita</h3><div className="mt-5 grid gap-5 sm:grid-cols-3"><Field label="Duración" name="duration"><select id="duration" className="nuth-input" value={duration} onChange={(e)=>setSettingsDraft((current)=>({...current,duration:Number(e.target.value)}))}>{[15,20,30,45,60,90,120].map((value)=><option key={value} value={value}>{value} minutos</option>)}</select></Field><Field label="Zona horaria" name="availability-timezone"><Input id="availability-timezone" value={timezone} onChange={(e)=>setSettingsDraft((current)=>({...current,timezone:e.target.value}))} /></Field><Field label="Anticipación para reservar" name="horizon" hint="Cuántos días hacia el futuro pueden solicitar una cita (1 a 365)."><Input id="horizon" type="number" min="1" max="365" value={horizon} onChange={(e)=>setSettingsDraft((current)=>({...current,horizon:Number(e.target.value)}))} /></Field></div><button type="button" onClick={()=>void saveSettings()} disabled={busy} className="nuth-button mt-5"><Save size={17}/>Guardar preferencias</button></section><section><h3 className="text-lg font-semibold">Horarios semanales</h3><div className="mt-4 grid gap-5 sm:grid-cols-2">{weekdays.map((day,index)=><div key={day} className="rounded-2xl border border-[#dfe5e1] p-4"><p className="font-semibold">{day}</p><div className="mt-3 space-y-2">{workspace.slots.filter((slot)=>slot.weekday===index).map((slot)=><div key={slot.id} className="flex items-center justify-between rounded-xl bg-[#f2f5f1] px-3 py-2 text-sm"><span>{slot.start_time.slice(0,5)} – {slot.end_time.slice(0,5)}</span><button type="button" onClick={()=>void remove(slot.id)} className="text-[#994a3a]" aria-label="Eliminar horario"><X size={16}/></button></div>)}{!workspace.slots.some((slot)=>slot.weekday===index)&&<p className="text-xs text-[#94a09b]">Sin disponibilidad</p>}</div></div>)}</div><form className="mt-6 rounded-2xl bg-[#f5f7f3] p-5" onSubmit={add}><div className="grid gap-4 sm:grid-cols-3"><Field label="Día" name="weekday"><select id="weekday" className="nuth-input" value={weekday} onChange={(e)=>setSlotDraft((current)=>({...current,weekday:Number(e.target.value)}))}>{weekdays.map((day,index)=><option key={day} value={index}>{day}</option>)}</select></Field><Field label="Desde" name="start"><Input id="start" type="time" value={start} onChange={(e)=>setSlotDraft((current)=>({...current,start:e.target.value}))} /></Field><Field label="Hasta" name="end"><Input id="end" type="time" value={end} onChange={(e)=>setSlotDraft((current)=>({...current,end:e.target.value}))} /></Field></div>{error&&<p role="alert" className="mt-4 text-sm text-[#984a39]">{error}</p>}<button disabled={busy} className="nuth-button mt-5"><Plus size={17}/>Agregar horario</button></form></section></div>;
}

export function PaymentsSection(){return <div className="grid min-h-72 place-items-center rounded-[28px] border border-dashed border-[#ccd7d0] bg-[#f8f9f6] text-center"><div><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#e9f1ec] text-2xl">$</span><h3 className="mt-5 text-2xl font-semibold">Pagos — Próximamente</h3><p className="mx-auto mt-3 max-w-md leading-7 text-[#6c7a75]">Esta sección está reservada para una fase futura. Aún no procesa cobros, comisiones ni suscripciones.</p></div></div>;}
