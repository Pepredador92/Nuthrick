export type AnswerValues = Record<string, unknown>;
export type AnswerState = {
  version: number;
  answers: AnswerValues;
  conflict?: boolean;
};
export type AnswerWrite = {
  version: number;
  changes: AnswerValues;
  requestId: string;
};
export const ANSWER_SAVE_TIMEOUT = 20000;
export const ANSWER_SAVE_DELAY = 2000;

// Compare JSON values independently of PostgreSQL JSONB object-key ordering.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${
      Object.keys(value).filter((k) => (value as AnswerValues)[k] !== undefined)
        .sort().map((k) =>
          `${JSON.stringify(k)}:${canonical((value as AnswerValues)[k])}`
        ).join(",")
    }}`;
  }
  return JSON.stringify(value) ?? "null";
}
export function changedAnswers(
  base: AnswerValues,
  next: AnswerValues,
): AnswerValues {
  return Object.fromEntries(
    Object.entries(next).filter(([key, value]) =>
      canonical(base[key]) !== canonical(value) || !Object.hasOwn(base, key)
    ).map(([key, value]) => [key, value === undefined ? null : value]),
  );
}
export class AnswerSaveError extends Error {
  constructor(
    public code: "timeout" | "conflict" | "unavailable",
    message: string,
  ) {
    super(message);
  }
}
export async function boundedAnswerRequest<T>(
  operation: (signal: AbortSignal) => PromiseLike<T>,
  signal?: AbortSignal,
  timeout = ANSWER_SAVE_TIMEOUT,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new AnswerSaveError(
              "timeout",
              "El guardado tardó demasiado. Tus cambios siguen en esta pestaña. Reintenta para comprobar qué se guardó y sincronizar lo pendiente.",
            ),
          );
          controller.abort();
        }, timeout);
        controller.signal.addEventListener(
          "abort",
          () =>
            reject(
              new AnswerSaveError(
                "unavailable",
                "El guardado se interrumpió. Tus cambios siguen pendientes.",
              ),
            ),
          { once: true },
        );
      }),
    ]);
  } finally {
    clearTimeout(timer!);
    signal?.removeEventListener("abort", abort);
  }
}

/** One writer and the latest intent. Timed-out writes are fenced by server
 * versions; late resolutions never acknowledge or replace a newer local edit.
 */
type AutosaveOptions = {
  read: (signal: AbortSignal) => Promise<AnswerState>;
  write: (request: AnswerWrite, signal: AbortSignal) => Promise<AnswerState>;
  onState: (
    state: { saving: boolean; error: string; conflict: boolean },
  ) => void;
  onMerge: (values: AnswerValues, saved: AnswerState) => void;
};
export function createAnswerAutosave(options: AutosaveOptions = {
  read: async () => {
    throw new Error("Guardado no inicializado.");
  },
  write: async () => {
    throw new Error("Guardado no inicializado.");
  },
  onState: () => {},
  onMerge: () => {},
}) {
  let base: AnswerState = { version: 0, answers: {} };
  let desired: AnswerValues = {};
  let running: Promise<boolean> | null = null;
  let uncertain = false, stopped = false;
  let conflictState: AnswerState | null = null;
  let attempted: AnswerValues | null = null;
  const merge = (fresh: AnswerState, previous: AnswerValues) => {
    desired = { ...fresh.answers, ...changedAnswers(previous, desired) };
    base = structuredClone(fresh);
    options.onMerge(structuredClone(desired), base);
  };
  const reconcile = (fresh: AnswerState) => {
    const local = changedAnswers(base.answers, desired);
    const conflicting = Object.keys(local).some((key) =>
      canonical(fresh.answers[key]) !== canonical(base.answers[key]) &&
      canonical(fresh.answers[key]) !== canonical(local[key]) &&
      (!attempted || !Object.hasOwn(attempted, key) ||
        canonical(fresh.answers[key]) !== canonical(attempted[key]))
    );
    if (conflicting) {
      conflictState = fresh;
      throw new AnswerSaveError(
        "conflict",
        "La consulta cambió en otra pestaña. Revisa qué versión conservar antes de sincronizar; tus cambios locales siguen aquí.",
      );
    }
    merge(fresh, base.answers);
  };
  const drain = async (): Promise<boolean> => {
    options.onState({ saving: true, error: "", conflict: false });
    try {
      if (uncertain) reconcile(await boundedAnswerRequest(options.read));
      if (conflictState) {
        throw new AnswerSaveError(
          "conflict",
          "Hay cambios de otra pestaña pendientes de revisar.",
        );
      }
      // At most a current write and one newest snapshot, regardless of typing.
      let conflicts = 0;
      while (!stopped) {
        const captured = structuredClone(desired);
        const changes = changedAnswers(base.answers, captured);
        if (!Object.keys(changes).length && !uncertain) break;
        attempted = changes;
        const request = {
          version: base.version,
          changes,
          requestId: crypto.randomUUID(),
        };
        const fresh = await boundedAnswerRequest((signal) =>
          options.write(request, signal)
        );
        if (stopped) return false;
        if (fresh.conflict) {
          reconcile(fresh);
          if (++conflicts > 2) {
            throw new AnswerSaveError(
              "unavailable",
              "Otra sesión está modificando la consulta. Tus cambios siguen pendientes; reintenta cuando termine.",
            );
          }
          continue;
        }
        merge(fresh, captured);
        uncertain = false;
        attempted = null;
      }
      options.onState({ saving: false, error: "", conflict: false });
      return !stopped;
    } catch (error) {
      uncertain = true;
      options.onState({
        saving: false,
        error: error instanceof Error
          ? error.message
          : "No pudimos guardar. Tus cambios siguen pendientes.",
        conflict: !!conflictState,
      });
      return false;
    }
  };
  return {
    configure(next: AutosaveOptions) {
      options = next;
    },
    reset(
      saved: AnswerState,
      values: AnswerValues,
      cachedBase?: AnswerState,
      unverifiedDraft = false,
    ) {
      base = structuredClone(cachedBase ?? saved);
      desired = structuredClone(values);
      uncertain = !!cachedBase;
      stopped = false;
      conflictState = null;
      attempted = null;
      options.onState({ saving: false, error: "", conflict: false });
      if (
        unverifiedDraft &&
        Object.keys(changedAnswers(saved.answers, values)).length
      ) {
        conflictState = structuredClone(saved);
        uncertain = true;
        options.onState({
          saving: false,
          error:
            "Recuperamos un borrador de la versión anterior. Compara tus respuestas con el servidor y elige qué conservar antes de sincronizar.",
          conflict: true,
        });
      }
    },
    update(values: AnswerValues) {
      desired = structuredClone(values);
    },
    flush(): Promise<boolean> {
      if (stopped) return Promise.resolve(false);
      if (!running) {
        running = drain().finally(() => {
          running = null;
        });
      }
      return running;
    },
    saved: () => structuredClone(base),
    differences: () =>
      conflictState
        ? Object.entries(changedAnswers(base.answers, desired)).filter((
          [key, value],
        ) => canonical(value) !== canonical(conflictState!.answers[key])).map((
          [key, value],
        ) => ({ key, local: value, remote: conflictState!.answers[key] }))
        : [],
    async stop() {
      stopped = true;
      if (running) await running;
    },
    resume() {
      stopped = false;
      uncertain = true;
    },
    resolveConflict(keepLocal: boolean) {
      if (!conflictState) return;
      const fresh = conflictState;
      if (keepLocal) merge(fresh, base.answers);
      else {
        desired = structuredClone(fresh.answers);
        base = structuredClone(fresh);
        options.onMerge(desired, base);
      }
      conflictState = null;
      uncertain = true;
      attempted = null;
    },
  };
}
