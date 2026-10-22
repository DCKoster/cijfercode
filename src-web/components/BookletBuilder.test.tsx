import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { requestPuzzle } from "../generator/client";
import type { Difficulty, PuzzleDocument, Theme } from "../types";
import { BookletBuilder, normalizeThemeSpecs } from "./BookletBuilder";

vi.mock("../generator/client", () => ({ requestPuzzle: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function puzzle(difficulty: Difficulty, theme: Theme): PuzzleDocument {
  return {
    schemaVersion: 4, generatorVersion: "web-3", lexiconVersion: "test", puzzleId: `${difficulty}-${theme}`, seed: "test",
    difficulty, theme, requireEveryLetter: false, includeProperNames: false, width: 17, height: 20,
    grid: Array.from({ length: 20 }, () => Array.from<number | null>({ length: 17 }).fill(null)), givens: {},
    measured: { solutions: 1, propagationSteps: 0, searchNodes: 0, maxDepth: 0, exhausted: false },
    solution: { grid: Array.from({ length: 20 }, () => Array.from<string | null>({ length: 17 }).fill(null)), codeToLetter: {}, entries: [] },
  };
}

describe("BookletBuilder", () => {
  it("upgrades the old single-theme specification", () => {
    const themes = normalizeThemeSpecs({
      title: "Oud boek", theme: "animals_all", counts: { 1: 0, 2: 3, 3: 0, 4: 0 }, requireEveryLetter: true,
    });
    expect(themes.find((item) => item.theme === "animals_all")).toMatchObject({ counts: { 1: 0, 2: 3, 3: 0, 4: 0 }, requireEveryLetter: true });
    expect(themes.find((item) => item.theme === "general")?.counts).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0 });
  });

  it("shows a responsive theme matrix and disables unsupported options", () => {
    render(<BookletBuilder initial={null} onSave={vi.fn()} onPrint={vi.fn()} />);
    expect(screen.getByLabelText("Geen thema, niveau 1")).toHaveValue(1);
    expect(screen.getByLabelText("Bekende dieren, niveau 1")).toHaveValue(0);
    const familiarOptions = screen.getByText("Bekende dieren").closest(".theme-count-row")!;
    expect(familiarOptions.querySelectorAll("input[type=checkbox]:disabled")).toHaveLength(2);
    const allOptions = screen.getByText("Alle dieren").closest(".theme-count-row")!;
    expect(allOptions.querySelectorAll("input[type=checkbox]:disabled")).toHaveLength(1);
    expect(screen.getByText(/maximaal 50 puzzels/)).toBeInTheDocument();
  });

  it("generates mixed themes ordered by level and then theme", async () => {
    vi.mocked(requestPuzzle).mockImplementation(async (difficulty, options) => puzzle(difficulty, options?.theme ?? "general"));
    const onSave = vi.fn();
    render(<BookletBuilder initial={null} onSave={onSave} onPrint={vi.fn()} />);
    for (const level of [1, 2, 3, 4]) fireEvent.change(screen.getByLabelText(`Geen thema, niveau ${level}`), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Alle dieren, niveau 1"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Bekende dieren, niveau 2"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Boekje genereren" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(vi.mocked(requestPuzzle).mock.calls.map(([level, options]) => [level, options?.theme])).toEqual([
      [1, "animals_all"], [2, "animals_familiar"],
    ]);
    expect(onSave.mock.calls[0][0].puzzles.map((item: PuzzleDocument) => item.theme)).toEqual(["animals_all", "animals_familiar"]);
  });

  it("accepts 50 puzzles and rejects totals above the limit", async () => {
    vi.mocked(requestPuzzle).mockImplementation(async (difficulty, options) => puzzle(difficulty, options?.theme ?? "general"));
    const onSave = vi.fn();
    render(<BookletBuilder initial={null} onSave={onSave} onPrint={vi.fn()} />);
    for (const level of [1, 2, 3, 4]) fireEvent.change(screen.getByLabelText(`Geen thema, niveau ${level}`), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Boekje genereren" }));
    expect(screen.getByText("Kies in totaal tussen 1 en 50 puzzels.")).toBeInTheDocument();
    expect(requestPuzzle).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Geen thema, niveau 1"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Boekje genereren" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(requestPuzzle).toHaveBeenCalledTimes(50);

    fireEvent.change(screen.getByLabelText("Bekende dieren, niveau 1"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Boekje genereren" }));
    expect(await screen.findByText("Kies in totaal tussen 1 en 50 puzzels.")).toBeInTheDocument();
    expect(requestPuzzle).toHaveBeenCalledTimes(50);
  });
});
