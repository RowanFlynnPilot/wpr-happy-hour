// CI guard: `vite build` bundles the app but never executes it, so a bad
// bars.json would deploy green and only fail in visitors' browsers. This runs
// the exact validator the app runs at load. Usage: npm run check
import { readFile } from 'node:fs/promises';
import { validate } from '../src/data/validate.js';

const raw = await readFile(new URL('../src/data/bars.json', import.meta.url), 'utf8');
const json = validate(JSON.parse(raw));
const specials = json.bars.reduce((n, b) => n + b.specials.length, 0);
console.log(`bars.json OK — ${json.bars.length} bars, ${specials} specials, updated ${json.updated}`);
