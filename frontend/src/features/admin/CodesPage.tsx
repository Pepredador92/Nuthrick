import { useState } from "react";
import { NavLink } from "react-router-dom";
import { ActionForm, Field, Heading, Ready, useAdminData } from "./AdminPages";
import { PlanSelect, daysInput, instant, nowInput } from "./ProfessionalPage";
import { dateLabel, type AccessCode, type Catalog } from "./api";
function CodeEditor({
  initial,
  catalog,
  onSaved,
}: {
  initial: AccessCode;
  catalog: Catalog;
  onSaved: () => void;
}) {
  const [data, setData] = useState(initial),
    [code, setCode] = useState(""),
    [start, setStart] = useState(initial.starts_at),
    [end, setEnd] = useState(initial.expires_at);
  const change = (k: string, v: unknown) => setData((d) => ({ ...d, [k]: v }));
  return (
    <ActionForm
      action="save_code"
      values={{
        ...data,
        code: code || undefined,
        starts_at: instant(start),
        expires_at: instant(end),
      }}
      onSaved={onSaved}
      button="Guardar código"
    >
      <h2>
        {initial.id ? "Editar código de acceso" : "Crear código de acceso"}
      </h2>
      <div className="admin-fields">
        <Field label="Nombre administrativo">
          <input
            required
            value={data.name}
            maxLength={100}
            onChange={(e) => change("name", e.target.value)}
            placeholder="Piloto de cinco profesionales"
          />
        </Field>
        {!initial.id && (
          <Field label="Código para compartir">
            <input
              required
              pattern="[A-Z0-9_-]{5,64}"
              value={code}
              maxLength={64}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="BETA5"
              autoComplete="off"
            />
          </Field>
        )}
        <PlanSelect
          catalog={catalog}
          value={data.plan_id}
          onChange={(v) => change("plan_id", v)}
        />
        <Field label="Tipo de acceso">
          <select
            value={data.access_kind ?? "trial"}
            onChange={(e) => {
              change("access_kind", e.target.value);
              change("duration_days", e.target.value === "founder" ? null : 90);
            }}
          >
            <option value="trial">Beta / prueba temporal</option>
            <option value="founder">Founder / permanente</option>
          </select>
        </Field>
        {data.access_kind !== "founder" && (
          <Field label="Días de acceso gratuito">
            <input
              required
              type="number"
              min="1"
              max="3660"
              value={data.duration_days ?? 90}
              onChange={(e) => change("duration_days", Number(e.target.value))}
            />
          </Field>
        )}
        <Field label="Máximo de profesionales">
          <input
            required
            type="number"
            min={Math.max(1, data.redeemed_count)}
            max="100000"
            value={data.max_redemptions}
            onChange={(e) => change("max_redemptions", Number(e.target.value))}
          />
        </Field>
        <Field label="Créditos IA iniciales">
          <input
            required
            type="number"
            min="0"
            max="1000000"
            step="0.001"
            value={data.initial_ai_credits}
            onChange={(e) =>
              change("initial_ai_credits", Number(e.target.value))
            }
          />
        </Field>
        <Field label="Disponible desde">
          <input
            required
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="Se puede canjear hasta">
          <input
            required
            type="datetime-local"
            min={start}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Field>
      </div>
      <label className="admin-toggle">
        <input
          type="checkbox"
          checked={data.active}
          onChange={(e) => change("active", e.target.checked)}
        />
        Código activo
      </label>
      <p className="admin-note">
        Guarda el código antes de cerrar: se almacena como hash y no se puede
        recuperar. Una cuenta solo puede canjearlo una vez y necesita no tener
        acceso vigente. La función de canje está preparada para el futuro
        onboarding. Founder concede acceso permanente con cero créditos
        mensuales; sus créditos iniciales son una cortesía separada.
      </p>
      {code && <p className="admin-code mt-4">{code}</p>}
    </ActionForm>
  );
}
export function CodesPage() {
  const codes = useAdminData<AccessCode[]>("codes"),
    catalog = useAdminData<Catalog>("catalog");
  const [editing, setEditing] = useState<AccessCode | null>(null);
  const defaultCode: AccessCode = {
    name: "",
    plan_id: catalog.data?.plans.find((p) => p.code === "beta")?.id ?? "",
    duration_days: 90,
    initial_ai_credits: 0,
    max_redemptions: 5,
    redeemed_count: 0,
    starts_at: nowInput(),
    expires_at: daysInput(90),
    active: true,
  };
  const forInput = (v: string) =>
    new Date(new Date(v).getTime() - new Date(v).getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  return (
    <>
      <Heading
        eyebrow="Accesos"
        title="Códigos de acceso"
        text="Invita a un grupo de profesionales con una vigencia y un límite de usos definidos."
      >
        <button
          className="admin-button"
          onClick={() => setEditing(defaultCode)}
        >
          Crear código
        </button>
      </Heading>
      <div className="admin-tabs">
        <NavLink end to="/admin/access">
          Accesos por cuenta
        </NavLink>
        <NavLink to="/admin/access/codes">Códigos beta</NavLink>
      </div>
      <Ready
        data={codes.data && catalog.data}
        error={codes.error || catalog.error}
      >
        {editing && catalog.data && (
          <CodeEditor
            key={editing.id ?? "new"}
            initial={editing}
            catalog={catalog.data}
            onSaved={() => {
              setEditing(null);
              codes.reload();
            }}
          />
        )}
        <section className="admin-card">
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Plan</th>
                  <th>Duración</th>
                  <th>Usos</th>
                  <th>Créditos</th>
                  <th>Vence</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {codes.data?.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>
                      {
                        catalog.data?.plans.find((p) => p.id === c.plan_id)
                          ?.name
                      }
                    </td>
                    <td>
                      {c.access_kind === "founder"
                        ? "Permanente · Founder"
                        : `${c.duration_days} días`}
                    </td>
                    <td>
                      {c.redeemed_count} / {c.max_redemptions}
                    </td>
                    <td>{c.initial_ai_credits}</td>
                    <td>{dateLabel(c.expires_at)}</td>
                    <td>{c.active ? "Activo" : "Inactivo"}</td>
                    <td>
                      <button
                        className="admin-link"
                        onClick={() =>
                          setEditing({
                            ...c,
                            starts_at: forInput(c.starts_at),
                            expires_at: forInput(c.expires_at),
                          })
                        }
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!codes.data?.length && (
              <p className="admin-empty">
                Crea el primer código para tus profesionales piloto.
              </p>
            )}
          </div>
        </section>
      </Ready>
    </>
  );
}
