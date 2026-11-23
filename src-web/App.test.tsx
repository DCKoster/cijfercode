import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import App from "./App";
import { requestPuzzle } from "./generator/client";
import { puzzleSignature, type PuzzleDocument } from "./types";

vi.mock("./generator/client", () => ({ requestPuzzle: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  localStorage.clear();
});

const puzzle: PuzzleDocument = {
  schemaVersion: 4, generatorVersion: "web-6", lexiconVersion: "test", puzzleId: "play-next", seed: "test",
  difficulty: 2, theme: "general", requireEveryLetter: false, includeProperNames: false, width: 17, height: 20,
  grid: [[1]], givens: {},
  measured: { solutions: 1, propagationSteps: 0, searchNodes: 0, maxDepth: 0, exhausted: false },
  solution: { grid: [["A"]], codeToLetter: { 1: "A" }, entries: [] },
};

it("cancels a play request and allows another puzzle", async () => {
  vi.mocked(requestPuzzle)
    .mockImplementationOnce((_, options) => new Promise((_, reject) => {
      options?.signal?.addEventListener("abort", () => reject(new DOMException("Geannuleerd", "AbortError")));
    }))
    .mockResolvedValueOnce(puzzle);

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Nieuwe puzzel" }));
  fireEvent.click(screen.getByRole("button", { name: "Annuleren" }));
  expect(await screen.findByText("Genereren geannuleerd.")).toBeInTheDocument();
  expect(vi.mocked(requestPuzzle).mock.calls[0][1]?.signal?.aborted).toBe(true);

  fireEvent.click(screen.getByRole("button", { name: "Nieuwe puzzel" }));
  await waitFor(() => expect(localStorage.getItem("cijfercode:v4:player")).toContain("play-next"));
  expect(vi.mocked(requestPuzzle).mock.calls[1][1]?.signal?.aborted).toBe(false);
});


it("supplies the latest eight saved play signatures", async () => {
  const previous = Array.from({ length: 10 }, (_, index) => ({ layout: String(index), answers: [] }));
  localStorage.setItem("cijfercode:v4:player", JSON.stringify({
    puzzle, state: { puzzleId: puzzle.puzzleId, mapping: {} }, recentPuzzles: previous,
  }));
  const next = { ...puzzle, puzzleId: "next-after-history" };
  vi.mocked(requestPuzzle).mockResolvedValue(next);

  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "Nieuwe puzzel" }));
  await waitFor(() => expect(localStorage.getItem("cijfercode:v4:player")).toContain("next-after-history"));
  expect(vi.mocked(requestPuzzle).mock.calls[0][1]?.previousPuzzles).toEqual(previous.slice(-8));
  expect(JSON.parse(localStorage.getItem("cijfercode:v4:player")!).recentPuzzles).toEqual([...previous.slice(-7), puzzleSignature(next)]);
});
