import type { Challenge, ChallengeKind, ChallengeTemplate } from "./types";

export const CHALLENGE_TEMPLATES: ChallengeTemplate[] = [
  {
    id: "five-topics",
    name: "Five Topics",
    description:
      "Five random Wikipedia articles in a row. A fresh chain is generated every play — each next target stays hidden until you reach the previous one.",
    topicCount: 5,
    kind: "linear",
  },
  {
    id: "mystery-target",
    name: "Mystery Target",
    description:
      "Each target is shown as a masked clue from its Wikipedia summary — figure out what you're racing toward, then navigate there.",
    topicCount: 5,
    kind: "mystery",
  },
  {
    id: "hot-potato",
    name: "Hot Potato",
    description:
      "Every stage has a must-visit anchor AND a must-avoid taboo. Hit the anchor on the way; touch the taboo and the run ends instantly.",
    topicCount: 4,
    kind: "hot-potato",
  },
  {
    id: "hub-hunter",
    name: "Hub Hunter",
    description:
      "A list of huge hub articles is banned (United States, World War II, English language…). Touch any of them and the run ends. Forces creative paths.",
    topicCount: 5,
    kind: "hub-hunter",
  },
  {
    id: "reverse-bfs",
    name: "Reverse BFS",
    description:
      "The optimal hop count is revealed before each stage starts. Match it, beat it, or accept the overhead — the BFS sets the bar.",
    topicCount: 4,
    kind: "reverse-bfs",
  },
  {
    id: "split-view",
    name: "Split View",
    description:
      "The target article sits open on the right half of the screen the whole time. You navigate on the left, watching for connection points in the right pane.",
    topicCount: 4,
    kind: "split-view",
  },
];

export function findTemplate(id: string): ChallengeTemplate | undefined {
  return CHALLENGE_TEMPLATES.find((t) => t.id === id);
}

/** Fetch a random topic chain + kind-specific metadata from the server. */
export async function resolveChallenge(
  template: ChallengeTemplate,
  difficulty: "easy" | "medium" | "hard" = "medium",
): Promise<Challenge> {
  const params = new URLSearchParams({
    n: String(template.topicCount),
    difficulty,
    kind: template.kind,
  });
  const r = await fetch(`/api/challenge-chain?${params.toString()}`);
  if (!r.ok) throw new Error("challenge-chain failed");
  const data = await r.json();
  const topics: string[] = data.topics ?? [];
  if (topics.length < 2) throw new Error("not enough topics returned");
  const challenge: Challenge = {
    id: template.id,
    name: template.name,
    description: template.description,
    topics,
    kind: template.kind,
  };
  if (Array.isArray(data.clues))   challenge.clues   = data.clues;
  if (Array.isArray(data.anchors)) challenge.anchors = data.anchors;
  if (Array.isArray(data.taboos))  challenge.taboos  = data.taboos;
  if (Array.isArray(data.hubs))    challenge.hubs    = data.hubs;
  return challenge;
}

export const DEFAULT_CHALLENGE_SETTINGS = {
  difficulty: "medium" as const,
  timeLimit: 0,
  maxClicks: 0,
  allowBack: true,
};

export const CHALLENGE_KIND_LABEL: Record<ChallengeKind, string> = {
  "linear":      "Linear",
  "mystery":     "Mystery",
  "hot-potato":  "Hot Potato",
  "hub-hunter":  "Hub Hunter",
  "reverse-bfs": "Reverse BFS",
  "split-view":  "Split View",
};
