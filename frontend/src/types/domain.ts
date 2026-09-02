export type CareModality = 'online' | 'in_person' | 'hybrid';
export type MediaCategory = 'avatar' | 'logo' | 'services';
export type LinkType = 'whatsapp' | 'tiktok' | 'facebook' | 'instagram' | 'youtube' | 'custom';
export type ContactType = 'phone' | 'email';
export type EducationType = 'degree' | 'course' | 'training' | 'diploma' | 'masters' | 'doctorate' | 'specialty';

export interface ProfessionalProfile {
  id: string;
  storage_key: string;
  full_name: string;
  professional_title: string | null;
  language: string;
  country: string | null;
  timezone: string;
  public_slug: string | null;
  avatar_path: string | null;
  biography: string | null;
  specialties: string[];
  care_modalities: CareModality[];
  spoken_languages: string[];
  approximate_fee: number | null;
  currency: string;
  license_number: string | null;
  custom_conditions: string[];
  onboarding_completed: boolean;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfessionalBusiness {
  id: string;
  professional_id: string;
  logo_path: string | null;
  establishment_name: string | null;
  address: string | null;
  establishment_type: string | null;
  institution: string | null;
  legal_name: string | null;
  inactive_message: string | null;
}

export interface ProfessionalContact {
  id: string;
  professional_id: string;
  contact_type: ContactType;
  label: string | null;
  country_code: string | null;
  contact_value: string;
  is_whatsapp: boolean;
  display_order: number;
}

export interface ProfessionalLocation {
  id: string;
  professional_id: string;
  name: string;
  address: string;
  map_url: string | null;
  display_order: number;
  is_active: boolean;
}

export interface EducationRecord {
  id: string;
  professional_id: string;
  degree: string;
  education_type: EducationType;
  institution: string;
  graduation_year: number;
  display_order: number;
}

export interface ProfessionalLink {
  id: string;
  professional_id: string;
  link_type: LinkType;
  title: string;
  url: string;
  display_order: number;
  is_active: boolean;
}

export interface ServiceImage {
  id: string;
  professional_id: string;
  storage_path: string;
  alt_text: string | null;
  display_order: number;
}

export interface CatalogOption {
  id: string;
  slug: string;
  name: string;
}

export interface AvailabilitySettings {
  professional_id: string;
  default_duration_minutes: number;
  timezone: string;
  booking_horizon_days: number;
}

export interface AvailabilitySlot {
  id: string;
  professional_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
}

export interface ProfileWorkspace {
  profile: ProfessionalProfile;
  business: ProfessionalBusiness | null;
  contacts: ProfessionalContact[];
  locations: ProfessionalLocation[];
  education: EducationRecord[];
  links: ProfessionalLink[];
  images: ServiceImage[];
  conditions: CatalogOption[];
  customConditionLabels: string[];
  populations: CatalogOption[];
  selectedConditionIds: string[];
  selectedPopulationIds: string[];
  availability: AvailabilitySettings | null;
  slots: AvailabilitySlot[];
}

export type PatientStatus = 'active' | 'inactive' | 'archived';
export type PatientGender = 'female' | 'male' | 'non_binary' | 'prefer_not_to_say' | 'other';

export interface Patient {
  id: string;
  professional_id: string;
  full_name: string;
  email: string | null;
  country_code: string | null;
  timezone: string;
  phone: string | null;
  weight_kg: number | null;
  height_cm: number | null;
  gender: PatientGender | null;
  birth_date: string | null;
  portal_access_enabled: boolean;
  status: PatientStatus;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
  tags?: PatientTag[];
}

export interface PatientTag { id: string; professional_id: string; name: string; color: string; created_at: string; }
export interface PatientMeasurement { id: string; professional_id: string; patient_id: string; consultation_id: string | null; measured_at: string; weight_kg: number; height_cm: number; bmi: number; ideal_weight_kg: number | null; ideal_weight_method: string | null; notes: string | null; created_at: string; }
export interface Consultation { id: string; professional_id: string; patient_id: string; consultation_type: 'initial' | 'follow_up'; sequence_number: number; consultation_date: string; status: 'planned' | 'completed' | 'cancelled'; summary: string | null; created_at: string; updated_at: string; }
export interface ConsultationNote { id: string; professional_id: string; consultation_id: string; patient_id: string; note: string; created_at: string; updated_at: string; }
export interface PatientProgressPhoto { id: string; professional_id: string; patient_id: string; storage_path: string; captured_at: string; caption: string | null; created_at: string; signedUrl?: string; }
export interface PatientNote { id: string; professional_id: string; patient_id: string; consultation_id: string | null; content: string; created_at: string; updated_at: string; deleted_at: string | null; }
export interface QuestionnaireSubmission { id: string; professional_id: string; patient_id: string; consultation_id: string | null; questionnaire_type: 'initial' | 'follow_up'; version: number; status: 'draft' | 'completed'; submitted_at: string | null; created_at: string; updated_at: string; }
export interface QuestionnaireResponse { id: string; professional_id: string; submission_id: string; section_key: string; question_key: string; value: unknown; created_at: string; updated_at: string; }
export interface NutritionPlan { id: string; professional_id: string; patient_id: string; consultation_id: string | null; assigned_at: string; review_date: string | null; plan_type: string | null; category: string | null; target_calories: number | null; status: 'active' | 'archived'; created_at: string; updated_at: string; }

export interface PublicProfileContent {
  slug: string;
  name: string;
  professionalTitle?: string;
  avatarPath?: string;
  avatarUrl?: string;
  biography?: string;
  specialties: string[];
  careModalities: CareModality[];
  spokenLanguages: string[];
  approximateFee?: number;
  currency?: string;
  licenseNumber?: string;
  country?: string;
  conditions: string[];
  populations: string[];
  contacts?: Array<{ type: ContactType; label?: string; countryCode?: string; value: string; isWhatsapp?: boolean }>;
  education: Array<{ degree: string; educationType?: EducationType; institution: string; graduationYear: number }>;
  business?: {
    logoPath?: string;
    logoUrl?: string;
    name?: string;
    address?: string;
    type?: string;
    institution?: string;
    inactiveMessage?: string;
    locations?: Array<{ name: string; address: string; mapUrl?: string }>;
  };
  locations?: Array<{ name: string; address: string; mapUrl?: string }>;
  links: Array<{ type: LinkType; title: string; url: string }>;
  gallery: Array<{ path: string; url?: string; alt?: string }>;
  availability?: {
    settings?: { durationMinutes: number; timezone: string; bookingHorizonDays: number };
    weeklySlots: Array<{ weekday: number; startTime: string; endTime: string }>;
  };
}
