"""Flask server for the Wiki Game."""
import json
import os
import threading
import time

from flask import Flask, Response, jsonify, request, send_from_directory, stream_with_context, abort

import wiki

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(HERE, "frontend", "dist")

app = Flask(__name__)

# Cache of precomputed optimal paths, keyed by (start, end).
# Value shapes:
#   {"status": "computing", "started": float}
#   {"status": "done",      "path": [...], "elapsed": float}
#   {"status": "error",     "message": str}
_path_cache: dict[tuple[str, str], dict] = {}
_cache_lock = threading.Lock()


def _compute_in_background(start: str, end: str) -> None:
    started = time.time()
    try:
        path = None
        message = None
        for event in wiki.find_path(start, end):
            if event["type"] == "result":
                path = event["path"]
                break
            if event["type"] == "error":
                message = event["message"]
                break
        with _cache_lock:
            if path is not None:
                _path_cache[(start, end)] = {
                    "status": "done", "path": path,
                    "elapsed": time.time() - started,
                }
            else:
                _path_cache[(start, end)] = {
                    "status": "error",
                    "message": message or "No path found.",
                }
    except Exception as e:
        with _cache_lock:
            _path_cache[(start, end)] = {"status": "error", "message": str(e)}


@app.get("/")
def index():
    idx = os.path.join(DIST, "index.html")
    if not os.path.exists(idx):
        return (
            "Frontend not built. From the project root, run:\n\n"
            "    cd frontend && npm install && npm run build\n",
            503,
            {"Content-Type": "text/plain; charset=utf-8"},
        )
    return send_from_directory(DIST, "index.html")


@app.get("/assets/<path:filename>")
def assets(filename: str):
    return send_from_directory(os.path.join(DIST, "assets"), filename)


@app.get("/api/categories")
def categories():
    return jsonify(list(wiki.TOPIC_CATEGORIES.keys()))


@app.get("/api/random-pair")
def random_pair():
    cats = request.args.getlist("category")
    difficulty = request.args.get("difficulty", "any")
    a, b = wiki.random_pair(categories=cats or None, difficulty=difficulty)
    return jsonify({"start": a, "end": b})


@app.get("/api/precompute-status")
def precompute_status():
    start = request.args.get("start", "").strip()
    end = request.args.get("end", "").strip()
    if not start or not end:
        return jsonify({"status": "unknown"})
    with _cache_lock:
        cur = _path_cache.get((start, end))
    if not cur:
        return jsonify({"status": "unknown"})
    return jsonify({k: v for k, v in cur.items() if k != "path"} | {"hops": len(cur["path"]) - 1 if cur.get("path") else None})


@app.post("/api/precompute")
def precompute():
    data = request.get_json(silent=True) or {}
    start = (data.get("start") or "").strip()
    end = (data.get("end") or "").strip()
    if not start or not end:
        return jsonify({"error": "start and end required"}), 400
    key = (start, end)
    with _cache_lock:
        existing = _path_cache.get(key)
        if existing and existing.get("status") in ("done", "computing"):
            return jsonify({"status": existing["status"]})
        _path_cache[key] = {"status": "computing", "started": time.time()}
    threading.Thread(
        target=_compute_in_background, args=(start, end), daemon=True
    ).start()
    return jsonify({"status": "started"})


@app.get("/api/suggest")
def suggest():
    q = request.args.get("q", "")
    try:
        return jsonify(wiki.autocomplete(q))
    except Exception:
        return jsonify([]), 200


@app.get("/play/article/<path:title>")
def article(title: str):
    real_title = wiki.title_from_url_segment(title.split("#", 1)[0])
    try:
        html = wiki.fetch_article_html(real_title)
    except wiki.WikiError:
        abort(404)
    return Response(html, mimetype="text/html; charset=utf-8")


@app.get("/api/play")
def play():
    """SSE stream of the optimal-path search.

    Fast path: if the answer is already cached from a precompute call started
    when the game began, return it immediately. Otherwise either wait on the
    in-flight precompute or do the search live."""
    start = request.args.get("start", "")
    end = request.args.get("end", "")
    if not start or not end:
        return jsonify({"error": "start and end are required"}), 400
    key = (start, end)

    @stream_with_context
    def gen():
        with _cache_lock:
            cached = _path_cache.get(key)

        # Cached hit — instant reveal.
        if cached and cached["status"] == "done":
            yield f"data: {json.dumps({'type': 'result', 'path': cached['path'], 'elapsed': cached.get('elapsed', 0.0)})}\n\n"
            return
        if cached and cached["status"] == "error":
            yield f"data: {json.dumps({'type': 'error', 'message': cached['message']})}\n\n"
            return

        # In-flight — poll the cache until the background job finishes.
        if cached and cached["status"] == "computing":
            waited = 0.0
            while waited < 120.0:
                time.sleep(0.5)
                waited += 0.5
                with _cache_lock:
                    cur = _path_cache.get(key, {})
                if cur.get("status") == "done":
                    yield f"data: {json.dumps({'type': 'result', 'path': cur['path'], 'elapsed': cur.get('elapsed', waited)})}\n\n"
                    return
                if cur.get("status") == "error":
                    yield f"data: {json.dumps({'type': 'error', 'message': cur['message']})}\n\n"
                    return
                yield f"data: {json.dumps({'type': 'progress', 'side': 'precompute', 'depth': 0, 'frontier': 0, 'visited': 0})}\n\n"
            yield f"data: {json.dumps({'type': 'error', 'message': 'Precompute timed out.'})}\n\n"
            return

        # Nothing cached and no precompute — run live and stream progress.
        try:
            for event in wiki.find_path(start, end):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return Response(gen(), mimetype="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
    })


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False, threaded=True)
