import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadInterpretationData } from "./interpretations";

const api = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/src/lib/supabase", () => ({ supabase: api }));

function query(data: unknown, error: unknown = null) {
  const chain = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), single: vi.fn(), maybeSingle: vi.fn(), then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve) };
  for (const key of ["select", "eq", "order", "limit", "single", "maybeSingle"] as const) chain[key].mockReturnValue(chain);
  return chain;
}
describe("interpretation data after reopening a consultation", () => {
  beforeEach(() => vi.clearAllMocks());
  it("reads the latest revision and its answer while preserving saved results", async () => {
    const snapshot = query({ revision: 3 });
    const answers = query({ value: "Embarazo" });
    const saved = [{ id: "historical", interpretation_snapshot: { state: "classified" } }];
    const tables = { interpretation_references: query([{ definition: { id: "reference" } }]), consultation_calculation_results: query(saved), consultations: query({ interpretation_pregnancy: false }), consultation_snapshots: snapshot, consultation_answers: answers };
    api.from.mockImplementation((name: keyof typeof tables) => tables[name]);
    const result = await loadInterpretationData("consultation");
    expect(snapshot.eq).toHaveBeenCalledWith("consultation_id", "consultation");
    expect(snapshot.order).toHaveBeenCalledWith("revision", { ascending: false });
    expect(snapshot.limit).toHaveBeenCalledWith(1);
    expect(answers.eq).toHaveBeenCalledWith("revision", 3);
    expect(result).toMatchObject({ saved, pregnant: true, pregnancyFromInterview: true });
  });
  it("supports a consultation with no interview and retains the recorded context", async () => {
    api.from.mockImplementation((name: string) => query(name === "consultations" ? { interpretation_pregnancy: false } : name === "consultation_snapshots" ? null : []));
    expect(await loadInterpretationData("consultation")).toMatchObject({ pregnant: false, pregnancyFromInterview: null, saved: [] });
    expect(api.from).not.toHaveBeenCalledWith("consultation_answers");
  });
  it("does not conceal a real read failure", async () => {
    api.from.mockReturnValue(query(null, { message: "network" }));
    await expect(loadInterpretationData("consultation")).rejects.toThrow("No pudimos cargar las referencias");
  });
});
