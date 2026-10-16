from __future__ import annotations

from dataclasses import dataclass

from .grid import extract_entries
from .lexicon import Lexicon
from .models import CodeGrid, LetterGrid, Puzzle, SolveResult, SolverMetrics


@dataclass(slots=True)
class _Counters:
    propagation_steps: int = 0
    search_nodes: int = 0
    max_depth: int = 0
    exhausted: bool = False


def _compatible(
    codes: tuple[int, ...],
    word: str,
    mapping: dict[int, str],
    reverse: dict[str, int],
) -> bool:
    proposed_codes: dict[int, str] = {}
    proposed_letters: dict[str, int] = {}
    for code, letter in zip(codes, word):
        known_letter = mapping.get(code)
        known_code = reverse.get(letter)
        if known_letter is not None and known_letter != letter:
            return False
        if known_code is not None and known_code != code:
            return False
        if proposed_codes.get(code, letter) != letter:
            return False
        if proposed_letters.get(letter, code) != code:
            return False
        proposed_codes[code] = letter
        proposed_letters[letter] = code
    return True


def _pattern(values: tuple[int, ...] | str) -> tuple[int, ...]:
    labels: dict[int | str, int] = {}
    return tuple(labels.setdefault(value, len(labels)) for value in values)


def solve_code_grid(
    grid: CodeGrid,
    givens: dict[int, str],
    lexicon: Lexicon,
    *,
    limit: int = 2,
    max_nodes: int = 5_000,
    minimum_score: float = 0.0,
) -> SolveResult:
    if limit < 1:
        raise ValueError("limit moet minimaal 1 zijn")
    if not grid or not grid[0]:
        raise ValueError("grid mag niet leeg zijn")
    width = len(grid[0])
    if any(len(row) != width for row in grid):
        raise ValueError("grid moet rechthoekig zijn")
    present_codes = {code for row in grid for code in row if code is not None}
    if any(not isinstance(code, int) or not 1 <= code <= 26 for code in present_codes):
        raise ValueError("codes moeten gehele getallen van 1 tot en met 26 zijn")
    if len(set(givens.values())) != len(givens):
        raise ValueError("givens moeten een één-op-éénmapping vormen")
    if any(
        code not in present_codes
        or not isinstance(letter, str)
        or len(letter) != 1
        or letter.upper() not in "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        for code, letter in givens.items()
    ):
        raise ValueError("iedere hint moet een aanwezige code aan één letter A-Z koppelen")

    layout = tuple(tuple(cell is not None for cell in row) for row in grid)
    entries = extract_entries(layout)
    entry_codes = tuple(
        tuple(grid[row][column] for row, column in entry.cells()) for entry in entries
    )
    if any(code is None for codes in entry_codes for code in codes):
        raise ValueError("woordposities mogen geen blokkades bevatten")
    typed_codes = tuple(tuple(int(code) for code in codes) for codes in entry_codes)
    pools = {
        length: lexicon.candidates(length, minimum_score)
        for length in {entry.length for entry in entries}
    }
    base_domains = {
        index: tuple(
            word for word in pools[len(codes)] if _pattern(word) == _pattern(codes)
        )
        for index, codes in enumerate(typed_codes)
    }
    counters = _Counters()
    solutions: list[LetterGrid] = []

    def assign(
        codes: tuple[int, ...],
        word: str,
        mapping: dict[int, str],
        reverse: dict[str, int],
    ) -> None:
        for code, letter in zip(codes, word):
            mapping[code] = letter
            reverse[letter] = code

    def record(mapping: dict[int, str]) -> None:
        decoded: LetterGrid = tuple(
            tuple(None if code is None else mapping.get(code, "?") for code in row)
            for row in grid
        )
        if decoded not in solutions:
            solutions.append(decoded)

    def search(
        mapping: dict[int, str],
        reverse: dict[str, int],
        assigned: set[int],
        used: set[str],
        domains: dict[int, tuple[str, ...]],
        depth: int,
    ) -> None:
        if len(solutions) >= limit:
            return
        if counters.search_nodes >= max_nodes:
            counters.exhausted = True
            return
        mapping, reverse, assigned, used, domains = (
            mapping.copy(),
            reverse.copy(),
            assigned.copy(),
            used.copy(),
            domains.copy(),
        )
        while True:
            if len(assigned) == len(entries):
                record(mapping)
                return
            choices: list[tuple[int, tuple[str, ...]]] = []
            forced: tuple[int, str] | None = None
            for index in range(len(entries)):
                if index in assigned:
                    continue
                candidates = tuple(
                    word
                    for word in domains[index]
                    if word not in used
                    and _compatible(typed_codes[index], word, mapping, reverse)
                )
                if not candidates:
                    return
                domains[index] = candidates
                choices.append((index, candidates))
                if len(candidates) == 1:
                    forced = (index, candidates[0])
                    break
            if forced is None:
                break
            index, word = forced
            assign(typed_codes[index], word, mapping, reverse)
            assigned.add(index)
            used.add(word)
            counters.propagation_steps += 1

        index, candidates = min(choices, key=lambda item: len(item[1]))
        for word in candidates:
            if len(solutions) >= limit:
                break
            if counters.search_nodes >= max_nodes:
                counters.exhausted = True
                break
            counters.search_nodes += 1
            counters.max_depth = max(counters.max_depth, depth + 1)
            next_mapping, next_reverse = mapping.copy(), reverse.copy()
            assign(typed_codes[index], word, next_mapping, next_reverse)
            next_domains = domains.copy()
            next_domains[index] = (word,)
            search(
                next_mapping,
                next_reverse,
                assigned | {index},
                used | {word},
                next_domains,
                depth + 1,
            )

    initial_mapping = {int(code): letter.upper() for code, letter in givens.items()}
    initial_reverse = {letter: code for code, letter in initial_mapping.items()}
    search(initial_mapping, initial_reverse, set(), set(), base_domains, 0)
    metrics = SolverMetrics(
        solutions=len(solutions),
        propagation_steps=counters.propagation_steps,
        search_nodes=counters.search_nodes,
        max_depth=counters.max_depth,
        exhausted=counters.exhausted,
    )
    return SolveResult(tuple(solutions), metrics)


def solve_puzzle(
    puzzle: Puzzle,
    lexicon: Lexicon | None = None,
    *,
    limit: int = 2,
    max_nodes: int = 5_000,
) -> SolveResult:
    active_lexicon = lexicon or Lexicon.from_cache()
    minimum_score = float(puzzle.lexicon.get("minimum_score", 0.0))
    return solve_code_grid(
        puzzle.grid,
        puzzle.givens,
        active_lexicon,
        limit=limit,
        max_nodes=max_nodes,
        minimum_score=minimum_score,
    )
