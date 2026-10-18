// @vitest-environment node
import { describe, expect, it } from "vitest";
import rawLexicon from "../../public/lexicon.json";
import type { LexiconData } from "../types";
import { generatePuzzle } from "./generator";
import type { Difficulty } from "../types";

const lexicon = rawLexicon as unknown as LexiconData;

describe("browser generator", () => {
  it("creates a deterministic, uniquely solved 17×20 puzzle", async () => {
    const first = await generatePuzzle(1, "vaste-test", lexicon);
    const second = await generatePuzzle(1, "vaste-test", lexicon);
    expect(first).toEqual(second);
    expect(first.grid).toHaveLength(20);
    expect(first.grid.every((row) => row.length === 17)).toBe(true);
    expect(first.measured.solutions).toBe(1);
    expect(Object.keys(first.givens)).toHaveLength(3);
  }, 60_000);

  it.each([2, 3, 4] as Difficulty[])("creates a valid level %s puzzle", async (difficulty) => {
    const puzzle = await generatePuzzle(difficulty, `niveau-${difficulty}`, lexicon);
    expect(puzzle.difficulty).toBe(difficulty);
    expect(puzzle.measured.solutions).toBe(1);
    expect(puzzle.measured.exhausted).toBe(false);
    expect(Object.keys(puzzle.givens)).toHaveLength(({ 1: 3, 2: 2, 3: 1, 4: 0 } as Record<Difficulty, number>)[difficulty]);
  }, 120_000);
});
