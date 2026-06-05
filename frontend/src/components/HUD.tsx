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
    return (
      <header className="hud">
        <div className="stage-chain">
          {topics.map((t, i) => {
            const isDone = i < stageIdx;
            const isCurrent = i === stageIdx;
            const isLocked = i > stageIdx + 1; // current target visible; further ones locked
            const isVisibleNext = i === stageIdx + 1;
            const cls = isCurrent
              ? "stage-pill current"
              : isDone
              ? "stage-pill done"
              : isVisibleNext
              ? "stage-pill"
              : isLocked
              ? "stage-pill locked"
              : "stage-pill";
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
