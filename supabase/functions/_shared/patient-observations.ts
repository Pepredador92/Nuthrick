export const isPatientObservation = (source: string) =>
  /^(?:Nota de la consulta|Nota previa|Avance de objetivo|Avance de estrategia) · /.test(source);
