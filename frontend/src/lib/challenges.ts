import type { Challenge } from "./types";

export const CHALLENGES: Challenge[] = [
  {
    id: "five-topics",
    name: "Five Topics",
    description:
      "Visit five articles in order. The next target is hidden until you reach the previous one.",
    topics: ["Pizza", "Marie Curie", "Telescope", "Mars", "Cleopatra"],
  },
];

export function findChallenge(id: string): Challenge | undefined {
  return CHALLENGES.find((c) => c.id === id);
}
