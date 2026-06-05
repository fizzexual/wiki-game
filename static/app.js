(() => {
  // ---------- elements ----------
  const intro      = document.getElementById("intro");
  const game       = document.getElementById("game");
  const endScreen  = document.getElementById("end");

  const newGameBtn = document.getElementById("new-game-btn");
  const playAgainBtn = document.getElementById("play-again-btn");
  const giveUpBtn  = document.getElementById("give-up-btn");
  const backBtn    = document.getElementById("back-btn");
  const forwardBtn = document.getElementById("forward-btn"); // visual only
  const reloadBtn  = document.getElementById("reload-btn");

  const hudStart   = document.getElementById("hud-start");
  const hudEnd     = document.getElementById("hud-end");
  const hudClicks  = document.getElementById("hud-clicks");
  const hudTimer   = document.getElementById("hud-timer");
  const chromeUrl  = document.getElementById("chrome-url-text");
  const frame      = document.getElementById("article-frame");

  const endHeadline   = document.getElementById("end-headline");
  const endSub        = document.getElementById("end-sub");
  const yourPathEl    = document.getElementById("your-path");
  const yourHops      = document.getElementById("your-hops");
  const optimalPathEl = document.getElementById("optimal-path");
  const optimalHops   = document.getElementById("optimal-hops");
  const optimalStatus = document.getElementById("optimal-status");

  // ---------- state ----------
  let state = null;
  let timerId = null;
  let precomputePollId = null;

  // ---------- history (localStorage) ----------
  const HISTORY_KEY = "wg-history";
  const HISTORY_MAX = 10;

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
    catch { return []; }
  }
  function saveHistory(h) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch {}
  }
  function recordAttempt(entry) {
    const h = loadHistory();
    h.unshift(entry);
    while (h.length > HISTORY_MAX) h.pop();
    saveHistory(h);
    return h[0];
  }
  function patchLatestOptimal(start, end, optimalHops) {
    const h = loadHistory();
    for (const item of h) {
      if (item.start === start && item.end === end && item.optimalHops == null) {
        item.optimalHops = optimalHops;
        break;
      }
    }
    saveHistory(h);
  }
  function renderHistory() {
    const wrap = document.getElementById("history-wrap");
    const list = document.getElementById("history-list");
    const h = loadHistory();
    if (!h.length) { wrap.hidden = true; return; }
    wrap.hidden = false;
    list.innerHTML = "";
    h.forEach(item => {
      const li = document.createElement("li");
      li.className = "history-item";

      const dot = document.createElement("span");
      dot.className = "history-result " + (item.result === "won" ? "won" : "lost");
      dot.title = item.result === "won" ? "Solved" : "Gave up";

      const pair = document.createElement("span");
      pair.className = "history-pair";
      pair.innerHTML = `${escapeHTML(item.start)}<span class="arrow">→</span>${escapeHTML(item.end)}`;

      const stats = document.createElement("span");
      stats.className = "history-stats";
      const main = item.result === "won"
        ? `${item.clicks} click${item.clicks === 1 ? "" : "s"} · ${fmtTime(item.timeSec)}`
        : `gave up · ${fmtTime(item.timeSec)}`;
      const opt = item.optimalHops != null ? ` <span class="vs-opt">opt ${item.optimalHops}</span>` : "";
      stats.innerHTML = main + opt;

      li.appendChild(dot);
      li.appendChild(pair);
      li.appendChild(stats);
      list.appendChild(li);
    });
  }
  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function normalizeTitle(t) {
    return decodeURIComponent(t).replace(/_/g, " ").trim().toLowerCase();
  }
  function titleToUrlPath(t) {
    return "/play/article/" + encodeURIComponent(t.replace(/ /g, "_"));
  }
  function fmtTime(sec) {
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }
  function wikiUrl(t) {
    return "https://en.wikipedia.org/wiki/" + encodeURIComponent(t.replace(/ /g, "_"));
  }
  function setChromeUrl(title) {
    chromeUrl.textContent = "en.wikipedia.org/wiki/" + title.replace(/ /g, "_");
  }

  // ---------- screens ----------
  function show(screen) {
    [intro, game, endScreen].forEach(s => { s.hidden = s !== screen; });
  }

  // ---------- game flow ----------
  async function newGame() {
    show(game);
    hudStart.textContent = "…";
    hudEnd.textContent = "…";
    hudClicks.textContent = "0";
    hudTimer.textContent = "0:00";
    chromeUrl.textContent = "loading…";
    frame.src = "about:blank";
    backBtn.disabled = true;
    giveUpBtn.hidden = true;
    reloadBtn.classList.add("spinning");
    if (precomputePollId) { clearInterval(precomputePollId); precomputePollId = null; }

    let pair;
    try {
      const r = await fetch("/api/random-pair");
      pair = await r.json();
    } catch {
      alert("Couldn't reach the server. Is it running?");
      show(intro);
      return;
    }

    state = {
      start: pair.start,
      end: pair.end,
      endNorm: normalizeTitle(pair.end),
      path: [],
      startedAt: Date.now(),
      finished: false,
    };

    hudStart.textContent = pair.start;
    hudEnd.textContent = pair.end;

    if (timerId) clearInterval(timerId);
    timerId = setInterval(() => {
      if (!state || state.finished) return;
      const sec = Math.floor((Date.now() - state.startedAt) / 1000);
      hudTimer.textContent = fmtTime(sec);
    }, 500);

    // background BFS so the optimal reveal is instant at the end
    fetch("/api/precompute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ start: pair.start, end: pair.end }),
    }).catch(() => {});

    pollPrecomputeUntilReady(pair.start, pair.end);

    frame.src = titleToUrlPath(pair.start);
  }

  function pollPrecomputeUntilReady(start, end) {
    const tick = async () => {
      if (!state || state.finished || state.start !== start || state.end !== end) {
        if (precomputePollId) { clearInterval(precomputePollId); precomputePollId = null; }
        return;
      }
      try {
        const r = await fetch(`/api/precompute-status?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
        const j = await r.json();
        if (j.status === "done" || j.status === "error") {
          giveUpBtn.hidden = false;
          clearInterval(precomputePollId); precomputePollId = null;
        }
      } catch {}
    };
    tick();
    precomputePollId = setInterval(tick, 2000);
  }

  function recordVisit(title) {
    if (!state || state.finished) return;
    const last = state.path[state.path.length - 1];
    if (last && normalizeTitle(last) === normalizeTitle(title)) return;

    state.path.push(title);
    hudClicks.textContent = Math.max(0, state.path.length - 1).toString();
    setChromeUrl(title);
    backBtn.disabled = state.path.length < 2;

    if (normalizeTitle(title) === state.endNorm) {
      endGame(true);
    }
  }

  function goBack() {
    if (!state || state.path.length < 2) return;
    state.path.pop();
    const prev = state.path[state.path.length - 1];
    backBtn.disabled = state.path.length < 2;
    hudClicks.textContent = Math.max(0, state.path.length - 1).toString();
    setChromeUrl(prev);
    state.suppressNextRecord = true;
    frame.src = titleToUrlPath(prev);
  }

  function reload() {
    if (!state || state.finished) return;
    const last = state.path[state.path.length - 1];
    if (!last) return;
    state.suppressNextRecord = true;
    try {
      frame.contentWindow.location.reload();
    } catch {
      frame.src = titleToUrlPath(last);
    }
  }

  async function endGame(won) {
    if (!state || state.finished) return;
    state.finished = true;
    const elapsedSec = Math.floor((Date.now() - state.startedAt) / 1000);
    const clicks = Math.max(0, state.path.length - 1);

    if (won) {
      endHeadline.textContent = `Solved in ${clicks} click${clicks === 1 ? "" : "s"}.`;
      endSub.textContent = `Time: ${fmtTime(elapsedSec)} · ${state.start} → ${state.end}`;
    } else {
      endHeadline.textContent = "Gave up.";
      endSub.textContent = `You traveled ${clicks} hop${clicks === 1 ? "" : "s"} without reaching ${state.end}.`;
    }
    yourHops.textContent = `${clicks} hop${clicks === 1 ? "" : "s"}`;
    renderPath(yourPathEl, state.path.length ? state.path : [state.start]);

    recordAttempt({
      start: state.start,
      end: state.end,
      result: won ? "won" : "lost",
      clicks: clicks,
      timeSec: elapsedSec,
      optimalHops: null,
      at: Date.now(),
    });

    optimalPathEl.innerHTML = "";
    optimalHops.textContent = "…";
    optimalStatus.hidden = false;
    optimalStatus.textContent = won
      ? "Looking up the shortest possible path…"
      : "Revealing the shortest path you could have taken…";

    show(endScreen);
    fetchOptimal(state.start, state.end);
  }

  function fetchOptimal(start, end) {
    const url = `/api/play?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`;
    const es = new EventSource(url);
    es.onmessage = ev => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === "progress") {
        if (msg.side === "precompute") {
          optimalStatus.textContent = "Finishing the background search you started when the game began…";
        } else {
          optimalStatus.textContent =
            `Searching ${msg.side === "forward" ? "→" : "←"} depth ${msg.depth} · ${msg.visited.toLocaleString()} pages explored`;
        }
      } else if (msg.type === "result") {
        es.close();
        const hops = msg.path.length - 1;
        optimalHops.textContent = `${hops} hop${hops === 1 ? "" : "s"}`;
        optimalStatus.hidden = true;
        renderPath(optimalPathEl, msg.path);
        if (state) patchLatestOptimal(state.start, state.end, hops);
      } else if (msg.type === "error") {
        es.close();
        optimalStatus.textContent = "Couldn't compute optimal path: " + msg.message;
      }
    };
    es.onerror = () => {
      es.close();
      if (!optimalPathEl.children.length) {
        optimalStatus.textContent = "Lost connection while computing optimal path.";
      }
    };
  }

  function renderPath(container, titles) {
    container.innerHTML = "";
    titles.forEach((t, i) => {
      const li = document.createElement("li");
      li.style.animationDelay = (i * 120) + "ms";
      const step = document.createElement("span");
      step.className = "step";
      step.textContent = i + 1;
      const a = document.createElement("a");
      a.href = wikiUrl(t);
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = t;
      li.appendChild(step);
      li.appendChild(a);
      container.appendChild(li);
    });
  }

  // ---------- iframe navigation tracking ----------
  frame.addEventListener("load", () => {
    reloadBtn.classList.remove("spinning");
    if (!state) return;
    let pathname;
    try {
      pathname = frame.contentWindow.location.pathname;
    } catch {
      return;
    }
    if (pathname === "/" || pathname === "about:blank") return;

    if (state.suppressNextRecord) {
      state.suppressNextRecord = false;
      return;
    }
    const title = pathname.startsWith("/play/article/")
      ? decodeURIComponent(pathname.replace("/play/article/", "")).replace(/_/g, " ").split("#")[0]
      : null;
    if (title) recordVisit(title);
  });

  // ---------- theme toggle ----------
  const themeToggle = document.getElementById("theme-toggle");
  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const cur = document.documentElement.dataset.theme === "light" ? "light" : "dark";
      const next = cur === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("wg-theme", next); } catch {}
    });
  }

  function backToMenu() {
    show(intro);
    renderHistory();
  }

  // ---------- wire up ----------
  newGameBtn.addEventListener("click", newGame);
  playAgainBtn.addEventListener("click", backToMenu);
  backBtn.addEventListener("click", goBack);
  reloadBtn.addEventListener("click", reload);
  giveUpBtn.addEventListener("click", () => endGame(false));

  const historyClear = document.getElementById("history-clear");
  if (historyClear) {
    historyClear.addEventListener("click", () => {
      try { localStorage.removeItem(HISTORY_KEY); } catch {}
      renderHistory();
    });
  }

  // initial paint
  renderHistory();
})();
