// Game "API" — formerly HTTP calls to the Flask backend, now run entirely in
// the browser against Wikipedia's public, CORS-enabled APIs. The exported
// surface is unchanged so the components didn't need rewiring.
import type { PathEvent, PrecomputeStatus, RandomPair, Settings } from "./types";
import { randomPair, TOPIC_CATEGORIES } from "./wiki/topics";
import { findPath } from "./wiki/pathfind";

/** Cancellable handle returned by streamOptimalPath (replaces EventSource). */
export interface PathStream {
  close(): void;
}

export async function fetchCategories(): Promise<string[]> {
  return Object.keys(TOPIC_CATEGORIES);
}

export async function fetchRandomPair(
  s: Pick<Settings, "categories" | "difficulty">,
): Promise<RandomPair> {
  const [start, end] = randomPair(s.categories, s.difficulty);
  return { start, end };
}

// ---- optimal-path cache + background precompute (was the Flask path cache) ----

type CacheEntry =
  | { status: "computing"; started: number }
  | { status: "done"; path: string[]; elapsed: number }
  | { status: "error"; message: string };

const cache = new Map<string, CacheEntry>();
const ck = (a: string, b: string) => `${a} ${b}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function runSearch(key: string, start: string, end: string): Promise<void> {
  const t0 = Date.now();
  try {
    let path: string[] | null = null;
    let message: string | null = null;
    for await (const ev of findPath(start, end)) {
      if (ev.type === "result") { path = ev.path ?? null; break; }
      if (ev.type === "error") { message = ev.message ?? null; break; }
    }
    if (path) cache.set(key, { status: "done", path, elapsed: (Date.now() - t0) / 1000 });
    else cache.set(key, { status: "error", message: message ?? "No path found." });
  } catch (e) {
    cache.set(key, { status: "error", message: String(e) });
  }
}

/** Kick off the optimal-path search in the background and cache the result. */
export async function startPrecompute(start: string, end: string): Promise<void> {
  const key = ck(start, end);
  const existing = cache.get(key);
  if (existing && (existing.status === "done" || existing.status === "computing")) return;
  cache.set(key, { status: "computing", started: Date.now() });
  void runSearch(key, start, end);
}

export async function getPrecomputeStatus(
  start: string,
  end: string,
): Promise<PrecomputeStatus> {
  const cur = cache.get(ck(start, end));
  if (!cur) return { status: "unknown" };
  if (cur.status === "done") return { status: "done", hops: cur.path.length - 1, elapsed: cur.elapsed };
  if (cur.status === "error") return { status: "error", message: cur.message };
  return { status: "computing" };
}

/**
 * Stream the optimal-path search, forwarding events to `onEvent`. Mirrors the
 * old SSE endpoint: serve a cached result instantly, wait on an in-flight
 * precompute, or run the search live. Returns a handle the caller closes.
 */
export function streamOptimalPath(
  start: string,
  end: string,
  onEvent: (e: PathEvent) => void,
  onError?: () => void,
): PathStream {
  let closed = false;
  const key = ck(start, end);

  (async () => {
    try {
      const cached = cache.get(key);
      if (cached?.status === "done") {
        onEvent({ type: "result", path: cached.path, elapsed: cached.elapsed });
        return;
      }
      if (cached?.status === "error") {
        onEvent({ type: "error", message: cached.message });
        return;
      }
      if (cached?.status === "computing") {
        const t0 = Date.now();
        while (!closed && Date.now() - t0 < 120000) {
          await sleep(500);
          const cur = cache.get(key);
          if (cur?.status === "done") { onEvent({ type: "result", path: cur.path, elapsed: cur.elapsed }); return; }
          if (cur?.status === "error") { onEvent({ type: "error", message: cur.message }); return; }
          onEvent({ type: "progress", side: "precompute", depth: 0, frontier: 0, visited: 0 });
        }
        if (!closed) onEvent({ type: "error", message: "Precompute timed out." });
        return;
      }

      // Nothing cached — run live, streaming progress and caching the outcome.
      const t0 = Date.now();
      for await (const ev of findPath(start, end)) {
        if (closed) return;
        onEvent(ev);
        if (ev.type === "result") cache.set(key, { status: "done", path: ev.path ?? [], elapsed: ev.elapsed ?? (Date.now() - t0) / 1000 });
        else if (ev.type === "error") cache.set(key, { status: "error", message: ev.message ?? "No path found." });
      }
    } catch {
      if (!closed) onError?.();
    }
  })();

  return { close() { closed = true; } };
}

/** Promise wrapper for a single-segment optimal path lookup. */
export function fetchOptimalSegment(start: string, end: string): Promise<string[] | null> {
  return new Promise((resolve) => {
    const stream = streamOptimalPath(
      start,
      end,
      (e) => {
        if (e.type === "result") { stream.close(); resolve(e.path ?? null); }
        else if (e.type === "error") { stream.close(); resolve(null); }
      },
      () => { stream.close(); resolve(null); },
    );
  });
}

/** Concatenate per-stage optimal paths for the first `throughStage` transitions
 *  of a topic chain. Used for the end-of-game reveal so locked future stages
 *  never surface. Boundary nodes are deduplicated between consecutive segments. */
export async function fetchOptimalChain(
  topics: string[],
  throughStage: number,
  onProgress?: (done: number, total: number) => void,
): Promise<string[] | null> {
  const target = Math.min(throughStage, topics.length - 1);
  const out: string[] = [];
  for (let i = 0; i < target; i++) {
    onProgress?.(i, target);
    const seg = await fetchOptimalSegment(topics[i], topics[i + 1]);
    if (!seg || seg.length === 0) return null;
    if (i === 0) out.push(...seg);
    else out.push(...seg.slice(1));
  }
  onProgress?.(target, target);
  return out;
}
