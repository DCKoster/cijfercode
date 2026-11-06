import { themeLabel, type PuzzleDocument } from "../types";
import { difficultyName } from "./DifficultyPicker";
import { PrintablePuzzleGrid } from "./PrintablePuzzleGrid";

export interface PrintJob { title?: string; puzzles: PuzzleDocument[]; cover: boolean }

export function PrintDocument({ job }: { job: PrintJob | null }) {
  if (!job) return null;
  const answerPages = Array.from({ length: Math.ceil(job.puzzles.length / 4) }, (_, page) => job.puzzles.slice(page * 4, page * 4 + 4));
  const levels = Array.from(new Set(job.puzzles.map((puzzle) => puzzle.difficulty))).sort((a, b) => a - b);
  const themes = Array.from(new Set(job.puzzles.map((puzzle) => themeLabel(puzzle.theme))));
  return <div className="print-document">
    {job.cover && <section className="print-page cover">
      <div className="cover-rail" aria-hidden="true">
        <div className="cover-code-grid">{[3, 9, 10, 6, 5, 18].map((code) => <span key={code}>{code}</span>)}</div>
        <span className="cover-edition">PUZZELBOEK</span>
      </div>
      <div className="cover-content">
        <p className="cover-kicker">Cijfercode</p>
        <h1>{job.title || "Mijn puzzelboek"}</h1>
        <p className="cover-intro">Nederlandse woordpuzzels waarin elk cijfer voor een letter staat.</p>
        <div className="cover-meta">
          <span><strong>{job.puzzles.length}</strong>{job.puzzles.length === 1 ? "puzzel" : "puzzels"}</span>
          <span><strong>{levels.length === 1 ? `Niveau ${levels[0]}` : `Niveaus ${levels.join(", ")}`}</strong>{levels.length === 1 ? "moeilijkheid" : "moeilijkheden"}</span>
        </div>
        <div className="cover-themes" aria-label="Thema's">{themes.map((theme) => <span key={theme}>{theme}</span>)}</div>
      </div>
    </section>}
    {job.puzzles.map((puzzle, index) => <section className="print-page puzzle-sheet" key={puzzle.puzzleId}>
      <header><div><p>Cijfercode</p><h1>Puzzel {index + 1}</h1></div><span>Niveau {puzzle.difficulty} · {difficultyName(puzzle.difficulty)} · {themeLabel(puzzle.theme)}{puzzle.requireEveryLetter ? " · A–Z" : ""}</span></header>
      <PrintablePuzzleGrid puzzle={puzzle} />
      <div className="print-key">{Array.from({ length: 26 }, (_, offset) => offset + 1).map((code) => <span key={code}><small>{code}</small><strong>{puzzle.givens[code] ?? ""}</strong></span>)}</div>
      <footer>{index + 1}</footer>
    </section>)}
    {answerPages.map((puzzles, page) => <section className="print-page answers" key={`answers-${page}`}>
      <header><div><p>Cijfercode</p><h1>Oplossingen</h1></div><span>{page + 1} / {answerPages.length}</span></header>
      <div className="answer-grid">{puzzles.map((puzzle, offset) => <article key={puzzle.puzzleId}><h2>Puzzel {page * 4 + offset + 1} · Niveau {puzzle.difficulty} · {themeLabel(puzzle.theme)}</h2><PrintablePuzzleGrid puzzle={puzzle} solution /></article>)}</div>
    </section>)}
  </div>;
}
