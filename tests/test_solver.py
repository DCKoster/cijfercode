from cijfercode.lexicon import Lexicon
from cijfercode.solver import solve_code_grid

WORDS = ["ABC", "DEF", "GHI", "ADG", "BEH", "CFI"]
GRID = ((1, 2, 3), (4, 5, 6), (7, 8, 9))


def test_solver_finds_given_unique_solution_without_branching():
    lexicon = Lexicon.from_words(WORDS)
    givens = {code: chr(64 + code) for code in range(1, 10)}
    result = solve_code_grid(GRID, givens, lexicon)

    assert result.metrics.solutions == 1
    assert result.metrics.search_nodes == 0
    assert not result.metrics.exhausted
    assert result.solutions[0] == (
        ("A", "B", "C"),
        ("D", "E", "F"),
        ("G", "H", "I"),
    )


def test_solver_stops_after_second_solution():
    result = solve_code_grid(GRID, {}, Lexicon.from_words(WORDS), limit=2)
    assert result.metrics.solutions == 2
    assert len(result.solutions) == 2


def test_solver_rejects_non_bijective_givens():
    try:
        solve_code_grid(GRID, {1: "A", 2: "A"}, Lexicon.from_words(WORDS))
    except ValueError as error:
        assert "één-op-éénmapping" in str(error)
    else:
        raise AssertionError("niet-bijectieve hints moeten worden geweigerd")


def test_solver_validates_grid_and_hint_values():
    lexicon = Lexicon.from_words(WORDS)
    for grid, givens in ((((1, 2), (3,)), {}), (GRID, {1: "IJ"}), (GRID, {27: "Z"})):
        try:
            solve_code_grid(grid, givens, lexicon)
        except ValueError:
            pass
        else:
            raise AssertionError("ongeldige puzzeldata moet worden geweigerd")
