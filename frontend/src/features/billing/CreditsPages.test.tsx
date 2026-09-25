import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { MyCreditsPage } from "./MyCreditsPage";
import {
  CreditPackageEditorPage,
  CreditPurchasesPage,
} from "./AdminCreditsPages";
import { PromotionEditorPage } from "./AdminBillingPages";
const { rpc, invoke } = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock(
  "@/src/lib/supabase",
  () => ({ supabase: { rpc, functions: { invoke } } }),
);
const pkg = {
  id: "cb300000-0000-4000-8000-000000000002",
  code: "TEST_MEDIUM",
  name: "Mediano TEST",
  description: "",
  credits: 500,
  bonus_credits: 0,
  price_amount: 25,
  currency: "MXN",
  active: true,
  internal_only: false,
  test_only: true,
  display_order: 1,
  version: 1,
};
const original = {
  mode: "test",
  enabled: true,
  eligible: true,
  test_eligible: true,
  balances: {
    included: 8,
    additional: 300,
    available: 308,
    debt: 0,
    in_review: false,
  },
  packages: [pkg],
  purchases: [],
  pending: null,
  history: [],
};
let summary: Record<string, unknown>;
beforeEach(() => {
  vi.clearAllMocks();
  summary = structuredClone(original);
  rpc.mockImplementation(async (
    name: string,
    args?: { p_action?: string; p_data?: Record<string, unknown> },
  ) => ({
    data: name === "my_ai_credits"
      ? summary
      : name === "admin_api"
      ? { plans: [], entitlements: [] }
      : args?.p_action === "overview"
      ? { credit_packages: [pkg] }
      : args?.p_action === "save_package" || args?.p_action === "save_campaign"
      ? args.p_data
      : args?.p_action === "purchases"
      ? []
      : null,
    error: null,
  }));
  invoke.mockResolvedValue({
    data: {
      amount: 2000,
      currency: "MXN",
      credits: 500,
      bonus: 50,
      campaign: { code: "TEST", name: "Prueba" },
    },
    error: null,
  });
});
const show = (node: React.ReactNode, path = "/app/credits") =>
  render(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>);
it("shows included, additional and available without claiming fixed AI equivalences", async () => {
  show(<MyCreditsPage />);
  expect(await screen.findByText("308")).toBeInTheDocument();
  expect(screen.getByText("8")).toBeInTheDocument();
  expect(screen.getByText("300")).toBeInTheDocument();
  expect(screen.getByText("Los créditos adicionales no vencen."))
    .toBeInTheDocument();
  expect(screen.queryByText(/tokens|100 planes/i)).not.toBeInTheDocument();
});
it("selecting a package previews server price and sends no amount, credits or owner", async () => {
  show(<MyCreditsPage />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Recargar créditos" }),
  );
  fireEvent.click(screen.getByRole("button", { name: /500 créditos/ }));
  fireEvent.change(screen.getByLabelText("Código promocional (opcional)"), {
    target: { value: "test" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Revisar importe" }));
  expect(await screen.findByText(/550 créditos ·/)).toBeInTheDocument();
  const body = invoke.mock.calls[0][1].body;
  expect(Object.keys(body).sort()).toEqual([
    "action",
    "code",
    "operation_key",
    "package_id",
  ]);
  expect(body.package_id).toBe(pkg.id);
  expect(body.code).toBe("TEST");
});
it("success URL alone never grants or displays confirmed credits", async () => {
  show(
    <MyCreditsPage />,
    "/app/credits?purchase=cd300000-0000-4000-8000-000000000001",
  );
  expect(await screen.findByText("Estamos confirmando tu pago…"))
    .toBeInTheDocument();
  expect(screen.queryByText("Tus créditos ya están disponibles.")).not
    .toBeInTheDocument();
  expect(invoke).not.toHaveBeenCalled();
});
it("confirmed webhook purchase shows success", async () => {
  summary.purchases = [{
    id: "paid",
    package_name: "TEST",
    credits_purchased: 500,
    bonus_credits: 0,
    credited_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    status: "paid",
    amount_paid: 2500,
    currency: "MXN",
    reversed_credits: 0,
    refunded_amount: 0,
  }];
  show(<MyCreditsPage />, "/app/credits?purchase=paid");
  expect(await screen.findByText("Tus créditos ya están disponibles."))
    .toBeInTheDocument();
  expect(screen.getByText("Completada")).toBeInTheDocument();
});
it("entitlement disables checkout while debt explains the AI block", async () => {
  summary.eligible = false;
  summary.balances = {
    included: 8,
    additional: -10,
    available: 0,
    debt: 10,
    in_review: false,
  };
  show(<MyCreditsPage />);
  expect(await screen.findByRole("button", { name: "Recargar créditos" }))
    .toBeDisabled();
  expect(screen.getByText(/10 créditos pendientes de regularizar/))
    .toBeInTheDocument();
  expect(invoke).not.toHaveBeenCalled();
});
it("package editor keeps commercial price unset and saves admin configuration", async () => {
  show(<CreditPackageEditorPage />, "/admin/credits/packages/new");
  expect(screen.getByLabelText("Precio TEST")).toHaveValue(null);
  fireEvent.change(screen.getByLabelText("Nombre"), {
    target: { value: "Paquete TEST" },
  });
  fireEvent.change(screen.getByLabelText("Código interno"), {
    target: { value: "test_new" },
  });
  fireEvent.change(screen.getByLabelText("Créditos"), {
    target: { value: "500" },
  });
  fireEvent.change(screen.getByLabelText("Precio TEST"), {
    target: { value: "25" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Guardar paquete" }));
  await waitFor(() =>
    expect(rpc).toHaveBeenCalledWith(
      "ai_credit_admin_api",
      expect.objectContaining({
        p_action: "save_package",
        p_data: expect.objectContaining({
          credits: 500,
          price_amount: 25,
          code: "TEST_NEW",
          active: false,
        }),
      }),
    )
  );
});
it("admin purchase history has a clear empty state", async () => {
  show(<CreditPurchasesPage />);
  expect(await screen.findByText("Todavía no hay compras."))
    .toBeInTheDocument();
});
it("shared promotion editor limits package benefits to discount and bonus", async () => {
  show(<PromotionEditorPage />, "/admin/promotions/new");
  const target = await screen.findByLabelText("Aplica a");
  fireEvent.change(target, { target: { value: "ai_credit_package" } });
  expect(await screen.findByLabelText("Mediano TEST")).toBeInTheDocument();
  expect(screen.queryByText("Modalidades elegibles")).not.toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Mejora temporal de plan" })).not
    .toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Créditos bonus por recarga" }))
    .toBeInTheDocument();
});
