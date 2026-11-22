// Browser smoke test — the built finder, opened the way readers, bar owners and
// Chris open it, with the clock held still. Unit tests cover the logic; this
// covers "the page actually renders it": a broken import, a crashed component or a
// dead control stops the deploy instead of shipping. Run after a build:
//   npm run build; npm run smoke
// Every expected number is worked out from bars.json with the app's own functions,
// so a data change never needs a test edit. Any page error or console error fails.
process.env.TZ = 'America/Chicago'; // the same clock the browser below is given

import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { validate, validateGames } from '../src/data/validate.js';
import { byBarName, dayListings, gameLine, isConfirmed, nowListings, specialsToSheet, sourcedOf } from '../src/schedule.js';

const json = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const { bars } = validate(await json('../src/data/bars.json'));
const { games } = validateGames(await json('../src/data/packers.json'));
const all = () => true;

const FRIDAY_5PM = new Date(2026, 10, 20, 17, 0); // an ordinary Friday, mid happy hour
const THANKSGIVING = new Date(2026, 10, 26, 17, 0);

const server = await preview({ preview: { port: 4173, strictPort: true }, logLevel: 'warn' });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch();
const failures = [];
let checks = 0;

// One fresh page per check, at a phone's size, on Wausau time, with the clock held
async function check(name, at, path, body) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: 'America/Chicago',
    locale: 'en-US',
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  try {
    await page.clock.setFixedTime(at);
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await body(page);
    assert.deepEqual(errors, [], 'the page logged errors');
    console.log(`ok    ${name}`);
  } catch (e) {
    failures.push(name);
    console.error(`FAIL  ${name}\n      ${e.message.split('\n').join('\n      ')}`);
  } finally {
    checks++;
    await context.close();
  }
}

const cards = (page) => page.locator('article.card').count();
const words = (page) => page.locator('.hero-words').innerText();
// the count as a screen reader hears it (the drawn numeral rolls)
const heroCount = async (page) => Number((await page.locator('.hero-title .sr-only').innerText()).trim());

try {
  await check('Now view: the count and the lists match the data', FRIDAY_5PM, '', async (page) => {
    const { pouring, laterToday } = nowListings(bars, FRIDAY_5PM, all);
    const sure = pouring.filter(isConfirmed).length || laterToday.filter(isConfirmed).length;
    assert.ok(sure > 0, 'the fixture time has no confirmed happy hour: pick another');
    assert.equal(await heroCount(page), sure);
    assert.equal(await cards(page), pouring.length + laterToday.length);
    assert.equal(await page.locator('.hero-clock').innerText(), 'Friday, 5:00 PM');
  });

  await check('Day view and the city filter', FRIDAY_5PM, '', async (page) => {
    await page.getByRole('button', { name: 'Sat', exact: true }).click();
    assert.equal(await words(page), 'Saturday happy hours');
    assert.equal(await cards(page), dayListings(bars, 'sat', all).length);
    const city = dayListings(bars, 'sat', all)[0].bar.city;
    await page.getByLabel('Filter by city').selectOption(city);
    assert.equal(await cards(page), dayListings(bars.filter((b) => b.city === city), 'sat', all).length);
  });

  await check('All bars A to Z: every bar, in name order', FRIDAY_5PM, '', async (page) => {
    await page.getByRole('button', { name: 'All bars A–Z' }).click();
    assert.equal(await heroCount(page), bars.length);
    assert.equal(await cards(page), bars.length);
    // the open part of the list is the sourced, non-leading bars, A to Z
    const lead = (b) => b.tier === 'featured' && sourcedOf(b.specials).length > 0;
    const expected = bars.filter((b) => sourcedOf(b.specials).length > 0 && !lead(b)).sort(byBarName).map((b) => b.name);
    assert.deepEqual(await page.locator('.az > article .card-name').allInnerTexts(), expected);
  });

  const known = bars.find((b) => sourcedOf(b.specials).length > 0);
  await check('Search: a bar by name, and a query that matches nothing', FRIDAY_5PM, '?view=all', async (page) => {
    await page.getByLabel('Search bars and specials').fill(known.name);
    assert.ok((await page.locator('.card-name').allInnerTexts()).includes(known.name), `${known.name} not found by its own name`);
    assert.ok((await cards(page)) < bars.length, 'the search did not narrow the list');
    await page.getByLabel('Search bars and specials').fill('zzzqqq');
    assert.equal(await cards(page), 0);
    assert.match(await page.locator('.empty').innerText(), /No bar or special matches “zzzqqq”/);
    await page.getByRole('button', { name: 'Clear filters' }).click();
    assert.equal(await cards(page), bars.length);
  });

  await check('Copy a link to this view: the link reopens the same search', FRIDAY_5PM, '', async (page) => {
    assert.equal(await page.locator('.view-link').count(), 0); // nothing set, nothing to link
    await page.getByRole('button', { name: 'Sat', exact: true }).click();
    await page.getByLabel('Search bars and specials').fill(known.name);
    const shown = await page.locator('.card-name').allInnerTexts();
    assert.equal(new URL(page.url()).search, ''); // the address is left alone
    await page.getByRole('button', { name: 'Copy a link to this view' }).click();
    const link = new URL(await page.evaluate(() => navigator.clipboard.readText()));
    assert.equal(link.searchParams.get('q'), known.name);
    await page.goto(`${base}${link.search}`, { waitUntil: 'networkidle' });
    assert.equal(await page.getByLabel('Search bars and specials').inputValue(), known.name);
    assert.equal(await words(page), 'Saturday happy hours');
    assert.deepEqual(await page.locator('.card-name').allInnerTexts(), shown);
  });

  await check('A bar’s own link lands on its card, with its whole week', FRIDAY_5PM, `?bar=${known.id}`, async (page) => {
    const card = page.locator(`#bar-${known.id}`);
    await page.waitForFunction((id) => document.activeElement?.closest('article')?.id === `bar-${id}`, known.id);
    assert.ok(Math.abs((await card.boundingBox()).y - 16) <= 2, 'the card is not at the top of the screen');
    assert.equal(await card.locator('.special-days').count(), await card.locator('.special').count()); // every row names its days
  });

  await check('Thanksgiving: nothing is claimed as pouring', THANKSGIVING, '', async (page) => {
    assert.equal(await words(page), 'Holiday hours vary today');
    assert.equal(await page.locator('.hero-count').count(), 0);
  });

  const game = games[0]; // the next game on the schedule, if the season isn't over
  if (game) {
    const [y, m, d] = game.date.split('-').map(Number);
    await check('Packers game day: the hero says who and when', new Date(y, m - 1, d, 12, 0), '', async (page) => {
      const hero = (await page.locator('.hero').innerText()).replaceAll(' ', ' ');
      assert.ok(hero.includes(gameLine(game).replaceAll(' ', ' ')), `no "${gameLine(game)}" in the hero`);
    });
  }

  // A bar with nothing guessed: its form is ready to send as it opens (a guess that
  // claims nothing leaves a box the owner has to fill in first)
  const settled = bars.find((b) => sourcedOf(b.specials).length === b.specials.length);
  await check('Listing check: the owner’s email is in the call sheet’s format', FRIDAY_5PM, `confirm.html?bar=${settled.id}`, async (page) => {
    assert.equal(await page.locator('h1').innerText(), `Is this right, ${settled.name}?`);
    const body = await page.locator('#check-text').inputValue();
    // the specials go out exactly as the import reads them
    for (const line of specialsToSheet(settled.specials).split('\n')) assert.ok(body.includes(line), `missing line: ${line}`);
    assert.match(await page.locator('.check-go').getAttribute('href'), /^mailto:weber\.chris@wausaupilotandreview\.com\?subject=/);
  });

  // A bar we hold only guesses for is asked, not told: an empty special, no warnings
  const unknown = bars.find((b) => b.verifiedOn === null && sourcedOf(b.specials).length === 0);
  await check('Listing check: a bar we only have guesses for fills in its own', FRIDAY_5PM, `confirm.html?bar=${unknown.id}`, async (page) => {
    assert.equal(await page.locator('h1').innerText(), `Tell us your happy hour, ${unknown.name}`);
    assert.equal(await page.locator('.check-row').count(), 1);
    assert.equal(await page.locator('.check-problem').count(), 0);
    assert.equal(await page.locator('.check-go').count(), 0);
    assert.equal(await page.locator('.check-heard li').count(), unknown.specials.length);
    await page.locator('.check-days label', { hasText: 'Thu' }).click();
    await page.getByLabel('From').fill('15:00');
    await page.getByLabel('Until').fill('18:00');
    await page.getByLabel(/What’s the special/).fill('$1 off taps');
    assert.ok((await page.locator('#check-text').inputValue()).includes('Thu 3pm-6pm drinks: $1 off taps'));
    assert.ok(!(await page.locator('#check-text').inputValue()).includes('still our guess'));
    // taking up one of our guesses adds it as a row, flagged until the owner edits it
    await page.getByRole('button', { name: 'Start from this' }).first().click();
    assert.equal(await page.locator('.check-row').count(), 2);
    assert.equal(await page.locator('.check-guess').count(), 1);
  });

  await check('Listing check: Chris’s list, and a link that names no bar', FRIDAY_5PM, 'confirm.html', async (page) => {
    assert.equal(await page.locator('.check-index li').count(), bars.length);
    assert.equal(await page.getByRole('button', { name: /^Copy text message for / }).count(), bars.length);
    await page.goto(`${base}confirm.html?bar=no-such-bar`);
    assert.equal(await page.locator('h1').innerText(), 'We can’t find that listing');
  });

  await check('Table tent: a QR code for the bar', FRIDAY_5PM, `tent.html?bar=${known.id}`, async (page) => {
    assert.equal(await page.locator('svg.tent-qr').count(), 2); // one per panel
    assert.equal(await page.locator('.tent-bar').first().innerText(), known.name);
  });
} finally {
  await browser.close();
  await server.close();
}

if (failures.length) {
  console.error(`\nsmoke: ${failures.length} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`\nsmoke: ${checks} checks passed`);
