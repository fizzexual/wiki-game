import type { GameMode } from "../lib/types";

interface Props {
  mode: GameMode;
  // random mode: just start + end
  start: string;
  end: string;
  // challenge mode: full chain + which stage is current (index into topics)
  // stageIdx 0 = at start, 1 = reached topics[1], etc.
  stageIdx?: number;
  // shared
  clicks: string;       // already-formatted (e.g. "3 / 7" or "—")
  timer: string;        // already-formatted (e.g. "0:42" or "—")
  giveUpVisible: boolean;
  onGiveUp: () => void;
}

export function HUD({ mode, start, end, stageIdx = 0, clicks, timer, giveUpVisible, onGiveUp }: Props) {
  if (mode.kind === "challenge") {
    const topics = mode.challenge.topics;
    // stageIdx semantics:
    //   = number of targets already reached, starting from topics[0]
    //   stageIdx = 0  → at Pizza,        next target is topics[1]
    //   stageIdx = 1  → reached Marie C., next target is topics[2]
    //   stageIdx = N-1 (last) → finished
    return (
      <header className="hud">
        <div className="stage-chain">
          {topics.map((t, i) => {
            const isPast    = i < stageIdx;
            const isHere    = i === stageIdx;             // current location
            const isTarget  = i === stageIdx + 1;          // where to go next
            const isLocked  = i > stageIdx + 1;            // hidden future stages
            const cls =
              isTarget ? "stage-pill current"
              : isPast ? "stage-pill done"
              : isHere ? "stage-pill here"
              : "stage-pill locked";
            const label = isLocked ? "?" : t;
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
        <div className="hud-meta">
          <div className="hud-stat"><span>{clicks}</span><span className="hud-stat-label">clicks</span></div>
          <div className="hud-stat"><span>{timer}</span><span className="hud-stat-label">time</span></div>
          {giveUpVisible && (
            <button className="ghost small" onClick={onGiveUp}>Give up</button>
          )}
        </div>
      </header>
    );
  }

  return (
    <header className="hud">
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
      <div className="hud-meta">
        <div className="hud-stat"><span>{clicks}</span><span className="hud-stat-label">clicks</span></div>
        <div className="hud-stat"><span>{timer}</span><span className="hud-stat-label">time</span></div>
        {giveUpVisible && (
          <button className="ghost small" onClick={onGiveUp}>Give up</button>
        )}
      </div>
    </header>
  );
}
