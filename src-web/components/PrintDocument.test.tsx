import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PuzzleDocument } from "../types";
import { PrintDocument } from "./PrintDocument";
import { PrintablePuzzleGrid } from "./PrintablePuzzleGrid";

const puzzle: PuzzleDocument = {
  schemaVersion: 4, generatorVersion: "web-3", lexiconVersion: "test", puzzleId: "abc", seed: "seed", difficulty: 2,
  theme: "general", requireEveryLetter: false, includeProperNames: false,
  width: 17, height: 20,
  grid: Array.from({ length: 20 }, () => Array.from({ length: 17 }, () => null)),
  givens: {}, measured: { solutions: 1, propagationSteps: 1, searchNodes: 0, maxDepth: 0, exhausted: false },
  solution: { grid: Array.from({ length: 20 }, () => Array.from({ length: 17 }, () => null)), codeToLetter: {}, entries: [] },
};

describe("PrintDocument", () => {
  it("puts booklet solutions after every puzzle", () => {
    render(<PrintDocument job={{ title: "Familieboek", cover: true, puzzles: [puzzle, { ...puzzle, puzzleId: "def", difficulty: 4 }] }} />);
    const pages = document.querySelectorAll(".print-page");
    expect(pages).toHaveLength(4);
    expect(pages[0]).toHaveClass("cover");
    expect(pages[1]).toHaveClass("puzzle-sheet");
    expect(pages[2]).toHaveClass("puzzle-sheet");
    expect(pages[3]).toHaveClass("answers");
    expect(screen.getByText("Familieboek")).toBeInTheDocument();
  });

  it("draws every cell with explicit SVG geometry", () => {
    const grid = puzzle.grid.map((row) => [...row]);
    grid[0][0] = 1;
    const printable = { ...puzzle, grid, givens: { 1: "A" }, solution: { ...puzzle.solution, codeToLetter: { 1: "A" } } };
    const { container } = render(<PrintablePuzzleGrid puzzle={printable} />);
    expect(container.querySelectorAll("svg rect")).toHaveLength(340);
    expect(container.querySelectorAll('[data-cell="block"]')).toHaveLength(339);
    expect(container.querySelectorAll('[data-cell="open"]')).toHaveLength(1);
    expect(container.querySelector(".print-block")).toHaveAttribute("fill", "#000");
    expect(screen.getByText("A")).toBeInTheDocument();
  });
});
