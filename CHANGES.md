# CHANGES — TokenWatch v1.0-2026-11-25

Built 2026-11-25 from the user-supplied design (bundled HTML + 2-page PDF),
coded same-to-same: no colours, layout, labels, order or styling changed.

## What was built, and where

All under `~/workspace/tokenwatch/v1.0-2026-11-25/`:

- `extension/manifest.json` — Manifest V3. Popup action, `storage` + `tabs`
  permissions, host permissions and content-script matches for
  chatgpt.com, chat.openai.com, gemini.google.com, claude.ai, muse.ai.
- `extension/popup.html` — Design Screen 2 (360px panel) transcribed
  verbatim: inline styles, gradients, glass card, fonts (Inter +
  JetBrains Mono via Google Fonts, as in the design), every label and the
  design's initial figures. Only additions are `id` attributes for wiring
  and a project dropdown element (the design's selector button needs one;
  styled in the design's own palette, hidden until the button is clicked).
  The design's 440×900 preview canvas became a 440px-wide, content-height
  popup body; the panel itself is pixel-identical.
- `extension/popup.js` — Wires every slot to local state: site indicator
  from the active tab, project selector + dropdown, totals for
  Today / This Week / Total tabs (tab label and styles switch exactly
  between the design's active/inactive styles), input/output bars,
  PROJECTS list (bars relative to the largest project, as in the design),
  rate-limit card with a per-second countdown, usage bar, message count,
  and the "Near limit" badge (shown at ≥80% used, as designed).
- `extension/content.js` — Design Screen 1 (300px corner card) injected
  verbatim into AI chat pages, fixed bottom-right. Estimates tokens from
  visible conversation text (chars ÷ 4 heuristic — an estimate, labelled
  as such in code comments and the README), splits user text (Input) vs
  assistant text (Output) with per-site selectors, counts user messages,
  detects rate-limit banner text and reports it to the background worker,
  and refreshes the card (session figures + ring) from storage.
- `extension/background.js` — Service worker; the single writer to
  `chrome.storage.local`. Seeds the design's projects and limit windows
  on install, aggregates per-project / per-site / per-day usage, tracks
  session figures, message counts per window, and window rollover.
- `extension/options.html` / `extension/options.js` — Settings behind the
  design's gear button (no design screen exists for it; styled in the
  design's palette): per-site window length in hours (covers the 5–6h
  window plus daily 24h / weekly 168h / monthly 720h), message limit,
  "restart window now", project rename/add, and clear-all-data.
- `extension/icons/icon{16,32,48,128}.png` — the design's logo mark
  (cyan→green gradient rounded square, dark clock glyph) drawn as PNGs.
- `README.md` — project readme with install steps, honest limits, and the
  developer section.

## Data behaviour

- Until the first real usage is recorded, both screens show the design's
  own sample figures as their initial state (popup: 128,430 total etc.;
  widget: 12,480 / 8,215 / 20,695, ring 62%). The popup countdown is real
  from first run: the ChatGPT window is seeded as started 22m48s ago, so
  it opens at 04:37:12 remaining, exactly like the design's live clock.
- The two design screens carry different sample numbers for the rate
  limit (widget ring 62%, popup card 87% / 43 of 50). Both were preserved
  as designed for the initial state; once real data exists, both screens
  show the same real window percentage.
- After real data exists, figures are the locally tracked estimates;
  "+12.4%" becomes a computed change vs yesterday (hidden when there is
  no yesterday baseline).

## Verified

- `node --check` passes on all 4 JS files; `manifest.json` parses as JSON.
- DOM render + behaviour harness (jsdom, 44 checks, all passed):
  - Popup in placeholder mode renders every design value exactly
    (totals, bars 62%/38%, projects 48.2K/34.7K/26.5K/19.0K, limit
    87% · 43/50 · ticking 04:37:xx clock, badge visible), no JS errors.
  - Popup in real-data mode renders tracked figures (1,500 total from a
    1,000/500 day, 3/50 msgs, 6% used, badge hidden).
  - Content script on a fake ChatGPT page injects the widget with the
    design's seed figures and reports session estimates of exactly
    100 input / 200 output tokens for 400/800-char messages.
  - Background worker seeds state on install and records day totals,
    window message counts and session figures from a usage message.
  - Options page loads state, lists projects, and saves a changed
    window length.
- A pixel screenshot comparison was NOT possible: the Chromium build in
  this environment refuses standalone headless startup ("Hatch WebGL
  domain policy is required"), so rendering was verified at DOM level
  instead of by screenshot.

## Experimental / not yet verified

- Live use in a real Chrome profile: the extension has not been loaded
  into Chrome against the real, logged-in AI sites. Per-site message
  selectors are best-effort (ChatGPT's `data-message-author-role` is
  stable; Claude/Gemini/Muse selectors may need tuning after first real
  load, because those DOMs change often).
- Token figures are estimates by construction (chars ÷ 4); they will
  differ from providers' official counts.
- Google Fonts are loaded from the network in the popup/options, as the
  design does; offline, the same font stacks fall back to system fonts.
- Chrome caps popup height at 600px; the full panel is ~740px tall, so
  on smaller screens Chrome will scroll the popup. The design is kept
  intact regardless.

## Rollback

Delete `~/workspace/tokenwatch/v1.0-2026-11-25/` — nothing else was
touched. The design source files in `~/workspace/user/files/` are
untouched. If the extension was loaded in Chrome, remove it from
`chrome://extensions` and (optionally) clear its local storage there.
