"""Wikipedia API client + bidirectional BFS for the Wiki Game."""
from __future__ import annotations

import json
import os
import random
import re
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Iterable, Iterator
from urllib.parse import quote, unquote

import requests

API = "https://en.wikipedia.org/w/api.php"
REST_HTML = "https://en.wikipedia.org/api/rest_v1/page/html/"
TOPICS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "topics.json")
HEADERS = {"User-Agent": "WikiGame/1.0 (educational project; https://example.local)"}
BATCH_SIZE = 50           # max titles per query
LINKS_PER_PAGE = 500      # pllimit/lhlimit for non-bots
WORKERS = 3               # parallel HTTP workers (Wikipedia 429s aggressively above this)
PER_PAGE_LINK_CAP = 400   # avoid pages like "List of..." blowing up the frontier
MAX_DEPTH_EACH_SIDE = 4   # hard ceiling: total path length capped at 8
MAX_RETRIES = 4


class WikiError(Exception):
    pass


def _get(params: dict) -> dict:
    params = {"format": "json", "formatversion": "2", **params}
    backoff = 0.5
    for attempt in range(MAX_RETRIES):
        r = requests.get(API, params=params, headers=HEADERS, timeout=20)
        if r.status_code == 429 or r.status_code >= 500:
            wait = float(r.headers.get("Retry-After", backoff))
            time.sleep(min(wait, 5.0))
            backoff *= 2
            continue
        r.raise_for_status()
        return r.json()
    r.raise_for_status()
    return r.json()


def normalize_title(raw: str) -> str | None:
    """Resolve a user-typed title to the canonical Wikipedia title, following redirects."""
    raw = raw.strip()
    if not raw:
        return None
    data = _get({"action": "query", "titles": raw, "redirects": "1"})
    pages = data.get("query", {}).get("pages", [])
    if not pages:
        return None
    p = pages[0]
    if p.get("missing"):
        return None
    return p.get("title")


def autocomplete(prefix: str, limit: int = 7) -> list[str]:
    prefix = prefix.strip()
    if not prefix:
        return []
    data = _get({
        "action": "opensearch",
        "search": prefix,
        "limit": str(limit),
        "namespace": "0",
    })
    if isinstance(data, list) and len(data) >= 2:
        return data[1]
    return []


def _batches(items: Iterable[str], n: int) -> Iterator[list[str]]:
    batch: list[str] = []
    for it in items:
        batch.append(it)
        if len(batch) == n:
            yield batch
            batch = []
    if batch:
        yield batch


def _fetch_link_batch(titles: list[str], direction: str) -> dict[str, list[str]]:
    """Get forward links (direction='out') or backlinks (direction='in') for a batch of titles.

    Returns: {source_title: [linked_titles]}.
    Handles pllimit/lhlimit pagination via the continue token.
    """
    prop = "links" if direction == "out" else "linkshere"
    prefix = "pl" if direction == "out" else "lh"
    base = {
        "action": "query",
        "prop": prop,
        "titles": "|".join(titles),
        "redirects": "1",
        f"{prefix}namespace": "0",
        f"{prefix}limit": "max",
    }
    out: dict[str, list[str]] = {t: [] for t in titles}
    cont: dict[str, str] = {}
    safety = 0
    while True:
        safety += 1
        if safety > 10:  # cap pagination per batch
            break
        params = {**base, **cont}
        data = _get(params)
        for page in data.get("query", {}).get("pages", []):
            src = page.get("title")
            if not src:
                continue
            for link in page.get(prop, []) or []:
                t = link.get("title")
                if t:
                    out.setdefault(src, []).append(t)
        if "continue" in data:
            cont = data["continue"]
        else:
            break
    # cap per-page links so a megapage doesn't explode the frontier
    for k, v in out.items():
        if len(v) > PER_PAGE_LINK_CAP:
            out[k] = v[:PER_PAGE_LINK_CAP]
    return out


def _expand(titles: list[str], direction: str) -> dict[str, list[str]]:
    """Expand a frontier in parallel batches."""
    merged: dict[str, list[str]] = {}
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = [pool.submit(_fetch_link_batch, batch, direction)
                   for batch in _batches(titles, BATCH_SIZE)]
        for fut in as_completed(futures):
            try:
                merged.update(fut.result())
            except Exception:
                # one batch failing shouldn't kill the search
                continue
    return merged


def _reconstruct(parents_fwd: dict[str, str | None],
                 parents_bwd: dict[str, str | None],
                 meet: str) -> list[str]:
    fwd: list[str] = []
    cur: str | None = meet
    while cur is not None:
        fwd.append(cur)
        cur = parents_fwd.get(cur)
    fwd.reverse()
    bwd: list[str] = []
    cur = parents_bwd.get(meet)
    while cur is not None:
        bwd.append(cur)
        cur = parents_bwd.get(cur)
    return fwd + bwd


def find_path(start: str, end: str) -> Iterator[dict]:
    """Generator that yields progress events and finally a result event.

    Event shapes:
      {"type": "progress", "side": "forward"|"backward", "depth": int,
       "frontier": int, "visited": int}
      {"type": "result", "path": [...], "elapsed": float}
      {"type": "error", "message": str}
    """
    t0 = time.time()

    start_n = normalize_title(start)
    if not start_n:
        yield {"type": "error", "message": f"Couldn't find a Wikipedia page for '{start}'."}
        return
    end_n = normalize_title(end)
    if not end_n:
        yield {"type": "error", "message": f"Couldn't find a Wikipedia page for '{end}'."}
        return

    yield {"type": "resolved", "start": start_n, "end": end_n}

    if start_n == end_n:
        yield {"type": "result", "path": [start_n], "elapsed": 0.0}
        return

    parents_fwd: dict[str, str | None] = {start_n: None}
    parents_bwd: dict[str, str | None] = {end_n: None}
    frontier_fwd: list[str] = [start_n]
    frontier_bwd: list[str] = [end_n]
    depth_fwd = 0
    depth_bwd = 0

    while frontier_fwd and frontier_bwd:
        # expand whichever side is smaller — keeps the search balanced
        if len(frontier_fwd) <= len(frontier_bwd):
            if depth_fwd >= MAX_DEPTH_EACH_SIDE:
                yield {"type": "error", "message": "Search exceeded depth limit without finding a path."}
                return
            depth_fwd += 1
            yield {"type": "progress", "side": "forward", "depth": depth_fwd,
                   "frontier": len(frontier_fwd), "visited": len(parents_fwd)}
            expansion = _expand(frontier_fwd, "out")
            new_frontier: list[str] = []
            meet = None
            for src, targets in expansion.items():
                for t in targets:
                    if t in parents_fwd:
                        continue
                    parents_fwd[t] = src
                    new_frontier.append(t)
                    if t in parents_bwd:
                        meet = t
                        break
                if meet:
                    break
            frontier_fwd = new_frontier
            if meet:
                path = _reconstruct(parents_fwd, parents_bwd, meet)
                yield {"type": "result", "path": path, "elapsed": time.time() - t0}
                return
        else:
            if depth_bwd >= MAX_DEPTH_EACH_SIDE:
                yield {"type": "error", "message": "Search exceeded depth limit without finding a path."}
                return
            depth_bwd += 1
            yield {"type": "progress", "side": "backward", "depth": depth_bwd,
                   "frontier": len(frontier_bwd), "visited": len(parents_bwd)}
            expansion = _expand(frontier_bwd, "in")
            new_frontier = []
            meet = None
            for src, targets in expansion.items():
                # `targets` here are pages that link TO src; for the backward tree,
                # the parent of each target is src (one step closer to `end`).
                for t in targets:
                    if t in parents_bwd:
                        continue
                    parents_bwd[t] = src
                    new_frontier.append(t)
                    if t in parents_fwd:
                        meet = t
                        break
                if meet:
                    break
            frontier_bwd = new_frontier
            if meet:
                path = _reconstruct(parents_fwd, parents_bwd, meet)
                yield {"type": "result", "path": path, "elapsed": time.time() - t0}
                return

    yield {"type": "error", "message": "No path found."}


# ---------- the playable game: random pairs + proxied article HTML ----------

# Hardcoded fallback used when topics.json is missing. Run populate_topics.py
# to regenerate a larger pool sourced from Wikipedia's Vital Articles.
_FALLBACK_CATEGORIES: dict[str, list[str]] = {
    "People": [
        "Albert Einstein", "Isaac Newton", "Leonardo da Vinci", "Marie Curie",
        "William Shakespeare", "Mozart", "Beyoncé", "Lionel Messi", "Cleopatra",
        "Genghis Khan", "Plato", "Charles Darwin", "Nikola Tesla",
        "Mahatma Gandhi", "Nelson Mandela", "Elvis Presley", "Steve Jobs",
    ],
    "Places": [
        "Mount Everest", "Tokyo", "Antarctica", "Sahara", "Amazon rainforest",
        "Eiffel Tower", "Great Wall of China", "Venice", "Iceland", "Hawaii",
    ],
    "Food & Drink": ["Pizza", "Coffee", "Chocolate", "Sushi", "Bread", "Wine"],
    "Science & Tech": [
        "Bicycle", "Black hole", "Internet", "DNA", "Penicillin", "Telescope",
        "Camera", "Lightning", "Atom", "Evolution", "Mathematics",
        "Python (programming language)", "Quantum mechanics",
    ],
    "Arts & Culture": [
        "Piano", "Philosophy", "Jazz", "Opera", "Ballet", "Cinema",
        "Democracy", "Capitalism", "Buddhism",
    ],
    "Nature & Animals": [
        "Tiger", "Octopus", "Honey bee", "Penguin", "Elephant", "Dolphin",
        "Tyrannosaurus", "Mushroom", "Volcano",
    ],
    "History": [
        "World War II", "French Revolution", "Apollo 11", "Cold War",
        "Renaissance", "Industrial Revolution",
    ],
    "Sports & Games": ["Football", "Chess", "Olympic Games", "Marathon"],
    "Space": ["Sun", "Moon", "Mars", "Galaxy", "Big Bang"],
}


def _load_topic_categories() -> dict[str, list[str]]:
    """Load topics from topics.json if present, else fall back to hardcoded."""
    if os.path.exists(TOPICS_PATH):
        try:
            with open(TOPICS_PATH, encoding="utf-8") as f:
                data = json.load(f)
            if isinstance(data, dict) and all(isinstance(v, list) for v in data.values()):
                return data
        except (OSError, json.JSONDecodeError):
            pass
    return _FALLBACK_CATEGORIES


TOPIC_CATEGORIES: dict[str, list[str]] = _load_topic_categories()
TOPICS: list[str] = [t for ts in TOPIC_CATEGORIES.values() for t in ts]


def random_chain(n: int = 5,
                 categories: list[str] | None = None,
                 difficulty: str = "medium") -> list[str]:
    """Return `n` distinct, random topics for a multi-stage run.

    Difficulty changes the source pool:
      - easy:   all topics drawn from a single category, top 20% of that
                category's list (most prominent vital articles).
      - medium: one topic per shuffled category (varied subject matter,
                whole pool eligible).
      - hard:   forced cross-category, drawing from the deeper half of
                each category list (more obscure entries).
    """
    n = max(2, min(n, 12))
    cats = [c for c in (categories or list(TOPIC_CATEGORIES.keys()))
            if c in TOPIC_CATEGORIES and TOPIC_CATEGORIES[c]]
    if not cats:
        cats = [c for c in TOPIC_CATEGORIES if TOPIC_CATEGORIES[c]]

    if difficulty == "easy":
        c = random.choice(cats)
        pool = TOPIC_CATEGORIES[c]
        top = pool[: max(n * 4, len(pool) // 5)]  # top ~20% (or at least 4·n)
        if len(top) < n:
            top = pool[: max(n, len(pool))]
        picks = random.sample(top, min(n, len(top)))
        return picks

    if difficulty == "hard":
        # Pick n different categories (with replacement if fewer than n).
        ordered = cats[:]
        random.shuffle(ordered)
        if len(ordered) < n:
            ordered = (ordered * ((n // len(ordered)) + 1))[:n]
        else:
            ordered = ordered[:n]
        used: set[str] = set()
        out: list[str] = []
        for c in ordered:
            pool = TOPIC_CATEGORIES[c]
            deep = pool[len(pool) // 2:]
            candidates = [t for t in deep if t not in used] or [t for t in pool if t not in used]
            if not candidates:
                continue
            t = random.choice(candidates)
            out.append(t)
            used.add(t)
        while len(out) < n:
            remaining = [t for t in TOPICS if t not in used]
            if not remaining:
                break
            t = random.choice(remaining)
            out.append(t)
            used.add(t)
        random.shuffle(out)
        return out

    # medium: round-robin across shuffled categories.
    random.shuffle(cats)
    used = set()
    out = []
    while len(out) < n and cats:
        progress = False
        for c in cats:
            if len(out) >= n:
                break
            pool = [t for t in TOPIC_CATEGORIES[c] if t not in used]
            if not pool:
                continue
            t = random.choice(pool)
            out.append(t)
            used.add(t)
            progress = True
        if not progress:
            break
    if len(out) < n:
        remaining = [t for t in TOPICS if t not in used]
        random.shuffle(remaining)
        out.extend(remaining[: n - len(out)])
    random.shuffle(out)
    return out


def random_pair(categories: list[str] | None = None,
                difficulty: str = "any") -> tuple[str, str]:
    """Return a random (start, end) pair of well-known topics.

    `categories` restricts the pool to the named groups (None = all).
    `difficulty`: "easy" picks two topics from the same category, "hard" picks
    them from two different categories, anything else picks freely.
    """
    cats = [c for c in (categories or list(TOPIC_CATEGORIES.keys()))
            if c in TOPIC_CATEGORIES]
    pool = {c: TOPIC_CATEGORIES[c] for c in cats} or TOPIC_CATEGORIES
    flat = [t for ts in pool.values() for t in ts]
    if len(flat) < 2:
        return tuple(random.sample(TOPICS, 2))

    if difficulty == "easy":
        usable = [c for c, ts in pool.items() if len(ts) >= 2]
        if usable:
            c = random.choice(usable)
            a, b = random.sample(pool[c], 2)
            return a, b

    if difficulty == "hard" and len(pool) >= 2:
        c1, c2 = random.sample(list(pool.keys()), 2)
        return random.choice(pool[c1]), random.choice(pool[c2])

    a, b = random.sample(flat, 2)
    return a, b


_LINK_RE = re.compile(r'href="\./([^"#]*)(#[^"]*)?"')
_BASE_RE = re.compile(r"<base\b[^>]*/?>", re.IGNORECASE)
_SCRIPT_RE = re.compile(r"<script\b[^>]*>.*?</script>", re.IGNORECASE | re.DOTALL)


def fetch_article_html(title: str) -> str:
    """Get the rendered article HTML from the Wikipedia REST API and rewrite it
    so internal links stay in our app."""
    url = REST_HTML + quote(title, safe="")
    r = requests.get(url, headers=HEADERS, timeout=20)
    if r.status_code == 404:
        raise WikiError(f"Article not found: {title}")
    r.raise_for_status()
    html = r.text

    # 1. Drop <base href="//en.wikipedia.org/wiki/"> so relative URLs don't escape.
    html = _BASE_RE.sub("", html)

    # 2. Rewrite internal article links (./Article_Title) to go through our proxy.
    def link_repl(m: re.Match) -> str:
        return f'href="/play/article/{m.group(1)}{m.group(2) or ""}"'
    html = _LINK_RE.sub(link_repl, html)

    # 3. External links open in a new tab, so they don't trap the player.
    html = html.replace('rel="mw:ExtLink"', 'rel="mw:ExtLink noopener" target="_blank"')

    # 4. Strip scripts — we control the chrome from the parent frame.
    html = _SCRIPT_RE.sub("", html)

    # 5. Inject Wikipedia's stylesheet + our own tweaks so the article looks right.
    inject = (
        '<link rel="stylesheet" '
        'href="https://en.wikipedia.org/w/load.php?'
        'modules=site.styles%7Cext.cite.styles%7Cmediawiki.skinning.content.parsoid'
        '&only=styles&skin=vector">'
        '<link rel="stylesheet" href="/static/article.css">'
    )
    if "</head>" in html:
        html = html.replace("</head>", inject + "</head>", 1)
    else:
        html = inject + html
    return html


def title_from_url_segment(seg: str) -> str:
    """Decode a URL path segment back into a Wikipedia title."""
    return unquote(seg).replace("_", " ")
