# wpr-happy-hour — Claude Code context

Time-aware happy hour finder for Wausau Pilot & Review (nonprofit local newsroom).
Embeds in WordPress via iframe from GitHub Pages.

## Stack & pipeline
Hand-curated JSON → React 18/Vite 5 → GitHub Pages (Actions workflow in
.github/workflows/deploy.yml) → WordPress iframe. Deliberately NO Python, no
cron, no backend, no Supabase — content has no upstream source. Do not add any.

## Architecture invariants
- `src/data/bars.json` is the single source of truth. Schema is enforced by
  `validate()` in src/data/validate.js — the app throws at load, and CI runs
  the same validator (`npm run check`) before every deploy. Keep it that way:
  schema changes update the validator in the same commit, no silent fallbacks,
  no defaults.
- Bar contact info NEVER goes in bars.json (it lives in a separate Notion CRM).
- Tiers are exactly "partner" | "featured" — every listing is a paid placement,
  there is no free tier (owner decision, July 2026). Billing and sales live with
  Chris Weber offline; no payment code in the tool. No third tier without
  explicit ask.
- verifiedOn is null until Chris confirms specials by phone; never invent a date.
- Analytics is exactly one Plausible script tag in index.html — no other
  external scripts.
- Time logic: start inclusive, end exclusive, no cross-midnight windows,
  visitor's local browser time. Do not introduce timezone libraries.
- Single component file (App.jsx) is intentional at this size. Split only
  when a file genuinely has multiple responsibilities. Time/listing logic lives
  in src/schedule.js because three consumers share it (App.jsx, the newsletter
  card src/digest.jsx, scripts/render-digest.mjs); it's unit-tested (`npm test`).
- Newsletter card: digest.html is screenshotted by Playwright at deploy time into
  one PNG per weekday + digest.json (dist/digest/). Verified bars only — nothing
  unconfirmed reaches subscribers. No cron: the card changes only with bars.json.
  The email side lives in the wpr-newsletter repo (auto-sends; confirm before
  touching it).
- Paid outbound links (bar websites, sponsor) carry rel="sponsored" + UTM tags.

## Engineering rules
- No fallbacks: one correct path. Fail fast and loud.
- Surgical changes only — minimal diffs, fix root causes not symptoms.
- No overengineering: no state libraries, no routing, no CSS frameworks.
- Design system is fixed: teal #3A867C, cream #F6F2E9, Fraunces display,
  Public Sans body, JetBrains Mono for times/prices/data. Tokens in index.css.

## Environment
Windows / PowerShell 5.1. Use `;` for command chaining, `python -m pip` if
Python ever needed (it shouldn't be here). GitHub: RowanFlynnPilot.

## Known state
As of 2026-08-01, bars.json holds research-sourced initial data: identity fields
(names, addresses, websites) corrected from public sources; specials are either
sourced from a bar's own advertising (no PLACEHOLDER prefix) or PLACEHOLDER-marked
guesses. Chris (sales) and Shereen (editorial) validate by phone before anything
gets a verifiedOn date. Never invent specials, prices, or time windows — an
unsourced window stays PLACEHOLDER-marked. Malarkey's and Whiskey River were
removed 2026-08-01 (both closed); Sawmill Brewing 2026-09-26 (temporarily closed);
Tiki Beach 2026-09-26 (closed for the season — re-add in spring). A bar's own
Facebook posts count as own-source; match them by page URL, not name (several
"Office Bar"s exist).

Untimed specials (owner rule, 2026-09-26): a drink special the bar lists by day
with no time may use the bar's own posted open hours for that day. A food special
needs a serving time the bar states — for that special or its menu, or a kitchen
that serves only one dinner window that day; otherwise its item is
PLACEHOLDER-marked ("PLACEHOLDER — time being confirmed: …") until Chris confirms.
An advertised "happy hour" with no time is never widened to open hours.
