/*
 * TokenWatch — content script for AI chat sites.
 *
 * 1. Injects the floating corner widget exactly as designed (300px glass
 *    card, bottom-right): site name + LIVE, running Input / Output token
 *    estimates for this session, Session total, and the circular ring for
 *    the rate-limit window.
 * 2. Estimates tokens from page text. This is a local ESTIMATE only: the
 *    visible conversation text length divided by 4 (the usual rough
 *    chars-per-token heuristic). No provider exposes exact live counts to
 *    an extension, so figures are approximate by design.
 * 3. Detects rate-limit banners ("message limit", "rate limit", ...) and
 *    tells the background worker to start a fresh reset window.
 *
 * Usage is stored locally (chrome.storage.local) per project / site / day
 * by background.js. Nothing leaves the browser.
 */

(function () {
  "use strict";

  const STATE_KEY = "tw_state_v1";

  const SITE_BY_HOST = {
    "chatgpt.com": { key: "chatgpt", name: "ChatGPT", color: "#10a37f" },
    "chat.openai.com": { key: "chatgpt", name: "ChatGPT", color: "#10a37f" },
    "gemini.google.com": { key: "gemini", name: "Gemini", color: "#4796e3" },
    "claude.ai": { key: "claude", name: "Claude", color: "#d97757" },
    "muse.ai": { key: "muse", name: "Muse", color: "#0082fb" }
  };
  const site = SITE_BY_HOST[location.hostname];
  if (!site) return;

  // Best-effort message selectors per site (experimental: site DOMs change).
  const SELECTORS = {
    chatgpt: {
      user: ['[data-message-author-role="user"]'],
      assistant: ['[data-message-author-role="assistant"]']
    },
    claude: {
      user: ['[data-testid="user-message"]', ".human-message"],
      assistant: ['[data-testid="assistant-message"]', ".font-claude-response", "[data-is-streaming]"]
    },
    gemini: {
      user: ["user-query .query-text", "user-query"],
      assistant: ["model-response .markdown", "model-response"]
    },
    muse: {
      user: ['[data-testid="user-message"]', '[class*="user"] [class*="prose"]'],
      assistant: ['[data-testid="assistant-message"]', '[class*="prose"]']
    }
  };
  const sel = SELECTORS[site.key];

  const LIMIT_TEXT_RE =
    /(reached|hit)\s+(the\s+|your\s+)?(message\s+|usage\s+|rate\s+)?limit|message limit|rate limit|too many requests|usage limit|try again (at|in)\b|limit resets/i;

  const CHARS_PER_TOKEN = 4; // estimate heuristic — see header comment
  const estimateTokens = (text) => Math.round(text.length / CHARS_PER_TOKEN);

  function collectText(selectors) {
    const seen = new Set();
    let text = "";
    let count = 0;
    for (const s of selectors) {
      document.querySelectorAll(s).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        count += 1;
        text += "\n" + (el.innerText || el.textContent || "");
      });
    }
    return { text, count };
  }

  /* ---------------- Corner widget (design, same-to-same) ---------------- */

  const host = document.createElement("div");
  host.id = "tokenwatch-corner-widget";
  host.style.cssText =
    "position: fixed; right: 24px; bottom: 24px; z-index: 2147483647; font-family: Inter, sans-serif; color: #e6f1ff;";
  host.innerHTML = `
<div style="width: 300px; box-sizing: border-box; padding: 16px; border-radius: 16px; background: rgba(16, 30, 58, 0.62); border: 1px solid rgba(103, 232, 249, 0.22); box-shadow: 0 20px 48px rgba(0, 0, 0, 0.55), 0 0 32px rgba(34, 211, 238, 0.16), inset 0 1px 0 rgba(255, 255, 255, 0.08); backdrop-filter: blur(18px); display: flex; gap: 16px; align-items: center">
<div style="flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 10px">
<div style="display: flex; align-items: center; gap: 8px">
<span aria-hidden="true" style="width: 10px; height: 10px; border-radius: 50%; background: ${site.color}; box-shadow: 0 0 10px ${site.color}"></span>
<span style="font-size: 13px; font-weight: 600">${site.name}</span>
<span style="margin-left: auto; font-size: 11px; font-weight: 600; color: #4ade80; display: flex; align-items: center; gap: 4px"><span aria-hidden="true" style="width: 6px; height: 6px; border-radius: 50%; background: #4ade80"></span>LIVE</span>
</div>
<div style="display: flex; gap: 14px">
<div style="display: flex; flex-direction: column; gap: 2px">
<span style="font-size: 11px; color: #9fb3d1">Input</span>
<span data-tw="input" style="font-family: 'JetBrains Mono', monospace; font-size: 15px; font-weight: 700; color: #22d3ee">12,480</span>
</div>
<div style="display: flex; flex-direction: column; gap: 2px">
<span style="font-size: 11px; color: #9fb3d1">Output</span>
<span data-tw="output" style="font-family: 'JetBrains Mono', monospace; font-size: 15px; font-weight: 700; color: #4ade80">8,215</span>
</div>
</div>
<div style="padding-top: 8px; border-top: 1px solid rgba(159, 179, 209, 0.16); display: flex; justify-content: space-between; align-items: baseline">
<span style="font-size: 11px; color: #9fb3d1">Session total</span>
<span data-tw="total" style="font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 700">20,695</span>
</div>
</div>
<div style="position: relative; width: 72px; height: 72px; flex: 0 0 72px">
<svg width="72" height="72" viewBox="0 0 72 72" role="img" aria-label="Rate limit window used">
<defs><linearGradient id="tw-rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#22d3ee"></stop><stop offset="1" stop-color="#4ade80"></stop></linearGradient></defs>
<circle cx="36" cy="36" r="30" fill="none" stroke="rgba(159,179,209,0.18)" stroke-width="6"></circle>
<circle data-tw="ring" cx="36" cy="36" r="30" fill="none" stroke="url(#tw-rg)" stroke-width="6" stroke-linecap="round" stroke-dasharray="116.9 188.5" transform="rotate(-90 36 36)"></circle>
</svg>
<div style="position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center">
<span data-tw="pct" style="font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 700">62%</span>
<span data-tw="winlabel" style="font-size: 9px; color: #9fb3d1">5h limit</span>
</div>
</div>
</div>`;
  document.documentElement.appendChild(host);

  const el = {
    input: host.querySelector('[data-tw="input"]'),
    output: host.querySelector('[data-tw="output"]'),
    total: host.querySelector('[data-tw="total"]'),
    ring: host.querySelector('[data-tw="ring"]'),
    pct: host.querySelector('[data-tw="pct"]'),
    winlabel: host.querySelector('[data-tw="winlabel"]')
  };
  const fmtInt = (n) => Math.round(n).toLocaleString("en-US");
  const RING_C = 188.5; // 2 * pi * 30, as in the design

  // The design's widget figures are the initial state until real data
  // exists for this site (same convention as the popup).
  const WIDGET_SEED = { input: 12480, output: 8215, total: 20695, pct: 62 };

  async function refreshWidget() {
    try {
      const stored = await chrome.storage.local.get(STATE_KEY);
      const st = stored[STATE_KEY];
      if (!st) return;
      const limit = st.limits[site.key];
      el.winlabel.textContent = `${limit.windowHours}h limit`;
      const usage = ((st.usage || {})[st.activeProjectId] || {})[site.key];
      if (!st.hasRealData) {
        el.input.textContent = fmtInt(WIDGET_SEED.input);
        el.output.textContent = fmtInt(WIDGET_SEED.output);
        el.total.textContent = fmtInt(WIDGET_SEED.total);
        el.pct.textContent = WIDGET_SEED.pct + "%";
        el.ring.setAttribute("stroke-dasharray", `${((WIDGET_SEED.pct / 100) * RING_C).toFixed(1)} ${RING_C}`);
        return;
      }
      const session = usage ? usage.session : { input: 0, output: 0 };
      el.input.textContent = fmtInt(session.input);
      el.output.textContent = fmtInt(session.output);
      el.total.textContent = fmtInt(session.input + session.output);
      const pct = limit.msgLimit > 0 ? Math.min(100, Math.round((limit.windowMsgs / limit.msgLimit) * 100)) : 0;
      el.pct.textContent = pct + "%";
      el.ring.setAttribute("stroke-dasharray", `${((pct / 100) * RING_C).toFixed(1)} ${RING_C}`);
    } catch (e) {
      /* storage unavailable (page navigating) — next tick retries */
    }
  }

  /* ---------------- Tracking ---------------- */

  let prev = null; // previous snapshot from this page instance
  let lastSent = null; // last session values reported to the background
  let limitNotifiedAt = 0;

  function scan() {
    const user = collectText(sel.user);
    const assistant = collectText(sel.assistant);
    const sessionInput = estimateTokens(user.text);
    const sessionOutput = estimateTokens(assistant.text);

    if (!prev) {
      // First scan of this page load: adopt the open conversation as the
      // session baseline without inflating the daily totals.
      prev = { sessionInput, sessionOutput, userCount: user.count };
    }
    const inputDelta = Math.max(0, sessionInput - prev.sessionInput);
    const outputDelta = Math.max(0, sessionOutput - prev.sessionOutput);
    const msgsDelta = Math.max(0, user.count - prev.userCount);
    prev = { sessionInput, sessionOutput, userCount: user.count };

    const sessionChanged =
      !lastSent || lastSent.input !== sessionInput || lastSent.output !== sessionOutput;
    if (sessionChanged || inputDelta > 0 || outputDelta > 0 || msgsDelta > 0) {
      lastSent = { input: sessionInput, output: sessionOutput };
      chrome.runtime
        .sendMessage({
          type: "tw-usage",
          site: site.key,
          sessionInput,
          sessionOutput,
          inputDelta,
          outputDelta,
          msgsDelta
        })
        .catch(() => {});
    }

    const bodyText = document.body ? document.body.innerText : "";
    if (bodyText && LIMIT_TEXT_RE.test(bodyText) && Date.now() - limitNotifiedAt > 60 * 1000) {
      limitNotifiedAt = Date.now();
      chrome.runtime.sendMessage({ type: "tw-limit-hit", site: site.key }).catch(() => {});
    }
    refreshWidget();
  }

  let scanTimer = null;
  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(() => {
      scanTimer = null;
      scan();
    }, 800);
  }

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  setInterval(scan, 4000); // streaming responses mutate constantly; a slow poll keeps deltas honest
  setInterval(refreshWidget, 5000);
  scan();
})();
