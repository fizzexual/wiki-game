# The Wiki Game

Connect two Wikipedia articles using only the links inside the page.
Fewer clicks is better.

```
Telescope → Astronomy → Marathon
```

**▶ Play it live: https://fizzexual.github.io/wiki-game/**

## How it works

The game runs entirely in your browser — there is no backend. It talks
directly to Wikipedia's public, CORS-enabled APIs:

- **Article view** — each page is fetched from the Wikipedia REST API, its
  internal links are rewritten to stay inside the app, and it's rendered in an
  iframe via `srcdoc`. A small injected script reports your link clicks to the
  game so it can count them, without injecting anything back into Wikipedia.
- **Optimal path** — when a round starts, a bidirectional breadth-first search
  runs in the background against the Action API (forward from the start via
  `prop=links`, backward from the target via `prop=linkshere`, meeting in the
  middle). By the time you give up or solve the puzzle, the shortest path is
  cached and revealed instantly.

Because everything is client-side, it deploys to GitHub Pages as a static site
(see [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)).

## Develop

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173/wiki-game/
```

`npm run build` produces the static bundle in `frontend/dist`. The Vite `base`
defaults to `/wiki-game/` for GitHub Pages; override it with `VITE_BASE=/` for a
root-hosted build. Requires Node 18+.

> The original Flask backend (`app.py`, `wiki.py`) is kept for reference and
> still works for a local full-stack run (`pip install -r requirements.txt &&
> python app.py`), but it is no longer needed — the deployed game is fully
> client-side.

## Features

- Random pairs from a curated, categorised topic list — no obscure stubs
- Configurable challenge: categories, difficulty, time limit, click cap,
  no-back-button mode
- Six challenge modes: Five Topics, Mystery Target, Hot Potato, Hub Hunter,
  Reverse BFS, Split View
- Embedded browser-style view of Wikipedia
- Optimal-path reveal at game end (your clicks vs. shortest possible)
- Recent attempts saved locally
- Light / dark theme

## Stack

React 18 + TypeScript + Vite · Wikipedia REST + Action APIs · GitHub Pages
