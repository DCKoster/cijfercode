// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import lexicon from "../public/lexicon.json";
import type { WorkerRequest, WorkerResponse } from "./types";

afterEach(() => vi.unstubAllGlobals());

it("handles cancellation during procedural search and completes the next request", async () => {
  const worker = { postMessage: vi.fn<(message: WorkerResponse) => void>(), onmessage: null as
    ((event: { data: WorkerRequest }) => Promise<void>) | null };
  vi.stubGlobal("self", worker);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => lexicon })));
  await import("./generator.worker");

  const generate = {
    type: "generate", requestId: "first", difficulty: 2, seed: "worker-cancellation",
    options: { theme: "general", requireEveryLetter: false, includeProperNames: false, generationMode: "interactive" },
  } as const;
  worker.postMessage.mockImplementation((message) => {
    if (message.type === "progress" && message.requestId === "first") {
      setTimeout(() => { void worker.onmessage?.({ data: { type: "cancel", requestId: "first" } }); }, 0);
    }
  });
  await worker.onmessage?.({ data: generate });
  expect(worker.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
    type: "cancelled", requestId: "first", diagnostics: expect.objectContaining({ fallbackEntered: false }),
  }));

  await worker.onmessage?.({ data: { ...generate, requestId: "second" } });
  expect(worker.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({
    type: "result", requestId: "second", diagnostics: expect.objectContaining({ source: "procedural", fallbackEntered: false }),
  }));
}, 60_000);
