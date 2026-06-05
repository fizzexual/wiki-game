import type { PathEvent, PrecomputeStatus, RandomPair, Settings } from "./types";

function buildPairQuery(s: Pick<Settings, "categories" | "difficulty">): string {
  const qs = new URLSearchParams();
  if (s.categories) s.categories.forEach((c) => qs.append("category", c));
  if (s.difficulty) qs.set("difficulty", s.difficulty);
  return qs.toString();
}

export async function fetchCategories(): Promise<string[]> {
  const r = await fetch("/api/categories");
  if (!r.ok) return [];
  return r.json();
}

export async function fetchRandomPair(
  s: Pick<Settings, "categories" | "difficulty">,
): Promise<RandomPair> {
  const r = await fetch("/api/random-pair?" + buildPairQuery(s));
  if (!r.ok) throw new Error("random-pair failed");
  return r.json();
}

export function articleUrl(title: string): string {
  return "/play/article/" + encodeURIComponent(title.replace(/ /g, "_"));
}

export async function startPrecompute(start: string, end: string): Promise<void> {
  await fetch("/api/precompute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ start, end }),
  });
}

export async function getPrecomputeStatus(
  start: string,
  end: string,
): Promise<PrecomputeStatus> {
  const r = await fetch(
    `/api/precompute-status?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
  );
  if (!r.ok) return { status: "unknown" };
  return r.json();
}

/**
 * Open an SSE stream for the optimal-path search. The returned EventSource
 * forwards parsed events to `onEvent`. Caller must close it when done.
 */
export function streamOptimalPath(
  start: string,
  end: string,
  onEvent: (e: PathEvent) => void,
  onError?: () => void,
): EventSource {
  const url = `/api/play?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
  const es = new EventSource(url);
  es.onmessage = (ev) => {
    try {
      onEvent(JSON.parse(ev.data));
    } catch {
      /* ignore malformed */
    }
  };
  es.onerror = () => onError && onError();
  return es;
}

/** Promise wrapper for a single-segment optimal path lookup. */
export function fetchOptimalSegment(start: string, end: string): Promise<string[] | null> {
  return new Promise((resolve) => {
    const es = streamOptimalPath(
      start,
      end,
      (e) => {
        if (e.type === "result") { es.close(); resolve(e.path ?? null); }
        else if (e.type === "error") { es.close(); resolve(null); }
      },
      () => { es.close(); resolve(null); },
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
