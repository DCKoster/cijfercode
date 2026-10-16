from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Sequence

from .errors import CijfercodeError
from .generator import generate_puzzle
from .lexicon import Lexicon, sync_words


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="cijfercode", description="Genereer Nederlandse cijfercodepuzzels"
    )
    commands = parser.add_subparsers(dest="command", required=True)

    words = commands.add_parser("words", help="beheer de lokale woordenlijst")
    words_commands = words.add_subparsers(dest="words_command", required=True)
    sync = words_commands.add_parser("sync", help="download de OpenTaal-woordenlijst")
    sync.add_argument("--cache-dir", type=Path)

    generate = commands.add_parser("generate", help="genereer een puzzel")
    generate.add_argument("--difficulty", type=int, choices=range(1, 5), required=True)
    generate.add_argument("--seed")
    generate.add_argument(
        "--width", type=int, default=17, help="aantal kolommen (standaard: 17)"
    )
    generate.add_argument(
        "--height", type=int, default=20, help="aantal rijen (standaard: 20)"
    )
    generate.add_argument(
        "--givens",
        type=int,
        choices=range(27),
        help="exact aantal vooraf gegeven letters (0-26)",
    )
    generate.add_argument("--output", type=Path)
    generate.add_argument("--cache-dir", type=Path)
    generate.add_argument("--max-attempts", type=int, default=200)
    generate.add_argument("--without-solution", action="store_true")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    arguments = parser.parse_args(argv)
    try:
        if arguments.command == "words":
            metadata = sync_words(arguments.cache_dir)
            print(json.dumps(metadata.to_dict(), indent=2, ensure_ascii=False))
            return 0

        lexicon = Lexicon.from_cache(arguments.cache_dir)
        puzzle = generate_puzzle(
            arguments.difficulty,
            arguments.seed,
            width=arguments.width,
            height=arguments.height,
            lexicon=lexicon,
            max_attempts=arguments.max_attempts,
            given_count=arguments.givens,
        )
        output = json.dumps(
            puzzle.to_dict(include_solution=not arguments.without_solution),
            indent=2,
            ensure_ascii=False,
        ) + "\n"
        if arguments.output:
            arguments.output.write_text(output, encoding="utf-8")
        else:
            print(output, end="")
        return 0
    except (CijfercodeError, ValueError) as error:
        print(f"fout: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
