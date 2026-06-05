import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ThemeToggle } from "./components/ThemeToggle";
import { Intro } from "./components/Intro";
import { SettingsModal } from "./components/SettingsModal";
import { ChallengesModal } from "./components/ChallengesModal";
import { Game, type GameResult } from "./components/Game";
import { EndScreen } from "./components/EndScreen";
import { clearHistory, loadHistory, loadSettings, patchLatestOptimal, recordAttempt } from "./lib/storage";
import { resolveChallenge } from "./lib/challenges";
import type { AttemptRecord, ChallengeRunSettings, ChallengeTemplate, GameMode, Settings } from "./lib/types";

const screenAnim = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -8 },
  transition: { duration: 0.22, ease: [0.4, 0, 0.2, 1] as const },
};

type Screen = "intro" | "game" | "end";

export default function App() {
  const [screen, setScreen] = useState<Screen>("intro");
  const [history, setHistory] = useState<AttemptRecord[]>(() => loadHistory());

  // Modals
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [challengesOpen, setChallengesOpen] = useState(false);

  // Game session
  const [mode, setMode] = useState<GameMode>({ kind: "random" });
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [sessionKey, setSessionKey] = useState(0); // bumped to remount <Game/>

  // End screen data
  const [endResult, setEndResult] = useState<GameResult | null>(null);
  const [optimalPath, setOptimalPath] = useState<string[] | null>(null);
  const [optimalStatus, setOptimalStatus] = useState("Looking up the shortest possible path…");

  function refreshHistory() {
    setHistory(loadHistory());
  }

  function startRandomFromSettings(s: Settings) {
    setSettings(s);
    setMode({ kind: "random" });
    setSettingsOpen(false);
    setOptimalPath(null);
    setOptimalStatus("");
    setSessionKey((k) => k + 1);
    setScreen("game");
  }

  async function startChallenge(t: ChallengeTemplate, runSettings: ChallengeRunSettings) {
    setChallengesOpen(false);
    try {
      const challenge = await resolveChallenge(t, runSettings.difficulty);
      // Pipe per-run settings (time limit, click cap, back toggle) through
      // to Game by reusing the shared Settings shape. The shared Difficulty
      // type uses "any" for the middle option, ChallengeRunSettings uses
      // "medium" — translate here.
      setSettings({
        categories: null,
        difficulty:
          runSettings.difficulty === "medium" ? "any" : runSettings.difficulty,
        timeLimit: runSettings.timeLimit,
        maxClicks: runSettings.maxClicks,
        allowBack: runSettings.allowBack,
      });
      setMode({ kind: "challenge", challenge });
      setOptimalPath(null);
      setOptimalStatus("");
      setSessionKey((k) => k + 1);
      setScreen("game");
    } catch {
      alert("Couldn't start the challenge — server didn't return enough topics.");
    }
  }

  function handleGameEnd(
    r: GameResult,
    optimalFetcher: (cb: (status: string, path: string[] | null) => void) => () => void,
  ) {
    setEndResult(r);
    setOptimalPath(null);
    setOptimalStatus(
      r.won ? "Looking up the shortest possible path…"
            : "Revealing the shortest path you could have taken…",
    );

    // Save to history before fetching optimal
    const challengeName = r.mode.kind === "challenge" ? r.mode.challenge.name : undefined;
    const challengeId = r.mode.kind === "challenge" ? r.mode.challenge.id : undefined;
    const rec: AttemptRecord = {
      start: r.start,
      end: r.end,
      result: r.won ? "won" : "lost",
      clicks: r.clicks,
      timeSec: r.elapsedSec,
      optimalHops: null,
      at: Date.now(),
      mode: r.mode.kind,
      challengeId,
      stagesCompleted: r.stagesDone,
      stagesTotal: r.stagesTotal,
    };
    recordAttempt(rec);
    refreshHistory();
    setScreen("end");

    // Stream the optimal path; patch history once it lands.
    const cancel = optimalFetcher((status, path) => {
      if (path) {
        setOptimalPath(path);
        setOptimalStatus("");
        patchLatestOptimal(r.start, r.end, path.length - 1);
        refreshHistory();
      } else {
        setOptimalStatus(status);
      }
    });
    // We don't return cancel — keeping the simple effect-less flow for clarity.
    void challengeName; void cancel;
  }

  function backToMenu() {
    setScreen("intro");
  }

  // Esc to close any modal
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setSettingsOpen(false);
        setChallengesOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <ThemeToggle />

      <AnimatePresence mode="wait" initial={false}>
        {screen === "intro" && (
          <motion.div key="intro" className="screen-wrap" {...screenAnim}>
            <Intro
              history={history}
              onStartRandom={() => setSettingsOpen(true)}
              onOpenChallenges={() => setChallengesOpen(true)}
              onClearHistory={() => { clearHistory(); refreshHistory(); }}
            />
          </motion.div>
        )}

        {screen === "game" && (
          <motion.div key="game" className="screen-wrap" {...screenAnim}>
            <Game
              key={sessionKey}
              mode={mode}
              settings={settings}
              onGameEnd={handleGameEnd}
            />
          </motion.div>
        )}

        {screen === "end" && endResult && (
          <motion.div key="end" className="screen-wrap" {...screenAnim}>
            <EndScreen
              won={endResult.won}
              start={endResult.start}
              end={endResult.end}
              clicks={endResult.clicks}
              elapsedSec={endResult.elapsedSec}
              yourPath={endResult.yourPath}
              optimalPath={optimalPath}
              optimalStatus={optimalStatus}
              challengeName={endResult.mode.kind === "challenge" ? endResult.mode.challenge.name : undefined}
              stagesDone={endResult.stagesDone}
              stagesTotal={endResult.stagesTotal}
              onBackToMenu={backToMenu}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onStart={startRandomFromSettings}
      />

      <ChallengesModal
        open={challengesOpen}
        onClose={() => setChallengesOpen(false)}
        onStart={startChallenge}
      />
    </>
  );
}
