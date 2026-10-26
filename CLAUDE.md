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
- Finder layout is a timetable (rows grouped "Until X" / "From X" with a time track),
  adopted 2026-10-26 after the competitive review.
- Single component file (App.jsx) is intentional at this size. Split only
  when a file genuinely has multiple responsibilities. Time/listing logic lives
  in src/schedule.js because three consumers share it (App.jsx, the newsletter
  card src/digest.jsx, scripts/render-digest.mjs); it's unit-tested (`npm test`).
- Newsletter card: digest.html is screenshotted by Playwright at deploy time into
  one PNG per weekday + digest.json (dist/digest/). Verified bars only — nothing
  unconfirmed reaches subscribers. No cron: the card changes only with bars.json.
  The email side lives in the wpr-newsletter repo (auto-sends; confirm before
  touching it).
- Newsletter spotlight (the cheap per-send ad): spotlight.html renders one 970×500
  PNG per verified bar with `ad` copy (dist/digest/spotlight/ + spotlight.json) in
  WPR's house ad style (the wpr-ad-creative skill): the bar's own photo and logo,
  copy from its own advertising agreed at the sale, labeled "Advertisement". No
  generic or stock-photo demo ad. The render fails on text that runs off or
  collides, or a photo it would stretch — fix the copy, don't loosen the check.
  Bookings stay offline (Broadstreet / the sale) — no ad dates or booking fields in
  bars.json. Sales previews (`?preview=<id>`) are never sent; the collateral sample
  is The Palms Supper Club (owner-approved showcase, featured with its own photo).
- Every listing shows where its specials came from and when (`verifiedOn`, or
  `checked` for sourced-but-unverified). `checked` is set only after actually
  re-reading the bar's own site/posts. Tags and notes come from the call, never guessed.
- Fonts and photos are self-hosted (public/fonts, public/photos): no Google Fonts or
  other third-party requests at load.
- Paid outbound links (bar websites, sponsor) carry rel="sponsored" + UTM tags.
- Verification lands through `npm run calls -- <call-sheet.csv> [--write]`
  (scripts/apply-calls.mjs): Chris's "Verified" rows set specials, tier and
  verifiedOn in one validated step. Don't hand-edit verifiedOn. The call sheet
  itself stays off the repo (phone numbers).

## Engineering rules
- No fallbacks: one correct path. Fail fast and loud.
- Surgical changes only — minimal diffs, fix root causes not symptoms.
- No overengineering: no state libraries, no routing, no CSS frameworks.
- Design system is fixed: teal #3A867C, cream #F6F2E9, Fraunces display,
  Public Sans body, JetBrains Mono for times/prices/data. Tokens in index.css; the
  evening tokens (night, gold) carry featured cards. The spotlight ad is the bar's
  ad, not the finder's, so it uses the house ad type (Anton, Yellowtail, Barlow
  Condensed) in spotlight.css.

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
