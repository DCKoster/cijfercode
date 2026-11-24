import hashlib
import json
from pathlib import Path

import pytest

from cijfercode.errors import LexiconUnavailable
from cijfercode.lexicon import (
    Lexicon,
    adjusted_minimum_score,
    is_suitable_puzzle_word,
    normalize_source_word,
    normalize_word,
    sync_words,
)


def test_normalize_word_uses_plain_alphabet_and_separate_ij():
    assert normalize_word("café") == "CAFE"
    assert normalize_word("coöperatie") == "COOPERATIE"
    assert normalize_word("ijs") == "IJS"
    assert normalize_word("yoga") == "YOGA"
    assert normalize_word("zee-egel") is None
    assert normalize_word("rode wijn") is None
    assert normalize_word("a") is None
    assert normalize_word("a" * 20) == "A" * 20
    assert normalize_word("a" * 21) is None
    assert adjusted_minimum_score(4.0, 5) == 4.0
    assert adjusted_minimum_score(4.0, 15) == pytest.approx(2.8)


def test_source_normalization_rejects_abbreviations_but_preserves_word_case():
    assert normalize_source_word("DNS") is None
    assert normalize_source_word("XIV") is None
    assert normalize_source_word("dove") == "DOVE"
    assert normalize_source_word("Angèles") == "ANGELES"


@pytest.mark.parametrize(
    ("word", "dutch", "english", "expected"),
    [
        ("LIMIT", 3.19, 4.70, False),
        ("THE", 5.76, 7.73, False),
        ("NEW", 5.24, 6.25, False),
        ("CMS", 3.04, 3.36, False),
        ("ANGELES", 4.13, 4.73, False),
        ("CUE", 2.70, 3.75, False),
        ("GARDEN", 3.85, 4.77, True),
        ("ROAD", 4.34, 5.24, False),
        ("DOVE", 3.65, 3.67, True),
        ("TACT", 2.86, 3.08, True),
        ("BEEN", 4.57, 6.27, True),
        ("LONG", 4.13, 5.81, True),
        ("EVER", 3.61, 5.66, True),
        ("PATIENT", 3.57, 4.77, True),
        ("TELLING", 3.48, 4.92, True),
    ],
)
def test_puzzle_word_suitability(word, dutch, english, expected):
    assert is_suitable_puzzle_word(word, dutch, english) is expected


def test_browser_lexicon_applies_reviewed_words_and_names():
    path = Path(__file__).resolve().parents[1] / "public" / "lexicon.json"
    lexicon = json.loads(path.read_text(encoding="utf-8"))
    general = {word for rows in lexicon["words"].values() for word, _ in rows}
    names = {"EVANS", "RICHARDS", "ROBERTS", "WILLIAMS"}
    assert names <= general
    assert names <= set(lexicon["properNames"])
    assert "GARDEN" in general
    assert general.isdisjoint({"PHILIPPINES", "RIVERS", "ROAD"})
    for key in ("words", "familiarWords"):
        animals = {word for rows in lexicon["themes"]["animals"][key].values() for word, _ in rows}
        assert "GOLDFISH" not in animals
        assert "GOUDVIS" in animals


def test_sync_and_load_cache(monkeypatch, tmp_path):
    payload = "appel\ncafé\nrode wijn\nijs\nappel\nDNS\nXIV\n".encode()

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return payload

    monkeypatch.setattr("urllib.request.urlopen", lambda *_args, **_kwargs: Response())
    metadata = sync_words(tmp_path, source_url="https://example.invalid/words")

    cached = (tmp_path / "words.txt").read_bytes()
    assert cached == b"APPEL\nCAFE\nIJS\n"
    assert metadata.sha256 == hashlib.sha256(cached).hexdigest()
    assert metadata.normalization_version == 3
    assert metadata.maximum_word_length == 20
    assert json.loads((tmp_path / "metadata.json").read_text())["word_count"] == 3
    assert Lexicon.from_cache(tmp_path).words(3) == ("IJS",)


def test_cache_checksum_is_verified(tmp_path):
    (tmp_path / "words.txt").write_text("APPEL\n", encoding="utf-8")
    (tmp_path / "metadata.json").write_text(
        json.dumps(
            {
                "source_url": "test",
                "downloaded_at": "",
                "sha256": "wrong",
                "word_count": 1,
                "normalization_version": 3,
                "maximum_word_length": 20,
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(LexiconUnavailable, match="Checksum"):
        Lexicon.from_cache(tmp_path)


def test_old_cache_requires_resynchronization(tmp_path):
    (tmp_path / "words.txt").write_text("APPEL\n", encoding="utf-8")
    (tmp_path / "metadata.json").write_text(
        json.dumps(
            {
                "source_url": "test",
                "downloaded_at": "",
                "sha256": hashlib.sha256(b"APPEL\n").hexdigest(),
                "word_count": 1,
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(LexiconUnavailable, match="opnieuw"):
        Lexicon.from_cache(tmp_path)
