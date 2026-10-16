import hashlib
import json

import pytest

from cijfercode.errors import LexiconUnavailable
from cijfercode.lexicon import Lexicon, adjusted_minimum_score, normalize_word, sync_words


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


def test_sync_and_load_cache(monkeypatch, tmp_path):
    payload = "appel\ncafé\nrode wijn\nijs\nappel\n".encode()

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
    assert metadata.normalization_version == 2
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
                "normalization_version": 2,
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
