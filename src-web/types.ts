export type Difficulty = 1 | 2 | 3 | 4;
export type Theme = "general" | "animals_familiar" | "animals_all";
export type StoredTheme = Theme | "animals";

export function normalizeTheme(theme: StoredTheme | string | undefined): Theme {
  if (theme === "animals") return "animals_all";
  if (theme === "animals_familiar" || theme === "animals_all") return theme;
  return "general";
}

export function themeLabel(theme: StoredTheme | string | undefined): string | null {
  const normalized = normalizeTheme(theme);
  if (normalized === "animals_familiar") return "Bekende dieren";
  if (normalized === "animals_all") return "Alle dieren";
  return null;
}
export interface GenerationOptions {
  theme: Theme;
  requireEveryLetter: boolean;
  includeProperNames: boolean;
}
export type Cell = number | null;
export type LetterCell = string | null;

export interface Entry {
  row: number;
  column: number;
  direction: "across" | "down";
  length: number;
  word: string;
}

export interface SolverMetrics {
  solutions: number;
  propagationSteps: number;
  searchNodes: number;
  maxDepth: number;
  exhausted: boolean;
}

export interface PuzzleDocument {
  schemaVersion: 4;
  generatorVersion: "web-3";
  lexiconVersion: string;
  puzzleId: string;
  seed: string;
  difficulty: Difficulty;
  theme: Theme;
  requireEveryLetter: boolean;
  includeProperNames: boolean;
  width: 17;
  height: 20;
  grid: Cell[][];
  givens: Record<number, string>;
  measured: SolverMetrics;
  solution: {
    grid: LetterCell[][];
    codeToLetter: Record<number, string>;
    entries: Entry[];
  };
}

export interface LexiconData {
  version: string;
  sourceUrl: string;
  generatedAt: string;
  words: Record<string, Array<[string, number]>>;
  properNames: string[];
  themes: {
    animals: {
      sourceUrl: string;
      license: string;
      words: Record<string, Array<[string, number]>>;
      familiarWords: Record<string, Array<[string, number]>>;
    };
  };
}

export interface BookletSpec {
  title: string;
  counts: Record<Difficulty, number>;
  theme?: Theme;
  requireEveryLetter?: boolean;
  includeProperNames?: boolean;
}

export type WorkerRequest =
  | { type: "generate"; requestId: string; difficulty: Difficulty; options: GenerationOptions; seed: string }
  | { type: "cancel"; requestId: string };

export type WorkerResponse =
  | { type: "progress"; requestId: string; attempt: number; maximum: number }
  | { type: "result"; requestId: string; puzzle: PuzzleDocument }
  | { type: "error"; requestId: string; message: string }
  | { type: "cancelled"; requestId: string };
