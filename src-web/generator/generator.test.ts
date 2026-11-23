// @vitest-environment node
import { describe, expect, it } from "vitest";
import rawLexicon from "../../public/lexicon.json";
import { normalizeTheme, puzzleSignature, type Difficulty, type Entry, type LexiconData, type PuzzleSignature } from "../types";
import { candidates, generatePuzzle, independentCrossingLoops, selectGivenCodes } from "./generator";
import { LAYOUT_PROFILES, assessBlockMask } from "./layout";
import { SeededRandom } from "./random";

const lexicon = rawLexicon as unknown as LexiconData;

describe("browser generator", () => {
  it("selects seeded semi-random hints from repeated letters", () => {
    const frequencies = new Map([[1, 8], [2, 7], [3, 5], [4, 2], [5, 1], [6, 12], [7, 9]]);
    const letters = { 1: "A", 2: "N", 3: "S", 4: "K", 5: "B", 6: "Q", 7: "X" };
    const first = selectGivenCodes(frequencies, letters, 3, new SeededRandom("hints"));
    const second = selectGivenCodes(frequencies, letters, 3, new SeededRandom("hints"));

    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    expect(first.every((code) => frequencies.get(code)! > 1)).toBe(true);
    expect(first.map((code) => letters[code as keyof typeof letters])).not.toContain("Q");
    expect(first.map((code) => letters[code as keyof typeof letters])).not.toContain("X");
  });

  it("uses non-Q/X singletons only when repeated letters are insufficient", () => {
    const frequencies = new Map([[1, 4], [2, 1], [3, 1], [4, 8]]);
    const letters = { 1: "R", 2: "B", 3: "C", 4: "Q" };
    const selected = selectGivenCodes(frequencies, letters, 3, new SeededRandom("fallback"));

    expect(selected[0]).toBe(1);
    expect(new Set(selected)).toEqual(new Set([1, 2, 3]));
  });

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

  it.each([1, 2, 3, 4] as Difficulty[])("generates a dense, full-alphabet booklet puzzle at level %s", async (difficulty) => {
    let finalAttempt = 0;
    const puzzle = await generatePuzzle(difficulty, `booklet-alphabet-${difficulty}`, lexicon,
      (attempt) => { finalAttempt = attempt; }, undefined, { generationMode: "booklet", requireEveryLetter: true });
    const mask = puzzle.grid.map((row) => row.map((cell) => cell === null));
    const lengths = new Map(Array.from({ length: 18 }, (_, index) => [index + 3, 1_200]));

    expect(assessBlockMask(mask, LAYOUT_PROFILES.booklet, lengths).valid).toBe(true);
    expect(independentCrossingLoops(puzzle.solution.entries)).toBeGreaterThanOrEqual(3);
    expect(new Set(puzzle.grid.flat().filter((code) => code !== null)).size).toBe(26);
    expect(puzzle.measured.solutions).toBe(1);
    expect(puzzle.measured.exhausted).toBe(false);
    expect(finalAttempt).toBeLessThanOrEqual(3);
  });

  it.each(["animals_familiar", "animals_all"] as const)("makes a booklet puzzle for the %s theme", async (theme) => {
    const requireEveryLetter = theme === "animals_all";
    const source = requireEveryLetter ? lexicon.themes.animals.words : lexicon.themes.animals.familiarWords;
    const words = new Set(Object.values(source).flatMap((entries) => entries.map(([word]) => word)));
    const puzzle = await generatePuzzle(4, `booklet-${theme}`, lexicon, undefined, undefined,
      { theme, generationMode: "booklet", requireEveryLetter });
    const mask = puzzle.grid.map((row) => row.map((cell) => cell === null));
    const lengths = new Map(Object.entries(source).map(([length, entries]) => [Number(length), entries.length]));

    expect(assessBlockMask(mask, LAYOUT_PROFILES.animalBooklet, lengths).valid).toBe(true);
    expect(puzzle.solution.entries.every(({ word }) => words.has(word))).toBe(true);
    expect(puzzle.measured.solutions).toBe(1);
    if (requireEveryLetter) expect(new Set(puzzle.grid.flat().filter((code) => code !== null)).size).toBe(26);
  });

  it.each(["booklet", "interactive"] as const)("varies four level-2 familiar-animal puzzles in %s mode", async (generationMode) => {
    const previous: PuzzleSignature[] = [];
    for (let index = 0; index < 4; index += 1) {
      const puzzle = await generatePuzzle(2, "bekende-dieren-herhaling", lexicon, undefined, undefined,
        { theme: "animals_familiar", generationMode }, previous);
      const signature = puzzleSignature(puzzle);
      for (const earlier of previous) {
        const changedCells = [...signature.layout].filter((cell, position) => cell !== earlier.layout[position]).length;
        const sharedWords = signature.answers.filter((word) => earlier.answers.includes(word)).length;
        expect(changedCells).toBeGreaterThanOrEqual(12);
        expect(Math.min(signature.answers.length, earlier.answers.length) - sharedWords).toBeGreaterThanOrEqual(3);
      }
      previous.push(signature);
    }
  });

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
    const hidden = candidates(lexicon, 4, 0, { theme: "general", requireEveryLetter: false, includeProperNames: false, generationMode: "interactive" });
    const allowed = candidates(lexicon, 4, 0, { theme: "general", requireEveryLetter: false, includeProperNames: true, generationMode: "interactive" });
    expect(hidden).not.toContain("KYRA");
    expect(allowed).toContain("KYRA");
  });
});
