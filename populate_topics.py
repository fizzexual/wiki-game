"""Populate topics.json from Wikipedia's Vital Articles (Level 4) lists.

The Vital Articles project is a curated, editor-maintained roll of the
most notable articles on Wikipedia. Each Level-4 top-level page hosts
several hundred to ~1,500 article links grouped by `==Section==` headers.
This script fetches each top-level page once, slices it by level-2
sections, and assigns sections to our display categories.

Run from project root:

    python populate_topics.py

Writes `topics.json` — the application loads it at startup and falls
back to the hardcoded list in wiki.py if it is missing.
"""
from __future__ import annotations

import json
import re
import sys
import time
from collections import OrderedDict
from typing import Iterable

import requests

API = "https://en.wikipedia.org/w/api.php"
HEADERS = {"User-Agent": "WikiGame/1.0 populate-topics"}
BASE = "Wikipedia:Vital articles/Level 4"

# Each entry: (top-level page, section keywords). If keywords is None, take
# every section. Matching is case-insensitive substring on the section title.
Source = tuple[str, list[str] | None]

SOURCES: "OrderedDict[str, list[Source]]" = OrderedDict([
    ("People", [
        ("People", None),
    ]),
    ("Places", [
        ("Geography", None),
    ]),
    ("History", [
        ("History", None),
    ]),
    ("Arts & Culture", [
        ("Arts", None),
        ("Philosophy and religion", None),
    ]),
    ("Science & Tech", [
        ("Physical sciences", ["physic", "chemis", "earth", "basics", "measure"]),
        ("Mathematics", None),
        ("Technology", None),
    ]),
    ("Nature & Animals", [
        ("Biology and health sciences",
         ["animal", "plant", "botany", "zoology", "biology", "ecology",
          "fungus", "anatomy", "morphology", "organism", "species"]),
    ]),
    ("Food & Drink", [
        ("Everyday life",
         ["food", "drink", "beverage", "cuisine", "cooking", "diet",
          "agriculture", "meal", "ingredient"]),
        ("Anthropology, psychology, and everyday life",
         ["food", "drink", "agriculture", "cooking", "cuisine"]),
    ]),
    ("Sports & Games", [
        ("Everyday life",
         ["sport", "game", "recreation", "hobby", "play", "athletic", "outdoor"]),
        ("Anthropology, psychology, and everyday life",
         ["sport", "game", "recreation"]),
    ]),
    ("Space", [
        ("Physical sciences",
         ["astronomy", "cosmology", "space", "universe", "celestial",
          "planet", "star", "galaxy"]),
    ]),
])

LINK_RE = re.compile(r"\[\[([^|\]]+?)(?:\|[^\]]*)?\]\]")
LEVEL2_RE = re.compile(r"^==\s*([^=].*?[^=])\s*==\s*$")
LEVEL3_RE = re.compile(r"^===\s*([^=].*?[^=])\s*===\s*$")
LEVEL4PLUS_RE = re.compile(r"^====+\s*([^=].*?[^=])\s*====+\s*$")
INTERWIKI_RE = re.compile(r"^[a-z]:")  # m:, s:, c:, w:, q: etc.
NAMESPACE_DROP = ("File:", "Category:", "Image:", "Wikipedia:", "Template:",
                  "Help:", "Portal:", "User:", "Talk:", "MediaWiki:", "Special:")
TITLE_DROP_PREFIX = ("List of", "Outline of", "Index of", "Timeline of",
                     "Lists of", "Glossary of")


def good_title(t: str) -> bool:
    if not t or t.startswith("#"):
        return False
    if INTERWIKI_RE.match(t):
        return False
    if any(t.startswith(p) for p in NAMESPACE_DROP):
        return False
    if t.startswith(":") and any(t[1:].startswith(p) for p in NAMESPACE_DROP):
        return False
    if any(t.startswith(p) for p in TITLE_DROP_PREFIX):
        return False
    tl = t.lower()
    if "vital articles" in tl or "wikipedia:" in tl:
        return False
    if "(disambiguation)" in tl:
        return False
    if len(t) < 2 or len(t) > 80:
        return False
    return True


def fetch_wikitext(page: str) -> str | None:
    params = {
        "action": "parse", "format": "json", "page": page,
        "prop": "wikitext", "formatversion": "2", "redirects": "1",
    }
    try:
        r = requests.get(API, params=params, headers=HEADERS, timeout=30)
        r.raise_for_status()
        return r.json()["parse"]["wikitext"]
    except Exception as e:
        print(f"    [warn] {page}: {e}", file=sys.stderr)
        return None


def extract_titles_from_section(wikitext: str, keywords: list[str] | None) -> list[str]:
    """Return article titles from sections matching any keyword, in document order.

    A line is "in scope" if the most recent level-2 *or* level-3 section
    title contains any of the keywords. Level-4+ subsections inherit the
    current scope. If keywords is None, every section qualifies.
    """
    out: list[str] = []
    cur_l2_match = keywords is None
    cur_l3_match = False

    for line in wikitext.splitlines():
        if not line:
            continue
        m2 = LEVEL2_RE.match(line)
        if m2:
            title = m2.group(1).strip().lower()
            cur_l2_match = keywords is None or any(k in title for k in keywords)
            cur_l3_match = False
            continue
        m3 = LEVEL3_RE.match(line)
        if m3:
            title = m3.group(1).strip().lower()
            cur_l3_match = keywords is not None and any(k in title for k in keywords)
            continue
        if LEVEL4PLUS_RE.match(line):
            # Sub-subsection — inherit current state
            continue
        if not (cur_l2_match or cur_l3_match):
            continue
        for tm in LINK_RE.finditer(line):
            t = tm.group(1).strip()
            if good_title(t):
                out.append(t)
    return out


def dedupe(seq: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for x in seq:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def main() -> int:
    # Cache page fetches so we don't pull the same top-level page twice.
    page_cache: dict[str, str | None] = {}
    result: "OrderedDict[str, list[str]]" = OrderedDict()

    for our_cat, sources in SOURCES.items():
        titles: list[str] = []
        for page, keywords in sources:
            full_page = f"{BASE}/{page}"
            if full_page not in page_cache:
                print(f"  fetch: {full_page}")
                page_cache[full_page] = fetch_wikitext(full_page)
                time.sleep(0.4)
            wt = page_cache[full_page]
            if not wt:
                continue
            titles.extend(extract_titles_from_section(wt, keywords))
        unique = dedupe(titles)
        result[our_cat] = unique
        print(f"{our_cat}: {len(unique)} articles")

    total = sum(len(v) for v in result.values())
    print(f"\nTotal: {total} articles across {len(result)} categories")

    with open("topics.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print("Wrote topics.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
