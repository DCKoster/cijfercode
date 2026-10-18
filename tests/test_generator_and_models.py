import random

import pytest

from cijfercode.errors import GenerationExhausted
from cijfercode.generator import (
    PROFILES,
    _encode_grid,
    _hint_candidates,
    _matches_difficulty,
    _targeted_hard_hints,
    generate_puzzle,
)
from cijfercode.lexicon import Lexicon
from cijfercode.models import Entry, Puzzle, SolveResult, SolverMetrics


def test_encoding_is_bijective_and_seeded():
    letters = (("A", "B", None), ("A", "Y", "J"))
    first = _encode_grid(letters, random.Random(12))
    second = _encode_grid(letters, random.Random(12))
    assert first == second
    grid, code_to_letter, letter_to_code = first
    assert len(code_to_letter) == len(letter_to_code) == 26
    assert grid[0][0] == grid[1][0]
    assert letter_to_code["Y"] != letter_to_code["J"]


def test_hint_counts_and_difficulty_boundaries():
    grid = (tuple(range(1, 14)), tuple(range(1, 14)))
    mapping = {code: chr(64 + code) for code in range(1, 27)}
    for level, profile in PROFILES.items():
        candidates = _hint_candidates(grid, mapping, profile, random.Random(level))
        assert candidates
        assert all(profile.minimum_hints <= len(item) <= profile.maximum_hints for item in candidates)

    assert _matches_difficulty(1, SolverMetrics(1, 10, 0, 0))
    assert _matches_difficulty(3, SolverMetrics(1, 10, 5, 2))
    assert _matches_difficulty(4, SolverMetrics(1, 10, 101, 2))
    assert not _matches_difficulty(4, SolverMetrics(1, 10, 101, 2, exhausted=True))


def test_default_hint_counts_are_exactly_rebalanced():
    assert {
        level: (profile.minimum_hints, profile.maximum_hints)
        for level, profile in PROFILES.items()
    } == {1: (3, 3), 2: (2, 2), 3: (1, 1), 4: (0, 0)}


def test_hint_count_override_is_exact_including_zero():
    grid = (tuple(range(1, 14)), tuple(range(1, 14)))
    mapping = {code: chr(64 + code) for code in range(1, 27)}

    no_hints = _hint_candidates(
        grid, mapping, PROFILES[1], random.Random(1), given_count=0
    )
    three_hints = _hint_candidates(
        grid, mapping, PROFILES[4], random.Random(1), given_count=3
    )

    assert no_hints == [{}]
    assert three_hints
    assert all(len(candidate) == 3 for candidate in three_hints)


def test_targeted_hints_pad_unique_solution_to_exact_count(monkeypatch):
    grid = ((1, 2, 1),)
    solution = (("A", "B", "A"),)
    monkeypatch.setattr(
        "cijfercode.generator.solve_code_grid",
        lambda *_args, **_kwargs: SolveResult(
            (solution,), SolverMetrics(1, 1, 0, 0)
        ),
    )

    result = _targeted_hard_hints(
        grid,
        solution,
        {1: "A", 2: "B"},
        Lexicon.from_words(["ABA"]),
        PROFILES[4],
        given_count=2,
    )

    assert result is not None
    assert result[0] == {1: "A", 2: "B"}


@pytest.mark.parametrize("given_count", [-1, 27, 1.5, True])
def test_generator_rejects_invalid_given_count(given_count):
    with pytest.raises(ValueError, match="given_count"):
        generate_puzzle(
            1,
            "invalid-givens",
            lexicon=Lexicon.from_words(["ABC"]),
            given_count=given_count,
        )


def test_zero_givens_retries_until_the_puzzle_is_unique(monkeypatch):
    solution = tuple(tuple("ABCDEFG") for _ in range(7))
    entries = (Entry(0, 0, "across", 3, "ABC"),)
    fill_calls = 0
    solve_calls = 0

    def fake_fill(*_args, **_kwargs):
        nonlocal fill_calls
        fill_calls += 1
        return solution, entries

    def fake_solve(*_args, **_kwargs):
        nonlocal solve_calls
        solve_calls += 1
        solution_count = 2 if solve_calls == 1 else 1
        return SolveResult(
            (solution,) * solution_count,
            SolverMetrics(solution_count, 1, 0, 0),
        )

    monkeypatch.setattr("cijfercode.generator.generate_freeform_fill", fake_fill)
    monkeypatch.setattr("cijfercode.generator.solve_code_grid", fake_solve)

    puzzle = generate_puzzle(
        4,
        "zero-givens",
        width=7,
        height=7,
        lexicon=Lexicon.from_words(["ABC"]),
        max_attempts=2,
        given_count=0,
    )

    assert puzzle.givens == {}
    assert fill_calls == 2
    assert solve_calls == 2


def test_puzzle_json_can_hide_solution():
    puzzle = Puzzle(
        puzzle_id="abc",
        seed="seed",
        difficulty=1,
        width=3,
        height=1,
        grid=((1, 2, 3),),
        givens={1: "A"},
        measured=SolverMetrics(1, 1, 0, 0),
        lexicon={"sha256": "hash"},
        solution_grid=(("A", "B", "C"),),
        code_to_letter={1: "A", 2: "B", 3: "C"},
        entries=(Entry(0, 0, "across", 3, "ABC"),),
    )
    assert "solution" not in puzzle.to_dict(include_solution=False)
    assert puzzle.to_dict()["solution"]["entries"][0]["word"] == "ABC"


def test_generator_reports_exhaustion(monkeypatch):
    monkeypatch.setattr(
        "cijfercode.generator.generate_freeform_fill",
        lambda *_args, **_kwargs: None,
    )
    with pytest.raises(GenerationExhausted, match="niet met passende woorden"):
        generate_puzzle(1, "seed", lexicon=Lexicon.from_words(["ABC"]), max_attempts=2)


def test_generator_defaults_to_17_by_20_and_accepts_15_by_15(monkeypatch):
    observed: list[tuple[int, int]] = []

    def fake_fill(_lexicon, _rng, *, width, height, **_kwargs):
        observed.append((width, height))
        grid = tuple(tuple("A" for _ in range(width)) for _ in range(height))
        return grid, ()

    monkeypatch.setattr("cijfercode.generator.generate_freeform_fill", fake_fill)
    monkeypatch.setattr(
        "cijfercode.generator.solve_code_grid",
        lambda *_args, **_kwargs: SolveResult((), SolverMetrics(1, 1, 0, 0)),
    )
    lexicon = Lexicon.from_words(["ABC"])
    standard = generate_puzzle(1, "standard", lexicon=lexicon, max_attempts=1)
    legacy = generate_puzzle(
        1, "legacy", width=15, height=15, lexicon=lexicon, max_attempts=1
    )
    assert (standard.width, standard.height) == (17, 20)
    assert (legacy.width, legacy.height) == (15, 15)
    assert observed == [(17, 20), (15, 15)]


@pytest.mark.parametrize("width,height", [(6, 20), (21, 20), (17, 6), (17, 21)])
def test_generator_rejects_unsupported_dimensions(width, height):
    with pytest.raises(ValueError, match="tussen 7 en 20"):
        generate_puzzle(
            1,
            "invalid",
            width=width,
            height=height,
            lexicon=Lexicon.from_words(["ABC"]),
        )


def test_puzzle_rejects_dimension_metadata_that_does_not_match_grid():
    with pytest.raises(ValueError, match="width"):
        Puzzle(
            puzzle_id="broken",
            seed="seed",
            difficulty=1,
            width=2,
            height=1,
            grid=((1, 2, 3),),
            givens={},
            measured=SolverMetrics(1, 0, 0, 0),
            lexicon={},
            solution_grid=(("A", "B", "C"),),
            code_to_letter={1: "A", 2: "B", 3: "C"},
        )
