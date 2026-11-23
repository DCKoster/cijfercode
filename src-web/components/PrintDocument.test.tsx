import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PuzzleDocument } from "../types";
import { PrintDocument } from "./PrintDocument";
import { PrintablePuzzleGrid } from "./PrintablePuzzleGrid";

afterEach(cleanup);

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
    render(<PrintDocument job={{ title: "Familieboek", cover: true, puzzles: [puzzle, { ...puzzle, puzzleId: "def", difficulty: 4, theme: "animals_all" }] }} />);
    const pages = document.querySelectorAll(".print-page");
    expect(pages).toHaveLength(4);
    expect(pages[0]).toHaveClass("cover");
    expect(pages[1]).toHaveClass("puzzle-sheet");
    expect(pages[2]).toHaveClass("puzzle-sheet");
    expect(pages[3]).toHaveClass("answers");
    expect(screen.getByText("Familieboek")).toBeInTheDocument();
    expect(within(pages[0] as HTMLElement).getByText("2")).toBeInTheDocument();
    expect(within(pages[0] as HTMLElement).getByText("Niveaus 2, 4")).toBeInTheDocument();
    expect(within(pages[0] as HTMLElement).getByText("Geen thema")).toBeInTheDocument();
    expect(within(pages[0] as HTMLElement).getByText("Alle dieren")).toBeInTheDocument();
    expect(screen.getAllByText(/Niveau 2.*Geen thema/)).toHaveLength(2);
    expect(screen.getAllByText(/Niveau 4.*Alle dieren/)).toHaveLength(2);
  });

  it("shows singular cover metadata for one puzzle", () => {
    const { container } = render(<PrintDocument job={{ cover: true, puzzles: [puzzle] }} />);
    const cover = container.querySelector(".cover") as HTMLElement;

    expect(within(cover).getByText("1")).toBeInTheDocument();
    expect(within(cover).getByText("puzzel")).toBeInTheDocument();
    expect(within(cover).getByText("Niveau 2")).toBeInTheDocument();
    expect(within(cover).getByText("Geen thema")).toBeInTheDocument();
  });

  it("deduplicates repeated levels and themes on the cover", () => {
    const { container } = render(<PrintDocument job={{ cover: true, puzzles: [
      puzzle,
      { ...puzzle, puzzleId: "def" },
      { ...puzzle, puzzleId: "ghi" },
    ] }} />);
    const cover = container.querySelector(".cover") as HTMLElement;

    expect(within(cover).getByText("Niveau 2")).toBeInTheDocument();
    expect(within(cover).getAllByText("Geen thema")).toHaveLength(1);
  });

  it("orders multiple levels numerically on the cover", () => {
    const { container } = render(<PrintDocument job={{ cover: true, puzzles: [
      { ...puzzle, puzzleId: "level-4", difficulty: 4 },
      { ...puzzle, puzzleId: "level-1", difficulty: 1 },
      { ...puzzle, puzzleId: "level-3", difficulty: 3 },
      { ...puzzle, puzzleId: "level-2", difficulty: 2 },
      { ...puzzle, puzzleId: "level-1-again", difficulty: 1 },
    ] }} />);
    const cover = container.querySelector(".cover") as HTMLElement;

    expect(within(cover).getByText("Niveaus 1, 2, 3, 4")).toBeInTheDocument();
  });

  it.each([
    ["custom", "Familieboek", "Familieboek"],
    ["default", undefined, "Mijn puzzelboek"],
  ])("renders the %s cover title", (_variant, title, expected) => {
    const { container } = render(<PrintDocument job={{ title, cover: true, puzzles: [puzzle] }} />);
    const cover = container.querySelector(".cover") as HTMLElement;

    expect(within(cover).getByRole("heading", { name: expected })).toBeInTheDocument();
  });

  it.each([
    { cover: true, letters: ["A", "B", "C"], keyLetters: [], mode: "booklet" },
    { cover: false, letters: ["A", "A", "A", "B", "B", "C"], keyLetters: ["A", "B", "C"], mode: "single-puzzle print" },
  ])("fills the givens for a $mode", ({ cover, letters, keyLetters }) => {
    const grid = puzzle.grid.map((row) => [...row]);
    grid[0].splice(0, 5, 1, 2, 1, 3, 2);
    grid[1].splice(0, 2, 1, 4);
    const printable: PuzzleDocument = {
      ...puzzle,
      grid,
      givens: { 1: "A", 2: "B", 4: "C" },
      solution: { ...puzzle.solution, codeToLetter: { 1: "A", 2: "B", 3: "D", 4: "C" } },
    };
    const job = { cover, puzzles: [printable] };
    const { container, rerender } = render(<PrintDocument job={job} />);
    const givenCells = () => Array.from(container.querySelectorAll(".puzzle-sheet [data-cell=open]"), (cell) =>
      cell.querySelector(".print-letter")?.textContent ?? "");

    const initialCells = givenCells();
    expect(initialCells.filter(Boolean).sort()).toEqual(letters);
    expect(initialCells[3]).toBe("");
    expect(container.querySelectorAll(".puzzle-sheet .print-code")).toHaveLength(7);
    expect(Array.from(container.querySelectorAll(".print-key strong:not(:empty)"), (cell) => cell.textContent)).toEqual(keyLetters);
    expect(Array.from(container.querySelectorAll(".answers .print-letter"), (cell) => cell.textContent)).toEqual(["A", "B", "A", "D", "B", "A", "C"]);

    rerender(<PrintDocument job={{ ...job, puzzles: [{ ...printable }] }} />);
    expect(givenCells()).toEqual(initialCells);

    if (cover) {
      rerender(<PrintDocument job={{ ...job, puzzles: [{ ...printable, seed: "another-seed" }] }} />);
      expect(givenCells().indexOf("A")).not.toBe(initialCells.indexOf("A"));
    }
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
