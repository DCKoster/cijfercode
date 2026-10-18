from __future__ import annotations

import hashlib
import random
import secrets
import string
from dataclasses import dataclass

from .errors import GenerationExhausted
from .grid import generate_freeform_fill
from .lexicon import Lexicon
from .models import CodeGrid, Puzzle, SolverMetrics
from .solver import solve_code_grid


@dataclass(frozen=True, slots=True)
class DifficultyProfile:
    minimum_score: float
    minimum_hints: int
    maximum_hints: int
    maximum_search_nodes: int


PROFILES = {
    1: DifficultyProfile(4.0, 3, 3, 100),
    2: DifficultyProfile(3.5, 2, 2, 250),
    3: DifficultyProfile(3.0, 1, 1, 1_000),
    4: DifficultyProfile(2.0, 0, 0, 5_000),
}

MINIMUM_GRID_SIZE = 7
MAXIMUM_GRID_SIZE = 20


def _matches_difficulty(level: int, metrics: SolverMetrics) -> bool:
    if metrics.solutions != 1 or metrics.exhausted:
        return False
    if level == 1:
        return metrics.search_nodes <= 20 and metrics.max_depth <= 1
    if level == 2:
        return metrics.search_nodes <= 100 and metrics.max_depth <= 2
    if level == 3:
        return metrics.search_nodes <= 1_000
    return metrics.search_nodes <= 5_000


def _encode_grid(
    letter_grid: tuple[tuple[str | None, ...], ...], rng: random.Random
) -> tuple[CodeGrid, dict[int, str], dict[str, int]]:
    letters = list(string.ascii_uppercase)
    rng.shuffle(letters)
    code_to_letter = {code: letter for code, letter in enumerate(letters, 1)}
    letter_to_code = {letter: code for code, letter in code_to_letter.items()}
    grid: CodeGrid = tuple(
        tuple(None if letter is None else letter_to_code[letter] for letter in row)
        for row in letter_grid
    )
    return grid, code_to_letter, letter_to_code


def _hint_candidates(
    grid: CodeGrid,
    code_to_letter: dict[int, str],
    profile: DifficultyProfile,
    rng: random.Random,
    *,
    given_count: int | None = None,
) -> list[dict[int, str]]:
    used_codes = sorted({code for row in grid for code in row if code is not None})
    frequencies = {code: sum(row.count(code) for row in grid) for code in used_codes}
    results: list[dict[int, str]] = []
    minimum_hints = profile.minimum_hints if given_count is None else given_count
    maximum_hints = profile.maximum_hints if given_count is None else given_count
    for count in range(maximum_hints, minimum_hints - 1, -1):
        if given_count is not None and count > len(used_codes):
            continue
        for _ in range(1 if count == 0 else 4):
            ranked = sorted(
                used_codes,
                key=lambda code: -(frequencies[code] + rng.random() * 4),
            )
            selected = ranked[:count]
            results.append({code: code_to_letter[code] for code in selected})
    return results


def _targeted_hard_hints(
    grid: CodeGrid,
    solution_grid: tuple[tuple[str | None, ...], ...],
    code_to_letter: dict[int, str],
    lexicon: Lexicon,
    profile: DifficultyProfile,
    *,
    given_count: int | None = None,
) -> tuple[dict[int, str], SolverMetrics] | None:
    """Kies hints die aantoonbaar een alternatieve oplossing uitsluiten."""
    givens: dict[int, str] = {}
    last_metrics: SolverMetrics | None = None
    minimum_hints = profile.minimum_hints if given_count is None else given_count
    maximum_hints = profile.maximum_hints if given_count is None else given_count
    used_codes = sorted({code for row in grid for code in row if code is not None})
    frequencies = {code: sum(row.count(code) for row in grid) for code in used_codes}
    while len(givens) <= maximum_hints:
        result = solve_code_grid(
            grid,
            givens,
            lexicon,
            limit=2,
            max_nodes=profile.maximum_search_nodes,
            minimum_score=profile.minimum_score,
        )
        last_metrics = result.metrics
        if result.metrics.solutions == 1 and not result.metrics.exhausted:
            if len(givens) >= minimum_hints:
                return givens, result.metrics
            remaining_codes = [code for code in used_codes if code not in givens]
            if not remaining_codes:
                break
            chosen = max(
                remaining_codes,
                key=lambda code: (frequencies[code], -code),
            )
            givens[chosen] = code_to_letter[chosen]
            continue
        if len(givens) == maximum_hints or len(result.solutions) < 2:
            break
        alternative = next(
            (solution for solution in result.solutions if solution != solution_grid),
            None,
        )
        if alternative is None:
            break
        differing_codes = {
            code
            for row_index, row in enumerate(grid)
            for column_index, code in enumerate(row)
            if code is not None
            and code not in givens
            and alternative[row_index][column_index]
            != solution_grid[row_index][column_index]
        }
        if not differing_codes:
            break
        chosen = max(
            differing_codes,
            key=lambda code: (frequencies[code], -code),
        )
        givens[chosen] = code_to_letter[chosen]
    if (
        last_metrics is not None
        and minimum_hints <= len(givens) <= maximum_hints
        and _matches_difficulty(4, last_metrics)
    ):
        return givens, last_metrics
    return None


def generate_puzzle(
    difficulty: int,
    seed: int | str | None = None,
    *,
    width: int = 17,
    height: int = 20,
    lexicon: Lexicon | None = None,
    max_attempts: int = 200,
    given_count: int | None = None,
) -> Puzzle:
    if difficulty not in PROFILES:
        raise ValueError("difficulty moet 1, 2, 3 of 4 zijn")
    if max_attempts < 1:
        raise ValueError("max_attempts moet minimaal 1 zijn")
    if given_count is not None and (
        isinstance(given_count, bool)
        or not isinstance(given_count, int)
        or not 0 <= given_count <= 26
    ):
        raise ValueError("given_count moet een geheel getal tussen 0 en 26 zijn")
    if not MINIMUM_GRID_SIZE <= width <= MAXIMUM_GRID_SIZE:
        raise ValueError("width moet tussen 7 en 20 liggen")
    if not MINIMUM_GRID_SIZE <= height <= MAXIMUM_GRID_SIZE:
        raise ValueError("height moet tussen 7 en 20 liggen")
    active_lexicon = lexicon or Lexicon.from_cache()
    seed_text = str(seed if seed is not None else secrets.token_hex(16))
    rng = random.Random(f"cijfercode-v3:{seed_text}:{difficulty}:{width}x{height}")
    profile = PROFILES[difficulty]
    last_reason = "onbekend"

    for _attempt in range(1, max_attempts + 1):
        filled = generate_freeform_fill(
            active_lexicon,
            rng,
            width=width,
            height=height,
            minimum_score=profile.minimum_score,
        )
        if filled is None:
            last_reason = "raster kon niet met passende woorden worden gevuld"
            continue
        solution_grid, entries = filled
        if difficulty == 4:
            rare = sum(active_lexicon.score(entry.word or "") < 2.0 for entry in entries)
            if rare / len(entries) > 0.25:
                last_reason = "meer dan 25% van de woorden is zeldzaam"
                continue

        code_grid, code_to_letter, _letter_to_code = _encode_grid(solution_grid, rng)
        used_code_count = len(
            {code for row in code_grid for code in row if code is not None}
        )
        if given_count is not None and given_count > used_code_count:
            last_reason = (
                f"raster bevat minder dan {given_count} verschillende letters"
            )
            continue
        if difficulty == 4:
            targeted = _targeted_hard_hints(
                code_grid,
                solution_grid,
                code_to_letter,
                active_lexicon,
                profile,
                given_count=given_count,
            )
            candidate_results = [targeted] if targeted is not None else []
        else:
            candidate_results = []
            for givens in _hint_candidates(
                code_grid,
                code_to_letter,
                profile,
                rng,
                given_count=given_count,
            ):
                solved = solve_code_grid(
                    code_grid,
                    givens,
                    active_lexicon,
                    limit=2,
                    max_nodes=profile.maximum_search_nodes,
                    minimum_score=profile.minimum_score,
                )
                candidate_results.append((givens, solved.metrics))
                if _matches_difficulty(difficulty, solved.metrics):
                    break
        if not candidate_results:
            last_reason = (
                "geen unieke oplossing met het gevraagde aantal hints"
                if given_count is not None
                else "geen geschikte hintcombinatie gevonden"
            )
        for givens, metrics in candidate_results:
            if not _matches_difficulty(difficulty, metrics):
                last_reason = "uniekheid of gemeten moeilijkheid valt buiten het profiel"
                continue
            identity = hashlib.sha256(
                repr(
                    (
                        seed_text,
                        difficulty,
                        width,
                        height,
                        code_grid,
                        sorted(givens.items()),
                        active_lexicon.metadata.sha256,
                    )
                ).encode()
            ).hexdigest()[:16]
            lexicon_data = active_lexicon.metadata.to_dict()
            lexicon_data["minimum_score"] = profile.minimum_score
            return Puzzle(
                puzzle_id=identity,
                seed=seed_text,
                difficulty=difficulty,
                width=len(code_grid[0]),
                height=len(code_grid),
                grid=code_grid,
                givens=givens,
                measured=metrics,
                lexicon=lexicon_data,
                solution_grid=solution_grid,
                code_to_letter=code_to_letter,
                entries=entries,
            )

    raise GenerationExhausted(max_attempts, last_reason)
