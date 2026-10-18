import type { PuzzleDocument } from "../types";

export function PuzzleGrid({ puzzle, mapping, selected, incorrect = new Set(), interactive = true, solution = false, onSelect }: {
  puzzle: PuzzleDocument;
  mapping: Record<number, string>;
  selected?: number | null;
  incorrect?: Set<number>;
  interactive?: boolean;
  solution?: boolean;
  onSelect?: (code: number) => void;
}) {
  return <div className={`puzzle-grid${solution ? " solution-grid" : ""}`} style={{ "--columns": puzzle.width } as React.CSSProperties} role="grid" aria-label={solution ? "Oplossing" : "Cijfercoderaster"}>
    {puzzle.grid.flatMap((row, rowIndex) => row.map((code, columnIndex) => {
      if (code === null) return <span className="cell block" key={`${rowIndex}-${columnIndex}`} aria-hidden="true" />;
      const letter = solution ? puzzle.solution.codeToLetter[code] : mapping[code] ?? "";
      const className = ["cell", selected === code ? "selected-code" : "", puzzle.givens[code] ? "given" : "", incorrect.has(code) ? "incorrect" : ""].filter(Boolean).join(" ");
      return <button type="button" role="gridcell" tabIndex={interactive ? 0 : -1} disabled={!interactive} className={className} key={`${rowIndex}-${columnIndex}`} onClick={() => onSelect?.(code)} aria-label={`Code ${code}${letter ? `, letter ${letter}` : ""}`}>
        <span className="letter">{letter}</span>{!solution && <span className="code">{code}</span>}
      </button>;
    }))}
  </div>;
}
