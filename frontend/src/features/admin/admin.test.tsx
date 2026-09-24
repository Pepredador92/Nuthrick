import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AccessProvider,
  AdminGuard,
  ProfessionalAccessGate,
  routeEntitlement,
} from "./AccessProvider";
import {
  canUseFeature,
  getLimit,
  type Access,
  type Catalog,
  type ProfessionalDetail,
} from "./api";
import { PlanEditorPage, ProfessionalsPage } from "./AdminPages";
import { ProfessionalPage } from "./ProfessionalPage";
import { CodesPage } from "./CodesPage";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  user: { id: "owner" },
  isAdmin: false,
}));
vi.mock("@/src/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/src/features/auth/AuthProvider", () => ({
  useAuth: () => ({ user: mocks.user, loading: false, signOut: vi.fn() }),
}));
const access: Access = {
  plan_id: "beta",
  plan_name: "Nuthrick Beta",
  status: "trial",
  starts_at: "2026-09-01T00:00:00Z",
  ends_at: null,
  allowed: true,
  values: {
    patients: true,
    diet_workshop: true,
    "ai.pes": false,
    "patients.limit": "unlimited",
    "ai.monthly_credits": 0,
  },
  sources: { patients: "plan" },
};
const catalog: Catalog = {
  entitlements: [
    {
      key: "patients",
      label: "Pacientes",
      category: "Clínica",
      value_type: "boolean",
      display_order: 1,
    },
    {
      key: "ai.pes",
      label: "Diagnóstico PES",
      category: "IA",
      value_type: "boolean",
      display_order: 2,
    },
    {
      key: "patients.limit",
      label: "Máximo de pacientes",
      category: "Límites",
      value_type: "limit",
      display_order: 3,
    },
    {
      key: "ai.monthly_credits",
      label: "Créditos IA mensuales configurados",
      category: "Límites",
      value_type: "limit",
      display_order: 4,
    },
  ],
  plans: [
    {
      id: "beta",
      code: "beta",
      name: "Nuthrick Beta",
      description: "Piloto controlado",
      active: true,
      display_order: 1,
      monthly_price: null,
      annual_price: null,
      currency: "MXN",
      updated_at: "2026-09-01T00:00:00Z",
      values: {
        patients: true,
        "ai.pes": false,
        "patients.limit": "unlimited",
        "ai.monthly_credits": 0,
      },
    },
  ],
};
const professional: ProfessionalDetail = {
  id: "professional",
  name: "Profesional de prueba",
  email: "pilot@example.test",
  created_at: "2026-09-01T00:00:00Z",
  last_activity: null,
  access,
  credits: 0,
  base_access: null,
  overrides: [],
  grants: [],
  audit: [],
  ai: {
    available: 0,
    included: 0,
    purchased: 0,
    consumed: 0,
    usage: [],
    ledger: [],
  },
};
beforeEach(() => {
  mocks.isAdmin = false;
  mocks.rpc.mockReset();
  mocks.rpc.mockImplementation(
    async (name: string, args: Record<string, unknown>) => ({
      error: null,
      data:
        name === "my_access"
          ? { is_admin: mocks.isAdmin, access }
          : name === "admin_api"
            ? ((
                {
                  catalog,
                  professional,
                  professionals: { items: [professional], total: 1 },
                  codes: [],
                } as Record<string, unknown>
              )[String(args.p_action)] ?? { saved: true })
            : null,
    }),
  );
});
function route(element: React.ReactNode, path: string, url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path={path} element={element} />
        <Route path="/admin/plans" element={<p>Listado guardado</p>} />
      </Routes>
    </MemoryRouter>,
  );
}
describe("administrative authorization and entitlements", () => {
  it("rejects direct admin navigation for a professional", async () => {
    render(
      <MemoryRouter>
        <AccessProvider>
          <Routes>
            <Route element={<AdminGuard />}>
              <Route path="/" element={<p>Datos privados</p>} />
            </Route>
          </Routes>
        </AccessProvider>
      </MemoryRouter>,
    );
    expect(
      await screen.findByText(/403 · Acceso denegado/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Datos privados")).not.toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith("my_access");
  });
  it("allows an admin verified by the server", async () => {
    mocks.isAdmin = true;
    render(
      <MemoryRouter>
        <AccessProvider>
          <Routes>
            <Route element={<AdminGuard />}>
              <Route path="/" element={<p>Panel autorizado</p>} />
            </Route>
          </Routes>
        </AccessProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText("Panel autorizado")).toBeInTheDocument();
  });
  it("fails closed if access cannot be verified", async () => {
    mocks.rpc.mockResolvedValue({ error: { message: "offline" }, data: null });
    render(
      <MemoryRouter>
        <AccessProvider>
          <Routes>
            <Route element={<AdminGuard />}>
              <Route path="/" element={<p>Datos privados</p>} />
            </Route>
          </Routes>
        </AccessProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos verificar",
    );
    expect(screen.queryByText("Datos privados")).not.toBeInTheDocument();
  });
  it("blocks a directly entered disabled module", async () => {
    render(
      <MemoryRouter initialEntries={["/app/agenda"]}>
        <AccessProvider>
          <Routes>
            <Route element={<ProfessionalAccessGate />}>
              <Route path="/app/agenda" element={<p>Agenda privada</p>} />
            </Route>
          </Routes>
        </AccessProvider>
      </MemoryRouter>,
    );
    expect(
      await screen.findByText("Esta función no está incluida en tu acceso."),
    ).toBeInTheDocument();
  });
  it("uses capability values, explicit unlimited and access state", () => {
    expect(canUseFeature(access, "patients")).toBe(true);
    expect(canUseFeature(access, "ai.pes")).toBe(false);
    expect(getLimit(access, "patients.limit")).toBe("unlimited");
    expect(getLimit(access, "ai.monthly_credits")).toBe(0);
    expect(canUseFeature({ ...access, allowed: false }, "patients")).toBe(
      false,
    );
    expect(getLimit({ ...access, allowed: false }, "patients.limit")).toBe(0);
    expect(routeEntitlement("/app/patients/123/consultations/456")).toBe(
      "consultations",
    );
  });
});
describe("admin workflows", () => {
  it("searches name or email through the admin boundary", async () => {
    route(
      <ProfessionalsPage />,
      "/admin/professionals",
      "/admin/professionals",
    );
    await screen.findByText("Profesional de prueba");
    fireEvent.change(
      screen.getByRole("textbox", { name: /Buscar profesionales/ }),
      { target: { value: "pilot@" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("admin_api", {
        p_action: "professionals",
        p_data: { search: "pilot@", offset: 0 },
      }),
    );
  });
  it("edits grouped capabilities and explicit limits with revision", async () => {
    route(<PlanEditorPage />, "/admin/plans/:planId", "/admin/plans/beta");
    await screen.findByDisplayValue("Nuthrick Beta");
    fireEvent.click(screen.getByRole("checkbox", { name: "Diagnóstico PES" }));
    fireEvent.change(screen.getByLabelText("Precio mensual"), {
      target: { value: "250" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("admin_api", {
        p_action: "save_plan",
        p_data: expect.objectContaining({
          monthly_price: 250,
          updated_at: catalog.plans[0].updated_at,
          values: expect.objectContaining({
            "ai.pes": true,
            "patients.limit": "unlimited",
          }),
        }),
      }),
    );
  });
  it("grants courtesy with bounded dates and no automatic credits", async () => {
    route(
      <ProfessionalPage />,
      "/admin/professionals/:professionalId",
      "/admin/professionals/professional",
    );
    await screen.findByText("Profesional de prueba");
    fireEvent.click(screen.getByRole("button", { name: "Dar cortesía" }));
    fireEvent.click(screen.getByRole("button", { name: "Otorgar cortesía" }));
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("admin_api", {
        p_action: "grant_access",
        p_data: expect.objectContaining({
          professional_id: "professional",
          plan_id: "beta",
          starts_at: expect.any(String),
          ends_at: expect.any(String),
        }),
      }),
    );
    expect(
      mocks.rpc.mock.calls.some((c) => c[1]?.p_action === "adjust_credits"),
    ).toBe(false);
  });
  it("records the target, reason and idempotency key for 300 courtesy credits", async () => {
    route(
      <ProfessionalPage />,
      "/admin/professionals/:professionalId",
      "/admin/professionals/professional",
    );
    await screen.findByText("Profesional de prueba");
    fireEvent.click(screen.getByRole("button", { name: "Ajustar créditos" }));
    fireEvent.change(screen.getByLabelText("Motivo administrativo"), {
      target: { value: "Piloto 300" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Agregar créditos" }));
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("admin_api", {
        p_action: "adjust_credits",
        p_data: expect.objectContaining({
          professional_id: "professional",
          amount: 300,
          reason: "Piloto 300",
          operation_key: expect.any(String),
        }),
      }),
    );
    expect(
      mocks.rpc.mock.calls.every(
        (c) => !["patients", "consultations"].includes(c[0]),
      ),
    ).toBe(true);
  });
  it("creates the 90-day five-use beta code with zero credits", async () => {
    route(<CodesPage />, "/admin/access/codes", "/admin/access/codes");
    await screen.findByText(
      "Crea el primer código para tus profesionales piloto.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Crear código" }));
    fireEvent.change(screen.getByLabelText("Nombre administrativo"), {
      target: { value: "Piloto beta" },
    });
    fireEvent.change(screen.getByLabelText("Código para compartir"), {
      target: { value: "BETA5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar código" }));
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("admin_api", {
        p_action: "save_code",
        p_data: expect.objectContaining({
          code: "BETA5",
          duration_days: 90,
          max_redemptions: 5,
          initial_ai_credits: 0,
          plan_id: "beta",
        }),
      }),
    );
  });
});

describe("initial commercial configuration", () => {
  it("keeps suspended clinical history accessible while denying operational capabilities", async () => {
    mocks.rpc.mockResolvedValue({
      error: null,
      data: {
        is_admin: false,
        access: { ...access, status: "suspended", read_only: true },
      },
    });
    render(
      <MemoryRouter initialEntries={["/app/patients"]}>
        <AccessProvider>
          <Routes>
            <Route element={<ProfessionalAccessGate />}>
              <Route
                path="/app/patients"
                element={<p>Histórico del paciente</p>}
              />
            </Route>
          </Routes>
        </AccessProvider>
      </MemoryRouter>,
    );
    expect(
      await screen.findByText("Histórico del paciente"),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("modo de consulta");
    expect(canUseFeature({ ...access, read_only: true }, "patients")).toBe(
      false,
    );
  });
  it("allows prices and internal visibility to be edited without changing code", async () => {
    route(<PlanEditorPage />, "/admin/plans/:planId", "/admin/plans/beta");
    await screen.findByDisplayValue("Nuthrick Beta");
    fireEvent.change(screen.getByLabelText("Precio mensual"), {
      target: { value: "349" },
    });
    fireEvent.change(screen.getByLabelText("Precio anual"), {
      target: { value: "3490" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: /Solo administración/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("admin_api", {
        p_action: "save_plan",
        p_data: expect.objectContaining({
          monthly_price: 349,
          annual_price: 3490,
          internal_only: false,
        }),
      }),
    );
  });
  it("creates a permanent founder grant with optional agreed price and an audit reason", async () => {
    route(
      <ProfessionalPage />,
      "/admin/professionals/:professionalId",
      "/admin/professionals/professional",
    );
    await screen.findByText("Profesional de prueba");
    fireEvent.click(screen.getByRole("button", { name: "Acceso Founder" }));
    fireEvent.change(screen.getByLabelText("Motivo administrativo"), {
      target: { value: "Early adopter" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Otorgar acceso permanente" }),
    );
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("admin_api", {
        p_action: "grant_founder",
        p_data: expect.objectContaining({
          ends_at: null,
          one_time_price: null,
          reason: "Early adopter",
        }),
      }),
    );
  });
  it("keeps founder code redemption limits while removing a finite access duration", async () => {
    route(<CodesPage />, "/admin/access/codes", "/admin/access/codes");
    await screen.findByText(
      "Crea el primer código para tus profesionales piloto.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Crear código" }));
    fireEvent.change(screen.getByLabelText("Nombre administrativo"), {
      target: { value: "Founder privado" },
    });
    fireEvent.change(screen.getByLabelText("Código para compartir"), {
      target: { value: "FOUNDERS" },
    });
    fireEvent.change(screen.getByLabelText("Tipo de acceso"), {
      target: { value: "founder" },
    });
    expect(
      screen.queryByLabelText("Días de acceso gratuito"),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar código" }));
    await waitFor(() =>
      expect(mocks.rpc).toHaveBeenCalledWith("admin_api", {
        p_action: "save_code",
        p_data: expect.objectContaining({
          access_kind: "founder",
          duration_days: null,
          max_redemptions: 5,
          initial_ai_credits: 0,
        }),
      }),
    );
  });
});
