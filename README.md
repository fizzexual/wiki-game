# The Wiki Game

Connect two Wikipedia articles using only the links inside the page.
Fewer clicks is better.

```
Telescope → Astronomy → Marathon
```

## Run

```bash
pip install -r requirements.txt
python app.py
```

Open http://127.0.0.1:5000. Requires Python 3.10+.

## How it works

When a round starts, a bidirectional breadth-first search runs against the
Wikipedia API in the background — forward from the start via `prop=links`,
backward from the target via `prop=linkshere`, meeting in the middle. By the
time you give up or solve the puzzle, the optimal path is already cached and
revealed instantly.

The article you read is proxied through the server with internal links
rewritten to stay inside the app, which lets the game count your clicks
without injecting anything into Wikipedia.

## Features

- Random pairs from a curated, categorised topic list — no obscure stubs
- Configurable challenge: categories, difficulty, time limit, click cap,
  no-back-button mode
- Embedded browser-style view of proxied Wikipedia
- Optimal-path reveal at game end (your clicks vs. shortest possible)
- Recent attempts saved locally
- Light / dark theme

## Stack

Flask · vanilla HTML / CSS / JS · Wikipedia REST + Action APIs
