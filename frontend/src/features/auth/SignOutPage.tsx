import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthProvider";
import { LoadingState } from "@/src/components/ui/Status";

// Navigating here lets an open consultation finish its exit decision before
// revoking the session needed to save or discard it.
export function SignOutPage() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void signOut().then(() => {
      if (active) navigate("/", { replace: true });
    }).catch(() => {
      if (active) setError("No pudimos cerrar tu sesión. Vuelve a tu espacio e inténtalo de nuevo.");
    });
    return () => { active = false; };
  }, [signOut, navigate]);
  return error ? <div className="mx-auto max-w-lg p-8"><p role="alert">{error}</p><Link to="/app" className="nuth-button mt-4">Volver a mi espacio</Link></div> : <LoadingState label="Cerrando sesión…" />;
}
