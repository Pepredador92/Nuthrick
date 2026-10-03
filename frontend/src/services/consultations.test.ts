import { beforeEach, describe, expect, it, vi } from "vitest";
import { renameConsultation } from "./consultations";
import { supabase } from "@/src/lib/supabase";
import type { Consultation } from "@/src/types/domain";

vi.mock("@/src/lib/supabase", () => ({ supabase: { rpc: vi.fn() } }));
const visit = { id: "visit", display_name: "Anterior", display_sequence_number: 2, status: "completed" } as Consultation;
const single = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(supabase.rpc).mockReturnValue({ single } as never);
  single.mockResolvedValue({ data: { id: "visit", display_name: null, status: "completed" }, error: null });
});
describe("consultation names", () => {
  it("clears a custom name through the metadata RPC without reopening or changing clinical status", async () => {
    const result = await renameConsultation(visit, "   ");
    expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith("rename_consultation", {
      target_consultation: "visit", requested_name: null, expected_name: "Anterior",
    });
    expect(result).toMatchObject({ status: "completed", display_name: null, display_sequence_number: 2 });
  });
  it("rejects oversized names before sending a request", async () => {
    await expect(renameConsultation(visit, "x".repeat(121))).rejects.toThrow("120");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
  it("explains concurrent edits without silently overwriting them", async () => {
    single.mockResolvedValue({ data: null, error: { message: "consultation_name_conflict", code: "40001" } });
    await expect(renameConsultation(visit, "Control mensual")).rejects.toThrow("El nombre cambió en otra ventana");
  });
});
