import { AnimatePresence, motion } from "framer-motion";
import type { GameMode } from "../lib/types";

interface Props {
  mode: GameMode;
  start: string;
  end: string;
  stageIdx?: number;
  clicks: string;
  timer: string;
  giveUpVisible: boolean;
  onGiveUp: () => void;
  // Kind-specific adornments
  clue?: string;
  anchor?: string;
  taboo?: string;
  anchorVisited?: boolean;
  hubCount?: number;
  currentOptimalHops?: number | null;
  hintMessage?: string | null;
}

export function HUD({
  mode, start, end, stageIdx = 0,
  clicks, timer, giveUpVisible, onGiveUp,
  clue, anchor, taboo, anchorVisited,
  hubCount, currentOptimalHops, hintMessage,
}: Props) {
  const challengeKind = mode.kind === "challenge" ? mode.challenge.kind : "linear";

  return (
    <header className="hud-stack">
      <div className="hud">
        {mode.kind === "challenge" ? (
          <ChallengeChain mode={mode} stageIdx={stageIdx} challengeKind={challengeKind} />
        ) : (
          <div className="hud-pair">
            <div className="hud-block">
              <span className="hud-label">From</span>
              <span className="hud-value">{start}</span>
            </div>
            <div className="hud-arrow">→</div>
            <div className="hud-block">
              <span className="hud-label">Target</span>
              <span className="hud-value target">{end}</span>
            </div>
          </div>
        )}
        <div className="hud-meta">
          {currentOptimalHops != null && (
            <div className="hud-stat hud-stat-optimal" title="Optimal hops for the current stage">
              <span>{currentOptimalHops}</span>
              <span className="hud-stat-label">opt</span>
            </div>
          )}
          <div className="hud-stat"><span>{clicks}</span><span className="hud-stat-label">clicks</span></div>
          <div className="hud-stat"><span>{timer}</span><span className="hud-stat-label">time</span></div>
          {hubCount != null && hubCount > 0 && (
            <span className="hub-badge" title="Hubs banned — touching any ends the run">
              {hubCount} hubs banned
            </span>
          )}
          {giveUpVisible && (
            <button className="ghost small" onClick={onGiveUp}>Give up</button>
          )}
        </div>
      </div>

      {/* Kind-specific second row */}
      {challengeKind === "mystery" && clue && (
        <motion.div
          key={`clue-${stageIdx}`}
          className="hud-row mystery-row"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <span className="row-label">Clue</span>
          <span className="row-text">{clue}</span>
        </motion.div>
      )}

      {challengeKind === "hot-potato" && (anchor || taboo) && (
        <motion.div
          key={`hp-${stageIdx}`}
          className="hud-row hot-potato-row"
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {anchor && (
            <span className={"hp-pill hp-anchor" + (anchorVisited ? " visited" : "")}>
              <span className="hp-tag">Anchor</span>
              {anchor}
              {anchorVisited && <span className="hp-tick">✓</span>}
            </span>
          )}
          {taboo && (
            <span className="hp-pill hp-taboo">
              <span className="hp-tag">Avoid</span>
              {taboo}
            </span>
          )}
        </motion.div>
      )}

      <AnimatePresence>
        {hintMessage && (
          <motion.div
            className="hud-hint"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            {hintMessage}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

interface ChainProps {
  mode: Extract<GameMode, { kind: "challenge" }>;
  stageIdx: number;
  challengeKind: string;
}

function ChallengeChain({ mode, stageIdx, challengeKind }: ChainProps) {
  const topics = mode.challenge.topics;
  const clues = mode.challenge.clues;
  return (
    <div className="stage-chain">
      {topics.map((t, i) => {
        const isPast   = i < stageIdx;
        const isHere   = i === stageIdx;
        const isTarget = i === stageIdx + 1;
        const isLocked = i > stageIdx + 1;
        const cls =
          isTarget ? "stage-pill current"
          : isPast ? "stage-pill done"
          : isHere ? "stage-pill here"
          : "stage-pill locked";

        // Mystery mode: hide the title of the upcoming target behind "?"
        let label: string;
        if (isLocked) label = "?";
        else if (challengeKind === "mystery" && (isTarget || isLocked) && clues) {
          // Target stays masked until the player reaches it; show "?" in pill,
          // full clue text appears in the row below.
          label = "?";
        } else label = t;

        return (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span className={cls} title={isLocked ? "Locked" : t}>
              <span className="pill-num">{i + 1}</span>
              {label}
            </span>
            {i < topics.length - 1 && <span className="stage-sep">→</span>}
          </span>
        );
      })}
    </div>
  );
}
