import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { generatePuzzle } from "../src-web/generator/generator";
import type { Difficulty, GenerationOptions, LexiconData, Theme } from "../src-web/types";

const count = Math.max(1, Number(process.argv[2] ?? 5));
const lexicon = JSON.parse(await readFile(resolve("public/lexicon.json"), "utf8")) as LexiconData;
const modes: GenerationOptions["generationMode"][] = ["interactive", "booklet"];
const themes: Theme[] = ["general", "animals_familiar", "animals_all"];
console.log("seed,mode,theme,difficulty,milliseconds,blocks,openCells,words,short,medium,long,retries,solverNodes,status");
for (const mode of modes) for (const theme of themes) for (let index = 0; index < count; index += 1) {
  const difficulty = (index % 4 + 1) as Difficulty, seed = `audit-${mode}-${theme}-${index}`;
  let retries = 0;
  const started = performance.now();
  try {
    const puzzle = await generatePuzzle(difficulty, seed, lexicon, (attempt) => { retries = attempt - 1; }, undefined, {
      theme, generationMode: mode, requireEveryLetter: false, includeProperNames: false,
    });
    const blocks = puzzle.grid.flat().filter((cell) => cell === null).length;
    const lengths = puzzle.solution.entries.map((entry) => entry.length);
    console.log([seed, mode, theme, difficulty, Math.round(performance.now() - started), blocks, 340 - blocks, lengths.length,
      lengths.filter((length) => length <= 5).length, lengths.filter((length) => length >= 6 && length <= 9).length,
      lengths.filter((length) => length >= 10).length, retries, puzzle.measured.searchNodes, "ok"].join(","));
  } catch (error) {
    console.log([seed, mode, theme, difficulty, Math.round(performance.now() - started), "", "", "", "", "", "", retries, "", error instanceof Error ? error.message : "error"].join(","));
  }
}
