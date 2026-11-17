// Monthly partner report — one page per bar for Chris's renewal calls: what the
// listing is, what readers did on it, the audience around it, and a space for his
// recommendation. Built from a Plausible dashboard export, so every number is one
// Plausible measured (WPR's sponsor-report rule: pulled, never recalled).
//
//   1. In Plausible, set the dashboard to the month and choose Export (a zip).
//      Don't filter by a goal or a page. Unzip it.
//   2. npm run report -- "<the unzipped folder>"                every verified bar
//      npm run report -- "<the unzipped folder>" --bar <id>     one bar, verified or not
//
// Output: reports/<bar-id>/<start>_<end>/index.html + data.json. reports/ is
// git-ignored — a bar's numbers are its own, never published with the site.
//
// What it reads: visitors.csv (the period, and the finder's pageviews and visits)
// and custom_props.csv (rows of the "url" property — see LISTING_EVENTS in
// src/schedule.js for how the finder labels each action). It needs the six
// "Listing …" goals to exist in Plausible's site settings (LAUNCH.md).
// It does not cover the newsletter card or spotlight ad: those numbers live in
// Broadstreet and the newsletter platform, not here.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validate } from '../src/data/validate.js';
import { listingUrl, parseActionUrl } from '../src/schedule.js';

// Plausible caps each exported breakdown at 300 rows. A full file may be cut off,
// and a bar missing from it would read as zero — so a full file stops the run.
const EXPORT_ROW_CAP = 300;

// The report's lines, in order. events = how many times; visitors = how many
// different readers (Plausible's own two columns, never converted into each other).
export const ACTIONS = [
  ['website', 'Taps through to your website'],
  ['directions', 'Taps on Directions'],
  ['save', 'Saves to “My bars”'],
  ['calendar', 'Adds to a calendar'],
  ['share', 'Shares'],
  ['opened', 'Arrivals by your own link'],
  ['opened-tent', 'Scans of your table tent'],
];

// A small CSV reader: quoted fields, doubled quotes, CRLF. Rows as objects by header.
export function readCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const t = text.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quoted) {
      if (c === '"' && t[i + 1] === '"') { field += '"'; i++; } else if (c === '"') quoted = false; else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim()));
  if (!header) throw new Error('empty CSV');
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

const need = (rows, file, cols) => {
  for (const c of cols) if (!(c in (rows[0] ?? {}))) throw new Error(`${file}: no "${c}" column — is this a Plausible export with no goal or page filter?`);
};
const int = (v, what) => {
  if (!/^\d+$/.test(v)) throw new Error(`${what}: "${v}" is not a whole number`);
  return Number(v);
};

// visitors.csv → the period it covers and the finder's totals. Pageviews and
// visits add up across days; daily unique visitors don't, so they aren't totaled.
export function sitePeriod(rows) {
  need(rows, 'visitors.csv', ['date', 'pageviews', 'visits']);
  if (rows.length === 0) throw new Error('visitors.csv has no rows');
  const dates = rows.map((r) => r.date).sort();
  return {
    start: dates[0],
    end: dates[dates.length - 1],
    pageviews: rows.reduce((n, r) => n + int(r.pageviews, 'visitors.csv pageviews'), 0),
    visits: rows.reduce((n, r) => n + int(r.visits, 'visitors.csv visits'), 0),
  };
}

// custom_props.csv → { barId: { action: { events, visitors } } } from its "url" rows
export function listingActions(rows) {
  need(rows, 'custom_props.csv', ['property', 'value', 'visitors', 'events']);
  const urls = rows.filter((r) => r.property === 'url');
  if (urls.length >= EXPORT_ROW_CAP) {
    throw new Error(`custom_props.csv has ${urls.length} "url" rows — Plausible's export limit, so some may be cut off. Export each "Listing …" goal on its own (filter the dashboard by the goal) and run the report on a folder holding those custom_props files merged.`);
  }
  const out = {};
  for (const r of urls) {
    const hit = parseActionUrl(r.value);
    if (!hit) continue; // an outbound link's url, not a listing action
    ((out[hit.barId] ??= {})[hit.action] ??= { events: 0, visitors: 0 });
    out[hit.barId][hit.action].events += int(r.events, 'custom_props.csv events');
    out[hit.barId][hit.action].visitors += int(r.visitors, 'custom_props.csv visitors');
  }
  return out;
}

// One bar's report data: every line present, zero where the export has no row
export function reportFor(bar, site, actions, builtOn) {
  const mine = actions[bar.id] ?? {};
  const lines = ACTIONS.filter(([key]) => key !== 'directions' || bar.tier === 'featured') // Directions is the featured perk
    .filter(([key]) => key !== 'website' || bar.website !== '')
    .map(([key, label]) => ({ key, label, ...(mine[key] ?? { events: 0, visitors: 0 }) }));
  return {
    bar: { id: bar.id, name: bar.name, tier: bar.tier, verifiedOn: bar.verifiedOn, listing: listingUrl(bar) },
    period: { start: site.start, end: site.end },
    site: { pageviews: site.pageviews, visits: site.visits },
    lines,
    anyActivity: lines.some((l) => l.events > 0),
    source: 'Plausible dashboard export (visitors.csv, custom_props.csv)',
    builtOn,
  };
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtDate = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const n = (v) => v.toLocaleString('en-US');
const SITE = 'https://rowanflynnpilot.github.io/wpr-happy-hour/';

// The page: WPR's flag, what ran, what it delivered, each line, the audience
// around it, Chris's recommendation (typed into the page before printing), contact
export function renderReport(r) {
  const head = r.lines.filter((l) => l.events > 0).sort((a, b) => b.events - a.events).slice(0, 3);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${esc(r.bar.name)} — Happy Hour Finder report, ${fmtDate(r.period.start)} to ${fmtDate(r.period.end)}</title>
<style>
@font-face { font-family: 'Fraunces'; font-weight: 400 700; src: url('${SITE}fonts/fraunces-latin.woff2') format('woff2'); }
@font-face { font-family: 'Public Sans'; font-weight: 400 700; src: url('${SITE}fonts/public-sans-latin.woff2') format('woff2'); }
@font-face { font-family: 'JetBrains Mono'; font-weight: 400 700; src: url('${SITE}fonts/jetbrains-mono-latin.woff2') format('woff2'); }
:root { --ink: #22302c; --soft: #5a6b66; --paper: #fffdf8; --cream: #f6f2e9; --line: #e3ddd0; --teal: #2c6a62; --night: #173a35; --gold: #e9bd5b; --amber: #8a6119; --amber-tint: #f6edda; }
* { box-sizing: border-box; margin: 0; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { background: var(--cream); color: var(--ink); font: 13.5px/1.45 'Public Sans', system-ui, sans-serif; }
.sheet { max-width: 8.5in; margin: 24px auto; background: var(--paper); padding: 0.4in 0.6in 0.3in; box-shadow: 0 12px 32px -16px rgba(34,48,44,.3); }
.flag { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
.flag-brand { display: flex; align-items: center; gap: 12px; }
.flag-brand img:first-child { width: 44px; height: 44px; }
.flag-brand img:last-child { height: 17px; }
.flag-note { text-align: right; font-size: 12px; color: var(--soft); }
.flag-note strong { display: block; color: var(--ink); }
.rule { height: 8px; border-top: 4px solid var(--ink); border-bottom: 1px solid var(--ink); margin: 10px 0 14px; }
h1 { font: 600 30px/1.1 'Fraunces', serif; letter-spacing: -0.01em; }
.what { margin-top: 6px; color: var(--soft); }
.what a { color: var(--teal); }
h2 { font: 600 18px/1.2 'Fraunces', serif; margin: 16px 0 6px; }
.heads { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.headline { background: var(--night); color: #f6f2e9; border-radius: 10px; padding: 10px 16px 12px; }
.headline b { display: block; font: 600 38px/1 'Fraunces', serif; color: var(--gold); font-variation-settings: 'opsz' 144; }
.headline span { display: block; margin-top: 6px; font-size: 13px; color: #b7cbc6; }
.quiet { background: var(--cream); border-radius: 10px; padding: 14px 16px; }
table { width: 100%; border-collapse: collapse; border-top: 2px solid var(--ink); }
th, td { text-align: left; padding: 5px 0; border-bottom: 1px solid var(--line); }
th { font-size: 12px; color: var(--soft); font-weight: 600; }
td.num, th.num { text-align: right; font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; width: 110px; }
.note { margin-top: 6px; font-size: 12px; color: var(--soft); }
.next { border: 1px dashed var(--amber); background: var(--amber-tint); border-radius: 10px; padding: 10px 16px; min-height: 64px; }
.next:empty::before { content: 'Chris: click here and type your recommendation and its price before you print.'; color: var(--amber); font-weight: 600; }
.next:focus { outline: 2px solid var(--teal); outline-offset: 2px; }
.contact { margin-top: 14px; padding: 10px 16px; background: var(--teal); color: #fffdf8; border-radius: 10px; }
.contact a { color: inherit; font-weight: 600; }
footer { margin-top: 10px; font-size: 11px; color: var(--soft); }
@page { size: letter; margin: 0; }
@media print { body { background: #fff; } .sheet { margin: 0; box-shadow: none; } .next-wrap:has(.next:empty) { display: none; } }
@media (max-width: 640px) { .sheet { margin: 0; padding: 20px 16px; } .heads { grid-template-columns: 1fr; } .flag { flex-direction: column; align-items: flex-start; } .flag-note { text-align: left; } }
</style>
</head>
<body>
<main class="sheet">
  <header class="flag">
    <div class="flag-brand"><img src="${SITE}wpr-typewriter-badge.png" alt="" /><img src="${SITE}wpr-wordmark.png" alt="Wausau Pilot &amp; Review" /></div>
    <p class="flag-note"><strong>Happy Hour Finder</strong>Partner report</p>
  </header>
  <div class="rule"></div>

  <h1>${esc(r.bar.name)}</h1>
  <p class="what">${r.bar.tier === 'featured' ? 'Featured listing' : 'Partner listing'} on the Happy Hour Finder · ${fmtDate(r.period.start)} to ${fmtDate(r.period.end)}${r.bar.verifiedOn ? ` · specials verified by phone ${fmtDate(r.bar.verifiedOn)}` : ' · specials not yet verified by phone'}<br /><a href="${esc(r.bar.listing)}">${esc(r.bar.listing.replace('https://', ''))}</a></p>

  <h2>What your listing delivered</h2>
  ${head.length
    ? `<div class="heads">${head.map((l) => `<div class="headline"><b>${n(l.events)}</b><span>${esc(l.label.toLowerCase())}</span></div>`).join('')}</div>`
    : `<p class="quiet">Plausible recorded no taps, saves, shares or arrivals on this listing in the period. The table below shows each count as zero.</p>`}

  <h2>By action</h2>
  <table>
    <thead><tr><th>What readers did on your listing</th><th class="num">Times</th><th class="num">Readers</th></tr></thead>
    <tbody>
${r.lines.map((l) => `      <tr><td>${esc(l.label)}</td><td class="num">${n(l.events)}</td><td class="num">${n(l.visitors)}</td></tr>`).join('\n')}
    </tbody>
  </table>
  <p class="note">“Times” counts every tap or scan; “Readers” counts unique visitors who did it, as Plausible measures them. Readers who block analytics aren’t counted, and views of your listing inside the finder’s list aren’t measured — only what readers did on it.</p>

  <h2>The audience around it: the whole finder, all listings</h2>
  <table>
    <tbody>
      <tr><td>Happy Hour Finder pageviews in the period</td><td class="num">${n(r.site.pageviews)}</td></tr>
      <tr><td>Visits to the finder in the period</td><td class="num">${n(r.site.visits)}</td></tr>
    </tbody>
  </table>

  <section class="next-wrap">
    <h2>What we would do next</h2>
    <div class="next" contenteditable="true"></div>
    <p class="note">Recommendation from your account owner.</p>
  </section>

  <p class="contact">Chris Weber · <a href="mailto:weber.chris@wausaupilotandreview.com">weber.chris@wausaupilotandreview.com</a> · 715-301-5539</p>
  <footer>${fmtDate(r.period.start)} to ${fmtDate(r.period.end)} · report built ${fmtDate(r.builtOn)} · source: ${esc(r.source)}. Newsletter card and spotlight ad results are reported separately. Wausau Pilot &amp; Review, a nonprofit newsroom.</footer>
</main>
</body>
</html>
`;
}

async function main() {
  const args = process.argv.slice(2);
  const folder = args.find((a) => !a.startsWith('--'));
  if (!folder) throw new Error('usage: npm run report -- "<unzipped Plausible export folder>" [--bar <id>]');
  const only = args.includes('--bar') ? args[args.indexOf('--bar') + 1] : null;
  const data = validate(JSON.parse(await readFile(new URL('../src/data/bars.json', import.meta.url), 'utf8')));
  const csv = async (name) => readCsv(await readFile(path.join(folder, name), 'utf8'));
  const site = sitePeriod(await csv('visitors.csv'));
  // No custom_props.csv in the zip means Plausible had no property data at all: stop, don't print zeros
  const actions = listingActions(await csv('custom_props.csv'));

  const bars = only ? data.bars.filter((b) => b.id === only) : data.bars.filter((b) => b.verifiedOn !== null);
  if (only && bars.length === 0) throw new Error(`no bar with id "${only}"`);
  if (bars.length === 0) throw new Error('no verified bars yet — reports are for verified partners. For one bar anyway: --bar <id>');
  const builtOn = new Date().toISOString().slice(0, 10);
  const root = fileURLToPath(new URL('../reports/', import.meta.url));
  for (const bar of bars) {
    const r = reportFor(bar, site, actions, builtOn);
    const dir = path.join(root, bar.id, `${site.start}_${site.end}`);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'data.json'), `${JSON.stringify(r, null, 2)}\n`);
    await writeFile(path.join(dir, 'index.html'), renderReport(r));
    console.log(`${r.anyActivity ? 'Wrote' : 'Wrote (no activity recorded — check with Chris before sending)'} reports/${bar.id}/${site.start}_${site.end}/index.html`);
  }
  const unknown = Object.keys(actions).filter((id) => !data.bars.some((b) => b.id === id));
  if (unknown.length) console.log(`Note: the export has activity for ids not in bars.json (removed bars?): ${unknown.join(', ')}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((e) => {
    console.error(`partner report: ${e.message}`);
    process.exit(1);
  });
}
