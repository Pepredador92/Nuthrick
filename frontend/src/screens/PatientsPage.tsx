import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  LoaderCircle,
  Plus,
  Search,
  SlidersHorizontal,
  UsersRound,
  X,
} from "lucide-react";
import { Field, Input } from "@/src/components/ui/FormField";
import {
  ErrorState,
  LoadingState,
  SuccessNote,
} from "@/src/components/ui/Status";
import {
  createPatient,
  getPatientCounters,
  listPatientTags,
  listPatients,
} from "@/src/services/patients";
import {
  calculateAge,
  formatPatientDate,
  normalizePhone,
  patientStatusLabel,
} from "@/src/features/patients/patientUtils";
import type { Patient, PatientGender, PatientTag } from "@/src/types/domain";

const countries = [
  ["+52", "México (+52)"],
  ["+1", "Estados Unidos / Canadá (+1)"],
  ["+34", "España (+34)"],
  ["+57", "Colombia (+57)"],
  ["+54", "Argentina (+54)"],
] as const;
const timezones = [
  "America/Mexico_City",
  "America/Bogota",
  "America/Santiago",
  "Europe/Madrid",
  "America/New_York",
];

function PatientModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState({
    name: "",
    email: "",
    country: "+52",
    phone: "",
    timezone: "America/Mexico_City",
    weight: "",
    height: "",
    gender: "",
    birth: "",
    portal: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (draft.portal && !draft.email.trim()) {
      setError("Para activar el portal necesitas un correo.");
      return;
    }
    if (draft.phone && draft.phone.replace(/\D/g, "").length < 7) {
      setError("Escribe un número de teléfono válido.");
      return;
    }
    setBusy(true);
    try {
      const possible = await listPatients({
        search:
          draft.email ||
          (draft.phone
            ? normalizePhone(draft.country, draft.phone)
            : undefined),
        status: "all",
        pageSize: 5,
      });
      const duplicate = possible.rows.find(
        (item) =>
          (draft.email &&
            item.email?.toLowerCase() === draft.email.trim().toLowerCase()) ||
          (draft.phone &&
            item.phone === normalizePhone(draft.country, draft.phone)),
      );
      if (duplicate) {
        setError(
          `Ya existe un posible duplicado: “${duplicate.full_name}”. Revisa la lista antes de guardarlo.`,
        );
        return;
      }
      await createPatient({
        full_name: draft.name,
        email: draft.email || null,
        country_code: draft.phone ? draft.country : null,
        timezone: draft.timezone,
        phone: draft.phone ? normalizePhone(draft.country, draft.phone) : null,
        weight_kg: draft.weight ? Number(draft.weight) : null,
        height_cm: draft.height ? Number(draft.height) : null,
        gender: (draft.gender || null) as PatientGender | null,
        birth_date: draft.birth || null,
        portal_access_enabled: draft.portal,
      });
      onSaved();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo guardar el paciente.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[#102d27]/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-patient-title"
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[28px] bg-white p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="nuth-eyebrow">Nuevo expediente</p>
            <h2 id="new-patient-title" className="mt-2 text-2xl font-semibold">
              Agregar paciente
            </h2>
            <p className="mt-2 text-sm text-[#74817d]">
              Los datos son privados y sólo los verá tu espacio profesional.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-[#74817d] hover:bg-[#f1f5f1]"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>
        <form className="mt-7 grid gap-5 sm:grid-cols-2" onSubmit={save}>
          <div className="sm:col-span-2">
            <Field label="Nombre completo" name="patient-name">
              <Input
                id="patient-name"
                required
                minLength={2}
                maxLength={160}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                autoFocus
              />
            </Field>
          </div>
          <Field label="Correo electrónico (opcional)" name="patient-email">
            <Input
              id="patient-email"
              type="email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              placeholder="paciente@correo.com"
            />
          </Field>
          <Field label="Zona horaria" name="patient-timezone">
            <select
              id="patient-timezone"
              className="nuth-input"
              value={draft.timezone}
              onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
            >
              {timezones.map((zone) => (
                <option key={zone}>{zone}</option>
              ))}
            </select>
          </Field>
          <Field label="Lada" name="patient-country">
            <select
              id="patient-country"
              className="nuth-input"
              value={draft.country}
              onChange={(e) => setDraft({ ...draft, country: e.target.value })}
            >
              {countries.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Teléfono (opcional)"
            name="patient-phone"
            hint="Se guarda en formato internacional E.164."
          >
            <Input
              id="patient-phone"
              type="tel"
              inputMode="numeric"
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              placeholder="5512345678"
            />
          </Field>
          <Field label="Peso inicial (kg)" name="patient-weight">
            <Input
              id="patient-weight"
              type="number"
              min="0.1"
              max="1000"
              step="0.01"
              value={draft.weight}
              onChange={(e) => setDraft({ ...draft, weight: e.target.value })}
            />
          </Field>
          <Field label="Estatura (cm)" name="patient-height">
            <Input
              id="patient-height"
              type="number"
              min="20"
              max="300"
              step="0.01"
              value={draft.height}
              onChange={(e) => setDraft({ ...draft, height: e.target.value })}
            />
          </Field>
          <Field label="Género (opcional)" name="patient-gender">
            <select
              id="patient-gender"
              className="nuth-input"
              value={draft.gender}
              onChange={(e) => setDraft({ ...draft, gender: e.target.value })}
            >
              <option value="">Prefiero no indicarlo</option>
              <option value="female">Mujer</option>
              <option value="male">Hombre</option>
              <option value="non_binary">No binario</option>
              <option value="other">Otro</option>
            </select>
          </Field>
          <Field label="Fecha de nacimiento" name="patient-birth">
            <Input
              id="patient-birth"
              type="date"
              value={draft.birth}
              onChange={(e) => setDraft({ ...draft, birth: e.target.value })}
            />
          </Field>
          <label className="flex items-start gap-3 rounded-2xl bg-[#f3f7f3] p-4 text-sm sm:col-span-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={draft.portal}
              onChange={(e) => setDraft({ ...draft, portal: e.target.checked })}
            />
            <span>
              <span className="block font-semibold">
                Permitir acceso al portal/app
              </span>
              <span className="mt-1 block text-xs leading-5 text-[#75827d]">
                Podrás invitarle cuando el portal esté habilitado. Requiere
                correo.
              </span>
            </span>
          </label>
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-[#fff1ed] p-3 text-sm text-[#934938] sm:col-span-2"
            >
              {error}
            </p>
          )}
          <div className="flex justify-end gap-3 sm:col-span-2">
            <button
              type="button"
              onClick={onClose}
              className="nuth-button-secondary"
            >
              Cancelar
            </button>
            <button disabled={busy} className="nuth-button">
              {busy ? (
                <LoaderCircle className="animate-spin" size={17} />
              ) : (
                <Plus size={17} />
              )}
              Guardar paciente
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PatientRow({ patient }: { patient: Patient }) {
  return (
    <article className="rounded-2xl border border-[#dfe5e1] bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e9f1ec] font-semibold text-[#356353]">
            {patient.full_name
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0])
              .join("")
              .toUpperCase()}
          </span>
          <div className="min-w-0">
            <Link
              to={`/app/patients/${patient.id}`}
              className="block truncate font-semibold text-[#23473c] hover:underline"
            >
              {patient.full_name}
            </Link>
            <p className="truncate text-sm text-[#75827d]">
              {patient.email || "Sin correo"}
            </p>
          </div>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${patient.status === "active" ? "bg-[#eaf5ee] text-[#3e7355]" : "bg-[#f1f2ef] text-[#78847f]"}`}
        >
          {patientStatusLabel(patient.status)}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {(patient.tags ?? []).map((tag) => (
          <span
            key={tag.id}
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ color: tag.color, backgroundColor: `${tag.color}18` }}
          >
            {tag.name}
          </span>
        ))}
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs text-[#76837e]">
        <div>
          <dt>Portal</dt>
          <dd className="mt-1 font-semibold text-[#385a4e]">
            {patient.portal_access_enabled ? "Habilitado" : "No habilitado"}
          </dd>
        </div>
        <div>
          <dt>Último uso</dt>
          <dd className="mt-1 font-semibold text-[#385a4e]">
            {formatPatientDate(patient.last_activity_at)}
          </dd>
        </div>
        <div>
          <dt>Último plan</dt>
          <dd className="mt-1 font-semibold text-[#385a4e]">—</dd>
        </div>
        <div>
          <dt>Cuestionario</dt>
          <dd className="mt-1 font-semibold text-[#385a4e]">—</dd>
        </div>
      </dl>
      <Link
        to={`/app/patients/${patient.id}`}
        className="mt-4 inline-flex text-sm font-semibold text-[#3d705d]"
      >
        Ver paciente →
      </Link>
    </article>
  );
}

export function PatientsPage() {
  const [rows, setRows] = useState<Patient[]>([]);
  const [tags, setTags] = useState<PatientTag[]>([]);
  const [total, setTotal] = useState(0);
  const [addedTotal, setAddedTotal] = useState(0);
  const [activeTotal, setActiveTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("active");
  const [portal, setPortal] = useState("all");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [sort, setSort] = useState<
    "created_desc" | "created_asc" | "name_asc" | "activity_desc"
  >("created_desc");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search);
      setPage(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [result, tagRows, counters] = await Promise.all([
        listPatients({
          search: debounced,
          status,
          portalAccess: portal,
          tagIds,
          sort,
          page,
        }),
        listPatientTags(),
        getPatientCounters(),
      ]);
      setRows(result.rows);
      setTotal(result.total);
      setAddedTotal(counters.total);
      setActiveTotal(counters.active);
      setTags(tagRows);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudieron cargar tus pacientes.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, status, portal, tagIds, sort, page]);
  const pages = Math.max(1, Math.ceil(total / 20));
  return (
    <div>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="nuth-eyebrow">Espacio profesional</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-.04em]">
            Mis pacientes
          </h1>
          <p className="mt-3 text-[#687672]">
            Un seguimiento claro, privado y centrado en cada persona.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModal(true)}
          className="nuth-button"
        >
          <Plus size={17} />
          Agregar paciente
        </button>
      </div>
      {notice && (
        <div className="mt-5">
          <SuccessNote>{notice}</SuccessNote>
        </div>
      )}
      <section className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-[#173d36] p-5 text-white">
          <UsersRound size={19} className="text-[#efbd6b]" />
          <p className="mt-4 text-3xl font-semibold">{total}</p>
          <p className="mt-1 text-sm text-white/60">Pacientes encontrados</p>
        </div>
        <div className="rounded-2xl border border-[#dfe5e1] bg-white p-5">
          <p className="text-3xl font-semibold text-[#285647]">{addedTotal}</p>
          <p className="mt-1 text-sm text-[#718079]">Agregados</p>
        </div>
        <div className="rounded-2xl border border-[#dfe5e1] bg-white p-5">
          <p className="text-3xl font-semibold text-[#285647]">{activeTotal}</p>
          <p className="mt-1 text-sm text-[#718079]">Activos</p>
        </div>
      </section>
      <section className="mt-8 rounded-[24px] border border-[#dfe5e1] bg-white p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div className="relative">
            <Search
              size={17}
              className="absolute left-3 top-3.5 text-[#8a9791]"
            />
            <Input
              aria-label="Busca por nombre o correo"
              className="pl-10"
              placeholder="Busca por nombre o correo"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={16} className="text-[#718079]" />
            <select
              className="nuth-input"
              aria-label="Filtrar estado"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(0);
              }}
            >
              <option value="active">Activos</option>
              <option value="all">Todos</option>
              <option value="inactive">Inactivos</option>
              <option value="archived">Archivados</option>
            </select>
          </div>
          <select
            className="nuth-input"
            aria-label="Filtra por etiqueta(s)"
            multiple
            size={Math.min(4, Math.max(2, tags.length + 1))}
            value={tagIds}
            onChange={(e) => {
              setTagIds(
                Array.from(
                  e.target.selectedOptions,
                  (option) => option.value,
                ).filter(Boolean),
              );
              setPage(0);
            }}
          >
            <option value="">Todas las etiquetas</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
          <select
            className="nuth-input"
            aria-label="Ordenar por"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as typeof sort);
              setPage(0);
            }}
          >
            <option value="created_desc">Último agregado</option>
            <option value="created_asc">Más antiguo</option>
            <option value="name_asc">Nombre A-Z</option>
            <option value="activity_desc">Último uso</option>
          </select>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-2 text-sm text-[#687672]">
            Acceso al portal
            <select
              className="nuth-input !w-auto !py-1.5"
              value={portal}
              onChange={(e) => {
                setPortal(e.target.value);
                setPage(0);
              }}
            >
              <option value="all">Todos</option>
              <option value="enabled">Habilitado</option>
              <option value="disabled">No habilitado</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-[#a0aaa5]">
            Plan asignado hasta
            <Input type="date" disabled className="!w-auto !py-1.5" />
            <span className="text-xs">Próximamente</span>
          </label>
        </div>
      </section>
      <div className="mt-5">
        {loading ? (
          <LoadingState label="Cargando pacientes…" />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : rows.length === 0 ? (
          <div className="rounded-[24px] border border-dashed border-[#cad6ce] bg-white p-12 text-center">
            <UsersRound className="mx-auto text-[#87a192]" size={30} />
            <h2 className="mt-4 text-xl font-semibold">
              {debounced || tagIds.length
                ? "No encontramos pacientes"
                : "Tu lista está lista para comenzar"}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#74817d]">
              {debounced || tagIds.length
                ? "Prueba con otra búsqueda o limpia los filtros."
                : "Agrega tu primer paciente para comenzar a registrar consultas y mediciones."}
            </p>
            {!debounced && !tagIds.length && (
              <button
                type="button"
                className="nuth-button mt-6"
                onClick={() => setModal(true)}
              >
                <Plus size={17} />
                Agregar paciente
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="hidden overflow-hidden rounded-[24px] border border-[#dfe5e1] bg-white lg:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#f5f7f3] text-xs uppercase tracking-wide text-[#82908a]">
                  <tr>
                    <th className="px-5 py-4">Nombre</th>
                    <th className="px-5 py-4">Etiquetas</th>
                    <th className="px-5 py-4">Portal</th>
                    <th className="px-5 py-4">Último uso</th>
                    <th className="px-5 py-4">Último plan</th>
                    <th className="px-5 py-4">Cuestionario</th>
                    <th className="px-5 py-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1ed]">
                  {rows.map((patient) => (
                    <tr key={patient.id} className="hover:bg-[#fbfcfa]">
                      <td className="px-5 py-4">
                        <Link
                          to={`/app/patients/${patient.id}`}
                          className="font-semibold text-[#285647] hover:underline"
                        >
                          {patient.full_name}
                        </Link>
                        <p className="mt-1 text-xs text-[#82908a]">
                          {patient.email || "Sin correo"}
                          {calculateAge(patient.birth_date) !== null
                            ? ` · ${calculateAge(patient.birth_date)} años`
                            : ""}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1">
                          {(patient.tags ?? []).map((tag) => (
                            <span
                              key={tag.id}
                              className="rounded-full bg-[#edf4ef] px-2 py-1 text-[10px] font-semibold text-[#4b7163]"
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-xs">
                        {patient.portal_access_enabled ? "Habilitado" : "—"}
                      </td>
                      <td className="px-5 py-4 text-xs text-[#73817b]">
                        {formatPatientDate(patient.last_activity_at)}
                      </td>
                      <td className="px-5 py-4 text-xs text-[#9aa5a0]">—</td>
                      <td className="px-5 py-4 text-xs text-[#9aa5a0]">—</td>
                      <td className="px-5 py-4">
                        <Link
                          to={`/app/patients/${patient.id}`}
                          className="text-xs font-semibold text-[#3d705d]"
                        >
                          Ver
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-4 lg:hidden">
              {rows.map((patient) => (
                <PatientRow key={patient.id} patient={patient} />
              ))}
            </div>
            <div className="mt-5 flex items-center justify-between text-sm text-[#718079]">
              <span>
                Página {page + 1} de {pages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page === 0}
                  className="nuth-button-secondary !px-3 !py-2"
                  onClick={() => setPage((value) => value - 1)}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={page + 1 >= pages}
                  className="nuth-button-secondary !px-3 !py-2"
                  onClick={() => setPage((value) => value + 1)}
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      {modal && (
        <PatientModal
          onClose={() => setModal(false)}
          onSaved={() => {
            setModal(false);
            setNotice("Paciente agregado correctamente.");
            void load();
          }}
        />
      )}
    </div>
  );
}
