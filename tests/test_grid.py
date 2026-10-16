import random
import string

from cijfercode.grid import (
    extract_entries,
    fill_layout,
    generate_freeform_fill,
    generate_layout,
    validate_layout,
)
from cijfercode.lexicon import Lexicon


def test_generated_layout_obeys_invariants():
    for seed in range(5):
        layout = generate_layout(random.Random(seed))
        blocks = sum(not cell for row in layout for cell in row)
        assert len(layout) == 15
        assert all(len(row) == 15 for row in layout)
        assert 34 <= blocks <= 50
        assert validate_layout(layout)
        assert all(entry.length >= 3 for entry in extract_entries(layout))


def test_constraint_filler_respects_crossings_and_no_duplicates():
    layout = tuple(tuple(True for _ in range(3)) for _ in range(3))
    lexicon = Lexicon.from_words(["ABC", "DEF", "GHI", "ADG", "BEH", "CFI"])
    result = fill_layout(layout, lexicon, random.Random(7), minimum_score=0)

    assert result is not None
    grid, entries = result
    words = [entry.word for entry in entries]
    assert len(words) == len(set(words)) == 6
    assert validate_layout(tuple(tuple(cell is not None for cell in row) for row in grid))
    for entry in entries:
        assert "".join(grid[row][column] for row, column in entry.cells()) == entry.word


def test_freeform_fill_supports_rectangular_grids():
    source = random.Random(91)
    words = {
        "".join(source.choice(string.ascii_uppercase) for _ in range(length))
        for length in range(3, 21)
        for _ in range(250)
    }
    result = generate_freeform_fill(
        Lexicon.from_words(words),
        random.Random(7),
        width=17,
        height=20,
        minimum_score=0,
        target_entries=12,
        minimum_entries=8,
    )
    assert result is not None
    grid, entries = result
    assert len(grid) == 20
    assert all(len(row) == 17 for row in grid)
    assert all(entry.length <= (17 if entry.direction == "across" else 20) for entry in entries)
