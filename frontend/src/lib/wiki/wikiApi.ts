// Low-level Wikipedia Action API client, running in the browser.
// Every request adds `origin=*` so Wikipedia returns permissive CORS headers
// and the call works from a static GitHub Pages origin — no proxy server.

export const API = "https://en.wikipedia.org/w/api.php";

const BATCH_SIZE = 50;          // max titles per query
const WORKERS = 3;              // parallel requests (Wikipedia 429s above this)
const PER_PAGE_LINK_CAP = 400;  // keep megapages ("List of…") from exploding the frontier
const MAX_RETRIES = 4;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** GET against the Action API with JSON formatversion 2 and CORS enabled. */
export async function apiGet(params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams({
    format: "json",
    formatversion: "2",
    origin: "*",
    ...params,
  });
  let backoff = 500;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const r = await fetch(`${API}?${qs.toString()}`);
    if (r.status === 429 || r.status >= 500) {
      const retryAfter = parseFloat(r.headers.get("Retry-After") || "");
      const wait = Number.isFinite(retryAfter) ? retryAfter * 1000 : backoff;
      await sleep(Math.min(wait, 5000));
      backoff *= 2;
      continue;
    }
    if (!r.ok) throw new Error(`Wikipedia API ${r.status}`);
    return r.json();
  }
  throw new Error("Wikipedia API: too many retries");
}

/** Resolve a user/typed title to its canonical form, following redirects.
 *  Returns null if the page doesn't exist. */
export async function normalizeTitleApi(raw: string): Promise<string | null> {
  raw = raw.trim();
  if (!raw) return null;
  const data = await apiGet({ action: "query", titles: raw, redirects: "1" });
  const pages = data?.query?.pages ?? [];
  if (!pages.length) return null;
  const p = pages[0];
  if (p.missing) return null;
  return p.title ?? null;
}

function* batches<T>(items: T[], n: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += n) yield items.slice(i, i + n);
}

/** Forward links (direction 'out') or backlinks ('in') for a batch of titles.
 *  Returns { sourceTitle: [linkedTitles] }, handling continue-token pagination. */
async function fetchLinkBatch(
  titles: string[],
  direction: "out" | "in",
): Promise<Record<string, string[]>> {
  const prop = direction === "out" ? "links" : "linkshere";
  const prefix = direction === "out" ? "pl" : "lh";
  const base: Record<string, string> = {
    action: "query",
    prop,
    titles: titles.join("|"),
    redirects: "1",
    [`${prefix}namespace`]: "0",
    [`${prefix}limit`]: "max",
  };
  const out: Record<string, string[]> = {};
  for (const t of titles) out[t] = [];

  let cont: Record<string, string> = {};
  for (let safety = 0; safety < 10; safety++) {
    const data = await apiGet({ ...base, ...cont });
    for (const page of data?.query?.pages ?? []) {
      const src = page.title;
      if (!src) continue;
      for (const link of page[prop] ?? []) {
        if (link.title) (out[src] ??= []).push(link.title);
      }
    }
    if (data.continue) cont = data.continue;
    else break;
  }
  for (const k of Object.keys(out)) {
    if (out[k].length > PER_PAGE_LINK_CAP) out[k] = out[k].slice(0, PER_PAGE_LINK_CAP);
  }
  return out;
}

/** Run async thunks with a fixed concurrency limit. */
async function pool<T>(thunks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = [];
  let i = 0;
  async function worker() {
    while (i < thunks.length) {
      const idx = i++;
      try {
        results[idx] = await thunks[idx]();
      } catch {
        // a single failed batch shouldn't kill the whole expansion
        results[idx] = undefined as unknown as T;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, thunks.length) }, worker));
  return results;
}

/** Expand a BFS frontier in parallel batches, merging the results. */
export async function expand(
  titles: string[],
  direction: "out" | "in",
): Promise<Record<string, string[]>> {
  const thunks = [...batches(titles, BATCH_SIZE)].map(
    (batch) => () => fetchLinkBatch(batch, direction),
  );
  const parts = await pool(thunks, WORKERS);
  const merged: Record<string, string[]> = {};
  for (const part of parts) {
    if (part) Object.assign(merged, part);
  }
  return merged;
}
