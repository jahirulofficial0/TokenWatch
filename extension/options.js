/* TokenWatch — options page logic. Reads/writes the shared local state. */

const STATE_KEY = "tw_state_v1";
const PALETTE = ["#22d3ee", "#2dd4bf", "#4ade80", "#a3e635", "#f59e0b", "#f472b6", "#818cf8"];

const $ = (id) => document.getElementById(id);
let state = null;

function say(text) {
  $("status").textContent = text;
  setTimeout(() => {
    if ($("status").textContent === text) $("status").textContent = "";
  }, 2600);
}

async function load() {
  const stored = await chrome.storage.local.get(STATE_KEY);
  state = stored[STATE_KEY];
  if (!state) {
    say("No data yet — open an AI chat site or the popup first.");
    return;
  }
  fillLimit();
  fillProjects();
}

function fillLimit() {
  const limit = state.limits[$("limitSite").value];
  $("limitHours").value = limit.windowHours;
  $("limitMsgs").value = limit.msgLimit;
}

function fillProjects() {
  const wrap = $("projectRows");
  wrap.textContent = "";
  state.projects.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "proj-row";
    const sw = document.createElement("span");
    sw.className = "swatch";
    sw.style.background = p.color;
    const input = document.createElement("input");
    input.type = "text";
    input.value = p.name;
    input.dataset.projectId = p.id;
    const active = document.createElement("span");
    active.style.cssText = "font-size:11px;color:#9fb3d1;width:52px;text-align:right";
    active.textContent = p.id === state.activeProjectId ? "active" : "";
    void i;
    row.append(sw, input, active);
    wrap.appendChild(row);
  });
}

async function save(mutator, message) {
  mutator(state);
  await chrome.storage.local.set({ [STATE_KEY]: state });
  say(message);
}

document.addEventListener("DOMContentLoaded", () => {
  load();
  $("limitSite").addEventListener("change", fillLimit);
  $("saveLimit").addEventListener("click", () =>
    save((s) => {
      const limit = s.limits[$("limitSite").value];
      limit.windowHours = Math.max(1, parseInt($("limitHours").value, 10) || 5);
      limit.msgLimit = Math.max(1, parseInt($("limitMsgs").value, 10) || 50);
    }, "Window saved.")
  );
  $("resetWindow").addEventListener("click", () =>
    save((s) => {
      const limit = s.limits[$("limitSite").value];
      limit.windowStart = Date.now();
      limit.windowMsgs = 0;
    }, "Window restarted.")
  );
  $("addProject").addEventListener("click", () => {
    const name = $("newProjectName").value.trim();
    if (!name || !state) return;
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now().toString(36);
    save((s) => {
      s.projects.push({ id, name, color: PALETTE[s.projects.length % PALETTE.length] });
    }, "Project added.").then(() => {
      $("newProjectName").value = "";
      fillProjects();
    });
  });
  $("saveProjects").addEventListener("click", () => {
    const names = {};
    document.querySelectorAll("[data-project-id]").forEach((input) => {
      const v = input.value.trim();
      if (v) names[input.dataset.projectId] = v;
    });
    save((s) => {
      s.projects.forEach((p) => {
        if (names[p.id]) p.name = names[p.id];
      });
    }, "Projects saved.");
  });
  $("clearData").addEventListener("click", async () => {
    await chrome.storage.local.remove(STATE_KEY);
    say("All tracked data cleared. Reopen the popup to start fresh.");
  });
});
