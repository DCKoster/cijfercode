import type { Cell, Difficulty, Entry, LetterCell, LexiconData, PuzzleDocument, SolverMetrics } from "../types";
import { SeededRandom } from "./random";

const WIDTH = 17 as const;
const HEIGHT = 20 as const;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const PROFILES: Record<Difficulty, { minimumScore: number; hints: number; maxNodes: number }> = {
  1: { minimumScore: 4, hints: 3, maxNodes: 100 },
  2: { minimumScore: 3.5, hints: 2, maxNodes: 250 },
  3: { minimumScore: 3, hints: 1, maxNodes: 1000 },
  4: { minimumScore: 2, hints: 0, maxNodes: 5000 },
};

interface FillResult { grid: LetterCell[][]; entries: Entry[] }
interface SolveResult { metrics: SolverMetrics; solutions: LetterCell[][][] }

function adjustedScore(base: number, length: number): number {
  return Math.max(base - 1.2, base - 0.12 * Math.max(0, length - 5));
}

function candidates(lexicon: LexiconData, length: number, minimumScore: number): string[] {
  const threshold = adjustedScore(minimumScore, length);
  return (lexicon.words[String(length)] ?? [])
    .filter(([, score]) => score >= threshold)
    .map(([word]) => word);
}

function cells(entry: Pick<Entry, "row" | "column" | "direction" | "length">): Array<[number, number]> {
  const [dr, dc] = entry.direction === "across" ? [0, 1] : [1, 0];
  return Array.from({ length: entry.length }, (_, offset) => [entry.row + dr * offset, entry.column + dc * offset]);
}

function generateFill(lexicon: LexiconData, random: SeededRandom, minimumScore: number): FillResult | null {
  const pool: string[] = [];
  const scores = new Map<string, number>();
  for (let length = 3; length <= 20; length += 1) {
    for (const [word, score] of (lexicon.words[String(length)] ?? [])) scores.set(word, score);
    pool.push(...candidates(lexicon, length, minimumScore).slice(0, 2500));
  }
  if (!pool.length) return null;
  const ranking = new Map(pool.map((word) => [word, (scores.get(word) ?? 0) + random.next() * 0.35]));
  pool.sort((a, b) => ranking.get(b)! - ranking.get(a)!);

  const index = new Map<string, Array<[string, number]>>();
  for (const word of pool) {
    for (let position = 0; position < word.length; position += 1) {
      const letter = word[position];
      if (word.length <= WIDTH) {
        const key = `across:${letter}`;
        const values = index.get(key) ?? [];
        values.push([word, position]); index.set(key, values);
      }
      if (word.length <= HEIGHT) {
        const key = `down:${letter}`;
        const values = index.get(key) ?? [];
        values.push([word, position]); index.set(key, values);
      }
    }
  }
  for (const values of index.values()) random.shuffle(values);
  const starters = pool.filter((word) => word.length >= 7 && word.length <= WIDTH);
  if (!starters.length) return null;

  const firstWord = starters[0];
  const first: Entry = { row: Math.floor(HEIGHT / 2), column: Math.floor((WIDTH - firstWord.length) / 2), direction: "across", length: firstWord.length, word: firstWord };
  const entries = [first];
  const used = new Set([firstWord]);
  const letters = new Map<string, string>();
  const directions = new Map<string, Set<string>>();
  const keyOf = (row: number, column: number) => `${row},${column}`;
  for (const [position, [row, column]] of cells(first).entries()) {
    const key = keyOf(row, column); letters.set(key, firstWord[position]); directions.set(key, new Set(["across"]));
  }

  let misses = 0;
  const desired = 39;
  while (entries.length < desired && misses < 12000) {
    const anchors: Array<[[number, number], "across" | "down"]> = [];
    for (const [key, present] of directions) {
      const [row, column] = key.split(",").map(Number);
      if (!present.has("across")) anchors.push([[row, column], "across"]);
      if (!present.has("down")) anchors.push([[row, column], "down"]);
    }
    if (!anchors.length) break;
    const [[anchorRow, anchorColumn], direction] = anchors[random.integer(anchors.length)];
    const options = index.get(`${direction}:${letters.get(keyOf(anchorRow, anchorColumn))}`) ?? [];
    if (!options.length) { misses += 1; continue; }
    const [word, crossing] = options[random.integer(options.length)];
    if (used.has(word)) { misses += 1; continue; }
    const [dr, dc] = direction === "across" ? [0, 1] : [1, 0];
    const row = anchorRow - dr * crossing;
    const column = anchorColumn - dc * crossing;
    const endRow = row + dr * (word.length - 1);
    const endColumn = column + dc * (word.length - 1);
    if (row < 0 || column < 0 || endRow >= HEIGHT || endColumn >= WIDTH || letters.has(keyOf(row - dr, column - dc)) || letters.has(keyOf(endRow + dr, endColumn + dc))) {
      misses += 1; continue;
    }
    let crossings = 0;
    let valid = true;
    for (let offset = 0; offset < word.length && valid; offset += 1) {
      const cellRow = row + dr * offset;
      const cellColumn = column + dc * offset;
      const key = keyOf(cellRow, cellColumn);
      if (letters.has(key)) {
        if (letters.get(key) !== word[offset] || directions.get(key)?.has(direction)) valid = false;
        else crossings += 1;
      } else {
        const neighbours = direction === "across"
          ? [[cellRow - 1, cellColumn], [cellRow + 1, cellColumn]]
          : [[cellRow, cellColumn - 1], [cellRow, cellColumn + 1]];
        if (neighbours.some(([r, c]) => letters.has(keyOf(r, c)))) valid = false;
      }
    }
    if (!valid || crossings === 0) { misses += 1; continue; }
    const entry: Entry = { row, column, direction, length: word.length, word };
    entries.push(entry); used.add(word);
    for (const [position, [cellRow, cellColumn]] of cells(entry).entries()) {
      const key = keyOf(cellRow, cellColumn); letters.set(key, word[position]);
      const present = directions.get(key) ?? new Set<string>(); present.add(direction); directions.set(key, present);
    }
    misses = 0;
  }
  if (entries.length < 25) return null;
  const grid = Array.from({ length: HEIGHT }, (_, row) => Array.from({ length: WIDTH }, (_, column) => letters.get(keyOf(row, column)) ?? null));
  return { grid, entries };
}

function pattern(values: Array<number | string>): number[] {
  const labels = new Map<number | string, number>();
  return values.map((value) => { if (!labels.has(value)) labels.set(value, labels.size); return labels.get(value)!; });
}

function extractEntries(grid: Cell[][]): Array<{ positions: Array<[number, number]>; codes: number[] }> {
  const found: Array<{ positions: Array<[number, number]>; codes: number[] }> = [];
  const height = grid.length, width = grid[0].length;
  for (let row = 0; row < height; row += 1) for (let column = 0; column < width;) {
    if (grid[row][column] !== null && (column === 0 || grid[row][column - 1] === null)) {
      let end = column; while (end < width && grid[row][end] !== null) end += 1;
      if (end - column >= 3) { const positions = Array.from({ length: end - column }, (_, i) => [row, column + i] as [number, number]); found.push({ positions, codes: positions.map(([r, c]) => grid[r][c]!) }); }
      column = end;
    } else column += 1;
  }
  for (let column = 0; column < width; column += 1) for (let row = 0; row < height;) {
    if (grid[row][column] !== null && (row === 0 || grid[row - 1][column] === null)) {
      let end = row; while (end < height && grid[end][column] !== null) end += 1;
      if (end - row >= 3) { const positions = Array.from({ length: end - row }, (_, i) => [row + i, column] as [number, number]); found.push({ positions, codes: positions.map(([r, c]) => grid[r][c]!) }); }
      row = end;
    } else row += 1;
  }
  return found;
}

function compatible(codes: number[], word: string, mapping: Map<number, string>, reverse: Map<string, number>): boolean {
  const proposedCodes = new Map<number, string>(), proposedLetters = new Map<string, number>();
  for (let index = 0; index < codes.length; index += 1) {
    const code = codes[index], letter = word[index];
    if ((mapping.has(code) && mapping.get(code) !== letter) || (reverse.has(letter) && reverse.get(letter) !== code)) return false;
    if ((proposedCodes.has(code) && proposedCodes.get(code) !== letter) || (proposedLetters.has(letter) && proposedLetters.get(letter) !== code)) return false;
    proposedCodes.set(code, letter); proposedLetters.set(letter, code);
  }
  return true;
}

function solve(grid: Cell[][], givens: Record<number, string>, lexicon: LexiconData, minimumScore: number, maxNodes: number): SolveResult {
  const entries = extractEntries(grid);
  const domains = entries.map(({ codes }) => candidates(lexicon, codes.length, minimumScore).filter((word) => pattern(word.split("")).join() === pattern(codes).join()));
  const solutions: LetterCell[][][] = [];
  const metrics: SolverMetrics = { solutions: 0, propagationSteps: 0, searchNodes: 0, maxDepth: 0, exhausted: false };
  const initial = new Map<number, string>(Object.entries(givens).map(([code, letter]) => [Number(code), letter]));
  const initialReverse = new Map(Array.from(initial, ([code, letter]) => [letter, code]));
  const search = (mapping: Map<number, string>, reverse: Map<string, number>, assigned: Set<number>, used: Set<string>, depth: number): void => {
    if (solutions.length >= 2 || metrics.exhausted) return;
    if (metrics.searchNodes >= maxNodes) { metrics.exhausted = true; return; }
    mapping = new Map(mapping); reverse = new Map(reverse); assigned = new Set(assigned); used = new Set(used);
    let choice = -1, choiceWords: string[] = [];
    while (true) {
      if (assigned.size === entries.length) {
        solutions.push(grid.map((row) => row.map((code) => code === null ? null : mapping.get(code) ?? "?")));
        return;
      }
      choice = -1; choiceWords = [];
      let forced: [number, string] | undefined;
      for (let index = 0; index < entries.length; index += 1) {
        if (assigned.has(index)) continue;
        const words = domains[index].filter((word) => !used.has(word) && compatible(entries[index].codes, word, mapping, reverse));
        if (!words.length) return;
        if (choice < 0 || words.length < choiceWords.length) { choice = index; choiceWords = words; }
        if (words.length === 1) { forced = [index, words[0]]; break; }
      }
      if (!forced) break;
      const [index, word] = forced;
      entries[index].codes.forEach((code, position) => { mapping.set(code, word[position]); reverse.set(word[position], code); });
      assigned.add(index); used.add(word); metrics.propagationSteps += 1;
    }
    for (const word of choiceWords) {
      if (solutions.length >= 2) break;
      metrics.searchNodes += 1; metrics.maxDepth = Math.max(metrics.maxDepth, depth + 1);
      const nextMapping = new Map(mapping), nextReverse = new Map(reverse);
      entries[choice].codes.forEach((code, index) => { nextMapping.set(code, word[index]); nextReverse.set(word[index], code); });
      search(nextMapping, nextReverse, new Set([...assigned, choice]), new Set([...used, word]), depth + 1);
    }
  };
  search(initial, initialReverse, new Set(), new Set(), 0);
  metrics.solutions = solutions.length;
  return { metrics, solutions };
}

function hashId(value: string): string {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function matchesDifficulty(difficulty: Difficulty, metrics: SolverMetrics): boolean {
  if (metrics.solutions !== 1 || metrics.exhausted) return false;
  if (difficulty === 1) return metrics.searchNodes <= 20 && metrics.maxDepth <= 1;
  if (difficulty === 2) return metrics.searchNodes <= 100 && metrics.maxDepth <= 2;
  if (difficulty === 3) return metrics.searchNodes <= 1000;
  return metrics.searchNodes <= 5000;
}

export async function generatePuzzle(difficulty: Difficulty, seed: string, lexicon: LexiconData, onProgress?: (attempt: number, maximum: number) => void, cancelled?: () => boolean): Promise<PuzzleDocument> {
  const profile = PROFILES[difficulty];
  const maximum = 100;
  const random = new SeededRandom(`cijfercode-web-2:${seed}:${difficulty}`);
  for (let attempt = 1; attempt <= maximum; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (cancelled?.()) throw new Error("Geannuleerd");
    onProgress?.(attempt, maximum);
    const fill = generateFill(lexicon, random, profile.minimumScore);
    if (!fill) continue;
    const shuffled = random.shuffle(LETTERS.split(""));
    const codeToLetter: Record<number, string> = Object.fromEntries(shuffled.map((letter, index) => [index + 1, letter]));
    const letterToCode = Object.fromEntries(Object.entries(codeToLetter).map(([code, letter]) => [letter, Number(code)]));
    const grid = fill.grid.map((row) => row.map((letter) => letter === null ? null : letterToCode[letter]));
    const frequencies = new Map<number, number>();
    grid.flat().forEach((code) => { if (code !== null) frequencies.set(code, (frequencies.get(code) ?? 0) + 1); });
    const usedCodes = Array.from(frequencies).sort((a, b) => b[1] + random.next() * 3 - a[1] - random.next() * 3).map(([code]) => code);
    const givens = Object.fromEntries(usedCodes.slice(0, profile.hints).map((code) => [code, codeToLetter[code]]));
    const solved = solve(grid, givens, lexicon, profile.minimumScore, profile.maxNodes);
    if (!matchesDifficulty(difficulty, solved.metrics)) continue;
    return {
      schemaVersion: 3, generatorVersion: "web-2", lexiconVersion: lexicon.version,
      puzzleId: hashId(`${seed}:${difficulty}:${JSON.stringify(grid)}:${JSON.stringify(givens)}`), seed, difficulty,
      width: WIDTH, height: HEIGHT, grid, givens, measured: solved.metrics,
      solution: { grid: fill.grid, codeToLetter, entries: fill.entries },
    };
  }
  throw new Error("Er kon geen unieke puzzel worden gemaakt. Probeer het opnieuw.");
}
