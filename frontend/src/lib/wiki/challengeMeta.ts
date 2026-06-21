// Challenge-specific metadata: masked clues (Mystery Target) and
// anchor/taboo pairs (Hot Potato). Client-side port of wiki.py.
import { HUB_ARTICLES, TOPICS, choice } from "./topics";

const REST_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/";
const SENTENCE_SPLIT = /(?<=[.!?])\s+(?=[A-Z])/;
const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "into", "that", "this",
  "are", "was", "were", "has", "have", "had", "his", "her",
  "its", "their",
]);

/** First sentence of an article's Wikipedia summary, or null. */
export async function fetchSummarySentence(title: string): Promise<string | null> {
  try {
    const r = await fetch(REST_SUMMARY + encodeURIComponent(title.replace(/ /g, "_")));
    if (!r.ok) return null;
    const extract = ((await r.json()).extract || "").trim();
    if (!extract) return null;
    const parts = extract.split(SENTENCE_SPLIT);
    const first = parts[0] || extract;
    return first.length > 20 ? first : extract.slice(0, 280);
  } catch {
    return null;
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Hide the title and its significant words in `text` behind blanks. */
export function maskTitle(title: string, text: string): string {
  if (!text) return text;
  const blank = "_____";
  let masked = text.replace(new RegExp(escapeRe(title), "gi"), blank);
  for (const word of title.match(/[A-Za-z][A-Za-z\-']{3,}/g) ?? []) {
    if (STOPWORDS.has(word.toLowerCase())) continue;
    masked = masked.replace(new RegExp("\\b" + escapeRe(word) + "[a-z]*\\b", "gi"), blank);
  }
  return masked;
}

/** One masked clue per target (topics[1..]). */
export async function makeClues(topics: string[]): Promise<string[]> {
  const clues: string[] = [];
  for (const t of topics.slice(1)) {
    const raw = await fetchSummarySentence(t);
    clues.push(raw ? maskTitle(t, raw) : "An article on Wikipedia.");
  }
  return clues;
}

/** For each stage transition pick an (anchor, taboo) pair: a forced-detour
 *  topic not in the chain, and a hub article the player must avoid. */
export function makeAnchorsTaboos(topics: string[]): { anchors: string[]; taboos: string[] } {
  const chainSet = new Set(topics);
  const candidates = TOPICS.filter((t) => !chainSet.has(t));
  const hubPool = HUB_ARTICLES.filter((h) => !chainSet.has(h));
  const anchors: string[] = [];
  const taboos: string[] = [];
  const usedAnchor = new Set<string>();
  const usedTaboo = new Set<string>();
  const stages = Math.max(0, topics.length - 1);
  for (let i = 0; i < stages; i++) {
    if (!candidates.length || !hubPool.length) break;
    const anchorChoices = candidates.filter((c) => !usedAnchor.has(c));
    const anchor = choice(anchorChoices.length ? anchorChoices : candidates);
    usedAnchor.add(anchor);
    const tabooChoices = hubPool.filter((h) => !usedTaboo.has(h));
    const taboo = choice(tabooChoices.length ? tabooChoices : hubPool);
    usedTaboo.add(taboo);
    anchors.push(anchor);
    taboos.push(taboo);
  }
  return { anchors, taboos };
}

/** Hub list minus any that appear in the chain (so the run stays winnable). */
export function hubsForChain(topics: string[]): string[] {
  const chainSet = new Set(topics);
  return HUB_ARTICLES.filter((h) => !chainSet.has(h));
}
