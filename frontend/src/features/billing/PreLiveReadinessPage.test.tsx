import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { PreLiveReadinessPage } from "./PreLiveReadinessPage";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/src/lib/supabase", () => ({ supabase: { rpc } }));

beforeEach(() => {
  rpc.mockResolvedValue({
    data: {
      generated_at: "2026-09-24T12:00:00Z",
      mode: "test",
      live_enabled: false,
      openai_enabled: false,
      summary: { ready: 1, pending: 1, blocked: 0 },
      checks: [
        { key: "stripe_mode", label: "Stripe permanece en TEST", status: "ready", detail: "Solo Test" },
        { key: "legal", label: "Términos, privacidad y reembolsos", status: "pending", detail: "Pendiente de aprobación" },
      ],
    },
    error: null,
  });
});

it("shows test mode, readiness counts and actionable pending checks", async () => {
  render(<MemoryRouter><PreLiveReadinessPage /></MemoryRouter>);
  expect(await screen.findByText(/Stripe TEST · Live deshabilitado/)).toBeInTheDocument();
  expect(screen.getByText("listos")).toBeInTheDocument();
  expect(screen.getByText("Términos, privacidad y reembolsos")).toBeInTheDocument();
  expect(screen.getByText("Pendiente")).toBeInTheDocument();
});
