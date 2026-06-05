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

/** Distinct gameplay variants. */
export type ChallengeKind =
  | "linear"        // standard chain (Five Topics, Marathon, Lightning…)
  | "mystery"       // targets shown as masked clues, not titles
  | "hot-potato"    // each stage has a must-visit anchor + must-avoid taboo
  | "hub-hunter"    // touching any "hub" article ends the run
  | "reverse-bfs"   // optimal hop count revealed upfront, beat or match it
  | "split-view";   // target article visible on the right half of the screen

/** A challenge as the player picks it from the menu. The actual chain of
 * topics is generated at start time so each play is a fresh random run. */
export interface ChallengeTemplate {
  id: string;
  name: string;
  description: string;
  topicCount: number;
  kind: ChallengeKind;
}

/** A challenge with concrete topics resolved for a single play session. */
export interface Challenge {
  id: string;
  name: string;
  description: string;
  topics: string[];          // sequence: visit each in order
  kind: ChallengeKind;
  // Kind-specific metadata. Only set for the relevant kinds.
  clues?: string[];          // mystery: one per target (index 0 = clue for topics[1])
  anchors?: string[];        // hot-potato: must-visit per stage
  taboos?: string[];         // hot-potato: must-avoid per stage
  hubs?: string[];           // hub-hunter: list of banned articles
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
