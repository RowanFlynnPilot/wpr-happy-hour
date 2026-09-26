// Renders the newsletter card (digest.html) to images for WPR's daily emails.
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
// Fails loud (non-zero exit, deploy stops) on any page error, missing web font
// or broken image: a wrong image in thousands of inboxes is worse than a
// re-run deploy.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { validate } from '../src/data/validate.js';
import { WEEK_ORDER, digestFor, fmtWindows, weekdayLabel } from '../src/schedule.js';

const WIDTH = 536; // CSS px — the newsletter's image column, rendered at 2x
const OUT = new URL('../dist/digest/', import.meta.url);
const FONTS = ['Fraunces', 'Public Sans', 'JetBrains Mono'];

const data = validate(JSON.parse(await readFile(new URL('../src/data/bars.json', import.meta.url), 'utf8')));

// Alt text carries the card for readers whose mail client blocks images
function altText(day, d) {
  const rows = [...d.featured, ...d.listed].map(({ bar, specials }) => `${bar.name}, ${fmtWindows(specials, ' and ')}`);
  return `${weekdayLabel(day)}’s happy hours on the Happy Hour Finder: ${rows.join('; ')}${d.more ? `; and ${d.more} more` : ''}.`;
}

await mkdir(OUT, { recursive: true });
const server = await preview({ preview: { port: 4173, strictPort: true }, logLevel: 'warn' });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: 900 }, deviceScaleFactor: 2, locale: 'en-US' });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e));

  async function shoot(query, file) {
    await page.goto(`${base}digest.html?${query}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    if (errors.length) throw new Error(`digest.html?${query}: ${errors[0].message}`);
    // document.fonts.check() passes when a face is missing entirely, so look for loaded faces
    const missing = await page.evaluate(
      (families) => families.filter((f) => ![...document.fonts].some((ff) => ff.family.replace(/"/g, '') === f && ff.status === 'loaded')),
      FONTS
    );
    if (missing.length) throw new Error(`digest.html?${query}: web font(s) not loaded: ${missing.join(', ')}`);
    const broken = await page.evaluate(() => [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src));
    if (broken.length) throw new Error(`digest.html?${query}: image(s) failed to load: ${broken.join(', ')}`);
    await page.locator('.digest').screenshot({ path: fileURLToPath(new URL(file, OUT)) });
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
    await shoot(`day=${day}`, `${day}.png`);
    days[day] = { count: d.count, image: `digest/${day}.png`, alt: altText(day, d) };
  }
  await shoot('day=thu&demo', 'demo.png');

  const manifest = { updated: data.updated, sponsor: data.sponsor, days };
  await writeFile(new URL('digest.json', OUT), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log('Wrote dist/digest/digest.json');
} finally {
  await browser.close();
  await server.close();
}
