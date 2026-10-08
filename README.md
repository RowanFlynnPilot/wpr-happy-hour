# wpr-happy-hour

Time-aware happy hour finder for the Wausau area. A Wausau Pilot & Review community tool.

**Pipeline:** hand-curated JSON → React/Vite → GitHub Pages → WordPress iframe embed.
No Python, no cron, no backend — the content has no upstream source, so it doesn't get one.

## ⚠️ Before launch

`src/data/bars.json` holds research-sourced initial data (2026-08-01): specials either
come from a bar's own public advertising or are `PLACEHOLDER`-marked guesses. Everything
**must still be verified with each bar by phone** before launch — the verification call
IS the sales call: Chris confirms the specials, closes the listing, and the bar's `tier`
+ `verifiedOn` land in the same JSON edit. Contact capture goes to the Notion pipeline;
the per-bar source sheet lives with the owner, not in this public repo.

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
  (derived from the address), and an optional `photo` URL. A `photo` on a partner-tier
  bar fails validation — the photo is a featured perk.
- `verifiedOn` is `null` until the specials are confirmed with the bar by phone, then the
  `YYYY-MM-DD` of that call. Renders as "✓ Verified <Mon Year>" on the card (null shows
  "Details being confirmed"); `npm run check` warns on unverified or >90-day-old listings.
- A verified bar may not carry `PLACEHOLDER` items — replace them with the confirmed
  specials in the same edit that sets `verifiedOn`.
- `address` ends with `, <city>` (`"123 Main St, Wausau"`) — cards print it alone.
- `id` is lowercase kebab-case and never changes once shared — it's the partner's
  `?bar=` link.
- `website` is `""` or a full `http(s)://` URL (prefer https; http only for sites
  without it). `photo` is `null` or a full `https://` URL.
- `days` values: `mon tue wed thu fri sat sun`, no repeats.
- `start`/`end` are 24h `HH:MM`; `end` must be after `start`. No cross-midnight windows.
- `type` is `"drinks"`, `"food"`, or `"both"` — drives the food/drinks filter.
- Dates are real calendar dates; CI also rejects `updated`/`verifiedOn` in the future.
- Unknown fields are rejected. Contact info for bars lives in the Notion pipeline,
  **never** in this file — a `"phone"` key fails the build.

Update `updated` (top-level) whenever specials change; it renders in the footer.

## Recording verification calls

The call sheet (a CSV kept off the repo — it holds phone numbers) is the input.
For each call Chris fills four columns: **Call date**, **Outcome** (`Verified`,
`Callback`, `No answer`, `Declined`, `Closed`), **Tier sold** (`Partner` or
`Featured`), and **Verified specials (final)**, one special per line:

```
Mon-Fri 3pm-6pm drinks: $2 off rails; $1 off taps
Fri 4-9pm food: Fish fry — cod 2 pc $12 · 3 pc $15
```

Days take ranges, lists, `Daily`, `Weekdays`; times take `3pm`, `3:30pm`, `noon`,
`midnight`; type is `drinks`, `food` or `both`; items split on `;`. "Until close"
is not a time — get the closing time. Then:

```powershell
npm run calls -- "C:\Users\rpfly\OneDrive\Desktop\happy-hour-call-tracker-2026-09-26.csv"
npm run calls -- "C:\Users\rpfly\OneDrive\Desktop\happy-hour-call-tracker-2026-09-26.csv" --write
```

The first command previews; `--write` applies. Every `Verified` row replaces that
bar's specials, sets its tier and `verifiedOn` = the call date, and the whole file
passes `validate()` before anything is written. A row it can't read stops the run
and names the bar. Other outcomes are listed, never applied. Re-running the same
sheet is safe.

Top-level `sponsor` is `null` until the title sponsorship sells, then
`{ "name": "Business Name", "url": "https://..." }` (`url` may be `""`). Selling
the slot is a JSON edit, not a code change.

## Local dev

```powershell
cd C:\Users\rpfly\Projects\wpr-happy-hour; npm install; npm run dev
```

`npm run check` validates bars.json; `npm test` runs the unit tests (Node's built-in
runner — time logic in `src/schedule.js`, every validator rule). CI runs both before
every deploy.

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
  // Forward article deep links (?view=fri, ?bar=..., ?city=..., ?type=...) into
  // the app — without this, links to the WP page can't pre-select anything.
  if (window.location.search) {
    document.getElementById('wpr-hh').src += window.location.search;
  }
  window.addEventListener('message', function (e) {
    if (e.origin !== 'https://rowanflynnpilot.github.io') return;
    if (e.data && e.data.type === 'wpr-hh-height') {
      var frame = document.getElementById('wpr-hh');
      frame.height = e.data.height;
      // ?bar= links: the frame can't scroll itself once it's full height, so the
      // page scrolls to the partner's card (sent once, on the first report)
      if (typeof e.data.anchor === 'number') {
        window.scrollTo(0, frame.getBoundingClientRect().top + window.scrollY + e.data.anchor);
      }
    }
  });
</script>
```

## Newsletter card

Email can't run the app (no iframes, no JavaScript), so the newsletter gets an image —
the same pattern as the Packers, gas-price and meeting digests. `digest.html` is a
536px card; `scripts/render-digest.mjs` screenshots it with Playwright at deploy time:

- `digest/<day>.png` — one per weekday. **Verified bars only**: featured partners get
  a full entry (up to 3, with specials and photo), every other verified partner open
  that day gets a name + time line (up to 8, then "+N more"). The presenting
  `sponsor` is baked in — one sponsorship covers the tool and the newsletter.
- `digest/digest.json` — per-day `count`, `image`, `alt`. `image` is `null` on days
  with no verified partners; the newsletter omits the section on those days.
- `digest/demo.png` — sales preview with sample listings. Any day, live:
  `digest.html?day=thu&demo`, or `&demo=Bar%20Name` to put a prospect's name in the
  featured spot for a screenshot.

No schedule is needed: the card only changes when bars.json does, and the newsletter
picks the weekday's file. Local run (first time: `npx playwright install chromium`):

```powershell
npm run build; npm run render
```

The newsletter side lives in the `wpr-newsletter` repo: add `wpr-happy-hour` to the
tools-proxy allowlist (then redeploy the Cloudflare worker), and read `digest.json`
in a fail-soft block like the featured pet, linking the image to the WP page with
`?view=<day>`.

## Newsletter spotlight

The cheap placement: one partner's own small ad in a newsletter, sold by the send.
`spotlight.html` builds it from the bar's listing, so the ad always matches the finder;
`scripts/render-digest.mjs` renders it with the newsletter card:

- `digest/spotlight/<id>.png` — one per **verified** bar, so a sale needs no code
  change. Name, address, up to three windows (Monday first, at most six lines
  of specials between them, then "+N more specials"), the bar's website as the call to action, and the photo for
  featured partners. Labeled "Advertisement" inside the image.
- `digest/spotlight.json` — per ad: `image`, `alt` (the whole ad, for readers who
  block images) and `link` (the bar's site with `utm_medium=newsletter`; `null` when
  it has no site — link its finder listing, `?bar=<id>`, instead).
- `digest/spotlight-demo.png` — sales preview; live with a prospect's name:
  `spotlight.html?demo=Bar%20Name`. `digest/spotlight-sample.png` is the same without
  its "Sales preview" ribbon (`?demo&sample`), for the one-pager, which labels it itself.

**Running one.** Bookings (dates, edition) stay offline with the sale, never in
bars.json. The newsletter already runs date-ranged ads through Broadstreet and shows a
zone only while it has a placement (`conditional_zone_block` in wpr-newsletter), so
the spotlight can run the same way: upload the bar's PNG as the creative for the sold
dates, with `link` and `alt` from spotlight.json. Broadstreet holds a copy — if the
bar's specials change mid-run, re-upload the new image. (A wpr-newsletter block that
reads spotlight.json directly would need a cache-busting `?v=` on the image URL:
Gmail's image proxy caches by URL.)

**Sales notes** (research, 2026-10-08 — not legal advice): the bar pays for its own
spotlight. A brewery or distributor paying for a bar's ad runs into Wisconsin's
tied-house law (Wis. Stat. 125.33) — confirm with DOR before taking that money.
Wisconsin has no statewide ban on advertising happy hours or price specials, but cities
can restrict some promotions through license conditions; keep "bottomless" and
drinking-game copy out.

## Sales assets

- `public/partners.html` — the rate card Chris shares or prints to PDF:
  https://rowanflynnpilot.github.io/wpr-happy-hour/partners.html. Prices are "$––"
  placeholders until set; remove the DRAFT ribbon in the same edit. Not linked
  from the reader UI.
- `public/spotlight-one-pager.html` — Chris's leave-behind for the newsletter
  spotlight: one Letter page (browser → Print → Save as PDF), or send the URL
  (.../spotlight-one-pager.html). Its centerpiece is the ad on a phone in the 5 p.m.
  edition, using the live `digest/spotlight-sample.png` (stories are drawn as lines, not
  invented headlines). WPR's wordmark is committed as `public/wpr-wordmark.png`.
  Audience numbers are WPR's published figures (sponsorship page, Jan 2026) — update
  them there first. Same "$––" + DRAFT-ribbon rule as the rate card.
- `public/spotlight-objections.html` — Chris's one-page quick reference for spotlight
  calls: what bar owners say, a line to say back, a follow-up question, the hard noes
  (supplier-paid ads, "bottomless" copy) and when not to sell. Written to be fine if a
  prospect read it. Lines tagged "Check" need a yes from Shereen / DOR first.
- `LAUNCH.md` — the ordered launch checklist.

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
- **Paid links:** bar websites and the sponsor link carry `rel="sponsored"` (every
  listing is paid) and `utm_source=wausaupilotandreview&utm_medium=widget&utm_campaign=happy-hour`,
  so partners see WPR's referrals in their own analytics.
