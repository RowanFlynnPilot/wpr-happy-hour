# wpr-happy-hour

Time-aware happy hour finder for the Wausau area. A Wausau Pilot & Review community tool.

**Pipeline:** hand-curated JSON → React/Vite → GitHub Pages → WordPress iframe embed.
No Python, no cron, no backend — the content has no upstream source, so it doesn't get one.

## ⚠️ Before launch

Every special in `src/data/bars.json` is marked `PLACEHOLDER` and **must be verified with
each bar** before this goes live. Verification calls double as the contact-capture play:
claiming/confirming a listing puts a name, email, and phone into the Notion pipeline.

## Data model

`src/data/bars.json` is the single source of truth. One shape per bar:

```json
{
  "id": "kebab-case-unique",
  "name": "Bar Name",
  "city": "Wausau",
  "address": "123 Main St, Wausau",
  "website": "",
  "tier": "free",
  "photo": null,
  "specials": [
    {
      "days": ["mon", "tue", "wed", "thu", "fri"],
      "start": "15:00",
      "end": "18:00",
      "type": "drinks",
      "items": ["$2 off rails"]
    }
  ]
}
```

Rules (enforced by `validate()` in `src/data/validate.js` — the app throws at
load, and `npm run check` runs the same validator in CI before every deploy):

- `tier` is `"free"` or `"featured"`. Featured gets the badge, accent border, pinned sort,
  a Directions link (derived from the address), and an optional `photo` URL.
- `days` values: `mon tue wed thu fri sat sun`.
- `start`/`end` are 24h `HH:MM`; `end` must be after `start`. No cross-midnight windows.
- `type` is `"drinks"`, `"food"`, or `"both"` — drives the food/drinks filter.
- Contact info for bars lives in the Notion pipeline, **never** in this file.

Update `updated` (top-level) whenever specials change; it renders in the footer.

Top-level `sponsor` is `null` until the title sponsorship sells, then
`{ "name": "Business Name", "url": "https://..." }` (`url` may be `""`). Selling
the slot is a JSON edit, not a code change.

## Local dev

```powershell
cd C:\Users\rpfly\Projects\wpr-happy-hour; npm install; npm run dev
```

## Deploy

Standard WPR pattern: push to `main`, GitHub Actions builds and publishes `dist/` to
GitHub Pages. `vite.config.js` uses `base: './'`, so no path config is needed.

WordPress embed — the app reports its content height via `postMessage`, so the
frame sizes itself (no more fixed 1400px clipping busy days). Sanity-check page:
`/embed-test.html` on the deployed site.

```html
<iframe id="wpr-hh" src="https://rowanflynnpilot.github.io/wpr-happy-hour/"
        style="width:100%;border:0;" height="900" loading="lazy"
        title="Happy Hour Finder — Wausau Pilot & Review"></iframe>
<script>
  window.addEventListener('message', function (e) {
    if (e.origin !== 'https://rowanflynnpilot.github.io') return;
    if (e.data && e.data.type === 'wpr-hh-height') {
      document.getElementById('wpr-hh').height = e.data.height;
    }
  });
</script>
```

## Behavior

- **Now view (default):** live clock, groups bars into "Pouring now" and "Later today"
  using the visitor's local time. Refreshes every 30 seconds.
- **Day picker:** Mon–Sun views for planning ahead.
- **Filters:** city and food/drinks.
- **Deep links:** `?view=fri&city=Weston&type=food` pre-selects day/city/type —
  for article links and pre-filtered embeds. Invalid values are ignored.
- **Sort:** featured first, then by start time, then alphabetically.
- **Sponsor slot:** footer line reserved for the title sponsor.
