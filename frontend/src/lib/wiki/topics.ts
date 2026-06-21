// Topic pool + random pair/chain selection.
// Client-side port of the topic logic that used to live in wiki.py. The topic
// list (topics.json) is bundled into the build so no server is needed.
import topicsData from "./topics.json";

export type TopicMap = Record<string, string[]>;

// topics.json is a { category: [titles...] } object.
export const TOPIC_CATEGORIES: TopicMap = topicsData as TopicMap;
export const TOPICS: string[] = Object.values(TOPIC_CATEGORIES).flat();

// Hub articles for the Hub Hunter challenge — routing crutches linked from
// almost everything. Touching one ends the run.
export const HUB_ARTICLES: string[] = [
  "United States", "World War II", "World War I", "English language",
  "United Kingdom", "Latin", "France", "Germany", "China",
  "Christianity", "London", "Paris", "European Union", "United Nations",
  "Catholic Church", "Russia", "Japan", "India", "California",
  "New York City", "Australia", "Italy", "Greek language", "Roman Empire",
  "Soviet Union", "Spain", "Canada", "Africa", "Europe", "Asia",
  "Earth", "Sun", "Human", "Animal", "Plant",
  "Bible", "Music", "Religion", "Language",
];

// ---- small random helpers (mirror Python's random.choice/sample/shuffle) ----

function choice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** In-place Fisher–Yates shuffle; returns the same array for convenience. */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Pick `k` distinct elements at random (like random.sample). */
function sample<T>(arr: T[], k: number): T[] {
  return shuffle(arr.slice()).slice(0, k);
}

function validCategories(categories?: string[] | null): string[] {
  const cats = (categories && categories.length ? categories : Object.keys(TOPIC_CATEGORIES))
    .filter((c) => TOPIC_CATEGORIES[c] && TOPIC_CATEGORIES[c].length);
  return cats.length ? cats : Object.keys(TOPIC_CATEGORIES).filter((c) => TOPIC_CATEGORIES[c].length);
}

/** Return a random (start, end) pair of well-known topics. */
export function randomPair(
  categories?: string[] | null,
  difficulty: string = "any",
): [string, string] {
  const cats = (categories && categories.length ? categories : Object.keys(TOPIC_CATEGORIES))
    .filter((c) => c in TOPIC_CATEGORIES);
  const pool: TopicMap = {};
  for (const c of cats) pool[c] = TOPIC_CATEGORIES[c];
  const effective = Object.keys(pool).length ? pool : TOPIC_CATEGORIES;
  const flat = Object.values(effective).flat();
  if (flat.length < 2) {
    const [a, b] = sample(TOPICS, 2);
    return [a, b];
  }

  if (difficulty === "easy") {
    const usable = Object.keys(effective).filter((c) => effective[c].length >= 2);
    if (usable.length) {
      const c = choice(usable);
      const [a, b] = sample(effective[c], 2);
      return [a, b];
    }
  }

  if (difficulty === "hard" && Object.keys(effective).length >= 2) {
    const [c1, c2] = sample(Object.keys(effective), 2);
    return [choice(effective[c1]), choice(effective[c2])];
  }

  const [a, b] = sample(flat, 2);
  return [a, b];
}

/** Return `n` distinct random topics for a multi-stage run. */
export function randomChain(
  n: number = 5,
  categories?: string[] | null,
  difficulty: string = "medium",
): string[] {
  n = Math.max(2, Math.min(n, 12));
  let cats = validCategories(categories);

  if (difficulty === "easy") {
    const c = choice(cats);
    const pool = TOPIC_CATEGORIES[c];
    let top = pool.slice(0, Math.max(n * 4, Math.floor(pool.length / 5)));
    if (top.length < n) top = pool.slice(0, Math.max(n, pool.length));
    return sample(top, Math.min(n, top.length));
  }

  if (difficulty === "hard") {
    let ordered = shuffle(cats.slice());
    if (ordered.length < n) {
      const repeated: string[] = [];
      while (repeated.length < n) repeated.push(...ordered);
      ordered = repeated.slice(0, n);
    } else {
      ordered = ordered.slice(0, n);
    }
    const used = new Set<string>();
    const out: string[] = [];
    for (const c of ordered) {
      const pool = TOPIC_CATEGORIES[c];
      const deep = pool.slice(Math.floor(pool.length / 2));
      const candidates = deep.filter((t) => !used.has(t)).length
        ? deep.filter((t) => !used.has(t))
        : pool.filter((t) => !used.has(t));
      if (!candidates.length) continue;
      const t = choice(candidates);
      out.push(t);
      used.add(t);
    }
    while (out.length < n) {
      const remaining = TOPICS.filter((t) => !used.has(t));
      if (!remaining.length) break;
      const t = choice(remaining);
      out.push(t);
      used.add(t);
    }
    return shuffle(out);
  }

  // medium: round-robin across shuffled categories.
  cats = shuffle(cats.slice());
  const used = new Set<string>();
  const out: string[] = [];
  while (out.length < n && cats.length) {
    let progress = false;
    for (const c of cats) {
      if (out.length >= n) break;
      const pool = TOPIC_CATEGORIES[c].filter((t) => !used.has(t));
      if (!pool.length) continue;
      const t = choice(pool);
      out.push(t);
      used.add(t);
      progress = true;
    }
    if (!progress) break;
  }
  if (out.length < n) {
    const remaining = shuffle(TOPICS.filter((t) => !used.has(t)));
    out.push(...remaining.slice(0, n - out.length));
  }
  return shuffle(out);
}

export { choice, shuffle, sample };
