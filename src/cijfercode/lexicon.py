from __future__ import annotations

import hashlib
import json
import os
import tempfile
import unicodedata
import urllib.error
import urllib.request
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Callable, Iterable

from .errors import LexiconUnavailable

OPENTAAL_URL = (
    "https://raw.githubusercontent.com/OpenTaal/opentaal-wordlist/"
    "master/wordlist.txt"
)
CACHE_SCHEMA_VERSION = 2
MAXIMUM_WORD_LENGTH = 20


def adjusted_minimum_score(base_score: float, length: int) -> float:
    """Compenseer de natuurlijke frequentiedaling van langere woorden."""
    return max(base_score - 1.2, base_score - 0.12 * max(0, length - 5))


def default_cache_dir() -> Path:
    base = os.environ.get("XDG_CACHE_HOME")
    return Path(base) / "cijfercode" if base else Path.home() / ".cache" / "cijfercode"


def normalize_word(value: str) -> str | None:
    value = value.strip().replace("ĳ", "ij").replace("Ĳ", "IJ")
    if not value or any(not character.isalpha() for character in value):
        return None
    decomposed = unicodedata.normalize("NFKD", value)
    normalized = "".join(
        character for character in decomposed if not unicodedata.combining(character)
    ).upper()
    if not normalized.isascii() or not normalized.isalpha():
        return None
    if not 3 <= len(normalized) <= MAXIMUM_WORD_LENGTH:
        return None
    return normalized


@dataclass(frozen=True, slots=True)
class LexiconMetadata:
    source_url: str
    downloaded_at: str
    sha256: str
    word_count: int
    normalization_version: int
    maximum_word_length: int

    def to_dict(self) -> dict[str, str | int]:
        return asdict(self)


def _atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    try:
        with os.fdopen(descriptor, "wb") as temporary:
            temporary.write(data)
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_name, path)
    except BaseException:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def sync_words(
    cache_dir: Path | str | None = None,
    *,
    source_url: str = OPENTAAL_URL,
    timeout: float = 60.0,
) -> LexiconMetadata:
    """Download, normaliseer en atomair cache een OpenTaal-momentopname."""
    destination = Path(cache_dir) if cache_dir is not None else default_cache_dir()
    request = urllib.request.Request(source_url, headers={"User-Agent": "cijfercode/0.1"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = response.read()
    except (OSError, urllib.error.URLError) as error:
        raise LexiconUnavailable(f"Download van OpenTaal mislukt: {error}") from error

    try:
        text = payload.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise LexiconUnavailable("De OpenTaal-download is geen geldige UTF-8") from error

    words = sorted(
        {
            normalized
            for line in text.splitlines()
            if (normalized := normalize_word(line)) is not None
        }
    )
    if not words:
        raise LexiconUnavailable("De OpenTaal-download bevat geen bruikbare woorden")

    normalized_payload = ("\n".join(words) + "\n").encode()
    metadata = LexiconMetadata(
        source_url=source_url,
        downloaded_at=datetime.now(UTC).isoformat(),
        sha256=hashlib.sha256(normalized_payload).hexdigest(),
        word_count=len(words),
        normalization_version=CACHE_SCHEMA_VERSION,
        maximum_word_length=MAXIMUM_WORD_LENGTH,
    )
    _atomic_write(destination / "words.txt", normalized_payload)
    _atomic_write(
        destination / "metadata.json",
        (json.dumps(metadata.to_dict(), indent=2, ensure_ascii=False) + "\n").encode(),
    )
    return metadata


def _wordfreq_score(word: str) -> float:
    try:
        from wordfreq import zipf_frequency
    except ImportError as error:  # pragma: no cover - dependency is installed in production
        raise LexiconUnavailable(
            "De dependency 'wordfreq' ontbreekt; installeer het project opnieuw"
        ) from error
    return float(zipf_frequency(word.lower(), "nl"))


class Lexicon:
    """Geïndexeerde woordenlijst met luie frequentiescores."""

    def __init__(
        self,
        words: Iterable[str],
        metadata: LexiconMetadata,
        *,
        scorer: Callable[[str], float] = _wordfreq_score,
    ) -> None:
        grouped: dict[int, list[str]] = defaultdict(list)
        for source_word in words:
            word = normalize_word(source_word)
            if word is not None:
                grouped[len(word)].append(word)
        self._by_length = {
            length: tuple(sorted(set(values))) for length, values in grouped.items()
        }
        self.metadata = metadata
        self._scorer = scorer
        self._scores: dict[str, float] = {}

    @classmethod
    def from_cache(cls, cache_dir: Path | str | None = None) -> Lexicon:
        directory = Path(cache_dir) if cache_dir is not None else default_cache_dir()
        word_path = directory / "words.txt"
        metadata_path = directory / "metadata.json"
        try:
            payload = word_path.read_bytes()
            raw_metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            if (
                raw_metadata.get("normalization_version") != CACHE_SCHEMA_VERSION
                or raw_metadata.get("maximum_word_length") != MAXIMUM_WORD_LENGTH
            ):
                raise LexiconUnavailable(
                    "Verouderde woordenlijstcache; voer 'cijfercode words sync' opnieuw uit"
                )
            metadata = LexiconMetadata(**raw_metadata)
        except (OSError, ValueError, TypeError) as error:
            raise LexiconUnavailable(
                "Geen geldige woordenlijstcache; voer 'cijfercode words sync' uit"
            ) from error
        digest = hashlib.sha256(payload).hexdigest()
        if digest != metadata.sha256:
            raise LexiconUnavailable("Checksum van de woordenlijstcache klopt niet")
        return cls(payload.decode("utf-8").splitlines(), metadata)

    @classmethod
    def from_words(
        cls,
        words: Iterable[str],
        *,
        scores: dict[str, float] | None = None,
        source: str = "test",
    ) -> Lexicon:
        normalized = [word for value in words if (word := normalize_word(value))]
        payload = ("\n".join(sorted(set(normalized))) + "\n").encode()
        supplied = {key.upper(): value for key, value in (scores or {}).items()}
        return cls(
            normalized,
            LexiconMetadata(
                source_url=source,
                downloaded_at="",
                sha256=hashlib.sha256(payload).hexdigest(),
                word_count=len(set(normalized)),
                normalization_version=CACHE_SCHEMA_VERSION,
                maximum_word_length=MAXIMUM_WORD_LENGTH,
            ),
            scorer=lambda word: supplied.get(word, 5.0),
        )

    def words(self, length: int) -> tuple[str, ...]:
        return self._by_length.get(length, ())

    def score(self, word: str) -> float:
        if word not in self._scores:
            self._scores[word] = self._scorer(word)
        return self._scores[word]

    def candidates(self, length: int, minimum_score: float) -> tuple[str, ...]:
        threshold = adjusted_minimum_score(minimum_score, length)
        return tuple(word for word in self.words(length) if self.score(word) >= threshold)
