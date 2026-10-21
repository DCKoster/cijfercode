import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PuzzleDocument } from "../types";
import { Player } from "./Player";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const emptyGrid = () => Array.from({ length: 20 }, () => Array.from<number | null>({ length: 17 }).fill(null));
const emptySolution = () => Array.from({ length: 20 }, () => Array.from<string | null>({ length: 17 }).fill(null));

function puzzle(): PuzzleDocument {
  const grid = emptyGrid();
  grid[0][0] = 1;
  grid[0][1] = 2;
  return {
    schemaVersion: 4, generatorVersion: "web-3", lexiconVersion: "test", puzzleId: "test", seed: "test", difficulty: 2,
    theme: "general", requireEveryLetter: false, includeProperNames: false,
    width: 17, height: 20, grid, givens: {},
    measured: { solutions: 1, propagationSteps: 0, searchNodes: 0, maxDepth: 0, exhausted: false },
    solution: { grid: emptySolution(), codeToLetter: { 1: "A", 2: "C" }, entries: [] },
  };
}

describe("Player", () => {
  it("clears only the selected code and keeps other error feedback", () => {
    const { container } = render(<Player puzzle={puzzle()} saved={{ puzzleId: "test", mapping: { 1: "B", 2: "D" } }} onSave={vi.fn()} onPrint={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Controleren" }));
    expect(container.querySelectorAll(".incorrect")).toHaveLength(2);

    fireEvent.click(screen.getByRole("gridcell", { name: "Code 1, letter B" }));
    fireEvent.keyDown(window, { key: "Backspace" });

    expect(screen.getByRole("gridcell", { name: "Code 1" })).not.toHaveClass("incorrect");
    expect(screen.getByRole("gridcell", { name: "Code 2, letter D" })).toHaveClass("incorrect");
  });

  it("clears player input while preserving given letters", () => {
    const themed = puzzle();
    themed.givens = { 1: "A" };
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Player puzzle={themed} saved={{ puzzleId: "test", mapping: { 1: "A", 2: "D" } }} onSave={vi.fn()} onPrint={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Alles wissen" }));

    expect(screen.getByRole("gridcell", { name: "Code 1, letter A" })).toBeInTheDocument();
    expect(screen.getByRole("gridcell", { name: "Code 2" })).toBeInTheDocument();
  });
});
