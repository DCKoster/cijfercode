import type { Difficulty, GenerationOptions, PuzzleDocument, WorkerRequest, WorkerResponse } from "../types";

let worker: Worker | undefined;
const pending = new Map<string, {
  resolve: (puzzle: PuzzleDocument) => void;
  reject: (error: Error) => void;
  progress?: (attempt: number, maximum: number) => void;
}>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("../generator.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    const task = pending.get(message.requestId);
    if (!task) return;
    if (message.type === "progress") task.progress?.(message.attempt, message.maximum);
    if (message.type === "result") { pending.delete(message.requestId); task.resolve(message.puzzle); }
    if (message.type === "error") { pending.delete(message.requestId); task.reject(new Error(message.message)); }
    if (message.type === "cancelled") { pending.delete(message.requestId); task.reject(new DOMException("Geannuleerd", "AbortError")); }
  };
  return worker;
}

export function requestPuzzle(
  difficulty: Difficulty,
  options: Partial<GenerationOptions> & { seed?: string; signal?: AbortSignal; onProgress?: (attempt: number, maximum: number) => void } = {},
): Promise<PuzzleDocument> {
  const requestId = crypto.randomUUID();
  const seed = options.seed ?? crypto.randomUUID();
  return new Promise((resolve, reject) => {
    pending.set(requestId, { resolve, reject, progress: options.onProgress });
    options.signal?.addEventListener("abort", () => {
      const message: WorkerRequest = { type: "cancel", requestId };
      getWorker().postMessage(message);
    }, { once: true });
    const message: WorkerRequest = {
      type: "generate", requestId, difficulty, seed,
      options: {
        theme: options.theme ?? "general",
        requireEveryLetter: options.requireEveryLetter ?? false,
        includeProperNames: options.includeProperNames ?? false,
      },
    };
    getWorker().postMessage(message);
  });
}
