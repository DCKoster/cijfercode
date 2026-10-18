/// <reference lib="webworker" />
import { generatePuzzle } from "./generator/generator";
import type { LexiconData, WorkerRequest, WorkerResponse } from "./types";

let lexiconPromise: Promise<LexiconData> | undefined;
const cancelled = new Set<string>();
const loadLexicon = () => lexiconPromise ??= fetch("/lexicon.json").then((response) => {
  if (!response.ok) throw new Error("De Nederlandse woordenlijst kon niet worden geladen.");
  return response.json() as Promise<LexiconData>;
});
const send = (message: WorkerResponse) => self.postMessage(message);

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === "cancel") { cancelled.add(message.requestId); return; }
  try {
    const lexicon = await loadLexicon();
    const puzzle = await generatePuzzle(
      message.difficulty,
      message.seed,
      lexicon,
      (attempt, maximum) => send({ type: "progress", requestId: message.requestId, attempt, maximum }),
      () => cancelled.has(message.requestId),
    );
    if (cancelled.delete(message.requestId)) send({ type: "cancelled", requestId: message.requestId });
    else send({ type: "result", requestId: message.requestId, puzzle });
  } catch (error) {
    if (cancelled.delete(message.requestId)) send({ type: "cancelled", requestId: message.requestId });
    else send({ type: "error", requestId: message.requestId, message: error instanceof Error ? error.message : "Onbekende fout" });
  }
};
