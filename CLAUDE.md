# wpr-happy-hour — Claude Code context

Time-aware happy hour finder for Wausau Pilot & Review (nonprofit local newsroom).
Embeds in WordPress via iframe from GitHub Pages.

## Stack & pipeline
Hand-curated JSON → React 18/Vite 5 → GitHub Pages (Actions workflow in
.github/workflows/deploy.yml) → WordPress iframe. Deliberately NO Python, no
cron, no backend, no Supabase — content has no upstream source. Do not add any.

## Architecture invariants
- `src/data/bars.json` is the single source of truth. Schema is enforced by
  `validate()` in App.jsx — it throws at load. Keep it that way: schema changes
  update the validator in the same commit, no silent fallbacks, no defaults.
- Bar contact info NEVER goes in bars.json (it lives in a separate Notion CRM).
- Tiers are exactly "free" | "featured". No third tier without explicit ask.
- Time logic: start inclusive, end exclusive, no cross-midnight windows,
  visitor's local browser time. Do not introduce timezone libraries.
- Single component file (App.jsx) is intentional at this size. Split only
  when a file genuinely has multiple responsibilities.

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
All specials in bars.json are PLACEHOLDER pending verification calls with each
bar. That's a sales task, not a code task — never invent "real" specials.
