import { useEffect, useState } from "react";
import { ThemeToggle } from "./components/ThemeToggle";
import { Intro } from "./components/Intro";
import { SettingsModal } from "./components/SettingsModal";
import { ChallengesModal } from "./components/ChallengesModal";
import { Game, type GameResult } from "./components/Game";
import { EndScreen } from "./components/EndScreen";
import { clearHistory, loadHistory, loadSettings, patchLatestOptimal, recordAttempt } from "./lib/storage";
import { resolveChallenge } from "./lib/challenges";
import type { AttemptRecord, ChallengeTemplate, GameMode, Settings } from "./lib/types";

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

  async function pickChallengeTemplate(t: ChallengeTemplate) {
    setChallengesOpen(false);
    try {
      // Fetch a fresh random chain for THIS run — challenges are randomised
      // every play, never repeat the same sequence.
      const challenge = await resolveChallenge(t);
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

      {screen === "intro" && (
        <Intro
          history={history}
          onStartRandom={() => setSettingsOpen(true)}
          onOpenChallenges={() => setChallengesOpen(true)}
          onClearHistory={() => { clearHistory(); refreshHistory(); }}
        />
      )}

      {screen === "game" && (
        <Game
          key={sessionKey}
          mode={mode}
          settings={settings}
          onGameEnd={handleGameEnd}
        />
      )}

      {screen === "end" && endResult && (
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
      )}

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onStart={startRandomFromSettings}
      />

      <ChallengesModal
        open={challengesOpen}
        onClose={() => setChallengesOpen(false)}
        onPick={pickChallengeTemplate}
      />
    </>
  );
}
