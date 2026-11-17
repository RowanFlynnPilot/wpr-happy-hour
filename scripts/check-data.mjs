// CI guard: `vite build` bundles the app but never executes it, so a bad
// bars.json would deploy green and only fail in visitors' browsers. This runs
// the exact validator the app runs at load. Usage: npm run check
import { readFile } from 'node:fs/promises';
import { validate, validateGames } from '../src/data/validate.js';

const raw = await readFile(new URL('../src/data/bars.json', import.meta.url), 'utf8');
const json = validate(JSON.parse(raw));

// CI-only: no date may be in the future ("never invent a date"). Kept out of
// validate() because it reads the clock — a visitor with a wrong clock must
// never be able to break the app. Local date; CI runs in UTC, which is never
// behind Central, so a same-day Wausau date always passes.
const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
const future = [
  ...(json.updated > today ? [`"updated" ${json.updated}`] : []),
  ...json.bars.filter((b) => b.verifiedOn !== null && b.verifiedOn > today).map((b) => `${b.id} verifiedOn ${b.verifiedOn}`),
  ...json.bars.filter((b) => b.checked !== null && b.checked.on > today).map((b) => `${b.id} checked.on ${b.checked.on}`),
];
if (future.length) {
  throw new Error(`bars.json: date(s) in the future (today is ${today}): ${future.join(', ')}`);
}

// The Packers schedule behind the game-day line: valid, and not from the future
const packers = validateGames(JSON.parse(await readFile(new URL('../src/data/packers.json', import.meta.url), 'utf8')));
if (packers.checked > today) throw new Error(`packers.json: "checked" ${packers.checked} is in the future (today is ${today})`);

const specials = json.bars.reduce((n, b) => n + b.specials.length, 0);
const verified = json.bars.filter((b) => b.verifiedOn !== null);
console.log(
  `bars.json OK — ${json.bars.length} bars, ${specials} specials, ${verified.length} verified, updated ${json.updated}`
);

// Advisory only — an unverified or stale listing is a sales follow-up, not a build failure.
if (verified.length < json.bars.length) {
  console.log(`WARN — ${json.bars.length - verified.length} listing(s) awaiting verification (verifiedOn: null)`);
}
const STALE_DAYS = 90;
const stale = verified.filter((b) => (Date.now() - new Date(`${b.verifiedOn}T00:00:00`)) / 86_400_000 > STALE_DAYS);
if (stale.length) {
  console.log(`WARN — verified over ${STALE_DAYS} days ago (renewal call due): ${stale.map((b) => b.id).join(', ')}`);
}
// Readers see these as "may have changed" — recheck the bar's own site, or call
const staleChecks = json.bars.filter(
  (b) => b.verifiedOn === null && b.checked !== null && (Date.now() - new Date(`${b.checked.on}T00:00:00`)) / 86_400_000 > STALE_DAYS
);
if (staleChecks.length) {
  console.log(`WARN — sources checked over ${STALE_DAYS} days ago (recheck): ${staleChecks.map((b) => b.id).join(', ')}`);
}

// Advisory — kickoffs get flexed and late games get dated, so the schedule is
// re-read from packers.com every week or so while games remain
const upcoming = packers.games.filter((g) => g.date >= today);
const scheduleAge = Math.floor((new Date(today) - new Date(packers.checked)) / 86_400_000);
if (upcoming.length > 0 && scheduleAge > 7) {
  console.log(`WARN — packers.json was last read ${scheduleAge} days ago; re-read packers.com/schedule (kickoffs flex; Week 18 may be set) and update "checked"`);
}
if (upcoming.length === 0) console.log('NOTE — no Packers games ahead in packers.json: the game-day tag and line are off until the schedule is updated');
