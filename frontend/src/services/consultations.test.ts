import { beforeEach, describe, expect, it, vi } from "vitest";
import { discardConsultationDraft, renameConsultation, syncConsultationAnswers } from "./consultations";
import { supabase } from "@/src/lib/supabase";
import type { Consultation } from "@/src/types/domain";

vi.mock("@/src/lib/supabase", () => ({ supabase: { rpc: vi.fn() } }));
const visit = { id: "visit", display_name: "Anterior", display_sequence_number: 2, status: "completed" } as Consultation;
const single = vi.fn();
const abortSignal=vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(supabase.rpc).mockReturnValue({ single } as never);
  single.mockResolvedValue({ data: { id: "visit", display_name: null, status: "completed" }, error: null });
});

describe('versioned consultation answer transport',()=>{
  it('passes only a delta, expected version, request identifier and cancellation signal',async()=>{
    const signal=new AbortController().signal;
    vi.mocked(supabase.rpc).mockReturnValue({abortSignal} as never);
    abortSignal.mockResolvedValue({data:{version:4,answers:{note:'Nuevo'}},error:null});
    expect(await syncConsultationAnswers('visit',2,{version:3,changes:{note:'Nuevo'},requestId:'request'},signal)).toEqual({version:4,answers:{note:'Nuevo'}});
    expect(supabase.rpc).toHaveBeenCalledWith('sync_consultation_answers',{p_consultation:'visit',p_revision:2,p_version:3,p_changes:{note:'Nuevo'},p_request:'request'});
    expect(abortSignal).toHaveBeenCalledWith(signal);
  });
  it('reads without creating a save request',async()=>{
    vi.mocked(supabase.rpc).mockReturnValue({abortSignal} as never);abortSignal.mockResolvedValue({data:{version:0,answers:{}},error:null});
    await syncConsultationAnswers('visit',1,undefined,new AbortController().signal);
    expect(supabase.rpc).toHaveBeenCalledWith('sync_consultation_answers',{p_consultation:'visit',p_revision:1});
  });
  it('does not confirm a malformed or missing acknowledgement',async()=>{
    vi.mocked(supabase.rpc).mockReturnValue({abortSignal} as never);abortSignal.mockResolvedValue({data:null,error:null});
    await expect(syncConsultationAnswers('visit',1,undefined,new AbortController().signal)).rejects.toThrow('confirmar');
  });
});

describe("discarding consultation drafts", () => {
  it("uses the draft-only deletion RPC", async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: null } as never);
    await discardConsultationDraft("draft");
    expect(supabase.rpc).toHaveBeenCalledExactlyOnceWith("discard_consultation_draft", { p_consultation: "draft" });
  });
  it.each([
    ["consultation_history_protected", "historial está protegido"],
    ["consultation_plan_linked", "registro vinculado"],
  ])("explains %s without trying to archive clinical history", async (message, expected) => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: null, error: { code: "23514", message } } as never);
    await expect(discardConsultationDraft("draft")).rejects.toThrow(expected);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });
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
