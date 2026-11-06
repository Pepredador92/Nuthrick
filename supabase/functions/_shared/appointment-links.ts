// A dedicated patient-facing URL keeps shared invitations separate from the
// marketing site's preview. Old invitations remain valid through the alias.
export const APPOINTMENT_PATIENT_PATH = '/agenda/tu-cita';
export const APPOINTMENT_PATIENT_PATHS = [APPOINTMENT_PATIENT_PATH, '/agenda/confirmar'] as const;
