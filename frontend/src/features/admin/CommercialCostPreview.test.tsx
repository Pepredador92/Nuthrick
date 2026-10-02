import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { CommercialCostPreview } from "./CommercialCostPreview";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/src/lib/supabase", () => ({ supabase: { rpc } }));
beforeEach(() => {
  localStorage.clear();
  rpc.mockResolvedValue({
    data: {
      checked_at: "2026-10-02",
      features: [{
        feature: "recall_24h",
        usd_per_credit: .01,
        pricing_version: "v1",
      }],
    },
    error: null,
  });
});
it("reacts to price and FX edits, and links to the provider balance", async () => {
  const page = render(
    <CommercialCostPreview
      monthlyPrice={349}
      annualPrice={3490}
      credits={50}
    />,
  );
  expect(await screen.findByText("$318.87")).toBeInTheDocument();
  page.rerender(
    <CommercialCostPreview
      monthlyPrice={299}
      annualPrice={3490}
      credits={50}
    />,
  );
  expect(screen.getByText("$271.36")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Tipo de cambio simulado (MXN/USD)"), {
    target: { value: "20" },
  });
  expect(screen.getByText("$270.61")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Recargar saldo de OpenAI/ }))
    .toHaveAttribute(
      "href",
      "https://platform.openai.com/settings/organization/billing/overview",
    );
  expect(rpc).toHaveBeenCalledTimes(1);
});
it("does not estimate a profit when configured AI conversion cannot be loaded", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "offline" } });
  render(<CommercialCostPreview packagePrice={99} credits={100} />);
  expect(await screen.findByText(/No pudimos consultar/)).toBeInTheDocument();
  expect(screen.getByText(/Completa los importes/)).toBeInTheDocument();
});
