import { useAccess } from "@/src/features/admin/AccessProvider";
import { getLimit } from "@/src/features/admin/api";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
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
  listPatients,
  restorePatient,
} from "@/src/services/patients";
import {
  calculateAge,
  formatPatientDate,
  patientInitials,
  patientStatusLabel,
} from "@/src/features/patients/patientUtils";
import type { Patient } from "@/src/types/domain";
import "./PatientsPage.css";
import { createPatientRegistrationDraft, PatientRegistrationFields, patientRegistrationInput, patientRegistrationError } from '@/src/features/patients/PatientRegistrationFields';

type StatusFilter = "all" | "active" | "archived";
type PortalFilter = "all" | "enabled" | "disabled";
type SortOption = "created_desc" | "created_asc" | "name_asc" | "activity_desc";

export function PatientModal({
  onClose,
  onSaved,
  initialContact,
}: {
  onClose: () => void;
  onSaved: (patient: Patient) => void;
  initialContact?: { name: string; email: string; timezone: string };
}) {
  const [draft, setDraft] = useState(() => createPatientRegistrationDraft(initialContact));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if(busy)return;
    setError('');setBusy(true);
    try {
      const input=patientRegistrationInput(draft);
      const possible=await listPatients({search:input.email||input.phone||undefined,status:'all',pageSize:20});
      const duplicate=possible.rows.find(item=>(input.email&&item.email?.toLowerCase()===input.email.toLowerCase())||(input.phone&&item.phone===input.phone));
      if(duplicate)throw new Error(`Ya existe un posible duplicado: “${duplicate.full_name}”. Revisa la lista antes de guardarlo.`);
      const created=await createPatient(input);
      onSaved(created);
    } catch(cause) {
      setError(patientRegistrationError(cause));
    } finally {setBusy(false);}
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
          <PatientRegistrationFields draft={draft} setDraft={setDraft} disabled={busy}/>
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
  status,
  portal,
  sort,
  onApply,
  onClear,
}: {
  status: StatusFilter;
  portal: PortalFilter;
  sort: SortOption;
  onApply: (next: {
    status: StatusFilter;
    portal: PortalFilter;
    sort: SortOption;
  }) => void;
  onClear: () => void;
}) {
  const [draftStatus, setDraftStatus] = useState(status);
  const [draftPortal, setDraftPortal] = useState(portal);
  const [draftSort, setDraftSort] = useState(sort);
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
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className="nuth-button-secondary"
          onClick={() => {
            onClear();
            setDraftStatus("all");
            setDraftPortal("all");
            setDraftSort("created_desc");
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
  const {data:accessData}=useAccess();
  const patientLimit=accessData ? getLimit(accessData.access,"patients.limit") : "unlimited";
  const [rows, setRows] = useState<Patient[]>([]);
  const [total, setTotal] = useState(0);
  const [addedTotal, setAddedTotal] = useState(0);
  const [activeTotal, setActiveTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [portal, setPortal] = useState<PortalFilter>("all");
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
      const [result, counters] = await Promise.all([
        listPatients({
          search: debounced,
          status,
          portalAccess: portal,
          sort,
          page,
        }),
        getPatientCounters(),
      ]);
      setRows(result.rows);
      setTotal(result.total);
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
  }, [debounced, status, portal, sort, page]);
  const applyFilters = (next: {
    status: StatusFilter;
    portal: PortalFilter;
    sort: SortOption;
  }) => {
    setStatus(next.status);
    setPortal(next.portal);
    setSort(next.sort);
    setPage(0);
    setFiltersOpen(false);
  };
  const clearFilters = () =>
    applyFilters({
      status: "all",
      portal: "all",
      sort: "created_desc",
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
    (sort !== "created_desc" ? 1 : 0);
  return (
    <div className="patients-workspace">
      <div className="patients-heading">
        <div>
          <p className="nuth-eyebrow">Espacio profesional</p>
          <h1>
            Pacientes
          </h1>
          <p>
            Un seguimiento claro, privado y centrado en cada persona.
          </p>
        </div>
        <button
          type="button"
          disabled={accessData?.access.read_only || (patientLimit !== "unlimited" && activeTotal >= patientLimit)}
          onClick={() => setModal(true)}
          className="nuth-button patients-add-button"
        >
          <Plus size={17} />
          Agregar paciente
        </button>
      </div>
      {patientLimit !== "unlimited" && <p role="status" className="mt-4 rounded-xl bg-[#eef3e9] p-4 text-sm">{activeTotal} / {patientLimit} pacientes activos. {activeTotal >= patientLimit ? "Has alcanzado el límite de pacientes activos de tu plan. Puedes seguir trabajando con tus expedientes y archivar pacientes para liberar cupo." : "Los pacientes archivados no consumen cupo."} <Link to="/planes" className="font-semibold underline">Ver planes</Link></p>}
      {notice && (
        <div className="mt-5">
          <SuccessNote>{notice}</SuccessNote>
        </div>
      )}
      <section className="patients-metrics" aria-label="Resumen de pacientes">
        <div className="patient-metric patient-metric-total">
          <UsersRound size={19} className="text-[#efbd6b]" />
          <p className="mt-2 text-2xl font-semibold">{addedTotal}</p>
          <p className="mt-1 text-sm text-white/60">Total</p>
        </div>
        <div className="patient-metric patient-metric-active">
          <p className="text-2xl font-semibold text-[#285647]">{activeTotal}</p>
          <p className="mt-1 text-sm text-[#718079]">Activos</p>
        </div>
        <div className="patient-metric patient-metric-results">
          <p className="text-2xl font-semibold text-[#285647]">{total}</p>
          <p className="mt-1 text-sm text-[#718079]">Resultados</p>
        </div>
      </section>
      <section className="patients-search-card" aria-label="Buscar y filtrar pacientes">
        <div className="patients-card-heading"><span className="patients-step">01 · Encuentra a la persona</span><h2>Buscar pacientes</h2><p>Escribe su nombre o correo; usa los filtros para precisar la lista.</p></div>
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
        <div className={filtersOpen ? "" : "hidden"}>
          <FiltersPanel
            status={status}
            portal={portal}
            sort={sort}
            onApply={applyFilters}
            onClear={clearFilters}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#74817d]">
          <span>
            {status === "active"
              ? "Mostrando activos"
              : status === "archived"
                ? "Mostrando archivados"
                : "Todos los pacientes"}
          </span>
          {portal !== "all" && (
            <span>
              · Portal {portal === "enabled" ? "activado" : "desactivado"}
            </span>
          )}
        </div>
      </section>
      <section className="patients-results" aria-label="Resultados de pacientes">
        <div className="patients-card-heading patients-results-heading"><span className="patients-step">02 · Abre el expediente</span><h2>Pacientes</h2><p>Encuentra al paciente en la lista y abre su ficha para continuar la atención.</p></div>
        {loading ? (
          <LoadingState label="Cargando pacientes…" />
        ) : error ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={
              debounced
                ? "No encontramos pacientes"
                : "Aún no tienes pacientes."
            }
            description={
              debounced
                ? "Prueba con otra búsqueda o limpia los filtros."
                : "Agrega tu primer paciente para comenzar a registrar consultas y mediciones."
            }
            action={
              !debounced ? (
                <button
                  type="button"
                  className="nuth-button"
                  disabled={accessData?.access.read_only || (patientLimit !== "unlimited" && activeTotal >= patientLimit)}
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
            <ul className="patients-list" aria-label="Lista de pacientes">
              {rows.map((patient) => (
                <li key={patient.id} className="patients-person-row">
                  <div className="patients-person-main">
                    <span className="patients-person-avatar" aria-hidden="true">{patientInitials(patient)}</span>
                    <div className="patients-person-info">
                      <Link to={`/app/patients/${patient.id}`} className="patients-person-name">{patient.full_name}</Link>
                      <p className="patients-person-email" title={patient.email || undefined}>{patient.email || "Sin correo"}{calculateAge(patient.birth_date) !== null ? ` · ${calculateAge(patient.birth_date)} años` : ""}</p>
                    </div>
                  </div>
                  <div className="patients-person-status">
                    <span className={patient.status === "active" ? "is-active" : ""}>{patientStatusLabel(patient.status)}</span>
                    <span>{patient.portal_access_enabled ? "Portal habilitado" : "Portal sin habilitar"}</span>
                  </div>
                  <div className="patients-person-activity">
                    <span>Última actividad</span>
                    <strong>{formatPatientDate(patient.last_activity_at)}</strong>
                  </div>
                  <div className="patients-person-actions">
                    <Link to={`/app/patients/${patient.id}`}>Abrir ficha <ArrowRight size={15} aria-hidden="true" /></Link>
                    <PatientActionMenu
                      patient={patient}
                      onArchive={() => setConfirm({ type: "archive", patient })}
                      onRestore={() => void restore(patient)}
                      onDelete={() => setConfirm({ type: "delete", patient })}
                    />
                  </div>
                </li>
              ))}
            </ul>
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
      </section>
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
