import type { PuzzleDocument } from "../types";

const CELL_SIZE = 10;

export function PrintablePuzzleGrid({ puzzle, solution = false }: { puzzle: PuzzleDocument; solution?: boolean }) {
  return <svg
    className={`print-puzzle-grid${solution ? " print-solution-grid" : ""}`}
    viewBox={`0 0 ${puzzle.width * CELL_SIZE} ${puzzle.height * CELL_SIZE}`}
    role="img"
    aria-label={solution ? "Oplossingsraster" : "Cijfercoderaster"}
    shapeRendering="crispEdges"
  >
    {puzzle.grid.flatMap((row, rowIndex) => row.map((code, columnIndex) => {
      const x = columnIndex * CELL_SIZE;
      const y = rowIndex * CELL_SIZE;
      if (code === null) {
        return <rect className="print-block" data-cell="block" key={`${rowIndex}-${columnIndex}`} x={x} y={y} width={CELL_SIZE} height={CELL_SIZE} fill="#000" />;
      }
      const letter = solution ? puzzle.solution.codeToLetter[code] : puzzle.givens[code] ?? "";
      return <g data-cell="open" key={`${rowIndex}-${columnIndex}`}>
        <rect x={x} y={y} width={CELL_SIZE} height={CELL_SIZE} fill="#fff" stroke="#000" strokeWidth="0.35" />
        {letter && <text className="print-letter" x={x + CELL_SIZE / 2} y={y + CELL_SIZE * 0.58} textAnchor="middle" dominantBaseline="middle">{letter}</text>}
        {!solution && <text className="print-code" x={x + CELL_SIZE - 1} y={y + CELL_SIZE - 1.2} textAnchor="end">{code}</text>}
      </g>;
    }))}
  </svg>;
}
