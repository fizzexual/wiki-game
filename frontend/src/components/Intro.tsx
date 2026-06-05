import type { AttemptRecord } from "../lib/types";
import { HistoryList } from "./HistoryList";

interface Props {
  history: AttemptRecord[];
  onStartRandom: () => void;
  onOpenChallenges: () => void;
  onClearHistory: () => void;
}

export function Intro({ history, onStartRandom, onOpenChallenges, onClearHistory }: Props) {
  return (
    <section className="screen" id="intro">
      <div className="intro-inner">
        <div className="intro-card">
          <h1>The Wiki Game</h1>
          <p>
            Get from one Wikipedia article to another using only the links inside the page.
            Fewer clicks is better.
          </p>
          <div className="intro-actions">
            <button type="button" className="primary" onClick={onStartRandom}>
              Start a random challenge
            </button>
            <button type="button" className="ghost" onClick={onOpenChallenges}>
              Challenges
            </button>
          </div>
        </div>
        <HistoryList history={history} onClear={onClearHistory} />
      </div>
    </section>
  );
}
