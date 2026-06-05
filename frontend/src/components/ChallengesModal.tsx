import { useEffect } from "react";
import { CHALLENGE_TEMPLATES } from "../lib/challenges";
import type { ChallengeTemplate } from "../lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (t: ChallengeTemplate) => void;
}

export function ChallengesModal({ open, onClose, onPick }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="challenges-title">
        <h2 id="challenges-title" className="modal-title">Challenges</h2>
        <p className="muted small" style={{ margin: "0 0 4px" }}>
          Multi-stage runs. Hit each target in order — the next one stays hidden until you reach it.
        </p>
        <div className="challenge-list">
          {CHALLENGE_TEMPLATES.map((t) => (
            <button
              key={t.id}
              type="button"
              className="challenge-item"
              onClick={() => onPick(t)}
            >
              <div className="challenge-item-head">
                <span className="challenge-name">{t.name}</span>
                <span className="challenge-meta">
                  {t.topicCount - 1} stage{t.topicCount - 1 === 1 ? "" : "s"}
                </span>
              </div>
              <span className="challenge-desc">{t.description}</span>
            </button>
          ))}
        </div>

        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
