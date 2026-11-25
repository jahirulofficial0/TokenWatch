/*
 * TokenWatch — background service worker.
 *
 * Owns all writes to chrome.storage.local so the popup, options page and
 * content scripts never race each other.
 *
 * Storage layout (key "tw_state_v1"):
 * {
 *   projects:      [{ id, name, color }]            — from the design
 *   activeProjectId: string
 *   usage: { [projectId]: { [siteKey]: {
 *              days:    { "YYYY-MM-DD": { input, output, msgs } },
 *              session: { input, output }
 *   } } },
 *   limits: { [siteKey]: { windowHours, msgLimit, windowStart, windowMsgs } },
 *   hasRealData: boolean   — false until the first real usage is recorded;
 *                            while false the UI shows the design's
 *                            placeholder figures as its initial state.
 * }
 *
 * All token numbers are local ESTIMATES produced by the content script
 * (page-text length / 4 heuristic). They are not official counts from any
 * AI provider.
 */

const STATE_KEY = "tw_state_v1";

const SITE_KEYS = ["chatgpt", "gemini", "claude", "muse"];

// Design placeholder: the popup design shows a 5-hour window with
// 04:37:12 remaining, i.e. the window started 22m48s before first run.
const SEED_WINDOW_ELAPSED_MS = (5 * 3600 - (4 * 3600 + 37 * 60 + 12)) * 1000;

function defaultState() {
  const now = Date.now();
  const limits = {};
  for (const key of SITE_KEYS) {
    limits[key] = { windowHours: 5, msgLimit: 50, windowStart: null, windowMsgs: 0 };
  }
  limits.chatgpt.windowStart = now - SEED_WINDOW_ELAPSED_MS;
  return {
    projects: [
      { id: "cloud-tech-isp-billing", name: "Cloud Tech ISP Billing", color: "#22d3ee" },
      { id: "al-shamrat-website", name: "Al Shamrat Website", color: "#2dd4bf" },
      { id: "nirbhoy-app", name: "Nirbhoy App", color: "#4ade80" },
      { id: "portfolio-redesign", name: "Portfolio Redesign", color: "#a3e635" }
    ],
    activeProjectId: "cloud-tech-isp-billing",
    usage: {},
    limits,
    hasRealData: false
  };
}

let queue = Promise.resolve();
function withState(mutator) {
  const run = queue.then(async () => {
    const stored = await chrome.storage.local.get(STATE_KEY);
    const state = stored[STATE_KEY] || defaultState();
    const result = mutator(state);
    await chrome.storage.local.set({ [STATE_KEY]: state });
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

function todayKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function ensureSiteUsage(state, projectId, siteKey) {
  if (!state.usage[projectId]) state.usage[projectId] = {};
  if (!state.usage[projectId][siteKey]) {
    state.usage[projectId][siteKey] = { days: {}, session: { input: 0, output: 0 } };
  }
  return state.usage[projectId][siteKey];
}

// Rolls an expired limit window forward; returns the site's limit record.
function rollWindow(limit, now) {
  if (!limit.windowStart) return limit;
  const span = limit.windowHours * 3600 * 1000;
  if (now - limit.windowStart >= span) {
    const cycles = Math.floor((now - limit.windowStart) / span);
    limit.windowStart += cycles * span;
    limit.windowMsgs = 0;
  }
  return limit;
}

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(STATE_KEY);
  if (!stored[STATE_KEY]) {
    await chrome.storage.local.set({ [STATE_KEY]: defaultState() });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return;

  if (msg.type === "tw-usage") {
    const { site, sessionInput, sessionOutput, inputDelta, outputDelta, msgsDelta } = msg;
    if (!SITE_KEYS.includes(site)) return;
    withState((state) => {
      const projectId = state.activeProjectId;
      const u = ensureSiteUsage(state, projectId, site);
      if (typeof sessionInput === "number") u.session.input = sessionInput;
      if (typeof sessionOutput === "number") u.session.output = sessionOutput;
      const day = (u.days[todayKey()] ||= { input: 0, output: 0, msgs: 0 });
      if (inputDelta > 0) day.input += inputDelta;
      if (outputDelta > 0) day.output += outputDelta;
      if (msgsDelta > 0) {
        day.msgs += msgsDelta;
        const limit = rollWindow(state.limits[site], Date.now());
        if (!limit.windowStart) limit.windowStart = Date.now();
        limit.windowMsgs += msgsDelta;
      }
      if (inputDelta > 0 || outputDelta > 0 || msgsDelta > 0) state.hasRealData = true;
    }).then(() => sendResponse({ ok: true }));
    return true; // async response
  }

  if (msg.type === "tw-limit-hit") {
    const { site } = msg;
    if (!SITE_KEYS.includes(site)) return;
    withState((state) => {
      const limit = state.limits[site];
      const now = Date.now();
      // A limit message means a fresh window starts now; ignore repeats
      // within 60 seconds so one banner does not keep restarting it.
      if (!limit.windowStart || now - limit.windowStart > 60 * 1000) {
        limit.windowStart = now;
        limit.windowMsgs = 0;
      }
    }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === "tw-set-active-project") {
    withState((state) => {
      if (state.projects.some((p) => p.id === msg.projectId)) {
        state.activeProjectId = msg.projectId;
      }
    }).then(() => sendResponse({ ok: true }));
    return true;
  }
});
