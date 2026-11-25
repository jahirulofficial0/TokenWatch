/*
 * TokenWatch — popup panel.
 *
 * Renders the supplied design exactly; every number slot is wired to the
 * local state kept by background.js in chrome.storage.local.
 *
 * Until the first real usage is recorded (state.hasRealData === false) the
 * panel shows the design's own placeholder figures as its initial state.
 * All token figures are local ESTIMATES (page text length / 4 heuristic
 * applied by the content script), never official provider counts.
 */

const STATE_KEY = "tw_state_v1";

const SITES = {
  chatgpt: { name: "ChatGPT", color: "#10a37f", hosts: ["chatgpt.com", "chat.openai.com"] },
  gemini: { name: "Gemini", color: "#4796e3", hosts: ["gemini.google.com"] },
  claude: { name: "Claude", color: "#d97757", hosts: ["claude.ai"] },
  muse: { name: "Muse", color: "#0082fb", hosts: ["muse.ai"] }
};

// The design's own sample figures, used only as the initial state.
const SEED = {
  total: 128430,
  deltaPct: "+12.4%",
  input: 79612,
  output: 48818,
  projects: [
    { name: "Cloud Tech ISP Billing", tokens: 48200 },
    { name: "Al Shamrat Website", tokens: 34700 },
    { name: "Nirbhoy App", tokens: 26500 },
    { name: "Portfolio Redesign", tokens: 19000 }
  ],
  limitPct: 87,
  limitMsgs: 43,
  limitMax: 50
};

const $ = (id) => document.getElementById(id);
const fmtInt = (n) => Math.round(n).toLocaleString("en-US");
const fmtK = (n) => (n >= 1000 ? (Math.round(n / 100) / 10).toFixed(1) + "K" : String(Math.round(n)));

let state = null;
let currentSite = "chatgpt";
let currentRange = "today";
let clockTimer = null;

function dateKey(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sumRange(projectId, range) {
  const out = { input: 0, output: 0 };
  if (!state) return out;
  const sites = (state.usage && state.usage[projectId]) || {};
  for (const siteKey of Object.keys(sites)) {
    const days = sites[siteKey].days || {};
    for (const key of Object.keys(days)) {
      if (range === "today" && key !== dateKey(0)) continue;
      if (range === "week" && key < dateKey(6)) continue;
      out.input += days[key].input || 0;
      out.output += days[key].output || 0;
    }
  }
  return out;
}

function activeProject() {
  return state.projects.find((p) => p.id === state.activeProjectId) || state.projects[0];
}

function renderProjectsList(rows) {
  const grid = $("projectsGrid");
  grid.textContent = "";
  const max = Math.max(1, ...rows.map((r) => r.tokens));
  for (const row of rows) {
    const name = document.createElement("span");
    name.textContent = row.name;
    name.style.cursor = "pointer";
    name.title = "Select project";
    name.addEventListener("click", () => selectProject(row.id));
    const track = document.createElement("div");
    track.style.cssText = "height: 6px; border-radius: 3px; background: rgba(159,179,209,0.14)";
    const fill = document.createElement("div");
    fill.style.cssText = `width: ${Math.round((row.tokens / max) * 100)}%; height: 6px; border-radius: 3px; background: ${row.color}`;
    track.appendChild(fill);
    const val = document.createElement("span");
    val.style.cssText = "font-family: 'JetBrains Mono', monospace; text-align: right";
    val.textContent = fmtK(row.tokens);
    grid.append(name, track, val);
  }
}

function renderMenu() {
  const menu = $("projectMenu");
  menu.textContent = "";
  for (const p of state.projects) {
    const item = document.createElement("button");
    item.className = "tw-project-item";
    item.setAttribute("role", "option");
    const dot = document.createElement("span");
    dot.style.cssText = `width: 8px; height: 8px; border-radius: 3px; background: ${p.color}`;
    const label = document.createElement("span");
    label.textContent = p.name;
    label.style.fontWeight = p.id === state.activeProjectId ? "600" : "500";
    item.append(dot, label);
    item.addEventListener("click", () => {
      menu.classList.remove("open");
      selectProject(p.id);
    });
    menu.appendChild(item);
  }
}

async function selectProject(projectId) {
  if (!projectId || projectId === state.activeProjectId) {
    render();
    return;
  }
  state.activeProjectId = projectId;
  await chrome.runtime.sendMessage({ type: "tw-set-active-project", projectId });
  render();
}

function windowInfo(siteKey) {
  const limit = state.limits[siteKey];
  const span = limit.windowHours * 3600 * 1000;
  let start = limit.windowStart;
  if (!start) return { remainingMs: span, pct: 0, msgs: 0, max: limit.msgLimit, hours: limit.windowHours };
  const now = Date.now();
  if (now - start >= span) start += Math.floor((now - start) / span) * span;
  const remainingMs = Math.max(0, start + span - now);
  const pct = limit.msgLimit > 0 ? Math.min(100, Math.round((limit.windowMsgs / limit.msgLimit) * 100)) : 0;
  return { remainingMs, pct, msgs: limit.windowMsgs, max: limit.msgLimit, hours: limit.windowHours };
}

function fmtClock(ms) {
  const s = Math.ceil(ms / 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

function renderLimit() {
  const info = windowInfo(currentSite);
  let pct = info.pct;
  let msgs = info.msgs;
  let max = info.max;
  if (!state.hasRealData && currentSite === "chatgpt") {
    pct = SEED.limitPct;
    msgs = SEED.limitMsgs;
    max = SEED.limitMax;
  }
  $("rlClock").textContent = fmtClock(info.remainingMs);
  $("rlBar").style.width = pct + "%";
  $("rlWindowLabel").textContent = `${info.hours}-hour window · ${pct}% used`;
  $("rlMsgs").textContent = `${msgs} / ${max} msgs`;
  $("nearLimitBadge").style.display = pct >= 80 ? "flex" : "none";
}

function render() {
  if (!state) return;
  const site = SITES[currentSite];
  $("siteName").textContent = site.name;
  $("siteDot").style.background = site.color;
  $("siteDot").style.boxShadow = `0 0 8px ${site.color}`;

  const project = activeProject();
  $("projectName").textContent = project.name;
  $("projectColor").style.background = project.color;

  const rangeLabel = { today: "TODAY", week: "THIS WEEK", total: "TOTAL" }[currentRange];
  $("totalLabel").textContent = `TOTAL TOKENS · ${rangeLabel}`;

  if (!state.hasRealData) {
    $("totalValue").textContent = fmtInt(SEED.total);
    $("deltaPct").textContent = SEED.deltaPct;
    $("deltaPct").style.display = currentRange === "today" ? "" : "none";
    $("inputValue").textContent = fmtInt(SEED.input);
    $("outputValue").textContent = fmtInt(SEED.output);
    const tot = SEED.input + SEED.output;
    $("inputBar").style.width = Math.round((SEED.input / tot) * 100) + "%";
    $("outputBar").style.width = Math.round((SEED.output / tot) * 100) + "%";
    $("projectTokens").textContent = fmtK(SEED.projects[0].tokens);
    renderProjectsList(
      state.projects.map((p, i) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        tokens: (SEED.projects.find((s) => s.name === p.name) || SEED.projects[i] || { tokens: 0 }).tokens
      }))
    );
  } else {
    const sums = sumRange(project.id, currentRange);
    const total = sums.input + sums.output;
    $("totalValue").textContent = fmtInt(total);
    $("inputValue").textContent = fmtInt(sums.input);
    $("outputValue").textContent = fmtInt(sums.output);
    $("inputBar").style.width = (total > 0 ? Math.round((sums.input / total) * 100) : 0) + "%";
    $("outputBar").style.width = (total > 0 ? Math.round((sums.output / total) * 100) : 0) + "%";
    $("projectTokens").textContent = fmtK(total);
    if (currentRange === "today") {
      const yDate = dateKey(1);
      let yTotal = 0;
      const sites = (state.usage && state.usage[project.id]) || {};
      for (const siteKey of Object.keys(sites)) {
        const d = (sites[siteKey].days || {})[yDate];
        if (d) yTotal += (d.input || 0) + (d.output || 0);
      }
      if (yTotal > 0 && total > 0) {
        const pct = ((total - yTotal) / yTotal) * 100;
        $("deltaPct").textContent = (pct >= 0 ? "+" : "") + pct.toFixed(1) + "%";
        $("deltaPct").style.color = pct >= 0 ? "#4ade80" : "#f87171";
        $("deltaPct").style.display = "";
      } else {
        $("deltaPct").style.display = "none";
      }
    } else {
      $("deltaPct").style.display = "none";
    }
    renderProjectsList(
      state.projects.map((p) => {
        const s = sumRange(p.id, currentRange);
        return { id: p.id, name: p.name, color: p.color, tokens: s.input + s.output };
      })
    );
  }
  renderMenu();
  renderLimit();
}

function setRange(range) {
  currentRange = range;
  document.querySelectorAll("[data-range]").forEach((btn) => {
    const active = btn.dataset.range === range;
    btn.setAttribute("aria-selected", String(active));
    if (active) {
      btn.style.background = "linear-gradient(135deg, rgba(34,211,238,0.28), rgba(74,222,128,0.22))";
      btn.style.color = "#e6f1ff";
      btn.style.fontWeight = "600";
    } else {
      btn.style.background = "transparent";
      btn.style.color = "#9fb3d1";
      btn.style.fontWeight = "500";
    }
  });
  render();
}

async function detectSite() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      const host = new URL(tab.url).hostname;
      for (const [key, site] of Object.entries(SITES)) {
        if (site.hosts.includes(host)) return key;
      }
    }
  } catch (e) {
    /* fall through to the design default */
  }
  return "chatgpt";
}

async function init() {
  currentSite = await detectSite();
  const stored = await chrome.storage.local.get(STATE_KEY);
  state = stored[STATE_KEY];
  if (!state) {
    // Background seeds on install; if the popup is opened first, wait once.
    await new Promise((r) => setTimeout(r, 150));
    state = (await chrome.storage.local.get(STATE_KEY))[STATE_KEY];
  }
  if (!state) return;
  render();
  clockTimer = setInterval(renderLimit, 1000);

  document.querySelectorAll("[data-range]").forEach((btn) => {
    btn.addEventListener("click", () => setRange(btn.dataset.range));
  });
  $("projectBtn").addEventListener("click", () => $("projectMenu").classList.toggle("open"));
  document.addEventListener("click", (e) => {
    if (!$("projectBtn").contains(e.target) && !$("projectMenu").contains(e.target)) {
      $("projectMenu").classList.remove("open");
    }
  });
  $("settingsBtn").addEventListener("click", () => chrome.runtime.openOptionsPage());

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STATE_KEY]) {
      state = changes[STATE_KEY].newValue;
      render();
    }
  });
}

document.addEventListener("DOMContentLoaded", init);
window.addEventListener("unload", () => clockTimer && clearInterval(clockTimer));
