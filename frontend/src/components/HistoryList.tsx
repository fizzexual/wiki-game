import type { AttemptRecord } from "../lib/types";
import { fmtTime } from "../lib/format";

interface Props {
  history: AttemptRecord[];
  onClear: () => void;
}

export function HistoryList({ history, onClear }: Props) {
  if (!history.length) return null;
  return (
    <section className="history-wrap">
      <div className="history-head">
        <h2 className="history-title">Recent attempts</h2>
        <button type="button" className="link-btn" onClick={onClear}>Clear</button>
      </div>
      <ol className="history-list">
        {history.map((item, i) => (
          <li className="history-item" key={i}>
            <span
              className={"history-result " + (item.result === "won" ? "won" : "lost")}
              title={item.result === "won" ? "Solved" : "Gave up"}
            />
            <span className="history-pair">
              {item.start}
              <span className="arrow">→</span>
              {item.end}
            </span>
            <span className="history-stats">
              {item.result === "won"
                ? `${item.clicks} click${item.clicks === 1 ? "" : "s"} · ${fmtTime(item.timeSec)}`
                : `gave up · ${fmtTime(item.timeSec)}`}
              {item.optimalHops != null && (
                <span className="vs-opt"> opt {item.optimalHops}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
