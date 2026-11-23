import type { Difficulty, GenerationOptions, PuzzleDocument, PuzzleSignature, WorkerRequest, WorkerResponse } from "../types";

let worker: Worker | undefined;
const pending = new Map<string, {
  resolve: (puzzle: PuzzleDocument) => void;
  reject: (error: Error) => void;
  dispose: () => void;
  progress?: (attempt: number, maximum: number) => void;
}>();

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("../generator.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    const task = pending.get(message.requestId);
    if (!task) return;
    if (message.type === "progress") {
      task.progress?.(message.attempt, message.maximum);
      return;
    }
    pending.delete(message.requestId);
    task.dispose();
    if (message.type === "result") task.resolve(message.puzzle);
    if (message.type === "error") task.reject(new Error(message.message));
    if (message.type === "cancelled") task.reject(new DOMException("Geannuleerd", "AbortError"));
  };
  return worker;
}

export function requestPuzzle(
  difficulty: Difficulty,
  options: Partial<GenerationOptions> & { seed?: string; signal?: AbortSignal; previousPuzzles?: readonly PuzzleSignature[]; onProgress?: (attempt: number, maximum: number) => void } = {},
): Promise<PuzzleDocument> {
  const { signal } = options;
  if (signal?.aborted) return Promise.reject(new DOMException("Geannuleerd", "AbortError"));
  const requestId = crypto.randomUUID();
  const seed = options.seed ?? crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const worker = getWorker();
    const abort = () => {
      const message: WorkerRequest = { type: "cancel", requestId };
      worker.postMessage(message);
    };
    pending.set(requestId, {
      resolve: (puzzle) => signal?.aborted ? reject(new DOMException("Geannuleerd", "AbortError")) : resolve(puzzle),
      reject,
      progress: options.onProgress,
      dispose: () => signal?.removeEventListener("abort", abort),
    });
    signal?.addEventListener("abort", abort, { once: true });
    const message: WorkerRequest = {
      type: "generate", requestId, difficulty, seed, previousPuzzles: options.previousPuzzles,
      options: {
        theme: options.theme ?? "general",
        requireEveryLetter: options.requireEveryLetter ?? false,
        includeProperNames: options.includeProperNames ?? false,
        generationMode: options.generationMode ?? "interactive",
      },
    };
    worker.postMessage(message);
  });
}
