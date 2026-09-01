export type CareModality = 'online' | 'in_person' | 'hybrid';
export type MediaCategory = 'avatar' | 'logo' | 'services';
export type LinkType = 'whatsapp' | 'tiktok' | 'facebook' | 'instagram' | 'youtube' | 'custom';

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

export interface EducationRecord {
  id: string;
  professional_id: string;
  degree: string;
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
  education: EducationRecord[];
  links: ProfessionalLink[];
  images: ServiceImage[];
  conditions: CatalogOption[];
  populations: CatalogOption[];
  selectedConditionIds: string[];
  selectedPopulationIds: string[];
  availability: AvailabilitySettings | null;
  slots: AvailabilitySlot[];
}

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
  education: Array<{ degree: string; institution: string; graduationYear: number }>;
  business?: {
    logoPath?: string;
    logoUrl?: string;
    name?: string;
    address?: string;
    type?: string;
    institution?: string;
    inactiveMessage?: string;
  };
  links: Array<{ type: LinkType; title: string; url: string }>;
  gallery: Array<{ path: string; url?: string; alt?: string }>;
  availability?: {
    settings?: { durationMinutes: number; timezone: string; bookingHorizonDays: number };
    weeklySlots: Array<{ weekday: number; startTime: string; endTime: string }>;
  };
}
