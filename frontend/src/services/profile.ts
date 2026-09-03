import { supabase } from "@/src/lib/supabase";
import type {
  AvailabilitySettings,
  AvailabilitySlot,
  CatalogOption,
  ProfessionalContact,
  EducationRecord,
  ProfessionalBusiness,
  ProfessionalLocation,
  ProfessionalLink,
  ProfessionalProfile,
  ProfileWorkspace,
  PublicProfileContent,
  ServiceImage,
} from "@/src/types/domain";
import { getSignedMediaUrls } from "./media";

function unwrap<T>(result: {
  data: T | null;
  error: { message: string } | null;
}): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null)
    throw new Error("No se encontraron los datos solicitados.");
  return result.data;
}

export async function fetchOwnProfile(
  userId: string,
): Promise<ProfessionalProfile | null> {
  const { data, error } = await supabase
    .from("professional_profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as ProfessionalProfile | null;
}

export async function ensureOwnProfile(
  userId: string,
): Promise<ProfessionalProfile> {
  const current = await fetchOwnProfile(userId);
  if (current) return current;
  const { error } = await supabase
    .from("professional_profiles")
    .insert({ id: userId });
  if (error && error.code !== "23505") throw error;
  const created = await fetchOwnProfile(userId);
  if (!created) throw new Error("No fue posible crear el perfil profesional.");
  return created;
}

export async function loadProfileWorkspace(
  userId: string,
): Promise<ProfileWorkspace> {
  const profile = await ensureOwnProfile(userId);
  const [
    business,
    contacts,
    locations,
    education,
    links,
    images,
    conditions,
    populations,
    selectedConditions,
    selectedPopulations,
    availability,
    slots,
  ] = await Promise.all([
    supabase.from("professional_businesses").select("*").maybeSingle(),
    supabase.from("professional_contacts").select("*").order("display_order"),
    supabase.from("professional_locations").select("*").order("display_order"),
    supabase.from("professional_education").select("*").order("display_order"),
    supabase.from("professional_links").select("*").order("display_order"),
    supabase
      .from("professional_service_images")
      .select("*")
      .order("display_order"),
    supabase
      .from("conditions")
      .select("id,slug,name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("patient_populations")
      .select("id,slug,name")
      .eq("is_active", true)
      .order("name"),
    supabase.from("professional_conditions").select("condition_id"),
    supabase.from("professional_populations").select("population_id"),
    supabase.from("availability_settings").select("*").maybeSingle(),
    supabase
      .from("availability_slots")
      .select("*")
      .order("weekday")
      .order("start_time"),
  ]);

  for (const result of [
    business,
    contacts,
    locations,
    education,
    links,
    images,
    conditions,
    populations,
    selectedConditions,
    selectedPopulations,
    availability,
    slots,
  ]) {
    if (result.error) throw new Error(result.error.message);
  }

  return {
    profile,
    business: business.data as ProfessionalBusiness | null,
    contacts: (contacts.data ?? []) as ProfessionalContact[],
    locations: (locations.data ?? []) as ProfessionalLocation[],
    education: (education.data ?? []) as EducationRecord[],
    links: (links.data ?? []) as ProfessionalLink[],
    images: (images.data ?? []) as ServiceImage[],
    conditions: (conditions.data ?? []) as CatalogOption[],
    populations: (populations.data ?? []) as CatalogOption[],
    customConditionLabels: profile.custom_conditions ?? [],
    selectedConditionIds: (selectedConditions.data ?? []).map(
      (row) => row.condition_id as string,
    ),
    selectedPopulationIds: (selectedPopulations.data ?? []).map(
      (row) => row.population_id as string,
    ),
    availability: availability.data as AvailabilitySettings | null,
    slots: (slots.data ?? []) as AvailabilitySlot[],
  };
}

export async function loadProfessionalDocumentProfile(userId: string): Promise<{
  profile: ProfessionalProfile;
  business: ProfessionalBusiness | null;
  contacts: ProfessionalContact[];
  locations: ProfessionalLocation[];
}> {
  const profile = await ensureOwnProfile(userId);
  const [business, contacts, locations] = await Promise.all([
    supabase.from("professional_businesses").select("*").maybeSingle(),
    supabase.from("professional_contacts").select("*").order("display_order"),
    supabase
      .from("professional_locations")
      .select("*")
      .eq("is_active", true)
      .order("display_order"),
  ]);
  if (business.error) throw new Error(business.error.message);
  if (contacts.error) throw new Error(contacts.error.message);
  if (locations.error) throw new Error(locations.error.message);
  return {
    profile,
    business: business.data as ProfessionalBusiness | null,
    contacts: (contacts.data ?? []) as ProfessionalContact[],
    locations: (locations.data ?? []) as ProfessionalLocation[],
  };
}

export async function updateProfile(
  userId: string,
  values: Partial<ProfessionalProfile>,
): Promise<ProfessionalProfile> {
  const { data, error } = await supabase
    .from("professional_profiles")
    .update(values)
    .eq("id", userId)
    .select()
    .single();
  const updated = unwrap({ data: data as ProfessionalProfile | null, error });
  if (values.full_name !== undefined) {
    await supabase.auth.updateUser({ data: { full_name: updated.full_name } });
  }
  return updated;
}

export async function saveBusiness(
  values: Partial<ProfessionalBusiness>,
): Promise<ProfessionalBusiness> {
  const { data, error } = await supabase
    .from("professional_businesses")
    .upsert(values, { onConflict: "professional_id" })
    .select()
    .single();
  return unwrap({ data: data as ProfessionalBusiness | null, error });
}

export async function addContact(
  values: Omit<ProfessionalContact, "id" | "professional_id">,
): Promise<ProfessionalContact> {
  const { data, error } = await supabase
    .from("professional_contacts")
    .insert(values)
    .select()
    .single();
  return unwrap({ data: data as ProfessionalContact | null, error });
}

export async function deleteContact(id: string): Promise<void> {
  const { error } = await supabase
    .from("professional_contacts")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function addLocation(
  values: Omit<ProfessionalLocation, "id" | "professional_id">,
): Promise<ProfessionalLocation> {
  const { data, error } = await supabase
    .from("professional_locations")
    .insert(values)
    .select()
    .single();
  return unwrap({ data: data as ProfessionalLocation | null, error });
}

export async function updateLocation(
  id: string,
  values: Pick<
    ProfessionalLocation,
    "name" | "address" | "map_url" | "display_order" | "is_active"
  >,
): Promise<ProfessionalLocation> {
  const { data, error } = await supabase
    .from("professional_locations")
    .update(values)
    .eq("id", id)
    .select()
    .single();
  return unwrap({ data: data as ProfessionalLocation | null, error });
}

export async function deleteLocation(id: string): Promise<void> {
  const { error } = await supabase
    .from("professional_locations")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function addEducation(
  values: Omit<EducationRecord, "id" | "professional_id">,
): Promise<EducationRecord> {
  const { data, error } = await supabase
    .from("professional_education")
    .insert(values)
    .select()
    .single();
  return unwrap({ data: data as EducationRecord | null, error });
}

export async function updateEducation(
  id: string,
  values: Pick<
    EducationRecord,
    | "degree"
    | "education_type"
    | "institution"
    | "graduation_year"
    | "display_order"
  >,
): Promise<EducationRecord> {
  const { data, error } = await supabase
    .from("professional_education")
    .update(values)
    .eq("id", id)
    .select()
    .single();
  return unwrap({ data: data as EducationRecord | null, error });
}

export async function deleteEducation(id: string): Promise<void> {
  const { error } = await supabase
    .from("professional_education")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function addLink(
  values: Omit<ProfessionalLink, "id" | "professional_id">,
): Promise<ProfessionalLink> {
  const { data, error } = await supabase
    .from("professional_links")
    .insert(values)
    .select()
    .single();
  return unwrap({ data: data as ProfessionalLink | null, error });
}

export async function updateLink(
  id: string,
  values: Partial<
    Pick<
      ProfessionalLink,
      "link_type" | "title" | "url" | "display_order" | "is_active"
    >
  >,
): Promise<ProfessionalLink> {
  const { data, error } = await supabase
    .from("professional_links")
    .update(values)
    .eq("id", id)
    .select()
    .single();
  return unwrap({ data: data as ProfessionalLink | null, error });
}

export async function deleteLink(id: string): Promise<void> {
  const { error } = await supabase
    .from("professional_links")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function addServiceImage(
  values: Omit<ServiceImage, "id" | "professional_id">,
): Promise<ServiceImage> {
  const { data, error } = await supabase
    .from("professional_service_images")
    .insert(values)
    .select()
    .single();
  return unwrap({ data: data as ServiceImage | null, error });
}

export async function deleteServiceImage(id: string): Promise<void> {
  const { error } = await supabase
    .from("professional_service_images")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function replaceCatalogSelections(
  kind: "conditions" | "populations",
  ids: string[],
): Promise<void> {
  const rpc =
    kind === "conditions"
      ? "set_professional_conditions"
      : "set_professional_populations";
  const argument =
    kind === "conditions" ? { condition_ids: ids } : { population_ids: ids };
  const { error } = await supabase.rpc(rpc, argument);
  if (error) throw error;
}

export async function saveAvailability(
  values: Omit<AvailabilitySettings, "professional_id">,
): Promise<AvailabilitySettings> {
  const { data, error } = await supabase
    .from("availability_settings")
    .upsert(values)
    .select()
    .single();
  return unwrap({ data: data as AvailabilitySettings | null, error });
}

export async function addAvailabilitySlot(
  values: Omit<AvailabilitySlot, "id" | "professional_id">,
): Promise<AvailabilitySlot> {
  const { data, error } = await supabase
    .from("availability_slots")
    .insert(values)
    .select()
    .single();
  return unwrap({ data: data as AvailabilitySlot | null, error });
}

export async function deleteAvailabilitySlot(id: string): Promise<void> {
  const { error } = await supabase
    .from("availability_slots")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function getPublicProfile(
  slug: string,
): Promise<PublicProfileContent | null> {
  const { data, error } = await supabase
    .from("public_professional_pages")
    .select("content")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const content = data.content as unknown as PublicProfileContent;
  const paths = [
    content.avatarPath,
    content.business?.logoPath,
    ...content.gallery.map((image) => image.path),
  ].filter((path): path is string => Boolean(path));
  const signed = await getSignedMediaUrls(paths);

  return {
    ...content,
    avatarUrl: content.avatarPath ? signed.get(content.avatarPath) : undefined,
    business: content.business
      ? {
          ...content.business,
          logoUrl: content.business.logoPath
            ? signed.get(content.business.logoPath)
            : undefined,
        }
      : undefined,
    gallery: content.gallery.map((image) => ({
      ...image,
      url: signed.get(image.path),
    })),
  };
}
