import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CHALLENGE_TEMPLATES, DEFAULT_CHALLENGE_SETTINGS } from "../lib/challenges";
import type { ChallengeRunSettings, ChallengeTemplate } from "../lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onStart: (template: ChallengeTemplate, settings: ChallengeRunSettings) => void;
}

const DIFFICULTY_OPTIONS: { value: ChallengeRunSettings["difficulty"]; label: string; hint: string }[] = [
  { value: "easy",   label: "Easy",   hint: "One category, top topics" },
  { value: "medium", label: "Medium", hint: "Mixed categories" },
  { value: "hard",   label: "Hard",   hint: "Cross-category, deeper pool" },
];

export function ChallengesModal({ open, onClose, onStart }: Props) {
  const [selected, setSelected] = useState<ChallengeTemplate | null>(null);
  const [settings, setSettings] = useState<ChallengeRunSettings>(DEFAULT_CHALLENGE_SETTINGS);
  const [starting, setStarting] = useState(false);

  // Reset selection when the modal closes.
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setSelected(null);
        setSettings(DEFAULT_CHALLENGE_SETTINGS);
        setStarting(false);
      }, 200);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selected) setSelected(null);
        else onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, selected, onClose]);

  const handleStart = () => {
    if (!selected || starting) return;
    setStarting(true);
    onStart(selected, settings);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div className="modal-backdrop" onClick={onClose} />
          <motion.div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="challenges-title"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
          >
            <AnimatePresence mode="wait" initial={false}>
              {!selected ? (
                <motion.div
                  key="list"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.18 }}
                >
                  <h2 id="challenges-title" className="modal-title">Challenges</h2>
                  <p className="muted small" style={{ margin: "0 0 16px" }}>
                    Multi-stage runs. Hit each target in order — the next stays hidden until you reach it.
                  </p>

                  <motion.div
                    className="challenge-list"
                    initial="hidden"
                    animate="show"
                    variants={{ show: { transition: { staggerChildren: 0.06 } } }}
                  >
                    {CHALLENGE_TEMPLATES.map((t) => (
                      <motion.button
                        key={t.id}
                        type="button"
                        className="challenge-item"
                        variants={{
                          hidden: { opacity: 0, y: 8 },
                          show:   { opacity: 1, y: 0 },
                        }}
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.985 }}
                        onClick={() => setSelected(t)}
                      >
                        <div className="challenge-item-head">
                          <span className="challenge-name">{t.name}</span>
                          <span className="challenge-meta">
                            {t.topicCount - 1} stage{t.topicCount - 1 === 1 ? "" : "s"}
                          </span>
                        </div>
                        <span className="challenge-desc">{t.description}</span>
                      </motion.button>
                    ))}
                  </motion.div>

                  <div className="modal-actions">
                    <button type="button" className="ghost" onClick={onClose}>Close</button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="settings"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{ duration: 0.18 }}
                >
                  <div className="modal-step-head">
                    <button type="button" className="step-back" onClick={() => setSelected(null)} aria-label="Back to challenges">
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 6l-6 6 6 6" />
                      </svg>
                    </button>
                    <div>
                      <h2 className="modal-title" style={{ margin: 0 }}>{selected.name}</h2>
                      <p className="muted small" style={{ margin: "2px 0 0" }}>{selected.description}</p>
                    </div>
                  </div>

                  <section className="modal-section">
                    <h3 className="modal-label">Difficulty</h3>
                    <div className="seg">
                      {DIFFICULTY_OPTIONS.map((opt) => {
                        const active = settings.difficulty === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            className={"seg-btn" + (active ? " active" : "")}
                            onClick={() => setSettings({ ...settings, difficulty: opt.value })}
                          >
                            {active && (
                              <motion.span
                                layoutId="seg-pill"
                                className="seg-pill"
                                transition={{ type: "spring", stiffness: 420, damping: 32 }}
                              />
                            )}
                            <span className="seg-label">{opt.label}</span>
                            <span className="seg-hint">{opt.hint}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section className="modal-section modal-row">
                    <div className="modal-field">
                      <label htmlFor="ch-time">Time limit</label>
                      <select
                        id="ch-time"
                        value={String(settings.timeLimit)}
                        onChange={(e) => setSettings({ ...settings, timeLimit: parseInt(e.target.value, 10) || 0 })}
                      >
                        <option value="0">No limit</option>
                        <option value="120">2 minutes</option>
                        <option value="300">5 minutes</option>
                        <option value="600">10 minutes</option>
                        <option value="900">15 minutes</option>
                      </select>
                    </div>
                    <div className="modal-field">
                      <label htmlFor="ch-clicks">Max clicks</label>
                      <select
                        id="ch-clicks"
                        value={String(settings.maxClicks)}
                        onChange={(e) => setSettings({ ...settings, maxClicks: parseInt(e.target.value, 10) || 0 })}
                      >
                        <option value="0">Unlimited</option>
                        <option value="15">15</option>
                        <option value="25">25</option>
                        <option value="40">40</option>
                      </select>
                    </div>
                  </section>

                  <section className="modal-section">
                    <label className="row-toggle">
                      <input
                        type="checkbox"
                        checked={settings.allowBack}
                        onChange={(e) => setSettings({ ...settings, allowBack: e.target.checked })}
                      />
                      <span>Allow Back button</span>
                    </label>
                  </section>

                  <div className="modal-actions">
                    <button type="button" className="ghost" onClick={() => setSelected(null)}>Back</button>
                    <motion.button
                      type="button"
                      className="primary"
                      onClick={handleStart}
                      disabled={starting}
                      whileTap={{ scale: 0.97 }}
                    >
                      {starting ? "Starting…" : "Start challenge"}
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
