import { fmtTime } from "../lib/format";
import { PathDisplay } from "./PathDisplay";

interface Props {
  won: boolean;
  start: string;
  end: string;
  clicks: number;
  elapsedSec: number;
  yourPath: string[];
  optimalPath: string[] | null;
  optimalStatus: string;
  challengeName?: string;
  stagesDone?: number;
  stagesTotal?: number;
  onBackToMenu: () => void;
}

export function EndScreen({
  won, start, end, clicks, elapsedSec,
  yourPath, optimalPath, optimalStatus,
  challengeName, stagesDone, stagesTotal,
  onBackToMenu,
}: Props) {
  const headline = won
    ? challengeName
      ? `${challengeName} cleared in ${clicks} click${clicks === 1 ? "" : "s"}.`
      : `Solved in ${clicks} click${clicks === 1 ? "" : "s"}.`
    : challengeName && stagesDone != null && stagesTotal != null
      ? `Gave up after ${stagesDone}/${stagesTotal} stages.`
      : "Gave up.";

  const sub = won
    ? `Time: ${fmtTime(elapsedSec)} · ${start} → ${end}`
    : `You traveled ${clicks} hop${clicks === 1 ? "" : "s"} without reaching ${end}.`;

  const optHops = optimalPath ? optimalPath.length - 1 : null;

  return (
    <section className="screen" id="end">
      <div className="end-card">
        <h2>{headline}</h2>
        <p className="muted">{sub}</p>

        <div className="paths">
          <div className="path-col">
            <h3>Your path <span className="badge">{clicks} hop{clicks === 1 ? "" : "s"}</span></h3>
            <PathDisplay titles={yourPath.length ? yourPath : [start]} />
          </div>
          <div className="path-col">
            <h3>Optimal path <span className="badge accent">{optHops != null ? `${optHops} hop${optHops === 1 ? "" : "s"}` : "…"}</span></h3>
            {optimalPath
              ? <PathDisplay titles={optimalPath} />
              : <div className="muted small">{optimalStatus}</div>}
          </div>
        </div>

        <div className="end-actions">
          <button className="primary" onClick={onBackToMenu}>Back to menu</button>
        </div>
      </div>
    </section>
  );
}
