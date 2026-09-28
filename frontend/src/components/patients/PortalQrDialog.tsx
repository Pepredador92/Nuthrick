import { useEffect, useMemo, useState } from "react";
import { Download, QrCode, Share2, X } from "lucide-react";
import { toDataURL } from "qrcode";

type PortalQrDialogProps = {
  url: string;
  patientName: string;
  onClose: () => void;
};

function fileName(patientName: string) {
  const safeName = patientName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `superlink-${safeName || "paciente"}.png`;
}

export function PortalQrDialog({ url, patientName, onClose }: PortalQrDialogProps) {
  const [qrResult, setQrResult] = useState({ url: "", dataUrl: "", error: "" });
  const [sharing, setSharing] = useState(false);
  const downloadName = useMemo(() => fileName(patientName), [patientName]);
  const dataUrl = qrResult.url === url ? qrResult.dataUrl : "";
  const error = qrResult.url === url ? qrResult.error : "";

  useEffect(() => {
    let active = true;
    void toDataURL(url, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 480,
      color: { dark: "#173d36", light: "#ffffff" },
    })
      .then((next) => {
        if (active) setQrResult({ url, dataUrl: next, error: "" });
      })
      .catch(() => {
        if (active) setQrResult({ url, dataUrl: "", error: "No pudimos generar el código QR. Intenta de nuevo." });
      });
    return () => {
      active = false;
    };
  }, [url]);

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  async function share() {
    if (typeof navigator === "undefined" || typeof navigator.share !== "function") return;
    setSharing(true);
    try {
      const shareData: ShareData = {
        title: `Super Link de ${patientName}`,
        text: `Acceso privado de ${patientName}`,
        url,
      };
      if (dataUrl && typeof File !== "undefined" && typeof navigator.canShare === "function") {
        const response = await fetch(dataUrl);
        const file = new File([await response.blob()], downloadName, { type: "image/png" });
        if (navigator.canShare({ files: [file] })) shareData.files = [file];
      }
      await navigator.share(shareData);
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") return;
      setQrResult({
        url,
        dataUrl,
        error: "No pudimos abrir el menú para compartir. Puedes descargar el QR.",
      });
    } finally {
      setSharing(false);
    }
  }

  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[#102d27]/55 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="portal-qr-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[.18em] text-[#397361]">Superlink del paciente</p>
            <h2 id="portal-qr-title" className="mt-2 flex items-center gap-2 text-xl font-semibold text-[#173d36]">
              <QrCode size={21} aria-hidden="true" />
              Código QR
            </h2>
            <p className="mt-2 text-sm text-[#74817d]">
              Escanea o comparte este acceso privado con {patientName}.
            </p>
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-[#61756c] hover:bg-[#f0f5f0]"
            aria-label="Cerrar código QR"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        <div className="mt-5 grid min-h-64 place-items-center rounded-2xl border border-[#dfe7e1] bg-[#f8faf7] p-5">
          {dataUrl ? (
            <img
              src={dataUrl}
              alt={`Código QR del Super Link de ${patientName}`}
              className="h-60 w-60 max-w-full rounded-xl bg-white p-2"
            />
          ) : error ? (
            <p role="alert" className="text-center text-sm text-[#a4513d]">{error}</p>
          ) : (
            <p className="text-sm text-[#74817d]">Generando código QR…</p>
          )}
        </div>
        <p className="mt-3 text-center text-xs leading-5 text-[#74817d]">
          El QR contiene el mismo enlace protegido que aparece en esta pantalla.
        </p>
        {error && dataUrl && <p role="alert" className="mt-3 text-center text-sm text-[#a4513d]">{error}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {canShare && (
            <button type="button" className="nuth-button-secondary" disabled={sharing} onClick={() => void share()}>
              <Share2 size={16} />
              {sharing ? "Preparando…" : "Compartir"}
            </button>
          )}
          <a
            className={`nuth-button${dataUrl ? "" : " pointer-events-none opacity-50"}`}
            href={dataUrl || undefined}
            download={downloadName}
            aria-disabled={!dataUrl}
          >
            <Download size={16} />
            Descargar QR
          </a>
          <button type="button" className="nuth-button-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </section>
    </div>
  );
}
