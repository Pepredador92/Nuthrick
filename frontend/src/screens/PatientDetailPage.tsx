import { useEffect, useState } from "react";
import {
  ArrowLeft,
  CalendarPlus,
  Check,
  Edit3,
  FileText,
  LoaderCircle,
  MessageCircle,
  Plus,
  ShieldCheck,
  Trash2,
  Upload,
  UserRound,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Field, Input, Textarea } from "@/src/components/ui/FormField";
import {
  ErrorState,
  LoadingState,
  SuccessNote,
} from "@/src/components/ui/Status";
import { useAuth } from "@/src/features/auth/AuthProvider";
import {
  calculateAge,
  formatPatientDate,
  patientInitials,
} from "@/src/features/patients/patientUtils";
import {
  getSignedPatientPhotoUrl,
  uploadPatientProgressPhoto,
} from "@/src/services/media";
import {
  archivePatient,
  assignPatientTag,
  createConsultation,
  createMeasurement,
  createPatientTag,
  deleteMeasurement,
  deactivatePatient,
  getPatient,
  listConsultations,
  listMeasurements,
  listNotes,
  listPatientAssignedTags,
  listPatientTags,
  listProgressPhotos,
  registerProgressPhoto,
  removePatientTag,
  updatePatient,
  upsertNote,
} from "@/src/services/patients";
import type {
  Consultation,
  Patient,
  PatientMeasurement,
  PatientProgressPhoto,
  PatientTag,
} from "@/src/types/domain";

const tabs = [
  "Primera",
  "Medidas",
  "Planes",
  "Notas",
  "Familia",
  "Referidos",
  "Crecimiento",
] as const;
type Tab = (typeof tabs)[number];

const Placeholder = ({ title }: { title: string }) => (
  <div className="rounded-2xl border border-dashed border-[#ccd8cf] bg-white p-10 text-center">
    <FileText className="mx-auto text-[#91a89c]" size={28} />
    <h2 className="mt-4 text-xl font-semibold">{title}</h2>
    <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#7b8883]">
      Esta sección quedará conectada con su módulo cuando esté disponible. Tu
      historial actual se conserva.
    </p>
  </div>
);

export function PatientDetailPage({
  defaultTab = "Primera",
}: {
  defaultTab?: Tab;
}) {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [measurements, setMeasurements] = useState<PatientMeasurement[]>([]);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [notes, setNotes] = useState<Awaited<ReturnType<typeof listNotes>>>([]);
  const [tags, setTags] = useState<PatientTag[]>([]);
  const [photos, setPhotos] = useState<PatientProgressPhoto[]>([]);
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmMeasurement, setConfirmMeasurement] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [measure, setMeasure] = useState({
    weight: "",
    height: "",
    date: new Date().toISOString().slice(0, 10),
  });
  const [consult, setConsult] = useState({
    date: new Date().toISOString().slice(0, 16),
    summary: "",
  });
  const [note, setNote] = useState("");
  const [tagName, setTagName] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);
  const load = async () => {
    if (!patientId) return;
    setLoading(true);
    setError("");
    try {
      const [p, m, c, n, allTags, assigned, ph] = await Promise.all([
        getPatient(patientId),
        listMeasurements(patientId),
        listConsultations(patientId),
        listNotes(patientId),
        listPatientTags(),
        listPatientAssignedTags(patientId),
        listProgressPhotos(patientId),
      ]);
      if (!p) {
        setError(
          "No encontramos este paciente o no tienes autorización para verlo.",
        );
        setPatient(null);
        return;
      }
      setPatient({ ...p, tags: assigned });
      setMeasurements(m);
      setConsultations(c);
      setNotes(n);
      setTags(allTags);
      setPhotos(
        await Promise.all(
          ph.map(async (item) => ({
            ...item,
            signedUrl:
              (await getSignedPatientPhotoUrl(item.storage_path)) ?? undefined,
          })),
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo cargar la ficha.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);
  if (loading) return <LoadingState label="Cargando ficha del paciente…" />;
  if (!patient)
    return (
      <div>
        <Link
          to="/app/patients"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#3d705d]"
        >
          <ArrowLeft size={16} />
          Volver a pacientes
        </Link>
        <div className="mt-6">
          <ErrorState
            message={error || "Paciente no encontrado."}
            onRetry={() => void load()}
          />
        </div>
      </div>
    );
  const assigned = patient.tags ?? [];
  const latest = measurements[0];
  const age = calculateAge(patient.birth_date);
  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError("");
    try {
      await action();
      setNotice(message);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo completar la acción.",
      );
    } finally {
      setBusy(false);
    }
  };
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await run(async () => {
      const value = await updatePatient(patient.id, {
        full_name: String(form.get("full_name") || ""),
        email: String(form.get("email") || "") || null,
        birth_date: String(form.get("birth_date") || "") || null,
        gender: String(form.get("gender") || "") || null,
      });
      setPatient({ ...value, tags: assigned });
      setEditing(false);
    }, "Datos actualizados.");
  };
  const addMeasurement = async (event: React.FormEvent) => {
    event.preventDefault();
    await run(async () => {
      await createMeasurement(patient.id, {
        weight_kg: Number(measure.weight),
        height_cm: Number(measure.height),
        measured_at: new Date(`${measure.date}T12:00:00`).toISOString(),
      });
      setMeasurements(await listMeasurements(patient.id));
      setMeasure({ ...measure, weight: "", height: "" });
    }, "Medición agregada.");
  };
  const removeMeasurement = async () => {
    if (!confirmMeasurement) return;
    const id = confirmMeasurement;
    setConfirmMeasurement(null);
    await run(async () => {
      await deleteMeasurement(id);
      setMeasurements(await listMeasurements(patient.id));
    }, "Medición eliminada.");
  };
  const addConsultation = async (event: React.FormEvent) => {
    event.preventDefault();
    await run(async () => {
      await createConsultation(patient.id, {
        consultation_date: new Date(consult.date).toISOString(),
        status: "completed",
        summary: consult.summary || null,
      });
      setConsultations(await listConsultations(patient.id));
      setConsult({ ...consult, summary: "" });
    }, "Consulta registrada.");
  };
  const addNote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!consultations[0] || !note.trim()) return;
    await run(async () => {
      await upsertNote(patient.id, consultations[0].id, note.trim());
      setNotes(await listNotes(patient.id));
      setNote("");
    }, "Nota guardada.");
  };
  const toggleTag = async (tag: PatientTag) => {
    const has = assigned.some((item) => item.id === tag.id);
    await run(
      async () => {
        if (has) await removePatientTag(patient.id, tag.id);
        else await assignPatientTag(patient.id, tag.id);
        setPatient((current) =>
          current
            ? {
                ...current,
                tags: has
                  ? (current.tags ?? []).filter((item) => item.id !== tag.id)
                  : [...(current.tags ?? []), tag],
              }
            : current,
        );
      },
      has ? "Etiqueta quitada." : "Etiqueta agregada.",
    );
  };
  const addTag = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!tagName.trim()) return;
    await run(async () => {
      const existing = tags.find(
        (item) => item.name.toLowerCase() === tagName.trim().toLowerCase(),
      );
      const tag = existing ?? (await createPatientTag(tagName.trim()));
      if (!existing) setTags((current) => [...current, tag]);
      if (!assigned.some((item) => item.id === tag.id)) {
        await assignPatientTag(patient.id, tag.id);
        setPatient((current) =>
          current
            ? { ...current, tags: [...(current.tags ?? []), tag] }
            : current,
        );
      }
      setTagName("");
    }, "Etiqueta agregada.");
  };
  const uploadPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;
    setPhotoBusy(true);
    try {
      const path = await uploadPatientProgressPhoto(file, patient.id, user.id);
      await registerProgressPhoto(patient.id, path);
      const refreshed = await listProgressPhotos(patient.id);
      setPhotos(
        await Promise.all(
          refreshed.map(async (item) => ({
            ...item,
            signedUrl:
              (await getSignedPatientPhotoUrl(item.storage_path)) ?? undefined,
          })),
        ),
      );
      setNotice("Foto privada guardada.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo subir la foto.",
      );
    } finally {
      setPhotoBusy(false);
      event.target.value = "";
    }
  };
  const archive = async () => {
    await run(async () => {
      await archivePatient(patient.id);
      navigate("/app/patients");
    }, "Paciente archivado.");
  };
  return (
    <div>
      <Link
        to="/app/patients"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[#3d705d]"
      >
        <ArrowLeft size={16} />
        Volver a pacientes
      </Link>
      {notice && (
        <div className="mt-4">
          <SuccessNote>{notice}</SuccessNote>
        </div>
      )}
      <header className="mt-6 rounded-[28px] bg-[#173d36] p-6 text-white sm:p-8">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="grid h-16 w-16 place-items-center rounded-3xl bg-[#e4b374] text-lg font-bold text-[#173d36]">
              {patientInitials(patient)}
            </span>
            <div>
              <p className="text-sm text-white/60">Ficha de paciente</p>
              <h1 className="mt-1 text-3xl font-semibold">
                {patient.full_name}
              </h1>
              <p className="mt-2 text-sm text-white/65">
                {age === null ? "Edad no indicada" : `${age} años`}
                {patient.email ? ` · ${patient.email}` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="nuth-button !bg-[#efbd6b] !text-[#173d36]"
              onClick={() => setTab("Notas")}
            >
              <CalendarPlus size={16} />
              Nueva consulta
            </button>
            <button
              type="button"
              className="rounded-xl border border-white/20 px-3 py-2 text-sm font-semibold"
              onClick={() => setEditing(true)}
            >
              <Edit3 size={16} />
              Editar
            </button>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs">
            {patient.status === "active"
              ? "Paciente activo"
              : "Paciente inactivo"}
          </span>
          {patient.portal_access_enabled && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs">
              <ShieldCheck size={14} />
              Portal habilitado
            </span>
          )}
          <button
            type="button"
            className="rounded-full bg-white/10 px-3 py-1.5 text-xs"
            onClick={() =>
              setNotice(
                "El enlace seguro se habilitará con invitaciones de portal.",
              )
            }
          >
            Obtener link
          </button>
        </div>
      </header>
      {editing && (
        <form
          onSubmit={save}
          className="mt-5 rounded-2xl border border-[#dfe5e1] bg-white p-5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre completo" name="edit-name">
              <Input
                name="full_name"
                defaultValue={patient.full_name}
                required
              />
            </Field>
            <Field label="Correo" name="edit-email">
              <Input
                name="email"
                type="email"
                defaultValue={patient.email ?? ""}
              />
            </Field>
            <Field label="Fecha de nacimiento" name="edit-birth-date">
              <Input
                name="birth_date"
                type="date"
                defaultValue={patient.birth_date ?? ""}
              />
            </Field>
            <Field label="Género" name="edit-gender">
              <select
                name="gender"
                className="nuth-input"
                defaultValue={patient.gender ?? ""}
              >
                <option value="">No indicado</option>
                <option value="female">Mujer</option>
                <option value="male">Hombre</option>
                <option value="non_binary">No binario</option>
                <option value="other">Otro</option>
              </select>
            </Field>
          </div>
          <div className="mt-4 flex gap-3">
            <button className="nuth-button" disabled={busy}>
              {busy ? (
                <LoaderCircle className="animate-spin" size={16} />
              ) : (
                <Check size={16} />
              )}
              Guardar
            </button>
            <button
              type="button"
              className="nuth-button-secondary"
              onClick={() => setEditing(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
      <nav className="mt-7 flex gap-1 overflow-x-auto border-b border-[#dfe5e1]">
        {tabs.map((item) => (
          <button
            type="button"
            key={item}
            onClick={() => setTab(item)}
            className={`whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold ${tab === item ? "border-[#3d705d] text-[#285647]" : "border-transparent text-[#86918c]"}`}
          >
            {item}
          </button>
        ))}
      </nav>
      {error && (
        <div className="mt-5">
          <ErrorState message={error} />
        </div>
      )}
      <main className="mt-6">
        {tab === "Primera" && (
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="space-y-5">
              <div className="rounded-2xl border border-[#dfe5e1] bg-white p-6">
                <h2 className="text-xl font-semibold">Información principal</h2>
                <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-[#82908a]">Nacimiento</dt>
                    <dd className="mt-1 font-semibold">
                      {patient.birth_date
                        ? formatPatientDate(patient.birth_date)
                        : "No indicada"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#82908a]">Género</dt>
                    <dd className="mt-1 font-semibold">
                      {patient.gender === "female"
                        ? "Mujer"
                        : patient.gender === "male"
                          ? "Hombre"
                          : patient.gender === "non_binary"
                            ? "No binario"
                            : patient.gender === "other"
                              ? "Otro"
                              : "No indicado"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#82908a]">Teléfono</dt>
                    <dd className="mt-1 font-semibold">
                      {patient.phone || "No indicado"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#82908a]">Zona horaria</dt>
                    <dd className="mt-1 font-semibold">{patient.timezone}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[#82908a]">Alta</dt>
                    <dd className="mt-1 font-semibold">
                      {formatPatientDate(patient.created_at)}
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="rounded-2xl border border-[#dfe5e1] bg-white p-6">
                <h2 className="text-xl font-semibold">Etiquetas</h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <button
                      type="button"
                      key={tag.id}
                      onClick={() => void toggleTag(tag)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold ${assigned.some((item) => item.id === tag.id) ? "bg-[#dcece1] text-[#285647]" : "bg-[#f3f5f2] text-[#87938e]"}`}
                    >
                      {assigned.some((item) => item.id === tag.id) ? "✓ " : ""}
                      {tag.name}
                    </button>
                  ))}
                </div>
                <form className="mt-4 flex gap-2" onSubmit={addTag}>
                  <Input
                    aria-label="Nueva etiqueta"
                    value={tagName}
                    onChange={(event) => setTagName(event.target.value)}
                    placeholder="Nueva etiqueta"
                  />
                  <button className="nuth-button !px-3">
                    <Plus size={16} />
                  </button>
                </form>
              </div>
            </section>
            <aside className="space-y-5">
              <div className="rounded-2xl border border-[#dfe5e1] bg-white p-6">
                <p className="text-xs font-bold uppercase tracking-wide text-[#82908a]">
                  Última medición
                </p>
                <p className="mt-3 text-3xl font-semibold text-[#285647]">
                  {latest ? `${latest.bmi} IMC` : "Sin datos"}
                </p>
                {latest && (
                  <p className="mt-1 text-sm text-[#74817d]">
                    {latest.weight_kg} kg · {latest.height_cm} cm ·{" "}
                    {formatPatientDate(latest.measured_at)}
                  </p>
                )}
                <button
                  type="button"
                  className="nuth-button-secondary mt-5"
                  onClick={() => setTab("Medidas")}
                >
                  Ver medidas
                </button>
              </div>
              <div className="rounded-2xl border border-[#dfe5e1] bg-white p-6">
                <h2 className="text-xl font-semibold">Acciones</h2>
                <div className="mt-4 grid gap-2">
                  <button
                    type="button"
                    className="nuth-button-secondary justify-start"
                    onClick={() => setTab("Primera")}
                  >
                    <UserRound size={16} />
                    Ver resumen
                  </button>
                  <button
                    type="button"
                    className="nuth-button-secondary justify-start"
                    onClick={() =>
                      navigate(`/app/patients/${patient.id}/record`)
                    }
                  >
                    <FileText size={16} />
                    Ver expediente
                  </button>
                  <button
                    type="button"
                    className="nuth-button-secondary justify-start"
                    onClick={() =>
                      setNotice(
                        "La transferencia de pacientes estará disponible próximamente.",
                      )
                    }
                  >
                    <UserRound size={16} />
                    Transferir paciente
                  </button>
                  <button
                    type="button"
                    className="nuth-button-secondary justify-start"
                    onClick={() =>
                      setNotice("Mensajería estará disponible próximamente.")
                    }
                  >
                    <MessageCircle size={16} />
                    Enviar mensaje
                  </button>
                  <button
                    type="button"
                    className="nuth-button-secondary justify-start"
                    onClick={() =>
                      setNotice("El calendario estará disponible próximamente.")
                    }
                  >
                    <CalendarPlus size={16} />
                    Ver calendario
                  </button>
                  <button
                    type="button"
                    className="nuth-button-secondary justify-start"
                    onClick={() =>
                      setNotice(
                        "La creación de menús estará disponible próximamente.",
                      )
                    }
                  >
                    <FileText size={16} />
                    Crear menú personalizado
                  </button>
                  <button
                    type="button"
                    className="nuth-button-secondary justify-start"
                    onClick={() =>
                      setNotice(
                        "Rutinas y suplementación estarán disponibles próximamente.",
                      )
                    }
                  >
                    <ShieldCheck size={16} />
                    Rutinas y suplementación
                  </button>
                  <button
                    type="button"
                    className="nuth-button-secondary justify-start"
                    onClick={() =>
                      setNotice(
                        "El reporte de progreso se generará desde FastAPI próximamente.",
                      )
                    }
                  >
                    <FileText size={16} />
                    Descargar progreso
                  </button>
                  <button
                    type="button"
                    className="nuth-button-secondary justify-start"
                    onClick={() =>
                      setNotice(
                        "El enlace seguro del cuestionario estará disponible próximamente.",
                      )
                    }
                  >
                    <ShieldCheck size={16} />
                    Link del cuestionario
                  </button>
                  <button
                    type="button"
                    className="nuth-button-secondary justify-start"
                    onClick={() =>
                      void run(
                        async () => {
                          const updated = await deactivatePatient(
                            patient.id,
                            patient.status === "active",
                          );
                          setPatient({ ...updated, tags: assigned });
                        },
                        patient.status === "active"
                          ? "Paciente desactivado."
                          : "Paciente reactivado.",
                      )
                    }
                  >
                    <ShieldCheck size={16} />
                    {patient.status === "active" ? "Desactivar" : "Reactivar"}
                  </button>
                  <button
                    type="button"
                    className="justify-start rounded-xl px-3 py-2 text-left text-sm font-semibold text-[#9b493a]"
                    onClick={() => setConfirmArchive(true)}
                  >
                    <Trash2 size={16} />
                    Archivar paciente
                  </button>
                </div>
              </div>
            </aside>
          </div>
        )}
        {tab === "Medidas" && (
          <div className="grid gap-5 lg:grid-cols-[.75fr_1.25fr]">
            <form
              onSubmit={addMeasurement}
              className="rounded-2xl border border-[#dfe5e1] bg-white p-6"
            >
              <h2 className="text-xl font-semibold">Nueva medición</h2>
              <div className="mt-5 space-y-4">
                <Field label="Fecha" name="measurement-date">
                  <Input
                    type="date"
                    value={measure.date}
                    onChange={(event) =>
                      setMeasure({ ...measure, date: event.target.value })
                    }
                  />
                </Field>
                <Field label="Peso (kg)" name="measurement-weight">
                  <Input
                    type="number"
                    min="0.1"
                    step="0.01"
                    required
                    value={measure.weight}
                    onChange={(event) =>
                      setMeasure({ ...measure, weight: event.target.value })
                    }
                  />
                </Field>
                <Field label="Estatura (cm)" name="measurement-height">
                  <Input
                    type="number"
                    min="20"
                    step="0.01"
                    required
                    value={measure.height}
                    onChange={(event) =>
                      setMeasure({ ...measure, height: event.target.value })
                    }
                  />
                </Field>
              </div>
              <button className="nuth-button mt-5" disabled={busy}>
                <Plus size={16} />
                Guardar medición
              </button>
            </form>
            <section className="rounded-2xl border border-[#dfe5e1] bg-white p-6">
              <h2 className="text-xl font-semibold">Historial de medidas</h2>
              {measurements.length ? (
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[500px] text-left text-sm">
                    <thead className="text-xs uppercase text-[#82908a]">
                      <tr>
                        <th className="pb-3">Fecha</th>
                        <th className="pb-3">Peso</th>
                        <th className="pb-3">Estatura</th>
                        <th className="pb-3">IMC</th>
                        <th className="pb-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#edf1ed]">
                      {measurements.map((item) => (
                        <tr key={item.id}>
                          <td className="py-3">
                            {formatPatientDate(item.measured_at)}
                          </td>
                          <td className="py-3">{item.weight_kg} kg</td>
                          <td className="py-3">{item.height_cm} cm</td>
                          <td className="py-3 font-semibold text-[#285647]">
                            {item.bmi}
                          </td>
                          <td className="py-3 text-right">
                            <button
                              type="button"
                              className="rounded-lg p-2 text-[#9b493a] hover:bg-[#fff1ed]"
                              aria-label="Eliminar medición"
                              onClick={() => setConfirmMeasurement(item.id)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="mt-4 text-sm text-[#74817d]">
                  Aún no hay medidas.
                </p>
              )}
            </section>
          </div>
        )}
        {tab === "Notas" && (
          <div className="grid gap-5 lg:grid-cols-2">
            <form
              onSubmit={addConsultation}
              className="rounded-2xl border border-[#dfe5e1] bg-white p-6"
            >
              <h2 className="text-xl font-semibold">Nueva consulta</h2>
              <div className="mt-5 space-y-4">
                <Field label="Fecha y hora" name="consultation-date">
                  <Input
                    type="datetime-local"
                    value={consult.date}
                    onChange={(event) =>
                      setConsult({ ...consult, date: event.target.value })
                    }
                  />
                </Field>
                <Field label="Resumen" name="consultation-summary">
                  <Textarea
                    value={consult.summary}
                    onChange={(event) =>
                      setConsult({ ...consult, summary: event.target.value })
                    }
                  />
                </Field>
              </div>
              <button className="nuth-button mt-5" disabled={busy}>
                <CalendarPlus size={16} />
                Registrar consulta
              </button>
            </form>
            <section className="rounded-2xl border border-[#dfe5e1] bg-white p-6">
              <h2 className="text-xl font-semibold">Notas y consultas</h2>
              <form onSubmit={addNote} className="mt-4">
                <Textarea
                  disabled={!consultations[0]}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={
                    consultations[0]
                      ? "Nota de la última consulta…"
                      : "Registra una consulta primero"
                  }
                />
                <button
                  className="nuth-button mt-3"
                  disabled={busy || !consultations[0]}
                >
                  <Plus size={16} />
                  Guardar nota
                </button>
              </form>
              <div className="mt-5 space-y-3">
                {notes.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-xl bg-[#f5f7f3] p-4 text-sm"
                  >
                    <p className="whitespace-pre-wrap">{item.note}</p>
                    <p className="mt-2 text-xs text-[#82908a]">
                      {formatPatientDate(item.updated_at)}
                    </p>
                  </article>
                ))}
                {!notes.length && (
                  <p className="text-sm text-[#74817d]">
                    Todavía no hay notas.
                  </p>
                )}
              </div>
              <div className="mt-5 space-y-2">
                {consultations.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-[#e4eae5] p-3 text-sm"
                  >
                    <strong>{formatPatientDate(item.consultation_date)}</strong>
                    {item.summary && (
                      <p className="mt-1 text-[#74817d]">{item.summary}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
        {tab === "Crecimiento" && (
          <div className="space-y-5">
            <section className="rounded-2xl border border-[#dfe5e1] bg-white p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">Fotos de progreso</h2>
                  <p className="mt-1 text-sm text-[#74817d]">
                    Privadas y accesibles sólo desde tu espacio.
                  </p>
                </div>
                <label className="nuth-button cursor-pointer">
                  <Upload size={16} />
                  {photoBusy ? "Subiendo…" : "Subir foto"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(event) => void uploadPhoto(event)}
                  />
                </label>
              </div>
              {photos.length ? (
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {photos.map(
                    (item) =>
                      item.signedUrl && (
                        <img
                          key={item.id}
                          src={item.signedUrl}
                          alt={item.caption || "Foto de progreso"}
                          className="aspect-square rounded-2xl object-cover"
                        />
                      ),
                  )}
                </div>
              ) : (
                <p className="mt-5 text-sm text-[#74817d]">Aún no hay fotos.</p>
              )}
            </section>
          </div>
        )}
        {["Planes", "Familia", "Referidos"].includes(tab) && (
          <Placeholder title={tab === "Planes" ? "Planes alimenticios" : tab} />
        )}
      </main>
      {confirmArchive && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-[#102d27]/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="archive-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 id="archive-title" className="text-xl font-semibold">
              ¿Archivar paciente?
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#74817d]">
              La ficha dejará de aparecer entre los activos, pero conservará
              todo su historial.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="nuth-button-secondary"
                onClick={() => setConfirmArchive(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="nuth-button !bg-[#9b493a]"
                onClick={() => {
                  setConfirmArchive(false);
                  void archive();
                }}
              >
                <Trash2 size={16} />
                Archivar
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmMeasurement && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-[#102d27]/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="measurement-delete-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 id="measurement-delete-title" className="text-xl font-semibold">
              ¿Eliminar esta medición?
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#74817d]">
              Se quitará del historial de este paciente. Esta acción no afecta
              las demás consultas.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="nuth-button-secondary"
                onClick={() => setConfirmMeasurement(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="nuth-button !bg-[#9b493a]"
                onClick={() => void removeMeasurement()}
              >
                <Trash2 size={16} />
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
