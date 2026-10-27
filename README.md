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
  "checked": { "on": "2026-10-26", "via": "website" },
  "tags": ["patio"],
  "note": null,
  "photo": null,
  "logo": null,
  "ad": null,
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
  free tier. Featured gets the evening card, pinned sort, a Directions link (derived
  from the address), and its `photo` shown on the card.
- `verifiedOn` is `null` until the specials are confirmed with the bar by phone, then the
  `YYYY-MM-DD` of that call. Renders as "Verified by phone, <Mon Year>" on the card;
  `npm run check` warns on unverified or >90-day-old listings.
- `checked` says where an unverified listing's sourced specials came from and when:
  `{ "on": "YYYY-MM-DD", "via": "website" | "facebook" | "instagram" }`. Required
  once a bar has any sourced (non-`PLACEHOLDER`) special and isn't verified; the card
  shows "From the bar's website, checked Oct 26", greyed with "may have changed" after
  90 days. `npm run check` lists sources due for a recheck.
- A verified bar may not carry `PLACEHOLDER` items — replace them with the confirmed
  specials in the same edit that sets `verifiedOn`.
- `tags` — filterable features, from `patio`, `game-day` (Packers game day), `pool`,
  `darts`; collected on the verification call, never guessed. The finder's tag filter
  appears once any bar has one.
- `note` — `null` or one short restriction (≤120 characters) shown on the card in
  amber, e.g. "Happy hour is dine-in only".
- `photo` and `logo` — `null`, a full `https://` URL, or a self-hosted file
  (`photos/<name>.jpg|png|webp`, `logos/<name>.png|jpg|webp`, under `public/`).
  Self-host where possible: a bar's site going down then can't break the finder or
  stop a deploy. Any tier may have them (the spotlight ad uses both); the finder shows
  the photo on featured cards only.
- `ad` — `null`, or the newsletter spotlight's copy, written with the bar at the sale
  from its own advertising: `{ "headline": "Prime Rib", "line": "Saturdays at The
  Palms", "board": ["From 4 PM", "12 oz Queen $42"], "accent": "#c9e265" }`. Needs
  `photo` and `logo`. Headline ≤12 characters, line ≤26, board 1–4 lines of ≤18 (the
  render is the real fit check); `accent` is the bar's brand color as lowercase
  `#rrggbb`, light enough for 4.5:1 on the ad's dark ink.
- `address` ends with `, <city>` (`"123 Main St, Wausau"`) — cards print it alone.
- `id` is lowercase kebab-case and never changes once shared — it's the partner's
  `?bar=` link.
- `website` is `""` or a full `http(s)://` URL (prefer https; http only for sites
  without it).
- `days` values: `mon tue wed thu fri sat sun`, no repeats.
- `start`/`end` are 24h `HH:MM`; `end` must be after `start`. No cross-midnight windows.
- `type` is `"drinks"`, `"food"`, or `"both"` — drives the food/drinks filter.
- Dates are real calendar dates; CI also rejects `updated`/`verifiedOn`/`checked.on`
  in the future.
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

Two optional columns ride along: **Tags (final)** (comma-separated, e.g.
`patio, game-day`) and **Note (final)** (one short restriction; blank clears it).

The first command previews; `--write` applies. Every `Verified` row replaces that
bar's specials, sets its tier and `verifiedOn` = the call date (plus tags and note
when those columns exist), and the whole file passes `validate()` before anything is
written. A row it can't read stops the run
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

- `digest/<day>.png` — one per weekday. **Verified bars only**. It speaks the finder's
  language: an evening band with the day's count as a drop numeral, one line on the
  day's shape ("First at 11 AM, busiest around 5 PM, the last until midnight"), the
  newsroom's "Verified by phone" seal (every bar on the card is), and the day drawn as
  a golden-hour skyline — with no clock in an email, the sun sits on the busiest half
  hour. Then featured partners get a full entry (up to 3, with specials and photo);
  every other verified partner open that day is listed as a schedule, grouped under the
  time its happy hour starts, with when it ends (up to 8). It ends on a band saying
  where the image goes: "See every special and its price", with "+N more". The
  presenting `sponsor` is baked in — one sponsorship covers the tool and the newsletter.
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

The cheap placement: one partner's own ad in a newsletter, sold by the send. It's built
in WPR's house ad style (the wpr-ad-creative look approved Oct 11, 2026) at the ad
unit's real size, **970 × 500**, which the newsletter shows at 414px wide on a computer
and 326 on a phone: the bar's photo on the right under a dark scrim, its logo on a cream
plate, an Anton headline, a Yellowtail script line in the bar's accent color, a
chalkboard of times and prices hung from the top edge, a button naming its site, and the
newsletter's yellow "Advertisement" chip. `spotlight.html` builds it from the bar's
`photo`, `logo` and `ad` (see Data model); every word comes from the bar's own
advertising, agreed at the sale. `scripts/render-digest.mjs` renders it with the
newsletter card:

- `digest/spotlight/<id>.jpg` — one per **verified** bar that has `ad` copy, so a sale
  is a bars.json edit, not a code change.
- `digest/spotlight.json` — per ad: `image`, `alt` (the whole ad, for readers who
  block images) and `link` (the bar's site with `utm_medium=newsletter`; `null` when
  it has no site — link its finder listing, `?bar=<id>`, instead; the button then reads
  "Details on the Happy Hour Finder").
- `spotlight.html?preview=<id>` — a listed bar's own ad before it's verified, for
  pitches, with a "Sales preview" ribbon; never sent to subscribers. A prospect's
  preview needs its `photo`, `logo` and `ad` in bars.json. `digest/spotlight-sample.jpg`
  is the showcase bar's preview without the ribbon (`&sample`), used by the one-pager
  and rate card — The Palms Supper Club, whose owner agreed to be the showcase
  (2026-10-09).

There is no generic demo ad: an ad without the bar's own photo and logo isn't the
product, and stock photos are out. The render fails the deploy when any part of an ad
runs off its edge or comes within 12px of another part (the tilted script line
included), when a board line doesn't fit, or when the photo is smaller than its
640 × 500 panel (it would be stretched); the message says what to shorten. Look at the
image before booking it.

**Running one.** Bookings (dates, edition) stay offline with the sale, never in
bars.json. The newsletter already runs date-ranged ads through Broadstreet and shows a
zone only while it has a placement (`conditional_zone_block` in wpr-newsletter), so
the spotlight can run the same way: upload the bar's JPEG as the creative for the sold
dates, with `link` and `alt` from spotlight.json. Broadstreet holds a copy — if the
bar's specials change mid-run, update its `ad` and re-upload the new image. (A wpr-newsletter block that
reads spotlight.json directly would need a cache-busting `?v=` on the image URL:
Gmail's image proxy caches by URL.)

**Sales notes** (research, 2026-10-08 — not legal advice): the bar pays for its own
spotlight. A brewery or distributor paying for a bar's ad runs into Wisconsin's
tied-house law (Wis. Stat. 125.33) — confirm with DOR before taking that money.
Wisconsin has no statewide ban on advertising happy hours or price specials, but cities
can restrict some promotions through license conditions; keep "bottomless" and
drinking-game copy out.

## Sales assets

- `public/partners.html` — the rate card Chris shares or prints to PDF (one Letter page):
  https://rowanflynnpilot.github.io/wpr-happy-hour/partners.html. Set as a menu, each
  placement with a dotted leader to its price. Prices are "$––" until set; amber
  "To settle" tags mark promises that aren't true yet (analytics, billing terms, the
  founding offer, the newsletter card's 8-a-day list). Fill the prices, settle the tags
  and remove the DRAFT ribbon in the same edit. Not linked
  from the reader UI.
- `public/spotlight-one-pager.html` — Chris's leave-behind for the newsletter
  spotlight: one Letter page (browser → Print → Save as PDF), or send the URL
  (.../spotlight-one-pager.html). Its centerpiece is the ad on a phone in the 5 p.m.
  edition, using the live `digest/spotlight-sample.jpg` (stories are drawn as lines, not
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
  using the visitor's local time, as a timetable: rows grouped "Until 6 PM" (pouring
  now) or "From 8 PM" (later), each with a track of its windows from 10 AM to midnight
  and a now line. Refreshes every 30 seconds.
- **Only sourced specials are stated as fact** (`sourcedOf` in schedule.js): the
  headline count, "first to wrap up / next to start", a row's place in the timetable,
  countdowns and the calendar file all ignore `PLACEHOLDER` windows. Rows with no
  sourced special are tagged "Being confirmed" and fold into one line per time group
  ("22 more, specials being confirmed"); the hero says how many ("Plus 48 more…").
- **The hero follows the clock:** the count is a drop numeral that rolls when a filter
  or the clock changes it (no roll under reduced motion), in the reader's filters
  ("3 food specials are on in Athens right now"). Along its bottom, the day at a glance:
  how many bars have a sourced special each half hour on the rows' own axis, hours gone
  greyed, the clock as a sun on the horizon. Its light changes by phase — day, the
  golden hour (3–7, rooftops in silhouette against the sun), evening, late (deeper
  night, the count in cream). On Fridays it carries the fish fry line: the Fish Fry
  Guide link and a one-tap food filter.
- **Last call:** in a sourced window's final 15 minutes its "N min left" chip turns gold
  ("Last call · 9 min") and the rest of its track burns brighter.
- **It ends on what's next:** the Now view closes on tomorrow ("Tomorrow, Tuesday: 12
  happy hours, first at 10 AM at …", one tap to that day). With nothing confirmed today
  it's quiet: "Back at it tomorrow at 11 AM", the first three openers as buttons that
  open that day at that bar, and "Clear filters" when filters caused it.
- **Day picker:** Mon–Sun views for planning ahead, grouped "From <start>".
- **Filters:** city, food/drinks, and tags (patio, Packers game day…) once any bar has one.
- **Every listing says how fresh it is:** "Verified by phone, Oct 2026" (with the
  newsroom's rubber-stamp seal) or "From the bar's website, checked Oct 26", with **Add to calendar** (an .ics file of the bar's
  sourced specials, repeating weekly, in local time) and **Report a change** (an email
  to Chris; nothing is published until he confirms it with the bar).
- **Deep links:** `?view=fri&city=Weston&type=food&tag=patio` pre-selects
  day/city/type/tag — for article links and pre-filtered embeds. `?bar=red-eye-brewing` lands on the next day
  that bar has a sourced special (else the next day it's listed), brings its card to the
  top, rings it, shows its days and moves focus to it — each partner's shareable link
  for socials and table tents. Invalid values are ignored.
- **Sort:** featured first, then the timetable's time groups in order.
- **Fonts and photos are self-hosted** (`public/fonts/`, `public/photos/`): no Google
  Fonts request, no layout shift, and a bar's site going down can't blank a card. The
  finder uses Fraunces, Public Sans and JetBrains Mono; the spotlight ad, Anton,
  Yellowtail and Barlow Condensed (all SIL Open Font License, latin subsets).
- **Disclosure first:** "Every listing is a paid partner placement…" and the "Being
  confirmed" key sit above the first listing, not in the footer.
- **Sponsor slot:** footer line reserved for the title sponsor.
- **Paid links:** bar websites and the sponsor link carry `rel="sponsored"` (every
  listing is paid) and `utm_source=wausaupilotandreview&utm_medium=widget&utm_campaign=happy-hour`,
  so partners see WPR's referrals in their own analytics.
