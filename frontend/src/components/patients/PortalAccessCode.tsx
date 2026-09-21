import { useEffect, useState } from "react";
import { portalAction } from "@/src/services/patientPortal";
export function PortalAccessCode({ patientId }: { patientId: string }) {
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [issued, setIssued] = useState<{
    code: string;
    expiresAt: string;
  } | null>(null);
  useEffect(() => {
    if (!issued) return;
    const timer = setTimeout(
      () => setIssued(null),
      Math.max(0, Date.parse(issued.expiresAt) - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [issued]);
  async function generate() {
    setBusy(true);
    setError("");
    setIssued(null);
    try {
      setIssued(
        await portalAction({ patientId }, "issue_code", {
          identityConfirmed: confirmed,
        }),
      );
      setConfirmed(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-5 border-t border-[#e0e7de] pt-4">
      <h3 className="text-sm font-semibold">Acceso sin correo</h3>
      <p className="mt-2 text-sm text-[#63796d]">
        Entrega este código personalmente o al contacto del paciente que ya
        verificaste. No se envía automáticamente. El paciente elegirá «Tengo un
        código de mi nutriólogo» al abrir su superlink.
      </p>
      <label className="mt-3 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          disabled={busy}
        />
        Confirmé la identidad del paciente en consulta o mediante su contacto
        verificado.
      </label>
      <button
        className="nuth-button-secondary mt-3"
        disabled={!confirmed || busy}
        onClick={() => void generate()}
      >
        {busy ? "Generando…" : "Generar código de acceso"}
      </button>
      {issued && (
        <div role="status" className="mt-3 rounded-xl bg-[#edf3e7] p-4">
          <label htmlFor="issued-portal-code" className="text-sm font-semibold">
            Código de un solo uso
          </label>
          <input
            id="issued-portal-code"
            className="nuth-input mt-2 text-center text-xl tracking-widest"
            value={issued.code}
            readOnly
            onFocus={(e) => e.target.select()}
          />
          <p className="mt-2 text-xs">
            Vence a las{" "}
            {new Date(issued.expiresAt).toLocaleTimeString("es-MX", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            . Generar otro invalida el anterior. No podrás recuperarlo al salir
            de esta pantalla.
          </p>
          <button
            className="mt-2 text-sm underline"
            onClick={() => setIssued(null)}
          >
            Ocultar código
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
