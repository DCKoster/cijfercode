from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, TypeAlias

LetterGrid: TypeAlias = tuple[tuple[str | None, ...], ...]
CodeGrid: TypeAlias = tuple[tuple[int | None, ...], ...]


@dataclass(frozen=True, slots=True)
class Entry:
    row: int
    column: int
    direction: str
    length: int
    word: str | None = None

    def cells(self) -> tuple[tuple[int, int], ...]:
        dr, dc = ((0, 1) if self.direction == "across" else (1, 0))
        return tuple((self.row + dr * i, self.column + dc * i) for i in range(self.length))


@dataclass(frozen=True, slots=True)
class SolverMetrics:
    solutions: int
    propagation_steps: int
    search_nodes: int
    max_depth: int
    exhausted: bool = False

    def to_dict(self) -> dict[str, int | bool]:
        return {
            "solutions": self.solutions,
            "propagation_steps": self.propagation_steps,
            "search_nodes": self.search_nodes,
            "max_depth": self.max_depth,
            "exhausted": self.exhausted,
        }


@dataclass(frozen=True, slots=True)
class SolveResult:
    solutions: tuple[LetterGrid, ...]
    metrics: SolverMetrics


@dataclass(frozen=True, slots=True)
class Puzzle:
    puzzle_id: str
    seed: str
    difficulty: int
    width: int
    height: int
    grid: CodeGrid
    givens: dict[int, str]
    measured: SolverMetrics
    lexicon: dict[str, Any]
    solution_grid: LetterGrid
    code_to_letter: dict[int, str]
    entries: tuple[Entry, ...] = field(default_factory=tuple)

    def __post_init__(self) -> None:
        if self.height != len(self.grid) or self.height != len(self.solution_grid):
            raise ValueError("height komt niet overeen met het raster")
        if any(len(row) != self.width for row in self.grid) or any(
            len(row) != self.width for row in self.solution_grid
        ):
            raise ValueError("width komt niet overeen met het raster")

    def to_dict(self, *, include_solution: bool = True) -> dict[str, Any]:
        result: dict[str, Any] = {
            "schema_version": 1,
            "puzzle_id": self.puzzle_id,
            "seed": self.seed,
            "width": self.width,
            "height": self.height,
            "difficulty": {
                "requested": self.difficulty,
                "measured": self.measured.to_dict(),
            },
            "grid": [list(row) for row in self.grid],
            "givens": {str(code): letter for code, letter in sorted(self.givens.items())},
            "lexicon": self.lexicon,
        }
        if include_solution:
            result["solution"] = {
                "grid": [list(row) for row in self.solution_grid],
                "code_to_letter": {
                    str(code): letter for code, letter in sorted(self.code_to_letter.items())
                },
                "entries": [
                    {
                        "row": entry.row,
                        "column": entry.column,
                        "direction": entry.direction,
                        "length": entry.length,
                        "word": entry.word,
                    }
                    for entry in self.entries
                ],
            }
        return result
