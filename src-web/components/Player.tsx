import { useEffect, useMemo, useState } from "react";
import type { PuzzleDocument } from "../types";
import { PuzzleGrid } from "./PuzzleGrid";

export interface PlayerState { puzzleId: string; mapping: Record<number, string> }

export function Player({ puzzle, saved, onSave, onPrint }: { puzzle: PuzzleDocument; saved?: PlayerState; onSave: (state: PlayerState) => void; onPrint: () => void }) {
  const [mapping, setMapping] = useState<Record<number, string>>(() => saved?.puzzleId === puzzle.puzzleId ? saved.mapping : { ...puzzle.givens });
  const [selected, setSelected] = useState<number | null>(() => Number(Object.keys(puzzle.givens)[0]) || puzzle.grid.flat().find((cell) => cell !== null) || null);
  const [incorrect, setIncorrect] = useState<Set<number>>(new Set());
  const [notice, setNotice] = useState("");
  const usedCodes = useMemo(() => new Set(puzzle.grid.flat().filter((cell): cell is number => cell !== null)), [puzzle]);
  const complete = Array.from(usedCodes).every((code) => mapping[code] === puzzle.solution.codeToLetter[code]);

  useEffect(() => { onSave({ puzzleId: puzzle.puzzleId, mapping }); }, [mapping, onSave, puzzle.puzzleId]);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (selected === null || puzzle.givens[selected]) return;
      if (event.key === "Backspace" || event.key === "Delete") { setMapping((current) => { const next = { ...current }; delete next[selected]; return next; }); setIncorrect(new Set()); return; }
      const letter = event.key.toUpperCase();
      if (!/^[A-Z]$/.test(letter)) return;
      const occupied = Object.entries(mapping).find(([code, value]) => value === letter && Number(code) !== selected);
      if (occupied) { setNotice(`De letter ${letter} hoort al bij code ${occupied[0]}.`); return; }
      setNotice(""); setIncorrect(new Set()); setMapping((current) => ({ ...current, [selected]: letter }));
    };
    window.addEventListener("keydown", handleKey); return () => window.removeEventListener("keydown", handleKey);
  }, [mapping, puzzle.givens, selected]);

  const check = () => setIncorrect(new Set(Array.from(usedCodes).filter((code) => mapping[code] && mapping[code] !== puzzle.solution.codeToLetter[code])));
  const revealLetter = () => {
    if (selected === null || puzzle.givens[selected] || !confirm("De letter voor deze code onthullen?")) return;
    setMapping((current) => {
      const next = { ...current };
      const answer = puzzle.solution.codeToLetter[selected];
      const occupied = Object.entries(next).find(([code, letter]) => letter === answer && Number(code) !== selected);
      if (occupied && !puzzle.givens[Number(occupied[0])]) delete next[Number(occupied[0])];
      next[selected] = answer;
      return next;
    });
    setIncorrect(new Set());
  };
  const revealAll = () => { if (confirm("De volledige oplossing tonen?")) { setMapping({ ...puzzle.solution.codeToLetter }); setIncorrect(new Set()); } };

  return <section className="player card">
    <div className="puzzle-heading"><div><p className="eyebrow">Niveau {puzzle.difficulty}</p><h2>Puzzel {puzzle.puzzleId}</h2></div><button className="text-button" onClick={onPrint}>Afdrukken</button></div>
    <p className="instructions">Selecteer een vakje en typ een letter. De letter verschijnt automatisch bij dezelfde code.</p>
    {complete && <div className="success" role="status"><strong>Goed gedaan!</strong> De cijfercode is opgelost.</div>}
    {notice && <p className="notice" role="status">{notice}</p>}
    <PuzzleGrid puzzle={puzzle} mapping={mapping} selected={selected} incorrect={incorrect} onSelect={setSelected} />
    <div className="alphabet" aria-label="Letteroverzicht">{"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => {
      const code = Object.entries(mapping).find(([, value]) => value === letter)?.[0];
      return <span key={letter}><strong>{letter}</strong><small>{code ?? "–"}</small></span>;
    })}</div>
    <div className="actions"><button onClick={check}>Controleren</button><button className="secondary" onClick={revealLetter}>Letter onthullen</button><button className="secondary" onClick={revealAll}>Oplossing tonen</button></div>
  </section>;
}
