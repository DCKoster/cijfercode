/// <reference lib="webworker" />
import { generatePuzzle } from "./generator/generator";
import type { GenerationDiagnostics, LexiconData, WorkerRequest, WorkerResponse } from "./types";

let lexiconPromise: Promise<LexiconData> | undefined;
const active = new Map<string, AbortController>();
const loadLexicon = () => lexiconPromise ??= fetch("/lexicon.json").then((response) => {
  if (!response.ok) throw new Error("De Nederlandse woordenlijst kon niet worden geladen.");
  return response.json() as Promise<LexiconData>;
}).catch((error) => {
  lexiconPromise = undefined;
  throw error;
});
const send = (message: WorkerResponse) => self.postMessage(message);

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  const { requestId } = message;
  if (message.type === "cancel") { active.get(requestId)?.abort(); return; }
  const controller = new AbortController();
  active.set(requestId, controller);
  let diagnostics: GenerationDiagnostics | undefined;
  try {
    const lexicon = await loadLexicon();
    const puzzle = await generatePuzzle(
      message.difficulty,
      message.seed,
      lexicon,
      (attempt, maximum) => send({ type: "progress", requestId, attempt, maximum }),
      () => controller.signal.aborted,
      message.options,
      message.previousPuzzles,
      (result) => { diagnostics = result; },
    );
    if (controller.signal.aborted) send({ type: "cancelled", requestId, diagnostics });
    else send({ type: "result", requestId, puzzle, diagnostics: diagnostics! });
  } catch (error) {
    if (controller.signal.aborted) send({ type: "cancelled", requestId, diagnostics });
    else send({ type: "error", requestId, diagnostics, message: error instanceof Error ? error.message : "Onbekende fout" });
  } finally {
    active.delete(requestId);
  }
};
