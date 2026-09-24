import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { CommercialPlansPage } from "./CommercialPlansPage";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/src/lib/supabase", () => ({ supabase: { rpc } }));
const plan = {
  name: "Plan configurable",
  description: "Descripción editable",
  currency: "MXN",
  monthly_price: 349,
  annual_price: 3490,
  credits_provisional: true,
  values: {
    "patients.limit": 30,
    "ai.monthly_credits": 10,
    consultations: true,
    "ai.pes": true,
    exports: true,
  },
};
beforeEach(() => rpc.mockResolvedValue({ data: [plan], error: null }));
function show() {
  render(
    <MemoryRouter>
      <CommercialPlansPage />
    </MemoryRouter>,
  );
}
it("reads the public projection and toggles independently configured prices", async () => {
  show();
  expect(await screen.findByText("Plan configurable")).toBeInTheDocument();
  expect(rpc).toHaveBeenCalledWith("plan_catalog");
  expect(screen.getByText("$349")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Anual" }));
  expect(screen.getByText("$3,490")).toBeInTheDocument();
  expect(screen.getByText(/10 créditos incluidos por mes/)).toBeInTheDocument();
});
it("describes the returned capabilities without assuming a commercial plan name", async () => {
  show();
  await screen.findByText("Plan configurable");
  expect(screen.getByText("Consultas")).toBeInTheDocument();
  expect(screen.getByText("PDF de planes")).toBeInTheDocument();
  expect(screen.queryByText("Superlink con chat")).not.toBeInTheDocument();
  expect(
    screen.queryByText("LaTeX para el profesional"),
  ).not.toBeInTheDocument();
});
it("does not present an unconfigured price as free", async () => {
  rpc.mockResolvedValue({
    data: [{ ...plan, monthly_price: null }],
    error: null,
  });
  show();
  expect(await screen.findByText("Por definir")).toBeInTheDocument();
  expect(screen.queryByText("$0")).not.toBeInTheDocument();
});
