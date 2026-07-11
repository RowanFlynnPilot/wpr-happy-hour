// CI guard: `vite build` bundles the app but never executes it, so a bad
// bars.json would deploy green and only fail in visitors' browsers. This runs
// the exact validator the app runs at load. Usage: npm run check
import { readFile } from 'node:fs/promises';
import { validate } from '../src/data/validate.js';

const raw = await readFile(new URL('../src/data/bars.json', import.meta.url), 'utf8');
const json = validate(JSON.parse(raw));
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
