export type Difficulty = 1 | 2 | 3 | 4;
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
  schemaVersion: 3;
  generatorVersion: "web-2";
  lexiconVersion: string;
  puzzleId: string;
  seed: string;
  difficulty: Difficulty;
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
}

export interface BookletSpec {
  title: string;
  counts: Record<Difficulty, number>;
}

export type WorkerRequest =
  | { type: "generate"; requestId: string; difficulty: Difficulty; seed: string }
  | { type: "cancel"; requestId: string };

export type WorkerResponse =
  | { type: "progress"; requestId: string; attempt: number; maximum: number }
  | { type: "result"; requestId: string; puzzle: PuzzleDocument }
  | { type: "error"; requestId: string; message: string }
  | { type: "cancelled"; requestId: string };
