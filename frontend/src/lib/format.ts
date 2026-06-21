export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function normalizeTitle(t: string): string {
  return decodeURIComponent(t).replace(/_/g, " ").trim().toLowerCase();
}

export function wikiUrl(title: string): string {
  return "https://en.wikipedia.org/wiki/" + encodeURIComponent(title.replace(/ /g, "_"));
}
