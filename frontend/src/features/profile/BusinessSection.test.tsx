import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { BusinessSection } from "./ProfileSections";

const mocks = vi.hoisted(() => ({ save: vi.fn(), location: vi.fn() }));
vi.mock("@/src/services/profile", () => ({
  saveBusiness: mocks.save,
  addLocation: mocks.location,
}));
vi.mock("@/src/services/media", () => ({
  getSignedMediaUrl: async () => null,
}));

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  mocks.save.mockResolvedValue({});
});

it("saves business changes independently of an empty or invalid location draft", async () => {
  render(
    <BusinessSection
      workspace={
        {
          profile: { id: "owner" },
          business: {
            establishment_name: "Consultorio",
            address: "Dirección existente",
          },
          locations: [],
        } as never
      }
      onSaved={async () => undefined}
    />,
  );
  fireEvent.change(screen.getByLabelText("Nombre del establecimiento"), {
    target: { value: "Consultorio actualizado" },
  });
  fireEvent.change(screen.getByLabelText("Enlace de mapa (opcional)"), {
    target: { value: "enlace incompleto" },
  });
  const save = screen.getByRole("button", { name: "Guardar cambios" });
  const businessForm = save.closest("form")!;
  const address = screen.getByLabelText("Dirección") as HTMLInputElement;
  expect(address.form).not.toBe(businessForm);
  expect(address.form!.checkValidity()).toBe(false);
  expect(businessForm.checkValidity()).toBe(true);
  fireEvent.click(save);
  await waitFor(() =>
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        establishment_name: "Consultorio actualizado",
        address: "Dirección existente",
      }),
    ),
  );
  expect(mocks.location).not.toHaveBeenCalled();
});
