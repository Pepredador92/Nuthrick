import { useState } from "react";
import { formatPatientDate } from "@/src/features/patients/patientUtils";

const schedules = ["Con el desayuno", "Con la comida", "Con la cena", "En ayunas", "Entre comidas", "A la misma hora cada día", "Repartido durante el día"];
const durations = ["Durante 7 días", "Durante 14 días", "Hasta la próxima consulta"];

export function SupplementTiming({ schedule, duration, onSchedule, onDuration }: {
  schedule: string;
  duration: string;
  onSchedule: (value: string) => void;
  onDuration: (value: string) => void;
}) {
  const [scheduleType, setScheduleType] = useState(() => schedule && !schedules.includes(schedule) ? "other" : schedule);
  const [durationType, setDurationType] = useState(() => duration && !durations.includes(duration) ? "other" : duration);
  const [period, setPeriod] = useState("");
  const [date, setDate] = useState("");
  return <div className="supplement-plan-grid">
    <div className="supplement-plan-stack">
      <label>Horario y reparto de las tomas
        <select required className="nuth-input" value={scheduleType} onChange={event => {
          const value = event.target.value;
          setScheduleType(value);
          onSchedule(value === "other" ? "" : value);
        }}>
          <option value="">Elegir horario</option>
          {schedules.map(value => <option key={value}>{value}</option>)}
          <option value="other">Otro</option>
        </select>
      </label>
      {scheduleType === "other" && <label>Horario personalizado
        <input required className="nuth-input" maxLength={230} value={schedule} onChange={event => onSchedule(event.target.value)}/>
      </label>}
    </div>
    <div className="supplement-plan-stack">
      <label>Duración o fecha de revisión
        <select required className="nuth-input" value={durationType} onChange={event => {
          const value = event.target.value;
          setDurationType(value);
          setPeriod("");
          setDate("");
          onDuration(durations.includes(value) ? value : "");
        }}>
          <option value="">Elegir duración</option>
          {durations.map(value => <option key={value}>{value}</option>)}
          <option value="days">Cantidad de días</option>
          <option value="months">Cantidad de meses</option>
          <option value="date">Fecha de revisión</option>
          <option value="other">Otra duración</option>
        </select>
      </label>
      {(durationType === "days" || durationType === "months") && <label>{durationType === "days" ? "Número de días" : "Número de meses"}
        <input required className="nuth-input" type="number" min="1" step="1" value={period} onChange={event => {
          const value = event.target.value;
          setPeriod(value);
          const number = Number(value);
          onDuration(number > 0 && Number.isInteger(number)
            ? `Durante ${number} ${durationType === "days" ? number === 1 ? "día" : "días" : number === 1 ? "mes" : "meses"}` : "");
        }}/>
      </label>}
      {durationType === "date" && <label>Fecha de revisión
        <input required className="nuth-input" type="date" value={date} onChange={event => {
          setDate(event.target.value);
          onDuration(event.target.value ? `Hasta la revisión del ${formatPatientDate(event.target.value)}` : "");
        }}/>
      </label>}
      {durationType === "other" && <label>Duración personalizada
        <input required className="nuth-input" maxLength={230} value={duration} onChange={event => onDuration(event.target.value)}/>
      </label>}
    </div>
  </div>;
}
