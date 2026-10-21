// @vitest-environment node
import { describe, expect, it } from "vitest";
import rawLexicon from "../../public/lexicon.json";
import { normalizeTheme, type LexiconData } from "../types";
import { candidates, generatePuzzle } from "./generator";
import type { Difficulty } from "../types";

const lexicon = rawLexicon as unknown as LexiconData;

describe("browser generator", () => {
  it("ships a validated animal lexicon with full alphabet coverage", () => {
    const words = Object.values(lexicon.themes.animals.words).flat().map(([word]) => word);
    const letters = new Set(words.join(""));
    expect(words.length).toBeGreaterThanOrEqual(250);
    expect(new Set(words).size).toBe(words.length);
    expect(words.every((word) => /^[A-Z]{3,20}$/.test(word))).toBe(true);
    expect([..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].every((letter) => letters.has(letter))).toBe(true);
    expect(lexicon.themes.animals.license).toBe("CC BY 4.0");
  });

  it("ships a reviewed familiar-animal subset based on language frequency", () => {
    const all = new Set(Object.values(lexicon.themes.animals.words).flat().map(([word]) => word));
    const familiar = Object.values(lexicon.themes.animals.familiarWords).flat();
    expect(familiar.length).toBeGreaterThanOrEqual(500);
    expect(new Set(familiar.map(([word]) => word)).size).toBe(familiar.length);
    expect(familiar.every(([word, score]) => all.has(word) && score >= 1)).toBe(true);
    expect(familiar.some(([word]) => word.includes("Q"))).toBe(false);
  });

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

  it("can build a puzzle using all animal names", async () => {
    const puzzle = await generatePuzzle(1, "dieren-test", lexicon, undefined, undefined, { theme: "animals_all" });
    const animalWords = new Set(Object.values(lexicon.themes.animals.words).flat().map(([word]) => word));
    expect(puzzle.theme).toBe("animals_all");
    expect(puzzle.solution.entries.every((entry) => animalWords.has(entry.word))).toBe(true);
  }, 120_000);

  it.each(["general", "animals_all"] as const)("can require every letter for %s puzzles", async (theme) => {
    const puzzle = await generatePuzzle(2, `alfabet-${theme}`, lexicon, undefined, undefined, { theme, requireEveryLetter: true });
    const used = new Set(puzzle.solution.grid.flat().filter((letter): letter is string => letter !== null));
    expect([..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].every((letter) => used.has(letter))).toBe(true);
    expect(new Set(puzzle.grid.flat().filter((code): code is number => code !== null)).size).toBe(26);
  }, 120_000);

  it.each([1, 2, 3, 4] as Difficulty[])("creates a level %s puzzle with familiar animals", async (difficulty) => {
    const puzzle = await generatePuzzle(difficulty, `bekende-dieren-${difficulty}`, lexicon, undefined, undefined, { theme: "animals_familiar" });
    const familiar = new Set(Object.values(lexicon.themes.animals.familiarWords).flat().map(([word]) => word));
    expect(puzzle.theme).toBe("animals_familiar");
    expect(puzzle.solution.entries.every((entry) => familiar.has(entry.word))).toBe(true);
    expect(Object.keys(puzzle.givens)).toHaveLength(({ 1: 3, 2: 2, 3: 1, 4: 0 } as Record<Difficulty, number>)[difficulty]);
  }, 120_000);

  it("rejects full-alphabet puzzles with familiar animals", async () => {
    await expect(generatePuzzle(1, "onmogelijk", lexicon, undefined, undefined, { theme: "animals_familiar", requireEveryLetter: true }))
      .rejects.toThrow("geen Q");
  });

  it("maps the legacy animals theme to all animals", () => {
    expect(normalizeTheme("animals")).toBe("animals_all");
  });

  it("excludes pure proper names by default and permits them explicitly", () => {
    const hidden = candidates(lexicon, 4, 0, { theme: "general", requireEveryLetter: false, includeProperNames: false });
    const allowed = candidates(lexicon, 4, 0, { theme: "general", requireEveryLetter: false, includeProperNames: true });
    expect(hidden).not.toContain("KYRA");
    expect(allowed).toContain("KYRA");
  });
});
