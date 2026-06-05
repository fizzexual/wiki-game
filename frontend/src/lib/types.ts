export type Difficulty = "easy" | "any" | "hard";
export type Theme = "light" | "dark";

export interface Settings {
  categories: string[] | null;   // null = all
  difficulty: Difficulty;
  timeLimit: number;             // seconds; 0 = unlimited
  maxClicks: number;             // 0 = unlimited
  allowBack: boolean;
}

export interface RandomPair {
  start: string;
  end: string;
}

export interface PathEvent {
  type: "resolved" | "progress" | "result" | "error";
  start?: string;
  end?: string;
  side?: "forward" | "backward" | "precompute";
  depth?: number;
  frontier?: number;
  visited?: number;
  path?: string[];
  elapsed?: number;
  message?: string;
}

export interface PrecomputeStatus {
  status: "unknown" | "computing" | "done" | "error";
  hops?: number | null;
  message?: string;
  elapsed?: number;
}

/** Per-run challenge settings collected from the modal. */
export interface ChallengeRunSettings {
  difficulty: "easy" | "medium" | "hard";
  timeLimit: number;
  maxClicks: number;
  allowBack: boolean;
}

/** A challenge as the player picks it from the menu. The actual chain of
 * topics is generated at start time so each play is a fresh random run. */
export interface ChallengeTemplate {
  id: string;
  name: string;
  description: string;
  topicCount: number;
}

/** A challenge with concrete topics resolved for a single play session. */
export interface Challenge {
  id: string;
  name: string;
  description: string;
  topics: string[];          // sequence: visit each in order
}

export type GameMode =
  | { kind: "random" }
  | { kind: "challenge"; challenge: Challenge };

export interface AttemptRecord {
  start: string;
  end: string;
  result: "won" | "lost";
  clicks: number;
  timeSec: number;
  optimalHops: number | null;
  at: number;
  mode?: "random" | "challenge";
  challengeId?: string;
  stagesCompleted?: number;
  stagesTotal?: number;
}
