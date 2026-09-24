import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Link, Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/src/features/auth/AuthProvider";
import { LoadingState } from "@/src/components/ui/Status";
import {
  canReadFeature,
  fetchMyAccess,
  type MyAccess,
  statusLabels,
} from "./api";

const AccessContext = createContext<{
  data: MyAccess | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
}>({ data: null, loading: true, error: "", refresh: async () => {} });
export function AccessProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<{
    owner: string;
    data: MyAccess | null;
    error: string;
  }>({ owner: "", data: null, error: "" });
  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const data = await fetchMyAccess();
      setState({ owner: user.id, data, error: "" });
    } catch (e) {
      setState({
        owner: user.id,
        data: null,
        error:
          e instanceof Error ? e.message : "No pudimos verificar tu acceso.",
      });
    }
  }, [user]);
  useEffect(() => {
    if (!user) return;
    let active = true;
    const update = async () => {
      try {
        const data = await fetchMyAccess();
        if (active) setState({ owner: user.id, data, error: "" });
      } catch (e) {
        if (active)
          setState({
            owner: user.id,
            data: null,
            error:
              e instanceof Error
                ? e.message
                : "No pudimos verificar tu acceso.",
          });
      }
    };
    void update();
    const timer = window.setInterval(() => void update(), 60000);
    window.addEventListener("focus", update);
    window.addEventListener("nuthrick:access", update);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", update);
      window.removeEventListener("nuthrick:access", update);
    };
  }, [user]);
  const current = state.owner === user?.id;
  return (
    <AccessContext.Provider
      value={{
        data: current ? state.data : null,
        error: current ? state.error : "",
        loading: authLoading || Boolean(user && !current),
        refresh,
      }}
    >
      {children}
    </AccessContext.Provider>
  );
}
export const useAccess = () => useContext(AccessContext);
export function AdminGuard() {
  const { user, loading: authLoading } = useAuth();
  const { data, loading, error, refresh } = useAccess();
  if (authLoading) return <LoadingState label="Verificando sesión…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: "/admin" }} />;
  if (loading) return <LoadingState label="Verificando administración…" />;
  if (error)
    return (
      <div className="p-10" role="alert">
        {error}
        <button
          onClick={() => void refresh()}
          className="nuth-button-secondary ml-4"
        >
          Reintentar
        </button>
      </div>
    );
  if (!data?.is_admin)
    return (
      <div className="mx-auto max-w-lg p-12">
        <p className="text-sm">403 · Acceso denegado</p>
        <h1 className="my-4 text-2xl font-bold">
          Esta cuenta no administra Nuthrick.
        </h1>
        <Link to="/app" className="nuth-button-secondary">
          Volver a mi espacio
        </Link>
      </div>
    );
  return <Outlet />;
}
export function routeEntitlement(path: string): string | null {
  if (path.includes("/consultations/")) return "consultations";
  if (path.startsWith("/app/consultation-templates"))
    return "consultation_design";
  if (path.includes("/portal") || path === "/app/messages")
    return "patient_superlink";
  if (path.startsWith("/app/patients")) return "patients";
  if (path.startsWith("/app/diet-workshop")) return "diet_workshop";
  if (path.startsWith("/app/agenda")) return "agenda";
  return null;
}
export function ProfessionalAccessGate() {
  const { data, loading, error, refresh } = useAccess();
  const { pathname } = useLocation();
  const key = routeEntitlement(pathname);
  if (loading) return <LoadingState label="Verificando acceso…" />;
  if (error)
    return (
      <div role="alert">
        {error}
        <button
          className="nuth-button-secondary ml-4"
          onClick={() => void refresh()}
        >
          Reintentar
        </button>
      </div>
    );
  if (!data?.access.allowed || (key && !canReadFeature(data.access, key)))
    return (
      <section className="rounded-3xl border border-[#dce5de] bg-white p-8">
        <p className="text-sm text-[#687b70]">
          {statusLabels[data?.access.status ?? "unassigned"]}
        </p>
        <h1 className="mt-3 text-2xl font-bold">
          {data?.access.allowed
            ? "Esta función no está incluida en tu acceso."
            : "Tu cuenta necesita un acceso vigente."}
        </h1>
        <p className="mt-3 text-[#687b70]">
          Contacta a la administración de Nuthrick para revisar tu plan o
          vigencia.
        </p>
        <Link to="/planes" className="nuth-button-secondary mt-5 mr-3">
          Ver planes
        </Link>
        {data?.is_admin && (
          <Link to="/admin" className="nuth-button mt-5">
            Ir a administración
          </Link>
        )}
      </section>
    );
  return (
    <>
      {data.access.read_only && (
        <div
          role="status"
          className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
        >
          Tu cuenta está en modo de consulta. Puedes revisar expedientes e
          históricos. Las altas, cambios, publicaciones, mensajes y generaciones
          de IA están suspendidos.
        </div>
      )}
      <Outlet />
    </>
  );
}
