import type { PuzzleDocument } from "../types";
import { difficultyName } from "./DifficultyPicker";
import { PrintablePuzzleGrid } from "./PrintablePuzzleGrid";

export interface PrintJob { title?: string; puzzles: PuzzleDocument[]; cover: boolean }

export function PrintDocument({ job }: { job: PrintJob | null }) {
  if (!job) return null;
  const answerPages = Array.from({ length: Math.ceil(job.puzzles.length / 4) }, (_, page) => job.puzzles.slice(page * 4, page * 4 + 4));
  return <div className="print-document">
    {job.cover && <section className="print-page cover"><div><p>Cijfercode</p><h1>{job.title || "Mijn puzzelboek"}</h1><span>{job.puzzles.length} Nederlandse cijfercodepuzzels</span></div></section>}
    {job.puzzles.map((puzzle, index) => <section className="print-page puzzle-sheet" key={puzzle.puzzleId}>
      <header><div><p>Cijfercode</p><h1>Puzzel {index + 1}</h1></div><span>Niveau {puzzle.difficulty} · {difficultyName(puzzle.difficulty)}</span></header>
      <PrintablePuzzleGrid puzzle={puzzle} />
      <div className="print-key">{Array.from({ length: 26 }, (_, offset) => offset + 1).map((code) => <span key={code}><small>{code}</small><strong>{puzzle.givens[code] ?? ""}</strong></span>)}</div>
      <footer>{index + 1}</footer>
    </section>)}
    {answerPages.map((puzzles, page) => <section className="print-page answers" key={`answers-${page}`}>
      <header><div><p>Cijfercode</p><h1>Oplossingen</h1></div><span>{page + 1} / {answerPages.length}</span></header>
      <div className="answer-grid">{puzzles.map((puzzle, offset) => <article key={puzzle.puzzleId}><h2>Puzzel {page * 4 + offset + 1} · Niveau {puzzle.difficulty}</h2><PrintablePuzzleGrid puzzle={puzzle} solution /></article>)}</div>
    </section>)}
  </div>;
}
