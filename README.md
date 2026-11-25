# TokenWatch — AI Token & Rate-Limit Tracker

A Chrome extension that keeps an eye on your AI chat usage. A floating
corner widget sits on ChatGPT, Gemini, Claude and Muse pages showing the
running input/output token estimates for the session, the session total,
and how much of the rate-limit window is used. The toolbar popup expands
that into a full panel: total tokens for today / this week / all time,
input vs output split, per-project token spend, and a live rate-limit
reset countdown.

## What it does

- **Corner widget** on every supported AI chat page: site name + LIVE
  indicator, running Input and Output token estimates, Session total, and
  a circular ring showing rate-limit window usage.
- **Popup panel**: total tokens with input/output bars, a project
  selector, a per-project breakdown, and the rate-limit card with a
  per-second reset countdown, window usage bar and message count.
- **Projects**: usage is credited to the project you select in the popup.
  Click the project selector or any row in the PROJECTS list to switch.
  Tabs switch the totals between Today, This Week and Total.
- **Rate-limit windows**: per site, with a configurable window length and
  message limit (gear icon → Settings). When a limit message is detected
  on a page, a fresh window starts automatically. Daily, weekly and
  monthly cycles are covered by setting the window length (24h, 168h,
  720h) in Settings.
- **Private by design**: everything is stored locally in the browser
  (`chrome.storage.local`). Nothing is uploaded anywhere.

## Honest limits

- Token figures are **estimates**: the extension reads the visible
  conversation text and divides its length by 4 (a standard rough
  chars-per-token heuristic). No AI provider exposes exact live token
  counts to an extension, so treat the numbers as close approximations.
- The extension **cannot reset a provider's server-side rate limit** —
  nobody can. What it does is track the window and count down to the
  moment it resets, so you always know where you stand.

## Install (developer mode)

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select the `extension/` folder.
3. Open ChatGPT, Gemini, Claude or Muse — the corner widget appears at
   the bottom right. Click the TokenWatch toolbar icon for the panel.

## Files

| File | Purpose |
|---|---|
| `extension/manifest.json` | Manifest V3 definition |
| `extension/popup.html` / `popup.js` | Toolbar popup panel |
| `extension/content.js` | Corner widget + page-text token estimation + limit detection on AI sites |
| `extension/background.js` | Service worker; owns all storage writes and aggregation |
| `extension/options.html` / `options.js` | Settings: limit windows, projects, data reset |
| `extension/icons/` | Extension icons |

## Developer

Developer: Md Jahirul Islam
Portfolio: https://jahirulofficial.me
Company: Cloud Tech Digital — https://cloudtechdigital.info
Phone: +971 56 720 6899
