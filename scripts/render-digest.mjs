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
//   dist/digest/spotlight/<id>.jpg  one spotlight ad per verified partner with ad
//                            copy, 970 x 500, ready to book into a newsletter ad zone
//   dist/digest/spotlight-sample.jpg  the showcase bar's ad (a preview), for the one-pager and rate card
//   dist/digest/spotlight.json      per-ad image, alt text and tracked link
// Fails loud (non-zero exit, deploy stops) on any page error, missing web font
// or broken image, and on a spotlight whose text doesn't fit or whose photo
// would be stretched: a wrong image in thousands of inboxes is worse than a
// re-run deploy.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { validate } from '../src/data/validate.js';
import { WEEK_ORDER, dayAtAGlance, digestFor, fmtWindows, spotlightFor, trackedUrl, weekdayLabel } from '../src/schedule.js';

const WIDTH = 536; // CSS px — the newsletter's image column, rendered at 2x
const OUT = new URL('../dist/digest/', import.meta.url);
const FONTS = ['Fraunces', 'Public Sans', 'JetBrains Mono'];
// The spotlight is built at the ad unit's real size, so it renders at 1x
const AD = { width: 970, height: 500 };
const AD_FONTS = ['Anton', 'Yellowtail', 'Barlow Condensed'];
const AD_GAP = 12; // px of clear space between any two parts of the ad
// A photo ad is a JPEG: ~120 KB against 450 as a PNG. At 90 its colored type
// stays clean (80 starts to mottle it); the day cards stay PNG (flat color, small).
const AD_QUALITY = 90;

const data = validate(JSON.parse(await readFile(new URL('../src/data/bars.json', import.meta.url), 'utf8')));

// Alt text carries the card for readers whose mail client blocks images: the
// count, the seal's promise, the day's shape in a line, then every bar and its times
function altText(day, d) {
  const rows = [...d.featured, ...d.listed].map(({ bar, specials }) => `${bar.name}, ${fmtWindows(specials, ' and ')}`);
  const glance = dayAtAGlance(data.bars.filter((b) => b.verifiedOn !== null), day, () => true);
  return `${weekdayLabel(day)} on the Happy Hour Finder: ${d.count} happy hour${d.count === 1 ? '' : 's'} today, every one verified by phone. ${glance.text.replaceAll('\u00a0', ' ')} ${rows.join('; ')}${d.more ? `; and ${d.more} more` : ''}.`;
}

function spotlightAlt(bar) {
  const ad = spotlightFor(bar);
  return `Advertisement: ${bar.name}. ${ad.headline}, ${ad.line}. ${ad.board.join(', ')}. ${ad.cta}.`;
}

// Runs in the page. Every part of the ad (data-box) must sit inside it and at
// least `gap` px clear of every other part, the tilted script line included —
// so long copy fails here instead of running into the headline or off the edge.
// Board lines must fit their board, and the photo must cover its box without
// being stretched.
function adProblems(gap) {
  const ad = document.querySelector('.ad');
  // Each part's outline in the ad's coordinates, turned by its CSS transform
  const outline = (el) => {
    const cs = getComputedStyle(el);
    const m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform);
    const [ox, oy] = cs.transformOrigin.split(' ').map(parseFloat);
    const [x, y, w, h] = [el.offsetLeft, el.offsetTop, el.offsetWidth, el.offsetHeight];
    return [[0, 0], [w, 0], [w, h], [0, h]].map(([px, py]) => {
      const q = m.transformPoint({ x: px - ox, y: py - oy });
      return [x + ox + q.x, y + oy + q.y];
    });
  };
  // Separating-axis test: two outlines are `gap` apart if some edge's normal splits them
  const apart = (a, b) =>
    [a, b].some((poly) =>
      [0, 1].some((i) => {
        const [[x1, y1], [x2, y2]] = [poly[i], poly[i + 1]];
        const len = Math.hypot(x2 - x1, y2 - y1);
        const proj = (pts) => pts.map(([x, y]) => (x * (y2 - y1) - y * (x2 - x1)) / len);
        const [pa, pb] = [proj(a), proj(b)];
        return Math.min(...pa) - Math.max(...pb) >= gap || Math.min(...pb) - Math.max(...pa) >= gap;
      })
    );
  const parts = [...ad.querySelectorAll('[data-box]')].map((el) => ({ name: el.dataset.box, poly: outline(el) }));
  const out = [];
  for (const { name, poly } of parts) {
    if (poly.some(([x, y]) => x < 0 || y < 0 || x > ad.clientWidth || y > ad.clientHeight)) out.push(`the ${name} runs off the ad`);
  }
  parts.forEach((a, i) => parts.slice(i + 1).forEach((b) => apart(a.poly, b.poly) || out.push(`the ${a.name} and the ${b.name} are under ${gap}px apart`)));
  for (const p of ad.querySelectorAll('.ad-slate p')) {
    if (p.scrollWidth > p.clientWidth) out.push(`the board line "${p.textContent}" doesn't fit`);
  }
  const photo = ad.querySelector('.ad-photo');
  if (photo.naturalWidth < photo.clientWidth || photo.naturalHeight < photo.clientHeight) {
    out.push(`the photo is ${photo.naturalWidth}x${photo.naturalHeight}, smaller than its ${photo.clientWidth}x${photo.clientHeight} box — it would be stretched`);
  }
  return out;
}

await mkdir(new URL('spotlight/', OUT), { recursive: true });
const server = await preview({ preview: { port: 4173, strictPort: true }, logLevel: 'warn' });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch();
try {
  const errors = [];
  const open = async (options) => {
    const p = await browser.newPage({ ...options, locale: 'en-US' });
    p.on('pageerror', (e) => errors.push(e));
    return p;
  };
  const cardPage = await open({ viewport: { width: WIDTH, height: 900 }, deviceScaleFactor: 2 });
  const adPage = await open({ viewport: { width: AD.width, height: 700 }, deviceScaleFactor: 1 });

  // path: 'digest.html?day=thu' etc. The image is the page's one root element.
  async function shoot(page, path, file, fonts, options = {}) {
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    if (errors.length) throw new Error(`${path}: ${errors[0].message}`);
    // document.fonts.check() passes when a face is missing entirely, so look for loaded faces
    const missing = await page.evaluate(
      (families) => families.filter((f) => ![...document.fonts].some((ff) => ff.family.replace(/"/g, '') === f && ff.status === 'loaded')),
      fonts
    );
    if (missing.length) throw new Error(`${path}: web font(s) not loaded: ${missing.join(', ')}`);
    const broken = await page.evaluate(() => [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src));
    if (broken.length) throw new Error(`${path}: image(s) failed to load: ${broken.join(', ')}`);
    await page.locator('#root > *').screenshot({ path: fileURLToPath(new URL(file, OUT)), ...options });
    console.log(`Wrote dist/digest/${file}`);
  }

  async function shootAd(path, file) {
    await adPage.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await adPage.evaluate(() => document.fonts.ready);
    const problems = await adPage.evaluate(adProblems, AD_GAP);
    if (problems.length) throw new Error(`${path}: ${problems.join('; ')} — shorten the ad copy (or change the photo) in bars.json`);
    await shoot(adPage, path, file, AD_FONTS, { quality: AD_QUALITY });
  }

  const days = {};
  for (const day of WEEK_ORDER) {
    const d = digestFor(data.bars, day);
    if (d.count === 0) {
      days[day] = { count: 0, image: null, alt: null };
      console.log(`Skipped ${day} — no verified partners that day`);
      continue;
    }
    await shoot(cardPage, `digest.html?day=${day}`, `${day}.png`, FONTS);
    days[day] = { count: d.count, image: `digest/${day}.png`, alt: altText(day, d) };
  }
  await shoot(cardPage, 'digest.html?day=thu&demo', 'demo.png', FONTS);

  const manifest = { updated: data.updated, sponsor: data.sponsor, days };
  await writeFile(new URL('digest.json', OUT), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log('Wrote dist/digest/digest.json');

  // Every verified partner with ad copy gets a ready ad, so a sale is a bars.json
  // change, not a code change. link: the bar's own site, UTM-tagged as newsletter
  // traffic; null when it has none (link the ad to its finder listing, ?bar=<id>).
  const spotlights = [];
  for (const bar of data.bars.filter((b) => b.verifiedOn !== null)) {
    if (bar.ad === null) {
      console.log(`Skipped spotlight for ${bar.id} — no ad copy`);
      continue;
    }
    await shootAd(`spotlight.html?bar=${bar.id}`, `spotlight/${bar.id}.jpg`);
    spotlights.push({
      id: bar.id,
      name: bar.name,
      image: `digest/spotlight/${bar.id}.jpg`,
      alt: spotlightAlt(bar),
      link: bar.website ? trackedUrl(bar.website, 'newsletter') : null,
    });
  }
  // The collateral sample (one-pager, rate card) is The Palms Supper Club, whose
  // owner agreed to be the showcase (2026-10-09): a preview of its real, sourced
  // listing. If it ever leaves bars.json this fails loudly — pick a new showcase.
  await shootAd('spotlight.html?preview=palms-supper-club&sample', 'spotlight-sample.jpg');
  await writeFile(new URL('spotlight.json', OUT), `${JSON.stringify({ updated: data.updated, spotlights }, null, 2)}\n`);
  console.log(`Wrote dist/digest/spotlight.json (${spotlights.length} ad${spotlights.length === 1 ? '' : 's'})`);
} finally {
  await browser.close();
  await server.close();
}
