import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generatePuzzle } from "./generator/generator";
import { normalizeTheme, type Difficulty, type LexiconData, type Theme } from "./types";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const level = Number(option("--difficulty"));
  if (![1, 2, 3, 4].includes(level)) throw new Error("Gebruik --difficulty met niveau 1, 2, 3 of 4.");
  const seed = option("--seed") ?? crypto.randomUUID();
  const output = option("--output");
  const themeOption = option("--theme") ?? "general";
  if (!["general", "animals_familiar", "animals_all", "animals"].includes(themeOption)) {
    throw new Error("Gebruik --theme met general, animals_familiar of animals_all.");
  }
  const theme: Theme = normalizeTheme(themeOption);
  const lexicon = JSON.parse(await readFile(resolve("public/lexicon.json"), "utf8")) as LexiconData;
  const puzzle = await generatePuzzle(
    level as Difficulty, seed, lexicon,
    (attempt) => process.stderr.write(`\rPoging ${attempt}`),
    undefined,
    { theme, requireEveryLetter: process.argv.includes("--all-letters"), includeProperNames: process.argv.includes("--include-names") },
  );
  process.stderr.write("\r                \r");
  const json = `${JSON.stringify(puzzle, null, 2)}\n`;
  if (output) await writeFile(output, json, "utf8");
  else process.stdout.write(json);
}

main().catch((error: unknown) => {
  process.stderr.write(`fout: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 2;
});
