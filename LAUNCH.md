# Launch checklist

The tool is code-complete and deployed to GitHub Pages
(https://rowanflynnpilot.github.io/wpr-happy-hour/), but **not yet embedded on
wausaupilotandreview.com or announced**. What blocks launch, in order:

1. **Verification/sales calls (Chris).** No bar in `src/data/bars.json` is
   verified yet. After the 2026-09-26 research cross-check (websites + the bars'
   own Facebook posts): 14 bars carry specials sourced from their own advertising,
   7 are partly sourced (some times still unconfirmed), 51 are `PLACEHOLDER`. The
   dated call sheet is in call order (tier 1 = sourced, pitch-ready) and lists
   what to confirm on each call. Chris logs Call date / Outcome / Tier sold /
   Verified specials; `npm run calls` turns Verified rows into listings (README →
   Recording verification calls). Under the paid partner model the verification call
   IS the sales call: confirm the specials, close the listing, capture contact
   info in Notion. Each closed bar is one JSON edit — real items, `tier`
   (`partner`/`featured`), `verifiedOn: <call date>` — and bump the top-level
   `updated` (CI rejects a verified bar that still has `PLACEHOLDER` items). Target: ~8 signed founding partners before going public, so the
   tracker is useful on day one.
2. **Dress the featured showcase.** Faraway Place needs a street address, website,
   and `photo` URL before Chris demos the featured tier to anyone.
3. **Set pricing → finish the rate card.** Fill real numbers into
   `public/partners.html` and `public/spotlight-one-pager.html` (currently "$––"
   placeholders) and remove each page's DRAFT ribbon in the same edit.
4. **Register Plausible.** Add site `rowanflynnpilot.github.io` to a WPR
   Plausible account. The script tag is already live; no data is recorded until
   the site is registered. Note (checked 2026-08-01): the main WP site runs
   GA4 + Jetpack stats, not Plausible — so this means a new Plausible account.
   If the newsroom would rather consolidate on GA4, swapping the tool's tag is
   a one-line change (owner call; the Plausible pick is from July 2026).
5. **Embed on WordPress.** The pattern is proven: the live Fish Fry Guide page
   embeds its app the same way (iframe → GitHub Pages). Create the page —
   suggest `/wausau-area-happy-hour-guide/` to match the fish fry slug — and
   paste the README snippet; it adds auto-height plus the query-string
   passthrough so article deep links (`?view=fri`, `?bar=...`) work inside
   the iframe.
6. **Switch on the newsletter card** (owner decision 2026-09-26: both daily
   editions). The images already publish with every deploy (README → Newsletter
   card); what's left lives in the `wpr-newsletter` repo, which sends to
   subscribers automatically — review before merging there. Add `wpr-happy-hour`
   to the tools-proxy allowlist and redeploy that Cloudflare worker, then add a
   fail-soft section that reads `digest/digest.json`, shows the weekday's image
   linked to the WP page (`?view=<day>`), and omits itself when `image` is null.
   Needs the WP page from step 5 and at least one verified partner.
   The **newsletter spotlight** (per-send ad, README → Newsletter spotlight) needs
   no code per sale, only a verified partner and a place to run: a Broadstreet zone
   in the edition sold (ask Shereen), the way other dated newsletter ads run.
7. **Cross-link the guides.** The happy hour app already links to the Fish Fry
   Guide on Fridays. Add the reciprocal link on the fish fry side (WP page or
   the wpr-fish-fry app footer) once the happy hour page exists.
8. **Announcement article.** Link the page; give each partner their own
   `?bar=<id>` link to share on socials.

Open decisions (owner/Chris):

- **Unsigned bars at launch.** 58 of 72 bars still show `PLACEHOLDER` text, and
  under the paid model every listed bar should be a paying partner. Before going
  public, either remove unverified bars from bars.json (back to the call sheet) or
  add a launch rule that fails CI on any unverified bar. (The newsletter card
  already shows verified bars only.)
- Price points for partner / featured / presenting sponsor (now including the
  daily newsletter card — see the rate card).
- Spotlight price. WPR's own rate card sells a daily-newsletter banner at
  $300/week per edition; the spotlight is a bigger unit, so price it per send
  (research suggests $25–50) or it undercuts the banner. Also: a "21+" line on
  drink spotlights? (Best practice, not a Wisconsin requirement.)
- Removal policy and timing for lapsed payers.
- Founding-partner launch offer (rate lock? badge?).
