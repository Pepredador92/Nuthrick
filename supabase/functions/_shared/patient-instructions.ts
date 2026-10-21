// Keep generation below the editable document's capacity, including multiple
// proposals and the professional's own additions. The patient portal uses the
// same document capacity. Never shorten patient text with substring/slice.
export const PATIENT_INSTRUCTION_MAX_LENGTH = 2000;
export const PATIENT_INSTRUCTIONS_DOCUMENT_MAX_LENGTH = 12000;
