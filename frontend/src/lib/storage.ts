import type { AttemptRecord, Settings, Theme } from "./types";

const HISTORY_KEY = "wg-history";
const SETTINGS_KEY = "wg-settings";
const THEME_KEY = "wg-theme";
const HISTORY_MAX = 10;

export const DEFAULT_SETTINGS: Settings = {
  categories: null,
  difficulty: "any",
  timeLimit: 0,
  maxClicks: 0,
  allowBack: true,
};

function safeGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function safeSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...safeGet<Partial<Settings>>(SETTINGS_KEY, {}) };
}
export function saveSettings(s: Settings): void {
  safeSet(SETTINGS_KEY, s);
}

export function loadHistory(): AttemptRecord[] {
  return safeGet<AttemptRecord[]>(HISTORY_KEY, []);
}
export function clearHistory(): void {
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    /* ignore */
  }
}
export function recordAttempt(entry: AttemptRecord): AttemptRecord[] {
  const h = loadHistory();
  h.unshift(entry);
  while (h.length > HISTORY_MAX) h.pop();
  safeSet(HISTORY_KEY, h);
  return h;
}
export function patchLatestOptimal(
  start: string,
  end: string,
  optimalHops: number,
): AttemptRecord[] {
  const h = loadHistory();
  for (const item of h) {
    if (item.start === start && item.end === end && item.optimalHops == null) {
      item.optimalHops = optimalHops;
      break;
    }
  }
  safeSet(HISTORY_KEY, h);
  return h;
}

export function loadTheme(): Theme {
  const t = safeGet<string | null>(THEME_KEY, null);
  if (t === "light" || t === "dark") return t;
  if (typeof window !== "undefined" && window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: light)").matches) {
    return "light";
  }
  return "dark";
}
export function saveTheme(t: Theme): void {
  safeSet(THEME_KEY, t);
}
