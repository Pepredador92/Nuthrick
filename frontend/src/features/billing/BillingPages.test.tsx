import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { MyPlanPage } from "./MyPlanPage";
import { PromotionEditorPage } from "./AdminBillingPages";
import { CheckoutChoice } from "./CheckoutChoice";
import { billingReturn, rememberPlan } from "./returnToPlan";
import { checkoutAmount, hostedUrl } from "./api";
const { rpc, invoke, refresh, auth } = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  refresh: vi.fn(),
  auth: {
    user: { id: "ba000000-0000-4000-8000-000000000002" } as
      | { id: string }
      | null,
  },
}));
vi.mock(
  "@/src/lib/supabase",
  () => ({ supabase: { rpc, functions: { invoke } } }),
);
vi.mock(
  "@/src/features/admin/AccessProvider",
  () => ({ useAccess: () => ({ refresh }) }),
);
vi.mock("@/src/features/auth/AuthProvider", () => ({ useAuth: () => auth }));
const plan = {
  id: "bd000000-0000-4000-8000-000000000001",
  code: "esencial",
  name: "Esencial",
  description: "Plan de prueba",
  active: true,
  internal_only: false,
  display_order: 1,
  monthly_price: 349,
  annual_price: 3490,
  currency: "MXN",
  values: { "ai.monthly_credits": 10, "patients.limit": 30 },
};
const subscription = {
  id: "sub-local",
  professional_id: "ba000000-0000-4000-8000-000000000002",
  plan_id: plan.id,
  plan_name: "Esencial",
  interval: "monthly",
  amount: 34900,
  currency: "MXN",
  state: "active",
  period_start: "2026-09-01T00:00:00Z",
  period_end: "2026-10-01T00:00:00Z",
  paid_through: "2026-10-01T00:00:00Z",
  cancel_at_period_end: false,
  grace_until: null,
  manual_hold: false,
  pending_plan_id: null,
  provider: "stripe",
  campaign_snapshot: null,
};
const summary = {
  mode: "test",
  enabled: true,
  test_eligible: true,
  subscription,
  access: { plan_name: "Esencial", status: "active", values: plan.values },
  payments: [],
  credits: { included: 10, additional: 20 },
};
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  auth.user = { id: subscription.professional_id };
  invoke.mockResolvedValue({ data: { requested: true }, error: null });
  refresh.mockResolvedValue(undefined);
  rpc.mockImplementation(async (
    name: string,
    args?: { p_action?: string; p_data?: Record<string, unknown> },
  ) => ({
    data: name === "my_billing"
      ? summary
      : name === "plan_catalog"
      ? [plan]
      : name === "admin_api"
      ? { plans: [plan], entitlements: [] }
      : args?.p_action === "save_campaign"
      ? args.p_data
      : null,
    error: null,
  }));
});
const show = (component: React.ReactNode, path = "/app/my-plan") =>
  render(<MemoryRouter initialEntries={[path]}>{component}</MemoryRouter>);
it("Mi plan presents local balances and uses an explicit cancellation confirmation", async () => {
  show(<MyPlanPage />);
  expect(await screen.findByText("Esencial")).toBeInTheDocument();
  expect(screen.getByText("30")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cancelar suscripción" }));
  expect(invoke).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", {
      name: "Confirmar cancelación al vencimiento",
    }),
  );
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith(
      "billing",
      expect.objectContaining({
        body: expect.objectContaining({
          action: "cancel",
          operation_key: expect.any(String),
        }),
      }),
    )
  );
  expect(await screen.findByText(/Solicitud enviada/)).toBeInTheDocument();
});
it("the checkout success URL does not activate or invoke any billing mutation", async () => {
  rpc.mockImplementation(async (name: string) => ({
    data: name === "my_billing"
      ? {
        ...summary,
        subscription: null,
        access: { ...summary.access, plan_name: null },
      }
      : [plan],
    error: null,
  }));
  show(<MyPlanPage />, "/app/my-plan?checkout=success");
  expect(await screen.findByText("Sin plan contratado")).toBeInTheDocument();
  expect(screen.getByText(/Estamos confirmando/)).toBeInTheDocument();
  expect(invoke).not.toHaveBeenCalled();
});
it("suspended subscribers retain the payment recovery action", async () => {
  rpc.mockImplementation(async (name: string) => ({
    data: name === "my_billing"
      ? { ...summary, subscription: { ...subscription, state: "suspended" } }
      : [plan],
    error: null,
  }));
  show(<MyPlanPage />);
  expect(await screen.findByText(/Puedes consultar tus expedientes/))
    .toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Administrar pago y facturas" }))
    .toBeEnabled();
  expect(screen.getByRole("button", { name: "Cambiar plan" })).toBeDisabled();
});
it("unsafe invoice links are not rendered as clickable external links", async () => {
  rpc.mockImplementation(async (name: string) => ({
    data: name === "my_billing"
      ? {
        ...summary,
        payments: [{
          provider_invoice_id: "in_fixture",
          amount_paid: 34900,
          currency: "MXN",
          status: "paid",
          issued_at: "2026-09-01",
          hosted_url: "https://evil.test/invoice",
        }],
      }
      : [plan],
    error: null,
  }));
  show(<MyPlanPage />);
  await screen.findByText("Pagado");
  expect(screen.queryByRole("link", { name: /Ver en Stripe/ })).not
    .toBeInTheDocument();
});
it("new university campaigns can combine a promotional price and welcome credits", async () => {
  show(<PromotionEditorPage />);
  await screen.findByLabelText("Nombre");
  fireEvent.change(screen.getByLabelText("Nombre"), {
    target: { value: "Universidad UAZ" },
  });
  fireEvent.change(screen.getByLabelText("Código"), {
    target: { value: "UAZ2026" },
  });
  fireEvent.click(screen.getByLabelText("Esencial"));
  fireEvent.click(screen.getByRole("button", { name: "Añadir beneficio" }));
  fireEvent.click(screen.getByRole("button", { name: "Guardar promoción" }));
  await waitFor(() =>
    expect(rpc).toHaveBeenCalledWith(
      "billing_admin_api",
      expect.objectContaining({
        p_action: "save_campaign",
        p_data: expect.objectContaining({
          code: "UAZ2026",
          audience: "university",
          eligible_plan_ids: [plan.id],
          benefits: expect.arrayContaining([
            expect.objectContaining({
              type: "custom_price",
              amount: 249,
              duration: { kind: "months", months: 12 },
            }),
            expect.objectContaining({ type: "initial_ai_credits", amount: 20 }),
          ]),
          max_redemptions: 100,
        }),
      }),
    )
  );
});
it("Checkout requires validated promotion preview before sending to Stripe", async () => {
  invoke.mockResolvedValue({
    data: {
      price: { amount: 34900, currency: "MXN" },
      campaign: {
        code: "UAZ2026",
        name: "Universidad UAZ",
        benefits: [{
          type: "custom_price",
          amount: 249,
          duration: { kind: "months", months: 12 },
        }],
        fallback: "normal_plan",
      },
    },
    error: null,
  });
  rpc.mockResolvedValue({
    data: { ...summary, subscription: null },
    error: null,
  });
  show(<CheckoutChoice plan={plan} interval="monthly" close={() => {}} />);
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Continuar a Stripe Test" }))
      .toBeEnabled()
  );
  fireEvent.change(screen.getByLabelText("Código promocional (opcional)"), {
    target: { value: "UAZ2026" },
  });
  expect(screen.getByRole("button", { name: "Continuar a Stripe Test" }))
    .toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Validar código" }));
  expect(await screen.findByText("Universidad UAZ")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Continuar a Stripe Test" }))
    .toBeEnabled();
  expect(screen.getByText(/\$249.00 MXN/)).toBeInTheDocument();
});
it("Test allowlist gates Checkout for an ordinary signed-in account", async () => {
  rpc.mockResolvedValue({
    data: { ...summary, test_eligible: false, subscription: null },
    error: null,
  });
  show(<CheckoutChoice plan={plan} interval="monthly" close={() => {}} />);
  expect(await screen.findByText(/aún no está autorizada/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Continuar a Stripe Test" }))
    .toBeDisabled();
});
it("plan selection survives login but never creates an external redirect", () => {
  rememberPlan(plan.id, "annual");
  expect(billingReturn()).toBe(`/planes?plan=${plan.id}&interval=annual`);
  localStorage.setItem(
    "nuthrick:billing-selection",
    JSON.stringify({
      id: "https://evil.test/",
      interval: "annual",
      at: Date.now(),
    }),
  );
  expect(billingReturn()).toBeNull();
});
it("promotional amount display uses cents and respects normal-price fallback", () => {
  expect(
    checkoutAmount(34900, [{
      type: "custom_price",
      amount: 249,
      duration: { kind: "months", months: 12 },
    }]),
  ).toBe(24900);
  expect(
    checkoutAmount(49900, [{
      type: "percentage_discount",
      amount: 20,
      duration: { kind: "months", months: 3 },
    }]),
  ).toBe(39920);
  expect(checkoutAmount(34900)).toBe(34900);
  expect(hostedUrl("https://billing.stripe.com.evil.test/p", "portal"))
    .toBeNull();
});
