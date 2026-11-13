"""Build the compact, versioned browser lexicon.

This is an offline release tool. The generated JSON is committed so the web
build is reproducible and does not download data during deployment.
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path

from wordfreq import zipf_frequency

from cijfercode.lexicon import Lexicon, default_cache_dir, is_suitable_puzzle_word


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "lexicon.json"
WORDS_PER_LENGTH = 2_500


def main() -> None:
    lexicon = Lexicon.from_cache(default_cache_dir())
    words: dict[str, list[list[str | float]]] = {}
    for length in range(3, 21):
        scored_words = []
        for word in lexicon.words(length):
            dutch_frequency = float(zipf_frequency(word.lower(), "nl"))
            english_frequency = float(zipf_frequency(word.lower(), "en"))
            if is_suitable_puzzle_word(word, dutch_frequency, english_frequency):
                scored_words.append((word, round(dutch_frequency, 2)))
        scored = sorted(
            scored_words,
            key=lambda item: (-item[1], item[0]),
        )[:WORDS_PER_LENGTH]
        words[str(length)] = [[word, score] for word, score in scored]

    source_hash = lexicon.metadata.sha256
    payload = {
        "version": f"opentaal-{source_hash[:12]}-top{WORDS_PER_LENGTH}-curated2",
        "sourceUrl": lexicon.metadata.source_url,
        "generatedAt": datetime.now(UTC).isoformat(),
        "words": words,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"
    OUTPUT.write_text(encoded, encoding="utf-8")
    print(f"{OUTPUT}: {len(encoded.encode()):,} bytes, sha256={hashlib.sha256(encoded.encode()).hexdigest()}")


if __name__ == "__main__":
    main()
