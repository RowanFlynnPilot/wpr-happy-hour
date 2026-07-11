# wpr-happy-hour

Time-aware happy hour finder for the Wausau area. A Wausau Pilot & Review community tool.

**Pipeline:** hand-curated JSON → React/Vite → GitHub Pages → WordPress iframe embed.
No Python, no cron, no backend — the content has no upstream source, so it doesn't get one.

## ⚠️ Before launch

Every special in `src/data/bars.json` is marked `PLACEHOLDER` and **must be verified with
each bar** before this goes live. Under the paid partner model the verification call IS the
sales call: Chris confirms the specials, closes the listing, and the bar's `tier` +
`verifiedOn` land in the same JSON edit. Contact capture goes to the Notion pipeline.

## Data model

`src/data/bars.json` is the single source of truth. One shape per bar:

```json
{
  "id": "kebab-case-unique",
  "name": "Bar Name",
  "city": "Wausau",
  "address": "123 Main St, Wausau",
  "website": "",
  "tier": "partner",
  "verifiedOn": null,
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

- `tier` is `"partner"` or `"featured"` — every listing is a paid placement; there is no
  free tier. Featured gets the badge, accent border, pinned sort, a Directions link
  (derived from the address), and an optional `photo` URL.
- `verifiedOn` is `null` until the specials are confirmed with the bar by phone, then the
  `YYYY-MM-DD` of that call. Renders as "✓ Verified <Mon Year>" on the card (null shows
  "Details being confirmed"); `npm run check` warns on unverified or >90-day-old listings.
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

## Analytics

Plausible, via the `script.outbound-links.js` tag in `index.html`: pageviews plus outbound
clicks (bar websites, Directions) — the numbers Chris brings to renewal calls. The site must
be registered as `rowanflynnpilot.github.io` in the WPR Plausible account before data flows;
localhost traffic is ignored automatically.

## Behavior

- **Now view (default):** live clock, groups bars into "Pouring now" and "Later today"
  using the visitor's local time. Refreshes every 30 seconds.
- **Day picker:** Mon–Sun views for planning ahead.
- **Filters:** city and food/drinks.
- **Deep links:** `?view=fri&city=Weston&type=food` pre-selects day/city/type —
  for article links and pre-filtered embeds. `?bar=red-eye-brewing` lands on a day that
  bar is listed, scrolls to its card and tints it — each partner's shareable link for
  socials and table tents. Invalid values are ignored.
- **Sort:** featured first, then by start time, then alphabetically.
- **Sponsor slot:** footer line reserved for the title sponsor.
