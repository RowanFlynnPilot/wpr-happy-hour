# Launch checklist

The tool is code-complete and deployed to GitHub Pages
(https://rowanflynnpilot.github.io/wpr-happy-hour/), but **not yet embedded on
wausaupilotandreview.com or announced**. What blocks launch, in order:

1. **Verification/sales calls (Chris).** Every special in `src/data/bars.json` is
   still `PLACEHOLDER`. Under the paid partner model the verification call IS the
   sales call: confirm the specials, close the listing, capture contact info in
   Notion. Each closed bar is one JSON edit — real items, `tier`
   (`partner`/`featured`), `verifiedOn: <call date>` — and bump the top-level
   `updated`. Target: ~8 signed founding partners before going public, so the
   tracker is useful on day one.
2. **Dress the featured showcase.** Faraway Place needs a street address, website,
   and `photo` URL before Chris demos the featured tier to anyone.
3. **Set pricing → finish the rate card.** Fill real numbers into
   `public/partners.html` (currently "$––" placeholders) and remove its DRAFT
   ribbon in the same edit.
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
6. **Cross-link the guides.** The happy hour app already links to the Fish Fry
   Guide on Fridays. Add the reciprocal link on the fish fry side (WP page or
   the wpr-fish-fry app footer) once the happy hour page exists.
7. **Announcement article.** Link the page; give each partner their own
   `?bar=<id>` link to share on socials.

Open decisions (owner/Chris):

- Price points for partner / featured / presenting sponsor.
- Removal policy and timing for lapsed payers.
- Founding-partner launch offer (rate lock? badge?).
