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
