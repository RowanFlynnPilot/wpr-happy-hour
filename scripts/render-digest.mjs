// Renders the newsletter images for WPR's daily emails: the day card
// (digest.html) and each verified partner's spotlight ad (spotlight.html).
//
// Email can't run the app (no iframes, no JavaScript), so the fleet pattern
// (see wpr-packers-tracker) is a PNG. Unlike the Packers digest this needs NO
// schedule: the card only changes when bars.json does, and one image per
// weekday lets the newsletter pipeline pick today's file. Run after a build:
//   npm run build; npm run render
// Output, published with the site:
//   dist/digest/<day>.png    verified partners for that weekday (none on days without any)
//   dist/digest/demo.png     sales preview with sample listings
//   dist/digest/digest.json  per-day count, image path and alt text — the
//                            newsletter omits the section when "image" is null
//   dist/digest/spotlight/<id>.png  one spotlight ad per verified partner,
//                            ready to book into a newsletter ad zone
//   dist/digest/spotlight-demo.png  spotlight sales preview (sample listing)
//   dist/digest/spotlight-sample.png  the showcase bar's ad (a preview), for the one-pager and rate card
//   dist/digest/spotlight.json      per-ad image, alt text and tracked link
// Fails loud (non-zero exit, deploy stops) on any page error, missing web font
// or broken image: a wrong image in thousands of inboxes is worse than a
// re-run deploy.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { validate } from '../src/data/validate.js';
import { WEEK_ORDER, digestFor, fmtDays, fmtWindow, fmtWindows, spotlightFor, trackedUrl, weekdayLabel } from '../src/schedule.js';

const WIDTH = 536; // CSS px — the newsletter's image column, rendered at 2x
const OUT = new URL('../dist/digest/', import.meta.url);
const FONTS = ['Fraunces', 'Public Sans', 'JetBrains Mono'];

const data = validate(JSON.parse(await readFile(new URL('../src/data/bars.json', import.meta.url), 'utf8')));

// Alt text carries the card for readers whose mail client blocks images
function altText(day, d) {
  const rows = [...d.featured, ...d.listed].map(({ bar, specials }) => `${bar.name}, ${fmtWindows(specials, ' and ')}`);
  return `${weekdayLabel(day)}’s happy hours on the Happy Hour Finder: ${rows.join('; ')}${d.more ? `; and ${d.more} more` : ''}.`;
}

function spotlightAlt(bar) {
  const { rows, more } = spotlightFor(bar);
  const list = rows.map((g) => `${fmtDays(g.days)} ${fmtWindow(g)}: ${g.items.join(', ')}`).join('; ');
  return `Advertisement: ${bar.name}, ${bar.address}. ${list}${more ? `; and ${more} more` : ''}.`;
}

await mkdir(new URL('spotlight/', OUT), { recursive: true });
const server = await preview({ preview: { port: 4173, strictPort: true }, logLevel: 'warn' });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 900 }, deviceScaleFactor: 2, locale: 'en-US' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e));

  // path: 'digest.html?day=thu' etc. The image is the page's one root element.
  async function shoot(path, file) {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    if (errors.length) throw new Error(`${path}: ${errors[0].message}`);
    // document.fonts.check() passes when a face is missing entirely, so look for loaded faces
    const missing = await page.evaluate(
      (families) => families.filter((f) => ![...document.fonts].some((ff) => ff.family.replace(/"/g, '') === f && ff.status === 'loaded')),
      FONTS
    );
    if (missing.length) throw new Error(`${path}: web font(s) not loaded: ${missing.join(', ')}`);
    const broken = await page.evaluate(() => [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src));
    if (broken.length) throw new Error(`${path}: image(s) failed to load: ${broken.join(', ')}`);
    await page.locator('#root > *').screenshot({ path: fileURLToPath(new URL(file, OUT)) });
    console.log(`Wrote dist/digest/${file}`);
  }

  const days = {};
  for (const day of WEEK_ORDER) {
    const d = digestFor(data.bars, day);
    if (d.count === 0) {
      days[day] = { count: 0, image: null, alt: null };
      console.log(`Skipped ${day} — no verified partners that day`);
      continue;
    }
    await shoot(`digest.html?day=${day}`, `${day}.png`);
    days[day] = { count: d.count, image: `digest/${day}.png`, alt: altText(day, d) };
  }
  await shoot('digest.html?day=thu&demo', 'demo.png');

  const manifest = { updated: data.updated, sponsor: data.sponsor, days };
  await writeFile(new URL('digest.json', OUT), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log('Wrote dist/digest/digest.json');

  // Every verified partner gets a ready ad, so a sale needs no code change.
  // link: the bar's own site, UTM-tagged as newsletter traffic; null when it has
  // none (link the ad to its finder listing, ?bar=<id>, instead).
  const spotlights = [];
  for (const bar of data.bars.filter((b) => b.verifiedOn !== null)) {
    await shoot(`spotlight.html?bar=${bar.id}`, `spotlight/${bar.id}.png`);
    spotlights.push({
      id: bar.id,
      name: bar.name,
      image: `digest/spotlight/${bar.id}.png`,
      alt: spotlightAlt(bar),
      link: bar.website ? trackedUrl(bar.website, 'newsletter') : null,
    });
  }
  await shoot('spotlight.html?demo', 'spotlight-demo.png');
  // The collateral sample (one-pager, rate card) is The Palms Supper Club, whose
  // owner agreed to be the showcase (2026-10-09): a preview of its real, sourced
  // listing. If it ever leaves bars.json this fails loudly — pick a new showcase.
  await shoot('spotlight.html?preview=palms-supper-club&sample', 'spotlight-sample.png');
  await writeFile(new URL('spotlight.json', OUT), `${JSON.stringify({ updated: data.updated, spotlights }, null, 2)}\n`);
  console.log(`Wrote dist/digest/spotlight.json (${spotlights.length} ad${spotlights.length === 1 ? '' : 's'})`);
} finally {
  await browser.close();
  await server.close();
}
