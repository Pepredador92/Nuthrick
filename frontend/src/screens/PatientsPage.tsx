import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Check,
  Filter,
  LoaderCircle,
  MoreVertical,
  Plus,
  Search,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { Field, Input } from "@/src/components/ui/FormField";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  SuccessNote,
} from "@/src/components/ui/Status";
import {
  archivePatient,
  createPatient,
  deletePatient,
  getPatientCounters,
  listPatientTags,
  listPatients,
  restorePatient,
} from "@/src/services/patients";
import {
  calculateAge,
  formatPatientDate,
  normalizePhone,
  patientInitials,
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

type StatusFilter = "all" | "active" | "archived";
type PortalFilter = "all" | "enabled" | "disabled";
type SortOption = "created_desc" | "created_asc" | "name_asc" | "activity_desc";

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
    equationSex: "",
    birth: "",
    portal: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = draft.name.trim();
    const email = draft.email.trim();
    const phone = draft.phone.trim();
    setError("");
    if (name.length < 2)
      return setError("Escribe el nombre completo del paciente.");
    if (draft.portal && !email)
      return setError("Para activar el portal necesitas un correo.");
    if (phone && phone.replace(/\D/g, "").length < 7)
      return setError("Escribe un número de teléfono válido.");
    if (draft.birth && draft.birth > new Date().toISOString().slice(0, 10))
      return setError("La fecha de nacimiento no puede estar en el futuro.");
    setBusy(true);
    try {
      const possible = await listPatients({
        search:
          email || (phone ? normalizePhone(draft.country, phone) : undefined),
        status: "all",
        pageSize: 20,
      });
      const normalizedPhone = phone
        ? normalizePhone(draft.country, phone)
        : null;
      const duplicate = possible.rows.find(
        (item) =>
          (email && item.email?.toLowerCase() === email.toLowerCase()) ||
          (normalizedPhone && item.phone === normalizedPhone),
      );
      if (duplicate) {
        setError(
          `Ya existe un posible duplicado: “${duplicate.full_name}”. Revisa la lista antes de guardarlo.`,
        );
        return;
      }
      await createPatient({
        full_name: name,
        email: email || null,
        country_code: normalizedPhone ? draft.country : null,
        timezone: draft.timezone,
        phone: normalizedPhone,
        weight_kg: draft.weight ? Number(draft.weight) : null,
        height_cm: draft.height ? Number(draft.height) : null,
        gender: (draft.gender || null) as PatientGender | null,
        equation_sex: (draft.equationSex || null) as "male" | "female" | null,
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
              Agrega un paciente nuevo
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
              {countries.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
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
          <Field
            label="Sexo requerido por ecuaciones (opcional)"
            name="patient-equation-sex"
          >
            <select
              id="patient-equation-sex"
              className="nuth-input"
              value={draft.equationSex}
              onChange={(e) =>
                setDraft({ ...draft, equationSex: e.target.value })
              }
            >
              <option value="">Sin registrar</option>
              <option value="male">Masculino</option>
              <option value="female">Femenino</option>
            </select>
          </Field>
          <Field label="Fecha de nacimiento" name="patient-birth">
            <Input
              id="patient-birth"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
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

function TagSummary({ tags }: { tags: PatientTag[] }) {
  if (!tags.length)
    return <span className="text-xs text-[#9aa5a0]">Sin etiquetas</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.slice(0, 2).map((tag) => (
        <span
          key={tag.id}
          className="rounded-full bg-[#edf4ef] px-2 py-1 text-[10px] font-semibold text-[#4b7163]"
        >
          {tag.name}
        </span>
      ))}
      {tags.length > 2 && (
        <span className="rounded-full bg-[#f1f3ef] px-2 py-1 text-[10px] font-semibold text-[#718079]">
          +{tags.length - 2}
        </span>
      )}
    </div>
  );
}

function PatientActionMenu({
  patient,
  onArchive,
  onRestore,
  onDelete,
}: {
  patient: Patient;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Acciones de ${patient.full_name}`}
        className="rounded-lg p-2 text-[#64756e] hover:bg-[#edf4ef]"
        onClick={() => setOpen((value) => !value)}
      >
        <MoreVertical size={18} />
      </button>
      {open && (
        <div
          className="absolute right-0 top-10 z-20 w-48 rounded-xl border border-[#dfe5e1] bg-white p-1.5 shadow-xl"
          role="menu"
        >
          <Link
            role="menuitem"
            to={`/app/patients/${patient.id}`}
            className="block rounded-lg px-3 py-2 text-sm hover:bg-[#f3f7f3]"
            onClick={() => setOpen(false)}
          >
            Ver paciente
          </Link>
          {patient.status === "archived" ? (
            <button
              type="button"
              role="menuitem"
              className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f3f7f3]"
              onClick={() => {
                setOpen(false);
                onRestore();
              }}
            >
              Restaurar
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[#f3f7f3]"
              onClick={() => {
                setOpen(false);
                onArchive();
              }}
            >
              Archivar paciente
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-[#9b493a] hover:bg-[#fff1ed]"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            Eliminar paciente
          </button>
        </div>
      )}
    </div>
  );
}

function FiltersPanel({
  tags,
  status,
  portal,
  sort,
  tagIds,
  onApply,
  onClear,
}: {
  tags: PatientTag[];
  status: StatusFilter;
  portal: PortalFilter;
  sort: SortOption;
  tagIds: string[];
  onApply: (next: {
    status: StatusFilter;
    portal: PortalFilter;
    sort: SortOption;
    tagIds: string[];
  }) => void;
  onClear: () => void;
}) {
  const [draftStatus, setDraftStatus] = useState(status);
  const [draftPortal, setDraftPortal] = useState(portal);
  const [draftSort, setDraftSort] = useState(sort);
  const [draftTags, setDraftTags] = useState(tagIds);
  const [tagSearch, setTagSearch] = useState("");
  const filteredTags = tags.filter((tag) =>
    tag.name.toLowerCase().includes(tagSearch.toLowerCase()),
  );
  return (
    <div
      className="mt-4 rounded-2xl border border-[#dfe5e1] bg-[#fbfcfa] p-4"
      role="region"
      aria-label="Filtros de pacientes"
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Estado" name="patients-filter-status">
          <select
            className="nuth-input"
            value={draftStatus}
            onChange={(e) => setDraftStatus(e.target.value as StatusFilter)}
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="archived">Archivados</option>
          </select>
        </Field>
        <Field label="Acceso digital" name="patients-filter-portal">
          <select
            className="nuth-input"
            value={draftPortal}
            onChange={(e) => setDraftPortal(e.target.value as PortalFilter)}
          >
            <option value="all">Todos</option>
            <option value="enabled">Portal activado</option>
            <option value="disabled">Portal desactivado</option>
          </select>
        </Field>
        <Field label="Ordenar por" name="patients-filter-sort">
          <select
            className="nuth-input"
            value={draftSort}
            onChange={(e) => setDraftSort(e.target.value as SortOption)}
          >
            <option value="created_desc">Último agregado</option>
            <option value="created_asc">Más antiguo</option>
            <option value="name_asc">Nombre A-Z</option>
            <option value="activity_desc">Última actividad</option>
          </select>
        </Field>
      </div>
      <div className="mt-4">
        <label
          className="text-sm font-semibold text-[#52635c]"
          htmlFor="patient-tag-search"
        >
          Etiquetas
        </label>
        <p className="mt-1 text-xs text-[#74817d]">
          Usa etiquetas para organizar y encontrar pacientes rápidamente.
        </p>
        <Input
          id="patient-tag-search"
          className="mt-2 max-w-sm"
          placeholder="Buscar etiquetas…"
          value={tagSearch}
          onChange={(e) => setTagSearch(e.target.value)}
        />
        {filteredTags.length ? (
          <div className="mt-3 grid max-h-32 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {filteredTags.map((tag) => (
              <label
                key={tag.id}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white"
              >
                <input
                  type="checkbox"
                  checked={draftTags.includes(tag.id)}
                  onChange={(e) =>
                    setDraftTags(
                      e.target.checked
                        ? [...draftTags, tag.id]
                        : draftTags.filter((id) => id !== tag.id),
                    )
                  }
                />
                {tag.name}
              </label>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-[#74817d]">
            No hay etiquetas que coincidan.
          </p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className="nuth-button-secondary"
          onClick={() => {
            onClear();
            setDraftStatus("all");
            setDraftPortal("all");
            setDraftSort("created_desc");
            setDraftTags([]);
          }}
        >
          Limpiar filtros
        </button>
        <button
          type="button"
          className="nuth-button"
          onClick={() =>
            onApply({
              status: draftStatus,
              portal: draftPortal,
              sort: draftSort,
              tagIds: draftTags,
            })
          }
        >
          <Check size={16} />
          Aplicar
        </button>
      </div>
    </div>
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
  const [status, setStatus] = useState<StatusFilter>("active");
  const [portal, setPortal] = useState<PortalFilter>("all");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [sort, setSort] = useState<SortOption>("created_desc");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<{
    type: "archive" | "delete";
    patient: Patient;
  } | null>(null);
  const [busyAction, setBusyAction] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search.trim());
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
      setTags(tagRows);
      setAddedTotal(counters.total);
      setActiveTotal(counters.active);
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
  // Loading follows committed filters and pagination.
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, status, portal, tagIds, sort, page]);
  const applyFilters = (next: {
    status: StatusFilter;
    portal: PortalFilter;
    sort: SortOption;
    tagIds: string[];
  }) => {
    setStatus(next.status);
    setPortal(next.portal);
    setSort(next.sort);
    setTagIds(next.tagIds);
    setPage(0);
    setFiltersOpen(false);
  };
  const clearFilters = () =>
    applyFilters({
      status: "all",
      portal: "all",
      sort: "created_desc",
      tagIds: [],
    });
  const runAction = async () => {
    if (!confirm) return;
    setBusyAction(true);
    setError("");
    try {
      if (confirm.type === "archive") await archivePatient(confirm.patient.id);
      else await deletePatient(confirm.patient.id);
      setNotice(
        confirm.type === "archive"
          ? "Paciente archivado."
          : "Paciente eliminado de la lista.",
      );
      setConfirm(null);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo completar la acción.",
      );
    } finally {
      setBusyAction(false);
    }
  };
  const restore = async (patient: Patient) => {
    setBusyAction(true);
    try {
      await restorePatient(patient.id);
      setNotice("Paciente restaurado.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo restaurar el paciente.",
      );
    } finally {
      setBusyAction(false);
    }
  };
  const pages = Math.max(1, Math.ceil(total / 20));
  const activeFilterCount =
    (status !== "active" ? 1 : 0) +
    (portal !== "all" ? 1 : 0) +
    tagIds.length +
    (sort !== "created_desc" ? 1 : 0);
  return (
    <div>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="nuth-eyebrow">Espacio profesional</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-.04em]">
            Pacientes
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
          <p className="mt-4 text-3xl font-semibold">{addedTotal}</p>
          <p className="mt-1 text-sm text-white/60">Total</p>
        </div>
        <div className="rounded-2xl border border-[#dfe5e1] bg-white p-5">
          <p className="text-3xl font-semibold text-[#285647]">{activeTotal}</p>
          <p className="mt-1 text-sm text-[#718079]">Activos</p>
        </div>
        <div className="rounded-2xl border border-[#dfe5e1] bg-white p-5">
          <p className="text-3xl font-semibold text-[#285647]">{total}</p>
          <p className="mt-1 text-sm text-[#718079]">Resultados</p>
        </div>
      </section>
      <section className="mt-8 rounded-[24px] border border-[#dfe5e1] bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-0 flex-1">
            <Search
              size={17}
              className="absolute left-3 top-3.5 text-[#8a9791]"
            />
            <Input
              aria-label="Buscar por nombre o correo"
              className="pl-10"
              placeholder="Buscar por nombre o correo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            type="button"
            className={`nuth-button-secondary shrink-0 ${filtersOpen ? "!bg-[#edf4ef]" : ""}`}
            onClick={() => setFiltersOpen((value) => !value)}
          >
            <Filter size={16} />
            Filtros
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-[#3d705d] px-2 py-0.5 text-xs text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
        {filtersOpen && (
          <FiltersPanel
            tags={tags}
            status={status}
            portal={portal}
            sort={sort}
            tagIds={tagIds}
            onApply={applyFilters}
            onClear={clearFilters}
          />
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#74817d]">
          <span>
            {status === "active"
              ? "Mostrando activos"
              : status === "archived"
                ? "Mostrando archivados"
                : "Todos los pacientes"}
          </span>
          {tagIds.length > 0 && <span>· {tagIds.length} etiqueta(s)</span>}
          {portal !== "all" && (
            <span>
              · Portal {portal === "enabled" ? "activado" : "desactivado"}
            </span>
          )}
        </div>
      </section>
      <div className="mt-5">
        {loading ? (
          <LoadingState label="Cargando pacientes…" />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={
              debounced || tagIds.length
                ? "No encontramos pacientes"
                : "Aún no tienes pacientes."
            }
            description={
              debounced || tagIds.length
                ? "Prueba con otra búsqueda o limpia los filtros."
                : "Agrega tu primer paciente para comenzar a registrar consultas y mediciones."
            }
            action={
              !debounced && !tagIds.length ? (
                <button
                  type="button"
                  className="nuth-button"
                  onClick={() => setModal(true)}
                >
                  <Plus size={17} />
                  Agregar paciente
                </button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="hidden overflow-visible rounded-[24px] border border-[#dfe5e1] bg-white lg:block">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#f5f7f3] text-xs uppercase tracking-wide text-[#82908a]">
                  <tr>
                    <th className="px-5 py-4">Nombre</th>
                    <th className="px-5 py-4">Etiquetas</th>
                    <th className="px-5 py-4">Estado</th>
                    <th className="px-5 py-4">Portal</th>
                    <th className="px-5 py-4">Última actividad</th>
                    <th className="px-5 py-4">Último plan</th>
                    <th className="px-5 py-4">Cuestionario</th>
                    <th className="px-5 py-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf1ed]">
                  {rows.map((patient) => (
                    <tr key={patient.id} className="hover:bg-[#fbfcfa]">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e9f1ec] text-xs font-semibold text-[#356353]">
                            {patientInitials(patient)}
                          </span>
                          <div className="min-w-0">
                            <Link
                              to={`/app/patients/${patient.id}`}
                              className="font-semibold text-[#285647] hover:underline"
                            >
                              {patient.full_name}
                            </Link>
                            <p className="mt-1 max-w-[220px] truncate text-xs text-[#82908a]">
                              {patient.email || "Sin correo"}
                              {calculateAge(patient.birth_date) !== null
                                ? ` · ${calculateAge(patient.birth_date)} años`
                                : ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <TagSummary tags={patient.tags ?? []} />
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${patient.status === "active" ? "bg-[#eaf5ee] text-[#3e7355]" : "bg-[#f1f2ef] text-[#78847f]"}`}
                        >
                          {patientStatusLabel(patient.status)}
                        </span>
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
                        <PatientActionMenu
                          patient={patient}
                          onArchive={() =>
                            setConfirm({ type: "archive", patient })
                          }
                          onRestore={() => void restore(patient)}
                          onDelete={() =>
                            setConfirm({ type: "delete", patient })
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-4 lg:hidden">
              {rows.map((patient) => (
                <article
                  key={patient.id}
                  className="rounded-2xl border border-[#dfe5e1] bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e9f1ec] font-semibold text-[#356353]">
                        {patientInitials(patient)}
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
                    <PatientActionMenu
                      patient={patient}
                      onArchive={() => setConfirm({ type: "archive", patient })}
                      onRestore={() => void restore(patient)}
                      onDelete={() => setConfirm({ type: "delete", patient })}
                    />
                  </div>
                  <div className="mt-4">
                    <TagSummary tags={patient.tags ?? []} />
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-3 text-xs text-[#76837e]">
                    <div>
                      <dt>Estado</dt>
                      <dd className="mt-1 font-semibold text-[#385a4e]">
                        {patientStatusLabel(patient.status)}
                      </dd>
                    </div>
                    <div>
                      <dt>Portal</dt>
                      <dd className="mt-1 font-semibold text-[#385a4e]">
                        {patient.portal_access_enabled
                          ? "Habilitado"
                          : "No habilitado"}
                      </dd>
                    </div>
                    <div>
                      <dt>Última actividad</dt>
                      <dd className="mt-1 font-semibold text-[#385a4e]">
                        {formatPatientDate(patient.last_activity_at)}
                      </dd>
                    </div>
                    <div>
                      <dt>Último plan</dt>
                      <dd className="mt-1 font-semibold text-[#385a4e]">—</dd>
                    </div>
                  </dl>
                </article>
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
      {confirm && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-[#102d27]/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="patient-action-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 id="patient-action-title" className="text-xl font-semibold">
              {confirm.type === "archive"
                ? "¿Archivar este paciente?"
                : "¿Eliminar este paciente?"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#74817d]">
              {confirm.type === "archive"
                ? "La ficha dejará de aparecer entre los activos, pero conservará consultas, medidas, notas y expediente."
                : "El paciente dejará de aparecer en tu lista. Su información histórica se conservará de forma segura."}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="nuth-button-secondary"
                onClick={() => setConfirm(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busyAction}
                className={`nuth-button ${confirm.type === "delete" ? "!bg-[#9b493a]" : ""}`}
                onClick={() => void runAction()}
              >
                {busyAction ? (
                  <LoaderCircle className="animate-spin" size={16} />
                ) : (
                  <Trash2 size={16} />
                )}
                {confirm.type === "archive"
                  ? "Archivar paciente"
                  : "Eliminar paciente"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
