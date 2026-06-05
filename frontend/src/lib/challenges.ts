import type { Challenge, ChallengeTemplate } from "./types";

export const CHALLENGE_TEMPLATES: ChallengeTemplate[] = [
  {
    id: "five-topics",
    name: "Five Topics",
    description:
      "Five random Wikipedia articles in a row. A fresh chain is generated every play — each next target stays hidden until you reach the previous one.",
    topicCount: 5,
  },
];

export function findTemplate(id: string): ChallengeTemplate | undefined {
  return CHALLENGE_TEMPLATES.find((t) => t.id === id);
}

/** Fetch a random topic chain from the server and bind it to a template. */
export async function resolveChallenge(
  template: ChallengeTemplate,
  difficulty: "easy" | "medium" | "hard" = "medium",
): Promise<Challenge> {
  const r = await fetch(
    `/api/random-chain?n=${template.topicCount}&difficulty=${difficulty}`,
  );
  if (!r.ok) throw new Error("random-chain failed");
  const data = await r.json();
  const topics: string[] = data.topics ?? [];
  if (topics.length < 2) throw new Error("not enough topics returned");
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    topics,
  };
}

export const DEFAULT_CHALLENGE_SETTINGS = {
  difficulty: "medium" as const,
  timeLimit: 0,
  maxClicks: 0,
  allowBack: true,
};
