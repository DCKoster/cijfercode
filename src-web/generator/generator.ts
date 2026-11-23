import { normalizeTheme, type Cell, type Difficulty, type Entry, type GenerationDiagnostics, type GenerationOptions, type LetterCell, type LexiconData, type PuzzleDocument, type PuzzleSignature, type SolverMetrics } from "../types";
import { SeededRandom } from "./random";
import { fillSlots, indexFillWords, prepareFill, type FillWord } from "./fill";
import { acceptsLayout, assessBlockMask, layoutPattern, layoutProfile, templateOrientations, type LayoutSlot } from "./layout";
import { layoutDictionaryScores, PROCEDURAL_RESTARTS, searchMasks, TEMPLATE_ATTEMPTS } from "./proceduralLayout";
import { generationSlice } from "./slice";

const WIDTH = 17 as const;
const HEIGHT = 20 as const;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const MINIMUM_INDEPENDENT_LOOPS = 3;
const GENERATOR_VERSION = "web-7";
const DEFAULT_OPTIONS: GenerationOptions = { theme: "general", requireEveryLetter: false, includeProperNames: false, generationMode: "interactive" };
const PROFILES: Record<Difficulty, { minimumScore: number; hints: number; maxNodes: number }> = {
  1: { minimumScore: 4, hints: 3, maxNodes: 100 },
  2: { minimumScore: 3.5, hints: 2, maxNodes: 250 },
  3: { minimumScore: 3, hints: 1, maxNodes: 1000 },
  4: { minimumScore: 2, hints: 0, maxNodes: 5000 },
};

interface SolveResult { metrics: SolverMetrics; solutions: LetterCell[][][] }

function adjustedScore(base: number, length: number): number {
  return Math.max(base - 1.2, base - 0.12 * Math.max(0, length - 5));
}

function wordSource(lexicon: LexiconData, options: GenerationOptions): Record<string, Array<[string, number]>> {
  if (options.theme === "animals_familiar") return lexicon.themes.animals.familiarWords;
  return options.theme === "animals_all" ? lexicon.themes.animals.words : lexicon.words;
}

export function candidates(lexicon: LexiconData, length: number, minimumScore: number, options: GenerationOptions): string[] {
  const threshold = adjustedScore(minimumScore, length);
  const properNames = new Set(lexicon.properNames);
  return (wordSource(lexicon, options)[String(length)] ?? [])
    .filter(([, score]) => options.theme !== "general" || score >= threshold)
    .filter(([word]) => options.theme !== "general" || options.includeProperNames || !properNames.has(word))
    .map(([word]) => word);
}

function cells(entry: Pick<Entry, "row" | "column" | "direction" | "length">): Array<[number, number]> {
  const [dr, dc] = entry.direction === "across" ? [0, 1] : [1, 0];
  return Array.from({ length: entry.length }, (_, offset) => [entry.row + dr * offset, entry.column + dc * offset]);
}

export function independentCrossingLoops(entries: Array<Pick<Entry, "row" | "column" | "direction" | "length">>): number {
  if (!entries.length) return 0;
  const usage = new Map<string, number>();
  for (const entry of entries) {
    for (const [row, column] of cells(entry)) {
      const key = `${row},${column}`;
      usage.set(key, (usage.get(key) ?? 0) + 1);
    }
  }
  const crossings = Array.from(usage.values()).filter((count) => count > 1).length;
  return Math.max(0, crossings - entries.length + 1);
}

export function selectGivenCodes(
  frequencies: Map<number, number>,
  codeToLetter: Record<number, string>,
  count: number,
  random: SeededRandom,
): number[] {
  const allowed = Array.from(frequencies)
    .filter(([code]) => !["Q", "X"].includes(codeToLetter[code]));
  const repeated = allowed.filter(([, frequency]) => frequency > 1).map(([code]) => code);
  const singletons = allowed.filter(([, frequency]) => frequency === 1).map(([code]) => code);
  return [...random.shuffle(repeated), ...random.shuffle(singletons)].slice(0, count);
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
  for (const [index, code] of codes.entries()) {
    const letter = word[index];
    if ((mapping.has(code) && mapping.get(code) !== letter) || (reverse.has(letter) && reverse.get(letter) !== code)) return false;
  }
  return true;
}

function solve(grid: Cell[][], givens: Record<number, string>, wordsByLength: ReadonlyMap<number, string[]>, maxNodes: number): SolveResult {
  const entries = extractEntries(grid);
  const patternsByLength = new Map<number, Map<string, string[]>>();
  const domains = entries.map(({ codes }) => {
    let byPattern = patternsByLength.get(codes.length);
    if (!byPattern) {
      byPattern = new Map();
      for (const word of wordsByLength.get(codes.length) ?? []) {
        const key = pattern(word.split("")).join();
        const words = byPattern.get(key) ?? [];
        words.push(word);
        byPattern.set(key, words);
      }
      patternsByLength.set(codes.length, byPattern);
    }
    return byPattern.get(pattern(codes).join()) ?? [];
  });
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

function matchesDifficulty(difficulty: Difficulty, metrics: SolverMetrics, options: GenerationOptions): boolean {
  if (metrics.solutions !== 1 || metrics.exhausted) return false;
  if (options.theme !== "general") return metrics.searchNodes <= 5000;
  if (difficulty === 1) return metrics.searchNodes <= 20 && metrics.maxDepth <= 1;
  if (difficulty === 2) return metrics.searchNodes <= 100 && metrics.maxDepth <= 2;
  if (difficulty === 3) return metrics.searchNodes <= 1000;
  return metrics.searchNodes <= 5000;
}

export function distinctAnswerCount(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  const [smaller, larger] = left.size <= right.size ? [left, right] : [right, left];
  let distinct = 0;
  for (const word of smaller) if (!larger.has(word)) distinct += 1;
  return distinct;
}

export async function generatePuzzle(difficulty: Difficulty, seed: string, lexicon: LexiconData, onProgress?: (attempt: number, maximum: number) => void, cancelled?: () => boolean, requestedOptions: Partial<GenerationOptions> = {}, previousPuzzles: readonly PuzzleSignature[] = [], onDiagnostics?: (diagnostics: GenerationDiagnostics) => void): Promise<PuzzleDocument> {
  const options = { ...DEFAULT_OPTIONS, ...requestedOptions, theme: normalizeTheme(requestedOptions.theme) };
  if (options.theme === "animals_familiar" && options.requireEveryLetter) {
    throw new Error("Bekende dieren kan niet met alle 26 letters worden gecombineerd, omdat deze woordenlijst geen Q bevat.");
  }
  const slice = generationSlice(cancelled);
  await slice(true);
  const profile = PROFILES[difficulty];
  const optionKey = `${options.theme}:${Number(options.requireEveryLetter)}:${Number(options.includeProperNames)}:${options.generationMode}`;
  const random = new SeededRandom(`cijfercode-${GENERATOR_VERSION}:${seed}:${difficulty}:${optionKey}`);
  const source = wordSource(lexicon, options);
  const wordsByLength = new Map<number, FillWord[]>();
  const solverWords = new Map<number, string[]>();
  for (let length = 3; length <= 20; length += 1) {
    const allowed = candidates(lexicon, length, profile.minimumScore, options);
    solverWords.set(length, allowed);
    const available = new Set(allowed);
    const limit = options.theme === "general" ? 1_200 : Number.POSITIVE_INFINITY;
    wordsByLength.set(length, (source[String(length)] ?? [])
      .filter(([word]) => available.has(word))
      .filter(([word], index) => index < limit || (options.requireEveryLetter && /[QXY]/.test(word)))
      .map(([word, score]) => ({ word, score })));
  }
  const dictionary = indexFillWords(wordsByLength);
  const layoutScores = layoutDictionaryScores(dictionary, options.requireEveryLetter, options.theme !== "general");
  const previousLayouts = previousPuzzles.map(({ layout }) => layout);
  const previousAnswers = previousPuzzles.map(({ answers }) => new Set(answers));
  const answerFrequency = new Map<string, number>();
  for (const answers of previousAnswers) {
    for (const word of answers) answerFrequency.set(word, (answerFrequency.get(word) ?? 0) + 1);
  }
  const diversity = previousAnswers.length ? {
    answerFrequency,
    acceptsAnswers: (words: string[]) => {
      const current = new Set(words);
      return previousAnswers.every((answers) => distinctAnswerCount(answers, current) >= 3);
    },
  } : undefined;
  const diagnostics: GenerationDiagnostics = {
    fallbackEntered: false, proceduralRestarts: 0, proceduralFills: 0, templateAttempts: 0,
  };
  const maximum = PROCEDURAL_RESTARTS + TEMPLATE_ATTEMPTS;
  let puzzle: PuzzleDocument | undefined;

  const trySlots = async (slots: LayoutSlot[], source: "procedural" | "template") => {
    if (independentCrossingLoops(slots) < MINIMUM_INDEPENDENT_LOOPS) return "skip";
    const prepared = prepareFill(slots, dictionary, options.requireEveryLetter);
    if (!prepared) return "skip";
    if (source === "procedural") diagnostics.proceduralFills += 1;
    const fill = await fillSlots(slots, prepared, random, options, 1_500, cancelled, diversity);
    if (!fill) return "filled";
    const shuffled = random.shuffle(LETTERS.split(""));
    const codeToLetter: Record<number, string> = Object.fromEntries(shuffled.map((letter, index) => [index + 1, letter]));
    const letterToCode = Object.fromEntries(Object.entries(codeToLetter).map(([code, letter]) => [letter, Number(code)]));
    const grid = fill.grid.map((row) => row.map((letter) => letter === null ? null : letterToCode[letter]));
    const frequencies = new Map<number, number>();
    grid.flat().forEach((code) => { if (code !== null) frequencies.set(code, (frequencies.get(code) ?? 0) + 1); });
    const givenCodes = selectGivenCodes(frequencies, codeToLetter, profile.hints, random);
    if (givenCodes.length < profile.hints) return "filled";
    const givens = Object.fromEntries(givenCodes.map((code) => [code, codeToLetter[code]]));
    const solved = solve(grid, givens, solverWords, options.theme !== "general" ? 5000 : profile.maxNodes);
    if (!matchesDifficulty(difficulty, solved.metrics, options)) return "filled";
    puzzle = {
      schemaVersion: 4, generatorVersion: GENERATOR_VERSION, lexiconVersion: lexicon.version,
      puzzleId: hashId(`${seed}:${difficulty}:${optionKey}:${JSON.stringify(grid)}:${JSON.stringify(givens)}`), seed, difficulty,
      theme: options.theme, requireEveryLetter: options.requireEveryLetter, includeProperNames: options.includeProperNames,
      width: WIDTH, height: HEIGHT, grid, givens, measured: solved.metrics,
      solution: { grid: fill.grid, codeToLetter, entries: fill.entries },
    };
    diagnostics.source = source;
    return "accepted";
  };

  try {
    for (let restart = 0; restart < PROCEDURAL_RESTARTS; restart += 1) {
      diagnostics.proceduralRestarts += 1;
      onProgress?.(diagnostics.proceduralRestarts, maximum);
      if (await searchMasks(random, layoutProfile(options), layoutScores, previousLayouts, slice,
        (slots) => trySlots(slots, "procedural"))) return puzzle!;
    }
    diagnostics.fallbackEntered = true;
    const seen = new Set<string>();
    for (const { mask, profile } of templateOrientations(random, options)) {
      const pause = slice();
      if (pause) await pause;
      const pattern = layoutPattern(mask);
      if (seen.has(pattern) || !acceptsLayout(pattern, previousLayouts)) continue;
      seen.add(pattern);
      const assessment = assessBlockMask(mask, profile, dictionary.available);
      if (!assessment.valid || independentCrossingLoops(assessment.slots) < MINIMUM_INDEPENDENT_LOOPS) continue;
      diagnostics.templateAttempts += 1;
      onProgress?.(PROCEDURAL_RESTARTS + diagnostics.templateAttempts, maximum);
      if (await trySlots(assessment.slots, "template") === "accepted") return puzzle!;
      if (diagnostics.templateAttempts >= TEMPLATE_ATTEMPTS) break;
    }
  } finally {
    onDiagnostics?.(diagnostics);
  }
  const guarantee = options.requireEveryLetter ? " met alle 26 letters" : "";
  const subject = options.theme !== "general" ? "dierenpuzzel" : "puzzel";
  throw new Error(`Er kon geen unieke ${subject}${guarantee} worden gemaakt. Probeer het opnieuw.`);
}
