import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ANSWER_SAVE_TIMEOUT,
  type AnswerState,
  boundedAnswerRequest,
  changedAnswers,
  createAnswerAutosave,
} from "./answerAutosave";
const deferred = <T>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
function subject() {
  const saved: AnswerState = {
    version: 0,
    answers: { note: "Inicial", other: "Remoto" },
  };
  const read = vi.fn().mockResolvedValue(saved),
    write = vi.fn(),
    onState = vi.fn(),
    onMerge = vi.fn();
  const saver = createAnswerAutosave({ read, write, onState, onMerge });
  saver.reset(saved, saved.answers);
  return { saver, read, write, onState, onMerge, saved };
}
afterEach(() => vi.useRealTimers());
describe("bounded answer synchronization", () => {
  it("requires review before restoring an unversioned draft from an old tab", async () => {
    const x = subject();
    x.saver.reset(
      x.saved,
      { ...x.saved.answers, note: "Borrador anterior" },
      undefined,
      true,
    );
    expect(x.onState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        conflict: true,
        error: expect.stringContaining("versión anterior"),
      }),
    );
    expect(await x.saver.flush()).toBe(false);
    expect(x.write).not.toHaveBeenCalled();
    x.saver.resolveConflict(true);
    x.write.mockResolvedValue({
      version: 1,
      answers: { ...x.saved.answers, note: "Borrador anterior" },
    });
    expect(await x.saver.flush()).toBe(true);
  });
  it("sends only changed fields and compares JSONB object values independently of key order", () => {
    expect(
      changedAnswers({ a: { x: 1, y: 2 }, b: "viejo" }, {
        a: { y: 2, x: 1 },
        b: "",
        c: null,
      }),
    ).toEqual({ b: "", c: null });
    expect(changedAnswers({ note: "Anterior" }, { note: undefined })).toEqual({
      note: null,
    });
    expect(
      changedAnswers({ row: { value: "Igual" } }, {
        row: { value: "Igual", empty: undefined },
      }),
    ).toEqual({});
  });
  it("bounds an auth or network promise that never settles and aborts it", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const pending = boundedAnswerRequest((s) => {
      signal = s;
      return new Promise(() => {});
    });
    const result = expect(pending).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(ANSWER_SAVE_TIMEOUT);
    await result;
    expect(signal?.aborted).toBe(true);
  });
  it("coalesces many edits behind one request into the latest pending snapshot", async () => {
    const x = subject(), first = deferred<AnswerState>();
    x.write.mockReturnValueOnce(first.promise).mockImplementation(
      async (r) => ({
        version: 2,
        answers: { ...x.saved.answers, ...r.changes },
      }),
    );
    x.saver.update({ ...x.saved.answers, note: "Primero" });
    const flush = x.saver.flush();
    await vi.waitFor(() => expect(x.write).toHaveBeenCalledTimes(1));
    for (let i = 0; i < 30; i++) {
      x.saver.update({ ...x.saved.answers, note: "Cambio " + i });
      expect(x.saver.flush()).toBe(flush);
    }
    first.resolve({
      version: 1,
      answers: { ...x.saved.answers, note: "Primero" },
    });
    expect(await flush).toBe(true);
    expect(x.write).toHaveBeenCalledTimes(2);
    expect(x.write.mock.calls[1][0].changes).toEqual({ note: "Cambio 29" });
    expect(x.onMerge.mock.calls.at(-1)?.[0].note).toBe("Cambio 29");
  });
  it("reconciles an uncertain write before retrying and fences it even when no delta remains", async () => {
    vi.useFakeTimers();
    const x = subject(), late = deferred<AnswerState>();
    x.write.mockReturnValueOnce(late.promise);
    x.saver.update({ ...x.saved.answers, note: "Nuevo" });
    const flush = x.saver.flush();
    await vi.advanceTimersByTimeAsync(ANSWER_SAVE_TIMEOUT);
    expect(await flush).toBe(false);
    const confirmed = {
      version: 1,
      answers: { ...x.saved.answers, note: "Nuevo" },
    };
    x.read.mockResolvedValue(confirmed);
    x.write.mockResolvedValue({ ...confirmed, version: 2 });
    expect(await x.saver.flush()).toBe(true);
    expect(x.read).toHaveBeenCalledOnce();
    expect(x.write.mock.calls[1][0].changes).toEqual({});
    const merged = x.onMerge.mock.calls.length;
    late.resolve({ version: 1, answers: { note: "Respuesta antigua" } });
    await Promise.resolve();
    expect(x.onMerge).toHaveBeenCalledTimes(merged);
  });
  it("merges independent remote changes without overwriting local edits", async () => {
    const x = subject();
    x.saver.update({ ...x.saved.answers, note: "Local" });
    x.write.mockResolvedValueOnce({
      version: 1,
      answers: { ...x.saved.answers, other: "Otra pestaña" },
      conflict: true,
    }).mockResolvedValueOnce({
      version: 2,
      answers: { note: "Local", other: "Otra pestaña" },
    });
    expect(await x.saver.flush()).toBe(true);
    expect(x.write.mock.calls[1][0]).toMatchObject({
      version: 1,
      changes: { note: "Local" },
    });
    expect(x.onMerge.mock.calls.at(-1)?.[0]).toEqual({
      note: "Local",
      other: "Otra pestaña",
    });
  });
  it("requires explicit resolution of conflicting edits from another tab", async () => {
    const x = subject();
    x.saver.update({ ...x.saved.answers, note: "Local" });
    const remote = {
      version: 1,
      answers: { ...x.saved.answers, note: "Otra pestaña" },
    };
    x.write.mockResolvedValue({ ...remote, conflict: true });
    expect(await x.saver.flush()).toBe(false);
    expect(x.onState).toHaveBeenLastCalledWith(
      expect.objectContaining({ saving: false, conflict: true }),
    );
    expect(x.write).toHaveBeenCalledOnce();
    x.saver.resolveConflict(true);
    x.read.mockResolvedValue(remote);
    x.write.mockResolvedValue({
      version: 2,
      answers: { ...remote.answers, note: "Local" },
    });
    expect(await x.saver.flush()).toBe(true);
    expect(x.write.mock.calls[1][0]).toMatchObject({
      version: 1,
      changes: { note: "Local" },
    });
  });
  it("preserves the conflict base when a local draft is restored", async () => {
    const x = subject(),
      remote = {
        version: 1,
        answers: { ...x.saved.answers, note: "Servidor" },
      };
    x.saver.reset(
      remote,
      { ...x.saved.answers, note: "Borrador recuperado" },
      x.saved,
    );
    x.read.mockResolvedValue(remote);
    expect(await x.saver.flush()).toBe(false);
    expect(x.write).not.toHaveBeenCalled();
  });
  it("can choose the server version without resubmitting discarded local values", async () => {
    const x = subject(),
      remote = {
        version: 1,
        answers: { ...x.saved.answers, note: "Servidor" },
      };
    x.saver.update({ ...x.saved.answers, note: "Local" });
    x.write.mockResolvedValue({ ...remote, conflict: true });
    await x.saver.flush();
    x.saver.resolveConflict(false);
    x.read.mockResolvedValue(remote);
    x.write.mockResolvedValue({ ...remote, version: 2 });
    expect(await x.saver.flush()).toBe(true);
    expect(x.write.mock.calls[1][0].changes).toEqual({});
    expect(x.onMerge.mock.calls.at(-1)?.[0].note).toBe("Servidor");
  });
});
