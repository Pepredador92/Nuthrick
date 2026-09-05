import type { CatalogMeasurement, ConsultationMeasurement } from '@/src/services/consultationMeasurements';

export type CatalogDevice = {
  id: string;
  manufacturer: string;
  model: string;
  commercial_name: string | null;
  family: string | null;
  technology: string;
  notes: string;
  is_segmental: boolean;
  validation_status: 'verified' | 'partial' | 'pending' | 'legacy';
  source_title: string | null;
  source_url: string | null;
};

export type DeviceCapability = {
  measurement_type_id: string;
  manufacturer_variable_name: string;
  manufacturer_unit: string | null;
  display_order: number;
  measurement: CatalogMeasurement;
};

export type ProfessionalDevice = {
  id: string;
  catalog_device_id: string | null;
  custom_manufacturer: string | null;
  custom_model: string | null;
  custom_name: string | null;
  alias: string;
  serial_number: string | null;
  internal_id: string | null;
  is_active: boolean;
  is_default: boolean;
  catalog_device?: CatalogDevice | null;
  capabilities: DeviceCapability[];
};

export type DeviceSession = {
  id: string;
  professional_device_id: string;
  capture_source: 'manual' | 'imported' | 'integration' | 'other';
  device_snapshot: {
    alias: string;
    serial_number?: string | null;
    internal_id?: string | null;
    manufacturer: string;
    model: string;
    commercial_name: string;
    technology: string;
    is_standard: boolean;
  };
  measured_at: string;
  created_at: string;
  values: ConsultationMeasurement[];
};

export function deviceLabel(device: ProfessionalDevice) {
  const model = device.catalog_device?.commercial_name || device.custom_name || device.custom_model;
  return `${device.alias} · ${model || 'Equipo personalizado'}`;
}

