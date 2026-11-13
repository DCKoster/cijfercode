// @vitest-environment node
import { describe, expect, it } from "vitest";
import rawLexicon from "../../public/lexicon.json";
import { normalizeTheme, type Difficulty, type Entry, type LexiconData } from "../types";
import { candidates, generatePuzzle, independentCrossingLoops } from "./generator";

const lexicon = rawLexicon as unknown as LexiconData;

describe("browser generator", () => {
  it("requires at least three independent crossing loops", () => {
    const entries: Entry[] = [
      { row: 2, column: 0, direction: "across", length: 5, word: "AAAAA" },
      { row: 0, column: 1, direction: "down", length: 5, word: "AAAAA" },
      { row: 0, column: 3, direction: "down", length: 5, word: "AAAAA" },
      { row: 0, column: 0, direction: "across", length: 5, word: "AAAAA" },
      { row: 4, column: 0, direction: "across", length: 5, word: "AAAAA" },
      { row: 0, column: 4, direction: "down", length: 3, word: "AAA" },
    ];

    expect(independentCrossingLoops(entries.slice(0, 3))).toBe(0);
    expect(independentCrossingLoops(entries.slice(0, 4))).toBe(1);
    expect(independentCrossingLoops(entries.slice(0, 5))).toBe(2);
    expect(independentCrossingLoops(entries)).toBe(3);
  });

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
    const familiarWords = new Set(familiar.map(([word]) => word));
    expect(familiar.length).toBeGreaterThanOrEqual(500);
    expect(familiarWords.size).toBe(familiar.length);
    expect(familiar.every(([word, score]) => all.has(word) && score >= 1)).toBe(true);
    expect(familiar.some(([word]) => word.includes("Q"))).toBe(false);
    expect(familiarWords).not.toContain("DRAAK");
    expect(familiarWords).not.toContain("HYDRA");
    expect(familiarWords).not.toContain("EENHOORN");
  });

  it("excludes non-Dutch tokens from the general puzzle vocabulary", () => {
    const words = new Set(Object.values(lexicon.words).flat().map(([word]) => word));
    expect(words).not.toContain("THE");
    expect(words).not.toContain("NEW");
    expect(words).not.toContain("DAY");
    expect(words).not.toContain("LIMIT");
    expect(words).not.toContain("CUE");
    expect(words).not.toContain("AAA");
    expect(words).not.toContain("DNS");
    expect(words).not.toContain("IDE");
    expect(words).not.toContain("XIV");
    expect(words).not.toContain("CMS");
    expect(words).not.toContain("SQL");
    expect(words).not.toContain("WOB");
    expect(words).not.toContain("ONT");
    expect(words).not.toContain("ANGELES");
    expect(words).toContain("DOVE");
    expect(words).toContain("TACT");
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

  it("retries a tree-like themed fill", async () => {
    let finalAttempt = 0;
    const puzzle = await generatePuzzle(
      2,
      "connect-animals_all-2",
      lexicon,
      (attempt) => { finalAttempt = attempt; },
      undefined,
      { theme: "animals_all" },
    );

    expect(finalAttempt).toBeGreaterThan(1);
    expect(independentCrossingLoops(puzzle.solution.entries)).toBeGreaterThanOrEqual(3);
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
