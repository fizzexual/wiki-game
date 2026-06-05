import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { fetchCategories } from "../lib/api";
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from "../lib/storage";
import type { Difficulty, Settings } from "../lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onStart: (s: Settings) => void;
}

const DIFFICULTY_OPTIONS: { value: Difficulty; label: string; hint: string }[] = [
  { value: "easy",   label: "Easy",   hint: "Same category" },
  { value: "any",    label: "Any",    hint: "Random pair"    },
  { value: "hard",   label: "Hard",   hint: "Cross-category" },
];

export function SettingsModal({ open, onClose, onStart }: Props) {
  const [categories, setCategories] = useState<string[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const cats = await fetchCategories();
      if (cancelled) return;
      setCategories(cats);
      const stored = loadSettings();
      setSettings({ ...stored, categories: stored.categories ?? null });
    })();
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const selected = new Set(settings.categories ?? categories);
  const allChecked = categories.length > 0 && categories.every((c) => selected.has(c));

  const toggleCat = (c: string) => {
    const next = new Set(selected);
    if (next.has(c)) next.delete(c); else next.add(c);
    setSettings({
      ...settings,
      categories: next.size === categories.length ? null : Array.from(next),
    });
  };

  const toggleAll = () => {
    setSettings({ ...settings, categories: allChecked ? [] : null });
  };

  const submit = () => {
    const final: Settings = {
      ...settings,
      categories:
        settings.categories && settings.categories.length > 0 &&
        settings.categories.length !== categories.length
          ? settings.categories
          : null,
    };
    saveSettings(final);
    onStart(final);
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
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
          >
            <h2 className="modal-title">New challenge</h2>

            <section className="modal-section">
              <div className="modal-label-row">
                <h3 className="modal-label">Categories</h3>
                <button type="button" className="link-btn" onClick={toggleAll}>
                  {allChecked ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="modal-cats">
                {categories.map((c) => (
                  <label key={c}>
                    <input
                      type="checkbox"
                      checked={selected.has(c)}
                      onChange={() => toggleCat(c)}
                    />
                    <span>{c}</span>
                  </label>
                ))}
              </div>
            </section>

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
                          layoutId="set-seg-pill"
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
                <label htmlFor="set-time">Time limit</label>
                <select
                  id="set-time"
                  value={String(settings.timeLimit)}
                  onChange={(e) =>
                    setSettings({ ...settings, timeLimit: parseInt(e.target.value, 10) || 0 })
                  }
                >
                  <option value="0">No limit</option>
                  <option value="60">1 minute</option>
                  <option value="120">2 minutes</option>
                  <option value="180">3 minutes</option>
                  <option value="300">5 minutes</option>
                </select>
              </div>
              <div className="modal-field">
                <label htmlFor="set-clicks">Max clicks</label>
                <select
                  id="set-clicks"
                  value={String(settings.maxClicks)}
                  onChange={(e) =>
                    setSettings({ ...settings, maxClicks: parseInt(e.target.value, 10) || 0 })
                  }
                >
                  <option value="0">Unlimited</option>
                  <option value="5">5</option>
                  <option value="7">7</option>
                  <option value="10">10</option>
                  <option value="15">15</option>
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
              <button type="button" className="ghost" onClick={onClose}>Cancel</button>
              <motion.button
                type="button"
                className="primary"
                onClick={submit}
                whileTap={{ scale: 0.97 }}
              >
                Start game
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
