import { Activity, ChevronDown, Info, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Consultation } from '@/src/types/domain';
import { deviceLabel, type DeviceSession, type ProfessionalDevice } from '@/src/features/bioimpedance/types';
import { loadConsultationDeviceData, saveDeviceMeasurements } from '@/src/services/bioimpedance';

const display = (value: string | number | boolean) => typeof value === 'boolean' ? String(value) : String(value);

export function BioimpedanceCapture({ consultation }: { consultation: Consultation }) {
  const [devices, setDevices] = useState<ProfessionalDevice[]>([]);
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const reload = async () => { const data=await loadConsultationDeviceData(consultation.id); setDevices(data.devices); setSessions(data.sessions); setLoading(false); return data; };
  useEffect(() => { const timer=window.setTimeout(() => { void loadConsultationDeviceData(consultation.id).then((data) => { setDevices(data.devices); setSessions(data.sessions); setLoading(false); }).catch(() => { setNotice('No pudimos cargar tus equipos.'); setLoading(false); }); },0); return () => window.clearTimeout(timer); }, [consultation.id]);
  const activeDevices = devices.filter((device) => device.is_active);
  const selected = devices.find((device) => device.id === selectedId);
  const session = sessions.find((item) => item.professional_device_id === selectedId);
  const grouped = useMemo(() => ({
    general: selected?.capabilities.filter((item) => item.measurement.subcategory !== 'segmental') ?? [],
    segmental: selected?.capabilities.filter((item) => item.measurement.subcategory === 'segmental') ?? [],
  }), [selected]);
  const selectDevice = (id: string) => {
    if (dirty && !window.confirm('Tienes datos sin guardar. Si cambias de equipo se descartarán.')) return;
    setSelectedId(id); setDirty(false); setNotice('');
    const existing=sessions.find((item) => item.professional_device_id===id);
    setValues(existing ? Object.fromEntries(existing.values.map((item) => [item.measurement_type_id, display(item.value)])) : {});
  };
  const save = async () => {
    if (!selected) return;
    const payload=Object.fromEntries(Object.entries(values).filter(([,value]) => value.trim()!=='' && Number.isFinite(Number(value))).map(([id,value]) => [id,Number(value)]));
    if (!Object.keys(payload).length) { setNotice('Captura al menos un valor antes de guardar.'); return; }
    setSaving(true); setNotice('');
    try { await saveDeviceMeasurements(consultation.id,selected.id,payload); const data=await reload(); const refreshed=data.sessions.find((item) => item.professional_device_id===selected.id); if (refreshed) setValues(Object.fromEntries(refreshed.values.map((item) => [item.measurement_type_id,display(item.value)]))); setDirty(false); setNotice('Datos del equipo guardados con su procedencia.'); }
    catch(caught){ setNotice(caught instanceof Error ? caught.message : 'No pudimos guardar los datos.'); }
    finally { setSaving(false); }
  };
  if (loading) return <section className="mt-8 rounded-[24px] border border-[#dfe5e1] bg-white p-5 text-sm text-[#71807b]">Cargando equipos de bioimpedancia…</section>;
  return <section className="mt-8 rounded-[24px] border border-[#dfe5e1] bg-white p-4 shadow-sm sm:p-6">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><Activity size={19} className="text-[#b97639]" /><h3 className="text-lg font-semibold text-[#173d36]">Bioimpedancia</h3></div><p className="mt-1 max-w-2xl text-sm leading-6 text-[#6f7d78]">Valores registrados desde un equipo. Se conservan separados de los datos calculados por Nuthrick.</p></div></div>
    {!activeDevices.length && <div className="mt-5 rounded-2xl bg-[#f5f7f4] p-4 text-sm text-[#5f706a]">Aún no tienes equipos activos. Agrégalos en <strong>Perfil → Equipos</strong>. Puedes continuar la consulta sin bioimpedancia.</div>}
    {activeDevices.length>0 && <><label className="mt-5 block max-w-xl text-sm font-semibold text-[#334b43]">Equipo utilizado<div className="relative mt-2"><select value={selectedId} onChange={(event) => selectDevice(event.target.value)} className="w-full appearance-none rounded-xl border border-[#ced9d3] bg-white px-3 py-3 pr-10 font-normal"><option value="">Seleccionar equipo…</option>{activeDevices.map((device) => <option key={device.id} value={device.id}>{deviceLabel(device)}{device.is_default?' · Habitual':''}</option>)}</select><ChevronDown size={17} className="pointer-events-none absolute right-3 top-3.5 text-[#64736e]" /></div></label>
    {selected && <div className="mt-6"><div className="rounded-2xl bg-[#f4f7f3] px-4 py-3 text-xs leading-5 text-[#5e6f68]"><strong className="text-[#173d36]">{selected.catalog_device ? `${selected.catalog_device.manufacturer} ${selected.catalog_device.model}` : `${selected.custom_manufacturer} ${selected.custom_model}`}</strong> · captura manual desde el equipo. Cambiar esta selección nunca reasigna valores ya guardados.</div>{session && <p className="mt-3 text-xs font-medium text-[#39705d]">Ya hay datos guardados con este equipo; puedes corregirlos mientras la consulta siga en borrador.</p>}
      <CapabilityGroup title="Composición general" items={grouped.general} values={values} onChange={(id,value) => { setValues((current)=>({...current,[id]:value})); setDirty(true); }} />
      {grouped.segmental.length>0 && <CapabilityGroup title="Datos segmentales" items={grouped.segmental} values={values} onChange={(id,value) => { setValues((current)=>({...current,[id]:value})); setDirty(true); }} />}
      <div className="mt-6 flex justify-end"><button type="button" disabled={saving||!dirty} onClick={() => void save()} className="nuth-button-primary"><Save size={16}/>{saving?'Guardando…':'Guardar datos del equipo'}</button></div></div>}</>}
    {notice && <p role="status" className="mt-4 rounded-xl bg-[#f4f7f3] px-4 py-3 text-sm text-[#3e5d52]">{notice}</p>}
    {sessions.length>0 && <div className="mt-8 border-t border-[#e1e7e3] pt-6"><h4 className="font-semibold text-[#173d36]">Registros guardados</h4><div className="mt-3 space-y-3">{sessions.map((saved) => <SavedSession key={saved.id} session={saved} devices={devices} />)}</div></div>}
  </section>;
}

function CapabilityGroup({ title, items, values, onChange }: { title:string; items:NonNullable<ProfessionalDevice['capabilities']>; values:Record<string,string>; onChange:(id:string,value:string)=>void }) { return <div className="mt-6"><h4 className="text-sm font-semibold text-[#173d36]">{title}</h4><div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map((item) => <label key={item.measurement_type_id} className="min-w-0 text-sm font-medium text-[#354b44]"><span className="block truncate" title={item.manufacturer_variable_name}>{item.measurement.display_name}</span><span className="mt-1 block text-[11px] font-normal text-[#7a8782]">Como aparece en el equipo: {item.manufacturer_variable_name}</span><div className="relative mt-2"><input type="number" inputMode="decimal" step={10**-item.measurement.decimal_places} min={item.measurement.min_value} max={item.measurement.max_value} value={values[item.measurement_type_id]??''} onChange={(event)=>onChange(item.measurement_type_id,event.target.value)} className="w-full rounded-xl border border-[#d5dfda] bg-white px-3 py-2.5 pr-14 font-normal" /><span className="absolute right-3 top-2.5 text-xs text-[#6d7b76]">{item.measurement.unit}</span></div></label>)}</div></div>; }

function SavedSession({ session, devices }: { session:DeviceSession; devices:ProfessionalDevice[] }) { const device=devices.find((item)=>item.id===session.professional_device_id); const nameById=new Map(device?.capabilities.map((item)=>[item.measurement_type_id,item])??[]); return <details className="rounded-2xl border border-[#dde5e0] bg-[#fcfdfb] p-4"><summary className="cursor-pointer list-none"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#173d36]">{session.device_snapshot.alias} · {session.device_snapshot.manufacturer} {session.device_snapshot.model}</p><p className="mt-1 text-xs text-[#74817d]">{session.values.length} valores · {new Date(session.measured_at).toLocaleString('es-MX')}</p></div><Info size={17} className="shrink-0 text-[#71807b]" /></div></summary><div className="mt-4 grid gap-2 sm:grid-cols-2">{session.values.map((value) => { const cap=nameById.get(value.measurement_type_id); return <div key={value.id} className="rounded-xl bg-white px-3 py-2 text-sm"><span className="text-[#65746f]">{cap?.measurement.display_name || value.source_metadata?.manufacturer_variable_name || value.measurement_type_id}</span><strong className="float-right text-[#173d36]">{display(value.value)} {value.unit}</strong><small className="mt-1 block text-[#88938f]">Origen: {value.source_metadata?.manufacturer_variable_name || cap?.manufacturer_variable_name || 'Variable del equipo'}{value.source_metadata?.manufacturer_unit ? ` · ${value.source_metadata.manufacturer_unit}` : ''}</small></div>; })}</div><div className="mt-4 border-t border-[#e4e9e6] pt-3 text-xs leading-5 text-[#6d7b76]">Procedencia: {session.device_snapshot.is_standard?'catálogo verificado':'equipo personalizado'} · captura {session.capture_source}. Alias histórico: {session.device_snapshot.alias}{session.device_snapshot.serial_number?` · Serie ${session.device_snapshot.serial_number}`:''}. La desactivación o cambio de alias del equipo no modifica este registro.</div></details>; }
