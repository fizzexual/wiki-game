// Bidirectional breadth-first search between two Wikipedia articles.
// Client-side port of wiki.py's find_path: forward from the start via
// prop=links, backward from the target via prop=linkshere, meeting in the
// middle. Yields progress events and a final result/error event.
import type { PathEvent } from "../types";
import { expand, normalizeTitleApi } from "./wikiApi";

const MAX_DEPTH_EACH_SIDE = 4; // hard ceiling — total path length capped at 8

function reconstruct(
  parentsFwd: Map<string, string | null>,
  parentsBwd: Map<string, string | null>,
  meet: string,
): string[] {
  const fwd: string[] = [];
  let cur: string | null | undefined = meet;
  while (cur != null) {
    fwd.push(cur);
    cur = parentsFwd.get(cur);
  }
  fwd.reverse();
  const bwd: string[] = [];
  cur = parentsBwd.get(meet);
  while (cur != null) {
    bwd.push(cur);
    cur = parentsBwd.get(cur);
  }
  return [...fwd, ...bwd];
}

/** Async generator over the BFS search. Event shapes match PathEvent. */
export async function* findPath(start: string, end: string): AsyncGenerator<PathEvent> {
  const t0 = Date.now();

  const startN = await normalizeTitleApi(start);
  if (!startN) {
    yield { type: "error", message: `Couldn't find a Wikipedia page for '${start}'.` };
    return;
  }
  const endN = await normalizeTitleApi(end);
  if (!endN) {
    yield { type: "error", message: `Couldn't find a Wikipedia page for '${end}'.` };
    return;
  }

  yield { type: "resolved", start: startN, end: endN };

  if (startN === endN) {
    yield { type: "result", path: [startN], elapsed: 0 };
    return;
  }

  const parentsFwd = new Map<string, string | null>([[startN, null]]);
  const parentsBwd = new Map<string, string | null>([[endN, null]]);
  let frontierFwd: string[] = [startN];
  let frontierBwd: string[] = [endN];
  let depthFwd = 0;
  let depthBwd = 0;

  while (frontierFwd.length && frontierBwd.length) {
    // Expand whichever side is smaller to keep the search balanced.
    const goForward = frontierFwd.length <= frontierBwd.length;

    if (goForward) {
      if (depthFwd >= MAX_DEPTH_EACH_SIDE) {
        yield { type: "error", message: "Search exceeded depth limit without finding a path." };
        return;
      }
      depthFwd++;
      yield {
        type: "progress", side: "forward", depth: depthFwd,
        frontier: frontierFwd.length, visited: parentsFwd.size,
      };
      const expansion = await expand(frontierFwd, "out");
      const newFrontier: string[] = [];
      let meet: string | null = null;
      for (const [src, targets] of Object.entries(expansion)) {
        for (const t of targets) {
          if (parentsFwd.has(t)) continue;
          parentsFwd.set(t, src);
          newFrontier.push(t);
          if (parentsBwd.has(t)) { meet = t; break; }
        }
        if (meet) break;
      }
      frontierFwd = newFrontier;
      if (meet) {
        yield { type: "result", path: reconstruct(parentsFwd, parentsBwd, meet), elapsed: (Date.now() - t0) / 1000 };
        return;
      }
    } else {
      if (depthBwd >= MAX_DEPTH_EACH_SIDE) {
        yield { type: "error", message: "Search exceeded depth limit without finding a path." };
        return;
      }
      depthBwd++;
      yield {
        type: "progress", side: "backward", depth: depthBwd,
        frontier: frontierBwd.length, visited: parentsBwd.size,
      };
      const expansion = await expand(frontierBwd, "in");
      const newFrontier: string[] = [];
      let meet: string | null = null;
      for (const [src, targets] of Object.entries(expansion)) {
        // `targets` link TO src; for the backward tree the parent of each is src.
        for (const t of targets) {
          if (parentsBwd.has(t)) continue;
          parentsBwd.set(t, src);
          newFrontier.push(t);
          if (parentsFwd.has(t)) { meet = t; break; }
        }
        if (meet) break;
      }
      frontierBwd = newFrontier;
      if (meet) {
        yield { type: "result", path: reconstruct(parentsFwd, parentsBwd, meet), elapsed: (Date.now() - t0) / 1000 };
        return;
      }
    }
  }

  yield { type: "error", message: "No path found." };
}
