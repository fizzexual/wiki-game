import { useEffect, useState } from "react";
import { fetchCategories } from "../lib/api";
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from "../lib/storage";
import type { Difficulty, Settings } from "../lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onStart: (s: Settings) => void;
}

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
      setSettings({
        ...stored,
        categories: stored.categories ?? null,
      });
    })();
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const selected = new Set(settings.categories ?? categories);
  const allChecked = categories.length > 0 && categories.every((c) => selected.has(c));

  const toggleCat = (c: string) => {
    const next = new Set(selected);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    setSettings({
      ...settings,
      categories: next.size === categories.length ? null : Array.from(next),
    });
  };

  const toggleAll = () => {
    if (allChecked) {
      setSettings({ ...settings, categories: [] });
    } else {
      setSettings({ ...settings, categories: null });
    }
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
    <div className="modal">
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <h2 id="settings-title" className="modal-title">New challenge</h2>

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

        <section className="modal-section modal-row">
          <div className="modal-field">
            <label htmlFor="set-difficulty">Difficulty</label>
            <select
              id="set-difficulty"
              value={settings.difficulty}
              onChange={(e) =>
                setSettings({ ...settings, difficulty: e.target.value as Difficulty })
              }
            >
              <option value="easy">Easy — same category</option>
              <option value="any">Any pair</option>
              <option value="hard">Hard — different categories</option>
            </select>
          </div>
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
        </section>

        <section className="modal-section modal-row">
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
          <div className="modal-field modal-toggle">
            <label>
              <input
                type="checkbox"
                checked={settings.allowBack}
                onChange={(e) => setSettings({ ...settings, allowBack: e.target.checked })}
              />
              Allow Back button
            </label>
          </div>
        </section>

        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="primary" onClick={submit}>Start game</button>
        </div>
      </div>
    </div>
  );
}
