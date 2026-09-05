import { supabase } from '@/src/lib/supabase';
import type { CatalogMeasurement } from '@/src/services/consultationMeasurements';
import type { CatalogDevice, DeviceCapability, DeviceSession, ProfessionalDevice } from '@/src/features/bioimpedance/types';

type CapabilityRow = {
  measurement_type_id: string;
  manufacturer_variable_name: string;
  manufacturer_unit: string | null;
  display_order: number;
  measurement_types: CatalogMeasurement;
};

function mapCapabilities(rows: CapabilityRow[] | null | undefined): DeviceCapability[] {
  return (rows ?? []).map((row) => ({
    measurement_type_id: row.measurement_type_id,
    manufacturer_variable_name: row.manufacturer_variable_name,
    manufacturer_unit: row.manufacturer_unit,
    display_order: row.display_order,
    measurement: row.measurement_types,
  })).sort((a, b) => a.display_order - b.display_order);
}

export async function loadDeviceSettings() {
  const [catalogResult, devicesResult, customCapabilityResult, measurementsResult] = await Promise.all([
    supabase.from('measurement_devices').select('*').eq('is_system_device', true).eq('is_active', true).eq('validation_status', 'verified').order('manufacturer').order('model'),
    supabase.from('professional_devices').select('*, measurement_devices(*)').order('created_at'),
    supabase.from('professional_device_capabilities').select('*, measurement_types(*)').order('display_order'),
    supabase.from('measurement_types').select('*').or('category.eq.bioimpedance,code.eq.weight').eq('is_active', true).order('display_order'),
  ]);
  if (catalogResult.error || devicesResult.error || customCapabilityResult.error || measurementsResult.error) throw new Error('No pudimos cargar tus equipos de bioimpedancia.');
  const catalog = catalogResult.data as CatalogDevice[];
  const catalogIds = [...new Set([...catalog.map((item) => item.id), ...(devicesResult.data ?? []).map((item) => item.catalog_device_id).filter((id): id is string => Boolean(id))])];
  const { data: standardRows, error: standardError } = catalogIds.length
    ? await supabase.from('measurement_device_capabilities').select('*, measurement_types(*)').in('device_id', catalogIds).eq('mapping_status', 'verified').order('display_order')
    : { data: [], error: null };
  if (standardError) throw new Error('No pudimos cargar las capacidades de los equipos.');
  const standardByDevice = new Map<string, DeviceCapability[]>();
  for (const row of (standardRows ?? []) as Array<CapabilityRow & { device_id: string }>) standardByDevice.set(row.device_id, [...(standardByDevice.get(row.device_id) ?? []), ...mapCapabilities([row])]);
  const customByDevice = new Map<string, DeviceCapability[]>();
  for (const row of (customCapabilityResult.data ?? []) as Array<CapabilityRow & { professional_device_id: string }>) customByDevice.set(row.professional_device_id, [...(customByDevice.get(row.professional_device_id) ?? []), ...mapCapabilities([row])]);
  const devices = (devicesResult.data ?? []).map((row) => {
    const catalogDevice = (row.measurement_devices ?? null) as CatalogDevice | null;
    return { ...row, catalog_device: catalogDevice, capabilities: catalogDevice ? (standardByDevice.get(catalogDevice.id) ?? []) : (customByDevice.get(row.id) ?? []) } as ProfessionalDevice;
  });
  return { catalog, devices, measurements: measurementsResult.data as CatalogMeasurement[], standardByDevice };
}

export async function saveProfessionalDevice(device: Partial<ProfessionalDevice>, capabilityIds: string[]) {
  const { data, error } = await supabase.rpc('save_professional_device', { p_device: device, p_capability_ids: capabilityIds });
  if (error) throw new Error(error.message.includes('capability') ? 'Selecciona al menos una variable compatible.' : 'No pudimos guardar el equipo. Revisa los datos.');
  return data as ProfessionalDevice;
}

export async function setProfessionalDeviceActive(device: ProfessionalDevice, active: boolean) {
  return saveProfessionalDevice({ ...device, is_active: active, is_default: active && device.is_default, catalog_device: undefined, capabilities: undefined }, device.capabilities.map((item) => item.measurement_type_id));
}

export async function loadConsultationDeviceData(consultationId: string) {
  const settings = await loadDeviceSettings();
  const { data: sessions, error } = await supabase.from('consultation_device_sessions').select('*').eq('consultation_id', consultationId).order('created_at');
  if (error) throw new Error('No pudimos cargar las mediciones de los equipos.');
  const ids = (sessions ?? []).map((item) => item.id);
  const { data: values, error: valuesError } = ids.length
    ? await supabase.from('consultation_measurements').select('*').in('device_session_id', ids).order('created_at')
    : { data: [], error: null };
  if (valuesError) throw new Error('No pudimos cargar las mediciones de los equipos.');
  return {
    ...settings,
    sessions: (sessions ?? []).map((session) => ({ ...session, values: (values ?? []).filter((value) => value.device_session_id === session.id) })) as DeviceSession[],
  };
}

export async function saveDeviceMeasurements(consultationId: string, professionalDeviceId: string, values: Record<string, number>) {
  const { data, error } = await supabase.rpc('save_device_measurements', { p_consultation_id: consultationId, p_professional_device_id: professionalDeviceId, p_values: values, p_capture_source: 'manual' });
  if (error) {
    if (error.message.includes('outside the allowed')) throw new Error('Revisa los valores: alguno está fuera del rango permitido.');
    if (error.message.includes('incompatible')) throw new Error('El equipo seleccionado no reporta una de estas variables.');
    throw new Error('No pudimos guardar los datos del equipo.');
  }
  return data;
}
