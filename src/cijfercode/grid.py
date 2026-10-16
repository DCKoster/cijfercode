from __future__ import annotations

import random
from collections import deque
from dataclasses import replace
from typing import Iterable, TypeAlias

from .lexicon import Lexicon
from .models import Entry, LetterGrid

Layout: TypeAlias = tuple[tuple[bool, ...], ...]


def extract_entries(layout: Layout) -> tuple[Entry, ...]:
    height, width = len(layout), len(layout[0])
    entries: list[Entry] = []
    for row in range(height):
        column = 0
        while column < width:
            if layout[row][column] and (column == 0 or not layout[row][column - 1]):
                end = column
                while end < width and layout[row][end]:
                    end += 1
                if end - column >= 3:
                    entries.append(Entry(row, column, "across", end - column))
                column = end
            else:
                column += 1
    for column in range(width):
        row = 0
        while row < height:
            if layout[row][column] and (row == 0 or not layout[row - 1][column]):
                end = row
                while end < height and layout[end][column]:
                    end += 1
                if end - row >= 3:
                    entries.append(Entry(row, column, "down", end - row))
                row = end
            else:
                row += 1
    return tuple(entries)


def _runs_are_valid(lines: Iterable[Iterable[bool]]) -> bool:
    for line in lines:
        run = 0
        for open_cell in (*line, False):
            if open_cell:
                run += 1
            else:
                if run in (1, 2):
                    return False
                run = 0
    return True


def validate_layout(layout: Layout, *, require_symmetry: bool = True) -> bool:
    if not layout or not layout[0] or any(len(row) != len(layout[0]) for row in layout):
        return False
    height, width = len(layout), len(layout[0])
    if require_symmetry and any(
        layout[row][column] != layout[height - 1 - row][width - 1 - column]
        for row in range(height)
        for column in range(width)
    ):
        return False
    if not _runs_are_valid(layout):
        return False
    if not _runs_are_valid(zip(*layout)):
        return False

    open_cells = {
        (row, column)
        for row in range(height)
        for column in range(width)
        if layout[row][column]
    }
    if not open_cells:
        return False
    visited = {next(iter(open_cells))}
    pending = deque(visited)
    while pending:
        row, column = pending.popleft()
        for candidate in ((row - 1, column), (row + 1, column), (row, column - 1), (row, column + 1)):
            if candidate in open_cells and candidate not in visited:
                visited.add(candidate)
                pending.append(candidate)
    if visited != open_cells:
        return False

    covered: dict[tuple[int, int], int] = {cell: 0 for cell in open_cells}
    for entry in extract_entries(layout):
        for cell in entry.cells():
            covered[cell] += 1
    return all(count == 2 for count in covered.values())


def generate_layout(
    rng: random.Random,
    *,
    size: int = 15,
    minimum_block_ratio: float = 0.15,
    maximum_block_ratio: float = 0.22,
    attempts: int = 80,
) -> Layout:
    minimum = round(size * size * minimum_block_ratio)
    maximum = round(size * size * maximum_block_ratio)
    targets = list(range(minimum, maximum + 1))
    rng.shuffle(targets)
    pairs = [
        ((row, column), (size - 1 - row, size - 1 - column))
        for row in range(size)
        for column in range(size)
        if (row, column) <= (size - 1 - row, size - 1 - column)
    ]
    for layout_attempt in range(attempts):
        mutable = [[True] * size for _ in range(size)]
        target = targets[layout_attempt % len(targets)]
        choices = pairs[:]
        rng.shuffle(choices)
        for first, second in choices:
            old = (mutable[first[0]][first[1]], mutable[second[0]][second[1]])
            mutable[first[0]][first[1]] = False
            mutable[second[0]][second[1]] = False
            candidate = tuple(tuple(row) for row in mutable)
            blocks = sum(not value for row in candidate for value in row)
            if blocks > maximum or not validate_layout(candidate):
                mutable[first[0]][first[1]], mutable[second[0]][second[1]] = old
            elif blocks >= target:
                return candidate
    raise ValueError("Kon geen geldig symmetrisch raster maken")


def fill_layout(
    layout: Layout,
    lexicon: Lexicon,
    rng: random.Random,
    *,
    minimum_score: float,
    maximum_nodes: int = 50_000,
) -> tuple[LetterGrid, tuple[Entry, ...]] | None:
    entries = extract_entries(layout)
    pools: dict[int, tuple[str, ...]] = {}
    for length in {entry.length for entry in entries}:
        values = list(lexicon.candidates(length, minimum_score))
        values.sort(key=lambda word: -(lexicon.score(word) + rng.random() * 0.35))
        pools[length] = tuple(values)
        if not values:
            return None

    cell_uses: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for index, entry in enumerate(entries):
        for position, cell in enumerate(entry.cells()):
            cell_uses.setdefault(cell, []).append((index, position))
    neighbors: dict[int, list[tuple[int, int, int]]] = {
        index: [] for index in range(len(entries))
    }
    for uses in cell_uses.values():
        if len(uses) == 2:
            (first, first_position), (second, second_position) = uses
            neighbors[first].append((second, first_position, second_position))
            neighbors[second].append((first, second_position, first_position))

    initial_domains = {index: pools[entry.length] for index, entry in enumerate(entries)}
    nodes = 0

    def propagate(
        domains: dict[int, tuple[str, ...]],
        pending: Iterable[tuple[int, int, int, int]] | None = None,
    ) -> bool:
        queue = deque(
            pending
            if pending is not None
            else (
                (index, other, own_position, other_position)
                for index, links in neighbors.items()
                for other, own_position, other_position in links
            )
        )
        while True:
            singleton_words = [values[0] for values in domains.values() if len(values) == 1]
            if len(singleton_words) != len(set(singleton_words)):
                return False
            singleton_set = set(singleton_words)
            changed_by_uniqueness = False
            for index, values in tuple(domains.items()):
                if len(values) == 1:
                    continue
                filtered = tuple(word for word in values if word not in singleton_set)
                if not filtered:
                    return False
                if len(filtered) != len(values):
                    domains[index] = filtered
                    changed_by_uniqueness = True
                    for other, own_position, other_position in neighbors[index]:
                        queue.append((other, index, other_position, own_position))

            changed_by_arc = False
            while queue:
                index, other, own_position, other_position = queue.popleft()
                allowed = {word[other_position] for word in domains[other]}
                values = domains[index]
                filtered = tuple(word for word in values if word[own_position] in allowed)
                if not filtered:
                    return False
                if len(filtered) != len(values):
                    domains[index] = filtered
                    changed_by_arc = True
                    for neighbor, own_at_crossing, neighbor_at_crossing in neighbors[index]:
                        if neighbor != other:
                            queue.append(
                                (neighbor, index, neighbor_at_crossing, own_at_crossing)
                            )
            if not changed_by_uniqueness and not changed_by_arc:
                return True

    def search(
        domains: dict[int, tuple[str, ...]], *, stable: bool = False
    ) -> dict[int, tuple[str, ...]] | None:
        nonlocal nodes
        nodes += 1
        if nodes > maximum_nodes:
            return None
        domains = domains.copy()
        if not stable and not propagate(domains):
            return None
        unresolved = [(index, values) for index, values in domains.items() if len(values) > 1]
        if not unresolved:
            return domains
        index, values = min(unresolved, key=lambda item: len(item[1]))
        for word in values[:750]:
            branch = domains.copy()
            branch[index] = (word,)
            pending = (
                (other, index, other_position, own_position)
                for other, own_position, other_position in neighbors[index]
            )
            if propagate(branch, pending) and (
                result := search(branch, stable=True)
            ) is not None:
                return result
        return None

    result = search(initial_domains)
    if result is None:
        return None

    assigned = {index: values[0] for index, values in result.items()}
    letters = {
        cell: character
        for index, entry in enumerate(entries)
        for cell, character in zip(entry.cells(), assigned[index])
    }
    grid: LetterGrid = tuple(
        tuple(letters.get((row, column)) if open_cell else None for column, open_cell in enumerate(line))
        for row, line in enumerate(layout)
    )
    filled_entries = tuple(replace(entry, word=assigned[index]) for index, entry in enumerate(entries))
    return grid, filled_entries


def generate_freeform_fill(
    lexicon: Lexicon,
    rng: random.Random,
    *,
    width: int = 17,
    height: int = 20,
    minimum_score: float,
    target_entries: int | None = None,
    minimum_entries: int | None = None,
    maximum_candidates_per_length: int = 4_000,
) -> tuple[LetterGrid, tuple[Entry, ...]] | None:
    """Bouw een verbonden kruiswoord door woorden rond kruisingen te plaatsen."""
    if width < 3 or height < 3:
        raise ValueError("breedte en hoogte moeten minimaal 3 zijn")
    area_factor = width * height / (15 * 15)
    desired_entries = target_entries or round(32 * area_factor**0.5)
    required_entries = minimum_entries or round(22 * min(area_factor, 1.14))
    candidates: list[str] = []
    for length in range(3, max(width, height) + 1):
        values = lexicon.candidates(length, minimum_score)
        if len(values) > maximum_candidates_per_length:
            values = tuple(
                sorted(values, key=lexicon.score, reverse=True)[
                    :maximum_candidates_per_length
                ]
            )
        candidates.extend(values)
    if not candidates:
        return None
    candidates.sort(key=lambda word: -(lexicon.score(word) + rng.random() * 0.35))
    by_direction_letter: dict[tuple[str, str], list[tuple[str, int]]] = {}
    for word in candidates:
        for position, letter in enumerate(word):
            if len(word) <= width:
                by_direction_letter.setdefault(("across", letter), []).append(
                    (word, position)
                )
            if len(word) <= height:
                by_direction_letter.setdefault(("down", letter), []).append(
                    (word, position)
                )
    for values in by_direction_letter.values():
        rng.shuffle(values)

    starters = [word for word in candidates if 7 <= len(word) <= width]
    if not starters:
        return None
    first_word = starters[0]
    first = Entry(
        height // 2,
        (width - len(first_word)) // 2,
        "across",
        len(first_word),
        first_word,
    )
    entries = [first]
    used = {first_word}
    letters = {cell: character for cell, character in zip(first.cells(), first_word)}
    directions = {cell: {"across"} for cell in first.cells()}

    def proposal() -> Entry | None:
        anchors = [
            (cell, direction)
            for cell, present in directions.items()
            for direction in ("across", "down")
            if direction not in present
        ]
        if not anchors:
            return None
        anchor, direction = rng.choice(anchors)
        options = by_direction_letter.get((direction, letters[anchor]), [])
        if not options:
            return None
        word, crossing_position = rng.choice(options)
        if word in used:
            return None
        dr, dc = ((0, 1) if direction == "across" else (1, 0))
        row = anchor[0] - dr * crossing_position
        column = anchor[1] - dc * crossing_position
        end_row = row + dr * (len(word) - 1)
        end_column = column + dc * (len(word) - 1)
        if not (
            0 <= row < height
            and 0 <= column < width
            and 0 <= end_row < height
            and 0 <= end_column < width
        ):
            return None
        before, after = (row - dr, column - dc), (end_row + dr, end_column + dc)
        if before in letters or after in letters:
            return None

        crossings = 0
        for offset, character in enumerate(word):
            cell = (row + dr * offset, column + dc * offset)
            if cell in letters:
                if letters[cell] != character or direction in directions[cell]:
                    return None
                crossings += 1
                continue
            perpendicular = (
                ((cell[0] - 1, cell[1]), (cell[0] + 1, cell[1]))
                if direction == "across"
                else ((cell[0], cell[1] - 1), (cell[0], cell[1] + 1))
            )
            if any(neighbor in letters for neighbor in perpendicular):
                return None
        if crossings == 0:
            return None
        return Entry(row, column, direction, len(word), word)

    misses = 0
    while len(entries) < desired_entries and misses < 12_000:
        entry = proposal()
        if entry is None:
            misses += 1
            continue
        entries.append(entry)
        used.add(entry.word or "")
        for cell, character in zip(entry.cells(), entry.word or ""):
            letters[cell] = character
            directions.setdefault(cell, set()).add(entry.direction)
        misses = 0
    if len(entries) < required_entries:
        return None
    grid: LetterGrid = tuple(
        tuple(letters.get((row, column)) for column in range(width))
        for row in range(height)
    )
    return grid, tuple(entries)
