import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { LegalAcceptanceGate } from "./LegalAcceptanceGate";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/src/lib/supabase", () => ({ supabase: { rpc } }));

const documents = {
  terms: { key: "terms", title: "Términos de uso", version: 1, effective_at: "2026-10-01T00:00:00Z", body: "# Términos\n\nTexto" },
  privacy: { key: "privacy", title: "Aviso de privacidad", version: 1, effective_at: "2026-10-01T00:00:00Z", body: "# Privacidad\n\nTexto" },
};

beforeEach(() => {
  rpc.mockReset();
  let accepted = false;
  rpc.mockImplementation(async (name: string, input?: { p_document_key?: string }) => {
    if (name === "my_legal_acceptances") {
      return { data: accepted ? { required: [], accepted: [] } : { required: [{ document: "terms", version: 1 }, { document: "privacy", version: 1 }], accepted: [] }, error: null };
    }
    if (name === "legal_document") return { data: documents[input?.p_document_key as keyof typeof documents], error: null };
    if (name === "record_legal_acceptance") { accepted = true; return { data: { accepted: true }, error: null };
    }
    return { data: null, error: null };
  });
});

it("requires and records all required legal acceptances before continuing", async () => {
  render(<LegalAcceptanceGate source="checkout"><span>Continuar al pago</span></LegalAcceptanceGate>);
  expect(await screen.findByRole("heading", { name: "Acepta los documentos vigentes" })).toBeInTheDocument();
  expect(screen.queryByText("Continuar al pago")).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText(/He leído y acepto Términos/));
  fireEvent.click(screen.getByLabelText(/He leído y acepto Aviso/));
  fireEvent.click(screen.getByRole("button", { name: "Aceptar y continuar" }));
  await waitFor(() => expect(screen.getByText("Continuar al pago")).toBeInTheDocument());
  expect(rpc).toHaveBeenCalledWith("record_legal_acceptance", { p_document_key: "terms", p_version: 1, p_source: "checkout" });
  expect(rpc).toHaveBeenCalledWith("record_legal_acceptance", { p_document_key: "privacy", p_version: 1, p_source: "checkout" });
});
