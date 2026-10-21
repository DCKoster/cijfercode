"""Add reproducible theme and proper-name data to the browser lexicon.

This release helper deliberately takes downloaded source files as arguments. It
never performs network requests, so rebuilding a checked-in snapshot is an
explicit operation.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import unicodedata
import zipfile
from collections import defaultdict
from pathlib import Path

from wordfreq import zipf_frequency


NSR_URL = "https://www.gbif.org/dataset/4dd32523-a3a3-43b7-84df-4cda02f15cf7"

# `wordfreq` assigns 0 to names it has never observed. A score of 1.0 keeps the
# relatively better-known part of the Naturalis vocabulary while leaving out the
# thousands of names absent from general Dutch text. Frequency alone is not
# sufficient: common words such as EDELMAN and SLIPPER are also vernacular names
# for obscure species. Those false-frequency matches are explicitly excluded.
FAMILIAR_ANIMAL_MINIMUM_FREQUENCY = 1.0
AMBIGUOUS_ANIMAL_NAMES = {
    "ACCIDENTJE", "BAARDMAN", "BELLETJE", "BOEKENWURM", "BOKJE", "BRAAM",
    "BRILDRAGER", "BROMMER", "CADEL", "CHINOOK", "CHOCOLAATJE", "DAMBORDJE",
    "DIENARES", "DIEF", "DIEFJE", "DODEMANSDUIM", "DRAADWORM", "DRAAK",
    "DRIETAND", "DUINVILLA", "EDELMAN", "EGELTJE", "EENOOGJE", "EIKENBLAD",
    "ESPENBLAD", "GEISHA", "GLASSNIJDER", "GROENTJE", "GROOTKRUIS", "HAARBOS",
    "HARDLOPER", "HILLE", "HUISMOEDER", "JUWEELTJE", "KIJKGAATJE", "KOEVINKJE",
    "KOSMOPOLIET", "KRAAK", "KRAKELING", "KRASSER", "KUIFJE", "LANTAARNTJE",
    "LETTERZETTER", "LIEVELING", "LOCOMOTIEFJE", "LOOIER", "MARGRIETJE",
    "MEMEL", "MICHELINMANNETJE", "MOERTJE", "MORGENROOD", "MUILTJE", "MULDER",
    "NEGERTJE", "NONNETJE", "OPROLLER", "PAAPJE", "PAPEGAAITJE", "PARASOLLETJE",
    "PLAKKER", "RIEMPJE", "ROODKAPJE", "ROESJE", "SCHAAPJE", "SCHEPJE",
    "SLIPPER", "SLUISMEESTER", "SMID", "SNOR", "SPEKTOR", "SPIEGELEITJE",
    "STERRETJE", "STORK", "TOPPER", "TRAMA", "TRAPGEVEL", "VETJE",
    "VLINDERSTRIKJE", "VOLGELING", "VOSJE", "WAPENDRAGER", "WEKKERTJE", "WITJE",
    "YANKEE", "ZAAGJE", "ZAGER", "ZEEPJE", "ZWARTKOP",
}


def normalize(value: str) -> str | None:
    decomposed = unicodedata.normalize("NFKD", value.strip().replace("ĳ", "ij").replace("Ĳ", "IJ"))
    word = "".join(character for character in decomposed if not unicodedata.combining(character)).upper()
    return word if word.isascii() and word.isalpha() and 3 <= len(word) <= 20 else None


def read_lines(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8-sig").splitlines()


def animal_words(archive: Path) -> tuple[set[str], str]:
    with zipfile.ZipFile(archive) as source:
        metadata = source.read("eml.xml").decode("utf-8")
        published = re.search(r"<pubDate>([^<]+)</pubDate>", metadata)
        taxa = source.open("Taxa.txt")
        rows = csv.DictReader((line.decode("utf-8-sig") for line in taxa))
        animal_ids = {
            row["taxonID"] for row in rows
            if row["kingdom"] == "Animalia" and row["taxonomicStatus"] == "accepted name"
        }
        names = source.open("Vernacular_Names.txt")
        rows = csv.DictReader((line.decode("utf-8-sig") for line in names))
        words = {
            word for row in rows
            if row["taxonID"] in animal_ids and row["language"] == "Dutch"
            if (word := normalize(row["vernacularName"])) is not None
        }
    return words, published.group(1) if published else "unknown"


def grouped_scored(words: set[str]) -> dict[str, list[list[str | float]]]:
    grouped: dict[int, list[tuple[str, float]]] = defaultdict(list)
    for word in words:
        grouped[len(word)].append((word, round(float(zipf_frequency(word.lower(), "nl")), 2)))
    return {
        str(length): [[word, score] for word, score in sorted(values, key=lambda item: (-item[1], item[0]))]
        for length, values in sorted(grouped.items())
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lexicon", type=Path, default=Path("public/lexicon.json"))
    parser.add_argument("--nsr-archive", type=Path, required=True)
    parser.add_argument("--approved", type=Path, required=True)
    parser.add_argument("--unapproved", type=Path, required=True)
    arguments = parser.parse_args()

    payload = json.loads(arguments.lexicon.read_text(encoding="utf-8"))
    browser_words = {word for values in payload["words"].values() for word, _score in values}
    approved = {word for value in read_lines(arguments.approved) if (word := normalize(value))}
    proper_only = {
        word for value in read_lines(arguments.unapproved)
        if value[:1].isupper() and (word := normalize(value)) and word not in approved and word in browser_words
    }
    animals, nsr_version = animal_words(arguments.nsr_archive)
    alphabet = set("".join(animals))
    missing = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ") - alphabet
    if len(animals) < 250 or missing:
        raise SystemExit(f"Dierenthema ongeldig: {len(animals)} woorden, ontbrekende letters: {sorted(missing)}")
    familiar_animals = {
        word for word in animals
        if zipf_frequency(word.lower(), "nl") >= FAMILIAR_ANIMAL_MINIMUM_FREQUENCY
        and word not in AMBIGUOUS_ANIMAL_NAMES
    }
    unknown_exclusions = AMBIGUOUS_ANIMAL_NAMES - animals
    if len(familiar_animals) < 500 or unknown_exclusions:
        raise SystemExit(
            f"Bekende dieren ongeldig: {len(familiar_animals)} woorden, "
            f"onbekende uitsluitingen={sorted(unknown_exclusions)}"
        )

    payload["properNames"] = sorted(proper_only)
    payload["version"] = f"{payload['version'].split('+', 1)[0]}+nsr{nsr_version.replace('-', '')}-names1-animalsets2"
    payload["themes"] = {
        "animals": {
            "sourceUrl": NSR_URL,
            "license": "CC BY 4.0",
            "words": grouped_scored(animals),
            "familiarWords": grouped_scored(familiar_animals),
        }
    }
    arguments.lexicon.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(
        f"{arguments.lexicon}: {len(animals)} diernamen, "
        f"{len(familiar_animals)} bekende dieren, {len(proper_only)} pure eigennamen"
    )


if __name__ == "__main__":
    main()
