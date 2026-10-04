import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { PatientMessagesPage } from "./PatientMessagesPage";

const portalApi = vi.hoisted(() => vi.fn());
vi.mock("@/src/services/patientPortal", () => ({ portalApi }));

afterEach(() => vi.clearAllMocks());

it("prioritizes unread conversations and keeps the patient chat link", async () => {
  portalApi.mockResolvedValue({
    patients: [
      { id: "p-1", full_name: "Diana Laura", unread: 2, last_message_at: null },
      { id: "p-2", full_name: "Ana", unread: 0, last_message_at: null },
    ],
  });
  render(<MemoryRouter><PatientMessagesPage /></MemoryRouter>);
  expect(await screen.findByText("Diana Laura")).toBeInTheDocument();
  expect(screen.getByText("conversación sin leer en esta página").previousElementSibling).toHaveTextContent("1");
  expect(screen.getByRole("link", { name: /Diana Laura/ })).toHaveAttribute(
    "href",
    "/app/patients/p-1/portal?tab=chat",
  );
  expect(screen.getByRole("heading", { name: "Busca por paciente" })).toBeInTheDocument();
});
