import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PortalQrDialog } from "./PortalQrDialog";

vi.mock("qrcode", () => ({
  toDataURL: vi.fn(async () => "data:image/png;base64,qr-code"),
}));

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
});

it("genera un QR descargable para el enlace protegido y permite cerrarlo", async () => {
  const onClose = vi.fn();
  render(
    <PortalQrDialog
      url="https://example.invalid/mi-espacio#token"
      patientName="Diana Laura Acuña Valdés"
      onClose={onClose}
    />,
  );

  expect(await screen.findByRole("img", { name: "Código QR del Super Link de Diana Laura Acuña Valdés" })).toHaveAttribute(
    "src",
    "data:image/png;base64,qr-code",
  );
  expect(screen.getByRole("link", { name: "Descargar QR" })).toHaveAttribute(
    "download",
    "superlink-diana-laura-acuna-valdes.png",
  );
  fireEvent.click(screen.getByRole("button", { name: "Cerrar código QR" }));
  expect(onClose).toHaveBeenCalledOnce();
});

it("usa el menú nativo de compartir cuando el dispositivo lo ofrece", async () => {
  const share = vi.fn(async () => undefined);
  Object.defineProperty(navigator, "share", { value: share, configurable: true });
  render(
    <PortalQrDialog
      url="https://example.invalid/mi-espacio#token"
      patientName="Paciente"
      onClose={vi.fn()}
    />,
  );
  await screen.findByRole("img");
  fireEvent.click(screen.getByRole("button", { name: "Compartir" }));
  await waitFor(() =>
    expect(share).toHaveBeenCalledWith({
      title: "Super Link de Paciente",
      text: "Acceso privado de Paciente",
      url: "https://example.invalid/mi-espacio#token",
    }),
  );
});
