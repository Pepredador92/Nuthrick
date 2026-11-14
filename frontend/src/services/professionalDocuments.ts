import type { ProfessionalDocumentInfo } from "../../../supabase/functions/agenda/document-letterhead";
import { getSignedMediaUrl } from "./media";
import { loadProfessionalDocumentProfile } from "./profile";

export async function getProfessionalDocumentInfo(userId: string, requireConfiguredLogo = false): Promise<ProfessionalDocumentInfo> {
  const workspace = await loadProfessionalDocumentProfile(userId);
  const contactLines = workspace.contacts.map((contact) => {
    const label = contact.label ? `${contact.label}: ` : "";
    return contact.contact_type === "phone"
      ? `${label}${contact.country_code ?? ""} ${contact.contact_value}`.trim()
      : `${label}${contact.contact_value}`;
  });
  const logoUrl = await getSignedMediaUrl(workspace.business?.logo_path);
  if (requireConfiguredLogo && workspace.business?.logo_path && !logoUrl)
    throw new Error("No pudimos cargar el logo del nutriólogo. Reintenta la exportación o revisa el logo en Perfil.");
  return {
    fullName: workspace.profile.full_name,
    professionalTitle: workspace.profile.professional_title,
    licenseNumber: workspace.profile.license_number,
    businessName: workspace.business?.establishment_name,
    businessAddress: workspace.business?.address ?? workspace.locations[0]?.address,
    contactLines,
    logoUrl,
  };
}
