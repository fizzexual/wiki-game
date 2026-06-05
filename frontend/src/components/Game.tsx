import { useEffect, useRef, useState } from "react";
import {
  articleUrl,
  fetchRandomPair,
  getPrecomputeStatus,
  startPrecompute,
  streamOptimalPath,
} from "../lib/api";
import { fmtTime, normalizeTitle, titleFromPathname } from "../lib/format";
import type { GameMode, Settings } from "../lib/types";
import { BrowserChrome } from "./BrowserChrome";
import { HUD } from "./HUD";
import { Loader } from "./Loader";

export interface GameResult {
  start: string;
  end: string;
  won: boolean;
  clicks: number;
  elapsedSec: number;
  yourPath: string[];
  mode: GameMode;
  stagesDone?: number;
  stagesTotal?: number;
}

interface Props {
  mode: GameMode;
  settings: Settings;
  onGameEnd: (
    r: GameResult,
    optimalFetcher: (cb: (status: string, path: string[] | null) => void) => () => void,
  ) => void;
}

export function Game({ mode, settings, onGameEnd }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const stateRef = useRef({
    finished: false,
    suppressNextRecord: false,
    firstLoadDone: false,
    startedAt: 0,
    path: [] as string[],
    stageIdx: 0,
  });

  const [pair, setPair] = useState<{ start: string; end: string } | null>(null);
  const [loaderStatus, setLoaderStatus] = useState("Picking your challenge…");
  const [loaderHidden, setLoaderHidden] = useState(false);
  const [chromeUrl, setChromeUrl] = useState("loading…");
  const [reloadSpinning, setReloadSpinning] = useState(true);
  const [hudClicks, setHudClicks] = useState("—");
  const [hudTimer, setHudTimer] = useState("—");
  const [canBack, setCanBack] = useState(false);
  const [giveUpVisible, setGiveUpVisible] = useState(false);
  const [stageIdx, setStageIdx] = useState(0);

  // Derived "current target" based on mode + stage.
  const isChallenge = mode.kind === "challenge";
  const challengeTopics = isChallenge ? mode.challenge.topics : null;
  const startTitle = pair?.start ?? "";
  const endTitle = pair?.end ?? "";

  // --- Setup: pick the start/end (or stage targets for challenge) once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (mode.kind === "random") {
          const p = await fetchRandomPair(settings);
          if (cancelled) return;
          setPair({ start: p.start, end: p.end });
          setLoaderStatus(`Loading ${p.start}…`);
          startPrecompute(p.start, p.end);
          pollPrecomputeUntilReady(p.start, p.end);
        } else {
          const t = mode.challenge.topics;
          setPair({ start: t[0], end: t[1] }); // first stage
          setLoaderStatus(`Loading ${t[0]}…`);
          // Fire precompute for every consecutive pair so each stage's give-up
          // unlocks as soon as that stage's BFS finishes.
          for (let i = 0; i < t.length - 1; i++) {
            startPrecompute(t[i], t[i + 1]);
          }
          pollPrecomputeUntilReady(t[0], t[1]);
        }
      } catch {
        setLoaderStatus("Couldn't reach the server.");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Polling helpers
  const precomputePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  function pollPrecomputeUntilReady(start: string, end: string) {
    if (precomputePollRef.current) clearInterval(precomputePollRef.current);
    const tick = async () => {
      if (stateRef.current.finished) return;
      const j = await getPrecomputeStatus(start, end);
      if (j.status === "done" || j.status === "error") {
        setGiveUpVisible(true);
        if (precomputePollRef.current) clearInterval(precomputePollRef.current);
      }
    };
    tick();
    precomputePollRef.current = setInterval(tick, 2000);
  }
  useEffect(() => () => {
    if (precomputePollRef.current) clearInterval(precomputePollRef.current);
  }, []);

  // --- Timer
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  function startTimer(deadline: number | null) {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (stateRef.current.finished) return;
      if (deadline) {
        const remain = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        setHudTimer(fmtTime(remain));
        if (remain === 0) finishGame(false);
      } else {
        setHudTimer(fmtTime(Math.floor((Date.now() - stateRef.current.startedAt) / 1000)));
      }
    }, 500);
  }
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // --- Once pair is set, kick off iframe load.
  useEffect(() => {
    if (!pair) return;
    setChromeUrl("loading…");
    setReloadSpinning(true);
    const f = frameRef.current;
    if (f) f.src = articleUrl(pair.start);
  }, [pair]);

  // --- Iframe load handler
  function onIframeLoad() {
    setReloadSpinning(false);
    if (!pair) return;
    let pathname = "";
    try {
      pathname = frameRef.current?.contentWindow?.location.pathname || "";
    } catch {
      return;
    }
    if (pathname === "/" || pathname === "about:blank" || pathname === "") return;

    // First successful article load
    if (!stateRef.current.firstLoadDone) {
      stateRef.current.firstLoadDone = true;
      stateRef.current.startedAt = Date.now();
      const deadline = settings.timeLimit > 0 ? stateRef.current.startedAt + settings.timeLimit * 1000 : null;
      setHudTimer(settings.timeLimit > 0 ? fmtTime(settings.timeLimit) : "0:00");
      setHudClicks(settings.maxClicks > 0 ? `0 / ${settings.maxClicks}` : "0");
      startTimer(deadline);
      setLoaderHidden(true);
    }

    if (stateRef.current.suppressNextRecord) {
      stateRef.current.suppressNextRecord = false;
      return;
    }
    const title = titleFromPathname(pathname);
    if (!title) return;
    recordVisit(title);
  }

  function recordVisit(title: string) {
    if (stateRef.current.finished) return;
    const last = stateRef.current.path[stateRef.current.path.length - 1];
    if (last && normalizeTitle(last) === normalizeTitle(title)) return;

    stateRef.current.path.push(title);
    setChromeUrl("en.wikipedia.org/wiki/" + title.replace(/ /g, "_"));
    setCanBack(stateRef.current.path.length >= 2);

    const totalClicks = Math.max(0, stateRef.current.path.length - 1);
    setHudClicks(settings.maxClicks > 0 ? `${totalClicks} / ${settings.maxClicks}` : String(totalClicks));

    // Mode-specific handling
    if (mode.kind === "random") {
      if (normalizeTitle(title) === normalizeTitle(endTitle)) {
        finishGame(true);
        return;
      }
    } else {
      const topics = mode.challenge.topics;
      const nextTarget = topics[stateRef.current.stageIdx + 1];
      if (nextTarget && normalizeTitle(title) === normalizeTitle(nextTarget)) {
        const newStage = stateRef.current.stageIdx + 1;
        stateRef.current.stageIdx = newStage;
        setStageIdx(newStage);
        if (newStage >= topics.length - 1) {
          finishGame(true);
          return;
        }
        // Advance to next stage: update pair, kick precompute polling for next.
        const nextStart = topics[newStage];
        const nextEnd = topics[newStage + 1];
        setPair({ start: nextStart, end: nextEnd });
        // give-up gate for next stage:
        setGiveUpVisible(false);
        pollPrecomputeUntilReady(nextStart, nextEnd);
      }
    }

    if (settings.maxClicks > 0 && totalClicks >= settings.maxClicks) {
      finishGame(false);
    }
  }

  function goBack() {
    if (!settings.allowBack) return;
    if (stateRef.current.path.length < 2) return;
    stateRef.current.path.pop();
    const prev = stateRef.current.path[stateRef.current.path.length - 1];
    setCanBack(stateRef.current.path.length >= 2);
    const c = Math.max(0, stateRef.current.path.length - 1);
    setHudClicks(settings.maxClicks > 0 ? `${c} / ${settings.maxClicks}` : String(c));
    setChromeUrl("en.wikipedia.org/wiki/" + prev.replace(/ /g, "_"));
    stateRef.current.suppressNextRecord = true;
    if (frameRef.current) frameRef.current.src = articleUrl(prev);
  }

  function reload() {
    if (stateRef.current.path.length === 0) return;
    const last = stateRef.current.path[stateRef.current.path.length - 1];
    stateRef.current.suppressNextRecord = true;
    setReloadSpinning(true);
    try {
      frameRef.current?.contentWindow?.location.reload();
    } catch {
      if (frameRef.current) frameRef.current.src = articleUrl(last);
    }
  }

  function finishGame(won: boolean) {
    if (stateRef.current.finished) return;
    stateRef.current.finished = true;
    if (timerRef.current) clearInterval(timerRef.current);
    if (precomputePollRef.current) clearInterval(precomputePollRef.current);

    const elapsedSec = Math.floor((Date.now() - stateRef.current.startedAt) / 1000);
    const clicks = Math.max(0, stateRef.current.path.length - 1);

    const overallStart = isChallenge ? mode.challenge.topics[0] : startTitle;
    const overallEnd = isChallenge
      ? mode.challenge.topics[mode.challenge.topics.length - 1]
      : endTitle;

    // For challenges, the "optimal" comparison uses the start→final-target BFS
    // path. It's an approximate baseline since the player had to pass through
    // intermediate stages, but it gives a meaningful "shortest possible" anchor.
    const optimalStart = isChallenge ? overallStart : startTitle;
    const optimalEnd = isChallenge ? overallEnd : endTitle;

    const optimalFetcher = (cb: (status: string, path: string[] | null) => void) => {
      const es = streamOptimalPath(
        optimalStart,
        optimalEnd,
        (e) => {
          if (e.type === "progress") {
            if (e.side === "precompute") cb("Finishing the background search…", null);
            else cb(`Searching ${e.side === "forward" ? "→" : "←"} depth ${e.depth} · ${(e.visited ?? 0).toLocaleString()} pages explored`, null);
          } else if (e.type === "result") {
            es.close();
            cb("", e.path ?? null);
          } else if (e.type === "error") {
            es.close();
            cb("Couldn't compute optimal path: " + (e.message || ""), null);
          }
        },
        () => cb("Lost connection while computing optimal path.", null),
      );
      return () => es.close();
    };

    onGameEnd(
      {
        start: overallStart,
        end: overallEnd,
        won,
        clicks,
        elapsedSec,
        yourPath: stateRef.current.path.length ? stateRef.current.path : [overallStart],
        mode,
        stagesDone: isChallenge ? stateRef.current.stageIdx : undefined,
        stagesTotal: isChallenge ? mode.challenge.topics.length - 1 : undefined,
      },
      optimalFetcher,
    );
  }

  return (
    <section className="screen" id="game">
      <HUD
        mode={mode}
        start={startTitle}
        end={endTitle}
        stageIdx={stageIdx}
        clicks={hudClicks}
        timer={hudTimer}
        giveUpVisible={giveUpVisible}
        onGiveUp={() => finishGame(false)}
      />
      <div className="browser">
        <BrowserChrome
          url={chromeUrl}
          reloading={reloadSpinning}
          canBack={canBack && settings.allowBack}
          showBack={settings.allowBack}
          onBack={goBack}
          onReload={reload}
        />
        <iframe
          ref={frameRef}
          id="article-frame"
          title="Wikipedia article"
          onLoad={onIframeLoad}
        />
        <Loader
          status={loaderStatus}
          start={pair?.start}
          end={pair?.end}
          hidden={loaderHidden}
        />
      </div>
    </section>
  );
}
