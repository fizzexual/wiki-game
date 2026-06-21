import { useEffect, useRef, useState } from "react";
import {
  fetchOptimalSegment,
  fetchRandomPair,
  getPrecomputeStatus,
  startPrecompute,
  streamOptimalPath,
} from "../lib/api";
import { errorDoc, fetchArticleHtml } from "../lib/wiki/article";
import { fmtTime, normalizeTitle } from "../lib/format";
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
  failReason?: "taboo" | "hub" | "time" | "clicks" | "manual";
  failedOn?: string;
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
  const sideFrameRef = useRef<HTMLIFrameElement>(null);
  const stateRef = useRef({
    finished: false,
    currentArticle: null as string | null,
    firstLoadDone: false,
    startedAt: 0,
    path: [] as string[],
    stageIdx: 0,
    anchorVisited: [] as boolean[],
  });
  const loadSeqRef = useRef(0);

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
  const [anchorVisited, setAnchorVisited] = useState<boolean[]>([]);
  const [optimalHopsPerStage, setOptimalHopsPerStage] = useState<(number | null)[]>([]);
  const [hintMessage, setHintMessage] = useState<string | null>(null);

  const isChallenge = mode.kind === "challenge";
  const challengeKind = isChallenge ? mode.challenge.kind : "linear";
  const isSplitView = challengeKind === "split-view";
  const startTitle = pair?.start ?? "";
  const endTitle = pair?.end ?? "";

  // Hard reset on every mount so a new run never inherits prior state.
  useEffect(() => {
    stateRef.current = {
      finished: false,
      currentArticle: null,
      firstLoadDone: false,
      startedAt: 0,
      path: [],
      stageIdx: 0,
      anchorVisited: isChallenge
        ? new Array(mode.challenge.topics.length - 1).fill(false)
        : [],
    };
    setStageIdx(0);
    setCanBack(false);
    setGiveUpVisible(false);
    setHudClicks("—");
    setHudTimer("—");
    setLoaderHidden(false);
    setLoaderStatus("Picking your challenge…");
    setAnchorVisited(stateRef.current.anchorVisited.slice());
    setOptimalHopsPerStage(
      isChallenge ? new Array(mode.challenge.topics.length - 1).fill(null) : [],
    );
    setHintMessage(null);
    loadSeqRef.current++;
    if (frameRef.current) frameRef.current.srcdoc = "";
    if (sideFrameRef.current) sideFrameRef.current.srcdoc = "";

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
          const ch = mode.challenge;
          const t = ch.topics;
          setPair({ start: t[0], end: t[1] });
          setLoaderStatus(`Loading ${t[0]}…`);
          for (let i = 0; i < t.length - 1; i++) {
            startPrecompute(t[i], t[i + 1]);
          }
          pollPrecomputeUntilReady(t[0], t[1]);
          // Eagerly fetch optimal hops for every stage when in reverse-bfs.
          if (ch.kind === "reverse-bfs") {
            for (let i = 0; i < t.length - 1; i++) {
              fetchOptimalSegment(t[i], t[i + 1]).then((path) => {
                if (cancelled) return;
                setOptimalHopsPerStage((prev) => {
                  const next = prev.slice();
                  next[i] = path ? Math.max(0, path.length - 1) : null;
                  return next;
                });
              });
            }
          }
          // For split-view, the side pane is loaded by the pair effect below.
        }
      } catch {
        setLoaderStatus("Couldn't reach the server.");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Polling helper
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
        if (remain === 0) finishGame(false, "time");
      } else {
        setHudTimer(fmtTime(Math.floor((Date.now() - stateRef.current.startedAt) / 1000)));
      }
    }, 500);
  }
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  // --- Article loading (client-side; no server proxy).
  // Fetch + rewrite the article and drop it into the iframe via srcdoc. A
  // sequence guard makes sure a slow fetch can't overwrite a newer navigation.
  async function loadMain(title: string) {
    const frame = frameRef.current;
    if (!frame) return;
    const seq = ++loadSeqRef.current;
    stateRef.current.currentArticle = title;
    setReloadSpinning(true);
    let html: string;
    try {
      html = await fetchArticleHtml(title);
    } catch (e) {
      html = errorDoc("Couldn't load this article. " + (e instanceof Error ? e.message : ""));
    }
    if (loadSeqRef.current !== seq) return; // superseded by a newer load
    frame.srcdoc = html;
  }

  async function renderSide(title: string) {
    const f = sideFrameRef.current;
    if (!f) return;
    try {
      f.srcdoc = await fetchArticleHtml(title);
    } catch {
      f.srcdoc = errorDoc("Couldn't load the target article.");
    }
  }

  // In-article link clicks arrive here via postMessage from the injected
  // interceptor. Use a ref so the once-registered listener always calls the
  // latest closure (which captures the current pair / stage).
  const navHandlerRef = useRef<(title: string) => void>(() => {});
  navHandlerRef.current = (title: string) => {
    recordVisit(title);
    if (!stateRef.current.finished) void loadMain(title);
  };
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const d = e.data;
      if (!d || d.source !== "wikigame" || d.type !== "navigate") return;
      if (e.source !== frameRef.current?.contentWindow) return; // ignore side pane
      const title = String(d.title || "");
      if (title) navHandlerRef.current(title);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // --- Load the start article whenever pair changes.
  useEffect(() => {
    if (!pair) return;
    setChromeUrl("loading…");
    void loadMain(pair.start);
    recordVisit(pair.start); // record the stage's starting article (deduped)
    // For split-view, keep the right pane locked to the current target.
    if (isSplitView) void renderSide(pair.end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair, isSplitView]);

  // --- Iframe load. Visit recording now happens via postMessage / loadMain;
  // this just clears the spinner and runs first-load setup (timer + loader).
  function onIframeLoad() {
    setReloadSpinning(false);
    if (!pair) return;
    if (!stateRef.current.currentArticle) return; // blank/reset load

    if (!stateRef.current.firstLoadDone) {
      stateRef.current.firstLoadDone = true;
      stateRef.current.startedAt = Date.now();
      const deadline = settings.timeLimit > 0
        ? stateRef.current.startedAt + settings.timeLimit * 1000
        : null;
      setHudTimer(settings.timeLimit > 0 ? fmtTime(settings.timeLimit) : "0:00");
      setHudClicks(settings.maxClicks > 0 ? `0 / ${settings.maxClicks}` : "0");
      startTimer(deadline);
      setLoaderHidden(true);
    }
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

    const titleNorm = normalizeTitle(title);

    if (mode.kind === "random") {
      if (titleNorm === normalizeTitle(endTitle)) {
        finishGame(true);
        return;
      }
    } else {
      const ch = mode.challenge;
      const topics = ch.topics;
      const idx = stateRef.current.stageIdx;

      // Taboo (Hot Potato): touching ends the run.
      if (ch.kind === "hot-potato" && ch.taboos) {
        const taboo = ch.taboos[idx];
        if (taboo && titleNorm === normalizeTitle(taboo)) {
          finishGame(false, "taboo", title);
          return;
        }
      }

      // Hub Hunter: any hub article ends the run.
      if (ch.kind === "hub-hunter" && ch.hubs) {
        if (ch.hubs.some((h) => normalizeTitle(h) === titleNorm)) {
          finishGame(false, "hub", title);
          return;
        }
      }

      // Anchor (Hot Potato): mark as visited; doesn't advance stage by itself.
      if (ch.kind === "hot-potato" && ch.anchors) {
        const anchor = ch.anchors[idx];
        if (anchor && titleNorm === normalizeTitle(anchor)) {
          stateRef.current.anchorVisited[idx] = true;
          setAnchorVisited(stateRef.current.anchorVisited.slice());
          setHintMessage(`Anchor reached — head for ${topics[idx + 1]}`);
          setTimeout(() => setHintMessage(null), 2500);
        }
      }

      // Reached current target?
      const nextTarget = topics[idx + 1];
      if (nextTarget && titleNorm === normalizeTitle(nextTarget)) {
        // Hot Potato: refuse the target hop unless anchor was visited.
        if (ch.kind === "hot-potato" && ch.anchors) {
          if (!stateRef.current.anchorVisited[idx]) {
            setHintMessage(`Visit the anchor (${ch.anchors[idx]}) before claiming the target.`);
            return;
          }
        }
        advanceStage();
      }
    }

    if (settings.maxClicks > 0 && totalClicks >= settings.maxClicks) {
      finishGame(false, "clicks");
    }
  }

  function advanceStage() {
    if (!isChallenge) return;
    const ch = mode.challenge;
    const topics = ch.topics;
    const newStage = stateRef.current.stageIdx + 1;
    stateRef.current.stageIdx = newStage;
    setStageIdx(newStage);
    if (newStage >= topics.length - 1) {
      finishGame(true);
      return;
    }
    const nextStart = topics[newStage];
    const nextEnd = topics[newStage + 1];
    setPair({ start: nextStart, end: nextEnd });
    setGiveUpVisible(false);
    pollPrecomputeUntilReady(nextStart, nextEnd);
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
    void loadMain(prev); // re-render without recording a new visit
  }

  function reload() {
    if (stateRef.current.path.length === 0) return;
    const last = stateRef.current.path[stateRef.current.path.length - 1];
    void loadMain(last);
  }

  function finishGame(
    won: boolean,
    reason: "taboo" | "hub" | "time" | "clicks" | "manual" = "manual",
    failedOn?: string,
  ) {
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

    const optimalFetcher = (cb: (status: string, path: string[] | null) => void) => {
      const es = streamOptimalPath(
        overallStart,
        overallEnd,
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
        failReason: reason,
        failedOn,
      },
      optimalFetcher,
    );
  }

  // --- Kind-specific HUD adornments
  const challenge = isChallenge ? mode.challenge : null;
  const currentClue =
    challenge?.kind === "mystery" && challenge.clues
      ? challenge.clues[stageIdx]
      : undefined;
  const currentAnchor =
    challenge?.kind === "hot-potato" && challenge.anchors
      ? challenge.anchors[stageIdx]
      : undefined;
  const currentTaboo =
    challenge?.kind === "hot-potato" && challenge.taboos
      ? challenge.taboos[stageIdx]
      : undefined;
  const currentAnchorVisited = anchorVisited[stageIdx] || false;
  const hubCount = challenge?.kind === "hub-hunter" ? challenge.hubs?.length : undefined;
  const currentOptimal =
    challenge?.kind === "reverse-bfs" ? optimalHopsPerStage[stageIdx] : undefined;

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
        onGiveUp={() => finishGame(false, "manual")}
        clue={currentClue}
        anchor={currentAnchor}
        taboo={currentTaboo}
        anchorVisited={currentAnchorVisited}
        hubCount={hubCount}
        currentOptimalHops={currentOptimal ?? null}
        hintMessage={hintMessage}
      />
      <div className={"browser" + (isSplitView ? " browser-split" : "")}>
        <BrowserChrome
          url={chromeUrl}
          reloading={reloadSpinning}
          canBack={canBack && settings.allowBack}
          showBack={settings.allowBack}
          onBack={goBack}
          onReload={reload}
        />
        <div className="browser-body">
          <div className="browser-pane">
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
          {isSplitView && (
            <div className="browser-pane browser-pane-side">
              <div className="side-label">Target · {endTitle}</div>
              <iframe
                ref={sideFrameRef}
                title="Target article"
                tabIndex={-1}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
