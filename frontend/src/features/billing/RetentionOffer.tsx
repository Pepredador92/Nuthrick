import { useState } from "react";
import { dateLabel, money } from "./api";

export type RetentionOfferData = {
  eligible: boolean;
  current: boolean;
  amount: number;
  currency: string;
  duration_days: number;
  cycle_days: number;
  starts_at: string | null;
  ends_at: string | null;
  patient_ids: string[];
  retry_operation_key?: string | null;
  patients: { id: string; name: string }[];
};

export function RetentionOffer({ offer, busy, onConfirm }: {
  offer: RetentionOfferData;
  busy: boolean;
  onConfirm: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>(offer.retry_operation_key ? offer.patient_ids : []);
  const [search, setSearch] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  if (!offer.eligible) return null;
  return (
    <section className="billing-retention" aria-labelledby="retention-title">
      <h4 id="retention-title">Respaldo · conserva tu espacio durante 90 días</h4>
      <p>{money(offer.amount, offer.currency)} MXN cada 30 días. Hasta tres cobros; empieza cuando termine tu período pagado.</p>
      <button className="admin-button secondary" aria-expanded={expanded} aria-controls="retention-details" onClick={() => setExpanded(value => !value)} disabled={busy}>
        {expanded ? "Ocultar detalles de Respaldo" : "Ver Respaldo y elegir pacientes"}
      </button>
      <div id="retention-details" hidden={!expanded}>
      <p>Trabaja con hasta 5 pacientes elegidos, con consultas, planes, agenda y mensajes. Los demás expedientes se conservan en lectura. Incluye exportación básica.</p>
      <p>Sin funciones ni créditos IA incluidos. Tus créditos adicionales se conservan para cuando vuelvas a un plan con IA disponible.</p>
      <p>Al terminar, tu cuenta queda en lectura y exportación. Puedes volver a un plan habitual desde Mi plan; no se contratará automáticamente.</p>
      <label className="admin-field">
        Buscar pacientes para Respaldo
        <input value={search} onChange={event => setSearch(event.target.value)} disabled={busy} placeholder="Nombre del paciente" />
      </label>
      <fieldset disabled={busy}>
        <legend>{selected.length} de 5 pacientes elegidos</legend>
        <div className="billing-retention-patients">
          {offer.patients.filter(patient => patient.name.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es"))).map(patient => (
            <label key={patient.id}>
              <input type="checkbox" checked={selected.includes(patient.id)}
                disabled={Boolean(offer.retry_operation_key) || (!selected.includes(patient.id) && selected.length >= 5)}
                onChange={event => {
                  setSelected(current => event.target.checked ? [...current, patient.id] : current.filter(id => id !== patient.id));
                  setReviewed(false);
                }} />
              {patient.name}
            </label>
          ))}
          {!offer.patients.length && <p>No tienes pacientes activos.</p>}
        </div>
        <p>Esta selección se conserva durante Respaldo. Si eliges menos de cinco, podrás ocupar los lugares restantes con nuevos pacientes. Revisa los nombres antes de confirmar.</p>
        <label className="billing-retention-consent">
          <input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />
          Revisé mis pacientes y acepto los cobros de $149 cada 30 días, por un máximo de 90 días.
        </label>
      </fieldset>
      <button className="admin-button" disabled={busy || !reviewed} onClick={() => onConfirm(selected)}>
        {busy ? "Programando…" : "Programar Respaldo"}
      </button>
      </div>
    </section>
  );
}

export function RetentionStatus({ offer }: { offer: RetentionOfferData }) {
  if (!offer.current || !offer.ends_at) return null;
  return <div className="billing-benefits" role="status">
    <strong>Respaldo · hasta {dateLabel(offer.ends_at)}</strong>
    <p>Desde {dateLabel(offer.starts_at)} · $149 MXN cada 30 días · máximo 3 cobros.</p>
    <p>{offer.patient_ids.length} pacientes elegidos. Los demás expedientes se conservan en lectura.</p>
    {offer.patient_ids.length > 0 && <ul className="list-disc pl-5">
      {offer.patient_ids.map(id => <li key={id}>{offer.patients.find(patient => patient.id === id)?.name ?? "Paciente seleccionado"}</li>)}
    </ul>}
    <p>Al terminar no habrá otra renovación de Respaldo. Elige un plan habitual para seguir trabajando.</p>
  </div>;
}
